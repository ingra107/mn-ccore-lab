// todayPlan — the durable Today operating-day plan primitive (Workstream B,
// schema v75, 2026-06-09). Replaces the per-browser `today_state_*`
// localStorage blob with three SYNCED task columns:
//   planned_for  civil date 'YYYY-MM-DD' — "planned today" = == todayKey()
//   plan_slot    'right_now' | 'strip' | `between-${n}`
//   plan_rank    REAL ordering (fractional so a drag-insert never renumbers)
//
// This module is the ONE place that reads/writes the plan columns, so:
//   - useTodayState (the Today/MyTasks SEAM) backs onto these helpers,
//   - MyTasks' former raw LS pokes (index.tsx onBulkPlanToday,
//     InlineDetail promote/planToday, constants readPlannedToday) re-point here.
//
// `right_now` is a SINGLETON per assignee-day: promoting a task unsets the
// previous right_now task (back to slot 'strip'). Races resolve LWW (Hub
// seq/hash) — acceptable for a per-assignee surface.
//
// Plans are disposable/self-expiring: a stale planned_for from a prior day is
// simply ignored (every reader filters planned_for == today). No history table,
// no cleanup.

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useUpdateTask } from '../hooks/mutations/useTaskMutations'
import { todayKey } from './taskGrouping'
import type { PlannedSlot } from '../components/today/constants'
import type { TaskRow } from './api'

// The localStorage plan blob shape (legacy store — kept only for the one-time
// migration + the still-LS-local `thoughts` field, which this module ignores).
export interface LegacyTodayBlob {
  rightNow?: string | null
  planned?: Record<string, { slot: string }>
  done?: Record<string, boolean>
  thoughts?: string
}

// The derived plan state — the SAME shape useTodayState exposes, so the seam
// contract is identical whether the backing store is LS or task columns.
export interface DerivedPlanState {
  rightNow: string | null
  planned: Record<string, { slot: PlannedSlot }>
}

const RIGHT_NOW = 'right_now'

/** A task is "planned today" iff its planned_for civil date == today's. */
export function isPlannedToday(t: TaskRow, today: string = todayKey()): boolean {
  return !!t.planned_for && t.planned_for.slice(0, 10) === today
}

/** Coerce a stored plan_slot to the LS PlannedSlot contract (strip | between-n).
 *  A right_now task is ALSO a planned task; its non-right_now display slot
 *  defaults to 'strip' (matching the legacy promote() behaviour where a
 *  promoted task carried slot 'strip'). */
function toPlannedSlot(slot: string | null | undefined): PlannedSlot {
  if (slot && /^between-\d+$/.test(slot)) return slot as PlannedSlot
  return 'strip'
}

/** Derive the {rightNow, planned} plan state from today's task rows. Only tasks
 *  with planned_for == today participate (self-expiring). The right_now task is
 *  the (single) task whose plan_slot === 'right_now'. */
export function derivePlanState(tasks: TaskRow[], today: string = todayKey()): DerivedPlanState {
  let rightNow: string | null = null
  const planned: Record<string, { slot: PlannedSlot }> = {}
  for (const t of tasks) {
    if (!isPlannedToday(t, today)) continue
    planned[t.id] = { slot: toPlannedSlot(t.plan_slot) }
    if (t.plan_slot === RIGHT_NOW) rightNow = t.id
  }
  return { rightNow, planned }
}

/** Next plan_rank — append to the end of today's plan (max + 1). Fractional
 *  ranks (drag-insert) are computed by the caller; this is the simple append. */
export function nextPlanRank(tasks: TaskRow[], today: string = todayKey()): number {
  let max = 0
  for (const t of tasks) {
    if (isPlannedToday(t, today) && typeof t.plan_rank === 'number' && t.plan_rank > max) {
      max = t.plan_rank
    }
  }
  return max + 1
}

// ── Mutation primitive ──────────────────────────────────────────────────────
//
// All plan writes go through useUpdateTask (the existing optimistic task-mutation
// machinery: optimistic cache patch + rollback + invalidate). PATCHing the task
// fields means the plan rides the normal Hub-first write path; no new endpoint.

export interface TodayPlanApi {
  /** Plan a task for today in `slot` (default 'strip'), appending to the end. */
  planTask: (id: string, slot?: PlannedSlot, tasks?: TaskRow[]) => void
  /** Remove a task from today's plan (clears all 3 columns). */
  unplanTask: (id: string) => void
  /** Promote a task to Right Now — singleton: unsets the previous right_now. */
  promoteToRightNow: (id: string, tasks: TaskRow[]) => void
  /** Set a task's plan_slot (e.g. drop into a timeline gap 'between-<n>'). */
  setPlanSlot: (id: string, slot: PlannedSlot) => void
}

export function useTodayPlan(): TodayPlanApi {
  const updateTask = useUpdateTask()
  const queryClient = useQueryClient()

  // Fallback task source for callers that don't hold the full list (e.g.
  // InlineDetail receives a single row). Scans every ['tasks', ...] cache entry
  // (the query is filter-keyed) and dedups by id — enough to find the prior
  // right_now task for singleton enforcement + compute a plan_rank.
  const tasksFromCache = useCallback((): TaskRow[] => {
    const byId = new Map<string, TaskRow>()
    const entries = queryClient.getQueriesData<TaskRow[]>({ queryKey: ['tasks'] })
    for (const [, data] of entries) {
      if (!Array.isArray(data)) continue
      for (const t of data) if (!byId.has(t.id)) byId.set(t.id, t)
    }
    return [...byId.values()]
  }, [queryClient])

  const resolveTasks = useCallback((tasks: TaskRow[]): TaskRow[] =>
    tasks.length > 0 ? tasks : tasksFromCache(), [tasksFromCache])

  const planTask = useCallback((id: string, slot: PlannedSlot = 'strip', tasks: TaskRow[] = []) => {
    updateTask.mutate({
      id,
      fields: { planned_for: todayKey(), plan_slot: slot, plan_rank: nextPlanRank(resolveTasks(tasks)) },
    })
  }, [updateTask, resolveTasks])

  const unplanTask = useCallback((id: string) => {
    updateTask.mutate({ id, fields: { planned_for: null, plan_slot: null, plan_rank: null } })
  }, [updateTask])

  const setPlanSlot = useCallback((id: string, slot: PlannedSlot) => {
    // Ensure planned_for is today when (re)slotting; keep existing rank.
    updateTask.mutate({ id, fields: { planned_for: todayKey(), plan_slot: slot } })
  }, [updateTask])

  const promoteToRightNow = useCallback((id: string, tasks: TaskRow[]) => {
    const today = todayKey()
    const all = resolveTasks(tasks)
    // Singleton: demote the current right_now task (back to 'strip') if it's a
    // different task. (LWW on races — see module header.)
    const prev = all.find((t) => isPlannedToday(t, today) && t.plan_slot === RIGHT_NOW && t.id !== id)
    if (prev) {
      updateTask.mutate({ id: prev.id, fields: { plan_slot: 'strip' } })
    }
    // Promote target — also ensures it's planned for today (carry a rank if new).
    const target = all.find((t) => t.id === id)
    const fields: Record<string, unknown> = { planned_for: today, plan_slot: RIGHT_NOW }
    if (!target || target.plan_rank == null) fields.plan_rank = nextPlanRank(all)
    updateTask.mutate({ id, fields })
  }, [updateTask, resolveTasks])

  return { planTask, unplanTask, promoteToRightNow, setPlanSlot }
}

// ── One-time localStorage migration ─────────────────────────────────────────
//
// On first load after deploy: if today's LS blob carries a plan but the synced
// tasks lack planned_for, PATCH the plan up to the columns, then stop reading
// LS for plan state. `thoughts` stays in LS (out of scope).

const MIGRATED_FLAG_PREFIX = 'today_plan_migrated_'

export function readLegacyBlob(today: string = todayKey()): LegacyTodayBlob | null {
  try {
    const raw = window.localStorage.getItem(`today_state_${today}`)
    if (!raw) return null
    return JSON.parse(raw) as LegacyTodayBlob
  } catch {
    return null
  }
}

/** True once today's LS plan has been migrated to the columns (idempotency). */
export function hasMigratedToday(today: string = todayKey()): boolean {
  try {
    return window.localStorage.getItem(MIGRATED_FLAG_PREFIX + today) === '1'
  } catch {
    return false
  }
}

function markMigratedToday(today: string = todayKey()): void {
  try {
    window.localStorage.setItem(MIGRATED_FLAG_PREFIX + today, '1')
  } catch {
    /* ignore */
  }
}

/** Hook: returns a one-time migrator. Call once tasks have loaded. It PATCHes any
 *  LS-planned task that lacks a synced planned_for, sets right_now, then marks
 *  today migrated. Idempotent; no-op if already migrated or no LS plan exists. */
export function useLegacyPlanMigration() {
  const updateTask = useUpdateTask()

  return useCallback((tasks: TaskRow[]) => {
    const today = todayKey()
    if (hasMigratedToday(today)) return
    const blob = readLegacyBlob(today)
    if (!blob || !blob.planned || Object.keys(blob.planned).length === 0) {
      // Nothing to migrate — but still mark so we don't re-check every render.
      markMigratedToday(today)
      return
    }
    const byId = new Map(tasks.map((t) => [t.id, t]))
    let rank = nextPlanRank(tasks, today)
    for (const [id, entry] of Object.entries(blob.planned)) {
      const t = byId.get(id)
      if (!t) continue                       // task no longer exists — skip
      if (isPlannedToday(t, today)) continue  // already synced — skip
      const isRightNow = blob.rightNow === id
      updateTask.mutate({
        id,
        fields: {
          planned_for: today,
          plan_slot: isRightNow ? RIGHT_NOW : toPlannedSlot(entry?.slot),
          plan_rank: rank++,
        },
      })
    }
    markMigratedToday(today)
  }, [updateTask])
}

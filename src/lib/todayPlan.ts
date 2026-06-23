// todayPlan — the durable Today operating-day plan primitive (Workstream B,
// schema v75, 2026-06-09). Replaces the per-browser `today_state_*`
// localStorage blob with three SYNCED task columns:
//   planned_for  civil date 'YYYY-MM-DD' — "planned today" = == todayKey()
//   plan_slot    'strip' | `between-${n}`  ('right_now' retired — see below)
//   plan_rank    REAL ordering (fractional so a drag-insert never renumbers)
//
// This module is the ONE place that reads/writes the plan columns, so:
//   - useTodayState (the Today/MyTasks SEAM) backs onto these helpers,
//   - MyTasks' former raw LS pokes (index.tsx onBulkPlanToday,
//     InlineDetail planToday, constants readPlannedToday) re-point here.
//
// `right_now` is RETIRED from the UI (the Right Now badge / promote action /
// auto-promote were removed). NO frontend path WRITES 'right_now' anymore — the
// legacy-LS migrator below now lifts a pre-existing LS rightNow onto the columns
// as a normal planned ('strip') task. derivePlanState still READS a stored
// 'right_now' plan_slot for back-compat (toPlannedSlot coerces it to 'strip', so
// it renders as a normal planned task). A pending D1 normalize strips any
// residual 'right_now' values already in the column.
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
// (`rightNow` was removed with the retired Right Now concept — it had no readers;
// a stored 'right_now' plan_slot still renders as a normal planned task via
// toPlannedSlot below.)
export interface DerivedPlanState {
  planned: Record<string, { slot: PlannedSlot }>
}

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

/** Derive the {planned} plan state from today's task rows. Only tasks with
 *  planned_for == today participate (self-expiring). A task still carrying a
 *  stored 'right_now' plan_slot (retired from the UI) is mapped harmlessly:
 *  toPlannedSlot coerces it to 'strip', so it renders as a normal planned task. */
export function derivePlanState(tasks: TaskRow[], today: string = todayKey()): DerivedPlanState {
  const planned: Record<string, { slot: PlannedSlot }> = {}
  for (const t of tasks) {
    if (!isPlannedToday(t, today)) continue
    planned[t.id] = { slot: toPlannedSlot(t.plan_slot) }
  }
  return { planned }
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
  /** Set a task's plan_slot (e.g. drop into a timeline gap 'between-<n>').
   *  Phase 3: optionally also writes plan_start_min + estimated_minutes so a
   *  freshly-dropped task becomes an absolute-positioned timed block. */
  setPlanSlot: (
    id: string,
    slot: PlannedSlot,
    plan_start_min?: number | null,
    estimated_minutes?: number | null,
  ) => void
}

export function useTodayPlan(): TodayPlanApi {
  const updateTask = useUpdateTask()
  const queryClient = useQueryClient()

  // Fallback task source for callers that don't hold the full list (e.g.
  // InlineDetail receives a single row). Scans every ['tasks', ...] cache entry
  // (the query is filter-keyed) and dedups by id — enough to compute a plan_rank.
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

  const setPlanSlot = useCallback((
    id: string,
    slot: PlannedSlot,
    plan_start_min?: number | null,
    estimated_minutes?: number | null,
  ) => {
    // Ensure planned_for is today when (re)slotting; keep existing rank.
    // Phase 3: when plan_start_min is supplied (timed drop into a gap), also
    // write estimated_minutes so the block has a duration. estimated_minutes is
    // only written if it was NULL on the task (first placement) — the caller
    // passes `task.estimated_minutes ?? 30` so we always have a value.
    const fields: Record<string, unknown> = { planned_for: todayKey(), plan_slot: slot }
    if (plan_start_min != null) fields.plan_start_min = plan_start_min
    if (estimated_minutes != null) fields.estimated_minutes = estimated_minutes
    updateTask.mutate({ id, fields })
  }, [updateTask])

  return { planTask, unplanTask, setPlanSlot }
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
 *  LS-planned task that lacks a synced planned_for as a normal planned ('strip')
 *  task, then marks today migrated. A legacy LS rightNow task migrates to planned
 *  (right_now is retired — no longer written). Idempotent; no-op if already
 *  migrated or no LS plan exists. */
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
      // right_now is RETIRED: a legacy LS rightNow task migrates to a normal
      // planned task ('strip' via toPlannedSlot), NOT the retired slot value.
      // This is the last frontend path that could write 'right_now' to D1; it
      // no longer does. (blob.rightNow stays in the LS shape but is ignored.)
      updateTask.mutate({
        id,
        fields: {
          planned_for: today,
          plan_slot: toPlannedSlot(entry?.slot),
          plan_rank: rank++,
        },
      })
    }
    markMigratedToday(today)
  }, [updateTask])
}

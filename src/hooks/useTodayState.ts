// useTodayState — the Today/MyTasks plan SEAM. Same TodayStateApi contract as
// before; the BACKING STORE flipped from the per-browser `today_state_*`
// localStorage blob to three SYNCED task columns (planned_for / plan_slot /
// plan_rank) via src/lib/todayPlan.ts (Workstream B, schema v75, 2026-06-09).
//
// What changed vs the LS era:
//   - `rightNow` + `planned` now DERIVE from today's task rows (planned_for ==
//     today). plan/promote/unplan PATCH the task (optimistic, Hub-first) instead
//     of writing LS. The plan is durable + cross-device — every team member's
//     Today cockpit reads the same synced plan.
//   - `done` stays PURELY optimistic-local (completions are already durable via
//     `status`; this map is the instant-feedback + undo layer, reconciled against
//     the cache). It no longer persists to LS — a reload re-derives done-ness from
//     the cache (completed_at/status), so nothing is lost.
//   - `thoughts` (morning scratchpad) is OUT OF SCOPE and stays in LS (handled by
//     MorningThoughtCompose, not this hook).
//
// The hook now takes the task ROWS (it needs plan_slot/plan_rank to derive),
// not just ids. Callers already hold the rows.

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { PlannedSlot } from '../components/today/constants'
import { useUpdateTaskStatus } from './mutations/useTaskMutations'
import { useUndoToast } from '../components/UndoToast'
import { useTodayPlan, useLegacyPlanMigration, derivePlanState } from '../lib/todayPlan'
import { todayKey } from '../lib/taskGrouping'
import type { TaskRow } from '../lib/api'

export interface TodayStateShape {
  planned: Record<string, { slot: PlannedSlot }>
  done: Record<string, boolean>
}

export interface TodayStateApi extends TodayStateShape {
  plannedIds: () => string[]
  markDone: (id: string) => void
  uncheck: (id: string) => void
  /** Drop/re-slot a task. Phase 3: pass plan_start_min + estimated_minutes to
   *  snap a timed block to the top of the gap it was dropped into. */
  planAt: (
    id: string,
    slot: PlannedSlot,
    plan_start_min?: number | null,
    estimated_minutes?: number | null,
  ) => void
  unplan: (id: string) => void
}

export function useTodayState(tasks: TaskRow[], completedTodayIds: string[] = []): TodayStateApi {
  const updateStatus = useUpdateTaskStatus()
  const undoToast = useUndoToast()
  const plan = useTodayPlan()
  const migrate = useLegacyPlanMigration()

  // `done` is the only LOCAL state now — optimistic completion feedback + undo.
  // (rightNow/planned derive from the synced task columns below.)
  const [done, setDone] = useState<Record<string, boolean>>({})

  // One-time LS→columns migration: once tasks have loaded, lift any legacy
  // today_state_* plan onto the synced columns, then stop reading LS for plan.
  // Idempotent (flagged per-day) — safe to call on every tasks change.
  useEffect(() => {
    if (tasks.length === 0) return
    migrate(tasks)
  }, [tasks, migrate])

  // Derive planned from today's synced task rows. Self-expiring:
  // only planned_for == today participates.
  const { planned } = useMemo(() => derivePlanState(tasks), [tasks])

  // Reconcile optimistic done-flags against the cache (the source of truth).
  // markDone sets done[id] for instant feedback; once the cache CONFIRMS the
  // task is completed today, the "Completed today" surface renders straight from
  // the cache, so we prune the optimistic flag (prevents double-count + a stale
  // "done" after a cross-surface reopen). Issue #46.
  useEffect(() => {
    if (completedTodayIds.length === 0) return
    const confirmed = new Set(completedTodayIds)
    setDone((prev) => {
      let changed = false
      const next = { ...prev }
      for (const id of Object.keys(next)) if (confirmed.has(id)) { delete next[id]; changed = true }
      return changed ? next : prev
    })
  }, [completedTodayIds])

  const plannedIds = useCallback(() => Object.keys(planned).filter((id) => !done[id]), [planned, done])

  const markDone = useCallback((id: string) => {
    // Capture prior plan state so Undo can restore it (design principle #8 —
    // optimistic UI + a 5s undo on every state change).
    const wasPlanned = !!planned[id]
    const prevSlot = planned[id]?.slot

    setDone((p) => ({ ...p, [id]: true }))
    // Unplan on completion (mark-done unplans + sinks — Rule 61). The status
    // write below makes the completion durable.
    if (wasPlanned) plan.unplanTask(id)

    // Persist completion to D1 so /tasks reflects it. On write failure, roll back
    // the optimistic done flag (the cache rollback in useUpdateTaskStatus.onError
    // reverts completed=0, but can't see this local flag). Issue #46.
    updateStatus.mutate({ id, status: 'done' }, {
      onError: () => setDone((p) => { const n = { ...p }; delete n[id]; return n }),
    })
    undoToast.showUndo('Task completed', () => {
      // Undo: re-open the task and restore its prior planned slot.
      setDone((p) => { const n = { ...p }; delete n[id]; return n })
      if (wasPlanned) plan.planTask(id, prevSlot ?? 'strip', tasks)
      updateStatus.mutate({ id, status: 'todo' })
    })
  }, [updateStatus, undoToast, plan, planned, tasks])

  const uncheck = useCallback((id: string) => {
    setDone((p) => { const n = { ...p }; delete n[id]; return n })
    updateStatus.mutate({ id, status: 'todo' })
  }, [updateStatus])

  const planAt = useCallback((
    id: string,
    slot: PlannedSlot,
    plan_start_min?: number | null,
    estimated_minutes?: number | null,
  ) => {
    plan.setPlanSlot(id, slot, plan_start_min, estimated_minutes)
  }, [plan])

  const unplan = useCallback((id: string) => {
    plan.unplanTask(id)
  }, [plan])

  return { planned, done, plannedIds, markDone, uncheck, planAt, unplan }
}

// Re-export todayKey for callers that imported it transitively from here (none
// today, but keeps the seam self-contained if a consumer needs the day key).
export { todayKey }

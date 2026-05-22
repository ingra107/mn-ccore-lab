// useTodayState — localStorage-backed daily plan (rightNow / planned / done).
// Extracted from src/pages/portal/TodayPage.tsx during the component-split
// refactor. Per HANDOFF §2: "already separable — promote/plan/done state."
//
// Shape persists to `today_state_${YYYY-MM-DD}` so UnifiedMyTasks can read +
// mutate the same snapshot (see helpers in MyTasks/components/InlineDetail).

import { useState, useEffect, useCallback } from 'react'
import { todayKey, type PlannedSlot } from '../components/today/constants'
import { useUpdateTaskStatus } from './mutations/useTaskMutations'

export interface TodayStateShape {
  rightNow: string | null
  planned: Record<string, { slot: PlannedSlot }>
  done: Record<string, boolean>
}

export interface TodayStateApi extends TodayStateShape {
  plannedIds: () => string[]
  promote: (id: string) => void
  markDone: (id: string) => void
  uncheck: (id: string) => void
  planAt: (id: string, slot: PlannedSlot) => void
  unplan: (id: string) => void
}

export function useTodayState(allTaskIds: string[], completedTodayIds: string[] = []): TodayStateApi {
  const storageKey = `today_state_${todayKey()}`
  const updateStatus = useUpdateTaskStatus()
  const [state, setState] = useState<TodayStateShape>(() => {
    if (typeof window === 'undefined') return { rightNow: null, planned: {}, done: {} }
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) return JSON.parse(raw) as TodayStateShape
    } catch { /* ignore */ }
    return { rightNow: null, planned: {}, done: {} }
  })

  // Persist on change.
  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(state)) } catch { /* ignore */ }
  }, [state, storageKey])

  // Trim planned entries pointing at tasks no longer in the data set.
  // Skip when allTaskIds is empty — that's the loading state (tasks query
  // hasn't resolved yet) and trimming would wipe restored localStorage
  // before the user's planned snapshot can render. Issue #47.
  // Done entries are NOT trimmed — `state.done` survives the API
  // completion that removes the task from the open list, so the
  // "Completed today" group keeps it. The storage key is per-day so done
  // entries roll over naturally at midnight. Issue #46.
  useEffect(() => {
    if (allTaskIds.length === 0) return
    const ids = new Set(allTaskIds)
    setState((prev) => {
      let changed = false
      const next: TodayStateShape = { ...prev, planned: { ...prev.planned } }
      for (const id of Object.keys(next.planned)) if (!ids.has(id)) { delete next.planned[id]; changed = true }
      if (next.rightNow && !ids.has(next.rightNow)) { next.rightNow = null; changed = true }
      return changed ? next : prev
    })
  }, [allTaskIds])

  // Reconcile optimistic done-flags against the cache (the source of truth).
  // markDone sets done[id] for instant feedback; once the cache CONFIRMS the
  // task is completed today, the "Completed today" surface renders it straight
  // from the cache, so we prune the optimistic flag. This prevents (a) double
  // count / double-display (cache + localStorage both listing the same task)
  // and (b) a stale "done" after a cross-surface reopen — the flag is already
  // gone by then, so the reopened (completed=0) task correctly shows open again.
  useEffect(() => {
    if (completedTodayIds.length === 0) return
    const confirmed = new Set(completedTodayIds)
    setState((prev) => {
      let changed = false
      const nextDone = { ...prev.done }
      for (const id of Object.keys(nextDone)) if (confirmed.has(id)) { delete nextDone[id]; changed = true }
      return changed ? { ...prev, done: nextDone } : prev
    })
  }, [completedTodayIds])

  const plannedIds = useCallback(() => Object.keys(state.planned).filter((id) => !state.done[id]), [state])

  const promote = useCallback((id: string) => {
    setState((p) => ({
      ...p,
      planned: p.planned[id] ? p.planned : { ...p.planned, [id]: { slot: 'strip' } },
      rightNow: id,
    }))
  }, [])

  const markDone = useCallback((id: string) => {
    setState((p) => {
      const nextDone = { ...p.done, [id]: true }
      const nextPlanned = { ...p.planned }
      delete nextPlanned[id]
      let nextRight = p.rightNow
      if (id === p.rightNow) {
        const remaining = Object.keys(nextPlanned).filter((k) => !nextDone[k])
        nextRight = remaining[0] || null
      }
      return { rightNow: nextRight, planned: nextPlanned, done: nextDone }
    })
    // Persist to D1 so /tasks reflects the change. Issue #46. On write failure,
    // roll back the optimistic done flag — otherwise the task shows "done" until
    // midnight despite never having completed server-side (the cache rollback in
    // useUpdateTaskStatus.onError reverts completed=0, but can't see this flag).
    updateStatus.mutate({ id, status: 'done' }, {
      onError: () => setState((p) => {
        const nextDone = { ...p.done }
        delete nextDone[id]
        return { ...p, done: nextDone }
      }),
    })
  }, [updateStatus])

  const uncheck = useCallback((id: string) => {
    setState((p) => {
      const nextDone = { ...p.done }
      delete nextDone[id]
      return { ...p, done: nextDone }
    })
    updateStatus.mutate({ id, status: 'todo' })
  }, [updateStatus])

  const planAt = useCallback((id: string, slot: PlannedSlot) => {
    setState((p) => ({ ...p, planned: { ...p.planned, [id]: { slot } } }))
  }, [])

  const unplan = useCallback((id: string) => {
    setState((p) => {
      const nextPlanned = { ...p.planned }
      delete nextPlanned[id]
      return { ...p, planned: nextPlanned, rightNow: p.rightNow === id ? null : p.rightNow }
    })
  }, [])

  return { ...state, plannedIds, promote, markDone, uncheck, planAt, unplan }
}

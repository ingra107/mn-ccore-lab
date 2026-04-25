// useTodayState — localStorage-backed daily plan (rightNow / planned / done).
// Extracted from src/pages/portal/TodayPage.tsx during the component-split
// refactor. Per HANDOFF §2: "already separable — promote/plan/done state."
//
// Shape persists to `today_state_${YYYY-MM-DD}` so UnifiedMyTasks can read +
// mutate the same snapshot (see helpers in MyTasks/components/InlineDetail).

import { useState, useEffect, useCallback } from 'react'
import { todayKey, type PlannedSlot } from '../components/today/constants'

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

export function useTodayState(allTaskIds: string[]): TodayStateApi {
  const storageKey = `today_state_${todayKey()}`
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

  // Trim entries pointing at tasks no longer in the data set.
  useEffect(() => {
    const ids = new Set(allTaskIds)
    setState((prev) => {
      let changed = false
      const next: TodayStateShape = { ...prev, planned: { ...prev.planned }, done: { ...prev.done } }
      for (const id of Object.keys(next.planned)) if (!ids.has(id)) { delete next.planned[id]; changed = true }
      for (const id of Object.keys(next.done)) if (!ids.has(id)) { delete next.done[id]; changed = true }
      if (next.rightNow && !ids.has(next.rightNow)) { next.rightNow = null; changed = true }
      return changed ? next : prev
    })
  }, [allTaskIds])

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
  }, [])

  const uncheck = useCallback((id: string) => {
    setState((p) => {
      const nextDone = { ...p.done }
      delete nextDone[id]
      return { ...p, done: nextDone }
    })
  }, [])

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

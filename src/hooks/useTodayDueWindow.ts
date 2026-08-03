import { useCallback, useEffect, useState } from 'react'

// useTodayDueWindow — how far ahead the Today task pool reaches (#105).
//
// Nick: "maybe its a toggle to show all tasks on today vs only those that are
// due this in the next 7 days, 14 days, 30, all."
//
// Today's task list has never had a due filter — it renders every open task
// assigned to you, which is why the heading "All today's tasks" was quietly
// false and the page grew without bound.
//
// This is a VIEW PREFERENCE, not task state: no API call, no D1 column, no PB
// sync. That is the whole reason it is cheap. A real per-task snooze would have
// to round-trip Hub → D1 → brain.db and needs a coordinated schema change
// (CLAUDE.md "Cross-repo Schema Coordination"); a localStorage snooze would be
// a cross-device lie. Kept deliberately out of scope.
//
// Pattern mirrors useTodayView / useDensity: one key, one hook, cross-tab sync.

// String-typed on purpose: localStorage round-trips strings anyway, and the
// shared SegmentedToggle is generic over `T extends string`. Callers that need
// the number use `dueWindowDays()`.
export type DueWindow = '7' | '14' | '30' | 'all'

const LS_KEY = 'mnccore.today.dueWindow'
const VALID: DueWindow[] = ['7', '14', '30', 'all']

export const DUE_WINDOW_OPTIONS: Array<{ value: DueWindow; label: string }> = [
  { value: '7', label: '7d' },
  { value: '14', label: '14d' },
  { value: '30', label: '30d' },
  { value: 'all', label: 'All' },
]

/** Days in the window, or null for 'all' (no upper bound). */
export function dueWindowDays(w: DueWindow): number | null {
  return w === 'all' ? null : Number(w)
}

function read(): DueWindow {
  try {
    const raw = localStorage.getItem(LS_KEY) as DueWindow | null
    return raw && VALID.includes(raw) ? raw : 'all'
  } catch {
    return 'all'
  }
}

export function useTodayDueWindow() {
  // Defaults to 'all' so nobody's task list silently shrinks on deploy; the
  // choice sticks once Nick picks a window.
  const [dueWindow, setDueWindowState] = useState<DueWindow>(() => read())

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LS_KEY) return
      setDueWindowState(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setDueWindow = useCallback((next: DueWindow) => {
    setDueWindowState(next)
    try { localStorage.setItem(LS_KEY, next) } catch { /* unavailable */ }
  }, [])

  return { dueWindow, setDueWindow }
}

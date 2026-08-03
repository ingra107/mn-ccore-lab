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

export type DueWindow = 7 | 14 | 30 | 'all'

const LS_KEY = 'mnccore.today.dueWindow'
const VALID: DueWindow[] = [7, 14, 30, 'all']

export const DUE_WINDOW_OPTIONS: Array<{ value: DueWindow; label: string; hint: string }> = [
  { value: 7, label: '7d', hint: 'Due in the next 7 days (plus overdue and anything planned today)' },
  { value: 14, label: '14d', hint: 'Due in the next 14 days (plus overdue and anything planned today)' },
  { value: 30, label: '30d', hint: 'Due in the next 30 days (plus overdue and anything planned today)' },
  { value: 'all', label: 'All', hint: 'Every open task assigned to you, dated or not' },
]

function read(): DueWindow {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw === null) return 'all'
    // Numbers round-trip through localStorage as strings.
    const parsed: DueWindow = raw === 'all' ? 'all' : (Number(raw) as DueWindow)
    return VALID.includes(parsed) ? parsed : 'all'
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
    try { localStorage.setItem(LS_KEY, String(next)) } catch { /* unavailable */ }
  }, [])

  return { dueWindow, setDueWindow }
}

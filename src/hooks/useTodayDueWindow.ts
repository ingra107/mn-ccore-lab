import { useUserPref } from './useUserPref'

// useTodayDueWindow — how far ahead the Today task pool reaches (#105).
//
// Nick: "maybe its a toggle to show all tasks on today vs only those that are
// due this in the next 7 days, 14 days, 30, all."
//
// Today's task list has never had a due filter — it renders every open task
// assigned to you, which is why the heading "All today's tasks" was quietly
// false and the page grew without bound.
//
// This is a VIEW PREFERENCE, not task state: no task column, no PB sync. It is
// one per-person pref ('today.dueWindow', useUserPref), so the window is the
// same on every device (PB #911). A real per-task snooze would have to
// round-trip Hub → D1 → brain.db and needs a coordinated schema change
// (CLAUDE.md "Cross-repo Schema Coordination"). Kept deliberately out of scope.

// String-typed on purpose: the shared SegmentedToggle is generic over
// `T extends string`. Callers that need the number use `dueWindowDays()`.
export type DueWindow = '7' | '14' | '30' | 'all'

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

function validate(stored: unknown): DueWindow {
  return VALID.includes(stored as DueWindow) ? (stored as DueWindow) : 'all'
}

export function useTodayDueWindow() {
  // Defaults to 'all' so nobody's task list silently shrinks on deploy; the
  // choice sticks once Nick picks a window.
  const [dueWindow, setDueWindow] = useUserPref<DueWindow>('today.dueWindow', 'all', validate)
  return { dueWindow, setDueWindow }
}

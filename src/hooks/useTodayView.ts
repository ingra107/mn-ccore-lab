import { useCallback, useState } from 'react'
import { useUserPref } from './useUserPref'

// useTodayView — Today page view toggle (Timeline ⇄ Agenda).
//
// Two layers:
//   1. Persisted DEFAULT (pref 'today.defaultView', on the server per person
//      so it is the same on every device, PB #911) — the view Nick wants when
//      he opens Today fresh. Default = 'timeline'. Settable from
//      Settings → Today → Default view.
//   2. Ephemeral SESSION view — in-session toggle (Timeline button in the header).
//      Starts equal to the stored default on mount; NOT persisted. If Nick
//      switches during the day (Timeline → Agenda to scan) it resets on next
//      page load back to his default.

export type TodayView = 'timeline' | 'agenda'

const VALID: TodayView[] = ['timeline', 'agenda']
const DEFAULT_VIEW: TodayView = 'timeline'

function validate(stored: unknown): TodayView {
  return VALID.includes(stored as TodayView) ? (stored as TodayView) : DEFAULT_VIEW
}

export function useTodayView() {
  const [defaultView, setDefault] = useUserPref<TodayView>('today.defaultView', DEFAULT_VIEW, validate)

  // Ephemeral session view: null until toggled this page load, so it follows
  // the stored default (including one that arrives from the server after
  // mount) until the person picks a view here.
  const [sessionView, setSessionView] = useState<TodayView | null>(null)

  // In-session toggle — ephemeral, switches between timeline and agenda.
  const toggleView = useCallback(() => {
    setSessionView((v) => ((v ?? defaultView) === 'timeline' ? 'agenda' : 'timeline'))
  }, [defaultView])

  // Direct set (e.g. from a labelled button in the header).
  const setSessionViewDirect = useCallback((view: TodayView) => {
    setSessionView(view)
  }, [])

  return {
    view: sessionView ?? defaultView, // the current view to render
    defaultView,                      // the persisted default (for Settings display)
    setDefault,                       // Settings → saves the default
    toggleView,                       // header toggle button
    setView: setSessionViewDirect,    // direct set (e.g. labelled tab buttons)
  }
}

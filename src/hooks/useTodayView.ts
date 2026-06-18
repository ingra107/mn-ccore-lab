import { useCallback, useEffect, useState } from 'react'

// useTodayView — Today page view toggle (Timeline ⇄ Agenda).
//
// Two layers:
//   1. Persisted DEFAULT (localStorage 'mnccore.today.defaultView') — the view
//      Nick wants when he opens Today fresh. Default = 'timeline'. Settable from
//      Settings → Today → Default view.
//   2. Ephemeral SESSION view — in-session toggle (Timeline button in the header).
//      Starts equal to the stored default on mount; NOT persisted. If Nick
//      switches during the day (Timeline → Agenda to scan) it resets on next
//      page load back to his default.
//
// Pattern mirrors useDensity: one localStorage key, one hook, syncs cross-tab.

export type TodayView = 'timeline' | 'agenda'

const LS_KEY = 'mnccore.today.defaultView'
const VALID: TodayView[] = ['timeline', 'agenda']

function readDefault(): TodayView {
  try {
    const v = localStorage.getItem(LS_KEY) as TodayView | null
    return v && VALID.includes(v) ? v : 'timeline'
  } catch {
    return 'timeline'
  }
}

export function useTodayView() {
  // Persisted default — read once on mount. Changes when user edits Settings.
  const [defaultView, setDefaultViewState] = useState<TodayView>(() => readDefault())

  // Ephemeral session view — starts at default, NOT persisted to localStorage.
  const [sessionView, setSessionView] = useState<TodayView>(() => readDefault())

  // Cross-tab sync for the stored default (e.g. Settings opened in another tab).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LS_KEY) return
      const next = readDefault()
      setDefaultViewState(next)
      // Only update the session view if user hasn't explicitly toggled this
      // session — we track this via the sessionToggled ref below.
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Persist a new default — called from Settings.
  const setDefault = useCallback((view: TodayView) => {
    setDefaultViewState(view)
    try { localStorage.setItem(LS_KEY, view) } catch { /* unavailable */ }
  }, [])

  // In-session toggle — ephemeral, switches between timeline and agenda.
  const toggleView = useCallback(() => {
    setSessionView((v) => (v === 'timeline' ? 'agenda' : 'timeline'))
  }, [])

  // Direct set (e.g. from a labelled button in the header).
  const setSessionViewDirect = useCallback((view: TodayView) => {
    setSessionView(view)
  }, [])

  return {
    view: sessionView,          // the current view to render
    defaultView,                // the persisted default (for Settings display)
    setDefault,                 // Settings → saves to localStorage
    toggleView,                 // header toggle button
    setView: setSessionViewDirect,  // direct set (e.g. labelled tab buttons)
  }
}

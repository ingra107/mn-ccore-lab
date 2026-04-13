import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Global keyboard shortcuts for the portal.
 *
 * Navigation chords (Linear-style, 1s window):
 *   G D = Dashboard      G T = My Tasks       G P = Projects
 *   G M = Meetings       G E = Deadlines      G I = Ideas
 *   G S = Settings       G C = Calendar       G H = Home
 *   G R = Research Digest
 *
 * Legacy chord aliases (preserved for muscle memory):
 *   G Y = My Tasks       G L = Digest         G K = Deadlines
 *   G A = Activity       G G = Grants
 *
 * Actions:
 *   C = Create task
 *   ? = Show shortcut help
 *   / = Focus search (Cmd+K)
 *   F = Toggle filters / focus mode
 *   [ = Toggle sidebar
 *
 * Implementation: leader-key state machine. Press G, then the follow-up
 * key within 1000ms. Escape, unknown key, or timeout clears the pending
 * leader. Ignored while typing in inputs/textarea/contenteditable.
 */

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const [showHelp, setShowHelp] = useState(false)
  const [gPending, setGPending] = useState(false)

  // useRef so the timer handle persists across re-renders triggered by setGPending
  const gTimerRef = useRef<number | null>(null)
  // useRef so the handler always sees the latest gPending without re-registering
  const gPendingRef = useRef(gPending)
  useEffect(() => { gPendingRef.current = gPending }, [gPending])

  // Unmount-only cleanup — never fires on state changes
  useEffect(() => {
    return () => {
      if (gTimerRef.current !== null) clearTimeout(gTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return
      }

      // Don't trigger with modifier keys (except for Cmd+K which CommandPalette handles)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const currentGPending = gPendingRef.current

      // Escape clears any pending leader chord immediately
      if (e.key === 'Escape' && currentGPending) {
        setGPending(false)
        if (gTimerRef.current !== null) { clearTimeout(gTimerRef.current); gTimerRef.current = null }
        return
      }

      // G + key navigation (chord state machine)
      if (currentGPending) {
        setGPending(false)
        if (gTimerRef.current !== null) { clearTimeout(gTimerRef.current); gTimerRef.current = null }

        // Spec chords (F-07) + preserved legacy aliases
        const navMap: Record<string, string> = {
          // F-07 spec
          d: '/dashboard',
          t: '/my-tasks',
          p: '/projects',
          m: '/meetings',
          e: '/deadlines',
          i: '/ideas',
          s: '/settings',
          c: '/calendar',
          h: '/',
          r: '/digest',
          // Legacy aliases (backward compat)
          y: '/my-tasks',
          l: '/digest',
          g: '/grants',
          k: '/deadlines',
          a: '/activity',
        }

        const path = navMap[e.key.toLowerCase()]
        if (path) {
          e.preventDefault()
          navigate(path)
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'g':
          e.preventDefault()
          // Cancel any previous timer before arming a new one
          if (gTimerRef.current !== null) { clearTimeout(gTimerRef.current); gTimerRef.current = null }
          setGPending(true)
          gTimerRef.current = window.setTimeout(() => {
            setGPending(false)
            gTimerRef.current = null
          }, 1000)
          break

        case 'c':
          e.preventDefault()
          navigate('/my-tasks?create=true')
          break

        case 'n':
          // Only fire globally on /my-tasks — Ideas/Decisions pages have their own local n handlers
          if (window.location.pathname.startsWith('/my-tasks')) {
            e.preventDefault()
            navigate('/my-tasks?create=true')
          }
          break

        case 'f':
          e.preventDefault()
          // On task pages, F toggles filter panel; elsewhere, focus mode
          if (window.location.pathname === '/tasks' || window.location.pathname === '/my-tasks') {
            document.dispatchEvent(new CustomEvent('toggle-filters'))
          } else {
            document.dispatchEvent(new CustomEvent('toggle-focus'))
          }
          break

        case '[':
          e.preventDefault()
          document.dispatchEvent(new CustomEvent('toggle-sidebar'))
          break

        case '?':
          e.preventDefault()
          setShowHelp((prev) => !prev)
          break

        case '/':
          e.preventDefault()
          // Trigger Cmd+K
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
          break
      }
    }

    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [navigate])

  return { showHelp, setShowHelp, gPending }
}

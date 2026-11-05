import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PATHS } from '../constants/paths'
import { isEditableTarget } from '../lib/editableTarget'
import { chordTarget } from '../constants/chords'
import { openGlobalQuickAdd } from '../components/GlobalQuickAddModal'

/**
 * Global keyboard shortcuts for the portal.
 *
 * Navigation chords (Linear-style, 1s window):
 *   The table is constants/chords.ts (primary chords plus hidden aliases).
 *
 * Actions:
 *   C = Quick add (same as q)
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
      if (isEditableTarget(e.target)) return

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

        // One chord map (constants/chords.ts) feeds this hook, the help panel
        // and the palette.
        const path = chordTarget(e.key)
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
          // Same capture as q and the + button, in place (Rule 63d). N is not
          // bound here: Ideas and Decisions own their local n.
          e.preventDefault()
          openGlobalQuickAdd()
          break

        case 'f':
          e.preventDefault()
          // On task pages, F toggles filter panel; elsewhere, focus mode
          if (window.location.pathname === PATHS.tasks || window.location.pathname === PATHS.myTasks) {
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

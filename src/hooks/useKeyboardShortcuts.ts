import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Global keyboard shortcuts for the portal.
 *
 * Navigation (G + key):
 *   G D = Dashboard, G H = My Hub, G T = Tasks, G P = Projects
 *   G M = Meetings, G C = Calendar, G I = Ideas, G L = Literature
 *
 * Actions:
 *   C = Create task (on tasks page)
 *   ? = Show shortcut help
 *   / = Focus search (Cmd+K)
 */

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const [showHelp, setShowHelp] = useState(false)
  const [gPending, setGPending] = useState(false)

  useEffect(() => {
    let gTimer: ReturnType<typeof setTimeout> | null = null

    const handler = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return
      }

      // Don't trigger with modifier keys (except for Cmd+K which CommandPalette handles)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // G + key navigation
      if (gPending) {
        setGPending(false)
        if (gTimer) clearTimeout(gTimer)

        const navMap: Record<string, string> = {
          d: '/dashboard',
          h: '/personal',
          t: '/tasks',
          p: '/projects',
          m: '/meetings',
          c: '/calendar',
          i: '/ideas',
          l: '/digest',
          g: '/grants',
          k: '/deadlines',
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
          setGPending(true)
          gTimer = setTimeout(() => setGPending(false), 1000)
          break

        case 'c':
          e.preventDefault()
          navigate('/tasks?create=true')
          break

        case 'n':
          e.preventDefault()
          navigate('/ideas?create=true')
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
      if (gTimer) clearTimeout(gTimer)
    }
  }, [gPending, navigate])

  return { showHelp, setShowHelp, gPending }
}

// useListKeyboard — j/k navigation, e/Enter open drawer, x/Space toggle
// select, Escape clears selection. List view only — Columns/Lanes use mouse.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx (the ListView's
// inline useEffect). Skips when an input/select/textarea has focus so
// users can type freely in the search bar.

import { useEffect, useState } from 'react'
import type { TaskRow } from '../../../lib/api'

export interface UseListKeyboardArgs {
  filtered: TaskRow[]
  toggleSelect: (id: string) => void
  setDrawer: (id: string | null) => void
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function useListKeyboard({ filtered, toggleSelect, setDrawer, setSelected }: UseListKeyboardArgs) {
  const [rawCursor, setCursor] = useState(0)

  // Clamp the cursor to the visible set by DERIVING it, never by setting
  // state. #144 (2026-10-08): the eslint burn-down (05999c16) moved this clamp
  // into a render-phase `if (cursor >= filtered.length) setCursor(...)`. On an
  // EMPTY list that guard is `0 >= 0`, true forever, and a render-phase
  // setState always re-renders (no same-value bailout during render), so every
  // user with zero visible tasks hit React #301 "Too many re-renders" and the
  // whole page fell to the error boundary. A derived value cannot loop.
  const maxIdx = Math.max(0, filtered.length - 1)
  const cursor = Math.min(rawCursor, maxIdx)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      // Enter / Space belong to the focused control. A task card header, a done
      // box or a link handles its own activation; without this guard the same
      // keypress also fired the list's open-drawer / select shortcut.
      if ((e.key === 'Enter' || e.key === ' ') && (document.activeElement as HTMLElement | null)?.closest('button, a, [role="button"]')) return
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setCursor(Math.min(maxIdx, cursor + 1)) }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setCursor(Math.max(0, cursor - 1)) }
      else if (e.key === 'x' || e.key === ' ') { e.preventDefault(); const t = filtered[cursor]; if (t) toggleSelect(t.id) }
      else if (e.key === 'e' || e.key === 'Enter') { e.preventDefault(); const t = filtered[cursor]; if (t) setDrawer(t.id) }
      else if (e.key === 'Escape') { setSelected(new Set()) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, cursor, maxIdx, toggleSelect, setDrawer, setSelected])

  return { cursor, setCursor }
}

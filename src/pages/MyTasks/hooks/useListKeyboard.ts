// useListKeyboard — j/k navigation, e/Enter open drawer, x/Space toggle
// select, Escape clears selection. The My Tasks Table and the Deadlines list;
// Columns/Lanes use the mouse.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx (the ListView's
// inline useEffect). Skips when an input/select/textarea has focus so
// users can type freely in the search bar.

import { useCallback, useEffect, useState } from 'react'

export interface UseListKeyboardArgs {
  /** The rows on screen, in order. Only `id` is read (Deadlines mixes tasks and grant milestones). */
  filtered: ReadonlyArray<{ id: string }>
  toggleSelect: (id: string) => void
  setDrawer: (id: string | null) => void
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function useListKeyboard({ filtered, toggleSelect, setDrawer, setSelected }: UseListKeyboardArgs) {
  const [rawCursor, setRawCursor] = useState(0)
  // The cursor row is drawn only once someone USES it: a j/k key or a click
  // that moves it. On load it was outlined before any key press, so with the
  // pointer over another row two rows looked raised (prod check 2026-10-11).
  // The position still starts at 0, so e / x / Enter act on the first row.
  const [cursorShown, setCursorShown] = useState(false)
  const setCursor = useCallback((i: number) => { setRawCursor(i); setCursorShown(true) }, [])

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
      // The first j/k shows the cursor where it is; later presses move it.
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setCursor(cursorShown ? Math.min(maxIdx, cursor + 1) : cursor) }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setCursor(cursorShown ? Math.max(0, cursor - 1) : cursor) }
      else if (e.key === 'x' || e.key === ' ') { e.preventDefault(); const t = filtered[cursor]; if (t) toggleSelect(t.id) }
      else if (e.key === 'e' || e.key === 'Enter') { e.preventDefault(); const t = filtered[cursor]; if (t) setDrawer(t.id) }
      else if (e.key === 'Escape') { setSelected(new Set()) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, cursor, cursorShown, maxIdx, toggleSelect, setCursor, setDrawer, setSelected])

  return { cursor, setCursor, cursorShown }
}

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
  const [cursor, setCursor] = useState(0)

  // Clamp cursor when the visible set shrinks underneath it. Adjusted
  // during render (React-endorsed "adjusting state" pattern:
  // https://react.dev/learn/you-might-not-need-an-effect) rather than an
  // effect — setCursor bails out once the value stabilizes (Math.max(0,-1)
  // === 0 on an empty list), so this can't loop.
  if (cursor >= filtered.length) {
    setCursor(Math.max(0, filtered.length - 1))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(filtered.length - 1, c + 1)) }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)) }
      else if (e.key === 'x' || e.key === ' ') { e.preventDefault(); const t = filtered[cursor]; if (t) toggleSelect(t.id) }
      else if (e.key === 'e' || e.key === 'Enter') { e.preventDefault(); const t = filtered[cursor]; if (t) setDrawer(t.id) }
      else if (e.key === 'Escape') { setSelected(new Set()) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, cursor, toggleSelect, setDrawer, setSelected])

  return { cursor, setCursor }
}

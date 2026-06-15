// useSelectMode — returns true while Ctrl/Meta is physically held by the user.
// Used by every task-list surface to show the "select mode" affordance on rows
// (cursor: cell, Square icon on checkbox, select-mode hover highlight) without
// requiring each surface to replicate the window listener boilerplate.
//
// Extracted from TaskGridView (Phase B, c5fe4360) into a shared hook so
// Columns, Lanes, and List can call it too — Phase G (G-1, 2026-06-15).
//
// Pass enabled=false to skip the listeners entirely (e.g. when the surface
// has no onToggleSelect wired). The hook is safe to call unconditionally —
// it never causes a re-render when enabled is false.

import { useState, useEffect } from 'react'

export function useSelectMode(enabled: boolean): boolean {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setActive(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setActive(false)
    }
    const onBlur = () => setActive(false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [enabled])

  return active
}

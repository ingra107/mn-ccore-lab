// useSelection — multi-select state + toggle/clear helpers for the bulk bar.
// Returns the Set + setter + a stable toggle/clear pair so child views don't
// need useCallback wrappers per render.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useState, useCallback } from 'react'

export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleSelect = useCallback((id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  return { selected, setSelected, toggleSelect, clearSelection }
}

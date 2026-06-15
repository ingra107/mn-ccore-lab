// useSelection — multi-select state + toggle/range/clear helpers for the bulk bar.
// Returns the Set + setter + a stable toggle/clear/selectRange/setAnchor set so
// child views don't need useCallback wrappers per render.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.
// Range-select + anchor added Phase G (2026-06-15).

import { useState, useCallback } from 'react'

export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)

  // Toggle a single task in/out of the selection and set it as the anchor.
  // Ctrl/Meta+click calls this.
  const toggleSelect = useCallback((id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    setAnchorId(id)
  }, [])

  // Select the inclusive range between anchorId and targetId in orderedIds
  // (the view's current visible display order). If no anchor has been set yet,
  // treat as a single toggleSelect. Shift+click calls this.
  const selectRange = useCallback((targetId: string, orderedIds: string[], currentAnchor: string | null) => {
    if (!currentAnchor || !orderedIds.includes(currentAnchor)) {
      // No anchor → fall back to single toggle + set anchor
      setSelected((s) => { const n = new Set(s); n.has(targetId) ? n.delete(targetId) : n.add(targetId); return n })
      setAnchorId(targetId)
      return
    }
    const anchorIdx = orderedIds.indexOf(currentAnchor)
    const targetIdx = orderedIds.indexOf(targetId)
    if (anchorIdx === -1 || targetIdx === -1) {
      // Target not in visible list — single toggle
      setSelected((s) => { const n = new Set(s); n.has(targetId) ? n.delete(targetId) : n.add(targetId); return n })
      setAnchorId(targetId)
      return
    }
    const lo = Math.min(anchorIdx, targetIdx)
    const hi = Math.max(anchorIdx, targetIdx)
    const rangeIds = orderedIds.slice(lo, hi + 1)
    // Merge range into current selection (don't clear pre-existing selections
    // outside the range — matches standard OS file-manager shift-click behaviour).
    setSelected((s) => {
      const n = new Set(s)
      for (const id of rangeIds) n.add(id)
      return n
    })
    // Anchor stays at the original anchor, not the target — so the next
    // shift+click extends from the same pivot.
  }, [])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setAnchorId(null)
  }, [])

  return { selected, setSelected, toggleSelect, selectRange, anchorId, setAnchorId, clearSelection }
}

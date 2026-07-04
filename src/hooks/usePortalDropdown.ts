// usePortalDropdown — shared machinery for portal-to-body dropdown menus
// (GhostSelect, FilterChip): fixed positioning off the trigger's bounding
// rect, viewport clamping, rAF-throttled scroll/resize repositioning,
// close-when-trigger-scrolls-out, and outside-click close.
//
// Callers own everything else: open/closed state, keyboard navigation,
// focus management, filtering. This hook only answers "where does the
// portal go, and when does it close because of scroll/resize/outside click."
//
// #90 origin: an un-clamped position:absolute menu ran off the bottom of
// the viewport with no way to reach the rest of the list (GhostSelect fixed
// first; FilterChip mirrored the same pattern the same week, independently,
// with slightly different clamp math). getPosition is a caller-supplied
// pure function of the trigger rect so each dropdown keeps its own clamp
// strategy without re-duplicating the portal/reposition/close plumbing.
// The reposition-on-scroll behavior (vs. the old close-on-any-scroll) is a
// separate, later fix — GhostSelect's scroll bug (aba74719, 2026-06-11) —
// not part of #90, which was clamp math only.

import { useState, useRef, useEffect, useCallback, type RefObject } from 'react'

export interface PortalDropdownPosition {
  top: number
  left: number
  minWidth: number
  maxHeight: number
}

interface UsePortalDropdownArgs {
  open: boolean
  onClose: () => void
  /**
   * Given the trigger's current bounding rect, return the clamped fixed
   * position for the portal menu. Called once synchronously on open, then
   * again (rAF-throttled) on every scroll/resize while open. Pass a
   * `useCallback`-stable function — this hook re-subscribes its listeners
   * whenever the identity changes.
   */
  getPosition: (rect: DOMRect) => PortalDropdownPosition
}

interface UsePortalDropdownResult<T extends HTMLElement> {
  triggerRef: RefObject<T | null>
  menuRef: RefObject<HTMLDivElement | null>
  pos: PortalDropdownPosition
}

const INITIAL_POS: PortalDropdownPosition = { top: 0, left: 0, minWidth: 0, maxHeight: 0 }

export function usePortalDropdown<T extends HTMLElement = HTMLElement>({
  open,
  onClose,
  getPosition,
}: UsePortalDropdownArgs): UsePortalDropdownResult<T> {
  const triggerRef = useRef<T>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const [pos, setPos] = useState<PortalDropdownPosition>(INITIAL_POS)

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return
    setPos(getPosition(triggerRef.current.getBoundingClientRect()))
  }, [getPosition])

  // rAF-throttled reposition for scroll/resize tracking. Closes instead of
  // repositioning once the trigger has scrolled fully out of view — a
  // detached floating menu with no visible anchor is worse than closing.
  const scheduleReposition = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        onClose()
        return
      }
      setPos(getPosition(rect))
    })
  }, [getPosition, onClose])

  useEffect(() => {
    if (!open) return
    computePosition()

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      const inTrigger = triggerRef.current?.contains(target)
      const inMenu = menuRef.current?.contains(target)
      if (!inTrigger && !inMenu) onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    // Track scroll/resize to REPOSITION (not close) the menu.
    window.addEventListener('scroll', scheduleReposition, { capture: true, passive: true })
    window.addEventListener('resize', scheduleReposition, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('scroll', scheduleReposition, true)
      window.removeEventListener('resize', scheduleReposition)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [open, computePosition, scheduleReposition, onClose])

  return { triggerRef, menuRef, pos }
}

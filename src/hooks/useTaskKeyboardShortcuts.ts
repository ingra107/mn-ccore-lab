import { useEffect, useCallback, useRef } from 'react'

interface UseTaskKeyboardShortcutsOptions {
  /** Total number of tasks in the list */
  taskCount: number
  /** Current focused index (-1 = none) */
  focusedIndex: number
  /** Set focused index */
  setFocusedIndex: (index: number | ((prev: number) => number)) => void
  /** Whether peek overlay is open */
  peekOpen: boolean
  /** Toggle peek overlay */
  togglePeek: () => void
  /** Open detail panel for focused task */
  openDetail: () => void
  /** Cycle status for focused task */
  cycleStatus: () => void
  /** Toggle selection for focused task */
  toggleSelect: () => void
  /** Whether a modal/panel/overlay is blocking shortcuts (other than peek) */
  isBlocked: boolean
  /** Close any open overlay */
  closeOverlay: () => void
}

/**
 * Task-specific keyboard shortcuts for the task list view.
 *
 * J/K = move focus down/up
 * Space = toggle peek overlay
 * Enter = open detail panel
 * S = cycle status (todo -> in_progress -> done)
 * X = toggle selection
 * Escape = close overlay/panel
 */
export function useTaskKeyboardShortcuts({
  taskCount,
  focusedIndex,
  setFocusedIndex,
  peekOpen,
  togglePeek,
  openDetail,
  cycleStatus,
  toggleSelect,
  isBlocked,
  closeOverlay,
}: UseTaskKeyboardShortcutsOptions) {
  // Use refs to avoid stale closures in the event handler
  const focusedIndexRef = useRef(focusedIndex)
  const peekOpenRef = useRef(peekOpen)
  const taskCountRef = useRef(taskCount)
  const isBlockedRef = useRef(isBlocked)

  useEffect(() => { focusedIndexRef.current = focusedIndex }, [focusedIndex])
  useEffect(() => { peekOpenRef.current = peekOpen }, [peekOpen])
  useEffect(() => { taskCountRef.current = taskCount }, [taskCount])
  useEffect(() => { isBlockedRef.current = isBlocked }, [isBlocked])

  const handler = useCallback((e: KeyboardEvent) => {
    // Don't trigger when typing in inputs
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      return
    }

    // Don't trigger with modifier keys
    if (e.metaKey || e.ctrlKey || e.altKey) return

    const count = taskCountRef.current
    const idx = focusedIndexRef.current
    const blocked = isBlockedRef.current
    // Escape always works — closes overlays
    if (e.key === 'Escape') {
      e.preventDefault()
      closeOverlay()
      return
    }

    // If a modal (not peek) is blocking, don't process other shortcuts
    if (blocked) return

    switch (e.key) {
      case 'j':
      case 'J': {
        e.preventDefault()
        if (count === 0) return
        setFocusedIndex((prev) => {
          if (prev < 0) return 0
          return Math.min(prev + 1, count - 1)
        })
        break
      }

      case 'k':
      case 'K': {
        e.preventDefault()
        if (count === 0) return
        setFocusedIndex((prev) => {
          if (prev < 0) return 0
          return Math.max(prev - 1, 0)
        })
        break
      }

      case ' ': {
        e.preventDefault()
        if (idx < 0 && count > 0) {
          // Focus first task, then open peek
          setFocusedIndex(0)
        }
        togglePeek()
        break
      }

      case 'Enter': {
        if (idx >= 0) {
          e.preventDefault()
          openDetail()
        }
        break
      }

      case 's':
      case 'S': {
        if (idx >= 0) {
          e.preventDefault()
          cycleStatus()
        }
        break
      }

      case 'x':
      case 'X': {
        if (idx >= 0) {
          e.preventDefault()
          toggleSelect()
        }
        break
      }
    }
  }, [closeOverlay, setFocusedIndex, togglePeek, openDetail, cycleStatus, toggleSelect])

  useEffect(() => {
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handler])
}

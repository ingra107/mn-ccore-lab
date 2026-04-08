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
  /** Open add blocker search for focused task */
  addBlocker?: () => void
  /** Toggle filter panel visibility */
  toggleFilters?: () => void
  /** Expand subtasks for focused task */
  expandFocused?: () => void
  /** Collapse subtasks for focused task */
  collapseFocused?: () => void
  /** Trigger inline title edit for focused task */
  editFocusedTitle?: () => void
  /** Trigger due date picker for focused task */
  editFocusedDueDate?: () => void
  /** Open create task modal */
  createTask?: () => void
  /** Snooze focused task (push due date +1 day) */
  snoozeFocused?: () => void
  /** Open assignee picker for focused task */
  assignFocused?: () => void
}

/**
 * Task-specific keyboard shortcuts for the task list view.
 *
 * J/K = move focus down/up
 * Space = toggle peek overlay
 * Enter = open detail panel
 * S = cycle status (todo -> in_progress -> done)
 * X = toggle selection
 * B = add blocker (opens detail panel with blocker search)
 * → = expand subtasks for focused task (no-op if already expanded)
 * ← = collapse subtasks for focused task (no-op if already collapsed)
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
  addBlocker,
  toggleFilters,
  expandFocused,
  collapseFocused,
  editFocusedTitle,
  editFocusedDueDate,
  createTask,
  snoozeFocused,
  assignFocused,
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

      case 'b':
      case 'B': {
        if (idx >= 0 && addBlocker) {
          e.preventDefault()
          addBlocker()
        }
        break
      }

      case 'f':
      case 'F': {
        if (toggleFilters) {
          e.preventDefault()
          toggleFilters()
        }
        break
      }

      case 'c':
      case 'C': {
        if (createTask) {
          e.preventDefault()
          createTask()
        }
        break
      }

      case 'e':
      case 'E': {
        if (idx >= 0 && editFocusedTitle) {
          e.preventDefault()
          editFocusedTitle()
        }
        break
      }

      case 'd':
      case 'D': {
        if (idx >= 0 && editFocusedDueDate) {
          e.preventDefault()
          editFocusedDueDate()
        }
        break
      }

      case 'a':
      case 'A': {
        if (idx >= 0 && assignFocused) {
          e.preventDefault()
          assignFocused()
        }
        break
      }

      case 'z':
      case 'Z': {
        if (idx >= 0 && snoozeFocused) {
          e.preventDefault()
          snoozeFocused()
        }
        break
      }

      case 'ArrowRight': {
        if (idx >= 0 && expandFocused) {
          e.preventDefault()
          expandFocused()
        }
        break
      }

      case 'ArrowLeft': {
        if (idx >= 0 && collapseFocused) {
          e.preventDefault()
          collapseFocused()
        }
        break
      }
    }
  }, [closeOverlay, setFocusedIndex, togglePeek, openDetail, cycleStatus, toggleSelect, addBlocker, toggleFilters, expandFocused, collapseFocused, editFocusedTitle, editFocusedDueDate, createTask, snoozeFocused, assignFocused])

  useEffect(() => {
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handler])
}

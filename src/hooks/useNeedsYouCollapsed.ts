import { useCallback, useMemo } from 'react'
import { useUserPref } from './useUserPref'
import { cardQuestionCount } from '../lib/taskGrouping'
import type { TaskRow } from '../lib/api'

// Whether Nick folded the Today "Needs you" card into the stat line. One flag
// per person on the server (pref 'today.needsYouCollapsed', useUserPref), so
// folding it on one laptop folds it on the other and on the phone. It stays
// folded across reloads until he clicks "N needs you" in the stat line.
//
// `folded` is what the page acts on: the flag AND at least one row the card
// would show. With nothing waiting the flag has nothing to hide, so neither the
// card nor the stat appears (the flag itself is kept for the next question).

function validate(stored: unknown): boolean {
  return stored === true
}

export function useNeedsYouCollapsed(questionTasks: TaskRow[]): {
  /** Hide the card and show the "N needs you" stat instead. */
  folded: boolean
  /** The card's own count (cardQuestionCount), so stat and card agree. */
  count: number
  collapse: () => void
  restore: () => void
} {
  const [collapsed, setCollapsed] = useUserPref<boolean>('today.needsYouCollapsed', false, validate)
  const count = useMemo(() => cardQuestionCount(questionTasks), [questionTasks])
  const collapse = useCallback(() => setCollapsed(true), [setCollapsed])
  const restore = useCallback(() => setCollapsed(false), [setCollapsed])
  return { folded: collapsed && count > 0, count, collapse, restore }
}

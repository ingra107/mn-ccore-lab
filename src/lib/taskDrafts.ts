// What someone has written in a task's composer and not yet posted, kept per task
// for the session. The panel swaps tasks in place (a dependency click, next task),
// so a draft held in the composer's own state followed the panel onto another task
// and could be posted there. Here it stays with its task: the text, the Comment or
// Note choice, and the privacy lock, which must come back with the words it covers.
//
// Module state, on purpose: an upload or a post that outlives the composer still
// has to reach the draft it started from.

import { useCallback, useSyncExternalStore } from 'react'

export type DraftMode = 'comment' | 'note'
export interface TaskDraft { text: string; mode: DraftMode; meOnly: boolean }

const EMPTY: TaskDraft = { text: '', mode: 'comment', meOnly: false }
const drafts = new Map<string, TaskDraft>()
const listeners = new Set<() => void>()
const notify = () => { for (const l of listeners) l() }

/** Change a task's draft. An updater sees the draft as it stands now. */
export function patchTaskDraft(taskId: string, patch: Partial<TaskDraft> | ((d: TaskDraft) => Partial<TaskDraft>)): void {
  const current = drafts.get(taskId) ?? EMPTY
  const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) }
  if (next.text === '' && !next.meOnly && next.mode === EMPTY.mode) drafts.delete(taskId)
  else drafts.set(taskId, next)
  notify()
}

/**
 * A post landed: clear the box and its lock, but only if the box still holds what
 * was sent. Text written while the post was pending was never sent, so it stays,
 * and so does its lock.
 */
export function clearSentDraft(taskId: string, sent: string): void {
  if ((drafts.get(taskId) ?? EMPTY).text !== sent) return
  patchTaskDraft(taskId, { text: '', meOnly: false })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useTaskDraft(taskId: string) {
  const draft = useSyncExternalStore(subscribe, () => drafts.get(taskId) ?? EMPTY)
  const patch = useCallback((p: Parameters<typeof patchTaskDraft>[1]) => patchTaskDraft(taskId, p), [taskId])
  return [draft, patch] as const
}

export function _resetTaskDraftsForTests() {
  drafts.clear()
  notify()
}

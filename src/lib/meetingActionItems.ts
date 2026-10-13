// meetingActionItems — one place that turns a meeting's raw action-item rows
// into the list both surfaces show: the meeting page and the meeting's Today
// card.
//
// An action item is a task row (`tasks WHERE meeting_id IN (meetings.id,
// meetings.source_id)`); GET /api/meetings/:id already does that dual-id join
// server-side, so what arrives here is the right set. Counting action items
// across a PLAIN task list is the other job, and it stays in
// lib/meetingTaskCounts.ts (the same join, client side). Never compare a
// task's meeting_id to a meeting id with `===`.

import type { TaskRow } from './api'
import { isTaskDone } from './taskGrouping'

/**
 * Collapse the Cartesian duplicates the join can return (the same
 * rule the retired My Items page used). Key: normalized title + assignee + due date; the newest
 * updated_at wins.
 */
export function dedupeActionItems(items: readonly TaskRow[] | null | undefined): TaskRow[] {
  const seen = new Map<string, TaskRow>()
  for (const item of items ?? []) {
    const text = (item.title || item.description || '').replace(/^\[Carried forward\]\s*/i, '').toLowerCase().trim()
    const key = `${text}::${item.assignee ?? ''}::${item.due_date ?? ''}`
    const existing = seen.get(key)
    const itemTs = item.updated_at ?? item.created_at ?? ''
    const existingTs = existing ? (existing.updated_at ?? existing.created_at ?? '') : ''
    if (!existing || itemTs > existingTs) seen.set(key, item)
  }
  return [...seen.values()]
}

/** Open first, then due date (undated last), then creation order. */
export function sortActionItems(items: readonly TaskRow[]): TaskRow[] {
  return [...items].sort((a, b) => {
    const aDone = isTaskDone(a) ? 1 : 0
    const bDone = isTaskDone(b) ? 1 : 0
    if (aDone !== bDone) return aDone - bDone
    const aDue = a.due_date ?? '9999-99-99'
    const bDue = b.due_date ?? '9999-99-99'
    if (aDue !== bDue) return aDue < bDue ? -1 : 1
    return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1
  })
}

/** Deduped and sorted: the list a meeting shows. */
export function prepareActionItems(items: readonly TaskRow[] | null | undefined): TaskRow[] {
  return sortActionItems(dedupeActionItems(items))
}

/**
 * An action item is HANDLED once it is done, or handed to someone else (Nick,
 * 2026-10-12: "done, or handed to someone else"). The viewer's own open rows
 * are not handled: they are the viewer's to do. Date and project are NOT part
 * of the rule: the debrief writer fills both at mint (due today, the
 * extractor's project), so a rule on them folds every card on arrival.
 * The Today card counts handled rows and folds itself when all are.
 */
export function isActionHandled(t: TaskRow, viewer: string | null | undefined): boolean {
  if (isTaskDone(t)) return true
  return Boolean(viewer) && Boolean(t.assignee) && t.assignee !== viewer
}

export function countHandled(items: readonly TaskRow[], viewer: string | null | undefined): number {
  let n = 0
  for (const t of items) if (isActionHandled(t, viewer)) n += 1
  return n
}

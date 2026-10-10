// One definition of "overdue" and "done today" for stat lines.
//
// Lab Overview's status line uses the functions below. Today's own stat line
// (src/pages/portal/TodayPage.tsx, doneTodayDetail and overdueTasks) has NOT been
// migrated yet and still keeps its own filters, so the two can drift until it
// is; that file belongs to the Today lane. New surfaces should call these.
// Scope (one person or the whole lab) is the caller's choice, made by what it
// passes in.

import type { TaskRow } from './api'
import { isApprovalPending, isApprovalTriaged, isQuestionTask, todayKey } from './taskGrouping'
import { isToday } from '../components/today/constants'

/** Real work: not a pending or answered approval, not a question row. */
export function isWorkTask(t: TaskRow): boolean {
  return !isApprovalPending(t) && !isApprovalTriaged(t) && !isQuestionTask(t)
}

/** Open work whose due date is before today (local calendar day). */
export function countOverdue(tasks: TaskRow[]): number {
  const today = todayKey()
  return tasks.filter(
    (t) => t.completed === 0 && t.status !== 'done' && isWorkTask(t)
      && !!t.due_date && t.due_date.slice(0, 10) < today,
  ).length
}

/** Work completed on the viewer's local calendar day. */
export function countDoneToday(tasks: TaskRow[]): number {
  return tasks.filter((t) => t.completed === 1 && isToday(t.completed_at) && isWorkTask(t)).length
}

// One definition of "overdue" and "done today" for stat lines.
//
// Today's stat line (TodayPage.tsx) and Lab Overview's status line used to count
// these two numbers with their own filters, so the same task set gave two
// answers: Overview did not drop approvals or questions, and it matched
// completed_at against a UTC date prefix. Any surface that shows these counts
// calls the functions below. Scope (one person or the whole lab) is the
// caller's choice, made by what it passes in.

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

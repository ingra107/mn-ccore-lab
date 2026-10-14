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
import { isDoneStatus } from './dateUtils'

/** Real work: not a pending or answered approval, not a question row. */
export function isWorkTask(t: TaskRow): boolean {
  return !isApprovalPending(t) && !isApprovalTriaged(t) && !isQuestionTask(t)
}

/** Open work whose due date is before `dayKey` (YYYY-MM-DD, default today).
 *  The ONE lab-wide overdue predicate: Overview's status line, Pipeline's
 *  "This week" (count, prior week, sparkline) and overdue list, Team's
 *  Workload column and the lab health score all go through it, so an approval
 *  or a question row never counts and every tab shows one number (G8-08,
 *  2026-10-14: Overview said 13, Pipeline and Team 17). Done is either the
 *  flag or a done status ('done' / 'completed', dateUtils.isDoneStatus). */
export function isOverdueWork(t: TaskRow, dayKey: string = todayKey()): boolean {
  return !t.completed && !isDoneStatus(t.status) && isWorkTask(t)
    && !!t.due_date && t.due_date.slice(0, 10) < dayKey
}

export function countOverdueBefore(tasks: TaskRow[], dayKey: string): number {
  return tasks.filter((t) => isOverdueWork(t, dayKey)).length
}

/** Open work whose due date is before today (local calendar day). */
export function countOverdue(tasks: TaskRow[]): number {
  return countOverdueBefore(tasks, todayKey())
}

/** Work completed on the viewer's local calendar day. */
export function countDoneToday(tasks: TaskRow[]): number {
  return tasks.filter((t) => t.completed === 1 && isToday(t.completed_at) && isWorkTask(t)).length
}

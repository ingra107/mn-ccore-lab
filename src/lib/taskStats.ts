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

/** Open work whose due date is before `dayKey` (YYYY-MM-DD). The Pipeline tab
 *  counts its prior-week and sparkline snapshots with it, Overview's status
 *  line counts today with it, so the lab-wide overdue figure is one number on
 *  both tabs (G8-08, 2026-10-14: Overview said 13 and Pipeline 17, because
 *  Pipeline also counted approvals and questions). */
export function countOverdueBefore(tasks: TaskRow[], dayKey: string): number {
  return tasks.filter(
    (t) => !t.completed && t.status !== 'done' && isWorkTask(t)
      && !!t.due_date && t.due_date.slice(0, 10) < dayKey,
  ).length
}

/** Open work whose due date is before today (local calendar day). */
export function countOverdue(tasks: TaskRow[]): number {
  return countOverdueBefore(tasks, todayKey())
}

/** Work completed on the viewer's local calendar day. */
export function countDoneToday(tasks: TaskRow[]): number {
  return tasks.filter((t) => t.completed === 1 && isToday(t.completed_at) && isWorkTask(t)).length
}

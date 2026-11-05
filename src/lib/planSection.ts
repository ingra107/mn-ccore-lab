// planSection.ts -- what the Plan section on Today holds, in what order (#169
// round 2, docs/superpowers/specs/2026-11-04-plan-section-design.md). The page
// takes `ids` out of the task sections and Completed today, so each task shows
// once among the lists.
//
//   today  planned for today, picks or not, in plan rank order
//   picks  the plan's other open picks, in plan order
//   done   finished picks of this plan (they stay until a newer plan answers
//          without them, even over a day with no re-plan), then finished
//          non-picks planned for today (they stay until that day ends)
//
// A finished task keeps its plan columns (useTodayState.markDone), which is how
// a finished non-pick is known to be today's and how a reopen puts it back. A
// row the page does not have renders nothing.

import { parseDbUtc } from './time'
import type { TaskRow } from './api'
import type { AcceptedWeekPlan } from './weekPlan'
import { isApprovalPending, isApprovalTriaged, isQuestionTask, isTaskDone } from './taskGrouping'
import { isMilestone } from '../../shared/taskKinds'

export interface PlanSectionModel {
  today: TaskRow[]
  picks: TaskRow[]
  done: TaskRow[]
  ids: Set<string>
}

function byRank(a: TaskRow, b: TaskRow): number {
  const ra = typeof a.plan_rank === 'number' ? a.plan_rank : Infinity
  const rb = typeof b.plan_rank === 'number' ? b.plan_rank : Infinity
  return ra < rb ? -1 : ra > rb ? 1 : 0
}

/**
 * `planned` is useTodayState's map, from open rows. `localDone` is its optimistic
 * done map: a pick just checked sinks at once, ahead of the cache.
 */
export function planSectionModel(
  plan: AcceptedWeekPlan | null,
  tasks: TaskRow[],
  planned: Record<string, unknown>,
  today: string,
  localDone: Record<string, boolean> = {},
): PlanSectionModel {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const isDone = (t: TaskRow) => isTaskDone(t) || t.completed === 1 || !!localDone[t.id]
  const pickRows = (plan?.picks ?? []).map((p) => byId.get(p.task_id)).filter((t): t is TaskRow => !!t)
  const pickIds = new Set(pickRows.map((t) => t.id))

  const todayRows = Object.keys(planned)
    .map((id) => byId.get(id))
    // A milestone is a dated rule, never planned (Rule 86): a stray mark changes nothing.
    .filter((t): t is TaskRow => !!t && !isDone(t) && !isMilestone(t))
    .sort(byRank)
  const todayIds = new Set(todayRows.map((t) => t.id))

  // A new plan clears Done (Nick, 2026-11-05: "whenever I replan that section all the
  // done things go"), so what was finished before it was answered is gone from here.
  const planAt = plan?.at ? Date.parse(plan.at) : NaN
  const beforePlan = (t: TaskRow) => !isNaN(planAt) && !!t.completed_at && parseDbUtc(t.completed_at).getTime() <= planAt

  const finishedToday = tasks
    .filter((t) => !pickIds.has(t.id) && isDone(t) && !beforePlan(t) && t.planned_for?.slice(0, 10) === today
      && !isMilestone(t) && !isQuestionTask(t) && !isApprovalPending(t) && !isApprovalTriaged(t))
    .sort(byRank)

  const model: PlanSectionModel = {
    today: todayRows,
    picks: pickRows.filter((t) => !isDone(t) && !todayIds.has(t.id)),
    done: [...pickRows.filter(isDone), ...finishedToday],
    ids: new Set(),
  }
  for (const t of [...model.today, ...model.picks, ...model.done]) model.ids.add(t.id)
  return model
}

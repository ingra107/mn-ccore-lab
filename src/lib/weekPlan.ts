// weekPlan.ts -- a week's plan, browser side (v1 contract: PB
// Context/Decisions/2026-10-30-planning-conversation.md). The vocabulary and
// validators are shared/weekPlan.ts, the same code the Worker judges with. Plans
// are made in a live session (the Plan button, hooks/usePlanControl.tsx); this
// file reads them back and takes the one follow-up write, Prep on a saved pick.

import type { TaskRow } from './api'
import { isTaskDone, questionCardState } from './taskGrouping'
import { nowInstant } from './time'
import {
  WEEK_PLAN_SOURCE, PACKET_DAILY_CAP, WEEK_PLAN_CHOICE_START, civilPlusDays, parseWeekPlanPicks, parseWeekPlanSpec, weekPlanEnd, weekPlanWithdrawn,
  type WeekPlanPick, type WeekPlanSpec,
} from '../../shared/weekPlan'

export function isWeekPlan(t: { source?: string | null; kind?: string | null }): boolean {
  return t.source === WEEK_PLAN_SOURCE && t.kind === 'question'
}

/** A pick kept from an EARLIER answered plan of the same week, with that
 *  plan's own row and spec (its direction reads from its own spec). Read-only:
 *  it is started or done, so no follow-up write can target it. */
export interface EarlierPick {
  pick: WeekPlanPick
  task: TaskRow
  spec: WeekPlanSpec
}

export interface AcceptedWeekPlan {
  task: TaskRow
  spec: WeekPlanSpec
  picks: WeekPlanPick[]
  /** The answer's `at`, for picking the newest plan. */
  at: string
  /** "Today forward" (Nick 2026-11-01): earlier plans' started picks this week
   *  that are still open, for tasks the newest plan does not pick. */
  earlier: EarlierPick[]
  /** Task ids any answered plan of this week took off (2026-11-04): Nick's
   *  "not this week", even for a pick prep had started. They are not in
   *  `earlier`; the session's brief reads them to not offer them again. */
  withdrawn: string[]
}

/** The Sunday line: from 16:00 Chicago a Sunday asks about the week ahead. */
const NUDGE_ZONE = 'America/Chicago'
const NUDGE_SUNDAY_HOUR = 16

/**
 * The week the Plan your week nudge is about at this instant, ignoring whether
 * it is planned: from Sunday 16:00 Chicago through the next Saturday, the week
 * starting that Monday. Sunday before 16:00 is null, the last day of a week
 * asks about neither week. It names the week a session started then would plan
 * (PB week_plan.week_start_for), with one difference by design: a press on
 * Sunday morning does plan next week, but nothing asks him to yet.
 *
 * Chicago for every viewer, as the Sunday job was: the rule is Nick's week, not
 * the browser's zone.
 */
export function planNudgeTargetWeek(nowIso: string): string | null {
  const at = new Date(nowIso)
  if (isNaN(at.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NUDGE_ZONE, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const day = `${part('year')}-${part('month')}-${part('day')}`
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'))
  if (weekday === 0) return Number(part('hour')) >= NUDGE_SUNDAY_HOUR ? civilPlusDays(day, 1) : null
  return civilPlusDays(day, 1 - weekday)
}

/** An answered (or acted-on) plan of exactly this week exists. By week_start, not
 *  through currentWeekPlan: its window holds two weeks on a Sunday, which is the
 *  evening this question matters. Same parse, so a row it would skip counts for
 *  nothing here either; an answer that only withdraws is still a plan. */
function weekIsPlanned(tasks: readonly TaskRow[], week: string): boolean {
  return tasks.some((t) => {
    if (!isWeekPlan(t)) return false
    const state = questionCardState(t)
    if (state !== 'answered' && state !== 'acted') return false
    const spec = parseWeekPlanSpec(t.question_spec_json)
    return spec?.week_start === week && parseWeekPlanPicks(t.question_answer_json, spec) !== null
  })
}

/**
 * The week_start that needs a plan, or null. Computed on read, with no job and
 * no row behind it: hand it every live week_plan row (isQuestionOnCard keeps
 * them for this). The gold row reads it through hooks/usePlanNudgeWeek.ts.
 */
export function planNudgeWeek(tasks: readonly TaskRow[], nowIso: string = nowInstant()): string | null {
  const week = planNudgeTargetWeek(nowIso)
  return week !== null && !weekIsPlanned(tasks, week) ? week : null
}

/** "Nov 9 to Nov 15", in the viewer's locale. */
export function weekRangeLabel(start: string): string {
  const fmt = (c: string) => {
    const [y, m, d] = c.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return `${fmt(start)} to ${fmt(weekPlanEnd(start))}`
}

/**
 * The week plan This week shows: the newest answered (or acted-on) week_plan
 * whose window [week_start - 1, week_start + 6] holds `today`. The day before
 * counts because a Sunday session plans the week that starts Monday, and an
 * answer given that evening must not vanish until morning.
 * Null when there is none, and then Planned today shows as before. A plan
 * whose spec or picks do not parse is skipped, never half-shown.
 *
 * A week planned twice (a second session mid-week) has more than one answered
 * plan. Nick's ruling: "This week keeps the earlier plan's started or finished
 * picks, read-only, marked 'earlier plan'", then 2026-11-04 (#167): "earlier
 * plan stuff that is COMPLETED should drop off". So `earlier` carries every pick
 * of an older answered plan of the SAME week_start that was started (start:true)
 * and whose task is still open, when the newest plan does not pick that task;
 * the newest earlier plan wins a task named twice. Computed on read: nothing is
 * copied into a spec, so the plans cannot drift apart. A saved pick that was
 * never started is not carried: PB offered it again ("from what is still
 * open"), and the newest plan's answer is the decision on it. A pick whose task
 * row is gone (deleted) has nothing left to show either.
 */
export function currentWeekPlan(tasks: TaskRow[], today: string): AcceptedWeekPlan | null {
  const plans: (Omit<AcceptedWeekPlan, 'earlier' | 'withdrawn'> & { withdrawn: string[] })[] = []
  for (const t of tasks) {
    if (!isWeekPlan(t)) continue
    const state = questionCardState(t)
    if (state !== 'answered' && state !== 'acted') continue
    const spec = parseWeekPlanSpec(t.question_spec_json)
    if (!spec || today < civilPlusDays(spec.week_start, -1) || today > weekPlanEnd(spec.week_start)) continue
    const picks = parseWeekPlanPicks(t.question_answer_json, spec)
    if (!picks) continue
    let at = ''
    try { at = String((JSON.parse(t.question_answer_json ?? '{}') as { at?: unknown }).at ?? '') } catch { /* parsed above */ }
    plans.push({ task: t, spec, picks, at, withdrawn: weekPlanWithdrawn(t.question_answer_json) })
  }
  if (plans.length === 0) return null
  plans.sort((a, b) => (a.at === b.at ? 0 : a.at > b.at ? -1 : 1))
  const [best, ...older] = plans
  const byId = new Map(tasks.map((t) => [t.id, t]))
  // A withdrawal holds against every OLDER plan's pick; a newer plan that
  // picks the task again wins (its pick is in `taken` or the main list).
  const taken = new Set([...best.picks.map((p) => p.task_id), ...best.withdrawn])
  const withdrawn = new Set(best.withdrawn)
  const earlier: EarlierPick[] = []
  for (const plan of older) {
    if (plan.spec.week_start !== best.spec.week_start) continue
    for (const pick of plan.picks) {
      if (taken.has(pick.task_id)) continue
      const row = byId.get(pick.task_id)
      if (!pick.start || !row || isTaskDone(row)) continue
      taken.add(pick.task_id)
      earlier.push({ pick, task: plan.task, spec: plan.spec })
    }
    for (const id of plan.withdrawn) { taken.add(id); withdrawn.add(id) }
  }
  return { task: best.task, spec: best.spec, picks: best.picks, at: best.at, earlier, withdrawn: [...withdrawn] }
}

export type AnswerResult =
  | { ok: true }
  | { ok: false; code: 'daily_cap'; used: number; cap: number; error: string }
  | { ok: false; code: string | null; error: string }

/**
 * Write the answer through the question-answer route (POST /api/tasks/:id,
 * question_answer_json). Not useUpdateTask: the cap refusal's body
 * ({code:'daily_cap', used, cap}) is what This week shows, and the generic
 * client keeps only the message.
 */
export async function postWeekPlanAnswer(taskId: string, answer: Record<string, unknown>): Promise<AnswerResult> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_answer_json: answer }),
  })
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => ({})) as { error?: string; code?: string; used?: number; cap?: number }
  if (body.code === 'daily_cap') {
    return { ok: false, code: 'daily_cap', used: body.used ?? PACKET_DAILY_CAP, cap: body.cap ?? PACKET_DAILY_CAP, error: body.error ?? 'daily cap' }
  }
  // A deleted offer (PB's supersede retired it while the page was open) is a
  // 404 at the route's guard (api/routes/tasks.ts guardTaskProject reads
  // deleted_at IS NULL), with no code in the body.
  if (res.status === 404) return { ok: false, code: 'not_found', error: body.error ?? 'Task not found' }
  return { ok: false, code: body.code ?? null, error: body.error ?? res.statusText }
}

/** The tag a pick shows for its packet. */
export function pickTag(task: TaskRow | undefined, started: boolean): { label: string; cls: string } | null {
  if (task && isTaskDone(task)) return { label: 'Done', cls: 'tk-n' }
  if (task?.packet_state === 'ready') return { label: 'Ready', cls: 'tk-ac' }
  if (task?.packet_state === 'changed') return { label: 'Changed', cls: 'tk-stale' }
  if (task?.packet_state === 'unverified') return { label: 'Check it', cls: 'tk-stale' }
  return started ? { label: 'Preparing', cls: 'tk-n' } : { label: 'Saved', cls: 'tk-n' }
}

/**
 * The one follow-up write a stored week plan takes: the same answer with the
 * named saved pick flipped start false -> true, and choice 'start' (Worker:
 * questionAnswerFrozenError + weekPlanFlipError). Everything else in the
 * stored answer is sent back unchanged, byte for byte where it parses.
 * Null when the stored answer does not parse or the pick is already started.
 */
export function startFlipAnswer(task: TaskRow, taskId: string): Record<string, unknown> | null {
  let stored: Record<string, unknown>
  try { stored = JSON.parse(task.question_answer_json ?? '') as Record<string, unknown> } catch { return null }
  if (!stored || !Array.isArray(stored.picks)) return null
  const picks = stored.picks as Array<Record<string, unknown>>
  const i = picks.findIndex((p) => p.task_id === taskId)
  if (i < 0 || picks[i].start !== false) return null
  return { ...stored, choice: WEEK_PLAN_CHOICE_START, picks: picks.map((p, j) => (j === i ? { ...p, start: true } : p)) }
}

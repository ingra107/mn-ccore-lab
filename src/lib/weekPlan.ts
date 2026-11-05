// weekPlan.ts -- a week's plan, browser side (v1 contract: PB
// Context/Decisions/2026-10-30-planning-conversation.md). The vocabulary and
// validators are shared/weekPlan.ts, the same code the Worker judges with. Plans
// are made in a live session (the Plan button, hooks/usePlanControl.tsx); this
// file reads them back and takes the one follow-up write, Prep on a saved pick.

import type { TaskRow } from './api'
import { isTaskDone, questionCardState } from './taskGrouping'
import { civilFromInstant, nowInstant, zoneWeekdayHour } from './time'
import {
  WEEK_PLAN_SOURCE, PACKET_DAILY_CAP, WEEK_PLAN_CHOICE_START, civilPlusDays, parseWeekPlanPicks, parseWeekPlanSpec, weekPlanEnd, weekPlanKept, weekPlanWithdrawn,
  type StepOwner, type WeekPlanPick, type WeekPlanSpec,
} from '../../shared/weekPlan'

export function isWeekPlan(t: { source?: string | null; kind?: string | null }): boolean {
  return t.source === WEEK_PLAN_SOURCE && t.kind === 'question'
}

export interface AcceptedWeekPlan {
  task: TaskRow
  spec: WeekPlanSpec
  picks: WeekPlanPick[]
  /** The answer's `at`, for picking the newest plan. */
  at: string
  /** Task ids any answered plan of this week took off (2026-11-04): Nick's
   *  "not this week", even for a pick prep had started. The session's brief
   *  reads them to not offer them again. */
  withdrawn: string[]
  /** This plan's picks carried from the plan before (2026-11-04): their first
   *  answer made no request and no note, whatever their start reads. A later Prep
   *  on a kept saved pick is a real start, so `start` does not say which is which,
   *  and `kept` is frozen across that flip, so kept + start cannot say it either:
   *  the stored answer can't tell a carried start from a real one (pickTag's `carried`). */
  kept: string[]
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
  if (isNaN(new Date(nowIso).getTime())) return null
  const day = civilFromInstant(nowIso, NUDGE_ZONE)
  const { weekday, hour } = zoneWeekdayHour(nowIso, NUDGE_ZONE)
  if (weekday === 0) return hour >= NUDGE_SUNDAY_HOUR ? civilPlusDays(day, 1) : null
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

/** The week a session started at this instant would plan (PB
 *  week_plan.week_start_for): this Monday, or on any Sunday the next one. */
export function sessionWeekStart(nowIso: string): string {
  const day = civilFromInstant(nowIso, NUDGE_ZONE)
  const { weekday } = zoneWeekdayHour(nowIso, NUDGE_ZONE)
  return civilPlusDays(day, weekday === 0 ? 1 : 1 - weekday)
}

/** That week already has a plan, so the button offers Replan, not Plan week. Same
 *  reading of a stored plan as the gold row (weekIsPlanned), and the same list. */
export function sessionWeekPlanned(tasks: readonly TaskRow[], nowIso: string = nowInstant()): boolean {
  return weekIsPlanned(tasks, sessionWeekStart(nowIso))
}

/**
 * The week_start that needs a plan, or null. Computed on read, with no job and
 * no row behind it, so a row missing from `tasks` reads as "not planned": hand
 * it every live week_plan row of the owner's own full list (isQuestionOnCard
 * keeps them for this) and nothing less. The gold row reads it through
 * hooks/usePlanNudgeWeek.ts, and only where QuestionsCard's planNudge says the
 * page read that list.
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
 * The week plan the Plan section shows: the newest answered (or acted-on)
 * week_plan whose window [week_start - 1, week_start + 6] holds `today`. The day
 * before counts because a Sunday session plans the week that starts Monday, and
 * an answer given that evening must not vanish until morning.
 * Null when there is none. A plan whose spec or picks do not parse is skipped,
 * never half-shown.
 *
 * A week planned twice has more than one answered plan, and the newest is the
 * whole plan: every open pick has a card on the next round, so a pick the newest
 * answer does not hold was finished or left. `withdrawn` stays the union of the
 * week's answers, so a task taken off is not offered again that week.
 */
export function currentWeekPlan(tasks: TaskRow[], today: string): AcceptedWeekPlan | null {
  const plans: AcceptedWeekPlan[] = []
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
    plans.push({ task: t, spec, picks, at, withdrawn: weekPlanWithdrawn(t.question_answer_json), kept: weekPlanKept(t.question_answer_json) })
  }
  if (plans.length === 0) return null
  plans.sort((a, b) => (a.at === b.at ? 0 : a.at > b.at ? -1 : 1))
  const [best, ...older] = plans
  const withdrawn = new Set(best.withdrawn)
  for (const plan of older) {
    if (plan.spec.week_start !== best.spec.week_start) continue
    for (const id of plan.withdrawn) withdrawn.add(id)
  }
  return { ...best, withdrawn: [...withdrawn] }
}

export type AnswerResult =
  | { ok: true }
  | { ok: false; code: 'daily_cap'; used: number; cap: number; error: string }
  | { ok: false; code: string | null; error: string }

/**
 * Write the answer through the question-answer route (POST /api/tasks/:id,
 * question_answer_json). Not useUpdateTask: the cap refusal's body
 * ({code:'daily_cap', used, cap}) is what the Plan section shows, and the generic
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

/** The tag a pick shows for its packet. `carried`: a start this plan only kept, which
 *  queued nothing, so with no live packet there is no background work to claim. */
export function pickTag(task: TaskRow | undefined, started: boolean, carried = false, owner: StepOwner | null = null): { label: string; cls: string } | null {
  if (task && isTaskDone(task)) return { label: 'Done', cls: 'tk-n' }
  if (task?.packet_state === 'ready') return { label: 'Ready', cls: 'tk-ac' }
  if (task?.packet_state === 'changed') return { label: 'Changed', cls: 'tk-stale' }
  if (task?.packet_state === 'unverified') return { label: 'Check it', cls: 'tk-stale' }
  // A real Prep press: the listener has it, so this says that before it says whose it is.
  if (started && !carried) return { label: 'Preparing', cls: 'tk-n' }
  if (owner === 'nick') return { label: 'Yours', cls: 'tk-ac' }
  if (owner === 'claude') return { label: 'With Claude', cls: 'tk-n' }
  if (started) return null
  return { label: 'Saved', cls: 'tk-n' }
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

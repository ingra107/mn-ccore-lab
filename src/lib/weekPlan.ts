// weekPlan.ts -- the planning conversation, browser side (v1 contract: PB
// Context/Decisions/2026-10-30-planning-conversation.md). The vocabulary and
// validators are shared/weekPlan.ts, the same code the Worker judges with, so
// the panel cannot build an answer the Hub would refuse for its shape.

import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TaskRow } from './api'
import { isTaskDone, questionCardState } from './taskGrouping'
import {
  WEEK_PLAN_SOURCE, PACKET_DAILY_CAP, WEEK_PLAN_CHOICE_START, civilPlusDays, parseWeekPlanPicks, parseWeekPlanSpec, weekPlanEnd, weekPlanWithdrawn,
  REPLAN_UNCLAIMED_S, type ReplanState, type WeekPlanPick, type WeekPlanSpec,
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
   *  `earlier`; the Sunday job and the brief read them to not offer them again. */
  withdrawn: string[]
}

/**
 * The week plan This week shows: the newest answered (or acted-on) week_plan
 * whose window [week_start - 1, week_start + 6] holds `today`. The day before
 * counts because the offer arrives Sunday evening for the week that starts
 * Monday, and an answer given that evening must not vanish until morning.
 * Null when there is none, and then Planned today shows as before. A plan
 * whose spec or picks do not parse is skipped, never half-shown.
 *
 * After a mid-week Re-plan (2026-11-01) the week has more than one answered
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

export interface DailyPacketCount { date: string; used: number; cap: number }

/** GET /api/packets/daily-count: Nick only. Null for anyone else (403), so the
 *  panel shows no cap rather than a wrong one. */
export async function fetchDailyPacketCount(date?: string): Promise<DailyPacketCount | null> {
  const res = await fetch(`/api/packets/daily-count${date ? `?date=${encodeURIComponent(date)}` : ''}`)
  if (res.status === 403) return null
  if (!res.ok) throw new Error(`daily count: ${res.status}`)
  return res.json() as Promise<DailyPacketCount>
}

export function useDailyPacketCount(enabled = true) {
  return useQuery({
    queryKey: ['packets', 'daily-count'],
    queryFn: () => fetchDailyPacketCount(),
    enabled,
    staleTime: 30_000,
  })
}

export type AnswerResult =
  | { ok: true }
  | { ok: false; code: 'daily_cap'; used: number; cap: number; error: string }
  | { ok: false; code: string | null; error: string }

/**
 * Write the answer through the question-answer route (POST /api/tasks/:id,
 * question_answer_json). Not useUpdateTask: the cap refusal's body
 * ({code:'daily_cap', used, cap}) is what the panel shows, and the generic
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
  // A deleted offer (PB's supersede retired it while the panel was open) is a
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

// ── Re-plan (2026-11-01, PB Scratch/plans/2026-11-01-replan-RECONCILED.md) ──

/** GET /api/week-plan/replan: the latest re-plan request, null when there is
 *  none, 'forbidden' for anyone but Nick (the button is then not shown). */
export async function fetchReplan(): Promise<ReplanState | null | 'forbidden'> {
  const res = await fetch('/api/week-plan/replan')
  if (res.status === 403) return 'forbidden'
  if (!res.ok) throw new Error(`re-plan state: ${res.status}`)
  return ((await res.json()) as { data: ReplanState | null }).data
}

export type ReplanPress = { ok: true } | { ok: false; pending: boolean; error: string }

/** POST /api/week-plan/replan. A 409 replan_pending is not an error to show:
 *  the button re-reads the state and shows Queued. */
export async function postReplan(): Promise<ReplanPress> {
  const res = await fetch('/api/week-plan/replan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => ({})) as { error?: string; code?: string }
  return { ok: false, pending: body.code === 'replan_pending', error: body.error ?? res.statusText }
}

/** Unclaimed this long and the PB listener has not picked the press up (an
 *  old listener after a Hub-first deploy does not name week_replan). The
 *  same number the Worker uses to let a new press replace the stale row. */
export const REPLAN_UNCLAIMED_WARN_S = REPLAN_UNCLAIMED_S
/** A finished re-plan's line stays under the button this long. */
export const REPLAN_RESULT_SHOWN_S = 12 * 3600

/**
 * The Re-plan control, derived from the latest request row and whether a new
 * offer waits (newestWaitingWeekPlan). Every state is either pressable or
 * visibly disabled with the reason on it; nothing looks clickable and does
 * nothing. A press while an offer waits is allowed: the new run supersedes it.
 */
export type ReplanButton =
  | { kind: 'unknown'; enabled: false; label: 'Re-plan'; note: string }
  | { kind: 'ready'; enabled: true; label: 'Re-plan'; note: string | null; failed: boolean }
  | { kind: 'queued'; enabled: false; label: 'Queued'; note: string; stuck: false }
  | { kind: 'queued'; enabled: true; label: 'Try again'; note: string; stuck: true }
  | { kind: 'preparing'; enabled: false; label: 'Preparing...'; note: string }

export const PLAN_WAITING_NOTE = 'A new plan is waiting in Needs you.'

export function replanButtonState(latest: ReplanState | null | undefined, offerWaiting: boolean, readFailed = false): ReplanButton {
  if (latest === undefined) {
    return { kind: 'unknown', enabled: false, label: 'Re-plan', note: readFailed ? 'Could not read the re-plan state. Reload to try again.' : 'Checking whether a re-plan is already queued' }
  }
  if (latest?.status === 'pending' && latest.claimed) {
    return { kind: 'preparing', enabled: false, label: 'Preparing...', note: 'PB is writing a new plan for today through Sunday' }
  }
  if (latest?.status === 'pending') {
    // No live lease (never claimed, released, or the worker died holding it)
    // and at or past the Worker's limit: a new press replaces the row
    // (api/lib/week-plan-replan.ts REPLACEABLE_SQL, the same predicate), so
    // the button is pressable again (>= matches the Worker's <=).
    if (latest.age_s >= REPLAN_UNCLAIMED_WARN_S) {
      return {
        kind: 'queued', enabled: true, label: 'Try again', stuck: true,
        note: 'PB has not picked this up, or stopped working on it. Its listener may be off, or not restarted since the last update.',
      }
    }
    return { kind: 'queued', enabled: false, label: 'Queued', stuck: false, note: 'Waiting for a PB laptop to pick this up' }
  }
  if (offerWaiting) return { kind: 'ready', enabled: true, label: 'Re-plan', note: PLAN_WAITING_NOTE, failed: false }
  const recent = latest && latest.age_s <= REPLAN_RESULT_SHOWN_S ? latest : null
  if (recent?.status === 'failed') {
    // PB's own refusals already read "Not re-planned: ..." (replan_adapter.py).
    const why = recent.response ?? 'no reason given'
    return { kind: 'ready', enabled: true, label: 'Re-plan', note: why.startsWith('Not re-planned') ? why : `Not re-planned: ${why}`, failed: true }
  }
  if (recent?.status === 'completed' && recent.response && !recent.response.startsWith('Offered')) {
    return { kind: 'ready', enabled: true, label: 'Re-plan', note: recent.response, failed: false }
  }
  return { kind: 'ready', enabled: true, label: 'Re-plan', note: null, failed: false }
}

/** The latest re-plan request, polled while one is pending; when it settles,
 *  the task list is re-read so the new offer shows in Needs you. */
export function useReplan(enabled = true) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['week-plan', 'replan'],
    queryFn: fetchReplan,
    enabled,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const d = query.state.data
      return d && d !== 'forbidden' && d.status === 'pending' ? 15_000 : false
    },
  })
  const forbidden = q.data === 'forbidden'
  const data = q.data === 'forbidden' ? undefined : q.data
  const seen = useRef<string | null>(null)
  const key = data ? `${data.id}:${data.status}` : null
  const settled = data ? data.status !== 'pending' : false
  useEffect(() => {
    if (seen.current !== null && key !== null && key !== seen.current && settled) {
      qc.invalidateQueries({ queryKey: ['tasks'] })
    }
    seen.current = key
  }, [key, settled, qc])
  const press = useCallback(async (): Promise<ReplanPress> => {
    const r = await postReplan()
    await qc.invalidateQueries({ queryKey: ['week-plan', 'replan'] })
    return r
  }, [qc])
  // A failed read is shown as 'unknown' (disabled, says why) rather than as a
  // pressable button over a state we could not see.
  return { latest: q.isError ? undefined : data, error: q.isError, forbidden, press }
}

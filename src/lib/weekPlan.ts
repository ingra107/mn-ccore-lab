// weekPlan.ts -- the planning conversation, browser side (v1 contract: PB
// Context/Decisions/2026-10-30-planning-conversation.md). The vocabulary and
// validators are shared/weekPlan.ts, the same code the Worker judges with, so
// the panel cannot build an answer the Hub would refuse for its shape.

import { useQuery } from '@tanstack/react-query'
import type { TaskRow } from './api'
import { isTaskDone, questionCardState } from './taskGrouping'
import {
  WEEK_PLAN_SOURCE, PACKET_DAILY_CAP, WEEK_PLAN_CHOICE_START, civilPlusDays, parseWeekPlanPicks, parseWeekPlanSpec, weekPlanEnd,
  type WeekPlanPick, type WeekPlanSpec,
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
}

/**
 * The week plan This week shows: the newest answered (or acted-on) week_plan
 * whose window [week_start - 1, week_start + 6] holds `today`. The day before
 * counts because the offer arrives Sunday evening for the week that starts
 * Monday, and an answer given that evening must not vanish until morning.
 * Null when there is none, and then Planned today shows as before. A plan
 * whose spec or picks do not parse is skipped, never half-shown.
 */
export function currentWeekPlan(tasks: TaskRow[], today: string): AcceptedWeekPlan | null {
  let best: AcceptedWeekPlan | null = null
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
    if (!best || at > best.at) best = { task: t, spec, picks, at }
  }
  return best
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

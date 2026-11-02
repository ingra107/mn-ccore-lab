// When Claude will act on an answered question (2026-11-02).
//
// Nick, looking at three answered questions still on the gold Needs you card:
// "i technically answered these things... so what happens now. it still says
// these things need me." He picked "Act fast, show a quiet line": an answered
// row leaves the gold count and shows as ONE muted line under Needs you,
// "N answers: Claude acts by <time>". This file is where <time> comes from.
//
// Each rule mirrors the PB lane that consumes that source (PB
// enums.QUESTION_CONSUMERS) and its schedule (PB scripts/scheduled/schedule.json).
// It is a hand mirror, so it can drift: when a time passes with the row still
// answered the line says Claude is late rather than going quiet, and the
// expanded rows keep their stale age marker. A source with no rule here
// (response_required: whoever acts on it, a live session) gives null, and the
// line falls back to "Claude is acting on N answers". Times are the browser's
// local clock, which is the home machine's (America/Chicago) when Nick is home.
//
//   upstream_brief  skip / byhand / other: hub_ai_listener runs the consumer
//                   every UPSTREAM_ANSWER_EVERY_MIN (PB UPSTREAM_ANSWERS_EVERY_S),
//                   around the clock. adopt: the build runs in upstream-adopt,
//                   daily 04:25, up to an hour.
//   fix_approval    yes ("Build it"): the 05:30 process-headless-sweep, up to an
//                   hour. no: the 15-minute process-headless poll, 06:00-22:00.
//                   Other: a live /process, so no time.
//   meeting_match   meeting-extract-worker, every 30 min, 06:00-23:30.
//   nightly_work_product  02:15 daily, reading the 02:00 pull.

import { nowInstant, parseDbUtc } from './time'

/** PB hub_ai_listener.UPSTREAM_ANSWERS_EVERY_S / 60. Change both together. */
export const UPSTREAM_ANSWER_EVERY_MIN = 5

type Rule =
  /** A loop that runs every `every` minutes inside a local window. */
  | { every: number; window?: [string, string]; slack: number }
  /** A daily run at `at`; an answer must land before `cutoff` (default `at`). */
  | { daily: string; cutoff?: string; slack: number }

const RULES: Record<string, (choice: string) => Rule | null> = {
  upstream_brief: (c) => (c === 'adopt' ? { daily: '04:25', slack: 60 } : { every: UPSTREAM_ANSWER_EVERY_MIN, slack: 2 }),
  fix_approval: (c) => (c === 'yes' ? { daily: '05:30', slack: 60 } : c === 'no' ? { every: 15, window: ['06:00', '22:00'], slack: 5 } : null),
  meeting_match: () => ({ every: 30, window: ['06:00', '23:30'], slack: 10 }),
  nightly_work_product: () => ({ daily: '02:15', cutoff: '02:00', slack: 40 }),
}

function atLocal(base: Date, hhmm: string, addDays = 0): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + addDays, h, m, 0, 0)
}

const addMin = (d: Date, min: number) => new Date(d.getTime() + min * 60000)

function etaFrom(rule: Rule, at: Date): Date {
  if ('daily' in rule) {
    const cutoff = atLocal(at, rule.cutoff ?? rule.daily)
    const day = at < cutoff ? 0 : 1
    return addMin(atLocal(at, rule.daily, day), rule.slack)
  }
  if (rule.window) {
    const open = atLocal(at, rule.window[0])
    const close = atLocal(at, rule.window[1])
    if (at < open) return addMin(open, rule.every + rule.slack)
    if (at >= close) return addMin(atLocal(at, rule.window[0], 1), rule.every + rule.slack)
  }
  return addMin(at, rule.every + rule.slack)
}

/** The latest instant the consuming lane should have acted on this answer,
 *  or null when no lane has a known schedule (or the answer is unreadable). */
export function answerActsBy(t: { source?: string | null; question_answer_json?: string | null }): Date | null {
  let a: { choice?: unknown; at?: unknown }
  try {
    a = JSON.parse(t.question_answer_json ?? 'null') ?? {}
  } catch {
    return null
  }
  if (typeof a.choice !== 'string' || typeof a.at !== 'string') return null
  const at = parseDbUtc(a.at)
  if (isNaN(at.getTime())) return null
  const rule = RULES[t.source ?? '']?.(a.choice) ?? null
  return rule ? etaFrom(rule, at) : null
}

/** "5:25 AM", "tomorrow 5:25 AM", or "Wed 5:25 AM", against `now`. */
export function actsByLabel(d: Date, now: Date): string {
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(d) - day(now)) / 86400000)
  if (diff === 0) return time
  if (diff === 1) return `tomorrow ${time}`
  if (diff === -1) return `yesterday ${time}`
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`
}

export type AnsweredLine = { text: string; late: boolean }

/** The one muted line for N answered-not-acted-on rows. */
export function answeredLine(rows: Array<{ source?: string | null; question_answer_json?: string | null }>,
  nowIso: string = nowInstant()): AnsweredLine {
  const n = rows.length
  const noun = n === 1 ? '1 answer' : `${n} answers`
  const etas = rows.map(answerActsBy)
  if (n === 0 || etas.some((e) => e === null)) return { text: `Claude is acting on ${noun}`, late: false }
  const latest = new Date(Math.max(...etas.map((e) => e!.getTime())))
  const now = new Date(nowIso)
  if (latest < now) return { text: `${noun}: Claude is late, was due ${actsByLabel(latest, now)}`, late: true }
  return { text: `${noun}: Claude acts by ${actsByLabel(latest, now)}`, late: false }
}

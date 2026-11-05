// shared/weekPlan.ts -- the planning conversation's v1 contract, the ONE
// vocabulary for the API (api/lib/task-question.ts validates it,
// api/lib/week-plan-start.ts acts on it) and the UI (the This week section).
//
// Nick, 2026-10-29: "you're asking me questions about what things do you want
// to take the next step on and then I would click which ones and then you
// could offer me four different options for each one that I chose ... and
// then you could get started on those things". Decision (the fixed v1
// contract): PB Context/Decisions/2026-10-30-planning-conversation.md.
//
// A weekly offer is ONE kind='question' task row with source 'week_plan'. Its
// question_spec_json is a WeekPlanSpec; its answer is the ordinary v1 answer
// plus a typed `picks` array. Picks never ride in free text.
//
// PB mirrors these rules in scripts/questions/state.py; the two validators
// must agree, so every rule below is stated in words in the function that
// holds it.

import { DELIVERABLE_KINDS, type DeliverableKind } from './packets'

/** tasks.source of a weekly offer. */
export const WEEK_PLAN_SOURCE = 'week_plan'
/** ai_requests.source_type of a started pick. */
export const PACKET_PREPARE_SOURCE_TYPE = 'packet_prepare'
/**
 * The LANE sources: ai_requests rows that are not questions. Each is made only
 * by its own Hub route, answered by a PB runner with a status line (no
 * comment, no notification), lands private for Nick, and is listed or claimed
 * only by a listener that names it in `accepts` (an older listener would
 * answer it as a public Hermes reply). Declared once here; api/routes/
 * ai-requests.ts reads it at every lane seam. PB's twin is
 * scripts/scheduled/hub_ai_listener.py LANE_SOURCES (parity-tested from PB).
 */
export const LANE_SOURCE_TYPES = [PACKET_PREPARE_SOURCE_TYPE] as const
export type LaneSourceType = (typeof LANE_SOURCE_TYPES)[number]
export function isLaneSourceType(v: unknown): v is LaneSourceType {
  return (LANE_SOURCE_TYPES as readonly unknown[]).includes(v)
}
/**
 * Lanes that no longer exist: `week_replan`, the Re-plan button, retired
 * 2026-11-04. No route makes one and no listener runs one, but its rows stay in
 * ai_requests. Without this a row still pending at cutover would stop being a
 * lane row, reach every listener's queue and be answered as a Hermes question,
 * and a raw POST of the type would be accepted. So it stays hidden from every
 * caller, named or not, and stays refused.
 */
export const RETIRED_LANE_SOURCE_TYPES = ['week_replan'] as const
export function isRetiredLaneSourceType(v: unknown): boolean {
  return (RETIRED_LANE_SOURCE_TYPES as readonly unknown[]).includes(v)
}
/** Packets a day may start, across the 05:15 job and Start, counted on the Hub. */
export const PACKET_DAILY_CAP = 10
/** Options a candidate offers. One is a carried pick with no fresh step
 *  (2026-11-04): its only option is its current step. */
export const WEEK_PLAN_MIN_OPTIONS = 1
export const WEEK_PLAN_MAX_OPTIONS = 4
/** Answer choices the Hub UI writes: `start` when any pick starts, else `save`.
 *  Not enforced (the spec has no `choices` list); readers act on `picks`. */
export const WEEK_PLAN_CHOICE_START = 'start'
export const WEEK_PLAN_CHOICE_SAVE = 'save'

export interface WeekPlanEvidence { kind: string; ref: string; observed_at: string }

/** Who does a step: Claude (a packet it prepares) or Nick (his own move). */
export type StepOwner = 'claude' | 'nick'
export const STEP_OWNERS: readonly StepOwner[] = ['claude', 'nick']
const isStepOwner = (v: unknown): v is StepOwner => (STEP_OWNERS as readonly unknown[]).includes(v)

export interface WeekPlanOption {
  key: string
  label: string
  direction: string
  deliverable_kind: DeliverableKind
  recommended: boolean
  /** Who does this step. Absent on a plan made before owners existed. */
  owner?: StepOwner
}

export interface WeekPlanCandidate {
  task_id: string
  title: string
  why: string
  evidence: WeekPlanEvidence[]
  options: WeekPlanOption[]
}

export interface WeekPlanSpec {
  v: 1
  kind: 'week_plan'
  week_start: string
  tz: string
  prompt: string
  expires_at: string | null
  candidates: WeekPlanCandidate[]
}

/** One pick on the answer. At least one of option_key / text is set: an
 *  option, Nick's own text, or both (the text is then a note on the option). */
export interface WeekPlanPick {
  task_id: string
  option_key: string | null
  text: string | null
  start: boolean
  /** Who does a typed pick (an option pick takes its option's owner). */
  owner?: StepOwner
}

/** The payload of one packet_prepare ai_request, carried as JSON in
 *  ai_requests.context. */
export interface PacketPreparePayload {
  v: 1
  task_id: string
  direction: string
  option_key: string | null
  plan_question_id: string
  expected_packet: { id: string; version: number } | null
}

/**
 * The newest-offer rule, the one every reader of week_plan offers shares:
 * offers OF ONE WEEK (weekPlanSpecWeek) are ordered by (created_at, id), and
 * only the NEWEST non-deleted offer of that week counts. PB's supersede
 * (scripts/planning/week_plan.py offer_order, offer_week) keeps that one and
 * deletes the week's other waiting ones; the Worker refuses a first answer to
 * any other of the week (week_plan_superseded), and one past its expires_at
 * (weekPlanExpired). Per week since the 2026-11-01 refuter: a late run for one
 * week must never retire or block a LATER week's offer. A run does delete the
 * waiting offers of EARLIER weeks, which can no longer take an answer.
 */
export function weekPlanOfferNewer(
  a: { created_at?: string | null; id?: string | null },
  b: { created_at?: string | null; id?: string | null },
): boolean {
  const ka = a.created_at ?? ''
  const kb = b.created_at ?? ''
  if (ka !== kb) return ka > kb
  return (a.id ?? '') > (b.id ?? '')
}

/** The week an offer plans (its spec's week_start), or null when the spec
 *  does not parse or carries none. The key of the per-week newest rule. */
export function weekPlanSpecWeek(specJson: string | null | undefined): string | null {
  if (!specJson) return null
  try {
    const spec = JSON.parse(specJson) as unknown
    const ws = typeof spec === 'object' && spec !== null ? (spec as { week_start?: unknown }).week_start : null
    return typeof ws === 'string' && ws !== '' ? ws : null
  } catch {
    return null // total fallback: an unreadable spec belongs to no week
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar date, YYYY-MM-DD. */
export function isCivilDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RX.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function loads(raw: unknown): { ok: true; value: unknown } | { ok: false } {
  if (isObj(raw)) return { ok: true, value: raw }
  if (typeof raw !== 'string') return { ok: false }
  try { return { ok: true, value: JSON.parse(raw) } } catch { return { ok: false } }
}

/**
 * The spec rules (a week_plan question's question_spec_json):
 *   v is 1, kind is 'week_plan', week_start is a real YYYY-MM-DD date, prompt
 *   is a non-empty string; candidates is a non-empty array; each candidate has
 *   a non-empty task_id (unique across candidates) and title; why, when
 *   present, is a string; evidence, when present, is an array; options is an
 *   array of 1 to 4, each with a non-empty key (unique in its candidate),
 *   label and direction, a deliverable_kind from DELIVERABLE_KINDS and a
 *   boolean recommended and, when present, an owner of 'claude' or 'nick';
 *   exactly one option per candidate is recommended.
 *   tz and expires_at are not judged.
 */
export function weekPlanSpecError(raw: unknown): string | null {
  const l = loads(raw)
  if (!l.ok || !isObj(l.value)) return 'a week_plan spec must be a JSON object'
  const s = l.value
  if (s.v !== 1) return 'a week_plan spec needs v=1'
  if (s.kind !== 'week_plan') return "a week_plan spec needs kind='week_plan'"
  if (!isCivilDate(s.week_start)) return 'week_start must be a YYYY-MM-DD date'
  if (!nonEmpty(s.prompt)) return 'prompt must be a non-empty string'
  if (!Array.isArray(s.candidates) || s.candidates.length === 0) return 'candidates must be a non-empty array'
  const ids = new Set<string>()
  for (const [i, c] of s.candidates.entries()) {
    if (!isObj(c)) return `candidates[${i}] must be an object`
    if (!nonEmpty(c.task_id)) return `candidates[${i}].task_id must be a non-empty string`
    if (ids.has(c.task_id)) return `candidates[${i}].task_id ${c.task_id} appears twice`
    ids.add(c.task_id)
    if (!nonEmpty(c.title)) return `candidates[${i}].title must be a non-empty string`
    if (c.why !== undefined && typeof c.why !== 'string') return `candidates[${i}].why must be a string`
    if (c.evidence !== undefined && !Array.isArray(c.evidence)) return `candidates[${i}].evidence must be an array`
    if (!Array.isArray(c.options) || c.options.length < WEEK_PLAN_MIN_OPTIONS || c.options.length > WEEK_PLAN_MAX_OPTIONS) {
      return `candidates[${i}].options must hold ${WEEK_PLAN_MIN_OPTIONS} to ${WEEK_PLAN_MAX_OPTIONS} options`
    }
    const keys = new Set<string>()
    let recommended = 0
    for (const [j, o] of c.options.entries()) {
      const at = `candidates[${i}].options[${j}]`
      if (!isObj(o)) return `${at} must be an object`
      if (!nonEmpty(o.key)) return `${at}.key must be a non-empty string`
      if (keys.has(o.key)) return `${at}.key ${o.key} appears twice`
      keys.add(o.key)
      if (!nonEmpty(o.label)) return `${at}.label must be a non-empty string`
      if (!nonEmpty(o.direction)) return `${at}.direction must be a non-empty string`
      if (!(DELIVERABLE_KINDS as readonly unknown[]).includes(o.deliverable_kind)) {
        return `${at}.deliverable_kind must be one of ${DELIVERABLE_KINDS.join('/')}`
      }
      if (typeof o.recommended !== 'boolean') return `${at}.recommended must be a boolean`
      if (o.owner !== undefined && !isStepOwner(o.owner)) return `${at}.owner must be one of ${STEP_OWNERS.join('/')}`
      if (o.recommended) recommended++
    }
    if (recommended !== 1) return `candidates[${i}] must mark exactly one option recommended (found ${recommended})`
  }
  return null
}

/** The spec, parsed, or null when it breaks weekPlanSpecError's rules. */
export function parseWeekPlanSpec(raw: unknown): WeekPlanSpec | null {
  if (weekPlanSpecError(raw) !== null) return null
  const s = (loads(raw) as { ok: true; value: Record<string, unknown> }).value
  const candidates = (s.candidates as Record<string, unknown>[]).map((c) => ({
    task_id: c.task_id as string,
    title: c.title as string,
    why: typeof c.why === 'string' ? c.why : '',
    evidence: Array.isArray(c.evidence) ? (c.evidence as WeekPlanEvidence[]) : [],
    options: (c.options as Record<string, unknown>[]).map((o) => ({
      key: o.key as string, label: o.label as string, direction: o.direction as string,
      deliverable_kind: o.deliverable_kind as DeliverableKind, recommended: o.recommended as boolean,
      ...(isStepOwner(o.owner) ? { owner: o.owner } : {}),
    })),
  }))
  return {
    v: 1, kind: 'week_plan', week_start: s.week_start as string,
    tz: typeof s.tz === 'string' ? s.tz : 'America/Chicago',
    prompt: s.prompt as string,
    expires_at: typeof s.expires_at === 'string' ? s.expires_at : null,
    candidates,
  }
}

/**
 * The withdrawn rules (the answer's optional `withdrawn`, 2026-11-04): task
 * ids Nick took off This week, even ones prep already started on. Absent is
 * fine. Present, it is an array of distinct non-empty strings. An id need not
 * be a candidate of the offer (a started pick of an earlier plan is not one).
 * PB's twin is scripts/questions/state.py Answer.withdrawn.
 */
export function weekPlanWithdrawnError(answer: unknown): string | null {
  const l = loads(answer)
  if (!l.ok || !isObj(l.value)) return null // the answer's own shape is judged elsewhere
  const w = l.value.withdrawn
  if (w === undefined) return null
  if (!Array.isArray(w) || !w.every(nonEmpty)) return 'withdrawn must be an array of non-empty task id strings'
  if (new Set(w).size !== w.length) return 'withdrawn names a task twice'
  return null
}

/** The task ids the answer withdraws: [] when absent or malformed (a
 *  malformed one is refused by weekPlanWithdrawnError, so none is stored). */
export function weekPlanWithdrawn(answer: unknown): string[] {
  const l = loads(answer)
  if (!l.ok || !isObj(l.value) || weekPlanWithdrawnError(l.value) !== null) return []
  return Array.isArray(l.value.withdrawn) ? [...(l.value.withdrawn as string[])] : []
}

/**
 * The kept rules (the answer's optional `kept`, 2026-11-04): picks the session
 * carried from the plan before, not new ones. On the FIRST answer to its row a
 * kept pick makes no packet_prepare, uses no cap and posts no week plan note
 * (weekPlanNewlyStarted, week-plan-start.ts weekPlanNotes), however its start
 * reads. A later flip of a kept saved pick is a real start: it makes its request
 * and counts toward the cap, and kept stays frozen (Prep must never do nothing).
 * Absent is fine, and an old answer has none. Present, it is an array of distinct
 * non-empty strings, each the task_id of one of this answer's picks.
 * PB's twin is scripts/questions/state.py Answer.kept.
 */
export function weekPlanKeptError(answer: unknown, picks: unknown): string | null {
  const l = loads(answer)
  if (!l.ok || !isObj(l.value)) return null // the answer's own shape is judged elsewhere
  const k = l.value.kept
  if (k === undefined) return null
  if (!Array.isArray(k) || !k.every(nonEmpty)) return 'kept must be an array of non-empty task id strings'
  if (new Set(k).size !== k.length) return 'kept names a task twice'
  const pickIds = new Set(Array.isArray(picks) ? picks.filter(isObj).map((p) => p.task_id) : [])
  for (const id of k) {
    if (!pickIds.has(id)) return `kept names ${id}, which is not a pick of this answer`
  }
  return null
}

/** The task ids the answer keeps: [] when absent or malformed (a malformed one
 *  is refused by weekPlanKeptError, so none is stored). */
export function weekPlanKept(answer: unknown): string[] {
  const l = loads(answer)
  if (!l.ok || !isObj(l.value) || weekPlanKeptError(l.value, l.value.picks) !== null) return []
  return Array.isArray(l.value.kept) ? [...(l.value.kept as string[])] : []
}

/**
 * The cleared rules (the answer's optional `cleared`, 2026-11-05): the finished
 * picks of the plan this answer replaces. Nick: "whenever I replan that section
 * all the done things go". It is the other thing that lets an answer carry no
 * picks, and it rides only such an answer: no picks and nothing withdrawn. Absent
 * is fine. Present, it is an array of distinct non-empty strings. These rules read
 * the answer alone; api/lib/week-plan-start.ts weekPlanClearCheck holds it against
 * the stored plan, so a stray empty answer cannot wipe a live one. It starts nothing.
 * PB's twin is scripts/questions/state.py Answer.cleared.
 */
export function weekPlanClearedError(answer: unknown): string | null {
  const l = loads(answer)
  if (!l.ok || !isObj(l.value)) return null // the answer's own shape is judged elsewhere
  const c = l.value.cleared
  if (c === undefined) return null
  if (!Array.isArray(c) || !c.every(nonEmpty)) return 'cleared must be an array of non-empty task id strings'
  if (new Set(c).size !== c.length) return 'cleared names a task twice'
  const picks = l.value.picks
  if (c.length > 0 && ((Array.isArray(picks) && picks.length > 0) || weekPlanWithdrawn(l.value).length > 0)) {
    return 'cleared rides only an answer with no picks and nothing withdrawn'
  }
  return null
}

/** The task ids the answer clears: [] when absent or malformed (a malformed one
 *  is refused by weekPlanClearedError, so none is stored). */
export function weekPlanCleared(answer: unknown): string[] {
  const l = loads(answer)
  if (!l.ok || !isObj(l.value) || weekPlanClearedError(l.value) !== null) return []
  return Array.isArray(l.value.cleared) ? [...(l.value.cleared as string[])] : []
}

/** Whether this answer may hold no picks: it withdraws or clears something. */
export function weekPlanAllowsEmptyPicks(answer: unknown): boolean {
  return weekPlanWithdrawn(answer).length > 0 || weekPlanCleared(answer).length > 0
}

/**
 * The picks rules (the answer's `picks`):
 *   picks is a non-empty array, unless `allowEmpty` (true only when the answer has
 *   a non-empty `withdrawn` or `cleared`: then picks may be empty or absent); each pick is an object with a non-empty
 *   task_id (unique across picks), option_key a non-empty string or null,
 *   text a non-empty string or null, start a boolean, owner (when present)
 *   'claude' or 'nick'; at least one of
 *   option_key / text is non-null (both is an option plus Nick's note). With a spec: task_id names one of its
 *   candidates, and option_key one of that candidate's option keys.
 * `spec` null = judge the shape only.
 */
export function weekPlanPicksError(
  picks: unknown, spec: WeekPlanSpec | null, opts: { allowEmpty: boolean } = { allowEmpty: false },
): string | null {
  if (opts.allowEmpty && (picks === undefined || (Array.isArray(picks) && picks.length === 0))) return null
  if (!Array.isArray(picks) || picks.length === 0) return 'a week_plan answer needs a non-empty picks array'
  const seen = new Set<string>()
  for (const [i, p] of picks.entries()) {
    if (!isObj(p)) return `picks[${i}] must be an object`
    if (!nonEmpty(p.task_id)) return `picks[${i}].task_id must be a non-empty string`
    if (seen.has(p.task_id)) return `picks[${i}].task_id ${p.task_id} appears twice`
    seen.add(p.task_id)
    if (p.option_key !== null && !nonEmpty(p.option_key)) return `picks[${i}].option_key must be a non-empty string or null`
    if (p.text !== null && !nonEmpty(p.text)) return `picks[${i}].text must be a non-empty string or null`
    if (p.option_key === null && p.text === null) return `picks[${i}] needs option_key or text (or both)`
    if (typeof p.start !== 'boolean') return `picks[${i}].start must be a boolean`
    if (p.owner !== undefined && !isStepOwner(p.owner)) return `picks[${i}].owner must be one of ${STEP_OWNERS.join('/')}`
    if (spec) {
      const c = spec.candidates.find((x) => x.task_id === p.task_id)
      if (!c) return `picks[${i}].task_id ${p.task_id} is not one of the offer's candidates`
      if (p.option_key !== null && !c.options.some((o) => o.key === p.option_key)) {
        return `picks[${i}].option_key ${String(p.option_key)} is not one of ${p.task_id}'s options`
      }
    }
  }
  return null
}

/** The direction a pick asks for: the option's direction, the typed text, or
 *  both (the direction, then Nick's note). */
export function pickDirection(pick: WeekPlanPick, spec: WeekPlanSpec): string {
  const c = spec.candidates.find((x) => x.task_id === pick.task_id)
  const dir = pick.option_key === null ? '' : (c?.options.find((o) => o.key === pick.option_key)?.direction ?? '')
  if (pick.text === null) return dir
  const note = pick.text.trim()
  return dir === '' ? note : `${dir}\n\nNick's note: ${note}`
}

/** The answer's picks, or null when they break weekPlanPicksError's rules
 *  (or withdrawn breaks weekPlanWithdrawnError's, kept weekPlanKeptError's or
 *  cleared weekPlanClearedError's). [] for a withdrawal-only or clearing answer. */
export function parseWeekPlanPicks(answer: unknown, spec: WeekPlanSpec | null): WeekPlanPick[] | null {
  const l = loads(answer)
  if (!l.ok || !isObj(l.value)) return null
  const picks = l.value.picks
  if (weekPlanWithdrawnError(l.value) !== null || weekPlanClearedError(l.value) !== null) return null
  if (weekPlanPicksError(picks, spec, { allowEmpty: weekPlanAllowsEmptyPicks(l.value) }) !== null) return null
  if (weekPlanKeptError(l.value, picks) !== null) return null
  if (!Array.isArray(picks)) return [] // absent picks beside a withdrawal or a clear
  return (picks as Record<string, unknown>[]).map((p) => ({
    task_id: p.task_id as string,
    option_key: (p.option_key as string | null),
    text: (p.text as string | null),
    start: p.start as boolean,
    ...(isStepOwner(p.owner) ? { owner: p.owner } : {}),
  }))
}

/** Who does a pick's step: its option's owner, else the pick's own (a typed
 *  pick), else null (a plan made before owners existed). */
export function pickOwner(pick: WeekPlanPick, spec: WeekPlanSpec): StepOwner | null {
  const c = spec.candidates.find((x) => x.task_id === pick.task_id)
  const o = pick.option_key === null ? undefined : c?.options.find((x) => x.key === pick.option_key)
  return o?.owner ?? pick.owner ?? null
}

/** The last day of an offer's week (week_start + 6), YYYY-MM-DD. */
export function weekPlanEnd(weekStart: string): string {
  return civilPlusDays(weekStart, 6)
}

/** A civil date (YYYY-MM-DD) plus n days, as pure calendar arithmetic: the
 *  date is anchored at UTC noon only to count days, and read back from its
 *  UTC parts, so no timezone ever shifts it. */
export function civilPlusDays(civil: string, n: number): string {
  const d = new Date(`${civil}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * A follow-up write to an answered week plan is allowed in exactly one shape
 * (2026-10-31, cold review: "Save without starting" was a one-way door): the
 * same answer with one or more picks flipped start false -> true, and
 * `choice` set to 'start'. Nothing else may change: v, via, at, text, withdrawn,
 * kept, cleared, every pick's task_id / option_key / text and order, and no pick may go
 * back to start:false. Returns the reason it is not such a flip, or null when it is.
 */
export function weekPlanFlipError(stored: unknown, next: unknown, spec: WeekPlanSpec): string | null {
  const a = loads(stored)
  const b = loads(next)
  if (!a.ok || !b.ok || !isObj(a.value) || !isObj(b.value)) return 'the stored or new answer does not parse'
  const before = parseWeekPlanPicks(a.value, spec)
  const after = parseWeekPlanPicks(b.value, spec)
  if (!before || !after) return 'the stored or new picks do not parse'
  const keys = new Set([...Object.keys(a.value), ...Object.keys(b.value)])
  for (const k of keys) {
    if (k === 'picks' || k === 'choice') continue
    if (JSON.stringify(a.value[k]) !== JSON.stringify(b.value[k])) return `only picks[].start may change, not ${k}`
  }
  if (b.value.choice !== WEEK_PLAN_CHOICE_START) return `a start flip sets choice to '${WEEK_PLAN_CHOICE_START}'`
  if (before.length !== after.length) return 'the picks cannot be added or removed'
  let flipped = 0
  for (const [i, p] of before.entries()) {
    const q = after[i]
    if (q.task_id !== p.task_id || q.option_key !== p.option_key || q.text !== p.text || q.owner !== p.owner) {
      return `picks[${i}] may only change start`
    }
    if (p.start && !q.start) return `picks[${i}] was started and cannot be unstarted`
    if (!p.start && q.start) flipped++
  }
  return flipped === 0 ? 'nothing to start: no pick flips start false to true' : null
}

/**
 * The picks a week plan write starts: on the first answer, every pick with
 * start:true that is not kept; on a start flip (weekPlanFlipError null), the
 * flipped ones, kept or not.
 * Null when the write starts nothing or is not one of those two shapes.
 */
export function weekPlanNewlyStarted(stored: unknown, next: unknown, spec: WeekPlanSpec): WeekPlanPick[] | null {
  const after = parseWeekPlanPicks(next, spec)
  if (!after) return null
  if (stored === null || stored === undefined) {
    const kept = new Set(weekPlanKept(next))
    const s = after.filter((p) => p.start && !kept.has(p.task_id))
    return s.length ? s : null
  }
  if (weekPlanFlipError(stored, next, spec) !== null) return null
  const before = parseWeekPlanPicks(stored, spec)!
  return after.filter((p, i) => p.start && !before[i].start)
}

/** True when the offer's expires_at is set and is before `nowIso`. */
export function weekPlanExpired(spec: WeekPlanSpec, nowIso: string): boolean {
  if (!spec.expires_at) return false
  const t = Date.parse(spec.expires_at)
  return !isNaN(t) && t < Date.parse(nowIso)
}

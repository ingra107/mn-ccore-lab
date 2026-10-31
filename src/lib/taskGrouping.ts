// Shared task-grouping primitives used by both the Today landing surface
// (src/components/today/) and the MyTasks page (src/pages/MyTasks/).
//
// Extracted from both constants.ts files (Task 5.4, naming-convention refactor
// 2026-05-14). Only items that are byte-identical between the two surfaces
// live here. Surface-specific items (GROUP_META, GroupMeta interface,
// getGroupForTask, move options, view types, mentee slugs, localStorage
// helpers) remain in each surface's own constants.ts.

import { WEEK_PLAN_SOURCE } from '../../shared/weekPlan'
import type { TaskRow } from './api'
import { isMilestone, isQuestion } from '../../shared/taskKinds'
import { parseDbUtc } from './time'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type GroupKey = 'deep' | 'priorities' | 'quick' | 'pb' | 'etl'

// ──────────────────────────────────────────────────────────────────────────
// Constants — group ordering
// ──────────────────────────────────────────────────────────────────────────

export const GROUP_ORDER: GroupKey[] = ['deep', 'priorities', 'quick', 'pb', 'etl']

// ──────────────────────────────────────────────────────────────────────────
// Constants — theme palette (CSS-var SSOT, Phase 7 2026-05-27)
// ──────────────────────────────────────────────────────────────────────────
//
// These are STRING references to CSS custom properties defined in
// src/index.css (the --task-* tokens). Used as CSS values (style={{
// color: ACCENT_GOLD }}) they resolve to the theme-aware token, so the
// task surfaces (Today + MyTasks) now adapt to both light + dark mode
// instead of being dark-locked. The previous hardcoded hex palette
// (#c9a84c / #0b1017 / etc.) lives only in :root/.dark in index.css.

export const ACCENT_GOLD   = 'var(--task-accent-gold)'
export const ACCENT_TEAL   = 'var(--task-accent-teal)'
export const ACCENT_CORAL  = 'var(--task-accent-coral)'
export const ACCENT_ORANGE = 'var(--task-accent-orange)'
export const ACCENT_GREEN  = 'var(--task-accent-green)'
export const INK           = 'var(--task-ink)'
export const INK_MUTED     = 'var(--task-ink-muted)'
export const INK_DIM       = 'var(--task-ink-dim)'
export const PAGE_BG       = 'var(--task-page-bg)'
export const PANEL_BG      = 'var(--task-panel-bg)'

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Alpha-blend a task-surface accent color over the page background.
 * Replaces the legacy `${color}NN` hex+alpha-suffix pattern which only
 * worked when `color` was a literal 6-digit hex; the Phase 7 CSS-var
 * migration broke that pattern (a CSS var with a hex-alpha suffix is not
 * valid CSS). Returns a CSS `color-mix()` expression supported in Chrome
 * 111+ / Safari 16.4+ / Firefox 113+.
 *
 *   withAlpha(ACCENT_GOLD, 13)  →  'color-mix(in srgb, var(--task-accent-gold) 13%, transparent)'
 *
 * Common hex-alpha → percent lookups (rounded):
 *   12=7%, 14=8%, 15=8%, 22=13%, 25=15%, 30=19%, 40=25%, 55=33%, 70=44%
 */
export function withAlpha(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

/**
 * Canonical done-ness (handoff §4). `status` is the single source of truth —
 * derive done from `status === 'done'`, NOT the separate `completed` flag.
 * `completed`/`completed_at` are still WRITTEN through the mutations for API /
 * back-compat, but UI must not branch on both. One helper so every surface
 * agrees on what "done" means.
 */
export function isTaskDone(t: { status?: string | null }): boolean {
  return t.status === 'done'
}

/**
 * Meeting-approval triage state (#97).
 *
 * A `source='meeting_approval'` task is a TRIAGE ARTIFACT, not work: it exists
 * only to ask "did this captured meeting really happen?" `approval_status` is
 * the tri-state answer, and only these rows ever carry it (normal tasks leave
 * it NULL — schema v83, decision 2026-06-25).
 *
 * - pending  → belongs to PendingMeetingsCard, excluded from regular groups.
 * - accepted → answered; the digest is queued and the artifact's job is over.
 * - declined → answered "no"; there is nothing left to do.
 *
 * Both ANSWERED states must drop out of the regular task lists. Previously only
 * 'pending' was filtered, so the instant Nick hit Accept or Decline the row fell
 * straight back into Today / My Tasks rendered as an ordinary task with no
 * approve/decline affordance — exactly the "these approve tasks show up like the
 * normal asks" report.
 *
 * This read-side guard is load-bearing beyond the Hub's own buttons: the same
 * meetings are triaged from OUTSIDE this repo (Nick declines via Telegram; that
 * lane lives in Peripheral Brain and writes `approval_status` only, leaving
 * `status='todo'`). Filtering on the answer rather than on `status` is what
 * makes "if i decline on telegram i would hope this drops" hold no matter which
 * surface did the declining.
 */
export function isApprovalPending(t: { approval_status?: string | null }): boolean {
  return t.approval_status === 'pending'
}

export function isApprovalTriaged(t: { approval_status?: string | null }): boolean {
  return t.approval_status === 'accepted' || t.approval_status === 'declined'
}

// ──────────────────────────────────────────────────────────────────────────
// Questions — kind='question' rows (schema v111, PB mig 130, 2026-09-17)
// ──────────────────────────────────────────────────────────────────────────
//
// A question is a task a PB producer minted because a process is waiting on
// Nick's answer (Design doc: PB Scratch/plans/sequential-petting-sky.md).
// `question_spec_json` is the immutable ask; `question_answer_json` is NULL
// until he answers, on either the Hub or Telegram. Answered is not done — the
// consumer closes the row after acting on the answer, so `isQuestionWaiting`
// (not `status`) is what drives the "needs you" card, mirroring
// `isApprovalPending` above.

/** One choice offered by a question's spec. `payload` carries whatever the
 *  PB consumer needs to act without a second lookup (e.g. a calendar
 *  candidate's event id). */
export interface QuestionChoice {
  key: string
  label: string
  payload?: unknown
}

/** `tasks.question_spec_json`, parsed. Minted once, never edited (immutable
 *  per the design doc) — the minter always appends an `other` choice. */
export interface QuestionSpec {
  v: number
  kind: string
  prompt: string
  choices: QuestionChoice[]
  rec: string
  allow_text: boolean
}

/** `tasks.question_answer_json`, parsed. NULL on the row = unanswered. */
export interface QuestionAnswer {
  v: number
  choice: string
  text?: string
  via: 'hub' | 'telegram' | 'policy'
  at: string
}

export function isQuestionTask(t: { kind?: string | null } | null | undefined): boolean {
  return isQuestion(t)
}

/**
 * Tolerant parse of a question's spec — malformed JSON (or a shape missing
 * `prompt`/`choices`) returns `null` rather than throwing, so a card can
 * render a one-line "malformed question" fallback (the task title) instead
 * of crashing the whole Today/My Tasks page over one bad row.
 */
export function parseQuestionSpec(t: { question_spec_json?: string | null }): QuestionSpec | null {
  if (!t.question_spec_json) return null
  try {
    const parsed = JSON.parse(t.question_spec_json) as Partial<QuestionSpec>
    if (!parsed || typeof parsed.prompt !== 'string' || !Array.isArray(parsed.choices)) return null
    return {
      v: parsed.v ?? 1,
      kind: parsed.kind ?? '',
      prompt: parsed.prompt,
      choices: parsed.choices,
      rec: parsed.rec ?? '',
      allow_text: parsed.allow_text ?? true,
    }
  } catch {
    return null
  }
}

/** Tolerant parse of a question's answer — same shape as parseQuestionSpec. */
export function parseQuestionAnswer(t: { question_answer_json?: string | null }): QuestionAnswer | null {
  if (!t.question_answer_json) return null
  try {
    const parsed = JSON.parse(t.question_answer_json) as Partial<QuestionAnswer>
    if (!parsed || typeof parsed.choice !== 'string') return null
    return {
      v: parsed.v ?? 1,
      choice: parsed.choice,
      text: parsed.text,
      via: parsed.via ?? 'hub',
      at: parsed.at ?? '',
    }
  } catch {
    return null
  }
}

/** `tasks.question_consumed_json`, parsed: the receipt the PB lane that acted
 *  on the answer writes in the same patch as the close (schema v114). */
export interface QuestionReceipt {
  consumer: string
  at: string
  answer_at: string
  evidence: string
}

/**
 * The lanes allowed to write a consumer receipt. Hand-mirrored from PB
 * scripts/db/enums.py::QUESTION_CONSUMERS (the Hub has no generated copy of
 * that enum yet); a receipt naming any other consumer reads as not acted on,
 * exactly as PB's ConsumerReceipt refuses it.
 */
export const QUESTION_CONSUMERS: ReadonlySet<string> = new Set([
  'fix_approval', 'meeting_match', 'nightly_work_product',
  'project_join', 'response_required', 'upstream_brief', 'week_plan',
])
/** PB enums.QUESTION_ANSWER_VIA. */
const QUESTION_ANSWER_VIA: ReadonlySet<string> = new Set(['hub', 'telegram', 'policy'])

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
/** Python's `v != 1` treats True as 1 and 1.0 as 1; mirror that. */
const isVersion1 = (v: unknown) => v === undefined || v === 1 || v === true

type Strict<T> = { ok: true; value: T | null } | { ok: false }

/** PB spec._loads: null stays null, an object passes through, text is parsed,
 *  junk is an error (never a silent null). */
function loadsColumn(raw: unknown): { ok: true; value: unknown } | { ok: false } {
  if (raw === null || raw === undefined || isObj(raw)) return { ok: true, value: raw ?? null }
  if (typeof raw !== 'string') return { ok: false }
  try { return { ok: true, value: JSON.parse(raw) } } catch { return { ok: false } }
}

/** PB state.Answer.from_json: null = unanswered, a bad shape is an error. */
function strictAnswer(raw: unknown): Strict<QuestionAnswer> {
  const l = loadsColumn(raw)
  if (!l.ok) return { ok: false }
  const d = l.value
  if (d === null) return { ok: true, value: null }
  if (!isObj(d) || !isVersion1(d.v)) return { ok: false }
  const { choice, via, at, text } = d
  if (!nonEmpty(choice) || typeof via !== 'string' || !QUESTION_ANSWER_VIA.has(via) || !nonEmpty(at)) return { ok: false }
  if (text !== null && text !== undefined && typeof text !== 'string') return { ok: false }
  if (choice === 'other' && !nonEmpty(text)) return { ok: false }
  return { ok: true, value: { v: 1, choice, via: via as QuestionAnswer['via'], at, text: (text as string | null | undefined) ?? undefined } }
}

/** PB state.ConsumerReceipt.from_json: null = not consumed, a bad shape or an
 *  unknown consumer is an error. */
function strictReceipt(raw: unknown): Strict<QuestionReceipt> {
  const l = loadsColumn(raw)
  if (!l.ok) return { ok: false }
  const d = l.value
  if (d === null) return { ok: true, value: null }
  if (!isObj(d) || !isVersion1(d.v)) return { ok: false }
  const { consumer, at, answer_at, evidence } = d
  if (typeof consumer !== 'string' || !QUESTION_CONSUMERS.has(consumer)) return { ok: false }
  if (!nonEmpty(at) || !nonEmpty(answer_at) || !nonEmpty(evidence)) return { ok: false }
  return { ok: true, value: { consumer, at, answer_at, evidence } }
}

/** A consumer receipt that PB would accept, or null (absent or invalid). */
export function parseQuestionReceipt(t: { question_consumed_json?: string | null }): QuestionReceipt | null {
  const r = strictReceipt(t.question_consumed_json)
  return r.ok ? r.value : null
}

/**
 * Where a question sits on the "Needs you" card, derived from the row's own
 * columns (no flag of its own, so it cannot disagree with them). An exact
 * mirror of PB scripts/questions/state.py::question_state, with PB's
 * 'consumed' named 'acted' and PB's 'anomaly' as null:
 *   - 'waiting'  — no answer, row open: Nick's turn.
 *   - 'answered' — a valid answer, row open: the PB lane has not acted yet.
 *                  Before 2026-10-22 nothing showed this state, so an answer
 *                  nothing acted on vanished from every surface.
 *   - 'acted'    — done, with a receipt from a known consumer whose answer_at
 *                  is this answer's `at`.
 *   - null       — anomaly or off the card: not a question, an answer or
 *                  receipt that does not parse, deleted, or closed without a
 *                  matching receipt.
 */
export type QuestionCardState = 'waiting' | 'answered' | 'acted'

const CLOSED_STATUSES = new Set(['done', 'deleted'])

export function questionCardState(t: {
  kind?: string | null
  question_answer_json?: string | null
  question_consumed_json?: string | null
  status?: string | null
}): QuestionCardState | null {
  if (!isQuestionTask(t)) return null
  const answer = strictAnswer(t.question_answer_json)
  if (!answer.ok) return null
  const status = t.status ?? ''
  if (!CLOSED_STATUSES.has(status)) return answer.value === null ? 'waiting' : 'answered'
  if (answer.value === null || status !== 'done') return null
  const receipt = strictReceipt(t.question_consumed_json)
  if (!receipt.ok || receipt.value === null || receipt.value.answer_at !== answer.value.at) return null
  return 'acted'
}

/**
 * A question row still waiting on Nick: unanswered, and not closed out from
 * under it (a consumer can close a question row directly on a terminal
 * answer path — the design doc's "dismissed" arm). Mirrors `isApprovalPending`:
 * the card that surfaces this drives on the answer/state, never on `status`
 * alone, since a stray non-terminal status must not hide a live question.
 */
export function isQuestionWaiting(t: {
  kind?: string | null
  question_answer_json?: string | null
  status?: string | null
}): boolean {
  return questionCardState(t) === 'waiting'
}

/**
 * How many rows the Needs you card shows as asking for him: waiting plus
 * answered-not-acted-on. Project-join asks are left out (they are answered on
 * JoinRequestsCard). The Today "N needs you" stat reads this so it can never
 * disagree with the card it stands in for (2026-10-26).
 */
export function cardQuestionCount(tasks: Array<{
  kind?: string | null
  question_answer_json?: string | null
  question_consumed_json?: string | null
  status?: string | null
  source?: string | null
}>): number {
  // A week plan asks once (the gold "Plan your week" row shows the newest
  // waiting one only), so at most one counts; once answered, This week is its
  // surface, not Needs you, so it stops counting.
  const others = tasks.filter((t) => {
    if (t.source === 'project_join' || t.source === WEEK_PLAN_SOURCE) return false
    const s = questionCardState(t)
    return s === 'waiting' || s === 'answered'
  }).length
  const plan = tasks.some((t) => t.source === WEEK_PLAN_SOURCE && questionCardState(t) === 'waiting') ? 1 : 0
  return others + plan
}

/**
 * Snooze (2026-10-22, Nick: "i like the snooze function for those things
 * because it can come back a few days or the next day"). On a question row
 * `due_date` means "keep this off Nick's view until that local civil date";
 * there is no other column and no job. A question is snoozed while its
 * due_date is AFTER today, so it comes back on the morning of that date by
 * construction. Every question carries a due_date from birth (PB create_task
 * defaults it to the mint day), which is never after today, so an unsnoozed
 * question reads as not snoozed with nothing to clear.
 *
 * Snooze is Nick's view only. No consumer gate reads it: PB's question_state
 * ignores due_date, and a snooze never writes question_answer_json.
 * Mirrored by PB scripts/questions/state.py::is_snoozed; both sides run the
 * table in src/lib/__tests__/fixtures/question-snooze-cases.json.
 */
export function questionSnoozedUntil(t: { due_date?: string | null }, today: string = todayKey()): string | null {
  const d = typeof t.due_date === 'string' ? t.due_date.slice(0, 10) : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d > today ? d : null
}

/** A question Nick would see (waiting, or answered and not acted on) that is
 *  snoozed past today. Acted-on and closed rows are never "snoozed". */
export function isQuestionSnoozed(t: {
  kind?: string | null
  question_answer_json?: string | null
  question_consumed_json?: string | null
  status?: string | null
  due_date?: string | null
}, today: string = todayKey()): boolean {
  const state = questionCardState(t)
  return (state === 'waiting' || state === 'answered') && questionSnoozedUntil(t, today) !== null
}

/** The longest snooze a spec may declare (PB spec.SNOOZE_DAYS_MAX). */
export const SNOOZE_DAYS_MAX = 14

/**
 * The days a choice snoozes for, or null when it is an answer. A spec
 * declares a "Not yet" choice as a snooze with payload.snooze_days (an
 * integer 1..14, PB spec.Choice refuses anything else); picking it writes
 * due_date, never an answer, and the Hub refuses it as an answer
 * (question_choice_is_snooze).
 */
export function snoozeChoiceDays(choice: { payload?: unknown } | null | undefined): number | null {
  const p = choice?.payload
  if (!isObj(p)) return null
  const n = p.snooze_days
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= SNOOZE_DAYS_MAX ? n : null
}

/**
 * The rows the "Needs you" card is handed: every question still waiting or
 * answered-but-not-acted-on and not snoozed, plus those acted on today (the
 * receipt's local day). An older acted-on row is history, not news.
 */
export function isQuestionOnCard(t: {
  kind?: string | null
  question_answer_json?: string | null
  question_consumed_json?: string | null
  status?: string | null
  due_date?: string | null
}, today: string = todayKey()): boolean {
  const state = questionCardState(t)
  if (state === 'waiting' || state === 'answered') return questionSnoozedUntil(t, today) === null
  if (state !== 'acted') return false
  return localDayKey(parseDbUtc(parseQuestionReceipt(t)!.at)) === today
}

function localDayKey(d: Date): string {
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Today's date as YYYY-MM-DD string in browser local time. */
export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * A civil date (YYYY-MM-DD) offset by N days, still civil, still local.
 *
 * Parses from PARTS into a local-midnight Date — never `new Date('2026-08-03')`,
 * which parses as UTC midnight and lands on the previous day in every western
 * zone (the same defect `isToday()` documents). `setDate` handles month, year
 * and DST rollover for us.
 */
export function civilDatePlusDays(civil: string, days: number): string {
  const [y, m, d] = civil.split('-').map(Number)
  if (!y || !m || !d) return civil
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Days elapsed since an ISO date string. Returns Infinity for null/invalid. */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity
  const d = new Date(iso)
  if (isNaN(d.getTime())) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

/**
 * Tag glyph for a task — left-of-title category cue per CD spec.
 * Used identically on Today landing and MyTasks page.
 */
export function tagForTask(
  t: TaskRow,
  projectsByPid: Map<string, { category?: string | null; slug: string }>,
): string | null {
  // A milestone renders its own ◆ glyph (TaskRow variant="milestone") — no
  // category tag (GH #131/#132).
  if (isMilestone(t)) return null
  if (t.source === 'pb') return '🧠'
  const proj = t.project_id ? projectsByPid.get(t.project_id) : null
  const cat  = proj?.category || ''
  const slug = proj?.slug || ''
  if (/cqode|clif-etl|etl/i.test(slug) || /CQODE|ETL/.test(t.title)) return '🔧'
  if (cat === 'clif') return '🔬'
  if (cat === 'mentee') return '🎓'
  if (cat === 'nate') return '🫁'
  if (/grant|R01|R03|K23|aim/i.test(t.title)) return '💰'
  if (/manuscript|paper|draft|revise/i.test(t.title)) return '📄'
  if (/meeting|agenda|review/i.test(t.title)) return '📅'
  return '📝'
}

// ──────────────────────────────────────────────────────────────────────────
// Two-date milestone rendering (Nick 2026-09-17, GH #131/#132 follow-on)
// ──────────────────────────────────────────────────────────────────────────
//
// A milestone can carry a second date: `due_date` is the INTERNAL date (our
// own target), `deadline` is the HARD date (sponsor/journal). Storage is
// settled — no schema work here. `role` names which of a milestone's 1-2
// rule-entries a given rendered row represents:
//   - 'hard'     — the single date (no separate hard date, or hard ==
//                  internal): renders exactly as the pre-2026-09-17 row.
//   - 'internal' — the internal date, while it's still ahead of today. The
//                  hard date stays hidden on the row (visible in the drawer)
//                  — Nick's explicit call: don't show the hard date while
//                  there's still runway to hit the internal one.
//   - 'slipped'  — the internal date, once it's in the past. Paired with a
//                  'hard' entry for the same milestone so the miss surfaces
//                  instead of quietly dropping the internal marker.
export type MilestoneRole = 'internal' | 'slipped' | 'hard'

/**
 * A TaskRow once it has passed through interleaveMilestones — the two extra
 * fields the interleaver stamps onto each rule-entry it emits. Every other
 * consumer of TaskRow ignores them (both optional); this alias exists so a
 * caller that DOES read `.milestoneRole`/`.milestoneDate` (TaskGroup, the
 * Today TaskRow adapter) has a name for the shape instead of casting inline.
 */
export type MilestoneEntry = TaskRow & { milestoneRole?: MilestoneRole; milestoneDate?: string | null }

/**
 * Decide how many rows a milestone renders as, and which date each carries.
 * Pure — no `today` global reference, so it's deterministic in tests. Dates
 * in, dates out are civil (YYYY-MM-DD); comparison is string comparison,
 * which is safe for civil dates.
 */
export function milestoneRules<T extends { due_date?: string | null; deadline?: string | null }>(
  t: T,
  todayKeyStr: string,
): Array<{ role: MilestoneRole; date: string | null }> {
  const civil = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)
  const due = civil(t.due_date)
  const hard = civil(t.deadline)

  if (!hard || hard === due) return [{ role: 'hard', date: due }]
  // Hard date only (no internal): one hard rule, never an undated internal one.
  if (due === null) return [{ role: 'hard', date: hard }]
  if (due >= todayKeyStr) return [{ role: 'internal', date: due }]
  return [
    { role: 'slipped', date: due },
    { role: 'hard', date: hard },
  ]
}

// Captured before interleaveMilestones declares its own `todayKey` parameter
// (same name, different scope) — the parameter would otherwise shadow this
// module's `todayKey()` function inside its own default-value expression.
const defaultTodayKey = todayKey

/**
 * Interleave milestones into an active-bucket task list by due date, WITHOUT
 * re-sorting the tasks themselves (CLAUDE.md Rule 62 — never re-sort a group
 * by date; a milestone earns its position by stable insertion, not by making
 * the whole bucket date-ordered). GH #131/#132.
 *
 * Every non-milestone item keeps its existing relative order. Each milestone
 * expands into 1-2 rule-entries (milestoneRules, above), each positioned by
 * ITS OWN date — a slipped milestone's internal-date row and hard-date row
 * can land on either side of the tasks between them. A rule-entry with no
 * date goes to the very end of the list; a task with no due_date counts as
 * later than every dated entry (so a dated entry always lands before it).
 */
export function interleaveMilestones<
  T extends {
    kind?: string | null
    due_date?: string | null
    deadline?: string | null
    milestoneRole?: MilestoneRole
    milestoneDate?: string | null
  },
>(active: T[], todayKey: string = defaultTodayKey()): T[] {
  const milestonesRaw = active.filter((t) => isMilestone(t))
  const rest = active.filter((t) => !isMilestone(t))
  if (milestonesRaw.length === 0) return rest

  const civil = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)

  const entries: T[] = milestonesRaw.flatMap((t) =>
    milestoneRules(t, todayKey).map(
      (rule) => ({ ...t, milestoneRole: rule.role, milestoneDate: rule.date }) as T,
    ),
  )

  const sortedEntries = [...entries].sort((a, b) => {
    const ad = civil(a.milestoneDate)
    const bd = civil(b.milestoneDate)
    if (ad === bd) return 0
    if (ad === null) return 1   // no-date entry sorts last
    if (bd === null) return -1
    return ad < bd ? -1 : 1
  })

  const result: T[] = []
  let mi = 0
  for (const task of rest) {
    const taskDue = civil(task.due_date)
    while (mi < sortedEntries.length) {
      const mDue = civil(sortedEntries[mi].milestoneDate)
      if (mDue === null) break // no-date entries wait for the final flush
      if (taskDue === null || mDue < taskDue) {
        result.push(sortedEntries[mi])
        mi++
      } else {
        break
      }
    }
    result.push(task)
  }
  while (mi < sortedEntries.length) {
    result.push(sortedEntries[mi])
    mi++
  }
  return result
}

// Pure logic for the 2026-10-30 Today picks (UI pairs desk): the Gap Stack,
// the Silence Map, Backward Shadows and the Walk-in card. No React, no fetch:
// each function takes rows the page already holds and returns what to draw, so
// the rules are tested on their own (todayPicks.test.ts).
//
// The one standing rule: nothing here invents a number. A task with no
// estimate says so; a deadline with no size gets no "latest start"; a series
// with too few meetings to have a pace is not judged against one.

import { meetingSeriesKey } from '../../shared/meetingAudience'
import { civilDatePlusDays } from './taskGrouping'
import { parseDbUtc } from './time'
import type { TaskRow } from './api'

const DAY_MS = 86400000

/** Whole civil days from `a` to `b` (both YYYY-MM-DD). */
export function civilDiff(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS)
}

// ── Next meeting (Gap Stack header, Walk-in card) ───────────────────────────

export interface TimedEvent {
  id: string
  title: string
  startMin?: number
  endMin?: number
  isAllDay?: boolean
  time?: string
}

/** The next timed meeting that has not started yet, with minutes until it.
 *  All-day rows and rows with no start are skipped: they hold no gap. */
export function nextTimedEvent<E extends TimedEvent>(events: E[], nowMin: number, dismissed: Record<string, boolean> = {}): { event: E; minutesUntil: number } | null {
  let best: E | null = null
  for (const e of events) {
    if (dismissed[e.id] || e.isAllDay || e.startMin == null) continue
    if (e.startMin <= nowMin) continue
    if (!best || e.startMin < (best.startMin ?? Infinity)) best = e
  }
  return best ? { event: best, minutesUntil: (best.startMin ?? 0) - nowMin } : null
}

// ── Gap Stack ───────────────────────────────────────────────────────────────

export type TaskSize =
  | { kind: 'minutes'; minutes: number }
  | { kind: 'quick' }
  | { kind: 'none' }

/** What the task says about its own size: estimated_minutes, else the PB
 *  effort tag 'quick', else nothing. 'deep' and 'multi' are not small, so they
 *  never "fit" a gap, but they are not given a number either. */
export function taskSize(t: Pick<TaskRow, 'estimated_minutes' | 'effort'>): TaskSize {
  if (typeof t.estimated_minutes === 'number' && t.estimated_minutes > 0) return { kind: 'minutes', minutes: t.estimated_minutes }
  if (t.effort === 'quick') return { kind: 'quick' }
  return { kind: 'none' }
}

/** Rank for "what next": planned today, then overdue, then due today, then
 *  due soonest, then undated. Ties keep the input order. */
export function nextRank(t: Pick<TaskRow, 'due_date'>, today: string, planned: boolean): number {
  if (planned) return 0
  const due = t.due_date?.slice(0, 10)
  if (!due) return 4
  if (due < today) return 1
  if (due === today) return 2
  return 3
}

export interface GapStack {
  /** Rows to show (at most `max`): the ones that fit first, then the next by rank. */
  rows: Array<{ task: TaskRow; size: TaskSize; fits: boolean }>
  /** How many shown rows have a size that fits the gap. */
  fitCount: number
  /** Tasks due today or overdue that are not shown, so "N more due" means today. */
  moreCount: number
}

/** The tasks for a gap of `gapMin` minutes. A task "fits" only when it carries
 *  a size that fits (minutes <= gap, or tagged quick and the gap is at least
 *  10 minutes). Unsized tasks may still be shown as "next", never as fitting. */
export function buildGapStack(tasks: TaskRow[], gapMin: number, today: string, planned: (id: string) => boolean, max = 3): GapStack {
  const ranked = tasks
    .map((task, i) => ({ task, i, rank: nextRank(task, today, planned(task.id)), size: taskSize(task) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
  const fitsOf = (s: TaskSize) => (s.kind === 'minutes' ? s.minutes <= gapMin : s.kind === 'quick' ? gapMin >= 10 : false)
  const fitting = ranked.filter((r) => fitsOf(r.size))
  const rest = ranked.filter((r) => !fitsOf(r.size) && r.rank < 4)
  const rows = [...fitting, ...rest].slice(0, max).map((r) => ({ task: r.task, size: r.size, fits: fitsOf(r.size) }))
  const shownIds = new Set(rows.map((r) => r.task.id))
  return {
    rows,
    fitCount: rows.filter((r) => r.fits).length,
    moreCount: ranked.filter((r) => {
      const due = r.task.due_date?.slice(0, 10)
      return !shownIds.has(r.task.id) && !!due && due <= today
    }).length,
  }
}

// ── Silence Map ─────────────────────────────────────────────────────────────

export interface SeriesMeeting { id: string; date: string; title: string; attendees?: string | null }

export interface QuietSeries {
  key: string
  title: string
  lastDate: string
  daysSince: number
  usualGapDays: number
  meetings: number
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Meeting series that have gone quiet: at least `minMeetings` past meetings
 *  (so there IS a pace), a usual gap of at most 45 days, nothing scheduled
 *  ahead, and more than 1.5x the usual gap (and a week past it) since the last.
 *  Sorted by how far past its pace each one is. */
export function quietSeries(meetings: SeriesMeeting[], today: string, minMeetings = 3): QuietSeries[] {
  const bySeries = new Map<string, SeriesMeeting[]>()
  for (const m of meetings) {
    const key = meetingSeriesKey(m.title)
    if (!key || !m.date) continue
    const list = bySeries.get(key) ?? []
    list.push(m)
    bySeries.set(key, list)
  }
  const out: Array<QuietSeries & { ratio: number }> = []
  for (const [key, list] of bySeries) {
    const dates = Array.from(new Set(list.map((m) => m.date.slice(0, 10)))).sort()
    if (dates.some((d) => d >= today)) continue // something is booked: not quiet
    if (dates.length < minMeetings) continue
    const gaps = dates.slice(1).map((d, i) => civilDiff(dates[i], d)).filter((g) => g > 0)
    if (gaps.length === 0) continue
    const usual = median(gaps)
    if (usual > 45) continue
    const last = dates[dates.length - 1]
    const since = civilDiff(last, today)
    if (since <= Math.max(usual * 1.5, usual + 7)) continue
    const latest = list.find((m) => m.date.slice(0, 10) === last) ?? list[0]
    out.push({ key, title: latest.title, lastDate: last, daysSince: since, usualGapDays: Math.round(usual), meetings: dates.length, ratio: since / usual })
  }
  return out.sort((a, b) => b.ratio - a.ratio).map(({ ratio: _r, ...q }) => q)
}

export interface QuietWait { task: TaskRow; days: number; since: string }

/** Open tasks marked "waiting on" someone for at least `minDays`. The clock
 *  starts at waiting_since when PB set it, else at the row's last update. */
export function quietWaits(tasks: TaskRow[], now: Date = new Date(), minDays = 7): QuietWait[] {
  const out: QuietWait[] = []
  for (const t of tasks) {
    if (!t.waiting_on?.trim()) continue
    const since = t.waiting_since || t.updated_at || t.created_at
    if (!since) continue
    const ms = parseDbUtc(since).getTime()
    if (isNaN(ms)) continue
    const days = Math.floor((now.getTime() - ms) / DAY_MS)
    if (days >= minDays) out.push({ task: t, days, since })
  }
  return out.sort((a, b) => b.days - a.days)
}

// ── Backward Shadows ────────────────────────────────────────────────────────

export interface CalEvent { startAt: string; endAt: string | null; isAllDay: boolean }

/** The working window free time is counted in: 8:00 to 17:00 local, weekdays. */
export const WORK_START_MIN = 8 * 60
export const WORK_END_MIN = 17 * 60

const localMidnight = (civil: string) => {
  const [y, m, d] = civil.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const isWeekend = (civil: string) => {
  const dow = localMidnight(civil).getDay()
  return dow === 0 || dow === 6
}

/** Booked and free minutes inside the working window on `civil`. All-day rows
 *  are not counted as booked (an all-day "On service" or a holiday reads the
 *  same, and neither has hours). Overlaps are merged, so a double-booked hour
 *  counts once. Weekends have no working window: 0 free. Pass `fromMin` (the
 *  current minute) for today: the window then starts now, so at 4:30 pm today
 *  holds at most 30 free minutes, not a full day. */
export function dayLoad(civil: string, events: CalEvent[], fromMin?: number): { bookedMin: number; freeMin: number } {
  if (isWeekend(civil)) return { bookedMin: 0, freeMin: 0 }
  const start = Math.min(WORK_END_MIN, Math.max(WORK_START_MIN, fromMin ?? WORK_START_MIN))
  const base = localMidnight(civil).getTime()
  const spans: Array<[number, number]> = []
  for (const e of events) {
    if (e.isAllDay || !e.endAt) continue
    const s = (new Date(e.startAt).getTime() - base) / 60000
    const en = (new Date(e.endAt).getTime() - base) / 60000
    const a = Math.max(s, start)
    const b = Math.min(en, WORK_END_MIN)
    if (b > a) spans.push([a, b])
  }
  spans.sort((x, y) => x[0] - y[0])
  let booked = 0
  let curA = -1
  let curB = -1
  for (const [a, b] of spans) {
    if (a > curB) { if (curB > curA) booked += curB - curA; curA = a; curB = b }
    else curB = Math.max(curB, b)
  }
  if (curB > curA) booked += curB - curA
  const window = WORK_END_MIN - start
  return { bookedMin: Math.round(booked), freeMin: Math.max(0, window - Math.round(booked)) }
}

export type ShadowTone = 'late' | 'risk' | 'fine' | 'unsized'

export interface Shadow {
  task: TaskRow
  /** The date the shadow ends on. A milestone's is its INTERNAL date
   *  (due_date) while that is today or ahead, else its hard date; any other
   *  task's is its hard deadline when set, else its due date. */
  due: string
  /** `due` is a hard date. */
  hard: boolean
  /** A milestone's hard date when it differs from `due`: a second mark. */
  hardDate: string | null
  /** Free working minutes from today up to the day before `due`. */
  freeBeforeMin: number
  /** estimated_minutes, when the task has one. */
  sizeMin: number | null
  /** The last day work can start and still fit, when sized and it fits. */
  latestStart: string | null
  tone: ShadowTone
}

/** Which open tasks cast a shadow: a milestone, a task with a hard deadline,
 *  or deep/multi work with a due date, due from today to `horizon` days out.
 *  The soonest `max`. */
export type ShadowCandidate = { task: TaskRow; due: string; hard: boolean; hardDate: string | null }

/** Where a task's shadow ends. A milestone has two dates (task-management.md,
 *  mig 128): due_date is the internal one, deadline the hard one. Its shadow
 *  ends on the internal date until that slips, then on the hard date. */
export function shadowDue(t: TaskRow, today: string): { due: string; hard: boolean; hardDate: string | null } | null {
  const internal = t.due_date?.slice(0, 10) || null
  const hardD = t.deadline?.slice(0, 10) || null
  if (t.kind === 'milestone') {
    if (internal && internal >= today) return { due: internal, hard: internal === hardD, hardDate: hardD && hardD !== internal ? hardD : null }
    if (hardD) return { due: hardD, hard: true, hardDate: null }
    return internal ? { due: internal, hard: false, hardDate: null } : null
  }
  const due = hardD || internal
  return due ? { due, hard: !!hardD, hardDate: null } : null
}

export function shadowCandidates(tasks: TaskRow[], today: string, horizon = 14, max = 3): ShadowCandidate[] {
  const edge = civilDatePlusDays(today, horizon)
  const out: ShadowCandidate[] = []
  for (const t of tasks) {
    const at = shadowDue(t, today)
    if (!at || at.due < today || at.due > edge) continue
    const big = t.effort === 'deep' || t.effort === 'multi'
    if (!(t.kind === 'milestone' || !!t.deadline || big)) continue
    out.push({ task: t, ...at })
  }
  return out.sort((a, b) => a.due.localeCompare(b.due)).slice(0, max)
}

/** One shadow per candidate, from the free time the calendar leaves. */
export function buildShadow(c: ShadowCandidate, today: string, freeByDay: Map<string, number>): Shadow {
  const days: string[] = []
  for (let d = today; d < c.due; d = civilDatePlusDays(d, 1)) days.push(d)
  const freeBeforeMin = days.reduce((n, d) => n + (freeByDay.get(d) ?? 0), 0)
  const size = typeof c.task.estimated_minutes === 'number' && c.task.estimated_minutes > 0 ? c.task.estimated_minutes : null
  if (size == null) return { ...c, freeBeforeMin, sizeMin: null, latestStart: null, tone: 'unsized' }
  let acc = 0
  let latest: string | null = null
  for (let i = days.length - 1; i >= 0; i--) {
    acc += freeByDay.get(days[i]) ?? 0
    if (acc >= size) { latest = days[i]; break }
  }
  if (!latest) return { ...c, freeBeforeMin, sizeMin: size, latestStart: null, tone: 'late' }
  // At risk while the latest start falls in the next three working days
  // (today included); a weekend does not count as runway.
  const runway = nextWeekdays(today, 3)
  const tone: ShadowTone = latest <= runway[runway.length - 1] ? 'risk' : 'fine'
  return { ...c, freeBeforeMin, sizeMin: size, latestStart: latest, tone }
}

/** The next `n` weekdays from `today` (today included when it is one). */
export function nextWeekdays(today: string, n: number): string[] {
  const out: string[] = []
  for (let d = today; out.length < n; d = civilDatePlusDays(d, 1)) if (!isWeekend(d)) out.push(d)
  return out
}

/** The events that touch `civil` (local day). */
export function eventsOnDay(civil: string, events: CalEvent[]): CalEvent[] {
  const a = localMidnight(civil).getTime()
  const b = a + DAY_MS
  return events.filter((e) => {
    const s = new Date(e.startAt).getTime()
    const en = e.endAt ? new Date(e.endAt).getTime() : s
    return s < b && en > a
  })
}

// ── Walk-in card ────────────────────────────────────────────────────────────

/** The first line of a meeting's decisions, else of its notes, with markdown
 *  bullets, headings and bold markers stripped. Null when both are empty. */
export function firstLine(decisions: string | null | undefined, notes: string | null | undefined): string | null {
  for (const src of [decisions, notes]) {
    if (!src) continue
    for (const raw of src.split(/\r?\n/)) {
      const line = raw.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, '').replace(/\*\*|__/g, '').trim()
      if (line.length >= 8 && !/^(summary|notes|decisions|action items|attendees)\s*:?$/i.test(line)) return line.length > 180 ? `${line.slice(0, 177)}…` : line
    }
  }
  return null
}

/** The previous meeting of the same series, by date, strictly before `day`. */
export function previousInSeries<M extends SeriesMeeting>(meetings: M[], title: string, day: string): M | null {
  const key = meetingSeriesKey(title)
  if (!key) return null
  return meetings
    .filter((m) => m.date.slice(0, 10) < day && meetingSeriesKey(m.title) === key)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
}

// ── Decision desk ───────────────────────────────────────────────────────────

/** A row's body as context for a decision: its description, trimmed, capped
 *  at 400 characters. Null when the row has none. */
export function taskBodyText(t: Pick<TaskRow, 'description'>): string | null {
  const d = t.description?.trim()
  if (!d) return null
  return d.length > 400 ? `${d.slice(0, 397)}…` : d
}

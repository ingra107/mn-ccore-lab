// shared/mailWatch.ts -- the mail watcher's schedule, freshness and classifier.
//
// Nick, 2026-10-29: "do it every hour ... a one-time 6:00 a.m. ... 10:00 a.m.
// and runs hourly till 4:00 p.m.", nothing at night. Our reading: slots at
// 06:00, 10:00-16:00 hourly, and 18:00, America/Chicago, weekdays only (the
// weekday rule is our inference, not his words; one boolean below).
//
// This file is the ONE copy of the schedule. The Apps Script watcher holds no
// schedule: it fires hourly and asks POST /api/watcher/runs, which answers
// {run:false} outside a slot. The Today card and the hourly dead-watcher alarm
// read the same constant, so the three cannot disagree.
//
// Freshness is never stored. watchFreshness() derives it at read time from the
// run rows, the per-thread receipts and the clock, so a dead watcher cannot be
// shown as fresh (PB Context/Decisions/2026-10-29-email-watcher.md).
//
// Pure: no D1, no fetch. Imported by api/routes/mail-watch.ts, the cron in
// api/index.ts and the Today card.

export const MAIL_WATCH_SCHEDULE = {
  timeZone: 'America/Chicago',
  /** Local hours a run may start in. A run is served for the hour it starts in. */
  slotHours: [6, 10, 11, 12, 13, 14, 15, 16, 18] as readonly number[],
  /** Our inference from Nick's words (2026-10-29), not a quote. */
  weekdaysOnly: true,
  /** A slot with no closed run this long after it starts reads as missed. Absorbs
   *  Apps Script hourly-trigger jitter (a fire can land late in the hour). */
  graceMinutes: 75,
  /** A run's alert may go out only this long after its slot starts. Past it, the
   *  close returns no alert, so a run that finishes late cannot ping off-hours. */
  alertWindowMinutes: 70,
} as const

export type Schedule = typeof MAIL_WATCH_SCHEDULE

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

interface LocalParts { y: number; m: number; d: number; hour: number; minute: number; weekday: number }

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function localParts(ms: number, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), weekday: WEEKDAY[p.weekday] ?? -1,
  }
}

/** The UTC instant of local `hour:00` on the local date y-m-d. Two passes, so
 *  the offset is the one in force at that instant (DST-correct for every slot
 *  hour; the 02:00 changeover never falls on a slot). */
function localToUtc(y: number, m: number, d: number, hour: number, timeZone: string): number {
  const naive = Date.UTC(y, m - 1, d, hour)
  let guess = naive
  for (let i = 0; i < 2; i++) {
    const lp = localParts(guess, timeZone)
    const asUtc = Date.UTC(lp.y, lp.m - 1, lp.d, lp.hour, lp.minute)
    guess = guess + (naive - asUtc)
  }
  return guess
}

function isSlotDay(weekday: number, s: Schedule): boolean {
  return !s.weekdaysOnly || (weekday >= 1 && weekday <= 5)
}

/** The slot `now` falls in (the UTC instant of its start), or null outside every slot. */
export function slotFor(nowMs: number, s: Schedule = MAIL_WATCH_SCHEDULE): number | null {
  const lp = localParts(nowMs, s.timeZone)
  if (!isSlotDay(lp.weekday, s) || !s.slotHours.includes(lp.hour)) return null
  return localToUtc(lp.y, lp.m, lp.d, lp.hour, s.timeZone)
}

/** Every slot start in [fromMs, toMs], ascending. */
export function slotsBetween(fromMs: number, toMs: number, s: Schedule = MAIL_WATCH_SCHEDULE): number[] {
  const out: number[] = []
  // Walk local dates from a day before `from` to a day after `to`.
  for (let t = fromMs - DAY; t <= toMs + DAY; t += DAY) {
    const lp = localParts(t, s.timeZone)
    if (!isSlotDay(lp.weekday, s)) continue
    for (const h of s.slotHours) {
      const at = localToUtc(lp.y, lp.m, lp.d, h, s.timeZone)
      if (at >= fromMs && at <= toMs && !out.includes(at)) out.push(at)
    }
  }
  return out.sort((a, b) => a - b)
}

/** The latest slot that started at or before `nowMs` (looks back up to 5 days). */
export function lastSlotStarted(nowMs: number, s: Schedule = MAIL_WATCH_SCHEDULE): number | null {
  const slots = slotsBetween(nowMs - 5 * DAY, nowMs, s)
  return slots.length ? slots[slots.length - 1] : null
}

export function nextSlot(nowMs: number, s: Schedule = MAIL_WATCH_SCHEDULE): number | null {
  const slots = slotsBetween(nowMs + 1, nowMs + 5 * DAY, s)
  return slots.length ? slots[0] : null
}

/** Slots whose grace has run out: a slot here with no closed run is missed. */
export function dueSlots(nowMs: number, count: number, s: Schedule = MAIL_WATCH_SCHEDULE): number[] {
  const slots = slotsBetween(nowMs - 6 * DAY, nowMs - s.graceMinutes * MINUTE, s)
  return slots.slice(-count).reverse()
}

/** True while a run for `slotAt` may still send its alert. */
export function alertAllowed(nowMs: number, slotAtMs: number, s: Schedule = MAIL_WATCH_SCHEDULE): boolean {
  return nowMs >= slotAtMs && nowMs - slotAtMs < s.alertWindowMinutes * MINUTE
}

/** Local hours of the day a push alarm may go out (06:00 up to 19:00, weekdays):
 *  the window that spans the slots. Outside it, the alarm sender refuses. */
export function pingHoursOpen(nowMs: number, s: Schedule = MAIL_WATCH_SCHEDULE): boolean {
  const lp = localParts(nowMs, s.timeZone)
  const first = Math.min(...s.slotHours)
  const last = Math.max(...s.slotHours)
  return isSlotDay(lp.weekday, s) && lp.hour >= first && lp.hour <= last
}

/** A local "HH:MM" for display, Chicago time. */
export function localHm(ms: number, s: Schedule = MAIL_WATCH_SCHEDULE): string {
  const lp = localParts(ms, s.timeZone)
  return `${String(lp.hour).padStart(2, '0')}:${String(lp.minute).padStart(2, '0')}`
}

// ── freshness ────────────────────────────────────────────────────────────────

export interface RunRow {
  id: string
  slot_at: string
  opened_at: string
  closed_at: string | null
  outcome: 'complete' | 'partial' | null
}

export interface ThreadReceipt {
  thread_id: string
  /** The closed_at of the latest closed run that read this thread (result read
   *  or not_found). null = no run has read it. */
  observed_at: string | null
}

export type FreshnessState = 'current' | 'partial' | 'late' | 'down' | 'off_hours' | 'never'

export interface Freshness {
  state: FreshnessState
  /** closed_at of the latest closed run (any outcome). */
  last_checked_at: string | null
  /** closed_at of the latest complete run. */
  last_complete_at: string | null
  /** The earliest due slot of the current outage (late/down/never). */
  missed_since: string | null
  next_slot_at: string | null
  /** Threads the Hub would hand out now. */
  threads: number
  /** Of those, threads no closed run has read since the latest due slot. */
  unchecked: number
}

const iso = (ms: number) => new Date(ms).toISOString()
const ms = (s: string) => Date.parse(s)

/**
 * The watcher's freshness, from rows and the clock alone.
 *
 *   never      no run has ever closed
 *   down       the two latest due slots both have no closed run
 *   late       the latest due slot has no closed run; the one before has
 *   partial    the latest due slot's run closed partial, or a thread the Hub
 *              would hand out now has no receipt since that slot
 *   off_hours  current, and the next slot is more than an hour away
 *   current    the latest due slot has a complete run and every thread a receipt
 *
 * A slot that started but is still inside its grace is not judged yet; the
 * slot before it decides.
 */
export function watchFreshness(
  nowMs: number, runs: readonly RunRow[], receipts: readonly ThreadReceipt[],
  s: Schedule = MAIL_WATCH_SCHEDULE,
): Freshness {
  const closed = runs.filter((r) => r.closed_at)
  const byClose = [...closed].sort((a, b) => ms(b.closed_at!) - ms(a.closed_at!))
  const lastChecked = byClose[0]?.closed_at ?? null
  const lastComplete = byClose.find((r) => r.outcome === 'complete')?.closed_at ?? null
  const next = nextSlot(nowMs, s)
  const base = {
    last_checked_at: lastChecked, last_complete_at: lastComplete,
    next_slot_at: next === null ? null : iso(next),
    threads: receipts.length,
    unchecked: 0,
  }
  const closedFor = (slotMs: number) => closed.find((r) => ms(r.slot_at) === slotMs)
  const due = dueSlots(nowMs, 60, s) // newest first
  const [d1, d2] = due
  if (closed.length === 0) {
    return { ...base, state: 'never', missed_since: d1 === undefined ? null : iso(d1), unchecked: receipts.length }
  }
  if (d1 === undefined) return { ...base, state: 'current', missed_since: null }
  const unchecked = receipts.filter((r) => !r.observed_at || ms(r.observed_at) < d1).length
  const r1 = closedFor(d1)
  if (!r1) {
    // The outage starts at the earliest of the consecutive missed slots, so
    // the alarm's key (watch_alarms.missed_slot_at) stays put while it lasts.
    let start = d1
    for (const slot of due) {
      if (closedFor(slot)) break
      start = slot
    }
    const r2 = d2 === undefined ? undefined : closedFor(d2)
    return { ...base, unchecked, state: r2 ? 'late' : 'down', missed_since: iso(start) }
  }
  if (r1.outcome === 'partial' || unchecked > 0) return { ...base, unchecked, state: 'partial', missed_since: null }
  const offHours = next !== null && next - nowMs > HOUR && nowMs - d1 > HOUR
  return { ...base, unchecked, state: offHours ? 'off_hours' : 'current', missed_since: null }
}

// ── classification ───────────────────────────────────────────────────────────

/** Raw facts the watcher sends per message. It classifies nothing. */
export interface MessageFacts {
  message_id: string
  internal_date_ms: number
  label_ids: string[]
  /** Header values, lowercased names; absent header = absent key. */
  headers: Record<string, string>
  snippet: string
}

/**
 *   nick     Nick wrote and sent it (PB's HumanSent rule: SENT, not a draft,
 *            no Auto-Submitted, no Sender header, not a forward or reaction)
 *   other    a person wrote it to him
 *   machine  a service, list, auto-reply or bounce
 *   unsure   could be either; never moves the ball and never pings
 *   draft    unsent; not stored
 */
export type Party = 'nick' | 'other' | 'machine' | 'unsure' | 'draft'

const FWD_RX = /^\s*(fwd?|fw)\s*:/i
const REACTION_RX = /reacted via gmail/i
const AUTO_SUBJECT_RX = /^\s*(automatic reply|auto(-|\s)?reply|out of (the )?office|auto:|autoreply|undeliverable|delivery status notification|mail delivery (failed|subsystem))/i
const MACHINE_LOCAL_RX = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|notifications?|notify|bounce[s]?|alerts?|automated|system)([+._-].*)?$/i
const MACHINE_PRECEDENCE = new Set(['bulk', 'list', 'junk', 'auto_reply'])

function addrOf(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim().toLowerCase()
}

export function displayOf(from: string | undefined): string {
  if (!from) return ''
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/)
  return (m && m[1].trim()) || addrOf(from)
}

export function fromAddress(from: string | undefined): string {
  return from ? addrOf(from) : ''
}

function autoSubmitted(h: Record<string, string>): boolean {
  const v = (h['auto-submitted'] ?? '').trim().toLowerCase()
  return v !== '' && v !== 'no'
}

/** `nickAddresses`: Nick's own addresses, lowercased. Mail from one of them
 *  without the SENT label (sent from another client) is unsure. */
export function classifyParty(f: MessageFacts, nickAddresses: ReadonlySet<string>): Party {
  const labels = new Set(f.label_ids)
  const h = f.headers
  if (labels.has('DRAFT')) return 'draft'
  if (labels.has('SENT')) {
    if (autoSubmitted(h) || h['sender']) return 'machine'
    if (FWD_RX.test(h['subject'] ?? '') || REACTION_RX.test(f.snippet)) return 'unsure'
    return 'nick'
  }
  const addr = fromAddress(h['from'])
  if (!addr) return 'unsure'
  if (autoSubmitted(h)) return 'machine'
  if (MACHINE_PRECEDENCE.has((h['precedence'] ?? '').trim().toLowerCase())) return 'machine'
  if (h['list-id'] || h['list-unsubscribe'] || h['x-autoreply'] || h['x-autorespond'] || h['x-auto-response-suppress']) return 'machine'
  if (MACHINE_LOCAL_RX.test(addr.split('@')[0] ?? '')) return 'machine'
  if (AUTO_SUBJECT_RX.test(h['subject'] ?? '')) return 'machine'
  if (nickAddresses.has(addr)) return 'unsure'
  return 'other'
}

// ── the ball and the alert rule ──────────────────────────────────────────────

export interface StoredMessage {
  message_id: string
  thread_id: string
  internal_at: string
  party: Exclude<Party, 'draft'>
  baseline: 0 | 1
  alerted_at: string | null
}

export type Ball = 'nick' | 'them' | 'unknown'

/** Whose move it is on a thread: the latest human message decides. A reply
 *  from someone else puts the ball with Nick. */
export function ballOf(messages: readonly StoredMessage[]): Ball {
  const human = messages
    .filter((m) => m.party === 'nick' || m.party === 'other')
    .sort((a, b) => ms(b.internal_at) - ms(a.internal_at))
  if (human.length === 0) return 'unknown'
  return human[0].party === 'other' ? 'nick' : 'them'
}

/**
 * Should this thread ping? Only when a NEW (non-baseline, never evaluated)
 * `other` message moved the ball to Nick: the human message before the first
 * new one was his, or the task is waiting on someone. A thread pings at most
 * once per run however many replies landed. unsure and machine mail never ping.
 */
export function threadPings(messages: readonly StoredMessage[], taskWaiting: boolean): boolean {
  const sorted = [...messages].sort((a, b) => ms(a.internal_at) - ms(b.internal_at))
  const fresh = sorted.filter((m) => m.party === 'other' && m.baseline === 0 && m.alerted_at === null)
  if (fresh.length === 0) return false
  const firstFresh = ms(fresh[0].internal_at)
  const before = sorted.filter((m) => (m.party === 'nick' || m.party === 'other') && ms(m.internal_at) < firstFresh)
  const prev = before[before.length - 1]
  return taskWaiting || prev?.party === 'nick'
}

/** Gmail web link to a thread (Nick's UMN account is u/1, PB ref_gmail-umn-url-pattern). */
export function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/1/#all/${threadId}`
}

/** A Gmail API thread id inside a gmail_thread link URL (16 hex chars at the
 *  end), the same rule as PB process_catch_up._THREAD_IN_URL. A 32-char web
 *  token is not an API id and yields null. */
export function threadIdFromUrl(url: string | null | undefined): string | null {
  const m = (url ?? '').match(/([0-9a-f]{16})\/?\s*$/i)
  return m ? m[1].toLowerCase() : null
}

export const GMAIL_THREAD_ID_RX = /^[0-9a-f]{16}$/

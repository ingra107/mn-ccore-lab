// Shared constants + types + helpers for the Today landing component tree.
// Extracted from src/pages/portal/TodayPage.tsx (the original single-file port
// from review/handoff_today_my_tasks_2026.04.24/today-explore/option-b2.jsx).
//
// Anything imported by 2+ files in src/components/today/ lives here.

import type { MeetingRow } from '../../hooks/useApiData'

// Shared primitives re-exported from taskGrouping (also used by MyTasks page).
// Import directly from there if you only need these.
export {
  type GroupKey,
  GROUP_ORDER,
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, ACCENT_ORANGE, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, PAGE_BG, PANEL_BG,
  todayKey, daysSince, tagForTask, withAlpha, isTaskDone,
} from '../../lib/taskGrouping'

import { todayKey } from '../../lib/taskGrouping'
import type { GroupKey } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type PlannedSlot = 'strip' | `between-${number}`

export interface GroupMeta {
  label: string
  icon: string
  color: string
}

export type LinkKind = 'folder' | 'claude' | 'email' | 'draft' | 'brief' | 'doc'

export interface TodayEvent {
  id: string
  time: string       // formatted "12:15 PM" or "—"
  end?: string
  title: string
  loc?: string
  href?: string
  // Phase 39 audit (TP-10): meeting URL extracted by ics-parser. Surfaces
  // as the "🔗 Join" chip on the EventRow when present. Sourced from the
  // event's location field via classifyMeetingUrl().
  meetingUrl?: string
  // Phase 39 audit (TP-09 + TP-11): wall-clock minutes since midnight
  // (local). Used for now-line rendering + overlap detection. Populated
  // from the iCal startAt/endAt; legacy team meetings (date-only) leave
  // these undefined and render as untimed.
  startMin?: number
  endMin?: number
  // Persisted meeting notes from D1. Populated for real team meetings
  // (id without cal- prefix); undefined for personal iCal events (cal-*).
  notes?: string | null
  // #74: true for iCal all-day events. All-day + long (≥3h) events render in
  // the Today timeline's left rail instead of the main flow.
  isAllDay?: boolean
  // T13: set on a cal-* row once matched to a same-day D1 meeting record
  // (matchMeetingRecord). Bridges the personal-calendar row to its D1
  // identity so the timeline row can deep-link + mark-seen against the real
  // meeting instead of rendering the "no meeting record" placeholder.
  meetingId?: string
  // T13: the matched meeting's debrief notes, decorated onto the cal- row.
  // Non-empty → MeetingRow renders MarkdownView + "Open meeting" link
  // instead of the jot textarea.
  meetingNotes?: string | null
  // #550: true when a cal- row matched a same-day D1 meeting record that has
  // NO debrief notes yet (7b5188de's early-return path — meetingId/meetingNotes
  // stay unset on purpose so the native untimed row keeps the live jot
  // textarea, not this row). Exists ONLY so MeetingRow can pick accurate
  // placeholder copy; it must NOT feed meetingId-gated behavior (unseen dot,
  // mark-seen, deep link) — that's the pre-debrief merge rework this row
  // explicitly defers, not this fix.
  hasUndebriefedMatch?: boolean
  // The id of the D1 meeting a cal- row matched, INCLUDING the undebriefed
  // case that deliberately leaves `meetingId` unset. Read only by the Prep
  // pill, to link to an existing meeting instead of offering to create one.
  // Kept separate from `meetingId` on purpose: that field still gates the
  // unseen dot, mark-seen and the notes deep link, and #550 defers widening
  // those to pre-debrief matches.
  matchedMeetingId?: string
  // The day this row was projected onto (YYYY-MM-DD, local). A cal- row's own
  // `id` is day-qualified but its start instant may sit on another day, and
  // the D1 meetings table is keyed by date — so the Prep pill needs the day
  // the row is RENDERED on, not the instant it starts.
  dayKey?: string

  // ── #107: cross-day span ────────────────────────────────────────────────
  // startMin/endMin are minutes-since-midnight, which cannot express a span
  // that crosses one. An 11 PM → 7 AM event used to produce startMin=1380 and
  // endMin=420 — an interval whose end precedes its start, which made
  // duration() negative, kept it out of the service rail, and fed packColumns
  // an inverted interval. Events are now CLIPPED to the day they render on, so
  // 0 <= startMin < endMin <= 1440 always holds, and the clipped-off ends are
  // recorded here instead.
  //
  // 1440 means "midnight at the end of this day" and is deliberately NOT 0 —
  // encoding it as 0 would reintroduce the inversion.
  startsBeforeDay?: boolean   // began before this day's 00:00
  endsAfterDay?: boolean      // runs past this day's 24:00
  actualStartAt?: string      // the real instant, unclipped
  actualEndAt?: string        // the real instant, unclipped
}

// #74: events at/over this many minutes (3h) are "long blocks" — they move to
// the timeline's left rail so they don't squash short meetings via OverlapBand.
export const LONG_EVENT_MIN = 180

export interface DailyCounts {
  overdue: number
  stalled: number
  planned: number
  meetings: number
  doneToday: number
}

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

// GROUP_META colors reference CSS-var tokens so the lane / chip / dot
// accents flip with theme (Phase 7, 2026-05-27). The pb-bucket grey uses
// --task-ink-muted (the same token used for secondary text on the
// surface) — gives 4.6:1+ on both light and dark task-page-bg.
export const GROUP_META: Record<GroupKey, GroupMeta> = {
  deep:       { label: 'Deep work',        icon: '🎯', color: 'var(--task-accent-gold)' },
  priorities: { label: 'Priorities',       icon: '✅', color: 'var(--task-accent-teal)' },
  quick:      { label: 'Quick',            icon: '⚡', color: 'var(--task-accent-orange)' },
  pb:         { label: 'Peripheral Brain', icon: '🧠', color: 'var(--task-ink-muted)' },
  etl:        { label: 'CQODE · CLIF ETL', icon: '🔧', color: 'var(--task-accent-teal)' },
}

// Move → popover options — same set as UnifiedMyTasks. Writes group_override
// directly (schema v50). All 5 options actionable because override is
// independent of priority/source/project derivation.
export const TODAY_MOVE_OPTIONS: Array<{ key: GroupKey; label: string }> = [
  { key: 'deep',       label: '🎯 Deep work' },
  { key: 'priorities', label: '✅ Priorities' },
  { key: 'quick',      label: '⚡ Quick' },
  { key: 'pb',         label: '🧠 Peripheral Brain' },
  { key: 'etl',        label: '🔧 CQODE · CLIF ETL' },
]

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

// Map a task to one of the 5 groups. Order matters (first match wins).
// Today landing uses broader pb detection (project slug / category) than
// MyTasks page — do NOT consolidate without reviewing both rule sets.
export function getGroupForTask(t: TaskRow, projectsBySlug: Map<string, { category?: string | null; slug: string }>): GroupKey {
  // Hub-explicit override wins (schema v50). Same rule as UnifiedMyTasks.
  if (t.group_override && (['deep', 'priorities', 'quick', 'pb', 'etl'] as const).includes(t.group_override)) {
    return t.group_override
  }
  // PB bucket — broadened: source flag, title prefix, project slug pattern,
  // or project category. Catches "Peripheral Brain" variations that the
  // narrow source='pb' check missed in the eval (review/pre-merge-2026-04-25/EVAL.md Issue 4).
  if (t.source === 'pb') return 'pb'
  if (/^(pb|peripheral.?brain)\s*[:\-—]/i.test(t.title)) return 'pb'
  const proj = t.project_id ? projectsBySlug.get(t.project_id) : null
  const projSlug = proj?.slug || ''
  const projCat = proj?.category || ''
  if (projCat === 'pb' || /(^|\W)(pb|peripheral.?brain)(\W|$)/i.test(projSlug)) return 'pb'
  if (/cqode|clif-etl|etl/i.test(projSlug) || /CQODE|ETL/.test(t.title)) return 'etl'
  if (projCat === 'clif' && /etl|ingest|backbone/i.test(t.title)) return 'etl'
  if (t.priority === 'urgent' || t.priority === 'high') return 'priorities'
  if (t.priority === 'low') return 'quick'
  return 'deep'
}

export function formatTodayDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function meetingToEvent(m: MeetingRow): TodayEvent {
  // Hub MeetingRow has only `date`, no time fields. Render as untimed.
  return { id: m.id, time: '—', title: m.title, notes: m.notes }
}

// TP-10: detect a meeting URL in the location field. ics-parser already
// runs enrichLocation() which folds Zoom/Teams/Meet URLs from DESCRIPTION
// into LOCATION. We just need to recognise an http(s) URL here.
const MEETING_URL_RE = /^https?:\/\/\S+/i

export function extractMeetingUrl(location: string | null | undefined): string | undefined {
  if (!location) return undefined
  const trimmed = location.trim()
  if (MEETING_URL_RE.test(trimmed)) return trimmed
  // Also handle "<text> <url>" — pick first URL substring.
  const m = trimmed.match(/https?:\/\/\S+/)
  return m ? m[0] : undefined
}

// TP-09 + TP-11: minutes-since-midnight from an ISO timestamp, in the
// browser's local TZ. Returns undefined for all-day events (no clock
// position to report).
export function localMinutesFromIso(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (isNaN(d.getTime())) return undefined
  return d.getHours() * 60 + d.getMinutes()
}

export function isToday(isoDate: string | null | undefined): boolean {
  if (!isoDate) return false
  const today = todayKey()
  // Date-only strings (no 'T' separator, e.g. D1 meeting date field "2026-06-17")
  // MUST be compared as civil date strings — new Date("2026-06-17") parses as
  // UTC midnight, which is the PREVIOUS calendar day in western time zones
  // (CDT = UTC-5: "2026-06-17" → June 16 at 7pm local → wrong day).
  // Timestamps with a 'T' (iCal events, ISO Z-suffix) go through local-date
  // conversion below, which correctly maps the instant to the viewer's wall-clock day.
  if (!isoDate.includes('T')) return isoDate.slice(0, 10) === today
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return isoDate.slice(0, 10) === today  // fallback for malformed strings
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return local === today
}

// Personal calendar feed events (issue #45). Same TodayEvent shape so the
// timeline renders them indistinguishably from team meetings — but we
// prefix the title with a 📅 so users can spot which came from their feed.
export interface CalendarFeedEvent {
  id: string
  title: string
  location: string | null
  startAt: string
  endAt: string | null
  isAllDay: boolean
}

/** Local midnight for a civil YYYY-MM-DD. Built from PARTS — never `new Date(civil)`, which is UTC. */
function localMidnight(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** The civil day AFTER dayKey, as a local Date. Uses setDate so DST days stay 1 calendar day apart. */
function nextLocalMidnight(dayKey: string): Date {
  const d = localMidnight(dayKey)
  d.setDate(d.getDate() + 1)
  return d
}

const DEFAULT_EVENT_MIN = 30

/**
 * Project a calendar event onto ONE civil day, clipped to that day's bounds
 * (#107). Returns null when the event does not touch the day.
 *
 * Nick: "we should account for all across day activities."
 *
 * Intervals are HALF-OPEN, matching Google Calendar's own list semantics (an
 * event overlaps a window when `start < windowEnd && end > windowStart`). So an
 * event ending at exactly midnight belongs to the day it ran in, NOT to the
 * next one — otherwise every 5pm–midnight block would also appear on tomorrow.
 *
 * All-day events keep their civil date and are not clipped; their stored
 * timestamp is a UTC-midnight sentinel that must never be read through the
 * browser's timezone (that shifts the day backwards west of UTC).
 */
export function projectCalendarEventToDay(e: CalendarFeedEvent, dayKey: string): TodayEvent | null {
  const meetingUrl = extractMeetingUrl(e.location)
  // If location holds a meeting URL, hide the URL string from the loc
  // chip (it'll render via the dedicated 🔗 Join button instead).
  const loc = meetingUrl ? undefined : (e.location ?? undefined)
  const base = { title: e.title, loc, meetingUrl }

  if (e.isAllDay) {
    // Compare civil-to-civil; the sentinel's wall clock is meaningless.
    if (e.startAt.slice(0, 10) !== dayKey) return null
    return { ...base, id: `cal-${e.id}`, time: 'all day', isAllDay: true, dayKey }
  }

  const start = new Date(e.startAt)
  if (isNaN(start.getTime())) return null
  const end = e.endAt ? new Date(e.endAt) : new Date(start.getTime() + DEFAULT_EVENT_MIN * 60_000)
  const effectiveEnd = isNaN(end.getTime()) || end <= start
    ? new Date(start.getTime() + DEFAULT_EVENT_MIN * 60_000)
    : end

  const dayStart = localMidnight(dayKey)
  const dayEnd = nextLocalMidnight(dayKey)
  if (!(start < dayEnd && effectiveEnd > dayStart)) return null

  const startsBeforeDay = start < dayStart
  const endsAfterDay = effectiveEnd > dayEnd
  const startMin = startsBeforeDay ? 0 : start.getHours() * 60 + start.getMinutes()
  // 1440, not 0 — see the TodayEvent field comments.
  const endMin = endsAfterDay ? 1440 : effectiveEnd.getHours() * 60 + effectiveEnd.getMinutes()

  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return {
    ...base,
    // Day-qualified so dismissing today's slice cannot also hide tomorrow's.
    id: `cal-${e.id}@${dayKey}`,
    dayKey,
    time: startsBeforeDay ? 'from yesterday' : fmt(start),
    end: endsAfterDay ? 'midnight' : fmt(effectiveEnd),
    startMin,
    endMin: Math.max(endMin, startMin + 1),
    isAllDay: false,
    startsBeforeDay,
    endsAfterDay,
    actualStartAt: e.startAt,
    actualEndAt: effectiveEnd.toISOString(),
  }
}

/** How a cross-day slice reads on the row. Empty for an ordinary same-day event. */
export function continuationNote(e: TodayEvent): string {
  if (e.startsBeforeDay && e.endsAfterDay) return 'all day · started yesterday, runs past midnight'
  if (e.startsBeforeDay) return 'started yesterday'
  if (e.endsAfterDay) return 'continues tomorrow'
  return ''
}

// T13: mirrors api/routes/meetings.ts normalizeMeetingTitle EXACTLY (dedup
// key for the Hub meetings table) so "MNCCORE Lab Sync" / "mnccore lab sync"
// / "  MNCCORE Lab  Sync  " all collapse to the same join key client-side.
// Keep in sync with the server copy if that one changes.
export function normalizeMeetingTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

// Bridge personal-calendar rows to D1 meeting records. ID spaces differ by
// construction (feed ids vs PB cal- mints), so date + normalized title is the
// join; nearest start time breaks same-title ties.
//
// #549: D1 `meetings` rows are date-only today (see TodayPage.tsx's own
// "date-only, no time" comment) — `rawMeetings` is never enriched with a
// `startMin`, so in current production data every tie still falls back to
// list order below (cands[0]), exactly as before. The tie-break itself is
// implemented for real so it activates the moment any caller passes
// candidates carrying `startMin` — no-op today is a data-availability fact,
// not a stub in this function.
export function matchMeetingRecord(
  ev: { title: string; startMin?: number },
  meetings: Array<{ id: string; title: string; date: string; notes?: string | null; startMin?: number }>,
  normalize: (t: string) => string,
): { id: string; notes?: string | null } | undefined {
  const cands = meetings.filter((m) => isToday(m.date) && normalize(m.title) === normalize(ev.title))
  if (cands.length <= 1) return cands[0]
  if (ev.startMin == null) return cands[0] // no signal to break the tie on — list order
  let best = cands[0]
  let bestDelta = Infinity
  for (const m of cands) {
    if (m.startMin == null) continue
    const delta = Math.abs(m.startMin - ev.startMin)
    if (delta < bestDelta) {
      bestDelta = delta
      best = m
    }
  }
  return best
}

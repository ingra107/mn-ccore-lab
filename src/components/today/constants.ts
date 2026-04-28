// Shared constants + types + helpers for the Today landing component tree.
// Extracted from src/pages/portal/TodayPage.tsx (the original single-file port
// from review/handoff_today_my_tasks_2026.04.24/today-explore/option-b2.jsx).
//
// Anything imported by 2+ files in src/components/today/ lives here.

import type { TaskRow } from '../../lib/api'
import type { MeetingRow } from '../../hooks/useApiData'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type GroupKey = 'deep' | 'priorities' | 'quick' | 'pb' | 'etl'
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
}

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

export const GROUP_META: Record<GroupKey, GroupMeta> = {
  deep:       { label: 'Deep work',        icon: '🎯', color: '#c9a84c' },
  priorities: { label: 'Priorities',       icon: '✅', color: '#5cbcb4' },
  quick:      { label: 'Quick',            icon: '⚡', color: '#f08a5b' },
  pb:         { label: 'Peripheral Brain', icon: '🧠', color: '#b0b5b9' },
  etl:        { label: 'CQODE · CLIF ETL', icon: '🔧', color: '#5cbcb4' },
}

export const GROUP_ORDER: GroupKey[] = ['deep', 'priorities', 'quick', 'pb', 'etl']

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

export const ACCENT_GOLD = '#c9a84c'
export const ACCENT_TEAL = '#5cbcb4'
export const ACCENT_CORAL = '#f0737e'
export const ACCENT_ORANGE = '#f08a5b'
export const ACCENT_GREEN = '#6ee89a'
export const INK = '#e2e8f0'
export const INK_MUTED = '#b0b5b9'
export const INK_DIM = '#7a828c'
export const PAGE_BG = '#0b1017'
export const PANEL_BG = '#0f1923'

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

// Map a task to one of the 5 groups. Order matters (first match wins).
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

export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Tag glyph for a task — left-of-title category cue per CD spec.
// Mirrors UnifiedMyTasks tagForTask; consider extracting if a third surface needs it.
export function tagForTask(t: TaskRow, projectsByPid: Map<string, { category?: string | null; slug: string }>): string {
  if (t.source === 'pb') return '🧠'
  const proj = t.project_id ? projectsByPid.get(t.project_id) : null
  const cat = proj?.category || ''
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

// Sync staleness lookup — last successful sync timestamp from localStorage.
// Coral if >24h per Rule 59. Returns hours-since-sync or Infinity if never synced.
export function hoursSinceLastSync(): number {
  try {
    const raw = window.localStorage.getItem('mnccore_last_sync_at')
    if (!raw) return Infinity
    const t = new Date(raw).getTime()
    if (isNaN(t)) return Infinity
    return Math.floor((Date.now() - t) / 3600000)
  } catch { return Infinity }
}

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity
  const d = new Date(iso)
  if (isNaN(d.getTime())) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

export function formatTodayDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function meetingToEvent(m: MeetingRow): TodayEvent {
  // Hub MeetingRow has only `date`, no time fields. Render as untimed.
  return { id: m.id, time: '—', title: m.title }
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
  return isoDate.slice(0, 10) === today
}

// Personal calendar feed events (issue #45). Same TodayEvent shape so the
// timeline renders them indistinguishably from team meetings — but we
// prefix the title with a 📅 so users can spot which came from their feed.
export function calendarEventToTodayEvent(e: { id: string; title: string; location: string | null; startAt: string; endAt: string | null; isAllDay: boolean }): TodayEvent {
  const start = new Date(e.startAt)
  const time = e.isAllDay
    ? 'all day'
    : start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const end = e.endAt && !e.isAllDay
    ? new Date(e.endAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : undefined
  const meetingUrl = extractMeetingUrl(e.location)
  // If location holds a meeting URL, hide the URL string from the loc
  // chip (it'll render via the dedicated 🔗 Join button instead).
  const loc = meetingUrl ? undefined : (e.location ?? undefined)
  return {
    id: `cal-${e.id}`,
    time,
    end,
    title: e.title,
    loc,
    meetingUrl,
    startMin: e.isAllDay ? undefined : localMinutesFromIso(e.startAt),
    endMin: e.isAllDay ? undefined : localMinutesFromIso(e.endAt),
  }
}

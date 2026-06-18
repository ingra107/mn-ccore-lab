/**
 * Shared date formatting utilities.
 * All functions accept ISO date strings and handle timezone-safe parsing.
 */

import { parseDbUtc } from './time'

// Parse any incoming date/timestamp string into a viewer-correct Date.
// Delegates to time.ts:parseDbUtc — the single chokepoint that (a) noon-anchors
// date-only strings to avoid midnight UTC rollover and (b) treats a bare
// `YYYY-MM-DD HH:MM:SS` (D1's UTC datetime, no zone suffix) as UTC instead of
// letting `new Date()` mis-read it as local wall-clock. Date-only behaviour is
// unchanged from the old length===10 noon shim; bare datetimes are now
// UTC-correct (previously off by the viewer's offset).
function safeParse(dateStr: string): Date {
  return parseDbUtc(dateStr)
}

/**
 * Parse a value that is either a bare date-only string (`YYYY-MM-DD`) or a
 * full ISO timestamp (with or without a zone suffix).
 *
 * This is the canonical defence against the "date-only UTC-midnight" bug class
 * (GH#82): `new Date("2026-06-17")` → UTC midnight → wrong civil day in any
 * timezone west of UTC. Route ALL `new Date(d1Value)` calls for fields that
 * may arrive as date-only through this helper instead.
 *
 * Behaviour:
 *   - `YYYY-MM-DD`                → noon LOCAL (civil-day anchor, no zone math)
 *   - `YYYY-MM-DD HH:MM:SS[.fff]` → treated as UTC (D1 `datetime('now')`)
 *   - already zoned (`Z`, `+05:00`, `-06:00`) → passed straight through
 *   - null/undefined/unparseable  → `Invalid Date` (never throws)
 *
 * Implementation delegates to `time.ts:parseDbUtc` — the single chokepoint.
 * The alias exists so call sites in date-domain code can import from dateUtils
 * rather than reaching into time.ts directly.
 */
export { parseDbUtc as parseDateOnlyOrTimestamp } from './time'

/** "Mar 25" */
export function formatShortDate(dateStr: string): string {
  return safeParse(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Mar 25, 2025" */
export function formatMediumDate(dateStr: string): string {
  return safeParse(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Monday, March 25, 2025" */
export function formatLongDate(dateStr: string): string {
  return safeParse(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

/** "Mon, Mar 25, 2025" */
export function formatFullDate(dateStr: string): string {
  return safeParse(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** "just now", "5m ago", "3h ago", "2d ago", or "Mar 25" */
export function formatRelativeTime(dateStr: string): string {
  // UTC-correct: a bare D1 `YYYY-MM-DD HH:MM:SS` is UTC. The old `new Date()`
  // read it as local, so a note posted "just now" from a UTC string showed
  // "5h ago"/"6h ago" (the viewer's offset) instead of "just now".
  const d = safeParse(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function isOverdue(dueDate: string | null, status?: string): boolean {
  if (!dueDate || status === 'done' || status === 'completed') return false
  return new Date(dueDate + 'T23:59:59') < new Date()
}

export function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T23:59:59')
  return Math.ceil((target.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
}

export function getDaysAgo(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  return Math.floor((new Date().getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Date as `YYYY-MM-DD` in the browser's LOCAL timezone.
 *
 * Use this for any "today"/calendar-day anchor instead of
 * `date.toISOString().split('T')[0]`, which formats in UTC. For users west of
 * UTC an evening timestamp rolls forward to tomorrow's UTC date, so a 9pm CT
 * "today" anchor would point at the next calendar day. Building the string from
 * the local getters avoids that.
 *
 * (Mirrors the local-date logic in `taskGrouping.ts:todayKey()`, but accepts an
 * arbitrary `Date` so callers can key any constructed date — week cells, day
 * views, etc. — not just `new Date()`.)
 */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Canonical due-date label text shared across ALL surfaces (TaskRow DueChip,
 * DueLabel, MyTasks constants.ts). Returns the WORD / FORMAT for a given due
 * date and overdue state so every surface reads identically (DH-4 — 2026-06-04).
 *
 * Wording chosen: `labelFor()` in DueLabel.tsx was already the "standard-palette
 * SSOT" per handoff §3. The three divergent versions were:
 *   • TaskRow `rowDueLabel()`:  "Nd ago"       ← retired
 *   • DueLabel `labelFor()`:    "Nd overdue"   ← adopted as canonical
 *   • constants `dueLabel()`:   "Nd overdue" (same wording, different casing/format) ← replaced
 *
 * "Nd overdue" (e.g. "3d overdue") is clearest because:
 *   1. It communicates the lag, not just the direction ("overdue" is informative).
 *   2. It mirrors the standard-palette DueLabel already on deployed dashboard pages.
 *   3. "Nd ago" was TaskRow-only and could be confused with "edit was 3d ago".
 *
 * @param due     ISO date string (at least YYYY-MM-DD)
 * @param overdue Result of isOverdue(due, status) — caller pre-computes once
 */
export function dueLabelText(due: string, overdue: boolean): string {
  const dueDay = due.slice(0, 10)
  const today = localDateKey()
  const noon = (d: string) => new Date(d + 'T12:00:00')
  const todayNoon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }

  if (overdue) {
    const days = Math.round((todayNoon().getTime() - noon(dueDay).getTime()) / 86400000)
    return days <= 1 ? 'Yesterday' : `${days}d overdue`
  }
  if (dueDay === today) return 'Today'
  const target = noon(dueDay)
  if (isNaN(target.getTime())) return dueDay
  const days = Math.round((target.getTime() - todayNoon().getTime()) / 86400000)
  if (days === 1) return 'Tomorrow'
  if (days > 0 && days <= 7) return `in ${days}d`
  return formatShortDate(due)
}

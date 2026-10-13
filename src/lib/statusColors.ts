import { ACCENT_GOLD, withAlpha } from './taskGrouping'
/**
 * statusColors — Shared status → color map for the 5-color palette.
 *
 * Palette (color jobs, rules-ui-design principle 21):
 *   teal   = active / in-progress / on-track
 *   gold   = wants you now: review, a revision due date
 *   orange = going stale: at-risk
 *   maroon = overdue only (rejected / won't fix are neutral words)
 *   --st-* = done / completed / accepted, blocked, waiting: neutral words
 *            (color jobs, Nick 2026-10-11; one token each in index.css)
 *   slate  = default / pending / unknown
 *
 * Usage:
 *   import { getStatusColor, getStatusBg } from '../lib/statusColors'
 *   style={{ color: getStatusColor(status), background: getStatusBg(status) }}
 */

// ── Foreground color (CSS var) ──────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  // Core task statuses
  todo: 'var(--slate)',
  in_progress: 'var(--job-accent)',
  done: 'var(--st-done)',
  blocked: 'var(--st-blocked)',
  waiting_external: 'var(--st-waiting)',
  overdue: 'var(--job-overdue)',

  // Submission / revision statuses
  pending: 'var(--slate)',
  submitted: 'var(--job-accent)',
  resubmitted: 'var(--job-accent)',
  accepted: 'var(--st-done)',
  rejected: 'var(--slate)',
  wont_fix: 'var(--slate)',
  draft: 'var(--slate)',
  review: 'var(--job-wants)',
  review_received: 'var(--job-wants)',
  revision_due: 'var(--job-wants)',
  withdrawn: 'var(--slate)',
  completed: 'var(--st-done)',

  // Conference-specific
  planning: 'var(--slate)',
  preparing: 'var(--gold)',
  presented: 'var(--st-done)',

  // Cascade-specific
  'on-track': 'var(--job-accent)',
  'at-risk': 'var(--job-stale)',

  // Materials
  not_started: 'var(--slate)',
  drafting: 'var(--gold)',
  final: 'var(--st-done)',
}

// ── Background tint ─────────────────────────────────────────────────────────
// Chip rule (Wave 3 item 5, option B, for chips that have no glyph): a gray
// fill with no hue; teal only for In Progress, orange stale, red overdue.
const NEUTRAL_BG = 'color-mix(in srgb, var(--slate) 12%, transparent)'

export const STATUS_BG_EXTENDED: Record<string, string> = {
  // Core task statuses
  todo: NEUTRAL_BG,
  in_progress: 'color-mix(in srgb, var(--job-accent) 12%, transparent)',
  done: 'color-mix(in srgb, var(--st-done) 14%, transparent)',
  blocked: 'color-mix(in srgb, var(--st-blocked) 14%, transparent)',
  waiting_external: 'color-mix(in srgb, var(--st-waiting) 14%, transparent)',
  overdue: 'color-mix(in srgb, var(--job-overdue) 15%, transparent)',

  // Submission / revision statuses
  pending: NEUTRAL_BG,
  submitted: 'color-mix(in srgb, var(--job-accent) 12%, transparent)',
  resubmitted: 'color-mix(in srgb, var(--job-accent) 12%, transparent)',
  accepted: 'color-mix(in srgb, var(--st-done) 14%, transparent)',
  rejected: NEUTRAL_BG,
  wont_fix: NEUTRAL_BG,
  draft: NEUTRAL_BG,
  review: 'color-mix(in srgb, var(--job-wants) 15%, transparent)',
  review_received: 'color-mix(in srgb, var(--job-wants) 15%, transparent)',
  revision_due: 'color-mix(in srgb, var(--job-wants) 15%, transparent)',
  withdrawn: NEUTRAL_BG,
  completed: 'color-mix(in srgb, var(--st-done) 14%, transparent)',

  // Conference-specific
  planning: NEUTRAL_BG,
  preparing: withAlpha(ACCENT_GOLD, 15),
  presented: 'color-mix(in srgb, var(--st-done) 14%, transparent)',

  // Cascade-specific
  'on-track': 'color-mix(in srgb, var(--job-accent) 12%, transparent)',
  'at-risk': 'color-mix(in srgb, var(--job-stale) 14%, transparent)',

  // Materials
  not_started: NEUTRAL_BG,
  drafting: withAlpha(ACCENT_GOLD, 15),
  final: 'color-mix(in srgb, var(--st-done) 14%, transparent)',
}

const FALLBACK_COLOR = 'var(--slate)'
const FALLBACK_BG = NEUTRAL_BG

/**
 * Returns the foreground CSS var for a status string.
 * Falls back to slate for unknown statuses.
 */
export function getStatusColor(status: string): string {
  return STATUS_COLOR[status] ?? FALLBACK_COLOR
}

/**
 * Returns the background rgba tint for a status string.
 * Falls back to slate tint for unknown statuses.
 */
export function getStatusBg(status: string): string {
  return STATUS_BG_EXTENDED[status] ?? FALLBACK_BG
}

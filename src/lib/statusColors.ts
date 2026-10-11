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
  in_progress: 'var(--teal)',
  done: 'var(--st-done)',
  blocked: 'var(--st-blocked)',
  waiting_external: 'var(--st-waiting)',
  overdue: 'var(--maroon)',

  // Submission / revision statuses
  pending: 'var(--slate)',
  submitted: 'var(--teal)',
  resubmitted: 'var(--teal)',
  accepted: 'var(--st-done)',
  rejected: 'var(--slate)',
  wont_fix: 'var(--slate)',
  draft: 'var(--slate)',
  review: 'var(--gold)',
  review_received: 'var(--gold)',
  revision_due: 'var(--gold)',
  withdrawn: 'var(--slate)',
  completed: 'var(--st-done)',

  // Conference-specific
  planning: 'var(--slate)',
  preparing: 'var(--gold)',
  presented: 'var(--st-done)',

  // Cascade-specific
  'on-track': 'var(--teal)',
  'at-risk': 'var(--orange)',

  // Materials
  not_started: 'var(--slate)',
  drafting: 'var(--gold)',
  final: 'var(--st-done)',
}

// ── Background tint (rgba) ──────────────────────────────────────────────────

export const STATUS_BG_EXTENDED: Record<string, string> = {
  // Core task statuses
  todo: 'rgba(148, 163, 184, 0.15)',
  in_progress: 'rgba(60, 130, 130, 0.12)',
  done: 'color-mix(in srgb, var(--st-done) 14%, transparent)',
  blocked: 'color-mix(in srgb, var(--st-blocked) 14%, transparent)',
  waiting_external: 'color-mix(in srgb, var(--st-waiting) 14%, transparent)',
  overdue: 'rgba(122, 0, 25, 0.15)',

  // Submission / revision statuses
  pending: 'rgba(148, 163, 184, 0.15)',
  submitted: 'rgba(60, 130, 130, 0.12)',
  resubmitted: 'rgba(60, 130, 130, 0.12)',
  accepted: 'color-mix(in srgb, var(--st-done) 14%, transparent)',
  rejected: 'rgba(100, 116, 139, 0.15)',
  wont_fix: 'rgba(100, 116, 139, 0.15)',
  draft: 'rgba(148, 163, 184, 0.15)',
  review: withAlpha(ACCENT_GOLD, 15),
  review_received: withAlpha(ACCENT_GOLD, 15),
  revision_due: withAlpha(ACCENT_GOLD, 15),
  withdrawn: 'rgba(100, 116, 139, 0.15)',
  completed: 'color-mix(in srgb, var(--st-done) 14%, transparent)',

  // Conference-specific
  planning: 'rgba(148, 163, 184, 0.15)',
  preparing: withAlpha(ACCENT_GOLD, 15),
  presented: 'color-mix(in srgb, var(--st-done) 14%, transparent)',

  // Cascade-specific
  'on-track': 'rgba(60, 130, 130, 0.12)',
  'at-risk': 'color-mix(in srgb, var(--orange) 14%, transparent)',

  // Materials
  not_started: 'rgba(148, 163, 184, 0.15)',
  drafting: withAlpha(ACCENT_GOLD, 15),
  final: 'color-mix(in srgb, var(--st-done) 14%, transparent)',
}

const FALLBACK_COLOR = 'var(--slate)'
const FALLBACK_BG = 'rgba(148, 163, 184, 0.15)'

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

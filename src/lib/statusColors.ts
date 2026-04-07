/**
 * statusColors — Shared status → color map for the 5-color palette.
 *
 * Palette:
 *   teal   = active / in-progress / on-track
 *   gold   = review / warning / at-risk
 *   maroon = overdue / blocked / rejected / error
 *   green  = done / completed / accepted
 *   slate  = default / pending / unknown
 *
 * Usage:
 *   import { getStatusColor, getStatusBg } from '../lib/statusColors'
 *   style={{ color: getStatusColor(status), background: getStatusBg(status) }}
 */

// ── Foreground color (CSS var) ──────────────────────────────────────────────

export const STATUS_COLOR: Record<string, string> = {
  // Core task statuses
  todo: 'var(--slate)',
  in_progress: 'var(--teal)',
  done: 'var(--green)',
  blocked: 'var(--maroon)',
  overdue: 'var(--maroon)',

  // Submission / revision statuses
  pending: 'var(--slate)',
  submitted: 'var(--teal)',
  resubmitted: 'var(--teal)',
  accepted: 'var(--green)',
  rejected: 'var(--maroon)',
  wont_fix: 'var(--maroon)',
  draft: 'var(--slate)',
  review: 'var(--gold)',
  review_received: 'var(--gold)',
  revision_due: 'var(--maroon)',
  withdrawn: 'var(--slate)',
  completed: 'var(--green)',

  // Conference-specific
  planning: 'var(--slate)',
  preparing: 'var(--gold)',
  presented: 'var(--green)',

  // Cascade-specific
  'on-track': 'var(--teal)',
  'at-risk': 'var(--gold)',

  // Materials
  not_started: 'var(--slate)',
  drafting: 'var(--gold)',
  final: 'var(--green)',
}

// ── Background tint (rgba) ──────────────────────────────────────────────────

export const STATUS_BG_EXTENDED: Record<string, string> = {
  // Core task statuses
  todo: 'rgba(148, 163, 184, 0.12)',
  in_progress: 'rgba(45, 138, 138, 0.12)',
  done: 'rgba(22, 163, 74, 0.12)',
  blocked: 'rgba(122, 0, 25, 0.12)',
  overdue: 'rgba(122, 0, 25, 0.12)',

  // Submission / revision statuses
  pending: 'rgba(148, 163, 184, 0.12)',
  submitted: 'rgba(45, 138, 138, 0.12)',
  resubmitted: 'rgba(45, 138, 138, 0.12)',
  accepted: 'rgba(22, 163, 74, 0.12)',
  rejected: 'rgba(122, 0, 25, 0.12)',
  wont_fix: 'rgba(122, 0, 25, 0.12)',
  draft: 'rgba(148, 163, 184, 0.12)',
  review: 'rgba(201, 168, 76, 0.12)',
  review_received: 'rgba(201, 168, 76, 0.12)',
  revision_due: 'rgba(122, 0, 25, 0.12)',
  withdrawn: 'rgba(100, 116, 139, 0.12)',
  completed: 'rgba(22, 163, 74, 0.12)',

  // Conference-specific
  planning: 'rgba(148, 163, 184, 0.12)',
  preparing: 'rgba(201, 168, 76, 0.12)',
  presented: 'rgba(22, 163, 74, 0.12)',

  // Cascade-specific
  'on-track': 'rgba(45, 138, 138, 0.12)',
  'at-risk': 'rgba(201, 168, 76, 0.12)',

  // Materials
  not_started: 'rgba(148, 163, 184, 0.12)',
  drafting: 'rgba(201, 168, 76, 0.12)',
  final: 'rgba(22, 163, 74, 0.12)',
}

const FALLBACK_COLOR = 'var(--slate)'
const FALLBACK_BG = 'rgba(148, 163, 184, 0.12)'

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

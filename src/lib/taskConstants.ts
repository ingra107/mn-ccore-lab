import { Circle, Clock, CheckCircle2, AlertTriangle, Hourglass } from 'lucide-react'
import { STATUS_BG_EXTENDED } from './statusColors'
import { ACCENT_GOLD, withAlpha } from './taskGrouping'

// ── Status ──
// Color SSOT (Nick 2026-06-11, "lean on consistency"): task status/priority
// colors point at the SAME --task-accent-* tokens the shared TaskRow uses
// (Lanes/Columns/Today dots), so a status or priority reads as the same color
// on every surface and in every view. Tokens are the AA-pinned pair in
// index.css (:root / .dark). Neutral todo/low stay --slate (no accent
// equivalent — the shared row renders them transparent/dim). "Blocked" maps
// to coral per Rule 59 (coral = warnings).

export const STATUS_CONFIG = {
  todo: { label: 'To Do', color: 'var(--slate)', icon: 'Circle' },
  in_progress: { label: 'In Progress', color: 'var(--task-accent-teal)', icon: 'Clock' },
  done: { label: 'Done', color: 'var(--task-accent-green)', icon: 'CheckCircle2' },
  blocked: { label: 'Blocked', color: 'var(--task-accent-coral)', icon: 'AlertTriangle' },
  waiting_external: { label: 'Waiting (External)', color: 'var(--task-accent-orange)', icon: 'Hourglass' },
} as const

export const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do', icon: Circle, color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'var(--task-accent-teal)' },
  { value: 'waiting_external', label: 'Waiting (External)', icon: Hourglass, color: 'var(--task-accent-orange)' },
  { value: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'var(--task-accent-coral)' },
  { value: 'done', label: 'Done', icon: CheckCircle2, color: 'var(--task-accent-green)' },
]

/** Delegates to the shared STATUS_BG_EXTENDED map from statusColors.ts */
export const STATUS_BG: Record<string, string> = STATUS_BG_EXTENDED

export const STATUS_ORDER: Record<string, number> = { blocked: 0, waiting_external: 1, in_progress: 2, todo: 3, done: 4 }
export const STATUS_CYCLE = ['todo', 'in_progress', 'done'] as const

// ── Approval Status (meeting_approval tasks) ──
// Used by Accept/Decline buttons on TaskCard for tasks with source='meeting_approval'.
// Colors: green=accepted (positive), coral=declined (warning, per Rule 59).
export const APPROVAL_STATUS_OPTIONS = [
  { value: 'accepted', label: 'Accept', color: 'var(--task-accent-green)' },
  { value: 'declined', label: 'Decline', color: 'var(--task-accent-coral)' },
] as const

// ── Priority ──

// Same SSOT note as Status above: urgent/high/medium match the shared
// TaskRow's reserved priority-dot palette (coral/orange/gold accents).
export const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: 'var(--task-accent-coral)', bg: 'rgba(122, 0, 25, 0.14)' },
  high: { label: 'High', color: 'var(--task-accent-orange)', bg: 'rgba(194, 65, 12, 0.14)' },
  medium: { label: 'Med', color: 'var(--task-accent-gold)', bg: withAlpha(ACCENT_GOLD, 14) },
  low: { label: 'Low', color: 'var(--slate)', bg: 'rgba(100, 116, 139, 0.14)' },
} as const

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'var(--slate)' },
  { value: 'medium', label: 'Medium', color: 'var(--task-accent-gold)' },
  { value: 'high', label: 'High', color: 'var(--task-accent-orange)' },
  { value: 'urgent', label: 'Urgent', color: 'var(--task-accent-coral)' },
]

export const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
export const PRIORITY_COLORS: Record<string, string> = {
  low: 'var(--slate)',
  medium: 'var(--task-accent-gold)',
  high: 'var(--task-accent-orange)',
  urgent: 'var(--task-accent-coral)',
}

// ── Project Status ──
// R10: project status reuses the task status vocabulary so the lab speaks one
// language across data types. Pipeline progression lives on `stage`; this
// orthogonal axis answers "is the project moving?".

export const PROJECT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'var(--task-accent-teal)' },
  { value: 'waiting_external', label: 'Waiting (External)', color: 'var(--task-accent-orange)' },
  { value: 'blocked', label: 'Blocked', color: 'var(--task-accent-coral)' },
  { value: 'done', label: 'Done', color: 'var(--slate)' },
]

/** Map any legacy project status value to the canonical lowercase token. */
export function normalizeProjectStatus(value: string | null | undefined): string {
  if (!value) return 'active'
  const v = value.toLowerCase().trim()
  if (v === 'completed' || v === 'complete') return 'done'
  if (v === 'pending') return 'waiting_external'
  if (v === 'in review' || v === 'in preparation') return 'active'
  if (PROJECT_STATUS_OPTIONS.some(o => o.value === v)) return v
  return 'active'
}

/** True if the project counts as "in motion" — used for active-count widgets. */
export function isProjectActive(value: string | null | undefined): boolean {
  return normalizeProjectStatus(value) === 'active'
}

// ── Stages ──

// Stage colors pinned for WCAG AA on near-black dark-mode bg (2026-04-18).
// Earlier values (slate-400 / blue-400 / teal-500 / gold-500 / maroon-700 /
// green-500) fell below 4.5:1 when rendered as small text with opacity —
// these brighter tints survive opacity 0.85 and still contrast on white.
export const STAGE_COLORS: Record<string, string> = {
  Idea: '#8591a0',
  'Data Collection': 'var(--stage-data-collection)',
  Analysis: '#4db5b0',
  Writing: '#dcb355',
  Review: '#d65c66',
  Published: '#4ecd77',
}

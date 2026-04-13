import { Circle, Clock, CheckCircle2, AlertTriangle, Hourglass } from 'lucide-react'
import { STATUS_BG_EXTENDED } from './statusColors'

// ── Status ──

export const STATUS_CONFIG = {
  todo: { label: 'To Do', color: 'var(--slate)', icon: 'Circle' },
  in_progress: { label: 'In Progress', color: 'var(--teal)', icon: 'Clock' },
  done: { label: 'Done', color: 'var(--green)', icon: 'CheckCircle2' },
  blocked: { label: 'Blocked', color: 'var(--maroon)', icon: 'AlertTriangle' },
  waiting_external: { label: 'Waiting (External)', color: 'var(--orange)', icon: 'Hourglass' },
} as const

export const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do', icon: Circle, color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'var(--teal)' },
  { value: 'waiting_external', label: 'Waiting (External)', icon: Hourglass, color: 'var(--orange)' },
  { value: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'var(--maroon)' },
  { value: 'done', label: 'Done', icon: CheckCircle2, color: 'var(--green)' },
]

/** Delegates to the shared STATUS_BG_EXTENDED map from statusColors.ts */
export const STATUS_BG: Record<string, string> = STATUS_BG_EXTENDED

export const STATUS_ORDER: Record<string, number> = { blocked: 0, waiting_external: 1, in_progress: 2, todo: 3, done: 4 }
export const STATUS_CYCLE = ['todo', 'in_progress', 'done'] as const

// ── Priority ──

export const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: 'var(--maroon)', bg: 'rgba(122, 0, 25, 0.14)' },
  high: { label: 'High', color: 'var(--orange)', bg: 'rgba(194, 65, 12, 0.14)' },
  medium: { label: 'Med', color: 'var(--gold)', bg: 'rgba(201, 168, 76, 0.14)' },
  low: { label: 'Low', color: 'var(--slate)', bg: 'rgba(100, 116, 139, 0.14)' },
} as const

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'var(--slate)' },
  { value: 'medium', label: 'Medium', color: 'var(--gold)' },
  { value: 'high', label: 'High', color: 'var(--orange)' },
  { value: 'urgent', label: 'Urgent', color: 'var(--maroon)' },
]

export const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
export const PRIORITY_COLORS: Record<string, string> = {
  low: 'var(--slate)',
  medium: 'var(--gold)',
  high: 'var(--orange)',
  urgent: 'var(--maroon)',
}

// ── Project Status ──
// R10: project status reuses the task status vocabulary so the lab speaks one
// language across data types. Pipeline progression lives on `stage`; this
// orthogonal axis answers "is the project moving?".

export const PROJECT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'var(--teal)' },
  { value: 'waiting_external', label: 'Waiting (External)', color: 'var(--orange)' },
  { value: 'blocked', label: 'Blocked', color: 'var(--maroon)' },
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

export const STAGE_COLORS: Record<string, string> = {
  Idea: '#64748b',
  'Data Collection': '#5b8abf',
  Analysis: '#2d8a8a',
  Writing: '#c9a84c',
  Review: '#7a0019',
  Published: '#16a34a',
}

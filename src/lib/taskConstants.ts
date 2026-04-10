import { Circle, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { STATUS_BG_EXTENDED } from './statusColors'

// ── Status ──

export const STATUS_CONFIG = {
  todo: { label: 'To Do', color: 'var(--slate)', icon: 'Circle' },
  in_progress: { label: 'In Progress', color: 'var(--teal)', icon: 'Clock' },
  done: { label: 'Done', color: 'var(--green)', icon: 'CheckCircle2' },
  blocked: { label: 'Blocked', color: 'var(--maroon)', icon: 'AlertTriangle' },
} as const

export const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do', icon: Circle, color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'var(--teal)' },
  { value: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'var(--maroon)' },
  { value: 'done', label: 'Done', icon: CheckCircle2, color: 'var(--green)' },
]

/** Delegates to the shared STATUS_BG_EXTENDED map from statusColors.ts */
export const STATUS_BG: Record<string, string> = STATUS_BG_EXTENDED

export const STATUS_ORDER: Record<string, number> = { blocked: 0, in_progress: 1, todo: 2, done: 3 }
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

// ── Stages ──

export const STAGE_COLORS: Record<string, string> = {
  Idea: '#64748b',
  'Data Collection': '#5b8abf',
  Analysis: '#2d8a8a',
  Writing: '#c9a84c',
  Review: '#7a0019',
  Published: '#16a34a',
}

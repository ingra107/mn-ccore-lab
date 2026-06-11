// Shared constants + types + helpers for the MyTasks page (Round 2).
// Extracted from src/pages/portal/UnifiedMyTasks.tsx — anything imported
// by 2+ files in src/pages/MyTasks/ lives here.

import type { TaskRow } from '../../lib/api'
import { researchTeam } from '../../data/team'

// Shared primitives re-exported from taskGrouping (also used by Today landing).
// Import directly from there if you only need these.
export {
  type GroupKey,
  GROUP_ORDER,
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, ACCENT_ORANGE, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, PAGE_BG, PANEL_BG,
  todayKey, daysSince, tagForTask, withAlpha, isTaskDone,
} from '../../lib/taskGrouping'

import type { GroupKey } from '../../lib/taskGrouping'
import { ACCENT_CORAL, ACCENT_GOLD, INK_MUTED, todayKey } from '../../lib/taskGrouping'
import { dueLabelText, isOverdue } from '../../lib/dateUtils'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type ViewMode = 'columns' | 'lanes' | 'list'
export type QuickViewKey = 'all' | 'new' | 'today' | 'overdue' | 'waiting' | 'stale'

export interface GroupMeta { icon: string; label: string; color: string; desc: string }

export interface FilterState { priority: string | null; project: string | null; mentee: string | null; group: GroupKey | null; hideCompleted: boolean }

export interface FilterOption { v: string | null; l: string }

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

// GROUP_META + STATUS_COLOR + PRIORITY_COLOR reference CSS-var tokens so
// the chips / dots / borders flip with theme (Phase 7, 2026-05-27). The
// MyTasks "quick" lane is coral here (P3 with overdue tinge) whereas
// Today's quick lane is orange — that's an intentional surface difference
// kept from the original constants. PB grey uses --task-ink-muted.
export const GROUP_META: Record<GroupKey, GroupMeta> = {
  deep:       { icon: '🎯', label: 'Deep work',        color: 'var(--task-accent-gold)',   desc: 'Scheduled focus blocks' },
  priorities: { icon: '✅', label: 'Priorities',       color: 'var(--task-accent-teal)',   desc: 'P1 ops & commitments' },
  quick:      { icon: '⚡', label: 'Quick',            color: 'var(--task-accent-coral)',  desc: 'Sub-15-min lifts' },
  pb:         { icon: '🧠', label: 'Peripheral Brain', color: 'var(--task-ink-muted)',     desc: 'Reflection & low-urgency' },
  etl:        { icon: '🔧', label: 'CQODE · CLIF ETL', color: 'var(--task-accent-teal)',   desc: 'Data pipeline ops' },
}

export const STATUS_LABEL: Record<string, string> = { todo: 'Todo', in_progress: 'Active', waiting_external: 'Waiting', blocked: 'Blocked', done: 'Done' }
export const STATUS_COLOR: Record<string, string> = {
  todo:             'var(--task-ink-muted)',
  in_progress:      'var(--task-accent-teal)',
  waiting_external: 'var(--task-accent-orange)',
  blocked:          'var(--task-accent-coral)',
  done:             'var(--task-accent-green)',
}
export const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--task-accent-coral)',
  high:   'var(--task-accent-coral)',
  medium: 'var(--task-accent-gold)',
  low:    'var(--task-ink-muted)',
}
export const PRIORITY_SHORT: Record<string, string> = { urgent: 'P1', high: 'P1', medium: 'P2', low: 'P3' }

// Mentee slugs derived from researchTeam (CD spec — Mentee filter chip).
// Trainees/coordinators/students/analysts treated as mentees for the filter.
export const MENTEE_SLUGS = new Set(researchTeam.map((m) => m.slug))

// Move → popover: writes tasks.group_override (schema v50). All 5 groups
// available because the override is independent of priority/source/project.
// Syncs to brain.db so TODAY.md generation honors it the next morning.
export const MOVE_OPTIONS: Array<{ key: GroupKey; label: string }> = [
  { key: 'deep',       label: '🎯 Deep work' },
  { key: 'priorities', label: '✅ Priorities' },
  { key: 'quick',      label: '⚡ Quick' },
  { key: 'pb',         label: '🧠 Peripheral Brain' },
  { key: 'etl',        label: '🔧 CQODE · CLIF ETL' },
]

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

export function getGroupForTask(t: TaskRow, projectsByPid: Map<string, { category?: string | null; slug: string }>): GroupKey {
  // Hub-explicit override wins (schema v50). User clicked Move → on the
  // /portal/my-tasks page; their choice trumps auto-derivation. Syncs to
  // brain.db so TODAY.md generation honors it the next morning.
  if (t.group_override && (['deep', 'priorities', 'quick', 'pb', 'etl'] as const).includes(t.group_override)) {
    return t.group_override
  }
  if (t.source === 'pb' || /^pb:/i.test(t.title)) return 'pb'
  const proj = t.project_id ? projectsByPid.get(t.project_id) : null
  const projSlug = proj?.slug || ''
  const projCat = proj?.category || ''
  if (/cqode|clif-etl|etl/i.test(projSlug) || /CQODE|ETL/.test(t.title)) return 'etl'
  if (projCat === 'clif' && /etl|ingest|backbone/i.test(t.title)) return 'etl'
  if (t.priority === 'urgent' || t.priority === 'high') return 'priorities'
  if (t.priority === 'low') return 'quick'
  return 'deep'
}

// dueLabel: thin wrapper around the canonical dueLabelText() helper (DH-4,
// 2026-06-04). Returns '—' for null (caller's placeholder convention).
// Status is passed for accurate overdue detection (done tasks are never overdue).
export function dueLabel(due: string | null, status?: string): string {
  if (!due) return '—'
  const d = new Date(due + 'T12:00:00')
  if (isNaN(d.getTime())) return '—'
  return dueLabelText(due, isOverdue(due, status))
}

export function dueColor(t: TaskRow): string {
  const today = todayKey()
  if (t.due_date && t.due_date.slice(0, 10) < today) return ACCENT_CORAL
  if (t.due_date && t.due_date.slice(0, 10) === today) return ACCENT_GOLD
  return INK_MUTED
}

// Planned-today set — Workstream B (schema v75): derives from the SYNCED task
// columns (planned_for == today), NOT the retired today_state_* localStorage blob.
// Return type unchanged (Set<string>) so `plannedSet` → useTaskFilter is identical.
// `tasks` is optional (default []) — the only caller (MyTasks/index.tsx) passes the
// tasks query data; a zero-arg call returns an empty set (no LS fallback).
export function readPlannedToday(tasks: TaskRow[] = []): Set<string> {
  const today = todayKey()
  const s = new Set<string>()
  for (const t of tasks) {
    if (t.planned_for && t.planned_for.slice(0, 10) === today) s.add(t.id)
  }
  return s
}

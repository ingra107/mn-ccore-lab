// Shared constants + types + helpers for the MyTasks page (Round 2).
// Extracted from src/pages/portal/UnifiedMyTasks.tsx — anything imported
// by 2+ files in src/pages/MyTasks/ lives here.

import type { TaskRow } from '../../lib/api'
import { researchTeam } from '../../data/team'

// Shared primitives re-exported from taskGrouping (also used by Today landing).
// Import directly from there if you only need these. Which section a task sits
// in is lib/taskSections.ts (shared with Today).
export {
  INK, INK_MUTED, INK_DIM, PAGE_BG, PANEL_BG,
  todayKey, daysSince, tagForTask, withAlpha, isTaskDone,
} from '../../lib/taskGrouping'

import type { SectionKey } from '../../lib/taskSections'

// Color jobs (rules-ui-design principle 21). The MyTasks surface speaks
// only these plus the ink ramp: accent = selection / primary action / in
// progress, overdue = red, stale = orange (urgent edge, stale days).
export const JOB_ACCENT = 'var(--job-accent)'
export const JOB_OVERDUE = 'var(--job-overdue)'
import { todayKey } from '../../lib/taskGrouping'
import { dueLabelCompact, isOverdue } from '../../lib/dateUtils'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export const VIEW_MODES = ['columns', 'lanes', 'list', 'table', 'board'] as const
export type ViewMode = typeof VIEW_MODES[number]

/** The one reader of a `?view=` value (cold load AND saved-view restore).
 *  Two hand-listed copies drifted: restore omitted 'board', so a saved Board
 *  view reopened as List. List is the default, so the URL omits it. */
export function parseViewMode(raw: string | null | undefined): ViewMode {
  return (VIEW_MODES as readonly string[]).includes(raw ?? '') ? raw as ViewMode : 'list'
}
export const QUICK_VIEW_KEYS = ['all', 'new', 'today', 'planned', 'done-today', 'overdue', 'waiting', 'stale', 'declined'] as const
export type QuickViewKey = typeof QUICK_VIEW_KEYS[number]

/** The one reader of a `?filter=` value (cold load AND saved-view restore), the
 *  same shape as parseViewMode. An unknown value (a mistyped link, an old
 *  saved view) reads as All instead of an active filter no tab shows. */
export function parseQuickView(raw: string | null | undefined): QuickViewKey {
  return (QUICK_VIEW_KEYS as readonly string[]).includes(raw ?? '') ? raw as QuickViewKey : 'all'
}

export const STATUS_FILTER_KEYS = ['todo', 'in_progress', 'waiting_external', 'blocked', 'done'] as const
export type StatusFilterKey = typeof STATUS_FILTER_KEYS[number]

/** The one reader of a `?status=` value (the command palette links here). */
export function parseStatusParam(raw: string | null | undefined): StatusFilterKey | null {
  return (STATUS_FILTER_KEYS as readonly string[]).includes(raw ?? '') ? raw as StatusFilterKey : null
}

/** Does a task pass the status filter? `done` means completed, however the
 *  status column reads. */
export function matchesStatusFilter(t: { status: string; completed?: number | null }, status: StatusFilterKey | null): boolean {
  if (!status) return true
  if (status === 'done') return t.completed === 1 || t.status === 'done'
  return t.status === status
}

export interface FilterState { priority: string | null; status: StatusFilterKey | null; project: string | null; mentee: string | null; group: SectionKey | null; hideCompleted: boolean }

export interface FilterOption { v: string | null; l: string }

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

// STATUS_COLOR + PRIORITY_COLOR reference CSS-var tokens so the chips / dots /
// borders flip with theme (Phase 7, 2026-05-27). Only urgent keeps a color (the
// orange stale edge) and in-progress the accent (principle 21).
export const STATUS_LABEL: Record<string, string> = { todo: 'Todo', in_progress: 'Active', waiting_external: 'Waiting', blocked: 'Blocked', done: 'Done' }
export const STATUS_COLOR: Record<string, string> = {
  todo:             'var(--task-ink-muted)',
  in_progress:      'var(--job-accent)',
  waiting_external: 'var(--st-waiting)',
  blocked:          'var(--st-blocked)',
  done:             'var(--st-done)',
}
export const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--job-stale)',
  high:   'var(--task-ink-muted)',
  medium: 'var(--task-ink-muted)',
  low:    'var(--task-ink-muted)',
}

// Mentee slugs derived from researchTeam (CD spec — Mentee filter chip).
// Trainees/coordinators/students/analysts treated as mentees for the filter.
export const MENTEE_SLUGS = new Set(researchTeam.map((m) => m.slug))

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

// dueLabel: thin wrapper around dueLabelCompact(), the <= 6-char row form
// (Nick 2026-09-17; was dueLabelText, DH-4
// 2026-06-04). Returns '—' for null (caller's placeholder convention).
// Status is passed for accurate overdue detection (done tasks are never overdue).
export function dueLabel(due: string | null, status?: string): string {
  if (!due) return '—'
  const d = new Date(due + 'T12:00:00')
  if (isNaN(d.getTime())) return '—'
  return dueLabelCompact(due, isOverdue(due, status))
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

/** The words of the bulk Delete. The action soft-deletes (action 'delete'). */
export function bulkDeleteCopy(count: number): { confirm: string; toast: string } {
  const tasks = `${count} task${count === 1 ? '' : 's'}`
  return { confirm: `Delete ${tasks}? They'll be soft-deleted.`, toast: `Deleted ${tasks}` }
}

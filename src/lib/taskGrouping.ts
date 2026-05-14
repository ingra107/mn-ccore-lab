// Shared task-grouping primitives used by both the Today landing surface
// (src/components/today/) and the MyTasks page (src/pages/MyTasks/).
//
// Extracted from both constants.ts files (Task 5.4, naming-convention refactor
// 2026-05-14). Only items that are byte-identical between the two surfaces
// live here. Surface-specific items (GROUP_META, GroupMeta interface,
// getGroupForTask, move options, view types, mentee slugs, localStorage
// helpers) remain in each surface's own constants.ts.

import type { TaskRow } from './api'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type GroupKey = 'deep' | 'priorities' | 'quick' | 'pb' | 'etl'

// ──────────────────────────────────────────────────────────────────────────
// Constants — group ordering
// ──────────────────────────────────────────────────────────────────────────

export const GROUP_ORDER: GroupKey[] = ['deep', 'priorities', 'quick', 'pb', 'etl']

// ──────────────────────────────────────────────────────────────────────────
// Constants — theme palette (dark surface)
// ──────────────────────────────────────────────────────────────────────────

export const ACCENT_GOLD   = '#c9a84c'
export const ACCENT_TEAL   = '#5cbcb4'
export const ACCENT_CORAL  = '#f0737e'
export const ACCENT_ORANGE = '#f08a5b'
export const ACCENT_GREEN  = '#6ee89a'
export const INK           = '#e2e8f0'
export const INK_MUTED     = '#b0b5b9'
export const INK_DIM       = '#7a828c'
export const PAGE_BG       = '#0b1017'
export const PANEL_BG      = '#0f1923'

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/** Today's date as YYYY-MM-DD string in browser local time. */
export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Days elapsed since an ISO date string. Returns Infinity for null/invalid. */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity
  const d = new Date(iso)
  if (isNaN(d.getTime())) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

/**
 * Tag glyph for a task — left-of-title category cue per CD spec.
 * Used identically on Today landing and MyTasks page.
 */
export function tagForTask(
  t: TaskRow,
  projectsByPid: Map<string, { category?: string | null; slug: string }>,
): string {
  if (t.source === 'pb') return '🧠'
  const proj = t.project_id ? projectsByPid.get(t.project_id) : null
  const cat  = proj?.category || ''
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

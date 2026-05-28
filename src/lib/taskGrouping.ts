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
// Constants — theme palette (CSS-var SSOT, Phase 7 2026-05-27)
// ──────────────────────────────────────────────────────────────────────────
//
// These are STRING references to CSS custom properties defined in
// src/index.css (the --task-* tokens). Used as CSS values (style={{
// color: ACCENT_GOLD }}) they resolve to the theme-aware token, so the
// task surfaces (Today + MyTasks) now adapt to both light + dark mode
// instead of being dark-locked. The previous hardcoded hex palette
// (#c9a84c / #0b1017 / etc.) lives only in :root/.dark in index.css.

export const ACCENT_GOLD   = 'var(--task-accent-gold)'
export const ACCENT_TEAL   = 'var(--task-accent-teal)'
export const ACCENT_CORAL  = 'var(--task-accent-coral)'
export const ACCENT_ORANGE = 'var(--task-accent-orange)'
export const ACCENT_GREEN  = 'var(--task-accent-green)'
export const INK           = 'var(--task-ink)'
export const INK_MUTED     = 'var(--task-ink-muted)'
export const INK_DIM       = 'var(--task-ink-dim)'
export const PAGE_BG       = 'var(--task-page-bg)'
export const PANEL_BG      = 'var(--task-panel-bg)'

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Alpha-blend a task-surface accent color over the page background.
 * Replaces the legacy `${color}NN` hex+alpha-suffix pattern which only
 * worked when `color` was a literal 6-digit hex; the Phase 7 CSS-var
 * migration broke that pattern (var(--task-accent-gold)22 is not valid
 * CSS). Returns a CSS `color-mix()` expression supported in Chrome
 * 111+ / Safari 16.4+ / Firefox 113+.
 *
 *   withAlpha(ACCENT_GOLD, 13)  →  'color-mix(in srgb, var(--task-accent-gold) 13%, transparent)'
 *
 * Common hex-alpha → percent lookups (rounded):
 *   12=7%, 14=8%, 15=8%, 22=13%, 25=15%, 30=19%, 40=25%, 55=33%, 70=44%
 */
export function withAlpha(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

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

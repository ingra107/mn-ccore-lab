// Shared constants + types + helpers for the MyTasks page (Round 2).
// Extracted from src/pages/portal/UnifiedMyTasks.tsx — anything imported
// by 2+ files in src/pages/MyTasks/ lives here.

import type { TaskRow } from '../../lib/api'
import { researchTeam } from '../../data/team'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type ViewMode = 'columns' | 'lanes' | 'list'
export type GroupKey = 'deep' | 'priorities' | 'quick' | 'pb' | 'etl'
export type QuickViewKey = 'all' | 'today' | 'overdue' | 'waiting' | 'stale'

export interface GroupMeta { icon: string; label: string; color: string; desc: string }

export interface FilterState { priority: string | null; project: string | null; mentee: string | null; group: GroupKey | null; hideCompleted: boolean }

export interface FilterOption { v: string | null; l: string }

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

export const GROUP_META: Record<GroupKey, GroupMeta> = {
  deep:       { icon: '🎯', label: 'Deep work',        color: '#c9a84c', desc: 'Scheduled focus blocks' },
  priorities: { icon: '✅', label: 'Priorities',       color: '#5cbcb4', desc: 'P1 ops & commitments' },
  quick:      { icon: '⚡', label: 'Quick',            color: '#f0737e', desc: 'Sub-15-min lifts' },
  pb:         { icon: '🧠', label: 'Peripheral Brain', color: '#9aa0a6', desc: 'Reflection & low-urgency' },
  etl:        { icon: '🔧', label: 'CQODE · CLIF ETL', color: '#5cbcb4', desc: 'Data pipeline ops' },
}

export const GROUP_ORDER: GroupKey[] = ['deep', 'priorities', 'quick', 'pb', 'etl']

export const STATUS_LABEL: Record<string, string> = { todo: 'Todo', in_progress: 'Active', waiting_external: 'Waiting', blocked: 'Blocked', done: 'Done' }
export const STATUS_COLOR: Record<string, string> = { todo: '#9aa0a6', in_progress: '#5cbcb4', waiting_external: '#f08a5b', blocked: '#f0737e', done: '#6ee89a' }
export const PRIORITY_COLOR: Record<string, string> = { urgent: '#f0737e', high: '#f0737e', medium: '#c9a84c', low: '#9aa0a6' }
export const PRIORITY_SHORT: Record<string, string> = { urgent: 'P1', high: 'P1', medium: 'P2', low: 'P3' }

export const ACCENT_GOLD = '#c9a84c'
export const ACCENT_TEAL = '#5cbcb4'
export const ACCENT_CORAL = '#f0737e'
export const ACCENT_ORANGE = '#f08a5b'
export const ACCENT_GREEN = '#6ee89a'
export const INK = '#e2e8f0'
export const INK_MUTED = '#b0b5b9'
export const INK_DIM = '#7a828c'
export const PAGE_BG = '#0b1017'
export const PANEL_BG = '#0f1923'

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

// Tag glyph for a task (CD spec — left-of-title category cue on rows).
// Picks emoji from project category or task source. Defaults to 📝.
export function tagForTask(t: TaskRow, projectsByPid: Map<string, { category?: string | null; slug: string }>): string {
  if (t.source === 'pb') return '🧠'
  const proj = t.project_id ? projectsByPid.get(t.project_id) : null
  const cat = proj?.category || ''
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

export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity
  const d = new Date(iso)
  if (isNaN(d.getTime())) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

export function dueLabel(due: string | null): string {
  if (!due) return '—'
  const d = new Date(due + 'T12:00:00')
  if (isNaN(d.getTime())) return '—'
  const today = new Date(); today.setHours(12, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 7) return `${diff}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function dueColor(t: TaskRow): string {
  const today = todayKey()
  if (t.due_date && t.due_date.slice(0, 10) < today) return ACCENT_CORAL
  if (t.due_date && t.due_date.slice(0, 10) === today) return ACCENT_GOLD
  return INK_MUTED
}

// Read planned-today set from TodayPage's localStorage shape so the two pages stay in sync.
export function readPlannedToday(): Set<string> {
  try {
    const raw = window.localStorage.getItem(`today_state_${todayKey()}`)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as { planned?: Record<string, unknown> }
    return new Set(Object.keys(parsed.planned ?? {}))
  } catch { return new Set() }
}

// Helpers for the today_state localStorage shape — shared with TodayPage.
export function readTodayState(): { rightNow?: string | null; planned?: Record<string, { slot: string }>; done?: Record<string, boolean> } {
  try { return JSON.parse(window.localStorage.getItem(`today_state_${todayKey()}`) || '{}') } catch { return {} }
}
export function writeTodayState(snap: object): void {
  try { window.localStorage.setItem(`today_state_${todayKey()}`, JSON.stringify(snap)) } catch { /* ignore */ }
}

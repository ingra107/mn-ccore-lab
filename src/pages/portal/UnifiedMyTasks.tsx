// UnifiedMyTasks — My Tasks Round 2 (single page, three views).
// Port from review/handoff_today_my_tasks_2026.04.24/mytasks-explore/.
//
// Three views (Columns / Lanes / List) share ONE toolbar (CLAUDE.md Rule 55):
// - Columns: Kanban — all 5 task groups side-by-side, inline expand within card
// - Lanes:   Stacked — focus one group, peek at others, inline expand below row
// - List:    Power mode — dense table, j/k/e/x keyboard nav, side drawer
//
// View picker lives far-left of the filter row (CD called this out — not a
// sidebar, not a tab, not a top-right toggle). Persists to localStorage.mt_view.
//
// Bulk handlers are stubbed for P0 (toast "Coming soon"). Real wiring lands in P2.

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTasks, useProjects, useTaskDetail } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { researchTeam } from '../../data/team'
import { usePageMeta } from '../../hooks/usePageMeta'
import { PATHS } from '../../constants/paths'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import ReactionBar from '../../components/ReactionBar'
import SavedViewsMenu from '../../components/SavedViewsMenu'
import SmartCompose from '../../components/SmartCompose'
import { useBulkUpdateTasks, useUpdateTask } from '../../hooks/useMutations'
import { useUndoToast } from '../../components/UndoToast'
import type { TaskRow } from '../../lib/api'

// ──────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ──────────────────────────────────────────────────────────────────────────

type ViewMode = 'columns' | 'lanes' | 'list'
type GroupKey = 'deep' | 'priorities' | 'quick' | 'pb' | 'etl'
type QuickViewKey = 'all' | 'today' | 'overdue' | 'waiting' | 'stale'

interface GroupMeta { icon: string; label: string; color: string; desc: string }

const GROUP_META: Record<GroupKey, GroupMeta> = {
  deep:       { icon: '🎯', label: 'Deep work',        color: '#c9a84c', desc: 'Scheduled focus blocks' },
  priorities: { icon: '✅', label: 'Priorities',       color: '#5cbcb4', desc: 'P1 ops & commitments' },
  quick:      { icon: '⚡', label: 'Quick',            color: '#f0737e', desc: 'Sub-15-min lifts' },
  pb:         { icon: '🧠', label: 'Peripheral Brain', color: '#9aa0a6', desc: 'Reflection & low-urgency' },
  etl:        { icon: '🔧', label: 'CQODE · CLIF ETL', color: '#5cbcb4', desc: 'Data pipeline ops' },
}

const GROUP_ORDER: GroupKey[] = ['deep', 'priorities', 'quick', 'pb', 'etl']

const STATUS_LABEL: Record<string, string> = { todo: 'Todo', in_progress: 'Active', waiting_external: 'Waiting', blocked: 'Blocked', done: 'Done' }
const STATUS_COLOR: Record<string, string> = { todo: '#9aa0a6', in_progress: '#5cbcb4', waiting_external: '#f08a5b', blocked: '#f0737e', done: '#6ee89a' }
const PRIORITY_COLOR: Record<string, string> = { urgent: '#f0737e', high: '#f0737e', medium: '#c9a84c', low: '#9aa0a6' }
const PRIORITY_SHORT: Record<string, string> = { urgent: 'P1', high: 'P1', medium: 'P2', low: 'P3' }

const ACCENT_GOLD = '#c9a84c'
const ACCENT_TEAL = '#5cbcb4'
const ACCENT_CORAL = '#f0737e'
const ACCENT_ORANGE = '#f08a5b'
const ACCENT_GREEN = '#6ee89a'
const INK = '#e2e8f0'
const INK_MUTED = '#b0b5b9'
const INK_DIM = '#7a828c'
const PAGE_BG = '#0b1017'
const PANEL_BG = '#0f1923'

function getGroupForTask(t: TaskRow, projectsByPid: Map<string, { category?: string | null; slug: string }>): GroupKey {
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

// Mentee slugs derived from researchTeam (CD spec — Mentee filter chip).
// Trainees/coordinators/students/analysts treated as mentees for the filter.
const MENTEE_SLUGS = new Set(researchTeam.map((m) => m.slug))

// Tag glyph for a task (CD spec — left-of-title category cue on rows).
// Picks emoji from project category or task source. Defaults to 📝.
function tagForTask(t: TaskRow, projectsByPid: Map<string, { category?: string | null; slug: string }>): string {
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

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity
  const d = new Date(iso)
  if (isNaN(d.getTime())) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function dueLabel(due: string | null): string {
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

function dueColor(t: TaskRow): string {
  const today = todayKey()
  if (t.due_date && t.due_date.slice(0, 10) < today) return ACCENT_CORAL
  if (t.due_date && t.due_date.slice(0, 10) === today) return ACCENT_GOLD
  return INK_MUTED
}

// Read planned-today set from TodayPage's localStorage shape so the two pages stay in sync.
function readPlannedToday(): Set<string> {
  try {
    const raw = window.localStorage.getItem(`today_state_${todayKey()}`)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as { planned?: Record<string, unknown> }
    return new Set(Object.keys(parsed.planned ?? {}))
  } catch { return new Set() }
}

// ──────────────────────────────────────────────────────────────────────────
// Shared chip + link primitives
// ──────────────────────────────────────────────────────────────────────────

function Chip({ children, color = '#9aa0a6', filled = false, title }: { children: React.ReactNode; color?: string; filled?: boolean; title?: string }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 500, letterSpacing: '0.02em', background: filled ? `${color}22` : 'transparent', border: `1px solid ${color}40`, color, whiteSpace: 'nowrap' }}>{children}</span>
  )
}

function LinksBar({ task }: { task: TaskRow }) {
  const items: string[] = []
  if (task.key_link_1) items.push('folder')
  if (task.key_link_2) items.push('claude')
  if (task.key_link_3) items.push('brief')
  if (items.length === 0) return null
  const ICON: Record<string, string> = { folder: '📁', claude: '◆', brief: '📄', email: '✉', draft: '✎' }
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {items.map((l, i) => (
        <span key={i} title={l} style={{ fontSize: 10, width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, color: INK_DIM, background: 'rgba(255,255,255,0.02)' }}>{ICON[l] ?? '·'}</span>
      ))}
    </span>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Filter chip (replaces guarded raw <select> via inline custom dropdown)
// ──────────────────────────────────────────────────────────────────────────

interface FilterOption { v: string | null; l: string }

function FilterChip({ label, value, options, onChange }: { label: string; value: string | null; options: FilterOption[]; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const active = options.find((o) => o.v === value)
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, background: 'rgba(255,255,255,0.02)', fontSize: 11, height: 26 }}>
      <span style={{ color: INK_DIM, paddingLeft: 10, paddingRight: 6, letterSpacing: '0.02em' }}>{label}</span>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingRight: 22, paddingLeft: 2, fontSize: 11, color: value ? ACCENT_TEAL : INK, background: 'transparent', border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
      >{active?.l ?? options[0]?.l}</button>
      <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', color: INK_DIM, fontSize: 9 }}>▾</span>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 180, maxHeight: 280, overflowY: 'auto', background: PANEL_BG, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
          {options.map((o) => (
            <button
              key={o.v ?? '__any__'}
              onClick={() => { onChange(o.v); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 11, background: o.v === value ? 'rgba(92,188,180,0.15)' : 'transparent', border: 'none', color: o.v === value ? ACCENT_TEAL : INK, fontFamily: 'inherit', cursor: 'pointer' }}
            >{o.l}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// View picker — far-left of filter row (CLAUDE.md Rule 55)
// ──────────────────────────────────────────────────────────────────────────

function ViewPicker({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  const views: { k: ViewMode; l: string; icon: string; desc: string }[] = [
    { k: 'columns', l: 'Columns', icon: '⊞', desc: 'Kanban board · all groups side-by-side' },
    { k: 'lanes',   l: 'Lanes',   icon: '☰', desc: 'Stacked lanes · collapse and peek' },
    { k: 'list',    l: 'List',    icon: '≡', desc: 'Dense table · keyboard-first' },
  ]
  return (
    <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, background: 'rgba(255,255,255,0.02)', overflow: 'hidden', height: 26 }}>
      {views.map((v, i) => {
        const active = view === v.k
        return (
          <button
            key={v.k}
            onClick={() => setView(v.k)}
            title={v.desc}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 11px', height: 24, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: active ? 'rgba(92,188,180,0.15)' : 'transparent', color: active ? ACCENT_TEAL : INK_MUTED, fontWeight: active ? 600 : 500, borderRight: i < views.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
          >
            <span style={{ fontSize: 12 }}>{v.icon}</span>
            {v.l}
          </button>
        )
      })}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Top bar — title, search, quick-views, view picker, filter chips, bulk reset
// ──────────────────────────────────────────────────────────────────────────

interface TopBarProps {
  view: ViewMode; setView: (v: ViewMode) => void
  search: string; setSearch: (v: string) => void
  filter: FilterState; setFilter: (fn: (f: FilterState) => FilterState) => void
  quickView: QuickViewKey; setQuickView: (q: QuickViewKey) => void
  taskCount: number
  projectOptions: FilterOption[]
  currentQuery: string
  onApplyView: (q: string) => void
}

interface FilterState { priority: string | null; project: string | null; mentee: string | null; group: GroupKey | null; hideCompleted: boolean }

function TopBar({ view, setView, search, setSearch, filter, setFilter, quickView, setQuickView, taskCount, projectOptions, currentQuery, onApplyView }: TopBarProps) {
  const tabs: { k: QuickViewKey; l: string; color?: string }[] = [
    { k: 'all', l: 'All' },
    { k: 'today', l: '📌 Today', color: ACCENT_GOLD },
    { k: 'overdue', l: '⚠ Overdue', color: ACCENT_CORAL },
    { k: 'waiting', l: '⏳ Waiting on', color: ACCENT_ORANGE },
    { k: 'stale', l: '🕰 Stale', color: ACCENT_ORANGE },
  ]
  const hasFilters = filter.priority || filter.project || filter.mentee || filter.group || search || quickView !== 'all'
  return (
    <div style={{ padding: '14px 24px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: '#fff' }}>My Tasks</h1>
        <span style={{ fontSize: 11, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{taskCount} visible</span>
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: INK, fontSize: 12, width: 260, fontFamily: 'inherit', outline: 'none' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {tabs.map((tab) => {
          const active = quickView === tab.k
          const c = tab.color || ACCENT_TEAL
          return (
            <button
              key={tab.k}
              onClick={() => setQuickView(tab.k)}
              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 999, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${active ? c + '70' : 'rgba(255,255,255,0.1)'}`, background: active ? c + '15' : 'transparent', color: active ? c : INK_MUTED }}
            >{tab.l}</button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <ViewPicker view={view} setView={setView} />
        <SavedViewsMenu page="my-tasks" currentQuery={currentQuery} onApply={onApplyView} />
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
        <FilterChip
          label="Group"
          value={filter.group}
          options={[{ v: null, l: 'All' }, ...GROUP_ORDER.map((k) => ({ v: k, l: `${GROUP_META[k].icon} ${GROUP_META[k].label}` }))]}
          onChange={(v) => setFilter((f) => ({ ...f, group: v as GroupKey | null }))}
        />
        <FilterChip
          label="Priority"
          value={filter.priority}
          options={[{ v: null, l: 'Any' }, { v: 'urgent', l: 'P1 / urgent' }, { v: 'high', l: 'P1 / high' }, { v: 'medium', l: 'P2 / medium' }, { v: 'low', l: 'P3 / low' }]}
          onChange={(v) => setFilter((f) => ({ ...f, priority: v }))}
        />
        <FilterChip
          label="Project"
          value={filter.project}
          options={[{ v: null, l: 'All' }, ...projectOptions]}
          onChange={(v) => setFilter((f) => ({ ...f, project: v }))}
        />
        <FilterChip
          label="Mentee"
          value={filter.mentee}
          options={[
            { v: null, l: 'Any' },
            { v: '__any_mentee__', l: '🎓 Any mentee' },
            ...researchTeam.filter((m) => !!m.slug).map((m) => ({ v: m.slug as string, l: m.name })),
          ]}
          onChange={(v) => setFilter((f) => ({ ...f, mentee: v }))}
        />
        <button
          onClick={() => setFilter((f) => ({ ...f, hideCompleted: !f.hideCompleted }))}
          style={{ padding: '4px 10px', fontSize: 11, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, background: filter.hideCompleted ? 'rgba(255,255,255,0.02)' : 'rgba(110,232,154,0.1)', color: filter.hideCompleted ? INK_MUTED : ACCENT_GREEN, fontFamily: 'inherit', cursor: 'pointer' }}
        >{filter.hideCompleted ? 'Show completed' : 'Hide completed'}</button>
        {hasFilters && (
          <button
            onClick={() => { setFilter((f) => ({ priority: null, project: null, mentee: null, group: null, hideCompleted: f.hideCompleted })); setSearch(''); setQuickView('all') }}
            style={{ padding: '4px 10px', fontSize: 11, border: 'none', background: 'transparent', color: ACCENT_CORAL, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
          >clear all</button>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Bulk bar — actions stub; wired in P2
// ──────────────────────────────────────────────────────────────────────────

interface BulkBarProps {
  count: number
  onClear: () => void
  onPlanToday: () => void
  onSnoozeDay: () => void
  onComplete: () => void
  onArchive: () => void
  onReassign: (slug: string) => void
  onPriority: (priority: string) => void
  onStatus: (status: string) => void
  assigneeOptions: Array<{ slug: string; name: string }>
}

type BulkPicker = 'reassign' | 'priority' | 'status' | null

function BulkBar({ count, onClear, onPlanToday, onSnoozeDay, onComplete, onArchive, onReassign, onPriority, onStatus, assigneeOptions }: BulkBarProps) {
  const [picker, setPicker] = useState<BulkPicker>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  // Close on outside click
  useEffect(() => {
    if (!picker) return
    const close = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [picker])
  // Close on Escape
  useEffect(() => {
    if (!picker) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicker(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picker])

  const btn = (label: string, onClick: () => void, accent?: string, active?: boolean) => (
    <button
      key={label}
      onClick={onClick}
      style={{ padding: '3px 9px', fontSize: 11, border: `1px solid ${active ? ACCENT_TEAL : accent ? accent + '40' : 'rgba(255,255,255,0.12)'}`, borderRadius: 4, background: active ? ACCENT_TEAL + '20' : accent ? accent + '15' : 'transparent', color: active ? ACCENT_TEAL : accent ?? INK, fontFamily: 'inherit', cursor: 'pointer' }}
    >{label}</button>
  )

  const PRIORITY_OPTS = ['urgent', 'high', 'medium', 'low']
  const STATUS_OPTS = [
    { v: 'todo', l: 'Todo' },
    { v: 'in_progress', l: 'In progress' },
    { v: 'waiting_external', l: 'Waiting' },
    { v: 'blocked', l: 'Blocked' },
    { v: 'done', l: 'Done' },
  ]

  return (
    <div ref={pickerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ padding: '8px 24px', background: 'rgba(201,168,76,0.08)', borderBottom: '1px solid rgba(201,168,76,0.2)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ color: ACCENT_GOLD, fontWeight: 600 }}>{count} selected</span>
        <span style={{ color: INK_DIM }}>·</span>
        {btn('📌 Plan today', onPlanToday, ACCENT_GOLD)}
        {btn('Snooze +1d', onSnoozeDay)}
        {btn('Status →', () => setPicker(picker === 'status' ? null : 'status'), undefined, picker === 'status')}
        {btn('Reassign', () => setPicker(picker === 'reassign' ? null : 'reassign'), undefined, picker === 'reassign')}
        {btn('Priority', () => setPicker(picker === 'priority' ? null : 'priority'), undefined, picker === 'priority')}
        {btn('✓ Complete', onComplete, ACCENT_GREEN)}
        {btn('Archive', onArchive, ACCENT_CORAL)}
        <div style={{ flex: 1 }} />
        <button onClick={onClear} style={{ background: 'none', border: 'none', color: INK_MUTED, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Deselect</button>
      </div>
      {/* Picker popover — replaces window.prompt() (CD spec: dark-first picker, not native modal). Esc / outside-click close. */}
      {picker && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, padding: '10px 24px', background: PANEL_BG, borderBottom: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', zIndex: 20, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginRight: 6 }}>
            {picker === 'reassign' ? 'Reassign to' : picker === 'priority' ? 'Set priority' : 'Set status'}
          </span>
          {picker === 'priority' && PRIORITY_OPTS.map((p) => (
            <button
              key={p}
              onClick={() => { onPriority(p); setPicker(null) }}
              style={{ padding: '4px 10px', fontSize: 11, borderRadius: 4, border: `1px solid ${PRIORITY_COLOR[p] ?? INK_DIM}40`, background: `${PRIORITY_COLOR[p] ?? INK_DIM}15`, color: PRIORITY_COLOR[p] ?? INK, fontFamily: 'inherit', cursor: 'pointer' }}
            >{p}</button>
          ))}
          {picker === 'status' && STATUS_OPTS.map((s) => (
            <button
              key={s.v}
              onClick={() => { onStatus(s.v); setPicker(null) }}
              style={{ padding: '4px 10px', fontSize: 11, borderRadius: 4, border: `1px solid ${STATUS_COLOR[s.v] ?? INK_DIM}40`, background: `${STATUS_COLOR[s.v] ?? INK_DIM}15`, color: STATUS_COLOR[s.v] ?? INK, fontFamily: 'inherit', cursor: 'pointer' }}
            >{s.l}</button>
          ))}
          {picker === 'reassign' && assigneeOptions.map((a) => (
            <button
              key={a.slug}
              onClick={() => { onReassign(a.slug); setPicker(null) }}
              style={{ padding: '4px 10px', fontSize: 11, borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', color: INK, fontFamily: 'inherit', cursor: 'pointer' }}
            >{a.name}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={() => setPicker(null)} style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>esc</button>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Inline detail panel — shared by Columns + Lanes
// ──────────────────────────────────────────────────────────────────────────

// Helpers for the today_state localStorage shape — shared with TodayPage.
function readTodayState(): { rightNow?: string | null; planned?: Record<string, { slot: string }>; done?: Record<string, boolean> } {
  try { return JSON.parse(window.localStorage.getItem(`today_state_${todayKey()}`) || '{}') } catch { return {} }
}
function writeTodayState(snap: object): void {
  try { window.localStorage.setItem(`today_state_${todayKey()}`, JSON.stringify(snap)) } catch { /* ignore */ }
}

function InlineDetail({ task, projectName }: { task: TaskRow; projectName?: string | null }) {
  // Real handlers (no longer decorative). Reach for mutations directly so the
  // component is self-contained and the parent doesn't need to drill props.
  const updateTask = useUpdateTask()
  const undoToast = useUndoToast()
  const snap = readTodayState()
  const isPromoted = snap.rightNow === task.id
  const isPlanned = !!snap.planned?.[task.id]

  const promote = useCallback(() => {
    const s = readTodayState()
    s.rightNow = task.id
    s.planned = s.planned ?? {}
    if (!s.planned[task.id]) s.planned[task.id] = { slot: 'strip' }
    writeTodayState(s)
    undoToast.showSuccess('Promoted to Right Now on Today')
  }, [task.id, undoToast])

  const planToday = useCallback(() => {
    const s = readTodayState()
    s.planned = s.planned ?? {}
    s.planned[task.id] = { slot: 'strip' }
    writeTodayState(s)
    undoToast.showSuccess('Planned for today')
  }, [task.id, undoToast])

  const snooze = useCallback(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const due = tomorrow.toISOString().split('T')[0]
    updateTask.mutate({ id: task.id, fields: { due_date: due } }, {
      onSuccess: () => undoToast.showSuccess('Snoozed +1 day'),
    })
  }, [task.id, updateTask, undoToast])

  const archive = useCallback(() => {
    if (!window.confirm('Archive this task? It will be soft-deleted.')) return
    updateTask.mutate({ id: task.id, fields: { status: 'done', completed: 1 } }, {
      onSuccess: () => undoToast.showSuccess('Archived'),
    })
  }, [task.id, updateTask, undoToast])

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
      {task.description && (
        <div style={{ fontSize: 11, color: ACCENT_GOLD, marginBottom: 8, fontStyle: 'italic', padding: '6px 10px', background: 'rgba(201,168,76,0.05)', borderLeft: `2px solid ${ACCENT_GOLD}`, borderRadius: 3 }}>
          💡 {task.description.split('\n')[0].slice(0, 220)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {!isPromoted && (
          <button onClick={promote} title="Promote to Right Now on Today" style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: `1px solid ${ACCENT_GOLD}`, background: ACCENT_GOLD, color: PAGE_BG, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>▶ Work on this</button>
        )}
        {!isPlanned && (
          <button onClick={planToday} title="Add to today's planned strip" style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: INK, fontFamily: 'inherit', cursor: 'pointer' }}>📌 Plan today</button>
        )}
        <button onClick={snooze} title="Push due date +1 day" disabled={updateTask.isPending} style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: INK, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer', opacity: updateTask.isPending ? 0.5 : 1 }}>Snooze +1d</button>
        <button onClick={archive} title="Soft-delete this task" disabled={updateTask.isPending} style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: 'none', background: 'transparent', color: INK_DIM, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer' }}>Archive</button>
      </div>
      <div style={{ fontSize: 10.5, color: INK_DIM, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span><span style={{ opacity: 0.6 }}>updated</span> {task.updated_at?.slice(0, 10) ?? '—'}</span>
        <span><span style={{ opacity: 0.6 }}>status</span> <span style={{ color: STATUS_COLOR[task.status] }}>{STATUS_LABEL[task.status] ?? task.status}</span></span>
        {projectName && <span><span style={{ opacity: 0.6 }}>project</span> {projectName}</span>}
      </div>
      <div style={{ marginTop: 8 }}>
        <SmartCompose taskId={task.id} placeholder="Add a note or @hermes…" />
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Columns view — Kanban
// ──────────────────────────────────────────────────────────────────────────

function ColumnsView({ filtered, byGroup, selected, toggleSelect, expanded, setExpanded, projectsByPid, plannedSet }: { filtered: TaskRow[]; byGroup: Record<GroupKey, TaskRow[]>; selected: Set<string>; toggleSelect: (id: string) => void; expanded: string | null; setExpanded: (id: string | null) => void; projectsByPid: Map<string, { name: string; slug: string }>; plannedSet: Set<string> }) {
  // Mobile scroll cue — right-edge fade gradient + visible thin scrollbar so
  // users discover the 5 columns scroll horizontally on small viewports
  // (eval Issue 5).
  return (
    <div className="mt-columns-scroll" style={{ flex: 1, overflow: 'auto', padding: '12px 20px 20px', position: 'relative' }}>
      <style>{`
        .mt-columns-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
        .mt-columns-scroll::-webkit-scrollbar { height: 8px; }
        .mt-columns-scroll::-webkit-scrollbar-track { background: transparent; }
        .mt-columns-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; }
        @media (max-width: 1024px) {
          .mt-columns-scroll::after {
            content: '';
            position: sticky;
            top: 0; right: 0;
            float: right;
            width: 32px;
            height: 100%;
            margin-left: -32px;
            pointer-events: none;
            background: linear-gradient(to right, transparent, ${PAGE_BG} 80%);
            z-index: 2;
          }
        }
      `}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(260px, 1fr))', gap: 14, minWidth: 1400 }}>
        {GROUP_ORDER.map((gkey) => {
          const meta = GROUP_META[gkey]
          const tasks = byGroup[gkey]
          const incomplete = tasks.filter((t) => t.completed === 0 && t.status !== 'done').length
          return (
            <div key={gkey} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px 8px', borderBottom: `1px solid ${meta.color}25`, marginBottom: 8, position: 'sticky', top: 0, background: PAGE_BG, zIndex: 1 }}>
                <span style={{ fontSize: 14 }}>{meta.icon}</span>
                <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: meta.color, margin: 0 }}>{meta.label}</h3>
                <span style={{ fontSize: 11, color: INK_DIM, marginLeft: 'auto' }}>
                  {incomplete}{tasks.length > incomplete && <span style={{ opacity: 0.5 }}> · {tasks.length - incomplete}✓</span>}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tasks.length === 0 && (
                  <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: 11, color: '#5a6068', fontStyle: 'italic' }}>nothing here</div>
                )}
                {tasks.map((t) => (
                  <Card
                    key={t.id}
                    task={t}
                    project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                    selected={selected.has(t.id)}
                    onSelect={() => toggleSelect(t.id)}
                    expanded={expanded === t.id}
                    onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                    planned={plannedSet.has(t.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#5a6068', fontSize: 13, fontStyle: 'italic' }}>no tasks match</div>
      )}
    </div>
  )
}

function Card({ task, project, selected, onSelect, expanded, onExpand, planned }: { task: TaskRow; project: { name: string; slug: string } | null; selected: boolean; onSelect: () => void; expanded: boolean; onExpand: () => void; planned: boolean }) {
  const meta = GROUP_META[(task as TaskRow & { _group?: GroupKey })._group ?? 'deep']
  const today = todayKey()
  const overdueDays = task.due_date && task.due_date.slice(0, 10) < today ? daysSince(task.due_date) : 0
  const stale = task.updated_at && daysSince(task.updated_at) >= 10 && task.status === 'in_progress' ? daysSince(task.updated_at) : 0
  const dueText = dueLabel(task.due_date)
  const dueCol = dueColor(task)
  const isCompleted = task.completed === 1 || task.status === 'done'

  return (
    <div
      onClick={(e) => { if ((e.target as HTMLElement).dataset.stop) return; onExpand() }}
      style={{
        background: selected ? `${meta.color}15` : isCompleted ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${selected ? meta.color + '55' : 'rgba(255,255,255,0.06)'}`,
        borderLeft: `2px solid ${planned ? ACCENT_GOLD : meta.color + '50'}`,
        borderRadius: 5, padding: '8px 10px', cursor: 'pointer', opacity: isCompleted ? 0.5 : 1, transition: 'background 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
        <input type="checkbox" checked={selected} onChange={onSelect} data-stop="1" onClick={(e) => e.stopPropagation()} style={{ marginTop: 2, accentColor: meta.color, cursor: 'pointer' }} />
        <span style={{ fontSize: 12, marginTop: 1, flexShrink: 0 }} aria-hidden="true">{(task as TaskRow & { _tag?: string })._tag ?? '📝'}</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.35, color: isCompleted ? INK_DIM : INK, textDecoration: isCompleted ? 'line-through' : 'none', fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.title}</div>
        <Chip color={PRIORITY_COLOR[task.priority] ?? INK_DIM}>{PRIORITY_SHORT[task.priority] ?? task.priority}</Chip>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: INK_DIM, paddingLeft: 22, flexWrap: 'wrap' }}>
        {project && (
          <Link to={PATHS.project(project.slug)} onClick={(e) => e.stopPropagation()} style={{ color: INK_DIM, textDecoration: 'none', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={project.name}>{project.name}</Link>
        )}
        {task.due_date && <><span style={{ opacity: 0.4 }}>·</span><span style={{ color: dueCol, fontWeight: 500 }}>{dueText}</span></>}
        {planned && <Chip color={ACCENT_GOLD} filled>📌 today</Chip>}
        {task.status === 'waiting_external' && <Chip color={ACCENT_ORANGE} filled>⏳ waiting</Chip>}
        {stale > 0 && <Chip color={ACCENT_ORANGE}>{stale}d stale</Chip>}
        {overdueDays > 0 && <Chip color={ACCENT_CORAL} filled>{overdueDays}d late</Chip>}
        <span style={{ flex: 1 }} />
        <LinksBar task={task} />
      </div>
      {expanded && <InlineDetail task={task} projectName={project?.name} />}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Lanes view — stacked sections
// ──────────────────────────────────────────────────────────────────────────

function LanesView({ byGroup, selected, toggleSelect, expanded, setExpanded, projectsByPid, plannedSet }: { byGroup: Record<GroupKey, TaskRow[]>; selected: Set<string>; toggleSelect: (id: string) => void; expanded: string | null; setExpanded: (id: string | null) => void; projectsByPid: Map<string, { name: string; slug: string }>; plannedSet: Set<string> }) {
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(new Set())
  const [peek, setPeek] = useState<Set<GroupKey>>(new Set())
  const toggleC = (k: GroupKey) => setCollapsed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const toggleP = (k: GroupKey) => setPeek((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 28px 40px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      {GROUP_ORDER.map((gkey) => {
        const meta = GROUP_META[gkey]
        const tasks = byGroup[gkey]
        const isCollapsed = collapsed.has(gkey)
        const isPeek = peek.has(gkey)
        const visible = isCollapsed ? [] : isPeek ? tasks : tasks.slice(0, 4)
        const hidden = tasks.length - visible.length
        const today = todayKey()
        const overdueInLane = tasks.filter((t) => t.due_date && t.due_date.slice(0, 10) < today && t.completed === 0).length
        const plannedInLane = tasks.filter((t) => plannedSet.has(t.id) && t.completed === 0).length
        return (
          <section key={gkey} style={{ marginBottom: 18, background: 'rgba(255,255,255,0.015)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <button
              onClick={() => toggleC(gkey)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderBottom: isCollapsed ? 'none' : `1px solid ${meta.color}25` }}
            >
              <span style={{ fontSize: 14, transition: 'transform 200ms', display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', color: meta.color, width: 10 }}>▾</span>
              <span style={{ fontSize: 16 }}>{meta.icon}</span>
              <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: meta.color, margin: 0 }}>{meta.label}</h3>
              <span style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic', marginLeft: 6 }}>{meta.desc}</span>
              <div style={{ flex: 1 }} />
              {overdueInLane > 0 && <Chip color={ACCENT_CORAL} filled>{overdueInLane} overdue</Chip>}
              {plannedInLane > 0 && <Chip color={ACCENT_GOLD} filled>{plannedInLane} planned</Chip>}
              <span style={{ fontSize: 11, color: INK_MUTED, minWidth: 40, textAlign: 'right' }}>{tasks.length}</span>
            </button>
            {!isCollapsed && (
              <div style={{ padding: '8px 14px 12px' }}>
                {visible.length === 0 && (
                  <div style={{ padding: '12px 4px', fontSize: 12, color: '#5a6068', fontStyle: 'italic' }}>nothing here</div>
                )}
                {visible.map((t) => (
                  <LaneRow
                    key={t.id}
                    task={t}
                    project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                    selected={selected.has(t.id)}
                    onSelect={() => toggleSelect(t.id)}
                    expanded={expanded === t.id}
                    onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                    planned={plannedSet.has(t.id)}
                  />
                ))}
                {hidden > 0 && (
                  <button
                    onClick={() => toggleP(gkey)}
                    style={{ marginTop: 6, padding: '6px 10px', fontSize: 11.5, fontWeight: 500, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4, background: 'transparent', color: INK_DIM, fontFamily: 'inherit', cursor: 'pointer', width: '100%', textAlign: 'center' }}
                  >{isPeek ? '▴ show less' : `▾ +${hidden} more`}</button>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function LaneRow({ task, project, selected, onSelect, expanded, onExpand, planned }: { task: TaskRow; project: { name: string; slug: string } | null; selected: boolean; onSelect: () => void; expanded: boolean; onExpand: () => void; planned: boolean }) {
  const meta = GROUP_META[(task as TaskRow & { _group?: GroupKey })._group ?? 'deep']
  const today = todayKey()
  const overdueDays = task.due_date && task.due_date.slice(0, 10) < today ? daysSince(task.due_date) : 0
  const stale = task.updated_at && daysSince(task.updated_at) >= 10 && task.status === 'in_progress' ? daysSince(task.updated_at) : 0
  const dueText = dueLabel(task.due_date)
  const dueCol = dueColor(task)
  const isCompleted = task.completed === 1 || task.status === 'done'

  return (
    <div>
      <div
        onClick={(e) => { if ((e.target as HTMLElement).dataset.stop) return; onExpand() }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 4, background: selected ? `${meta.color}15` : expanded ? 'rgba(255,255,255,0.03)' : 'transparent', borderLeft: `2px solid ${planned ? ACCENT_GOLD : meta.color + '30'}`, opacity: isCompleted ? 0.5 : 1, cursor: 'pointer', transition: 'background 120ms' }}
      >
        <input type="checkbox" checked={selected} onChange={onSelect} onClick={(e) => e.stopPropagation()} data-stop="1" style={{ accentColor: meta.color, cursor: 'pointer' }} />
        <span style={{ fontSize: 12, flexShrink: 0 }} aria-hidden="true">{(task as TaskRow & { _tag?: string })._tag ?? '📝'}</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: isCompleted ? INK_DIM : INK, textDecoration: isCompleted ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{task.title}</span>
          {project && (
            <Link to={PATHS.project(project.slug)} onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, color: INK_DIM, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 1 160px' }}>{project.name}</Link>
          )}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {planned && <Chip color={ACCENT_GOLD} filled>📌 today</Chip>}
          {task.status === 'waiting_external' && <Chip color={ACCENT_ORANGE} filled>⏳ waiting</Chip>}
          {stale > 0 && <Chip color={ACCENT_ORANGE}>{stale}d stale</Chip>}
          {overdueDays > 0 && <Chip color={ACCENT_CORAL} filled>{overdueDays}d late</Chip>}
          {task.due_date && <span style={{ fontSize: 11, color: dueCol, minWidth: 56, textAlign: 'right' }}>{dueText}</span>}
          <Chip color={PRIORITY_COLOR[task.priority] ?? INK_DIM}>{PRIORITY_SHORT[task.priority] ?? task.priority}</Chip>
          <span style={{ fontSize: 10, color: '#5a6068', marginLeft: 2, width: 10 }}>{expanded ? '▾' : '▸'}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ paddingLeft: 30, paddingRight: 8, marginBottom: 4 }}>
          <InlineDetail task={task} projectName={project?.name} />
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// List view — power mode dense table + drawer
// ──────────────────────────────────────────────────────────────────────────

function ListView({ filtered, selected, toggleSelect, setSelected, setDrawer, projectsByPid, plannedSet }: { filtered: TaskRow[]; selected: Set<string>; toggleSelect: (id: string) => void; setSelected: React.Dispatch<React.SetStateAction<Set<string>>>; setDrawer: (id: string | null) => void; projectsByPid: Map<string, { name: string; slug: string }>; plannedSet: Set<string> }) {
  const [cursor, setCursor] = useState(0)
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (cursor >= filtered.length) setCursor(Math.max(0, filtered.length - 1))
  }, [filtered.length, cursor])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(filtered.length - 1, c + 1)) }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)) }
      else if (e.key === 'x' || e.key === ' ') { e.preventDefault(); const t = filtered[cursor]; if (t) toggleSelect(t.id) }
      else if (e.key === 'e' || e.key === 'Enter') { e.preventDefault(); const t = filtered[cursor]; if (t) setDrawer(t.id) }
      else if (e.key === 'Escape') { setSelected(new Set()) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, cursor, toggleSelect, setDrawer, setSelected])

  useEffect(() => { rowRefs.current[cursor]?.scrollIntoView({ block: 'nearest' }) }, [cursor])

  const kbdStyle = { fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: 9, padding: '1px 4px', background: 'rgba(255,255,255,0.08)', borderRadius: 2, color: INK_MUTED }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 26px 1fr 150px 76px 38px 80px 80px 70px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5a6068', position: 'sticky', top: 0, background: PAGE_BG, zIndex: 1 }}>
          <div></div><div></div>
          <div>Title</div><div>Project</div><div>Due</div><div>P</div>
          <div>Status</div><div>Owner</div><div style={{ textAlign: 'right' }}>Links</div>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#5a6068', fontSize: 13, fontStyle: 'italic' }}>no tasks match</div>
        )}
        {filtered.map((t, i) => (
          <ListRow
            key={t.id}
            task={t}
            project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
            isCursor={i === cursor}
            isSelected={selected.has(t.id)}
            onClick={() => setCursor(i)}
            onDouble={() => setDrawer(t.id)}
            onSelect={() => toggleSelect(t.id)}
            refSet={(el) => { rowRefs.current[i] = el }}
            planned={plannedSet.has(t.id)}
          />
        ))}
      </div>
      <div style={{ padding: '5px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)', fontSize: 10, color: '#5a6068', display: 'flex', gap: 14, fontFamily: 'var(--font-mono), JetBrains Mono, monospace', flexShrink: 0 }}>
        <span>{filtered.length > 0 ? `${cursor + 1}/${filtered.length}` : '0/0'}</span>
        <span style={{ flex: 1 }} />
        <span><kbd style={kbdStyle}>j</kbd>/<kbd style={kbdStyle}>k</kbd> move</span>
        <span><kbd style={kbdStyle}>x</kbd> select</span>
        <span><kbd style={kbdStyle}>e</kbd>/<kbd style={kbdStyle}>⏎</kbd> drawer</span>
        <span><kbd style={kbdStyle}>esc</kbd> deselect</span>
      </div>
    </div>
  )
}

function ListRow({ task, project, isCursor, isSelected, onClick, onDouble, onSelect, refSet, planned }: { task: TaskRow; project: { name: string; slug: string } | null; isCursor: boolean; isSelected: boolean; onClick: () => void; onDouble: () => void; onSelect: () => void; refSet: (el: HTMLDivElement | null) => void; planned: boolean }) {
  const meta = GROUP_META[(task as TaskRow & { _group?: GroupKey })._group ?? 'deep']
  const today = todayKey()
  const overdueDays = task.due_date && task.due_date.slice(0, 10) < today ? daysSince(task.due_date) : 0
  const stale = task.updated_at && daysSince(task.updated_at) >= 10 && task.status === 'in_progress' ? daysSince(task.updated_at) : 0
  const dueText = dueLabel(task.due_date)
  const dueCol = dueColor(task)
  const isCompleted = task.completed === 1 || task.status === 'done'

  return (
    <div
      ref={refSet}
      onClick={onClick}
      onDoubleClick={onDouble}
      style={{ display: 'grid', gridTemplateColumns: '32px 26px 1fr 150px 76px 38px 80px 80px 70px', padding: '5px 16px', alignItems: 'center', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: `3px solid ${isCursor ? meta.color : planned ? ACCENT_GOLD : 'transparent'}`, background: isCursor ? `${meta.color}12` : isSelected ? 'rgba(201,168,76,0.06)' : 'transparent', opacity: isCompleted ? 0.5 : 1, cursor: 'pointer' }}
    >
      <div style={{ color: meta.color, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>{isCursor ? '▶' : ''}</div>
      <div><input type="checkbox" checked={isSelected} onChange={onSelect} onClick={(e) => e.stopPropagation()} style={{ accentColor: meta.color, cursor: 'pointer' }} /></div>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isCompleted ? INK_DIM : INK, textDecoration: isCompleted ? 'line-through' : 'none', fontWeight: 500, paddingRight: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color + '80', flexShrink: 0 }} />
        <span style={{ fontSize: 11, flexShrink: 0 }} aria-hidden="true">{(task as TaskRow & { _tag?: string })._tag ?? '📝'}</span>
        {task.title}
        {planned && <span style={{ fontSize: 9, color: ACCENT_GOLD, fontWeight: 700, letterSpacing: '0.1em' }}>PLANNED</span>}
        {overdueDays > 0 && <span style={{ fontSize: 9, color: ACCENT_CORAL, fontWeight: 700 }}>{overdueDays}d LATE</span>}
        {stale > 0 && <span style={{ fontSize: 9, color: ACCENT_ORANGE }}>{stale}d stale</span>}
      </div>
      <div style={{ fontSize: 11, color: INK_DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project?.name ?? '—'}</div>
      <div style={{ fontSize: 11, color: dueCol, fontWeight: 500 }}>{task.due_date ? dueText : '—'}</div>
      <div><Chip color={PRIORITY_COLOR[task.priority] ?? INK_DIM}>{PRIORITY_SHORT[task.priority] ?? task.priority}</Chip></div>
      <div style={{ fontSize: 10.5, color: STATUS_COLOR[task.status] ?? INK_DIM }}>{STATUS_LABEL[task.status] ?? task.status}</div>
      <div style={{ fontSize: 11, color: task.assignee?.toLowerCase().includes('nick') ? INK : ACCENT_TEAL, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.assignee}</div>
      <div style={{ textAlign: 'right' }}><LinksBar task={task} /></div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Side drawer — List view only (cursor-stable)
// ──────────────────────────────────────────────────────────────────────────

function TaskDrawer({ task, project, onClose }: { task: TaskRow; project: { name: string; slug: string } | null; onClose: () => void }) {
  const meta = GROUP_META[(task as TaskRow & { _group?: GroupKey })._group ?? 'deep']
  const detailQuery = useTaskDetail(task.id)
  const detail = detailQuery.data
  const why = detail?.why ?? task.description?.split('\n')[0]?.trim() ?? null
  const subtasks = detail?.subtasks ?? []
  const updates = detail?.updates ?? []
  const blocks = detail?.blocks ?? []
  return (
    <aside style={{ width: 380, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#0a0f15', overflowY: 'auto', padding: '18px 18px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 14 }}>{meta.icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: meta.color }}>{meta.label}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: INK_DIM, cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 12px', lineHeight: 1.35, letterSpacing: '-0.01em' }}>{task.title}</h3>
      {why && (
        <div style={{ fontSize: 11.5, color: ACCENT_GOLD, marginBottom: 14, fontStyle: 'italic', padding: '9px 12px', background: 'rgba(201,168,76,0.05)', borderLeft: `2px solid ${ACCENT_GOLD}`, borderRadius: 3 }}>
          💡 {why}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <button style={{ padding: '5px 12px', fontSize: 11.5, borderRadius: 4, border: `1px solid ${ACCENT_GOLD}`, background: ACCENT_GOLD, color: PAGE_BG, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>▶ Work on this</button>
        <button style={{ padding: '5px 12px', fontSize: 11.5, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: INK, fontFamily: 'inherit', cursor: 'pointer' }}>📌 Plan today</button>
      </div>
      <dl style={{ fontSize: 11, color: INK_MUTED, margin: 0, display: 'grid', gridTemplateColumns: '80px 1fr', rowGap: 8, columnGap: 8 }}>
        <Term>Project</Term><Defn>{project ? <Link to={PATHS.project(project.slug)} style={{ color: ACCENT_TEAL, textDecoration: 'none' }}>{project.name}</Link> : '—'}</Defn>
        <Term>Due</Term><Defn style={{ color: dueColor(task) }}>{task.due_date ?? '—'}</Defn>
        <Term>Priority</Term><Defn><Chip color={PRIORITY_COLOR[task.priority] ?? INK_DIM}>{PRIORITY_SHORT[task.priority] ?? task.priority}</Chip></Defn>
        <Term>Status</Term><Defn style={{ color: STATUS_COLOR[task.status] ?? INK_DIM }}>{STATUS_LABEL[task.status] ?? task.status}</Defn>
        <Term>Owner</Term><Defn>{task.assignee}</Defn>
        <Term>Updated</Term><Defn>{task.updated_at?.slice(0, 10) ?? '—'}</Defn>
      </dl>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 6 }}>Subtasks</div>
        {detailQuery.isLoading && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>Loading…</div>}
        {!detailQuery.isLoading && subtasks.length === 0 && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>None yet.</div>}
        {subtasks.map((s) => (
          <div key={s.id} style={{ display: 'flex', gap: 6, padding: '3px 0', alignItems: 'flex-start' }}>
            <input type="checkbox" defaultChecked={s.completed === 1} style={{ marginTop: 2, accentColor: ACCENT_GREEN, cursor: 'pointer' }} />
            <span style={{ fontSize: 12, color: s.completed === 1 ? INK_DIM : INK, textDecoration: s.completed === 1 ? 'line-through' : 'none', lineHeight: 1.4 }}>{s.title}</span>
          </div>
        ))}
        {blocks.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_ORANGE, marginBottom: 4 }}>Blocks</div>
            {blocks.map((b) => (
              <div key={b.id} style={{ fontSize: 11, color: INK, padding: '2px 0' }}>↳ {b.title}</div>
            ))}
          </div>
        )}
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 6 }}>Recent updates</div>
        {detailQuery.isLoading && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>Loading…</div>}
        {!detailQuery.isLoading && updates.length === 0 && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>No updates logged.</div>}
        {updates.slice(0, 6).map((u, i) => {
          const isHermes = u.who === 'claude-ai' || u.who === 'hermes'
          const isMe = u.who === 'nick-ingraham' || u.who === 'nick'
          const color = isHermes ? ACCENT_GOLD : isMe ? ACCENT_TEAL : INK_MUTED
          return (
            <div key={u.id ?? i} style={{ padding: '6px 0', borderBottom: i < updates.length - 1 && i < 5 ? '1px dashed rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color, letterSpacing: '0.04em' }}>{isHermes ? 'Hermes' : u.who}</span>
                <span style={{ fontSize: 10, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{u.when?.slice(0, 16) ?? ''}</span>
              </div>
              <div style={{ fontSize: 11.5, color: INK, lineHeight: 1.45 }}>{u.text}</div>
              {u.kind === 'note' && u.id && (
                <div style={{ marginTop: 4 }}>
                  <ReactionBar targetType="task_update" targetId={u.id} compact />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <SmartCompose taskId={task.id} placeholder="Jot something or @hermes to delegate…" boxed />
    </aside>
  )
}

function Term({ children }: { children: React.ReactNode }) {
  return <dt style={{ color: '#5a6068', letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 9 }}>{children}</dt>
}
function Defn({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <dd style={{ margin: 0, ...style }}>{children}</dd>
}

// ──────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────

export default function UnifiedMyTasks() {
  usePageMeta('My Tasks · MN-CCORE', 'Library / workbench for triage, filtering, and bulk actions across all your tasks.')
  const { user } = useAuth()
  const userSlug = emailToSlug(user?.email)

  const tasksQuery = useTasks(userSlug ? { assignee: userSlug } : undefined)
  const projectsQuery = useProjects()

  // URL-backed state so DD-2 saved views can capture/restore via the
  // SavedViewsMenu. View persists to localStorage too (per CD memory)
  // so first-load picks up last shape even if URL is bare.
  const [searchParams, setSearchParams] = useSearchParams()

  const initialView: ViewMode = (() => {
    const fromUrl = searchParams.get('view') as ViewMode | null
    if (fromUrl === 'columns' || fromUrl === 'lanes' || fromUrl === 'list') return fromUrl
    try { return (window.localStorage.getItem('mt_view') as ViewMode) || 'columns' } catch { return 'columns' }
  })()
  const [view, setView] = useState<ViewMode>(initialView)
  useEffect(() => {
    try { window.localStorage.setItem('mt_view', view) } catch { /* ignore */ }
  }, [view])

  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [filter, setFilter] = useState<FilterState>({
    priority: searchParams.get('priority'),
    project: searchParams.get('project'),
    mentee: null,
    group: (searchParams.get('group') as GroupKey | null) ?? null,
    hideCompleted: searchParams.get('hideCompleted') !== '0',
  })
  const [quickView, setQuickView] = useState<QuickViewKey>(
    (searchParams.get('filter') as QuickViewKey | null) ?? 'all'
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drawer, setDrawer] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Round-trip state into the URL so SavedViewsMenu's `currentQuery` capture
  // and restore round-trip is just URLSearchParams stringification.
  useEffect(() => {
    const next = new URLSearchParams()
    if (search) next.set('q', search)
    if (quickView !== 'all') next.set('filter', quickView)
    if (view !== 'columns') next.set('view', view)
    if (filter.priority) next.set('priority', filter.priority)
    if (filter.project) next.set('project', filter.project)
    if (filter.group) next.set('group', filter.group)
    if (!filter.hideCompleted) next.set('hideCompleted', '0')
    // Avoid spamming history: replace, not push.
    setSearchParams(next, { replace: true })
  }, [search, quickView, view, filter, setSearchParams])

  const currentQuery = searchParams.toString()
  const applyView = useCallback((q: string) => {
    const p = new URLSearchParams(q)
    setSearch(p.get('q') ?? '')
    setQuickView((p.get('filter') as QuickViewKey | null) ?? 'all')
    const v = p.get('view') as ViewMode | null
    if (v === 'columns' || v === 'lanes' || v === 'list') setView(v)
    else setView('columns')
    setFilter({
      priority: p.get('priority'),
      project: p.get('project'),
      mentee: null,
      group: (p.get('group') as GroupKey | null) ?? null,
      hideCompleted: p.get('hideCompleted') !== '0',
    })
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  // Re-read planned set on each render so /portal/dashboard updates flow through.
  const plannedSet = useMemo(() => readPlannedToday(), [tasksQuery.data])

  const projectsByPid = useMemo(() => {
    const m = new Map<string, { name: string; slug: string; category?: string | null }>()
    for (const p of projectsQuery.data ?? []) {
      m.set(p.slug, { name: p.title ?? p.slug, slug: p.slug, category: p.category ?? null })
    }
    return m
  }, [projectsQuery.data])

  const projectOptions: FilterOption[] = useMemo(() => (
    (projectsQuery.data ?? []).map((p) => ({ v: p.slug, l: p.title ?? p.slug }))
  ), [projectsQuery.data])

  const allTasks = tasksQuery.data ?? []
  const today = todayKey()

  // Apply quick-view + filters + search.
  const filtered = useMemo(() => {
    let base: TaskRow[] = allTasks
    if (quickView === 'today') base = base.filter((t) => plannedSet.has(t.id) || t.due_date?.slice(0, 10) === today)
    if (quickView === 'overdue') base = base.filter((t) => t.due_date && t.due_date.slice(0, 10) < today && t.completed === 0)
    if (quickView === 'waiting') base = base.filter((t) => t.status === 'waiting_external' && t.completed === 0)
    if (quickView === 'stale') base = base.filter((t) => daysSince(t.updated_at) >= 10 && t.status === 'in_progress' && t.completed === 0)
    return base.filter((t) => {
      if (filter.hideCompleted && (t.completed === 1 || t.status === 'done')) return false
      if (filter.priority && t.priority !== filter.priority) return false
      if (filter.project && t.project_id !== filter.project) return false
      if (filter.mentee) {
        // '__any_mentee__' = any researchTeam slug; specific slug = exact match
        if (filter.mentee === '__any_mentee__') {
          if (!t.assignee || !MENTEE_SLUGS.has(t.assignee)) return false
        } else if (t.assignee !== filter.mentee) return false
      }
      if (filter.group) {
        if (getGroupForTask(t, projectsByPid) !== filter.group) return false
      }
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    }).map((t) => ({ ...t, _group: getGroupForTask(t, projectsByPid), _tag: tagForTask(t, projectsByPid) }) as TaskRow & { _group: GroupKey; _tag: string })
  }, [allTasks, filter, search, quickView, plannedSet, today, projectsByPid])

  // Bucket by group, then sort each bucket: planned → active → done.
  // CLAUDE.md Rule 62: planned tasks float to top, done sinks to bottom with strikethrough.
  const byGroup = useMemo(() => {
    const g: Record<GroupKey, TaskRow[]> = { deep: [], priorities: [], quick: [], pb: [], etl: [] }
    for (const t of filtered) {
      const k = (t as TaskRow & { _group: GroupKey })._group
      g[k].push(t)
    }
    const rank = (t: TaskRow): number => {
      if (t.completed === 1 || t.status === 'done') return 2 // done sinks
      if (plannedSet.has(t.id)) return 0                     // planned floats
      return 1                                                 // active middle
    }
    for (const k of GROUP_ORDER) {
      g[k].sort((a, b) => rank(a) - rank(b))
    }
    return g
  }, [filtered, plannedSet])

  const drawerTask = drawer ? allTasks.find((t) => t.id === drawer) ?? null : null
  const drawerProject = drawerTask?.project_id ? projectsByPid.get(drawerTask.project_id) ?? null : null

  // ── Bulk actions wired to real API ─────────────────────────
  const bulkUpdate = useBulkUpdateTasks()
  const updateTask = useUpdateTask()
  const undoToast = useUndoToast()

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  const onBulkPlanToday = useCallback(() => {
    // Writes to today_state localStorage so TodayPage picks them up.
    const key = `today_state_${todayKey()}`
    let snap: { rightNow?: string | null; planned?: Record<string, { slot: string }>; done?: Record<string, boolean> } = {}
    try { snap = JSON.parse(window.localStorage.getItem(key) || '{}') } catch { /* ignore */ }
    snap.planned = snap.planned ?? {}
    for (const id of selected) snap.planned[id] = { slot: 'strip' }
    try { window.localStorage.setItem(key, JSON.stringify(snap)) } catch { /* ignore */ }
    undoToast.showSuccess(`Planned ${selected.size} task${selected.size === 1 ? '' : 's'} for today`)
    clearSelection()
  }, [selected, clearSelection, undoToast])

  const onBulkSnoozeDay = useCallback(() => {
    // No batch due_date action; loop via single-task updates.
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const due = tomorrow.toISOString().split('T')[0]
    const ids = [...selected]
    Promise.all(ids.map((id) => updateTask.mutateAsync({ id, fields: { due_date: due } })))
      .then(() => { undoToast.showSuccess(`Snoozed ${ids.length} task${ids.length === 1 ? '' : 's'} +1d`); clearSelection() })
      .catch((err) => { console.error('Snooze failed:', err); alert('Snooze failed') })
  }, [selected, updateTask, clearSelection, undoToast])

  const onBulkComplete = useCallback(() => {
    const ids = [...selected]
    bulkUpdate.mutate({ ids, action: 'complete' }, {
      onSuccess: () => { undoToast.showSuccess(`Completed ${ids.length} task${ids.length === 1 ? '' : 's'}`); clearSelection() },
    })
  }, [selected, bulkUpdate, clearSelection, undoToast])

  const onBulkArchive = useCallback(() => {
    if (!window.confirm(`Archive ${selected.size} task${selected.size === 1 ? '' : 's'}? They'll be soft-deleted.`)) return
    const ids = [...selected]
    bulkUpdate.mutate({ ids, action: 'delete' }, {
      onSuccess: () => { undoToast.showSuccess(`Archived ${ids.length} task${ids.length === 1 ? '' : 's'}`); clearSelection() },
    })
  }, [selected, bulkUpdate, clearSelection, undoToast])

  const onBulkReassign = useCallback((slug: string) => {
    const ids = [...selected]
    bulkUpdate.mutate({ ids, action: 'assign', value: slug }, {
      onSuccess: () => { undoToast.showSuccess(`Reassigned ${ids.length} task${ids.length === 1 ? '' : 's'} → ${slug}`); clearSelection() },
    })
  }, [selected, bulkUpdate, clearSelection, undoToast])

  const onBulkPriority = useCallback((priority: string) => {
    const ids = [...selected]
    bulkUpdate.mutate({ ids, action: 'priority', value: priority }, {
      onSuccess: () => { undoToast.showSuccess(`Set priority → ${priority} for ${ids.length} task${ids.length === 1 ? '' : 's'}`); clearSelection() },
    })
  }, [selected, bulkUpdate, clearSelection, undoToast])

  const onBulkStatus = useCallback((status: string) => {
    const ids = [...selected]
    bulkUpdate.mutate({ ids, action: 'status', value: status }, {
      onSuccess: () => { undoToast.showSuccess(`Set status → ${status} for ${ids.length} task${ids.length === 1 ? '' : 's'}`); clearSelection() },
    })
  }, [selected, bulkUpdate, clearSelection, undoToast])

  // Assignee options for bulk Reassign picker — directors + research team + faculty.
  // Uses the same researchTeam used for the Mentee filter.
  const assigneeOptions = useMemo(() => {
    const all: Array<{ slug: string; name: string }> = []
    all.push({ slug: 'nick-ingraham', name: 'Nick Ingraham' })
    all.push({ slug: 'nida-mohamud', name: 'Nida Mohamud' })
    for (const m of researchTeam) if (m.slug) all.push({ slug: m.slug, name: m.name })
    return all
  }, [])

  const isLoading = tasksQuery.isLoading || projectsQuery.isLoading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: PAGE_BG, color: INK, fontFamily: 'var(--font-sans), \'DM Sans\', system-ui, sans-serif', overflow: 'hidden' }}>
      <TopBar
        view={view} setView={setView}
        search={search} setSearch={setSearch}
        filter={filter} setFilter={setFilter}
        quickView={quickView} setQuickView={setQuickView}
        taskCount={filtered.length}
        projectOptions={projectOptions}
        currentQuery={currentQuery}
        onApplyView={applyView}
      />
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onClear={clearSelection}
          onPlanToday={onBulkPlanToday}
          onSnoozeDay={onBulkSnoozeDay}
          onComplete={onBulkComplete}
          onArchive={onBulkArchive}
          onReassign={onBulkReassign}
          onPriority={onBulkPriority}
          onStatus={onBulkStatus}
          assigneeOptions={assigneeOptions}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 24 }}><TableSkeleton /></div>
          ) : view === 'columns' ? (
            <ColumnsView filtered={filtered} byGroup={byGroup} selected={selected} toggleSelect={toggleSelect} expanded={expanded} setExpanded={setExpanded} projectsByPid={projectsByPid} plannedSet={plannedSet} />
          ) : view === 'lanes' ? (
            <LanesView byGroup={byGroup} selected={selected} toggleSelect={toggleSelect} expanded={expanded} setExpanded={setExpanded} projectsByPid={projectsByPid} plannedSet={plannedSet} />
          ) : (
            <ListView filtered={filtered} selected={selected} toggleSelect={toggleSelect} setSelected={setSelected} setDrawer={setDrawer} projectsByPid={projectsByPid} plannedSet={plannedSet} />
          )}
        </div>
        {drawerTask && <TaskDrawer task={drawerTask} project={drawerProject} onClose={() => setDrawer(null)} />}
      </div>
    </div>
  )
}

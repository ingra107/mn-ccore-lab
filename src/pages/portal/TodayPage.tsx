// TodayPage — the operating-day landing surface (Today B2).
// Port from review/handoff_today_my_tasks_2026.04.24/today-explore/option-b2.jsx.
//
// Routes:
//   /portal/dashboard   → this page (after route flip)
//   /portal/overview    → old card-grid Dashboard renamed Lab Overview
//
// Design language: dark-first, gold/teal/coral accents with assigned meaning
// (CLAUDE.md Rule 54). Click body = expand drawer; drag handle = plan;
// explicit ▶ button = promote (Rule 53).
//
// P0 scope: route + skeleton + real-data wiring for tasks/meetings/projects.
// P1 will fill in the TaskDetailDrawer's `details` block from
// /api/tasks/:id/detail. Calendar integration stays empty-state for now.

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTasks, useProjects, useMeetingsApi, useExpiringRegulatory, useTaskDetail } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { usePageMeta } from '../../hooks/usePageMeta'
import { PATHS } from '../../constants/paths'
import HeartbeatLine from '../../components/HeartbeatLine'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import ReactionBar from '../../components/ReactionBar'
import SmartCompose from '../../components/SmartCompose'
import { researchTeam } from '../../data/team'
import type { TaskRow } from '../../lib/api'
import type { MeetingRow } from '../../hooks/useApiData'

// ──────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ──────────────────────────────────────────────────────────────────────────

type GroupKey = 'deep' | 'priorities' | 'quick' | 'pb' | 'etl'
type PlannedSlot = 'strip' | `between-${number}`

interface GroupMeta {
  label: string
  icon: string
  color: string
}

const GROUP_META: Record<GroupKey, GroupMeta> = {
  deep:       { label: 'Deep work',        icon: '🎯', color: '#c9a84c' },
  priorities: { label: 'Priorities',       icon: '✅', color: '#5cbcb4' },
  quick:      { label: 'Quick',            icon: '⚡', color: '#f08a5b' },
  pb:         { label: 'Peripheral Brain', icon: '🧠', color: '#b0b5b9' },
  etl:        { label: 'CQODE · CLIF ETL', icon: '🔧', color: '#5cbcb4' },
}

const GROUP_ORDER: GroupKey[] = ['deep', 'priorities', 'quick', 'pb', 'etl']

// Map a task to one of the 5 groups. Order matters (first match wins).
function getGroupForTask(t: TaskRow, projectsBySlug: Map<string, { category?: string | null; slug: string }>): GroupKey {
  // Hub-explicit override wins (schema v50). Same rule as UnifiedMyTasks.
  if (t.group_override && (['deep', 'priorities', 'quick', 'pb', 'etl'] as const).includes(t.group_override)) {
    return t.group_override
  }
  // PB bucket — broadened: source flag, title prefix, project slug pattern,
  // or project category. Catches "Peripheral Brain" variations that the
  // narrow source='pb' check missed in the eval (review/pre-merge-2026-04-25/EVAL.md Issue 4).
  if (t.source === 'pb') return 'pb'
  if (/^(pb|peripheral.?brain)\s*[:\-—]/i.test(t.title)) return 'pb'
  const proj = t.project_id ? projectsBySlug.get(t.project_id) : null
  const projSlug = proj?.slug || ''
  const projCat = proj?.category || ''
  if (projCat === 'pb' || /(^|\W)(pb|peripheral.?brain)(\W|$)/i.test(projSlug)) return 'pb'
  if (/cqode|clif-etl|etl/i.test(projSlug) || /CQODE|ETL/.test(t.title)) return 'etl'
  if (projCat === 'clif' && /etl|ingest|backbone/i.test(t.title)) return 'etl'
  if (t.priority === 'urgent' || t.priority === 'high') return 'priorities'
  if (t.priority === 'low') return 'quick'
  return 'deep'
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Tag glyph for a task — left-of-title category cue per CD spec.
// Mirrors UnifiedMyTasks tagForTask; consider extracting if a third surface needs it.
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

// Sync staleness lookup — last successful sync timestamp from localStorage.
// Coral if >24h per Rule 59. Returns hours-since-sync or Infinity if never synced.
function hoursSinceLastSync(): number {
  try {
    const raw = window.localStorage.getItem('mnccore_last_sync_at')
    if (!raw) return Infinity
    const t = new Date(raw).getTime()
    if (isNaN(t)) return Infinity
    return Math.floor((Date.now() - t) / 3600000)
  } catch { return Infinity }
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity
  const d = new Date(iso)
  if (isNaN(d.getTime())) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// ──────────────────────────────────────────────────────────────────────────
// useTodayState — localStorage-backed daily plan (rightNow / planned / done)
// ──────────────────────────────────────────────────────────────────────────

interface TodayStateShape {
  rightNow: string | null
  planned: Record<string, { slot: PlannedSlot }>
  done: Record<string, boolean>
}

interface TodayStateApi extends TodayStateShape {
  plannedIds: () => string[]
  promote: (id: string) => void
  markDone: (id: string) => void
  uncheck: (id: string) => void
  planAt: (id: string, slot: PlannedSlot) => void
  unplan: (id: string) => void
}

function useTodayState(allTaskIds: string[]): TodayStateApi {
  const storageKey = `today_state_${todayKey()}`
  const [state, setState] = useState<TodayStateShape>(() => {
    if (typeof window === 'undefined') return { rightNow: null, planned: {}, done: {} }
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) return JSON.parse(raw) as TodayStateShape
    } catch { /* ignore */ }
    return { rightNow: null, planned: {}, done: {} }
  })

  // Persist on change.
  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(state)) } catch { /* ignore */ }
  }, [state, storageKey])

  // Trim entries pointing at tasks no longer in the data set.
  useEffect(() => {
    const ids = new Set(allTaskIds)
    setState((prev) => {
      let changed = false
      const next: TodayStateShape = { ...prev, planned: { ...prev.planned }, done: { ...prev.done } }
      for (const id of Object.keys(next.planned)) if (!ids.has(id)) { delete next.planned[id]; changed = true }
      for (const id of Object.keys(next.done)) if (!ids.has(id)) { delete next.done[id]; changed = true }
      if (next.rightNow && !ids.has(next.rightNow)) { next.rightNow = null; changed = true }
      return changed ? next : prev
    })
  }, [allTaskIds])

  const plannedIds = useCallback(() => Object.keys(state.planned).filter((id) => !state.done[id]), [state])

  const promote = useCallback((id: string) => {
    setState((p) => ({
      ...p,
      planned: p.planned[id] ? p.planned : { ...p.planned, [id]: { slot: 'strip' } },
      rightNow: id,
    }))
  }, [])

  const markDone = useCallback((id: string) => {
    setState((p) => {
      const nextDone = { ...p.done, [id]: true }
      const nextPlanned = { ...p.planned }
      delete nextPlanned[id]
      let nextRight = p.rightNow
      if (id === p.rightNow) {
        const remaining = Object.keys(nextPlanned).filter((k) => !nextDone[k])
        nextRight = remaining[0] || null
      }
      return { rightNow: nextRight, planned: nextPlanned, done: nextDone }
    })
  }, [])

  const uncheck = useCallback((id: string) => {
    setState((p) => {
      const nextDone = { ...p.done }
      delete nextDone[id]
      return { ...p, done: nextDone }
    })
  }, [])

  const planAt = useCallback((id: string, slot: PlannedSlot) => {
    setState((p) => ({ ...p, planned: { ...p.planned, [id]: { slot } } }))
  }, [])

  const unplan = useCallback((id: string) => {
    setState((p) => {
      const nextPlanned = { ...p.planned }
      delete nextPlanned[id]
      return { ...p, planned: nextPlanned, rightNow: p.rightNow === id ? null : p.rightNow }
    })
  }, [])

  return { ...state, plannedIds, promote, markDone, uncheck, planAt, unplan }
}

// ──────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ──────────────────────────────────────────────────────────────────────────

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

type LinkKind = 'folder' | 'claude' | 'email' | 'draft' | 'brief' | 'doc'

function LinkIcon({ kind, size = 12 }: { kind: LinkKind; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'folder': return (<svg {...common}><path d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z" /></svg>)
    case 'claude': return (<svg {...common}><polygon points="5,3 13,8 5,13" /></svg>)
    case 'email':  return (<svg {...common}><rect x="2" y="4" width="12" height="9" rx="1" /><path d="m2 5 6 4 6-4" /></svg>)
    case 'draft':  return (<svg {...common}><path d="M10 2 14 6 6 14H2v-4Z" /></svg>)
    case 'brief':
    case 'doc':    return (<svg {...common}><path d="M3 3h7l3 3v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M5 8h6M5 11h4" /></svg>)
    default: return null
  }
}

function LinkRow({ links }: { links: LinkKind[] }) {
  if (!links.length) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {links.map((k, i) => (
        <a
          key={i}
          href="#"
          title={k}
          onClick={(e) => e.preventDefault()}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: 4, color: INK_MUTED,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            textDecoration: 'none', transition: 'all 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT_GOLD; e.currentTarget.style.borderColor = 'rgba(201,168,76,0.30)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = INK_MUTED; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
        >
          <LinkIcon kind={k} />
        </a>
      ))}
    </span>
  )
}

function ProjectLink({ name, slug }: { name: string | null; slug?: string | null }) {
  if (!name) return null
  const inner = (
    <span
      className="b2-proj-link"
      style={{ fontSize: 11, color: INK_MUTED, opacity: 0.7, textDecoration: 'none', transition: 'all 150ms', cursor: slug ? 'pointer' : 'default' }}
    >
      ({name})
    </span>
  )
  if (!slug) return inner
  return (
    <Link to={PATHS.project(slug)} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  )
}

interface PillProps {
  icon: string
  label: string
  count?: number
  color?: string
  onClick?: () => void
  emphasis?: boolean
  title?: string
}

function Pill({ icon, label, count, color = INK_MUTED, onClick, emphasis = false, title }: PillProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: emphasis ? '6px 12px' : '5px 10px',
        background: emphasis ? `${color}14` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${emphasis ? color + '55' : color + '30'}`,
        borderRadius: 999, cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'inherit', color: emphasis ? color : INK,
        fontSize: 12, fontWeight: 500, transition: 'all 150ms', whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${color}22`; e.currentTarget.style.borderColor = color + '70' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = emphasis ? `${color}14` : 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = emphasis ? color + '55' : color + '30' }}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>
      {count !== undefined && (
        <span style={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
      <span style={{ color: 'inherit' }}>{label}</span>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Pill strip — clickable daily glance
// ──────────────────────────────────────────────────────────────────────────

interface DailyCounts {
  overdue: number
  stalled: number
  planned: number
  meetings: number
  doneToday: number
}

function PillStrip({ counts }: { counts: DailyCounts }) {
  const labHealth = Math.max(0, 100 - counts.overdue * 4 - counts.stalled * 2)
  const healthColor = labHealth >= 85 ? ACCENT_GREEN : labHealth >= 70 ? ACCENT_GOLD : ACCENT_CORAL
  const scrollTo = (sel: string) => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
      <Pill icon="🔴" color={ACCENT_CORAL} count={counts.overdue} label="overdue" title="Jump to Needs Attention" onClick={() => scrollTo('[data-b2-attention]')} />
      <Pill icon="🕰" color={ACCENT_ORANGE} count={counts.stalled} label="stalled" title="Stalled projects — no activity in 10+ days" onClick={() => scrollTo('[data-b2-attention]')} />
      <Pill icon="📌" color={ACCENT_GOLD} count={counts.planned} label="planned today" title="Scroll to planned queue" onClick={() => scrollTo('[data-b2-timeline]')} />
      <Pill icon="📅" color={ACCENT_TEAL} count={counts.meetings} label="meetings" title="Scroll to today's timeline" onClick={() => scrollTo('[data-b2-timeline]')} />
      <Pill icon="✓" color={ACCENT_GREEN} count={counts.doneToday} label="done today" title="Scroll to completed" onClick={() => scrollTo('[data-b2-completed]')} />
      <div style={{ flex: 1 }} />
      <Link
        to={PATHS.overview}
        title="Lab Overview"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: `${healthColor}10`, border: `1px solid ${healthColor}50`, borderRadius: 999, textDecoration: 'none', transition: 'all 150ms' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = `${healthColor}20` }}
        onMouseLeave={(e) => { e.currentTarget.style.background = `${healthColor}10` }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: healthColor }}>Lab health</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: healthColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{labHealth}</span>
        <span style={{ fontSize: 11, color: INK_MUTED }}>{counts.overdue} overdue · {counts.stalled} stalled</span>
      </Link>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Right Now — promoted slot
// ──────────────────────────────────────────────────────────────────────────

function RightNow({ task, project, queueTasks, state }: { task: TaskRow | null; project: { name: string; slug: string } | null; queueTasks: Array<{ id: string; title: string }>; state: TodayStateApi }) {
  const [expanded, setExpanded] = useState(false)
  if (!task) {
    return (
      <div style={{ padding: '16px 20px', marginBottom: 20, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: INK_DIM, marginRight: 10 }}>Right now · empty</span>
        <span style={{ fontSize: 13, color: INK_MUTED }}>No planned tasks. Drag ⋮⋮ up or click a task to promote.</span>
      </div>
    )
  }
  // Build LinkRow set from task's key_link fields (CD spec — hero shows links inline).
  const heroLinks: LinkKind[] = []
  if (task.key_link_1) heroLinks.push('folder')
  if (task.key_link_2) heroLinks.push('claude')
  if (task.key_link_3) heroLinks.push('brief')

  return (
    <div style={{ marginBottom: 20, background: 'linear-gradient(90deg, rgba(201,168,76,0.12), rgba(201,168,76,0.02))', border: '1px solid rgba(201,168,76,0.28)', borderLeft: `3px solid ${ACCENT_GOLD}`, borderRadius: 8, boxShadow: '0 0 24px rgba(201,168,76,0.06)' }}>
      <div style={{ display: 'flex', gap: 14, padding: '12px 18px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT_GOLD, boxShadow: `0 0 8px ${ACCENT_GOLD}`, animation: 'b2pulse 1.6s ease-in-out infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: ACCENT_GOLD, flexShrink: 0 }}>Right now</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em', flex: 1, minWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
        {project && (
          <Link to={PATHS.project(project.slug)} style={{ fontSize: 11, color: ACCENT_GOLD, fontWeight: 500, flexShrink: 0, textDecoration: 'none' }}>{project.name}</Link>
        )}
        <button onClick={() => setExpanded(true)} title="Expand and focus chat" style={{ padding: '5px 10px', background: ACCENT_GOLD, color: PAGE_BG, border: 'none', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>▶ Work</button>
        <button onClick={() => state.markDone(task.id)} style={{ padding: '5px 10px', background: 'transparent', color: INK, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>✓ Done</button>
        <LinkRow links={heroLinks} />
        <button onClick={() => setExpanded(!expanded)} title={expanded ? 'Collapse' : 'Expand'} style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 12, cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}>{expanded ? '▾' : '▸'}</button>
      </div>
      {queueTasks.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 18px 10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT_GOLD, opacity: 0.75 }}>Queue →</span>
          {queueTasks.map((q) => (
            <button
              key={q.id}
              onClick={() => state.promote(q.id)}
              style={{ padding: '3px 9px', background: 'rgba(201,168,76,0.06)', color: ACCENT_GOLD, border: '1px solid rgba(201,168,76,0.22)', borderRadius: 999, fontFamily: 'inherit', fontSize: 11, fontWeight: 500, cursor: 'pointer', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              ↻ {q.title}
            </button>
          ))}
        </div>
      )}
      {expanded && (
        <div style={{ padding: '0 18px 14px', borderTop: '1px dashed rgba(201,168,76,0.18)', paddingTop: 10 }}>
          {task.description && (
            <div style={{ fontSize: 12, color: INK_MUTED, marginBottom: 8, fontStyle: 'italic' }}>{task.description.split('\n')[0].slice(0, 280)}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: ACCENT_GOLD }}>💬</span>
            <input
              placeholder="Chat with Claude about this task…"
              style={{ flex: 1, background: 'rgba(0,0,0,0.20)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '5px 10px', fontSize: 12, color: INK, outline: 'none', fontFamily: 'inherit' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Timeline — meetings + drop zones + planned strip
// ──────────────────────────────────────────────────────────────────────────

interface TodayEvent {
  id: string
  time: string       // formatted "12:15 PM" or "—"
  end?: string
  title: string
  loc?: string
  href?: string
}

function meetingToEvent(m: MeetingRow): TodayEvent {
  // Hub MeetingRow has only `date`, no time fields. Render as untimed.
  return { id: m.id, time: '—', title: m.title }
}

function isToday(isoDate: string | null | undefined): boolean {
  if (!isoDate) return false
  const today = todayKey()
  return isoDate.slice(0, 10) === today
}

function EventRow({ e, onDismiss, overlap = false, note, onNote }: { e: TodayEvent; onDismiss: (id: string) => void; overlap?: boolean; note?: string; onNote: (id: string, v: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ position: 'relative', background: 'rgba(92,188,180,0.06)', border: `1px solid rgba(92,188,180,${overlap ? 0.35 : 0.18})`, borderRadius: 6, overflow: 'hidden' }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', gap: 12, padding: '10px 14px', alignItems: 'center', cursor: 'pointer' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT_TEAL, fontVariantNumeric: 'tabular-nums', minWidth: overlap ? 90 : 72, lineHeight: 1.3 }}>
          {e.time}
          {e.end && <span style={{ color: INK_DIM, fontWeight: 400 }}> – {e.end}</span>}
        </span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_TEAL, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, color: INK, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
        {e.loc && <span style={{ fontSize: 11, color: ACCENT_TEAL }}>📍 {e.loc}</span>}
        {note && note.length > 0 && <span title="Has notes" style={{ fontSize: 11, color: ACCENT_GOLD }}>📝</span>}
        <span style={{ fontSize: 11, color: INK_DIM }}>{expanded ? '▾' : '▸'}</span>
        <button
          onClick={(ev) => { ev.stopPropagation(); onDismiss(e.id) }}
          title="Remove from today's view"
          style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1, opacity: 0.5, transition: 'opacity 120ms' }}
          onMouseEnter={(ev) => { ev.currentTarget.style.opacity = '1' }}
          onMouseLeave={(ev) => { ev.currentTarget.style.opacity = '0.5' }}
        >×</button>
      </div>
      {expanded && (
        <div style={{ padding: '12px 14px 14px', borderTop: '1px solid rgba(92,188,180,0.18)', background: 'rgba(92,188,180,0.02)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 4 }}>Meeting notes</div>
          <textarea
            value={note || ''}
            onChange={(ev) => onNote(e.id, ev.target.value)}
            placeholder="Jot notes as the meeting happens…"
            style={{ width: '100%', minHeight: 72, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 10px', color: INK, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }}
          />
        </div>
      )}
    </div>
  )
}

function DropZone({ slot, label, onDropTask }: { slot: PlannedSlot; label: string; onDropTask: (id: string, slot: PlannedSlot) => void }) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = ACCENT_GOLD; e.currentTarget.style.background = 'rgba(201,168,76,0.08)' }}
      onDragLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; e.currentTarget.style.background = 'transparent' }}
      onDrop={(e) => {
        e.preventDefault()
        e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'
        e.currentTarget.style.background = 'transparent'
        const id = e.dataTransfer.getData('text/plain')
        if (id) onDropTask(id, slot)
      }}
      style={{ padding: '6px 14px', margin: '4px 0', border: '1px dashed rgba(201,168,76,0.15)', borderRadius: 6, fontSize: 11, color: INK_DIM, textAlign: 'center', transition: 'all 120ms', fontStyle: 'italic' }}
    >
      {label}
    </div>
  )
}

function PlannedTaskRow({ task, project, state, timeHint, small = false, onExpand, expandedId, projectsByPid }: { task: TaskRow; project: { name: string; slug: string } | null; state: TodayStateApi; timeHint?: string; small?: boolean; onExpand: (id: string) => void; expandedId: string | null; projectsByPid: Map<string, { name: string; slug: string; category?: string | null }> }) {
  const isDone = !!state.done[task.id]
  const isNow = state.rightNow === task.id
  const expanded = expandedId === task.id
  const tag = tagForTask(task, projectsByPid)
  const links: LinkKind[] = []
  if (task.key_link_1) links.push('folder')
  if (task.key_link_2) links.push('claude')
  if (task.key_link_3) links.push('brief')
  return (
    <div style={{ background: isNow ? 'rgba(201,168,76,0.10)' : 'rgba(201,168,76,0.03)', border: `1px ${isNow ? 'solid' : 'dashed'} rgba(201,168,76,${isNow ? 0.35 : 0.18})`, borderRadius: 6, overflow: 'hidden', transition: 'all 120ms' }}>
      <div onClick={() => !isDone && onExpand(task.id)} style={{ display: 'flex', gap: 10, padding: small ? '6px 10px' : '8px 12px', alignItems: 'flex-start', cursor: isDone ? 'default' : 'pointer' }}>
        {timeHint && (
          <span style={{ fontSize: 11, color: ACCENT_GOLD, fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 64, paddingTop: 1 }}>{timeHint}</span>
        )}
        <input
          type="checkbox"
          checked={isDone}
          onChange={(e) => { e.stopPropagation(); isDone ? state.uncheck(task.id) : state.markDone(task.id) }}
          onClick={(e) => e.stopPropagation()}
          style={{ marginTop: 3, accentColor: ACCENT_GREEN, cursor: 'pointer' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {isNow && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_GOLD, padding: '1px 5px', background: 'rgba(201,168,76,0.14)', borderRadius: 3 }}>Now</span>}
            <span style={{ fontSize: 11, flexShrink: 0 }} aria-hidden="true">{tag}</span>
            <span style={{ fontSize: 13, color: isDone ? INK_DIM : INK, textDecoration: isDone ? 'line-through' : 'none', fontWeight: 500 }}>{task.title}</span>
            <ProjectLink name={project?.name ?? null} slug={project?.slug} />
            <LinkRow links={links} />
            {!isDone && <span style={{ fontSize: 11, color: INK_DIM }}>{expanded ? '▾' : '▸'}</span>}
            <button
              onClick={(e) => { e.stopPropagation(); state.unplan(task.id) }}
              title="Remove from plan"
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: INK_DIM, fontSize: 12, cursor: 'pointer', padding: '0 4px', opacity: 0.5 }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
            >×</button>
          </div>
        </div>
      </div>
      {expanded && !isDone && <TaskDetailDrawer task={task} project={project} state={state} />}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Task detail drawer
// ──────────────────────────────────────────────────────────────────────────

function TaskDetailDrawer({ task, project, state }: { task: TaskRow; project: { name: string; slug: string } | null; state: TodayStateApi }) {
  const isPlanned = !!state.planned[task.id]
  const isNow = state.rightNow === task.id
  const detailQuery = useTaskDetail(task.id)
  const detail = detailQuery.data
  // Why: prefer server-derived first paragraph, fall back to local cut.
  const why = detail?.why ?? task.description?.split('\n')[0]?.trim() ?? null
  const linkSet: LinkKind[] = []
  if (task.key_link_1) linkSet.push('folder')
  if (task.key_link_2) linkSet.push('claude')
  if (task.key_link_3) linkSet.push('brief')
  const subtasks = detail?.subtasks ?? []
  const updates = detail?.updates ?? []
  const blocks = detail?.blocks ?? []

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ padding: '14px 16px 16px', background: 'rgba(0,0,0,0.20)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {!isNow && (
          <button onClick={() => state.promote(task.id)} style={{ padding: '6px 12px', background: ACCENT_GOLD, color: PAGE_BG, border: 'none', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>▶ Work on this now</button>
        )}
        {!isPlanned && !isNow && (
          <button onClick={() => state.planAt(task.id, 'strip')} style={{ padding: '6px 12px', background: 'rgba(201,168,76,0.08)', color: ACCENT_GOLD, border: '1px solid rgba(201,168,76,0.30)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>📌 Plan for today</button>
        )}
        {isPlanned && !isNow && (
          <button onClick={() => state.unplan(task.id)} style={{ padding: '6px 12px', background: 'transparent', color: INK_MUTED, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Unplan</button>
        )}
        <LinkRow links={linkSet} />
        {project && <span style={{ marginLeft: 'auto', fontSize: 11, color: INK_DIM }}>{project.name}</span>}
      </div>
      {why && (
        <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(201,168,76,0.04)', borderLeft: '2px solid rgba(201,168,76,0.30)', borderRadius: 3 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_GOLD, marginBottom: 4 }}>Why this matters</div>
          <div style={{ fontSize: 12, color: INK, lineHeight: 1.55 }}>{why}</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
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
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 6 }}>Recent updates</div>
          {detailQuery.isLoading && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>Loading…</div>}
          {!detailQuery.isLoading && updates.length === 0 && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>No updates logged.</div>}
          {updates.slice(0, 8).map((u, i) => {
            const isHermes = u.who === 'claude-ai' || u.who === 'hermes'
            const isMe = u.who === 'nick-ingraham' || u.who === 'nick'
            const color = isHermes ? ACCENT_GOLD : isMe ? ACCENT_TEAL : INK_MUTED
            return (
              <div key={u.id ?? i} style={{ padding: '6px 0', borderBottom: i < updates.length - 1 && i < 7 ? '1px dashed rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color, letterSpacing: '0.04em' }}>{isHermes ? 'Hermes' : u.who}</span>
                  <span style={{ fontSize: 10, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{u.when?.slice(0, 16) ?? ''}</span>
                </div>
                <div style={{ fontSize: 12, color: INK, lineHeight: 1.45 }}>{u.text}</div>
                {u.kind === 'note' && u.id && (
                  <div style={{ marginTop: 4 }}>
                    <ReactionBar targetType="task_update" targetId={u.id} compact />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <SmartCompose taskId={task.id} placeholder="Add a note, or @hermes for AI…" />
    </div>
  )
}


// ──────────────────────────────────────────────────────────────────────────
// Group + TaskRow
// ──────────────────────────────────────────────────────────────────────────

function TaskRowDisplay({ task, project, state, expandedId, onExpand, projectsByPid }: { task: TaskRow; project: { name: string; slug: string } | null; state: TodayStateApi; expandedId: string | null; onExpand: (id: string) => void; projectsByPid: Map<string, { name: string; slug: string; category?: string | null }> }) {
  const isDone = !!state.done[task.id]
  const isNow = state.rightNow === task.id
  const planned = state.planned[task.id]
  const expanded = expandedId === task.id
  const tag = tagForTask(task, projectsByPid)
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isNow ? 'rgba(201,168,76,0.05)' : (isDone ? 'rgba(110,232,154,0.02)' : 'transparent'), opacity: isDone ? 0.6 : 1, transition: 'background 220ms' }}>
      <div onClick={() => !isDone && onExpand(task.id)} style={{ display: 'flex', gap: 0, alignItems: 'stretch', padding: 0, cursor: isDone ? 'default' : 'pointer' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px', gap: 4, borderRight: '1px solid rgba(255,255,255,0.03)' }} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isDone}
            onChange={() => isDone ? state.uncheck(task.id) : state.markDone(task.id)}
            style={{ accentColor: ACCENT_GREEN, cursor: 'pointer' }}
          />
          {!isDone && (
            <div draggable onDragStart={onDragStart} title="Drag up to the timeline to plan this task" style={{ cursor: 'grab', color: INK_DIM, padding: '2px 0', lineHeight: 1, fontSize: 14, userSelect: 'none' }}>⋮⋮</div>
          )}
        </div>
        <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {isNow && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_GOLD, padding: '2px 6px', background: 'rgba(201,168,76,0.14)', borderRadius: 3 }}>Right now</span>}
            <span style={{ fontSize: 11, flexShrink: 0 }} aria-hidden="true">{tag}</span>
            <span style={{ fontSize: 13, color: isDone ? INK_DIM : INK, textDecoration: isDone ? 'line-through' : 'none', fontWeight: 500, lineHeight: 1.4 }}>{task.title}</span>
            <ProjectLink name={project?.name ?? null} slug={project?.slug} />
            {planned && !isDone && (
              <span style={{ fontSize: 10, color: ACCENT_GOLD, padding: '1px 6px', background: 'rgba(201,168,76,0.10)', borderRadius: 3, letterSpacing: '0.04em' }}>📌 {planned.slot === 'strip' ? 'planned' : 'scheduled'}</span>
            )}
            {!isDone && <span style={{ marginLeft: 'auto', fontSize: 11, color: INK_DIM }}>{expanded ? '▾' : '▸'}</span>}
          </div>
        </div>
      </div>
      {expanded && !isDone && <TaskDetailDrawer task={task} project={project} state={state} />}
    </div>
  )
}

function TaskGroup({ gkey, tasks, projectsByPid, state, expandedId, onExpand }: { gkey: GroupKey; tasks: TaskRow[]; projectsByPid: Map<string, { name: string; slug: string; category?: string | null }>; state: TodayStateApi; expandedId: string | null; onExpand: (id: string) => void }) {
  const meta = GROUP_META[gkey]
  const doneCount = tasks.filter((t) => state.done[t.id] || t.completed === 1).length
  const sorted = useMemo(() => {
    const planned = tasks.filter((t) => state.planned[t.id] && !state.done[t.id])
    const active = tasks.filter((t) => !state.planned[t.id] && !state.done[t.id])
    const done = tasks.filter((t) => state.done[t.id])
    return [...planned, ...active, ...done]
  }, [tasks, state.planned, state.done])

  if (tasks.length === 0) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '0 2px' }}>
        <span style={{ fontSize: 14 }}>{meta.icon}</span>
        <h4 style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>{meta.label}</h4>
        <span style={{ fontSize: 11, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{doneCount}/{tasks.length}</span>
        <div style={{ flex: 1, height: 1, background: `${meta.color}22`, marginLeft: 4 }} />
      </div>
      <div style={{ background: PANEL_BG, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
        {sorted.map((t) => (
          <TaskRowDisplay
            key={t.id}
            task={t}
            project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
            state={state}
            expandedId={expandedId}
            onExpand={onExpand}
            projectsByPid={projectsByPid}
          />
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Right rail
// ──────────────────────────────────────────────────────────────────────────

interface HermesSuggestsProps {
  overdueTasks: TaskRow[]
  stalledProjects: Array<{ name: string; days: number }>
  menteesWithDue: Array<{ name: string; next: string }>
}

function HermesSuggestsCard({ overdueTasks, stalledProjects, menteesWithDue }: HermesSuggestsProps) {
  // Algorithmic 3-bullet suggestion (CD spec parity — focus + ul of bullets).
  // Real Hermes requires async (60s listener poll); defer to a follow-up that
  // creates an ai_request once/day and caches the response per-user.
  const overdueCount = overdueTasks.length
  const stalledCount = stalledProjects.length
  const focus = overdueCount > 0
    ? `${overdueCount} overdue task${overdueCount === 1 ? '' : 's'} at the top of your list — work the longest one first; momentum carries the rest.`
    : stalledCount > 0
      ? `${stalledCount} stalled project${stalledCount === 1 ? '' : 's'} (no activity 10+ days). Pick one and ship a 30-min nudge.`
      : 'No fires today. Block 90 minutes for the deepest task on your list — that\'s where leverage lives.'

  // Build 3 bullets from real signal — first three of these that are non-null:
  // (1) longest-overdue task, (2) most-stalled project, (3) mentee with soonest due.
  const bullets: string[] = []
  if (overdueTasks.length > 0) {
    const longest = [...overdueTasks].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0]
    if (longest) {
      const days = daysSince(longest.due_date)
      bullets.push(`Tackle "${longest.title.slice(0, 60)}" — ${Number.isFinite(days) ? `${days}d overdue` : 'overdue'}.`)
    }
  }
  if (stalledProjects.length > 0) {
    const top = stalledProjects[0]
    bullets.push(`Nudge ${top.name} (${top.days}d quiet) — even a one-line note moves the needle.`)
  }
  const overdueMentee = menteesWithDue.find((m) => m.next.endsWith('late'))
    ?? menteesWithDue.find((m) => m.next === 'today')
  if (overdueMentee) {
    bullets.push(`Check in with ${overdueMentee.name} — ${overdueMentee.next}.`)
  } else if (bullets.length < 3 && menteesWithDue.length > 0) {
    bullets.push(`${menteesWithDue.length} mentee${menteesWithDue.length === 1 ? '' : 's'} active this week — shape one quick win.`)
  }
  // If we still don't have 3 bullets, top up with deep-work nudge.
  if (bullets.length < 3) bullets.push('Block 90 min on the deepest task on your list — leverage compounds.')
  if (bullets.length < 3) bullets.push('No backlog drama. Pick one strategic project and write the next 200 words.')

  return (
    <div style={{ padding: 14, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.20)', borderRadius: 6, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span>✨</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_GOLD }}>Hermes suggests</span>
      </div>
      <div style={{ fontSize: 12, color: INK, lineHeight: 1.5, marginBottom: 8 }}>{focus}</div>
      <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: INK_MUTED, lineHeight: 1.7 }}>
        {bullets.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    </div>
  )
}

function NeedsAttentionCard({ overdueTasks, stalledProjects }: { overdueTasks: TaskRow[]; stalledProjects: Array<{ name: string; days: number }> }) {
  return (
    <div data-b2-attention style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_CORAL }} />
        <h4 style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_CORAL, margin: 0 }}>Needs attention</h4>
      </div>
      <div style={{ padding: 12, background: 'rgba(240,115,126,0.04)', border: '1px solid rgba(240,115,126,0.15)', borderRadius: 6, marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: ACCENT_CORAL, marginBottom: 4, fontWeight: 600, letterSpacing: '0.04em' }}>OVERDUE</div>
        {overdueTasks.length === 0 && (
          <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>None — clean slate.</div>
        )}
        {overdueTasks.slice(0, 5).map((t) => {
          const days = daysSince(t.due_date)
          return (
            <div key={t.id} style={{ fontSize: 12, color: INK, padding: '3px 0', display: 'flex', gap: 8 }}>
              <span style={{ color: ACCENT_CORAL, fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 36, fontSize: 11 }}>{Number.isFinite(days) ? `${days}d` : '—'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
            </div>
          )
        })}
      </div>
      <div style={{ padding: 12, background: 'rgba(240,138,91,0.04)', border: '1px solid rgba(240,138,91,0.15)', borderRadius: 6 }}>
        <div style={{ fontSize: 10, color: ACCENT_ORANGE, marginBottom: 4, fontWeight: 600, letterSpacing: '0.04em' }}>STALLED</div>
        {stalledProjects.length === 0 && (
          <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>Everything's moving.</div>
        )}
        {stalledProjects.slice(0, 5).map((s, i) => (
          <div key={i} style={{ fontSize: 12, color: INK, padding: '3px 0', display: 'flex', gap: 8 }}>
            <span style={{ color: ACCENT_ORANGE, fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 36, fontSize: 11 }}>{s.days}d</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectsCard({ projects }: { projects: Array<{ slug: string; name: string; nextAction?: string | null }> }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : projects
    return filtered.slice(0, 12)
  }, [projects, q])

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_TEAL }} />
        <h4 style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_TEAL, margin: 0 }}>Projects</h4>
        <span style={{ fontSize: 11, color: INK_DIM, marginLeft: 'auto' }}>{projects.length}</span>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Jump to project…"
        style={{ width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, fontSize: 12, color: INK, outline: 'none', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }}
      />
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {shown.map((p) => (
          <Link key={p.slug} to={PATHS.project(p.slug)} className="b2-proj" style={{ display: 'block', padding: 8, borderRadius: 4, textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12, color: INK, fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            </div>
            {p.nextAction && (
              <div style={{ fontSize: 11, color: INK_MUTED, opacity: 0.8, paddingLeft: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>→ {p.nextAction}</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

function PulseCard({ focusMin, syncHours, milestones, mentees }: { focusMin: number; syncHours: number; milestones: Array<{ title: string; days: number }>; mentees: Array<{ name: string; next: string }> }) {
  // CD spec: FOCUS / SYNC tiles + NEXT MILESTONES + MENTEES.
  // SYNC turns coral if >24h per Rule 59. focusMin = today's planned-task minutes proxy.
  const syncColor = syncHours > 24 ? ACCENT_CORAL : ACCENT_GREEN
  const syncLabel = syncHours === Infinity ? '—' : String(syncHours)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_GOLD }} />
        <h4 style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_GOLD, margin: 0 }}>Pulse</h4>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
          <div style={{ fontSize: 10, color: INK_MUTED, letterSpacing: '0.04em' }}>FOCUS</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
            {focusMin}<span style={{ fontSize: 11, color: INK_MUTED, fontWeight: 400, marginLeft: 2 }}>min</span>
          </div>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }} title={syncHours === Infinity ? 'No sync recorded yet' : `Last brain.db sync ${syncHours}h ago`}>
          <div style={{ fontSize: 10, color: INK_MUTED, letterSpacing: '0.04em' }}>SYNC</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: syncColor, fontVariantNumeric: 'tabular-nums' }}>
            {syncLabel}<span style={{ fontSize: 11, color: INK_MUTED, fontWeight: 400, marginLeft: 2 }}>h</span>
          </div>
        </div>
      </div>
      {milestones.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: INK_MUTED, letterSpacing: '0.04em', marginBottom: 4 }}>NEXT MILESTONES</div>
          {milestones.slice(0, 3).map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12 }}>
              <span style={{ color: ACCENT_GOLD, fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 32 }}>{m.days}d</span>
              <span style={{ color: INK, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
            </div>
          ))}
        </>
      )}
      {mentees.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: INK_MUTED, letterSpacing: '0.04em', marginTop: 10, marginBottom: 4 }}>MENTEES</div>
          {mentees.slice(0, 4).map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 12, alignItems: 'baseline' }}>
              <span style={{ color: INK, fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
              <span style={{ color: m.next === '—' ? INK_DIM : ACCENT_GOLD, fontSize: 11, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{m.next}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// TodayPage main
// ──────────────────────────────────────────────────────────────────────────

export default function TodayPage() {
  usePageMeta('Today · MN-CCORE', 'Operating-day landing — what to work on, who you\'re meeting, what\'s overdue.')
  const { user } = useAuth()
  const userSlug = emailToSlug(user?.email)

  const tasksQuery = useTasks(userSlug ? { assignee: userSlug } : undefined)
  const projectsQuery = useProjects()
  const meetingsQuery = useMeetingsApi()
  const regulatoryQuery = useExpiringRegulatory(60)

  const tasks: TaskRow[] = useMemo(() => (tasksQuery.data ?? []).filter((t) => t.completed === 0 && t.status !== 'done'), [tasksQuery.data])

  const projectsByPid = useMemo(() => {
    const m = new Map<string, { name: string; slug: string; category?: string | null; lastActivity?: string | null }>()
    for (const p of projectsQuery.data ?? []) {
      const entry = { name: p.title ?? p.slug, slug: p.slug, category: p.category ?? null, lastActivity: p.lastActivity ?? null }
      m.set(p.slug, entry)
    }
    return m
  }, [projectsQuery.data])

  const allTaskIds = useMemo(() => tasks.map((t) => t.id), [tasks])
  const state = useTodayState(allTaskIds)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onExpand = useCallback((id: string) => { setExpandedId((p) => (p === id ? null : id)) }, [])

  // Auto-promote first relevant task on first load when nothing planned and
  // nothing in Right Now. Fixes empty-hero discoverability (eval Issue 2).
  // Picks: longest-overdue → urgent → high → first task. Runs once per
  // task-list change; user's explicit unplan keeps Right Now empty.
  const autoPromotedRef = useRef(false)
  useEffect(() => {
    if (autoPromotedRef.current) return
    if (state.rightNow) { autoPromotedRef.current = true; return }
    if (state.plannedIds().length > 0) { autoPromotedRef.current = true; return }
    if (tasks.length === 0) return
    const today = todayKey()
    const overdue = tasks.filter((t) => t.due_date && t.due_date.slice(0, 10) < today)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    const candidate = overdue[0]
      ?? tasks.find((t) => t.priority === 'urgent')
      ?? tasks.find((t) => t.priority === 'high')
      ?? tasks[0]
    if (candidate) {
      state.promote(candidate.id)
      autoPromotedRef.current = true
    }
  }, [tasks, state])

  // Group bucketing.
  const grouped = useMemo(() => {
    const g: Record<GroupKey, TaskRow[]> = { deep: [], priorities: [], quick: [], pb: [], etl: [] }
    for (const t of tasks) {
      const key = getGroupForTask(t, projectsByPid)
      g[key].push(t)
    }
    return g
  }, [tasks, projectsByPid])

  // Derived counts.
  const overdueTasks = useMemo(() => {
    const today = todayKey()
    return tasks.filter((t) => t.due_date && t.due_date.slice(0, 10) < today)
  }, [tasks])

  const stalledProjects = useMemo(() => {
    const all = projectsQuery.data ?? []
    return all
      .filter((p) => p.status === 'Active')
      .map((p) => ({ name: p.title ?? p.slug, days: daysSince(p.lastActivity) }))
      .filter((p) => p.days >= 10 && p.days < Infinity)
      .sort((a, b) => b.days - a.days)
  }, [projectsQuery.data])

  const projectsForRail = useMemo(() => {
    const all = projectsQuery.data ?? []
    const allTasks = tasksQuery.data ?? []
    // Per-project: soonest-due open task assigned to current user, used as
    // the "next action" cue. No dedicated column on projects, so derive.
    const nextByProject = new Map<string, { title: string; due: string | null }>()
    for (const t of allTasks) {
      if (t.completed === 1 || t.status === 'done') continue
      if (!t.project_id) continue
      if (userSlug && t.assignee !== userSlug) continue
      const existing = nextByProject.get(t.project_id)
      const aDue = t.due_date ?? '9999-12-31'
      const eDue = existing?.due ?? '9999-12-31'
      if (!existing || aDue < eDue) nextByProject.set(t.project_id, { title: t.title, due: t.due_date ?? null })
    }
    return all
      .filter((p) => p.status === 'Active')
      .map((p) => {
        const next = nextByProject.get(p.slug)
        return { slug: p.slug, name: p.title ?? p.slug, nextAction: next ? next.title.slice(0, 80) : null }
      })
  }, [projectsQuery.data, tasksQuery.data, userSlug])

  const milestones = useMemo(() => {
    const reg = regulatoryQuery.data ?? []
    return reg.map((r: any) => ({ title: r.name ?? r.title ?? 'Regulatory item', days: r.days_until_expiry ?? 0 })).filter((m: { days: number }) => m.days > 0).sort((a: { days: number }, b: { days: number }) => a.days - b.days).slice(0, 5)
  }, [regulatoryQuery.data])

  // Pulse: focus minutes proxy (planned tasks × 30min average), sync staleness, mentees.
  // Mentees = researchTeam slugs (Coordinators / Fellows / Students / Analysts).
  // Each mentee's "next" is the soonest due_date among their assigned tasks; — if none.
  const focusMin = useMemo(() => state.plannedIds().length * 30, [state])
  const syncHours = useMemo(() => hoursSinceLastSync(), [])
  const mentees = useMemo(() => {
    const allTasks = tasksQuery.data ?? []
    return researchTeam.map((m) => {
      const theirs = allTasks.filter((t) => t.assignee === m.slug && t.completed === 0 && t.due_date)
      const soonest = theirs.map((t) => t.due_date as string).sort()[0]
      let next = '—'
      if (soonest) {
        const days = Math.round((new Date(soonest + 'T12:00:00').getTime() - Date.now()) / 86400000)
        next = days < 0 ? `${Math.abs(days)}d late` : days === 0 ? 'today' : `${days}d`
      }
      return { name: m.name, next }
    })
  }, [tasksQuery.data])

  // Today events.
  const todaysMeetings: TodayEvent[] = useMemo(() => {
    const all = meetingsQuery.data ?? []
    return all.filter((m) => isToday(m.date)).map(meetingToEvent)
  }, [meetingsQuery.data])

  // Right Now lookup.
  const rightNowTask = state.rightNow ? tasks.find((t) => t.id === state.rightNow) ?? null : null
  const rightNowProject = rightNowTask?.project_id ? projectsByPid.get(rightNowTask.project_id) ?? null : null
  const queueTasks = state.plannedIds()
    .filter((id) => id !== state.rightNow)
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is TaskRow => !!t)
    .map((t) => ({ id: t.id, title: t.title }))

  // Pill counts.
  const today = todayKey()
  const doneTodayCount = tasks.filter((t) => state.done[t.id]).length
    + (tasksQuery.data ?? []).filter((t) => t.completed === 1 && t.completed_at?.slice(0, 10) === today).length
  const counts: DailyCounts = {
    overdue: overdueTasks.length,
    stalled: stalledProjects.length,
    planned: state.plannedIds().length,
    meetings: todaysMeetings.length,
    doneToday: doneTodayCount,
  }

  // Timeline state.
  const [dismissedMeetings, setDismissedMeetings] = useState<Record<string, boolean>>({})
  const [meetingNotes, setMeetingNotes] = useState<Record<string, string>>({})
  const visibleMeetings = todaysMeetings.filter((e) => !dismissedMeetings[e.id])
  const onDropTask = useCallback((id: string, slot: PlannedSlot) => state.planAt(id, slot), [state])

  const isLoading = tasksQuery.isLoading || projectsQuery.isLoading
  const plannedStripIds = state.plannedIds().filter((id) => state.planned[id]?.slot === 'strip' && id !== state.rightNow)
  const plannedStripTasks = plannedStripIds.map((id) => tasks.find((t) => t.id === id)).filter((t): t is TaskRow => !!t)
  const doneTodayDetail = (tasksQuery.data ?? []).filter((t) => t.completed === 1 && t.completed_at?.slice(0, 10) === today)
  const [completedOpen, setCompletedOpen] = useState(false)

  return (
    <div className="b2-grid" style={{ background: PAGE_BG, color: INK, fontFamily: 'var(--font-sans), \'DM Sans\', system-ui, sans-serif', minHeight: '100%' }}>
      <style>{`
        @keyframes b2pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .b2-proj:hover { background: rgba(255,255,255,0.04); }
        .b2-proj-link:hover { color: ${ACCENT_TEAL} !important; opacity: 1 !important; text-decoration: underline; }
        /* Desktop: 1fr main + 340px right rail. Mobile: stack with rail
           below main (rail collapses to 220px tall horizontal scroll
           cards). 1024 breakpoint matches the data-page tablet
           breakpoint per the columnar table density rules. */
        .b2-grid { display: grid; grid-template-columns: 1fr 340px; }
        .b2-main { padding: 28px 32px; border-right: 1px solid rgba(255,255,255,0.06); min-width: 0; }
        .b2-rail { padding: 28px 20px; background: #0a0f15; overflow-y: auto; }
        @media (max-width: 1024px) {
          .b2-grid { grid-template-columns: 1fr; }
          .b2-main { padding: 20px 16px; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .b2-rail { padding: 16px; }
        }
      `}</style>

      <main className="b2-main">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
          <h1 style={{ fontSize: 32, fontWeight: 600, color: '#fff', letterSpacing: '-0.03em', margin: 0 }}>Today</h1>
          <HeartbeatLine width={60} height={14} color={ACCENT_GOLD} variant="static" />
          <span style={{ fontSize: 13, color: INK_MUTED }}>{formatTodayDate()}</span>
        </div>
        <div style={{ fontSize: 13, color: INK_DIM, marginBottom: 16 }}>
          Click a task to expand · drag ⋮⋮ to plan · click a meeting for notes.
        </div>

        <PillStrip counts={counts} />

        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: PANEL_BG, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, marginBottom: 20 }}>
          <span style={{ fontSize: 14 }}>🧠</span>
          <input
            placeholder="Morning thought, quick capture, or @hermes to delegate…"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: INK, outline: 'none', fontFamily: 'inherit' }}
          />
          <kbd style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: 10, padding: '2px 6px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, color: INK_DIM }}>⌘ ⏎</kbd>
        </div>

        <RightNow task={rightNowTask} project={rightNowProject ? { name: rightNowProject.name, slug: rightNowProject.slug } : null} queueTasks={queueTasks} state={state} />

        <section data-b2-timeline style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 14 }}>📅</span>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em', margin: 0 }}>Today · timeline</h3>
            <span style={{ fontSize: 11, color: INK_DIM }}>drag tasks into the gaps · click meetings to take notes · × to hide</span>
            {Object.keys(dismissedMeetings).length > 0 && (
              <button onClick={() => setDismissedMeetings({})} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: ACCENT_TEAL, fontSize: 11, cursor: 'pointer' }}>Restore {Object.keys(dismissedMeetings).length} hidden</button>
            )}
          </div>
          {visibleMeetings.length === 0 && (
            <div style={{ padding: '16px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: INK_MUTED, marginBottom: 4 }}>No meetings on today's calendar.</div>
              <Link to={PATHS.settings} style={{ fontSize: 11, color: ACCENT_TEAL, textDecoration: 'underline' }}>Connect a calendar in Settings</Link>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visibleMeetings.map((e, idx) => {
              // Gather planned tasks dropped into the gap BEFORE this meeting.
              const slotKey = `between-${idx}` as PlannedSlot
              const tasksInGap = state.plannedIds()
                .filter((id) => state.planned[id]?.slot === slotKey)
                .map((id) => tasks.find((t) => t.id === id))
                .filter((t): t is TaskRow => !!t)
              return (
                <div key={e.id}>
                  <DropZone slot={slotKey} label={`drop a task here · before ${e.title}`} onDropTask={onDropTask} />
                  {tasksInGap.map((t) => (
                    <PlannedTaskRow
                      key={t.id}
                      task={t}
                      project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                      state={state}
                      small
                      onExpand={onExpand}
                      expandedId={expandedId}
                      projectsByPid={projectsByPid}
                    />
                  ))}
                  <EventRow
                    e={e}
                    onDismiss={(id) => setDismissedMeetings((s) => ({ ...s, [id]: true }))}
                    note={meetingNotes[e.id]}
                    onNote={(id, v) => setMeetingNotes((s) => ({ ...s, [id]: v }))}
                  />
                </div>
              )
            })}
            {visibleMeetings.length > 0 && (() => {
              const slotKey = `between-${visibleMeetings.length}` as PlannedSlot
              const tasksInGap = state.plannedIds()
                .filter((id) => state.planned[id]?.slot === slotKey)
                .map((id) => tasks.find((t) => t.id === id))
                .filter((t): t is TaskRow => !!t)
              return (
                <div>
                  <DropZone slot={slotKey} label="drop a task here · after last meeting" onDropTask={onDropTask} />
                  {tasksInGap.map((t) => (
                    <PlannedTaskRow
                      key={t.id}
                      task={t}
                      project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                      state={state}
                      small
                      onExpand={onExpand}
                      expandedId={expandedId}
                      projectsByPid={projectsByPid}
                    />
                  ))}
                </div>
              )
            })()}
          </div>
          <div
            style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.10)', borderRadius: 8 }}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(201,168,76,0.40)' }}
            onDragLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
            onDrop={(e) => {
              e.preventDefault()
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
              const id = e.dataTransfer.getData('text/plain')
              if (id) state.planAt(id, 'strip')
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: ACCENT_GOLD }}>Planned today · no specific time</span>
              <span style={{ fontSize: 11, color: INK_DIM, marginLeft: 'auto' }}>drag anything here to "get to today"</span>
            </div>
            {plannedStripTasks.length === 0 ? (
              <div style={{ padding: '10px 4px', fontSize: 12, color: INK_DIM, fontStyle: 'italic', textAlign: 'center' }}>
                Empty — drag a task here to plan it without a time slot
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {plannedStripTasks.map((t) => (
                  <PlannedTaskRow
                    key={t.id}
                    task={t}
                    project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                    state={state}
                    small
                    onExpand={onExpand}
                    expandedId={expandedId}
                    projectsByPid={projectsByPid}
                  />
                ))}
              </div>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <DropZone slot="strip" label="drop a task above to plan it for later today" onDropTask={onDropTask} />
          </div>
        </section>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, marginTop: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>📋 All today's tasks</h2>
          <span style={{ fontSize: 12, color: INK_DIM }}>click to expand · ⋮⋮ to plan · ▶ to promote</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : (
          GROUP_ORDER.map((gkey) => (
            <TaskGroup
              key={gkey}
              gkey={gkey}
              tasks={grouped[gkey]}
              projectsByPid={projectsByPid}
              state={state}
              expandedId={expandedId}
              onExpand={onExpand}
            />
          ))
        )}

        <div data-b2-completed style={{ marginTop: 24, paddingTop: 16, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
          <div onClick={() => setCompletedOpen(!completedOpen)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}>
            <span style={{ fontSize: 12, color: ACCENT_GREEN }}>✓</span>
            <span style={{ fontSize: 11, color: INK_MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>
              Completed today ({doneTodayDetail.length + Object.values(state.done).filter(Boolean).length})
            </span>
            <span style={{ color: INK_DIM }}>{completedOpen ? '▾' : '▸'}</span>
          </div>
          {completedOpen && (
            <div style={{ marginTop: 12, paddingLeft: 20 }}>
              {doneTodayDetail.map((t) => (
                <div key={t.id} style={{ fontSize: 12, color: INK_MUTED, padding: '2px 0', paddingLeft: 12, textDecoration: 'line-through' }}>{t.title}</div>
              ))}
              {Object.keys(state.done).filter((id) => state.done[id]).map((id) => {
                const t = tasks.find((x) => x.id === id) ?? (tasksQuery.data ?? []).find((x) => x.id === id)
                if (!t) return null
                return (
                  <div key={id} style={{ fontSize: 12, color: INK_MUTED, padding: '2px 0', paddingLeft: 12, textDecoration: 'line-through' }}>{t.title}</div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      <aside className="b2-rail">
        <HermesSuggestsCard overdueTasks={overdueTasks} stalledProjects={stalledProjects} menteesWithDue={mentees} />
        <NeedsAttentionCard overdueTasks={overdueTasks} stalledProjects={stalledProjects} />
        <ProjectsCard projects={projectsForRail} />
        <PulseCard focusMin={focusMin} syncHours={syncHours} milestones={milestones} mentees={mentees} />
      </aside>
    </div>
  )
}

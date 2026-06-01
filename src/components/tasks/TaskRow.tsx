// SharedTaskRow — THE canonical "task in a list" row, reused on every surface
// (Today, My Hub, My Tasks Columns/Lanes, Projects). Replaces the ~10 divergent
// renderers that styled the checkbox / dots / due / project differently.
//
// Source of truth: review/MN-CCORE Lab Hub Design System (5)/design/
//   consistency-mockup/{core,rows}.jsx  +  Unified Task Model.html
// Handoff: "Handoff — Task UI Consistency Pass.md" §0 (global rules) + §1.
//
// This component owns ONLY the unified contract — it does NOT replace any
// surface's rich behavior. Each surface keeps its own state wiring and feeds
// it in via props/slots:
//   • square (DoneBox)  = COMPLETE, always, everywhere — never select, never promote
//   • body click        = expand/open detail  (onToggleExpand — surface decides inline vs panel)
//   • shift-click / long-press = multi-select  (only when onToggleSelect is provided)
//   • drag handle ⋮⋮     = plan / reorder      (only when draggable + onDragStart provided)
//   • in-progress        = teal reserved dot   (never via the square)
//   • title              = full, wraps, never truncated; one fixed left edge
//
// Slots let surfaces keep their specifics without forking the row:
//   • extraMeta   — surface-specific right-side chips (stale / Nd late / waiting…)
//   • belowTitle  — second line under the title (workflow badges, stacked meta)
//   • children    — the inline detail node rendered under the row when expanded
//                   (Today's TaskDetailDrawer, MyTasks' InlineDetail, …)
//
// Colors come ONLY from the theme-aware --task-* CSS vars (src/index.css), so
// the row is correct in BOTH light and dark, on the dark Today/MyTasks page
// AND on My Hub's lighter card surface.

import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import TaskTitle from './TaskTitle'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, ACCENT_ORANGE, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, withAlpha, todayKey,
} from '../../lib/taskGrouping'
import type { TaskRow as TaskRowData } from '../../lib/api'

// Reserved priority-dot color. urgent/high carry a colored dot; everything
// else gets a transparent dot of the SAME width so every title starts at the
// identical x (handoff rule #6 — one fixed left edge).
const PRIORITY_COLOR: Record<string, string> = {
  urgent: ACCENT_CORAL,
  high: ACCENT_ORANGE,
  medium: ACCENT_GOLD,
  low: INK_DIM,
}

// ── DoneBox — the canonical complete control. check = DONE, same everywhere ──
export function DoneBox({ done, onToggle, color = ACCENT_GREEN }: { done: boolean; onToggle: () => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      onMouseDown={(e) => e.stopPropagation()}
      title={done ? 'Mark not done' : 'Mark done'}
      aria-label={done ? 'Mark not done' : 'Mark done'}
      aria-pressed={done}
      style={{
        width: 17, height: 17, borderRadius: 5, flexShrink: 0, cursor: 'pointer',
        display: 'grid', placeItems: 'center', padding: 0,
        border: `1.5px solid ${done ? color : INK_MUTED}`,
        background: done ? color : 'transparent',
        transition: 'all 140ms',
      }}
    >
      <span style={{ opacity: done ? 1 : 0, transform: done ? 'scale(1)' : 'scale(0.6)', transition: 'all 140ms', display: 'grid' }}>
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#06210f" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    </button>
  )
}

// Due-date chip — tabular-nums; coral overdue, gold today, muted otherwise.
// (A standalone <DueLabel> primitive lands in P1 §3; this keeps the row
// self-contained for P0 without yet sweeping every call site.)
function rowDueLabel(due: string): string {
  const today = todayKey()
  const dueDay = due.slice(0, 10)
  if (dueDay === today) return 'Today'
  const target = new Date(dueDay + 'T12:00:00')
  if (isNaN(target.getTime())) return dueDay
  const days = Math.round((target.getTime() - Date.now()) / 86400000)
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${Math.abs(days)}d ago`
  if (days <= 7) return `in ${days}d`
  return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function DueChip({ due }: { due: string }) {
  const today = todayKey()
  const dueDay = due.slice(0, 10)
  const overdue = dueDay < today
  const isToday = dueDay === today
  const color = overdue ? ACCENT_CORAL : isToday ? ACCENT_GOLD : INK_MUTED
  return (
    <span
      title={`Due ${dueDay}`}
      style={{ fontSize: 11, color, fontVariantNumeric: 'tabular-nums', fontWeight: overdue ? 600 : 500, flexShrink: 0, whiteSpace: 'nowrap' }}
    >
      {rowDueLabel(due)}
    </span>
  )
}

// Project name = a LINK that jumps to the project (navigation), distinct from
// the folder-icon "reassign project" control inside the editor (handoff §1).
function ProjectTag({ project }: { project: { name: string; slug: string } | null }) {
  if (!project) return null
  return (
    <Link
      to={PATHS.project(project.slug)}
      onClick={(e) => e.stopPropagation()}
      title={`Jump to ${project.name}`}
      style={{ fontSize: 11, color: ACCENT_TEAL, opacity: 0.92, flexShrink: 0, whiteSpace: 'nowrap', textDecoration: 'none', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}
    >
      {project.name}
    </Link>
  )
}

function PlannedChip({ label = 'planned' }: { label?: string }) {
  return (
    <span style={{ fontSize: 10, color: ACCENT_GOLD, padding: '1px 6px', background: withAlpha(ACCENT_GOLD, 14), borderRadius: 4, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      📌 {label}
    </span>
  )
}

export interface SharedTaskRowProps {
  task: TaskRowData
  project: { name: string; slug: string } | null

  // ── done / complete ── square is ALWAYS complete.
  isDone: boolean
  onToggleDone: () => void

  // ── expand / open detail ── body click. Surface decides what "open" means
  // (inline expansion vs full side panel) by what it does in onToggleExpand
  // and whether it passes `children`.
  isExpanded: boolean
  onToggleExpand: () => void
  // Hide the inline expand caret (e.g. My Hub opens a full panel, not inline).
  hideCaret?: boolean

  // ── multi-select ── ONLY active when onToggleSelect is provided.
  // shift-click or long-press (~420ms) toggles; while ≥1 row is selected a
  // plain click also toggles (selectionActive).
  isSelected?: boolean
  selectionActive?: boolean
  onToggleSelect?: () => void

  // ── drag-to-plan / reorder ── ONLY active when draggable + onDragStart.
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void

  // ── state cues ──
  isPlanned?: boolean
  plannedLabel?: string
  isRightNow?: boolean
  // group_override pin (📍) — task was manually bucketed.
  showGroupOverridePin?: boolean

  // ── layout ──
  dense?: boolean
  stack?: boolean   // narrow rail: title full-width, meta stacks beneath it

  // ── content slots ──
  leadingTag?: ReactNode   // category glyph left of the title (🧠/🔧/💰…)
  extraMeta?: ReactNode    // surface-specific chips appended to the right cluster
  belowTitle?: ReactNode   // second line under the title (workflow badges…)
  children?: ReactNode     // inline detail rendered under the row when expanded
}

function Grip({ show, draggable, onDragStart }: { show: boolean; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void }) {
  if (!draggable) return null
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      title="Drag up to the timeline to plan this task"
      style={{ width: 12, display: 'grid', placeItems: 'center', cursor: 'grab', color: INK_MUTED, opacity: show ? 0.55 : 0, transition: 'opacity 140ms', fontSize: 13, lineHeight: 1, flexShrink: 0, userSelect: 'none' }}
    >
      ⋮⋮
    </div>
  )
}

export function TaskRow(props: SharedTaskRowProps) {
  const {
    task, project, isDone, onToggleDone, isExpanded, onToggleExpand, hideCaret,
    isSelected = false, selectionActive = false, onToggleSelect,
    draggable = false, onDragStart,
    isPlanned = false, plannedLabel, isRightNow = false, showGroupOverridePin = false,
    dense = false, stack = false,
    leadingTag, extraMeta, belowTitle, children,
  } = props

  const [hover, setHover] = useState(false)
  const lpTimer = useRef<ReturnType<typeof setTimeout> | 'fired' | null>(null)

  const selectable = !!onToggleSelect

  const startPress = (e: React.MouseEvent) => {
    if (!selectable || e.button !== 0) return
    lpTimer.current = setTimeout(() => { onToggleSelect?.(); lpTimer.current = 'fired' }, 420)
  }
  const endPress = () => {
    if (lpTimer.current && lpTimer.current !== 'fired') { clearTimeout(lpTimer.current); lpTimer.current = null }
  }
  const handleClick = (e: React.MouseEvent) => {
    // a long-press just fired a select → swallow the click
    if (lpTimer.current === 'fired') { lpTimer.current = null; return }
    if (selectable && (e.shiftKey || selectionActive)) { onToggleSelect?.(); return }
    onToggleExpand()
  }

  // reserved priority dot — colored for urgent/high, otherwise a transparent
  // dot of identical width so every title starts at the same x.
  const dotColor = (task.priority === 'urgent' || task.priority === 'high')
    ? PRIORITY_COLOR[task.priority]
    : (task.status === 'in_progress' ? ACCENT_TEAL : 'transparent')

  const rightMeta = (
    <>
      {isPlanned && !isDone && <PlannedChip label={plannedLabel} />}
      {extraMeta}
      <ProjectTag project={project} />
      {task.due_date && !isDone && <DueChip due={task.due_date} />}
    </>
  )

  return (
    <div
      style={{
        borderBottom: `1px solid ${withAlpha(INK, 6)}`,
        background: isSelected ? withAlpha(ACCENT_TEAL, 14)
          : isRightNow ? withAlpha(ACCENT_GOLD, 6)
          : isExpanded ? withAlpha(INK, 3)
          : 'transparent',
        boxShadow: isSelected ? `inset 2px 0 0 ${ACCENT_TEAL}` : 'none',
        opacity: isDone ? 0.6 : 1,
        transition: 'background 160ms',
      }}
    >
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); endPress() }}
        onMouseDown={startPress}
        onMouseUp={endPress}
        onClick={handleClick}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: dense ? '7px 14px' : '9px 14px', cursor: 'pointer', userSelect: 'none', minHeight: dense ? 34 : 38 }}
      >
        {/* fixed left cluster — constant width so titles always start at the same x */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, paddingTop: 1 }}>
          <Grip show={hover && !isDone} draggable={draggable} onDragStart={onDragStart} />
          <DoneBox done={isDone} onToggle={onToggleDone} />
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dotColor }} />
        </div>

        {stack ? (
          /* narrow rail: title full-width, meta stacks below */
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 1 }}>
            <span style={{ fontSize: 13.5, color: isDone ? INK_MUTED : INK, fontWeight: 500, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4, textWrap: 'pretty' as const }}>
              {leadingTag && <span style={{ marginRight: 6 }} aria-hidden="true">{leadingTag}</span>}
              {isRightNow && <RightNowBadge />}
              <TaskTitle title={task.title} fallback={task.description} />
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {rightMeta}
            </div>
            {belowTitle}
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              {/* title — full, wraps, never clipped */}
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: isDone ? INK_MUTED : INK, fontWeight: 500, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4, textWrap: 'pretty' as const }}>
                {leadingTag && <span style={{ marginRight: 6 }} aria-hidden="true">{leadingTag}</span>}
                {isRightNow && <RightNowBadge />}
                <TaskTitle title={task.title} fallback={task.description} />
                {showGroupOverridePin && task.group_override && (
                  <span title={`Moved manually (${task.group_override})`} style={{ fontSize: 9, color: ACCENT_TEAL, padding: '1px 4px', background: withAlpha(ACCENT_TEAL, 10), borderRadius: 3, marginLeft: 6 }}>📍</span>
                )}
              </span>
              {/* right meta — aligned to first line */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, paddingTop: 1 }}>
                {rightMeta}
                {!hideCaret && (
                  <span style={{ color: INK_DIM, opacity: hover || isExpanded ? 1 : 0.35, transition: 'opacity 140ms', flexShrink: 0, fontSize: 11 }}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                )}
              </div>
            </div>
            {belowTitle}
          </div>
        )}

        {stack && !hideCaret && (
          <span style={{ color: INK_DIM, opacity: hover || isExpanded ? 1 : 0.35, transition: 'opacity 140ms', flexShrink: 0, fontSize: 11, paddingTop: 2 }}>
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
      </div>
      {isExpanded && children}
    </div>
  )
}

function RightNowBadge() {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_GOLD, padding: '2px 6px', background: withAlpha(ACCENT_GOLD, 14), borderRadius: 3, marginRight: 6 }}>
      Right now
    </span>
  )
}

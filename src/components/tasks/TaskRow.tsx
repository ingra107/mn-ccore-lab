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
import { GripHorizontal, MapPin, Pin } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { useAuth } from '../../hooks/useAuth'
import { useIsMobile } from '../../hooks/useIsMobile'
import { emailToSlug } from '../../lib/emailSlug'
import { useUnseenActivity } from '../../hooks/useEntitySeen'
import { AttentionChip } from './AttentionChip'
import TaskTitle from './TaskTitle'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, ACCENT_ORANGE, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, withAlpha, todayKey,
} from '../../lib/taskGrouping'
import { dueLabelText, isOverdue } from '../../lib/dateUtils'
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
      // N1.08: .done-box is excluded from the blanket 44px mobile min-height
      // (which stretched this 17px square into a 17×44 capsule app-wide);
      // an invisible ::before pseudo-element restores the 44px touch target.
      className="done-box"
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
// Delegates to dueLabelText() from dateUtils so the wording is identical
// across all surfaces (DH-4 consolidation, 2026-06-04).
function DueChip({ due, status }: { due: string; status?: string }) {
  const dueDay = due.slice(0, 10)
  const overdue = isOverdue(due, status)
  const isToday = !overdue && dueDay === todayKey()
  const color = overdue ? ACCENT_CORAL : isToday ? ACCENT_GOLD : INK_MUTED
  return (
    <span
      title={`Due ${dueDay}`}
      style={{ fontSize: 11, color, fontVariantNumeric: 'tabular-nums', fontWeight: overdue ? 600 : 500, flexShrink: 0, whiteSpace: 'nowrap' }}
    >
      {dueLabelText(due, overdue)}
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

function PlannedChip({ label = 'planned', onUnplan }: { label?: string; onUnplan?: () => void }) {
  // #111: chip height must be stable so planned vs un-planned rows don't differ
  // in header height (which caused a visual jerk on expand). The .planned-chip
  // class exempts this button from the 44px mobile min-height rule — same
  // treatment as .done-box. lineHeight:1 + consistent padding keeps both
  // the button and span variant at identical height (~16px).
  const base = { fontSize: 10, color: ACCENT_GOLD, padding: '2px 6px', background: withAlpha(ACCENT_GOLD, 9), border: `1px solid ${withAlpha(ACCENT_GOLD, 28)}`, borderRadius: 999, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const, lineHeight: 1 }
  // When the surface wires planning (Today), the chip itself is the unplan
  // control — so there is exactly one 📌 on the row (status + toggle), never a
  // duplicate pushpin alongside a separate plan button.
  if (onUnplan) {
    return (
      <button
        type="button"
        className="planned-chip"
        onClick={(e) => { e.stopPropagation(); onUnplan() }}
        onMouseDown={(e) => e.stopPropagation()}
        title="Planned for today — click to unplan"
        aria-label="Unplan task"
        style={{ ...base, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 3 }}
      >
        <Pin {...ICON_PROPS} size={11} /> {label}
      </button>
    )
  }
  return <span style={{ ...base, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Pin {...ICON_PROPS} size={11} /> {label}</span>
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

  // ── title-click opens the full editor ── ONLY active when provided (Nick
  // 2026-06-10: "if I click the title I should have the editor come up").
  // The TITLE text becomes its own click target → full TaskDetailPanel; body
  // click elsewhere keeps onToggleExpand. Shift-click / selection-mode click /
  // long-press on the title still select (they bubble to the row handler).
  onOpenEditor?: () => void

  // ── multi-select ── ONLY active when onToggleSelect is provided.
  // shift-click or long-press (~420ms) toggles; while ≥1 row is selected a
  // plain click also toggles (selectionActive).
  isSelected?: boolean
  selectionActive?: boolean
  onToggleSelect?: () => void

  // ── drag-to-plan / reorder ── ONLY active when draggable + onDragStart.
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void

  // ── plan WITHOUT dragging ── ONLY active when onTogglePlan is provided
  // (Today). A 📌 button (or the planned-chip when already planned) toggles
  // the task in/out of the "no specific time" plan, sidestepping the HTML5
  // drag entirely. Distinct from draggable (drag = plan into a specific slot)
  // and body-click (expand).
  onTogglePlan?: () => void

  // ── state cues ──
  isPlanned?: boolean
  plannedLabel?: string
  // group_override pin (📍) — task was manually bucketed.
  showGroupOverridePin?: boolean

  // ── layout ──
  dense?: boolean
  /** Narrow rail: title full-width, meta stacks beneath it. N1.02: defaults
   *  to TRUE below 768px (Rule 15 content axis) so every adapter gets phone
   *  stacking for free — pass an explicit boolean to override. */
  stack?: boolean

  // ── content slots ──
  leadingTag?: ReactNode   // category glyph left of the title (🧠/🔧/💰…)
  extraMeta?: ReactNode    // surface-specific chips appended to the right cluster
  belowTitle?: ReactNode   // second line under the title (workflow badges…)
  children?: ReactNode     // inline detail rendered under the row when expanded
}

// DragHandle — hover-revealed grab icon co-located with the 📌 plan pin.
// Carries the full HTML5 DnD contract (draggable + dataTransfer text/plain id)
// previously owned by the left-gutter Grip. stopPropagation on click/mousedown
// prevents row expand from firing when the user grabs this icon.
// .task-grip class keeps the @media(hover:none) touch-hide rule working.
function DragHandle({ show, draggable, onDragStart }: { show: boolean; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void }) {
  if (!draggable) return null
  return (
    <span
      draggable
      onDragStart={onDragStart}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      title="Drag to timeline to schedule this task"
      className="task-grip"
      // ~50% larger hit area (Nick 2026-06-19): padding enlarges the click target
      // without changing the 12px icon's visual size. Negative margin absorbs the
      // padding so row layout doesn't shift.
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'grab', color: INK_MUTED, visibility: show ? 'visible' : 'hidden', transition: 'visibility 0s', flexShrink: 0, userSelect: 'none', verticalAlign: 'middle', marginLeft: 2, padding: '4px 5px', margin: '-4px -1px -4px 1px' }}
    >
      <GripHorizontal {...ICON_PROPS} size={12} />
    </span>
  )
}

export function TaskRow(props: SharedTaskRowProps) {
  const {
    task, project, isDone, onToggleDone, isExpanded, onToggleExpand, hideCaret,
    onOpenEditor,
    isSelected = false, selectionActive = false, onToggleSelect,
    draggable = false, onDragStart, onTogglePlan,
    isPlanned = false, plannedLabel, showGroupOverridePin = false,
    dense = false, stack: stackProp,
    leadingTag, extraMeta, belowTitle, children,
  } = props

  // N1.02 — phone viewports stack by default (the audit found Today/Lanes
  // rendering one-word-per-line titles because no adapter passed `stack`).
  // 768 = the Rule 15 content-driven stacking axis, NOT the 1024 nav split.
  const isPhone = useIsMobile(768)
  const stack = stackProp ?? isPhone

  const [hover, setHover] = useState(false)
  const lpTimer = useRef<ReturnType<typeof setTimeout> | 'fired' | null>(null)

  // Deliberately NO scroll-into-view on expand. A clicked row's inline detail
  // renders BELOW its header, which stays put — the browser does not move the
  // viewport on its own. The prior #78 fix called
  // rowRef.scrollIntoView({block:'nearest'}) here to "keep the row in place",
  // but once the drawer makes the row TALLER than the viewport, 'nearest'
  // scrolled DOWN to the row's lower edge and landed the viewport mid-task — a
  // jerk (the anti-jump fix itself jumped). Principle (Nick 2026-06-16): the
  // action happens, the view STAYS PUT, the user scrolls if/where they want.
  // Do NOT re-introduce an auto-scroll/refocus on expand/select.

  // NEW-to-you chip (Slack-style seen, 2026-06-11): assigned to the viewer and
  // never opened (acknowledged_at IS NULL). Auto-acknowledge fires when the
  // detail surface opens, so the chip clears live the moment you look at it.
  const { user } = useAuth()
  const isNewToViewer = !isDone && !!task.assignee && task.assignee === emailToSlug(user?.email) && !task.acknowledged_at

  // New-ACTIVITY signal (distinct from NEW assignment — Nick 2026-06-11):
  // a task you've already seen has activity by others since your last look.
  // Teal (communication), never gold; the gold NEW pill wins when both apply.
  // TanStack dedupes the query across rows (one fetch, 30s stale).
  const { data: unseen } = useUnseenActivity()
  const activityRow = !isDone && !isNewToViewer ? unseen?.tasks.get(task.id) : undefined

  const selectable = !!onToggleSelect

  const startPress = (e: React.MouseEvent) => {
    // Issue 2 fix: prevent browser text-selection that starts on mousedown when
    // modifier keys are held. Click/stopPropagation alone is too late — the
    // selection extends during mousedown-drag before click fires.
    if (selectable && (e.shiftKey || e.ctrlKey || e.metaKey)) { e.preventDefault() }
    if (!selectable || e.button !== 0) return
    lpTimer.current = setTimeout(() => { onToggleSelect?.(); lpTimer.current = 'fired' }, 420)
  }
  const endPress = () => {
    if (lpTimer.current && lpTimer.current !== 'fired') { clearTimeout(lpTimer.current); lpTimer.current = null }
  }
  const handleClick = (e: React.MouseEvent) => {
    // a long-press just fired a select → swallow the click
    if (lpTimer.current === 'fired') { lpTimer.current = null; return }
    // Issue 6 fix: check e.ctrlKey/e.metaKey directly from the event — don't rely
    // on selectionActive alone, which lags one render behind the keydown that set
    // selectModeActive=true. Without this, the first Ctrl+click falls through to
    // onToggleExpand() before React has re-rendered with the updated selectModeActive.
    if (selectable && (e.shiftKey || e.ctrlKey || e.metaKey || selectionActive)) { onToggleSelect?.(); return }
    onToggleExpand()
  }

  // reserved priority dot — colored for urgent/high, otherwise a transparent
  // dot of identical width so every title starts at the same x.
  const dotColor = (task.priority === 'urgent' || task.priority === 'high')
    ? PRIORITY_COLOR[task.priority]
    : (task.status === 'in_progress' ? ACCENT_TEAL : 'transparent')

  // P1-12: overdue rows carry a coral left edge (Rule 59 — coral = overdue).
  // Done tasks never read as overdue. Uses the shared isOverdue() (Rule 68).
  const rowOverdue = !isDone && !!task.due_date && isOverdue(task.due_date, task.status)

  // Prefer the curated short_title (PB-generated for long task names) for the row.
  // The full title stays available on hover (native title attr) and in the expanded
  // drawer. A complete short title is not a truncation — Rule 68 unaffected.
  const displayTitle = task.short_title || task.title
  // Full title on hover only when a (differing) short_title is what's shown.
  const fullTitleHover = displayTitle !== task.title ? task.title : undefined

  // Title-click → full editor (only when the surface wires onOpenEditor).
  // Select gestures keep working from the title: shift-click / selection-mode
  // click / post-long-press click all BUBBLE to the row's handleClick instead
  // of opening the editor. Underline-on-row-hover is the affordance.
  const titleNode = onOpenEditor ? (
    <span
      role="button"
      tabIndex={0}
      title={fullTitleHover ?? 'Open task editor'}
      onClick={(e) => {
        if (lpTimer.current === 'fired') return                          // long-press selected — let the row swallow it
        if (selectable && (e.shiftKey || e.ctrlKey || e.metaKey || selectionActive)) return  // bubble → select
        e.stopPropagation()
        onOpenEditor()
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpenEditor() } }}
      style={{ cursor: 'pointer', textDecoration: hover && !isDone ? 'underline' : undefined, textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
    >
      <TaskTitle title={displayTitle} fallback={task.description} />
    </span>
  ) : (
    <TaskTitle title={displayTitle} fallback={task.description} />
  )

  // Plan-without-dragging: a 📌 button shown only on surfaces that wire
  // onTogglePlan and only while the task is unplanned (once planned, the
  // PlannedChip in the right meta is the unplan control). The HTML5 drag remains
  // the path to a *specific* timeline slot; this is the reliable "just plan it
  // for today" path that needs no drag/scroll.
  //
  // Position (Nick 2026-06-10): the pin renders inline IMMEDIATELY AFTER the
  // title text, not in the right meta cluster near the project — Nick's mouse is
  // by the task name when he reaches for it. Hover-revealed on desktop;
  // always-on for touch via the @media (hover:none) rule on .today-plan-btn
  // (index.css). Rule 58's four affordances stay distinct: drag grip ⋮⋮ /
  // 📌 plan / body-click expand / ▶ promote.
  const planBtn = onTogglePlan && !isDone && !isPlanned ? (
    <button
      type="button"
      data-plan-btn={task.id}
      className="today-plan-btn"
      onClick={(e) => { e.stopPropagation(); onTogglePlan() }}
      onMouseDown={(e) => e.stopPropagation()}
      title="Plan for today (no specific time)"
      aria-label="Plan task for today"
      // ~50% larger hit area (Nick 2026-06-19): padding grows the click target;
      // negative margin keeps the row layout from shifting.
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', margin: '-4px -3px', color: ACCENT_GOLD, lineHeight: 1, flexShrink: 0, verticalAlign: 'baseline', visibility: hover ? 'visible' : 'hidden', display: 'inline-flex', alignItems: 'center' }}
    >
      <Pin {...ICON_PROPS} size={12} />
    </button>
  ) : null

  // Attention chip right after the title — gold ✦ NEW (assignment) wins over
  // teal ● n NEW (conversation); both render through the shared AttentionChip
  // so the styling matches the sidebar badge, ✦ New filter, and My Items.
  const newChip = isNewToViewer ? (
    <AttentionChip kind="new" style={{ marginLeft: 6 }} />
  ) : activityRow ? (
    <AttentionChip kind="activity" count={activityRow.new_count} style={{ marginLeft: 6 }} />
  ) : null

  const rightMeta = (
    <>
      {isPlanned && !isDone && <PlannedChip label={plannedLabel} onUnplan={onTogglePlan} />}
      {extraMeta}
      <ProjectTag project={project} />
      {task.due_date && !isDone && <DueChip due={task.due_date} status={task.status} />}
    </>
  )

  return (
    <div
      data-task-id={task.id}
      style={{
        // P1-12: overdue rows carry a coral left edge so "what's slipping" reads
        // in one sweep. Selection's teal inset wins when both apply.
        borderBottom: `1px solid ${withAlpha(INK, isDone ? 4 : 6)}`,
        // In select mode (selectionActive || isSelected) suppress the
        // isExpanded bg so teal selection is the SOLE visual emphasis.
        // Outside select mode isExpanded keeps its subtle ink bg.
        background: isSelected ? withAlpha(ACCENT_TEAL, 22)
          : isExpanded && !selectionActive ? withAlpha(INK, 3)
          : 'transparent',
        // P1-7: NO whole-row opacity — that compounded with the muted title and
        // dropped meta/due below the 0.85 floor (Rule 43). Doneness now reads
        // from the filled check + line-through + muted title alone.
        // Issue 4: selection left bar is TEAL (3px) — visually distinct from
        // overdue CORAL (2px). Priority: selected > overdue (a selected overdue
        // row reads teal, not coral — resolves issue 5's "stuck gold line"
        // confusion by making the selected indicator always win).
        boxShadow: isSelected
          ? `inset 3px 0 0 ${ACCENT_TEAL}`
          : (rowOverdue ? `inset 2px 0 0 ${ACCENT_CORAL}` : 'none'),
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
          <DoneBox done={isDone} onToggle={onToggleDone} />
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dotColor }} />
        </div>

        {stack ? (
          /* narrow rail: title full-width, meta stacks below */
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 1 }}>
            <span title={onOpenEditor ? undefined : fullTitleHover} style={{ fontSize: 13.5, color: isDone ? INK_MUTED : INK, fontWeight: 500, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4, textWrap: 'pretty' as const }}>
              {leadingTag && <span style={{ marginRight: 6 }} aria-hidden="true">{leadingTag}</span>}
              {titleNode}
              {newChip}
              {planBtn && <span style={{ marginLeft: 4, whiteSpace: 'nowrap' }}>{planBtn}</span>}
              <DragHandle show={hover && !isDone} draggable={draggable} onDragStart={onDragStart} />
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
              <span title={onOpenEditor ? undefined : fullTitleHover} style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: isDone ? INK_MUTED : INK, fontWeight: 500, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4, textWrap: 'pretty' as const }}>
                {leadingTag && <span style={{ marginRight: 6 }} aria-hidden="true">{leadingTag}</span>}
                  {titleNode}
                {newChip}
                {showGroupOverridePin && task.group_override && (
                  <span title={`Moved manually (${task.group_override})`} style={{ display: 'inline-flex', alignItems: 'center', color: ACCENT_TEAL, padding: '1px 5px', background: withAlpha(ACCENT_TEAL, 9), border: `1px solid ${withAlpha(ACCENT_TEAL, 28)}`, borderRadius: 999, marginLeft: 6 }}>
                    <MapPin {...ICON_PROPS} size={11} />
                  </span>
                )}
                {planBtn && <span style={{ marginLeft: 4, whiteSpace: 'nowrap' }}>{planBtn}</span>}
                <DragHandle show={hover && !isDone} draggable={draggable} onDragStart={onDragStart} />
              </span>
              {/* right meta — aligned to first line */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, paddingTop: 1 }}>
                {rightMeta}
                {!hideCaret && (
                  // P1-11: expand caret is always discoverable (readable tier,
                  // subordinate to the title; visible on touch). Hover = emphasis.
                  <span style={{ color: INK_MUTED, opacity: hover || isExpanded ? 1 : 0.7, transition: 'opacity 140ms', flexShrink: 0, fontSize: 11 }}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                )}
              </div>
            </div>
            {belowTitle}
          </div>
        )}

        {stack && !hideCaret && (
          // P1-11: stacked-rail caret — same discoverable-at-rest treatment.
          <span style={{ color: INK_MUTED, opacity: hover || isExpanded ? 1 : 0.7, transition: 'opacity 140ms', flexShrink: 0, fontSize: 11, paddingTop: 2 }}>
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
      </div>
      {isExpanded && children}
    </div>
  )
}


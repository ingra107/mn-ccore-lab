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

import { isMilestone } from '../../../shared/taskKinds'
import { useRef, useState, type ReactNode } from 'react'
import { GripHorizontal, MapPin, Pin } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { useAuth } from '../../hooks/useAuth'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useUnseenActivity } from '../../hooks/useEntitySeen'
import { AttentionChip } from './AttentionChip'
import TaskTitle from './TaskTitle'
import { useCompletionRing } from '../../lib/completionMoment'
import { INK, INK_MUTED, withAlpha, type MilestoneRole, type MilestoneEntry } from '../../lib/taskGrouping'
import { dueLabelCompact, dueTone, isOverdue } from '../../lib/dateUtils'
import { CardRow, MilestoneCardRow } from './TaskCardRow'
import type { TaskRow as TaskRowData } from '../../lib/api'
import { taskShortLabel } from '../../lib/displayNames'
import { LONG_PRESS_MS } from '../../lib/uiTiming'
import { usePairName } from '../../hooks/useProjectPairs'
import { Button } from '../ui/Button'

// Reserved priority-dot color. only urgent carries a colored dot; everything
// else gets a transparent dot of the SAME width so every title starts at the
// identical x (handoff rule #6 — one fixed left edge).
// Urgency rail colours (2026-07-22; Urgent-only per Nick 2026-10-09, "gray except Urgent"): 'medium'
// and 'low' are the shapeless middle of the scale and painting them turns the
// rail back into noise. The old map carried medium/gold + low/dim entries that
// were UNREACHABLE — the dot they fed only ever rendered urgent/high — which is
// exactly the kind of dead branch that makes a signal impossible to reason
// about. Absent rail = "not urgent", and that reads fine.
const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--job-stale)',
}

// ── DoneBox — the canonical complete control. check = DONE, same everywhere ──
// Fills teal (the accent: progress), not green: green has no job under the color
// rule (rules-ui-design 21). `taskId` lets the box play the completion moment's
// fading ring once the Hub accepts the write (lib/completionMoment).
export function DoneBox({ done, onToggle, color = 'var(--job-accent)', taskId }: { done: boolean; onToggle: () => void; color?: string; taskId?: string }) {
  const ring = useCompletionRing(done ? taskId : undefined)
  return (
    <button
      type="button"
      // N1.08: .done-box is excluded from the blanket 44px mobile min-height
      // (which stretched this 17px square into a 17×44 capsule app-wide);
      // an invisible ::before pseudo-element restores the 44px touch target.
      className={`done-box tip${ring ? ' cm-ring' : ''}`}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      onMouseDown={(e) => e.stopPropagation()}
      data-tip={done ? 'Mark not done' : 'Mark done'}
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
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="var(--sk-ac-fg)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    </button>
  )
}

// ── SelectBox — the visible multi-select control (opt-in via `selectBox`). A
// small accent square at the row's left edge; the DoneBox beside it stays the
// complete control. Selection is the accent's job, so it fills teal.
export function SelectBox({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Button size="icon"
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label="Select action item"
      className="task-selbox"
      data-on={on ? 'true' : undefined}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="var(--sk-ac-fg)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </Button>
  )
}

// Due-date chip — compact (<= 6 chars, right-aligned in a 6ch box so a column
// of chips lines up; Nick 2026-09-17); coral overdue, gold today, subtle gold
// tomorrow, muted otherwise. The absolute date is the tooltip. Wording comes
// from dueLabelCompact() in dateUtils so every row surface agrees.
const CHIP_BOX: React.CSSProperties = {
  display: 'inline-block', minWidth: '6ch', textAlign: 'right', fontSize: 11,
  fontVariantNumeric: 'tabular-nums', flexShrink: 0, whiteSpace: 'nowrap',
}

function DueChip({ due, status }: { due: string; status?: string }) {
  const dueDay = due.slice(0, 10)
  const overdue = isOverdue(due, status)
  const tone = dueTone(due, overdue)
  // Due today wants you now (gold); tomorrow is just a date (rules-ui-design 21).
  const color = tone === 'overdue' ? 'var(--job-overdue)' : tone === 'today' ? 'var(--job-wants)' : INK_MUTED
  return (
    <span
      className="tip tip-end"
      data-tip={`Due ${dueDay}`}
      aria-label={`Due ${dueDay}`}
      style={{ ...CHIP_BOX, color, fontWeight: overdue ? 600 : 500, opacity: tone === 'tomorrow' ? 0.65 : 1 }}
    >
      {dueLabelCompact(due, overdue)}
    </span>
  )
}

// Project name = a LINK that jumps to the project (navigation), distinct from
// the "reassign project" control (handoff §1). NOTE (2026-07-21): that reassign
// control is NOT a folder icon as this comment claimed for months — no folder
// affordance exists anywhere in src/components/tasks. It is the searchable
// ProjectInlineGhostSelect chip (detail/FieldControls.tsx), used by the full
// editor, both inline drawers, and now TaskRowActions. Corrected rather than
// left in place: a comment naming a control that does not exist is what a
// future reader would design against.
function ProjectTag({ project, task, shrink = false }: { project: { name: string; slug: string; fullTitle?: string } | null; task?: TaskRowData; shrink?: boolean }) {
  // "Project ~ Product" when the project has 2+ products.
  const name = usePairName(task, project?.name ?? '')
  if (!project) return null
  // shrink: the narrow-rail line, where the name gives way to the due label.
  // A Link is inline, and an inline box ignores max-width/ellipsis outside a
  // flex parent, so it is a block here; minWidth 0 lets it shrink below its
  // text so the ellipsis shows instead of a hard cut at the column edge.
  const size = shrink
    ? { flex: '0 1 auto', minWidth: 0, display: 'block' }
    : { flexShrink: 0, maxWidth: 180 }
  return (
    // Teal color + hover-underline (.link-affordance) make the link self-evident —
    // no "Jump to X" tooltip needed (Nick 2026-07-09). aria-label keeps the
    // destination for screen readers.
    <Link
      to={PATHS.project(project.slug)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Open ${name}`}
      // A shrunk name is often cut, so its hover tip always carries the name.
      title={project.fullTitle ?? (shrink ? name : undefined)}
      className="link-affordance"
      style={{ fontSize: 11, color: 'var(--sk-t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...size }}
    >
      {name}
    </Link>
  )
}

function PlannedChip({ label = 'planned', onUnplan }: { label?: string; onUnplan?: () => void }) {
  // #111: chip height must be stable so planned vs un-planned rows don't differ
  // in header height (which caused a visual jerk on expand). The .planned-chip
  // class exempts this button from the 44px mobile min-height rule — same
  // treatment as .done-box. lineHeight:1 + consistent padding keeps both
  // the button and span variant at identical height (~16px).
  const base = { fontSize: 10, color: 'var(--sk-t2)', padding: '2px 6px', background: withAlpha('var(--sk-t1)', 5), border: `1px solid ${withAlpha('var(--sk-t1)', 14)}`, borderRadius: 999, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const, lineHeight: 1 }
  // When the surface wires planning (Today), the chip itself is the unplan
  // control — so there is exactly one 📌 on the row (status + toggle), never a
  // duplicate pushpin alongside a separate plan button.
  if (onUnplan) {
    return (
      <button
        type="button"
        className="planned-chip tip"
        onClick={(e) => { e.stopPropagation(); onUnplan() }}
        onMouseDown={(e) => e.stopPropagation()}
        data-tip="Click to unplan"
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
  /** name = the SHORT label (displayNames.projectShortLabel); fullTitle = hover only. */
  project: { name: string; slug: string; fullTitle?: string } | null

  // ── kind (schema-v109, GH #131/#132) ── 'milestone' renders a half-height
  // dated rule instead of the normal row: no DoneBox (a milestone is not
  // completed by clicking a box — Mark complete lives in the expanded
  // drawer), a ◆ glyph in its place, a hairline rule above+below, and a
  // trimmed left→right order (glyph → project link → title → due → caret).
  // Defaults to 'task' so every existing caller renders byte-identical.
  variant?: 'task' | 'milestone'   // override only — defaults from task.kind

  // ── milestone two-date rendering (Nick 2026-09-17) ── which of a
  // milestone's 1-2 rule-entries THIS row represents (see milestoneRules in
  // taskGrouping.ts). Set only on date-ordered lists that ran the task
  // through interleaveMilestones (Today groups); left undefined on lists
  // that render a milestone as a single row regardless of date order
  // (project page, My Tasks) — there, MilestoneRow reads due_date/deadline
  // straight off `task` and shows both dates side by side when they differ.
  milestoneRole?: MilestoneRole

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
  /**
   * rowActions — trailing per-row action cluster, rendered AFTER the due chip
   * at the far right of the meta row (`extraMeta` lands before the project +
   * due chips, which is the wrong end for a verb strip). Distinct from
   * `extraMeta`: that slot carries *information* chips, this one carries
   * *controls*. Nothing renders when the prop is omitted, so every existing
   * surface is byte-identical.
   *
   * Reveal-on-hover + keyboard reachability are the CALLER's concern via the
   * `.task-row-actions` class (index.css) — the row deliberately does not gate
   * it on its internal `hover` state, because that state does not fire on
   * keyboard focus and an action strip that only exists on :hover is an
   * accessibility bug.
   */
  rowActions?: ReactNode
  /** The surface's `rowActions` already carries an editable due date, so the
   *  static due chip is left off and the date prints once. */
  hideDue?: boolean
  /** A visible select box at the row's left edge (shown on hover, focus and
   *  touch, and always while a selection is open). Needs `onToggleSelect`. The
   *  shift-click / long-press gestures keep working beside it. */
  selectBox?: boolean

  // Card anatomy is opt-in through CardTaskRowProps below (card: true).
  card?: false
}

// ── card anatomy (Today reskin, 2026-10-09) ── opt-in. With `card: true` the row
// renders as a stepped-surface CARD (.tk-card): bold title, the project's short
// name as a muted line under it, the assignee's face top right, other people
// bottom-left, small icon+counts bottom-right, due as a dot pill. Defaults off,
// so every other surface renders byte-identical (Rule 68: add a prop, never fork).
//
// The card does not implement multi-select, the trailing verb strip or the
// stacked layout, so those props are `never` here: passing one is a TYPE ERROR
// instead of a silently ignored prop.
export type CardTaskRowProps = Omit<SharedTaskRowProps, 'card' | 'rowActions' | 'hideDue' | 'selectBox' | 'isSelected' | 'selectionActive' | 'onToggleSelect' | 'stack'> & {
  card: true
  rowActions?: never
  hideDue?: never
  selectBox?: never
  isSelected?: never
  selectionActive?: never
  onToggleSelect?: never
  stack?: never
  /** extra pills on the context line, after the due pill (workflow pills). */
  footPills?: ReactNode
  /** Fixed action slots on the context line (Today round 2, 2026-10-09). Each
   *  keeps its space when empty so cards line up: links (min 74px, right-
   *  aligned) then the 24px meeting marker. */
  linksSlot?: ReactNode
  meetingSlot?: ReactNode
  /** folder + Work-on, pinned bottom-right under the assignee face. */
  workSlot?: ReactNode
  /** A parent with steps (Today): a full-width block under the context line
   *  (the "Next:" row, dots, count). Nothing renders when absent. */
  stepsSlot?: ReactNode
  /** The complete box is not offered: a parent cannot close while a step is
   *  open (the Hub refuses it). Text is the tooltip. */
  doneLocked?: string
}

// DragHandle — hover-revealed grab icon co-located with the 📌 plan pin.
// Carries the dnd-kit drag contract (useDraggable listeners spread onto the span).
// stopPropagation on click/mousedown prevents row expand from firing when the
// user grabs this icon. .task-grip class is a hook for any future CSS targeting.
function DragHandle({ show, draggable, onDragStart }: { show: boolean; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void }) {
  if (!draggable) return null
  return (
    <span
      draggable
      onDragStart={onDragStart}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      data-tip="Drag to schedule"
      aria-label="Drag to schedule"
      className="task-grip tip"
      // ~50% larger hit area (Nick 2026-06-19): padding enlarges the click target
      // without changing the 12px icon's visual size. Negative margin absorbs the
      // padding so row layout doesn't shift.
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'grab', color: INK_MUTED, visibility: show ? 'visible' : 'hidden', transition: 'visibility 0s', flexShrink: 0, userSelect: 'none', verticalAlign: 'middle', marginLeft: 2, padding: '4px 5px', margin: '-4px -1px -4px 1px' }}
    >
      <GripHorizontal {...ICON_PROPS} size={12} />
    </span>
  )
}

export function TaskRow(props: SharedTaskRowProps | CardTaskRowProps) {
  // The variant switch lives ABOVE every hook: MilestoneRow and StandardRow
  // are separate components, so neither calls hooks conditionally
  // (rules-of-hooks) and the 'task' path stays byte-identical for every
  // existing caller (Rule 68: add a prop, never fork).
  // `variant` is an OVERRIDE; the default is read off the row itself, so a
  // caller that never heard of milestones still renders one correctly.
  const variant = props.variant ?? (isMilestone(props.task) ? 'milestone' : 'task')
  if (props.card) return variant === 'milestone' ? <MilestoneCardRow {...props} /> : <CardRow {...props} />
  return variant === 'milestone' ? <MilestoneRow {...props} /> : <StandardRow {...props} />
}

// ── Milestone branch (GH #131/#132) — a dated rule, not a task row. ────────
// Half height, a hairline above and below, ◆ where the done box would sit,
// project link → title → due → caret. No click-to-complete on the row; the
// expanded drawer owns Mark complete.
// Two-date milestone rendering (Nick 2026-09-17). `milestoneRole` is set by
// interleaveMilestones on date-ordered lists (Today groups): each rule this
// milestone expanded into is its own row, positioned by its own date — an
// 'internal' or 'slipped' role reads gray, a 'hard' role (or no role, on the
// single-date default) reads gold (Nick 2026-10-11: the internal date is a
// gray rule, the hard sponsor date keeps gold).
function MilestoneRow(props: SharedTaskRowProps) {
  const { task, project, isDone, isExpanded, onToggleExpand, hideCaret, children, milestoneRole } = props

  const isInternalRole = milestoneRole === 'internal' || milestoneRole === 'slipped'
  const diamondColor = isInternalRole ? 'var(--sk-t3)' : 'var(--job-milestone)'
  const dimmed = milestoneRole === 'slipped'
  const titleOpacity = dimmed ? 0.6 : 0.85
  const emphasisOpacity = dimmed ? 0.55 : 1

  return (
      <div data-task-id={task.id} data-task-kind="milestone" {...(milestoneRole ? { 'data-milestone-role': milestoneRole } : {})}>
        <div style={{ borderTop: `1px solid ${withAlpha(INK, 13)}` }} />
        <div
          onClick={onToggleExpand}
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '3px 14px', minHeight: 20, cursor: 'pointer', userSelect: 'none' }}
        >
          <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 17, flexShrink: 0, color: diamondColor, opacity: emphasisOpacity, fontSize: 11, lineHeight: 1 }}>◆</span>
          <span className="sr-only">Milestone</span>
          {/* Title first and project on the right, like a task row (Nick
              2026-09-16); a faint leader (gold/gray, matching the diamond)
              runs between them so the two read as one dated line rather than
              a title and a stray chip. */}
          <span
            style={{
              flexShrink: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: INK, opacity: titleOpacity,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: isDone ? 'line-through' : 'none',
            }}
          >
            {taskShortLabel(task)}
          </span>
          <span aria-hidden="true" style={{ flex: 1, minWidth: 24, height: 1, background: withAlpha(diamondColor, 28), opacity: emphasisOpacity }} />
          <ProjectTag project={project} task={task} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, opacity: emphasisOpacity }}>
            <MilestoneChips task={task} role={milestoneRole} status={task.status} />
          </span>
          {!hideCaret && (
            <span style={{ color: INK_MUTED, opacity: isExpanded ? 1 : 0.7, transition: 'opacity 140ms', flexShrink: 0, fontSize: 11 }}>
              {isExpanded ? '▾' : '▸'}
            </span>
          )}
        </div>
        <div style={{ borderBottom: `1px solid ${withAlpha(INK, 13)}` }} />
        {isExpanded && <div data-no-long-press style={{ display: 'contents' }}>{children}</div>}
      </div>
  )
}

// Which due-chip(s) a milestone row shows. Three shapes:
//   - `role` set (from interleaveMilestones) — render exactly the one date
//     that row represents (task.milestoneDate).
//   - no role, single date (no deadline, or deadline == due_date) — one
//     gold HARD chip reading due_date (a milestone's only date is its hard date).
//   - no role, two distinct dates (project page / My Tasks — lists that
//     never ran through interleaveMilestones) — both chips side by side,
//     so a viewer sees the miss without needing date-ordered placement.
function MilestoneChips({ task, role, status }: { task: TaskRowData; role?: MilestoneRole; status?: string }) {
  const civil = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)
  const due = civil(task.due_date)
  const hard = civil(task.deadline)

  if (role) {
    const entry = task as MilestoneEntry
    const date = civil(entry.milestoneDate) ?? (role === 'hard' ? (hard ?? due) : due)
    return date ? <MilestoneChip role={role} date={date} status={status} /> : null
  }

  if (hard && hard !== due) {
    return (
      <>
        {due && <MilestoneChip role="internal" date={due} status={status} />}
        <MilestoneChip role="hard" date={hard} status={status} />
      </>
    )
  }
  const single = hard ?? due
  return single ? <MilestoneChip role="hard" date={single} status={status} /> : null
}

// Milestone chip: the COLOR names the date (Nick 2026-09-17, no word prefix) —
// gold = hard (red once missed), gray = internal, dimmed gray = slipped
// (Nick 2026-10-11). Same
// compact wording and 6ch box as DueChip. internal/slipped are NEVER coral: a
// slipped internal date is a miss to notice, not an active overdue item (that
// is what the paired hard-date chip is for).
function MilestoneChip({ role, date, status }: { role: MilestoneRole; date: string; status?: string }) {
  const overdue = role === 'hard' && isOverdue(date, status)
  const color = role === 'hard' ? (overdue ? 'var(--job-overdue)' : 'var(--job-milestone)') : 'var(--sk-t2)'
  const dimmed = role === 'slipped'
  const tip = role === 'hard' ? 'Hard date' : dimmed ? 'Internal date slipped' : 'Internal date'
  return (
    <span
      className="tip tip-end"
      data-tip={`${tip}: ${date}`}
      aria-label={`${role}: ${date}`}
      style={{ ...CHIP_BOX, color, fontWeight: overdue ? 600 : 500, opacity: dimmed ? 0.55 : 1 }}
    >
      {dueLabelCompact(date, overdue)}
    </span>
  )
}

function StandardRow(props: SharedTaskRowProps) {
  const {
    task, project, isDone, onToggleDone, isExpanded, onToggleExpand, hideCaret,
    onOpenEditor,
    isSelected = false, selectionActive = false, onToggleSelect,
    draggable = false, onDragStart, onTogglePlan,
    isPlanned = false, plannedLabel, showGroupOverridePin = false,
    dense = false, stack: stackProp,
    leadingTag, extraMeta, belowTitle, children, rowActions, hideDue = false, selectBox = false,
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
  const isNewToViewer = !isDone && !!task.assignee && task.assignee === (user?.slug ?? '') && !task.acknowledged_at

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
    lpTimer.current = setTimeout(() => { onToggleSelect?.(); lpTimer.current = 'fired' }, LONG_PRESS_MS)
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

  // ── The left rail = URGENCY (Nick 2026-07-22) ─────────────────────────────
  //
  // Replaces both the priority/progress DOT (deleted) and the overdue rail.
  //
  // Why the rail moved off overdue: overdue is ALREADY the loudest thing on the
  // row — DueChip renders it in coral at weight 600 with a worded label
  // ("Yesterday", "3d late"), and it renders on every undone task that has a due
  // date. Spending the row's only full-height channel restating that left
  // urgency with no channel at all once the dot went. One signal, one channel:
  // rail = how urgent, due text = when, AttentionChip = what's new, DoneBox =
  // done.
  //
  // Why the dot died: it multiplexed priority AND progress through 7px with a
  // precedence rule, so an in-progress high task rendered orange and its
  // progress vanished; teal meant "in progress AND not urgent/high", which is
  // not an invertible encoding. It was also aria-hidden with no legend, so it
  // carried no meaning for a screen reader and none for a human who hadn't read
  // the source.
  const railColor = !isDone ? PRIORITY_COLOR[task.priority ?? ''] : undefined

  // Prefer the curated short_title (PB-generated for long task names) for the row.
  // The full title is available in the expanded drawer — NOT on hover (Nick
  // 2026-07-09: "i don't need the long title when i hover over tasks"). A complete
  // short title is not a truncation — Rule 68 unaffected.
  const displayTitle = taskShortLabel(task)

  // Title-click → full editor (only when the surface wires onOpenEditor).
  // Select gestures keep working from the title: shift-click / selection-mode
  // click / post-long-press click all BUBBLE to the row's handleClick instead
  // of opening the editor. Underline-on-row-hover is the affordance.
  const titleNode = onOpenEditor ? (
    <span
      role="button"
      tabIndex={0}
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
    <Button size="icon"
      type="button"
      data-plan-btn={task.id}
      className="today-plan-btn hit-area tip"
      onClick={(e) => { e.stopPropagation(); onTogglePlan() }}
      onMouseDown={(e) => e.stopPropagation()}
      data-tip="Plan for today"
      aria-label="Plan task for today"
      // ~50% larger hit area (Nick 2026-06-19): padding grows the click target;
      // negative margin keeps the row layout from shifting.
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', margin: '-4px -3px', color: 'var(--sk-t2)', lineHeight: 1, flexShrink: 0, verticalAlign: 'baseline', visibility: hover ? 'visible' : 'hidden', display: 'inline-flex', alignItems: 'center' }}
    >
      <Pin {...ICON_PROPS} size={12} />
    </Button>
  ) : null

  // Attention chip right after the title — gold ✦ NEW (assignment) wins over
  // teal ● n NEW (conversation); both render through the shared AttentionChip
  // so the styling matches the sidebar badge, ✦ New filter, and the Today New activity card.
  const newChip = isNewToViewer ? (
    <AttentionChip kind="new" style={{ marginLeft: 6 }} />
  ) : activityRow ? (
    <AttentionChip kind="activity" count={activityRow.new_count} style={{ marginLeft: 6 }} />
  ) : null

  const rightMeta = (
    <>
      {isPlanned && !isDone && <PlannedChip label={plannedLabel} onUnplan={onTogglePlan} />}
      {extraMeta}
      <ProjectTag project={project} task={task} />
      {task.due_date && !isDone && !hideDue && <DueChip due={task.due_date} status={task.status} />}
      {rowActions}
    </>
  )
  // Stacked rows split rightMeta: project + due get their own fixed line, the
  // rest (planned chip, surface chips, row actions) wrap on the line below.
  const stackChips = (isPlanned && !isDone) || extraMeta || rowActions ? (
    <>
      {isPlanned && !isDone && <PlannedChip label={plannedLabel} onUnplan={onTogglePlan} />}
      {extraMeta}
      {rowActions}
    </>
  ) : null

  return (
    <div
      data-task-id={task.id}
      data-selecting={selectionActive || isSelected ? 'true' : undefined}
      style={{
        borderBottom: `1px solid ${withAlpha(INK, isDone ? 4 : 6)}`,
        // In select mode (selectionActive || isSelected) suppress the
        // isExpanded bg so teal selection is the SOLE visual emphasis.
        // Outside select mode isExpanded keeps its subtle ink bg.
        background: isSelected ? withAlpha('var(--job-accent)', 22)
          : isExpanded && !selectionActive ? withAlpha(INK, 3)
          : 'transparent',
        // P1-7: NO whole-row opacity — that compounded with the muted title and
        // dropped meta/due below the 0.85 floor (Rule 43). Doneness now reads
        // from the filled check + line-through + muted title alone.
        // Selection's TEAL 3px still wins over the urgency rail: selection is a
        // transient thing YOU are doing right now, urgency is a standing
        // property of the task, and the active gesture has to be unambiguous.
        boxShadow: isSelected
          ? `inset 3px 0 0 var(--job-accent)`
          : (railColor ? `inset 2px 0 0 ${railColor}` : 'none'),
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
        {/* Fixed left cluster. The 7px priority/progress dot that used to sit
            between the box and the title is GONE (2026-07-22) along with its
            9px gap, so every title moves 16px left — uniformly, on every
            surface that renders this row, which is why the reserve it provided
            is not missed. Urgency now reads from the rail on the row edge.
            The rail is pure colour, so the urgency it encodes is spoken here
            instead — the deleted dot was aria-hidden and told a screen reader
            nothing at all. */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, paddingTop: 1 }}>
          {selectBox && onToggleSelect && (
            <SelectBox on={isSelected} onToggle={onToggleSelect} />
          )}
          <DoneBox done={isDone} onToggle={onToggleDone} taskId={task.id} />
          {railColor && <span className="sr-only">{task.priority === 'urgent' ? 'Urgent' : 'High priority'}</span>}
        </div>

        {stack ? (
          /* narrow rail: title full-width, meta stacks below */
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 1 }}>
            <span style={{ fontSize: 13.5, color: isDone ? INK_MUTED : INK, fontWeight: 500, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4, textWrap: 'pretty' as const }}>
              {leadingTag && <span style={{ marginRight: 6 }} aria-hidden="true">{leadingTag}</span>}
              {titleNode}
              {newChip}
              {planBtn && <span style={{ marginLeft: 4, whiteSpace: 'nowrap' }}>{planBtn}</span>}
              <DragHandle show={hover && !isDone} draggable={draggable} onDragStart={onDragStart} />
            </span>
            {/* Narrow-rail context line: project left, due label pinned right.
                It never wraps, so the due label holds one place on every card
                and only the project name gives way (ellipsis). Wrapping let a
                long project push the due label onto a line of its own, at a
                different spot per card (site audit 2026-10-10, 196px Columns). */}
            {(project || (task.due_date && !isDone && !hideDue)) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <ProjectTag project={project} task={task} shrink />
                {task.due_date && !isDone && !hideDue && (
                  <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex' }}>
                    <DueChip due={task.due_date} status={task.status} />
                  </span>
                )}
              </div>
            )}
            {stackChips && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {stackChips}
              </div>
            )}
            {belowTitle}
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              {/* title — full, wraps, never clipped */}
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: isDone ? INK_MUTED : INK, fontWeight: 500, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4, textWrap: 'pretty' as const }}>
                {leadingTag && <span style={{ marginRight: 6 }} aria-hidden="true">{leadingTag}</span>}
                  {titleNode}
                {newChip}
                {showGroupOverridePin && task.group_override && (
                  <span className="tip" data-tip={`Moved manually (${task.group_override})`} aria-label={`Moved manually (${task.group_override})`} style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--sk-t3)', padding: '1px 5px', background: withAlpha('var(--job-accent)', 9), border: `1px solid ${withAlpha('var(--job-accent)', 28)}`, borderRadius: 999, marginLeft: 6 }}>
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
      {/* The expanded drawer is not part of the row's press target: a hold on
          its comment box, checkboxes or text must not select the row behind it
          (useLongPress skips [data-no-long-press]; display:contents keeps the
          layout as it was). */}
      {isExpanded && <div data-no-long-press style={{ display: 'contents' }}>{children}</div>}
    </div>
  )
}


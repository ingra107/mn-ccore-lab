// TaskCardRow — the CARD anatomy of the shared task row (Today reskin,
// 2026-10-09). Opt-in via `card` on SharedTaskRow (tasks/TaskRow.tsx), which
// dispatches here; every other surface keeps the standard row.
//
// One anatomy, repeated (round 2, 2026-10-09): a bold title row, then ONE
// context line (project short name, due pill, workflow pills, other people)
// with fixed action slots at its right end (links, meeting marker). The right
// column is a fixed 50px: the assignee's face on top, folder + Work on pinned
// under it, so face / folder / Work-on form a triangle. No expand caret: the
// body click still expands. Priority is gray except
// Urgent, which gets the one orange rail and an "Urgent" tag (HIGH no longer
// paints a rail: a second color for a second priority is the equal-weight
// color noise the reskin removes). No subtask steps and no invented content.
//
// The contract is the standard row's: square = COMPLETE, body click = expand,
// grip = drag-to-plan, pin = plan for today, planned pill = unplan. Styles:
// .tk-* in index.css.

import { Link } from 'react-router-dom'
import { GripHorizontal, MapPin, MessageSquare, Pin } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'
import { useAuth } from '../../hooks/useAuth'
import { useUnseenActivity } from '../../hooks/useEntitySeen'
import { civilDaysOverdue, dueLabelCompact, dueTone, formatShortDate, isOverdue } from '../../lib/dateUtils'
import { slugForEmail } from '../../lib/emailSlug'
import type { MilestoneEntry } from '../../lib/taskGrouping'
import { Face, Faces, CheckGlyph } from '../today/skin'
import TaskTitle from './TaskTitle'
import type { CardTaskRowProps } from './TaskRow'
import { taskShortLabel } from '../../lib/displayNames'

// The complete control on a card (.tk-ck). Same contract as DoneBox: the square
// is COMPLETE, everywhere. `done-box` keeps the invisible 24px+ hit area.
export function CardCheck({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`done-box tip tk-ck${done ? ' tk-on' : ''}`}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      onMouseDown={(e) => e.stopPropagation()}
      data-tip={done ? 'Mark not done' : 'Mark done'}
      aria-label={done ? 'Mark not done' : 'Mark done'}
      aria-pressed={done}
    >
      {done && <CheckGlyph />}
    </button>
  )
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Card due wording: "2d late", "Yesterday", "Due today", "Tomorrow", a weekday
 *  within the next week, else "Fri Oct 16". Words, not "in 3d". */
function dueWords(due: string, overdue: boolean): string {
  const target = new Date(due.slice(0, 10) + 'T12:00:00')
  if (isNaN(target.getTime())) return due.slice(0, 10)
  const todayNoon = new Date(); todayNoon.setHours(12, 0, 0, 0)
  const days = Math.round((target.getTime() - todayNoon.getTime()) / 86400000)
  if (overdue) { const n = civilDaysOverdue(due); return n <= 1 ? 'Yesterday' : `${n}d overdue` }
  if (days === 0) return 'Due today'
  if (days === 1) return 'Tomorrow'
  if (days <= 6) return WEEKDAYS[target.getDay()]
  return `${WEEKDAYS[target.getDay()]} ${formatShortDate(due)}`
}

function CardDuePill({ due, status }: { due: string; status?: string }) {
  const dueDay = due.slice(0, 10)
  const overdue = isOverdue(due, status)
  const tone = dueTone(due, overdue)
  const label = dueWords(due, overdue)
  // Phone: an overdue pill swaps to the signless compact form ("9d") so the
  // word is never clipped by ellipsis (Nick 2026-09-17 compact rule). CSS
  // shows one span at a time (display:none also hides the other from screen
  // readers); the compact form carries a hidden " overdue" for them.
  const compact = overdue ? dueLabelCompact(due, overdue) : null
  const cls = overdue ? 'tk-pill tk-o tk-duepill' : tone === 'today' ? 'tk-pill tk-g' : 'tk-pill'
  return (
    <span className={cls} data-tip={`Due ${dueDay}`} aria-label={`Due ${dueDay}`}>
      <i />
      {compact ? (
        <>
          <span className="tk-due-full">{label}</span>
          <span className="tk-due-short">{compact}<span className="sr-only"> overdue</span></span>
        </>
      ) : label}
    </span>
  )
}

function CardProjectLine({ project }: { project: { name: string; slug: string; fullTitle?: string } | null }) {
  if (!project) return <span className="tk-cs">No project</span>
  return (
    <span className="tk-cs">
      <Link
        to={PATHS.project(project.slug)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Open ${project.name}`}
        title={project.fullTitle}
      >
        {project.name}
      </Link>
    </span>
  )
}

export function CardRow(props: CardTaskRowProps) {
  const {
    task, project, isDone, onToggleDone, isExpanded, onToggleExpand,
    onOpenEditor, dense = false, draggable = false, onDragStart, onTogglePlan,
    isPlanned = false, plannedLabel, showGroupOverridePin = false,
    leadingTag, extraMeta, belowTitle, footPills, linksSlot, meetingSlot, workSlot, children,
  } = props

  const { user } = useAuth()
  const isNewToViewer = !isDone && !!task.assignee && task.assignee === (user?.slug ?? '') && !task.acknowledged_at
  const { data: unseen } = useUnseenActivity()
  const activityRow = !isDone && !isNewToViewer ? unseen?.tasks.get(task.id) : undefined

  const urgent = !isDone && task.priority === 'urgent'
  const displayTitle = taskShortLabel(task)
  const others = [task.assigned_by, ...(task.watchers ? task.watchers.split(',').map((w) => w.trim()) : [])]
    // assigned_by is often stored as an email, assignee as a slug: compare slugs.
    .map((s) => (s && s.includes('@') ? slugForEmail(s) : s))
    .filter((s): s is string => !!s && s !== task.assignee)

  const titleNode = onOpenEditor ? (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onOpenEditor() }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpenEditor() } }}
      style={{ cursor: 'pointer' }}
    >
      <TaskTitle title={displayTitle} fallback={task.description} />
    </span>
  ) : (
    <TaskTitle title={displayTitle} fallback={task.description} />
  )

  const planBtn = onTogglePlan && !isDone && !isPlanned ? (
    <button
      type="button"
      data-plan-btn={task.id}
      className="tk-hov today-plan-btn tip"
      onClick={(e) => { e.stopPropagation(); onTogglePlan() }}
      onMouseDown={(e) => e.stopPropagation()}
      data-tip="Plan for today"
      aria-label="Plan task for today"
    >
      <Pin {...ICON_PROPS} size={12} />
    </button>
  ) : null

  const grip = draggable && !isDone ? (
    <span
      draggable
      onDragStart={onDragStart}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      data-tip="Drag to schedule"
      aria-label="Drag to schedule"
      className="tk-grip task-grip tip"
    >
      <GripHorizontal {...ICON_PROPS} size={12} />
    </span>
  ) : null

  const plannedName = plannedLabel ? plannedLabel.charAt(0).toUpperCase() + plannedLabel.slice(1) : 'Planned'
  const plannedPill = isPlanned && !isDone ? (
    onTogglePlan ? (
      <button
        type="button"
        className="tk-pill tk-btnp planned-chip tip"
        onClick={(e) => { e.stopPropagation(); onTogglePlan() }}
        onMouseDown={(e) => e.stopPropagation()}
        data-tip="Click to unplan"
        aria-label="Unplan task"
      >
        <Pin {...ICON_PROPS} size={11} />{plannedName}
      </button>
    ) : (
      <span className="tk-pill"><Pin {...ICON_PROPS} size={11} />{plannedName}</span>
    )
  ) : null

  return (
    <div
      data-task-id={task.id}
      className={`tk-card tk-tc${dense ? ' tk-dense' : ''}${isDone ? ' tk-done' : ''}${urgent ? ' tk-urg' : ''}${isExpanded ? ' tk-exp' : ''}`}
    >
      {/* The header is the card's ONE keyboard owner: Enter/Space expands. The
          Today adapter no longer spreads dnd-kit's role/tabIndex on the wrapper
          (a second focus stop), and Enter/Space stop here so dnd-kit's keyboard
          sensor cannot also pick the row up. Keys from inner controls (box, pin,
          links) are ignored: only a key pressed ON the header acts. */}
      <div
        className="tk-tch"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            onToggleExpand()
          }
        }}
      >
        <CardCheck done={isDone} onToggle={onToggleDone} />
        <div className="tk-hdr">
          <div className="tk-ct">
            {urgent && <span className="sr-only">Urgent: </span>}
            {leadingTag && <span style={{ marginRight: 6 }} aria-hidden="true">{leadingTag}</span>}
            {titleNode}
            {isNewToViewer && <span className="tk-tag" title="New to you: you have not opened this yet">New</span>}
            {activityRow && (
              <span className="tk-tag tk-ac" title={`${activityRow.new_count} new ${activityRow.new_count === 1 ? 'entry' : 'entries'} since you last opened this`}>
                {activityRow.new_count} new
              </span>
            )}
            {showGroupOverridePin && task.group_override && (
              <span className="tk-tag tk-n tip" data-tip={`Moved manually (${task.group_override})`} aria-label={`Moved manually (${task.group_override})`}>
                <MapPin {...ICON_PROPS} size={10} aria-hidden /> moved
              </span>
            )}
            {urgent && <span className="tk-tag tk-urgtag" aria-hidden="true">Urgent</span>}
            {planBtn}
            {grip}
          </div>
          <div className="tk-ctx">
            <CardProjectLine project={project} />
            {task.due_date && !isDone && <CardDuePill due={task.due_date} status={task.status} />}
            {!isDone && footPills}
            {plannedPill}
            {belowTitle}
            {others.length > 0 && <Faces slugs={others} />}
            <span className="tk-sp" />
            {activityRow && (
              <span className="tk-mt" title={`${activityRow.new_count} new`}>
                <MessageSquare {...ICON_PROPS} size={13} aria-hidden />{activityRow.new_count}
              </span>
            )}
            {extraMeta}
            {/* Fixed slots: they render even when empty so the right edge of
                every card lines up (Nick 2026-10-09). */}
            <span className="tk-slots">
              <span className="tk-lks">{linksSlot}</span>
              <span className="tk-mks">{meetingSlot}</span>
            </span>
          </div>
        </div>
        <div className="tk-tr-r">
          <span className="tk-av">{task.assignee && <Face slug={task.assignee} lg />}</span>
          <span className="tk-wk">{workSlot}</span>
        </div>
      </div>
      {isExpanded && children}
    </div>
  )
}

// Milestone as a card-skin rule: ◇ internal / ◆ hard in gold, title, a faint
// leader, project short name, a gold date pill, caret. Same expand contract as
// the standard milestone row; a slipped internal date dims.
export function MilestoneCardRow(props: CardTaskRowProps) {
  const { task, project, isDone, isExpanded, onToggleExpand, hideCaret, children, milestoneRole } = props
  const civil = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)
  const role = milestoneRole
  const entry = task as MilestoneEntry
  const date = role
    ? (civil(entry.milestoneDate) ?? (role === 'hard' ? (civil(task.deadline) ?? civil(task.due_date)) : civil(task.due_date)))
    : (civil(task.deadline) ?? civil(task.due_date))
  const isInternal = role === 'internal' || role === 'slipped'
  const overdue = !isInternal && !!date && isOverdue(date, task.status)
  return (
    <div data-task-id={task.id} data-task-kind="milestone" {...(role ? { 'data-milestone-role': role } : {})} className="tk-msw">
      <div
        className={`tk-ms${isInternal ? ' tk-int' : ''}${role === 'slipped' ? ' tk-slip' : ''}`}
        onClick={onToggleExpand}
      >
        <span aria-hidden="true" className="tk-dia">{isInternal ? '◇' : '◆'}</span>
        <span className="sr-only">Milestone</span>
        <span className="tk-mt2" style={{ textDecoration: isDone ? 'line-through' : 'none' }}>{taskShortLabel(task)}</span>
        <span aria-hidden="true" className="tk-lead" />
        {project && (
          <Link
            to={PATHS.project(project.slug)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Open ${project.name}`}
            title={project.fullTitle}
            className="tk-cs"
            style={{ margin: 0, flexShrink: 0, maxWidth: 160 }}
          >
            {project.name}
          </Link>
        )}
        {date && (
          <span
            className={`tk-pill ${overdue ? 'tk-o' : 'tk-g'}`}
            data-tip={`${role === 'hard' ? 'Hard date' : isInternal ? 'Internal date' : 'Date'}: ${date}`}
            aria-label={`${role ?? 'hard'}: ${date}`}
          >
            <i />{dueLabelCompact(date, overdue)}
          </span>
        )}
        {!hideCaret && <span className="tk-caret">{isExpanded ? '▾' : '▸'}</span>}
      </div>
      {isExpanded && children}
    </div>
  )
}

// TaskRow (Today surface) — now a thin ADAPTER over the shared
// src/components/tasks/TaskRow.tsx. The shared row owns the unified contract
// (square = complete, body = expand, full title, one fixed left edge, reserved
// priority dot). This adapter wires Today's specifics into it WITHOUT dropping
// any behavior: drag-to-plan (⋮⋮), Right Now highlight, planned/scheduled
// badge, the v55 workflow badges (waiting_on / promised_to / next_checkin),
// the group_override pin, and the inline TaskDetailDrawer.
//
// Per handoff §1 ("promote/replace the existing today/TaskRow.tsx into a
// shared, generic one") — the generic row lives in components/tasks/; this
// file is the Today-specific binding.

import { useDraggable } from '@dnd-kit/core'
import { TaskRow as SharedTaskRow } from '../tasks/TaskRow'
import { useDensity } from '../DensityToggle'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { MilestoneDrawer } from './MilestoneDrawer'
import { isTaskDone, type MilestoneRole } from '../../lib/taskGrouping'
import { isMilestone } from '../../../shared/taskKinds'
import { LinkRow, type TaskLink } from './primitives'
import { formatShortDate } from '../../lib/dateUtils'
import { Users, Hourglass, Handshake, Repeat } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { Person } from './skin'
import { isFromMeeting, meetingLabelFor } from '../../lib/meetingOrigin'
import WorkOnActions from '../WorkOnActions'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow as TaskRowData } from '../../lib/api'

export function TaskRow({ task, project, state, expandedId, onExpand, milestoneRole, done = false, noDrag = false, onOpenEditor }: {
  task: TaskRowData
  project: { name: string; slug: string; primary_folder?: string | null } | null
  state: TodayStateApi
  expandedId: string | null
  onExpand: (id: string) => void
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }>
  milestoneRole?: MilestoneRole
  /** Tasks page: the row is already done in the cache (Today keeps done rows in
   *  its own "Completed today" list, so it never needed this). */
  done?: boolean
  /** Tasks page: no drag-to-plan target exists there, so the grip is hidden and
   *  the dnd-kit draggable is disabled. */
  noDrag?: boolean
  /** Tasks page: a title click opens the full editor panel. */
  onOpenEditor?: () => void
}) {
  const [density] = useDensity()
  const isDone = !!state.done[task.id] || done
  const planned = state.planned[task.id]
  const expanded = expandedId === task.id && !isDone
  // A milestone is never planned/dragged/promoted — it is a dated rule with
  // no click-to-complete box (GH #131/#132). Guard against a stray
  // planned_for on a milestone row: it must never enter the planned bucket.
  const milestone = isMilestone(task)

  // dnd-kit draggable (GH#150): replaces HTML5 draggable/onDragStart.
  // We wrap the SharedTaskRow in a useDraggable div. The PointerSensor in
  // TodayDndContext detects pointerdown anywhere on the wrapper and activates
  // the drag. The SharedTaskRow's DragHandle grip is the visual affordance;
  // draggable=false on SharedTaskRow disables the browser's native HTML5 DnD
  // so only dnd-kit fires.
  const { listeners: dragListeners, setNodeRef: setDragNodeRef, isDragging: isListDragging } = useDraggable({
    id: `list-task:${task.id}`,
    disabled: isDone || milestone || noDrag,
    data: { taskId: task.id, source: 'list', task },
  })
  const onDragStart = undefined  // No HTML5 drag; dnd-kit handles it

  // Directive 4 (2026-06-22): key_link_* icons in row — parity with MyTasks ListView.
  // Reuses today/primitives LinkRow (same icon resolution as MyTasks LinksBar).
  // key_link_* slots are the only row-level links; stored DB links appear only
  // in the expanded TaskDetailDrawer (useTaskLinks, per existing design).
  const rowLinks: TaskLink[] = [
    [task.key_link_1, task.key_link_1_desc],
    [task.key_link_2, task.key_link_2_desc],
    [task.key_link_3, task.key_link_3_desc],
  ].flatMap(([url, desc]) =>
    typeof url === 'string' && url.length > 0
      ? [{ url, desc: desc ?? undefined } satisfies TaskLink]
      : [],
  )
  const linkMeta = rowLinks.length > 0 ? <LinkRow links={rowLinks} slot /> : null

  // Slot WorkOnActions (📂 + ▶, 24px boxes) — shown when the task's project has a
  // primary_folder. stopPropagation prevents the icon clicks from bubbling to
  // the row body expand handler (row-click hazard rule).
  const workOnMeta = project?.primary_folder ? (
    <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
      <WorkOnActions primaryFolder={project.primary_folder} projectLabel={project.name} variant="slot" />
    </div>
  ) : null

  // #108: meeting provenance, as a bare icon in the INLINE meta cluster.
  //
  // This first shipped as a labelled chip on the belowTitle line, which gave
  // every meeting-derived task a whole extra row of height (Nick: "makes them
  // taller than other ones"). The full name + link now live in the expanded
  // drawer, where there is room for them; the row keeps only the glyph that
  // answers "did this come from a meeting?" at a glance. Its own channel, so it
  // does not overload the urgency rail, due text, attention chip or done box
  // (Rule 76), and the tooltip carries the text equivalent.
  const meetingLabel = meetingLabelFor(task)
  const meetingMeta = !isDone && isFromMeeting(task) ? (
    <span
      data-tip={meetingLabel === 'From a meeting' ? 'Created from a meeting' : `From meeting: ${meetingLabel}`}
      className="tk-mt"
    >
      <Users size={14} strokeWidth={1.5} absoluteStrokeWidth />
      <span className="sr-only">{meetingLabel}</span>
    </span>
  ) : null

  // v55 workflow pills (waiting on / promised to / check-in), footer of the
  // card, only when a field is set and the task isn't done. Same data as the
  // old chips, now plain dot-less pills with a small icon.
  const workflowPills = !isDone && (task.waiting_on || task.promised_to || task.next_checkin_date) ? (
    <>
      {task.waiting_on && (
        <span className="tk-pill" title={`Waiting on: ${task.waiting_on}`}>
          <Hourglass {...ICON_PROPS} size={12} aria-hidden />Waiting on <Person name={task.waiting_on} />
        </span>
      )}
      {task.promised_to && (
        <span className="tk-pill" title={`Promised to: ${task.promised_to}${task.promise_date ? ` by ${task.promise_date}` : ''}`}>
          <Handshake {...ICON_PROPS} size={12} aria-hidden />Promised to <Person name={task.promised_to} />{task.promise_date ? ` · ${formatShortDate(task.promise_date)}` : ''}
        </span>
      )}
      {task.next_checkin_date && !task.waiting_on && (
        <span className="tk-pill" title={`Check in: ${task.next_checkin_date}`}>
          <Repeat {...ICON_PROPS} size={12} aria-hidden />Check in {formatShortDate(task.next_checkin_date)}
        </span>
      )}
    </>
  ) : null

  return (
    // dnd-kit wrapper: setNodeRef + listeners activate the PointerSensor when the
    // user grabs the row (specifically the grip icon inside SharedTaskRow).
    // opacity: 0.5 while actively dragging for visual feedback.
    //
    // Keyboard focus (round 2): dragAttrs (role="button", tabIndex) is no longer
    // spread at all. The card header in TaskCardRow owns focus + Enter/Space, and
    // two nested focus stops were a trap. #482 (history): dragAttrs was spread
    // ONLY while collapsed. dragListeners (the actual drag-activation
    // handlers) stays unconditional either way -- dnd-kit returns these as
    // two fully independent objects (verified against useDraggable's own
    // .d.ts), so this changes NOTHING about drag activation: pointer-
    // anywhere-on-the-row and keyboard drag-when-collapsed both work exactly
    // as before. What changes is that while EXPANDED (TaskDetailDrawer open,
    // with its own real interactive children), the wrapper no longer claims
    // role="button" -- screen readers stop announcing the whole expanded
    // card as one draggable button around a comment box, subtasks, etc.
    // Deliberately does NOT touch the separate, still-open question of
    // whether row-anywhere pointer drag itself should narrow to a grip
    // handle (PlannedTaskRow's pattern) -- that's a real behavior change
    // needing Nick's call, not an a11y-only fix.
    <div
      ref={setDragNodeRef}
      {...(milestone ? {} : dragListeners)}
      style={{ opacity: isListDragging ? 0.5 : 1 }}
    >
    {milestone ? (
      <SharedTaskRow
        task={task}
        project={project}
        variant="milestone"
        card
        milestoneRole={milestoneRole}
        isDone={isDone}
        onToggleDone={() => (isDone ? state.uncheck(task.id) : state.markDone(task.id))}
        isExpanded={expanded}
        // Not gated on isDone: the milestone row has no done box, so the
        // drawer's Reopen is its only way back once Mark complete fires.
        onToggleExpand={() => onExpand(task.id)}
      >
        <MilestoneDrawer
          task={task}
          project={project}
          onToggleComplete={(t) => ((t.id === task.id ? isDone : (state.done[t.id] || isTaskDone(t))) ? state.uncheck(t.id) : state.markDone(t.id))}
        />
      </SharedTaskRow>
    ) : (
    <SharedTaskRow
      task={task}
      project={project}
      dense={density === 'compact'}
      isDone={isDone}
      onToggleDone={() => (isDone ? state.uncheck(task.id) : state.markDone(task.id))}
      isExpanded={expanded}
      onToggleExpand={() => { if (!isDone) onExpand(task.id) }}
      isPlanned={!!planned}
      plannedLabel={planned?.slot === 'strip' ? 'planned' : 'scheduled'}
      showGroupOverridePin
      // draggable gates ONLY SharedTaskRow's DragHandle render (the visual ⋮⋮
      // grip icon) — it is never applied as a native HTML draggable= attribute
      // anywhere in SharedTaskRow (today/TaskRow.tsx is its sole caller passing
      // this prop; grep-verified 2026-07-06). The GH#150 migration set this to
      // a hardcoded `false` believing it disabled native HTML5 DnD, but with
      // onDragStart already undefined there was nothing native to disable —
      // the only real effect was silently deleting the grip icon (regression,
      // found while root-causing drag-to-plan test failures; see #492 handoff).
      // Restored to the pre-migration `!isDone` gate.
      draggable={!isDone && !noDrag}
      onOpenEditor={onOpenEditor}
      onDragStart={onDragStart}
      onTogglePlan={() => (planned?.slot === 'strip' ? state.unplan(task.id) : state.planAt(task.id, 'strip'))}
      card
      footPills={workflowPills}
      linksSlot={linkMeta}
      meetingSlot={meetingMeta}
      workSlot={workOnMeta}
    >
      <TaskDetailDrawer task={task} project={project} state={state} />
    </SharedTaskRow>
    )}
    </div>
  )
}

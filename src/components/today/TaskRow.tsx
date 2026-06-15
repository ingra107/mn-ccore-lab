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

import { TaskRow as SharedTaskRow } from '../tasks/TaskRow'
import { useDensity } from '../DensityToggle'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { tagForTask } from './constants'
import { ACCENT_GOLD, ACCENT_CORAL, INK_MUTED } from './constants'
import { formatShortDate } from '../../lib/dateUtils'
import { Chip } from '../ui/Chip'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow as TaskRowData } from '../../lib/api'

export function TaskRow({ task, project, state, expandedId, onExpand, projectsByPid }: { task: TaskRowData; project: { name: string; slug: string } | null; state: TodayStateApi; expandedId: string | null; onExpand: (id: string) => void; projectsByPid: Map<string, { name: string; slug: string; category?: string | null }> }) {
  const [density] = useDensity()
  const isDone = !!state.done[task.id]
  const isNow = state.rightNow === task.id
  const planned = state.planned[task.id]
  const expanded = expandedId === task.id && !isDone

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }

  // v55 workflow badges — compact second line, only when a field is set and
  // the task isn't done. Preserved verbatim from the pre-refactor row.
  const workflowBadges = !isDone && (task.waiting_on || task.promised_to || task.next_checkin_date) ? (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
      {task.waiting_on && (
        <Chip color={ACCENT_GOLD} title={`Waiting on: ${task.waiting_on}`} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          ⏳ {task.waiting_on}
        </Chip>
      )}
      {task.promised_to && (
        <Chip color={ACCENT_CORAL} title={`Promised to: ${task.promised_to}${task.promise_date ? ` by ${task.promise_date}` : ''}`} style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          🤝 {task.promised_to}{task.promise_date ? ` · ${formatShortDate(task.promise_date)}` : ''}
        </Chip>
      )}
      {task.next_checkin_date && !task.waiting_on && (
        <Chip color={INK_MUTED} title={`Check in: ${task.next_checkin_date}`}>
          ↻ {formatShortDate(task.next_checkin_date)}
        </Chip>
      )}
    </div>
  ) : null

  return (
    <SharedTaskRow
      task={task}
      project={project}
      dense={density === 'compact'}
      isDone={isDone}
      onToggleDone={() => (isDone ? state.uncheck(task.id) : state.markDone(task.id))}
      isExpanded={expanded}
      onToggleExpand={() => { if (!isDone) onExpand(task.id) }}
      isRightNow={isNow}
      isPlanned={!!planned}
      plannedLabel={planned?.slot === 'strip' ? 'planned' : 'scheduled'}
      showGroupOverridePin
      draggable={!isDone}
      onDragStart={onDragStart}
      onTogglePlan={() => (planned?.slot === 'strip' ? state.unplan(task.id) : state.planAt(task.id, 'strip'))}
      leadingTag={tagForTask(task, projectsByPid)}
      belowTitle={workflowBadges}
    >
      <TaskDetailDrawer task={task} project={project} state={state} />
    </SharedTaskRow>
  )
}

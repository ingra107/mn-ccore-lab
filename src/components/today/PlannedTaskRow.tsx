// PlannedTaskRow — the "planned strip" row variant on the timeline.
// Used for tasks dropped into between-meeting gaps OR the "no specific time"
// strip below the timeline.
//
// Look (Today reskin, 2026-10-09): a card with a dashed edge and a hatched left
// bar, the same anatomy as a task card (bold name, project short name under it),
// controls in the right cluster. Dashed + hatched is what separates "planned"
// from a normal card. Styles: .tk-prow in index.css.
//
// Extracted from src/pages/portal/TodayPage.tsx. Same TaskDetailDrawer
// expansion as the regular TaskRow (CD spec: click body = expand drawer).

import { Link } from 'react-router-dom'
import { useDraggable } from '@dnd-kit/core'
import { GripHorizontal, Clock, MapPin } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'
import { LinkRow, type TaskLink } from './primitives'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { CardCheck } from '../tasks/TaskCardRow'
import { fmtDuration } from './utils'
import { isTaskDone } from '../../lib/taskGrouping'
import WorkOnActions from '../WorkOnActions'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'
import { taskFullTitleHint, taskShortLabel } from '../../lib/displayNames'

export function PlannedTaskRow({ task, project, state, timeHint, small = false, onExpand, expandedId }: { task: TaskRow; project: { name: string; slug: string; primary_folder?: string | null } | null; state: TodayStateApi; timeHint?: string; small?: boolean; onExpand: (id: string) => void; expandedId: string | null; projectsByPid?: Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }> }) {
  const isDone = isTaskDone(task) || !!state.done[task.id]
  const expanded = expandedId === task.id
  const links: TaskLink[] = []
  if (task.key_link_1) links.push({ url: task.key_link_1, desc: task.key_link_1_desc })
  if (task.key_link_2) links.push({ url: task.key_link_2, desc: task.key_link_2_desc })
  if (task.key_link_3) links.push({ url: task.key_link_3, desc: task.key_link_3_desc })
  // Drag handle: dnd-kit useDraggable replaces HTML5 draggable/onDragStart (GH#150).
  // The grip span carries {listeners} so only the grip icon activates the drag,
  // not the whole row — prevents accidental row click + drag conflicts.
  const { attributes: dragAttributes, listeners: dragListeners, setNodeRef: setDragRef, isDragging: isBlockDragging } = useDraggable({
    id: `planned-task:${task.id}`,
    disabled: isDone,
    data: { taskId: task.id, source: 'list', task },
  })
  return (
    <div data-task-id={task.id} className="tk-prow" style={{ opacity: isBlockDragging ? 0.6 : 1 }}>
      <div
        className="tk-prh"
        onClick={() => !isDone && onExpand(task.id)}
        style={{ cursor: isDone ? 'default' : 'pointer', paddingTop: small ? 7 : undefined, paddingBottom: small ? 7 : undefined }}
      >
        {timeHint && <span className="tk-mt" style={{ minWidth: 58, paddingTop: 1 }}>{timeHint}</span>}
        <CardCheck done={isDone} onToggle={() => (isDone ? state.uncheck(task.id) : state.markDone(task.id))} />
        <div className="tk-hdr">
          {/* Rule 68: planned rows show the curated short_title (full title in
              the expanded drawer), matching the unplanned cards below. */}
          <div className="tk-ct" style={isDone ? { textDecoration: 'line-through', color: 'var(--sk-t3)', fontWeight: 500 } : undefined}>
            <span title={taskFullTitleHint(task)}>{taskShortLabel(task)}</span>
            {task.group_override && (
              <span className="tk-tag tk-n tip" data-tip={`Moved manually (${task.group_override})`} aria-label={`Moved manually (${task.group_override})`}>
                <MapPin {...ICON_PROPS} size={10} aria-hidden /> moved
              </span>
            )}
            {/* Drag handle — only the grip icon activates the drag; the row
                body click remains expand-only. stopPropagation on click /
                mouseDown prevents row expand. */}
            {!isDone && (
              <span
                ref={setDragRef}
                {...dragAttributes}
                {...dragListeners}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                title="Drag to timeline to give this a time slot"
                className="tk-grip task-grip"
                style={{ cursor: isBlockDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
              >
                <GripHorizontal {...ICON_PROPS} size={12} />
              </span>
            )}
          </div>
          <div className="tk-cs">
            {project ? (
              <Link to={PATHS.project(project.slug)} onClick={(e) => e.stopPropagation()} aria-label={`Open ${project.name}`}>{project.name}</Link>
            ) : 'No project'}
          </div>
        </div>
        <div className="tk-tr-r">
          {/* Duration — read-only; shows estimated_minutes ?? 30 */}
          <span className="tk-mt" title={`Estimated duration${task.estimated_minutes ? '' : ' (default)'}`}>
            <Clock {...ICON_PROPS} size={12} aria-hidden />{fmtDuration(task.estimated_minutes ?? 30)}
          </span>
          {/* Compact WorkOnActions — revealed by hovering the ROW (.tk-hovv),
              so it can be found by landing on the row, not on something
              invisible (#117). stopPropagation prevents expanding the row. */}
          {project?.primary_folder && (
            <span
              className="tk-hovv"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              <WorkOnActions primaryFolder={project.primary_folder} projectLabel={project.name} variant="compact" />
            </span>
          )}
          <LinkRow links={links} />
          {!isDone && <span className="tk-caret">{expanded ? '▾' : '▸'}</span>}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); state.unplan(task.id) }}
            title="Remove from plan"
            aria-label="Remove from plan"
            className="tk-x"
          >×</button>
        </div>
      </div>
      {expanded && !isDone && <TaskDetailDrawer task={task} project={project} state={state} />}
    </div>
  )
}

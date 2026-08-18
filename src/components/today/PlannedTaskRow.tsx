// PlannedTaskRow — the "planned strip" row variant on the timeline.
// Used for tasks dropped into between-meeting gaps OR the "no specific time"
// strip below the timeline. Compact gold-tinted treatment.
//
// Extracted from src/pages/portal/TodayPage.tsx. Same TaskDetailDrawer
// expansion as the regular TaskRow (CD spec: click body = expand drawer).

import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { GripHorizontal } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { LinkRow, ProjectLink, type TaskLink } from './primitives'
import { Chip } from '../ui/Chip'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { DoneBox } from '../tasks/TaskRow'
import { tagForTask, withAlpha } from './constants'
import { ACCENT_GOLD, ACCENT_TEAL, INK, INK_DIM } from './constants'
import { fmtDuration } from './utils'
import { isTaskDone } from '../../lib/taskGrouping'
import WorkOnActions from '../WorkOnActions'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'

export function PlannedTaskRow({ task, project, state, timeHint, small = false, onExpand, expandedId, projectsByPid }: { task: TaskRow; project: { name: string; slug: string; primary_folder?: string | null } | null; state: TodayStateApi; timeHint?: string; small?: boolean; onExpand: (id: string) => void; expandedId: string | null; projectsByPid: Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }> }) {
  const isDone = isTaskDone(task) || !!state.done[task.id]
  const expanded = expandedId === task.id
  const [hover, setHover] = useState(false)
  const tag = tagForTask(task, projectsByPid)
  const links: TaskLink[] = []
  if (task.key_link_1) links.push({ url: task.key_link_1, desc: task.key_link_1_desc })
  if (task.key_link_2) links.push({ url: task.key_link_2, desc: task.key_link_2_desc })
  if (task.key_link_3) links.push({ url: task.key_link_3, desc: task.key_link_3_desc })
  // Drag handle: dnd-kit useDraggable replaces HTML5 draggable/onDragStart (GH#150).
  // The grip span carries {listeners} so only the ⋮⋮ icon activates the drag,
  // not the whole row — prevents accidental row click + drag conflicts.
  const { attributes: dragAttributes, listeners: dragListeners, setNodeRef: setDragRef, isDragging: isBlockDragging } = useDraggable({
    id: `planned-task:${task.id}`,
    disabled: isDone,
    data: { taskId: task.id, source: 'list', task },
  })
  return (
    <div
      data-task-id={task.id}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      // #116 — the planned card has to READ. Measured on live prod (dark): the
      // old gold 3% fill + gold 18% dashed border composited to 1.38:1 against
      // the strip behind it, i.e. an outline you cannot see. Gold 8% / 70%
      // measures 4.5:1 dark and 3.4:1 light, clearing the 3:1 WCAG 1.4.11
      // non-text bar in BOTH themes. The outline stays dashed (Nick's ask) —
      // dashed vs solid is what separates "planned" from a normal row.
      //
      // Drop targets are unaffected: every one of them signals with a colour
      // change PLUS a fill appearing (and, in agenda mode, a height change), so
      // a louder resting row does not swallow the drag affordance.
      style={{ background: withAlpha(ACCENT_GOLD, 8), border: `1px dashed ${withAlpha(ACCENT_GOLD, 70)}`, borderRadius: 6, overflow: 'hidden', transition: 'all 120ms' }}
    >
      <div onClick={() => !isDone && onExpand(task.id)} style={{ display: 'flex', gap: 9, padding: small ? '6px 10px' : '8px 12px', alignItems: 'flex-start', cursor: isDone ? 'default' : 'pointer' }}>
        {timeHint && (
          <span style={{ fontSize: 11, color: ACCENT_GOLD, fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 64, paddingTop: 1 }}>{timeHint}</span>
        )}
        <span style={{ paddingTop: 1, flexShrink: 0 }}>
          <DoneBox done={isDone} onToggle={() => (isDone ? state.uncheck(task.id) : state.markDone(task.id))} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, flexShrink: 0 }} aria-hidden="true">{tag}</span>
            {/* Rule 68: planned rows show the curated short_title (full title on
                hover via native title= + in the expanded drawer), matching the
                unplanned rows below. A complete short title is not a truncation. */}
            <span title={task.short_title && task.short_title !== task.title ? task.title : undefined} style={{ fontSize: 13, color: isDone ? INK_DIM : INK, textDecoration: isDone ? 'line-through' : 'none', fontWeight: 500 }}>{task.short_title || task.title}</span>
            {task.group_override && (
              <Chip
                color={ACCENT_TEAL}
                bordered
                pill
                fillAlpha={9}
                borderAlpha={28}
                title={`Moved manually (${task.group_override})`}
              >📍</Chip>
            )}
            <ProjectLink name={project?.name ?? null} slug={project?.slug} />
            <LinkRow links={links} />
            {/* Duration chip — read-only; shows estimated_minutes ?? 30 */}
            <Chip
              color={ACCENT_GOLD}
              bordered
              pill
              fillAlpha={9}
              borderAlpha={28}
              title={`Estimated duration${task.estimated_minutes ? '' : ' (default)'}`}
              style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
            >{fmtDuration(task.estimated_minutes ?? 30)}</Chip>
            {!isDone && <span style={{ fontSize: 11, color: INK_DIM }}>{expanded ? '▾' : '▸'}</span>}
            {/* Drag handle — dnd-kit useDraggable (GH#150). Only the grip icon
                activates the drag; the row body click remains expand-only.
                stopPropagation on click/mouseDown prevents row expand. */}
            {!isDone && (
              <span
                ref={setDragRef}
                {...dragAttributes}
                {...dragListeners}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                title="Drag to timeline to give this a time slot"
                className="task-grip"
                // ~50% larger hit area (Nick 2026-06-19): padding grows the click
                // target; negative margin absorbs it so the row doesn't shift.
                style={{ display: 'inline-flex', alignItems: 'center', cursor: isBlockDragging ? 'grabbing' : 'grab', color: INK_DIM, visibility: hover ? 'visible' : 'hidden', userSelect: 'none', flexShrink: 0, padding: '4px 5px', margin: '-4px -1px' }}
              >
                <GripHorizontal {...ICON_PROPS} size={12} />
              </span>
            )}
            {/* Compact WorkOnActions — hidden until hover (CSS hov-opacity).
                stopPropagation prevents the click from expanding the row. */}
            {project?.primary_folder && (
              <span
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="hov-opacity"
                style={{ display: 'inline-flex', alignItems: 'center', opacity: 0, '--hov-opacity': '1' } as React.CSSProperties}
              >
                <WorkOnActions primaryFolder={project.primary_folder} projectLabel={project.name} variant="compact" />
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); state.unplan(task.id) }}
              title="Remove from plan"
              className="hov-opacity"
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: INK_DIM, fontSize: 12, cursor: 'pointer', padding: '0 4px', opacity: 0.5, '--hov-opacity': '1' } as React.CSSProperties}
            >×</button>
          </div>
        </div>
      </div>
      {expanded && !isDone && <TaskDetailDrawer task={task} project={project} state={state} />}
    </div>
  )
}

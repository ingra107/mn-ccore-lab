// PlannedTaskRow — the "planned strip" row variant on the timeline.
// Used for tasks dropped into between-meeting gaps OR the "no specific time"
// strip below the timeline. Compact gold-tinted treatment.
//
// Extracted from src/pages/portal/TodayPage.tsx. Same TaskDetailDrawer
// expansion as the regular TaskRow (CD spec: click body = expand drawer).

import { LinkRow, ProjectLink } from './primitives'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { DoneBox } from '../tasks/TaskRow'
import { tagForTask, withAlpha } from './constants'
import { ACCENT_GOLD, ACCENT_TEAL, INK, INK_DIM, type LinkKind } from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'

export function PlannedTaskRow({ task, project, state, timeHint, small = false, onExpand, expandedId, projectsByPid }: { task: TaskRow; project: { name: string; slug: string } | null; state: TodayStateApi; timeHint?: string; small?: boolean; onExpand: (id: string) => void; expandedId: string | null; projectsByPid: Map<string, { name: string; slug: string; category?: string | null }> }) {
  const isDone = !!state.done[task.id]
  const isNow = state.rightNow === task.id
  const expanded = expandedId === task.id
  const tag = tagForTask(task, projectsByPid)
  const links: LinkKind[] = []
  if (task.key_link_1) links.push('folder')
  if (task.key_link_2) links.push('claude')
  if (task.key_link_3) links.push('brief')
  // Drag handle: a planned task stays draggable so it can be re-slotted up into
  // a specific timeline gap (the DropZones call state.planAt for any id).
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }
  return (
    <div data-task-id={task.id} style={{ background: isNow ? 'rgba(201,168,76,0.10)' : 'rgba(201,168,76,0.03)', border: `1px ${isNow ? 'solid' : 'dashed'} rgba(201,168,76,${isNow ? 0.35 : 0.18})`, borderRadius: 6, overflow: 'hidden', transition: 'all 120ms' }}>
      <div onClick={() => !isDone && onExpand(task.id)} style={{ display: 'flex', gap: 9, padding: small ? '6px 10px' : '8px 12px', alignItems: 'flex-start', cursor: isDone ? 'default' : 'pointer' }}>
        {!isDone && (
          <div
            draggable
            onDragStart={onDragStart}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            title="Drag up to the timeline to give this a time slot"
            style={{ width: 14, display: 'grid', placeItems: 'center', cursor: 'grab', color: INK_DIM, opacity: 0.4, fontSize: 12, lineHeight: 1, userSelect: 'none', flexShrink: 0, paddingTop: 2 }}
          >
            ⋮⋮
          </div>
        )}
        {timeHint && (
          <span style={{ fontSize: 11, color: ACCENT_GOLD, fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 64, paddingTop: 1 }}>{timeHint}</span>
        )}
        <span style={{ paddingTop: 1, flexShrink: 0 }}>
          <DoneBox done={isDone} onToggle={() => (isDone ? state.uncheck(task.id) : state.markDone(task.id))} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {isNow && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_GOLD, padding: '1px 5px', background: 'rgba(201,168,76,0.14)', borderRadius: 3 }}>Now</span>}
            <span style={{ fontSize: 11, flexShrink: 0 }} aria-hidden="true">{tag}</span>
            {/* Rule 68: planned rows show the curated short_title (full title on
                hover via native title= + in the expanded drawer), matching the
                unplanned rows below. A complete short title is not a truncation. */}
            <span title={task.short_title && task.short_title !== task.title ? task.title : undefined} style={{ fontSize: 13, color: isDone ? INK_DIM : INK, textDecoration: isDone ? 'line-through' : 'none', fontWeight: 500 }}>{task.short_title || task.title}</span>
            {task.group_override && (
              <span title={`Moved manually (${task.group_override})`} style={{ fontSize: 9, color: ACCENT_TEAL, padding: '1px 4px', background: withAlpha(ACCENT_TEAL, 10), borderRadius: 3 }}>📍</span>
            )}
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

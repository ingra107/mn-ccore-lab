// TaskRow — collapsed row inside a TaskGroup. Click body = expand drawer
// (NOT promote — that's an explicit ▶ button in the drawer per CD spec /
// CLAUDE.md Rule 58). Drag handle ⋮⋮ = plan into a timeline slot.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_TaskRow). Local symbol
// renamed from TaskRowDisplay → TaskRow per HANDOFF §2 file map.

import { ProjectLink } from './primitives'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { tagForTask } from './constants'
import { ACCENT_GOLD, ACCENT_GREEN, INK, INK_DIM } from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow as TaskRowData } from '../../lib/api'

export function TaskRow({ task, project, state, expandedId, onExpand, projectsByPid }: { task: TaskRowData; project: { name: string; slug: string } | null; state: TodayStateApi; expandedId: string | null; onExpand: (id: string) => void; projectsByPid: Map<string, { name: string; slug: string; category?: string | null }> }) {
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
            {task.group_override && (
              <span title={`Moved manually (${task.group_override})`} style={{ fontSize: 9, color: '#5cbcb4', padding: '1px 4px', background: 'rgba(92,188,180,0.10)', borderRadius: 3 }}>📍</span>
            )}
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

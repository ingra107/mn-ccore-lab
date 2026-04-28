// TaskRow — collapsed row inside a TaskGroup. Click body = expand drawer
// (NOT promote — that's an explicit ▶ button in the drawer per CD spec /
// CLAUDE.md Rule 58). Drag handle ⋮⋮ = plan into a timeline slot.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_TaskRow). Local symbol
// renamed from TaskRowDisplay → TaskRow per HANDOFF §2 file map.

import { ProjectLink } from './primitives'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { tagForTask } from './constants'
import { ACCENT_GOLD, ACCENT_GREEN, ACCENT_CORAL, ACCENT_ORANGE, INK, INK_DIM, INK_MUTED, todayKey } from './constants'
import { formatRelativeTime, formatShortDate } from '../../lib/dateUtils'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow as TaskRowData } from '../../lib/api'

// Priority dot color (rule 59: maroon=urgent, orange=high, gold=medium,
// slate=low). 'maroon' here uses the same coral tone TodayPage already
// flags as urgency-warnings to stay inside the page's 5-accent palette.
const PRIORITY_COLOR: Record<string, string> = {
  urgent: ACCENT_CORAL,
  high: ACCENT_ORANGE,
  medium: ACCENT_GOLD,
  low: '#7a828c',
}

// Tabular-nums short due-date label. Today / Tomorrow / Nd ago / in Nd /
// fallback to "Mar 25" — same shape as InlineDatePicker preset labels.
function dueLabel(due: string): string {
  const todayStr = todayKey()
  const dueDay = due.slice(0, 10)
  if (dueDay === todayStr) return 'Today'
  // Reuse formatRelativeTime for past dates ("2d ago"); future dates use
  // a short "in 3d" form computed locally to avoid pulling another util.
  const target = new Date(dueDay + 'T12:00:00')
  const now = new Date()
  const ms = target.getTime() - now.getTime()
  const days = Math.round(ms / 86400000)
  if (days === 1) return 'Tomorrow'
  if (days >= -7 && days < 0) return formatRelativeTime(due)
  if (days > 0 && days <= 7) return `in ${days}d`
  return formatShortDate(due)
}

export function TaskRow({ task, project, state, expandedId, onExpand, projectsByPid }: { task: TaskRowData; project: { name: string; slug: string } | null; state: TodayStateApi; expandedId: string | null; onExpand: (id: string) => void; projectsByPid: Map<string, { name: string; slug: string; category?: string | null }> }) {
  const isDone = !!state.done[task.id]
  const isNow = state.rightNow === task.id
  const planned = state.planned[task.id]
  const expanded = expandedId === task.id
  const tag = tagForTask(task, projectsByPid)
  const priorityColor = task.priority ? PRIORITY_COLOR[task.priority] : null
  // Due date: overdue if cmp(due, today) < 0 (string compare on YYYY-MM-DD).
  const due = task.due_date
  const isOverdue = !!due && due.slice(0, 10) < todayKey()
  const dueColor = isOverdue ? ACCENT_CORAL : (due && due.slice(0, 10) === todayKey() ? ACCENT_GOLD : INK_MUTED)
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isNow ? 'rgba(201,168,76,0.05)' : (isDone ? 'rgba(110,232,154,0.02)' : 'transparent'), opacity: isDone ? 0.6 : 1, transition: 'background 220ms', position: 'relative' }}>
      {/* TP-12: 4px priority dot on the left edge — color-codes urgency
          without taking column space. Anchored vs the row's gutter so it
          aligns regardless of checkbox/grip column width. */}
      {priorityColor && !isDone && (
        <span
          aria-hidden="true"
          title={`Priority: ${task.priority}`}
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 4,
            height: 24,
            background: priorityColor,
            borderRadius: '0 2px 2px 0',
          }}
        />
      )}
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
            {/* TP-12: tabular-nums right-aligned due-date cell. Coral when
                overdue, gold when today, muted otherwise. */}
            {due && !isDone && (
              <span
                title={`Due ${due.slice(0, 10)}`}
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  color: dueColor,
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: isOverdue ? 600 : 500,
                  flexShrink: 0,
                }}
              >
                {dueLabel(due)}
              </span>
            )}
            {!isDone && (
              <span style={{ marginLeft: due ? 0 : 'auto', fontSize: 11, color: INK_DIM, flexShrink: 0 }}>{expanded ? '▾' : '▸'}</span>
            )}
          </div>
        </div>
      </div>
      {expanded && !isDone && <TaskDetailDrawer task={task} project={project} state={state} />}
    </div>
  )
}

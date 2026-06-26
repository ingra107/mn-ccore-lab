import { useMemo } from 'react'
import { CalendarDays, FolderKanban, Flag, RotateCcw, Eye, AlertTriangle, CheckCircle2, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useUndoToast } from '../UndoToast'
import Avatar from '../Avatar'
import { getPersonInfo } from '../../data/team'
import { isOverdue as isPastDue } from '../../lib/dateUtils'
import DueLabel from '../DueLabel'
import { formatBrandName } from '../BrandName'
import TaskTitle from './TaskTitle'
import { updateTask } from '../../lib/api'
import { useUpdateTask } from '../../hooks/mutations'
import { useProjects } from '../../hooks/useApiData'
import { STATUS_OPTIONS, PRIORITY_CONFIG, PRIORITY_COLORS, STATUS_CYCLE } from '../../lib/taskConstants'
import type { TaskRow } from '../../lib/api'
import { isTaskDone } from '../../lib/taskGrouping'
import { Chip } from '../ui/Chip'

function hasBlockers(task: TaskRow): boolean {
  return !!task.blocked_by && task.blocked_by.split(',').filter(s => s.trim()).length > 0
}

interface TaskCardProps {
  task: TaskRow
  onStatusChange: (id: string, status: string) => void
  onPriorityChange?: (id: string, priority: string) => void
  compact?: boolean
  /** N1.23 — hide the project chip when the card renders on its own
   *  project's page (the chip is redundant noise there). */
  hideProjectChip?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export default function TaskCard({ task, onStatusChange, onPriorityChange, compact = false, hideProjectChip = false, onClick, onMouseEnter, onMouseLeave }: TaskCardProps) {
  const { showUndo } = useUndoToast()
  const { mutate: mutateTask } = useUpdateTask()
  const person = getPersonInfo(task.assignee)

  // Project data for resolving slug → display name
  const { data: projects = [] } = useProjects()
  const projectMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) {
      if (p.slug) map.set(p.slug, p.short_name || p.title)
    }
    return map
  }, [projects])
  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium
  const isOverdue = !isTaskDone(task) && isPastDue(task.due_date)
  const isDone = isTaskDone(task)

  const PRIORITY_CYCLE = ['low', 'medium', 'high', 'urgent'] as const
  const cyclePriority = () => {
    const idx = PRIORITY_CYCLE.indexOf(task.priority as typeof PRIORITY_CYCLE[number])
    const next = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]
    if (onPriorityChange) {
      onPriorityChange(task.id, next)
    } else {
      updateTask(task.id, { priority: next })
    }
  }

  const isBlocked = hasBlockers(task)
  const statusColor = (STATUS_OPTIONS.find((s) => s.value === task.status) || STATUS_OPTIONS[0]).color
  const effectiveBorderColor = isBlocked && !isDone ? 'var(--maroon)' : statusColor

  return (
    <div
      className="group relative rounded-lg border hover:shadow-md"
      // CSS handles the hover lift — no JS onMouse handlers needed for transform
      style={{
        borderColor: isOverdue ? 'var(--maroon)' : 'var(--border-subtle)',
        borderLeft: `3px solid ${effectiveBorderColor}`,
        backgroundColor: isDone ? 'var(--hover-subtle)' : 'var(--cream)',
        opacity: isDone ? 0.85 : 1,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={() => onMouseEnter?.()}
      onMouseLeave={() => onMouseLeave?.()}
      onClick={(e) => {
        // Don't trigger if clicking the status dropdown or hover actions
        if ((e.target as HTMLElement).closest('[data-status-dropdown]')) return
        if ((e.target as HTMLElement).closest('[data-hover-actions]')) return
        onClick?.()
      }}
    >
      <div className={`flex items-start gap-3 ${compact ? 'p-3' : 'p-4'}`}>
        {/* Status cycle — single click advances: todo → in_progress → done → todo */}
        <div className="flex-shrink-0 mt-0.5" data-status-dropdown>
          <button
            onClick={(e) => {
              e.stopPropagation()
              const idx = STATUS_CYCLE.indexOf(task.status as typeof STATUS_CYCLE[number])
              const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
              const prev = task.status
              onStatusChange(task.id, next)
              const label = next === 'done' ? 'Completed' : next === 'in_progress' ? 'In Progress' : 'To Do'
              showUndo(`Marked "${(task.title || task.description).slice(0, 30)}..." as ${label}`, () => onStatusChange(task.id, prev))
            }}
            className="cursor-pointer"
            title={`Status: ${(STATUS_OPTIONS.find((s) => s.value === task.status) || STATUS_OPTIONS[0]).label} — click to advance`}
            style={{ background: 'none', border: 'none', padding: 'var(--sp-xs)', margin: '-4px' }}
          >
            {(() => {
              const opt = STATUS_OPTIONS.find((s) => s.value === task.status) || STATUS_OPTIONS[0]
              const Icon = opt.icon
              return <Icon size={18} strokeWidth={1.5} absoluteStrokeWidth className="status-transition" style={{ color: opt.color }} />
            })()}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm leading-snug"
            style={{
              color: 'var(--ink)',
              textDecoration: isDone ? 'line-through' : 'none',
            }}
          >
            <TaskTitle title={task.title} fallback={task.description} />
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {/* Blocked badge */}
            {isBlocked && !isDone && (
              <Chip
                size="sm"
                color="var(--maroon)"
                filled={false}
                style={{ background: 'rgba(122, 0, 25, 0.1)', padding: '2px 6px' }}
              >
                <AlertTriangle size={9} strokeWidth={1.5} absoluteStrokeWidth />
                Blocked
              </Chip>
            )}

            {/* Priority badge */}
            <Chip
              size="sm"
              color={priority.color}
              filled={false}
              className="status-transition"
              style={{ background: priority.bg, padding: '2px 6px', opacity: 0.85 }}
            >
              {priority.label}
            </Chip>

            {/* Due date */}
            {task.due_date && (
              <span className="flex items-center gap-1 text-[11px]">
                <CalendarDays size={10} strokeWidth={1.5} absoluteStrokeWidth />
                <DueLabel due={task.due_date} status={task.status} style={{ fontSize: 11 }} />
              </span>
            )}

            {/* Project */}
            {task.project_id && !compact && !hideProjectChip && (
              <span
                className="flex items-center gap-1 text-[11px]"
                style={{
                  color: 'var(--slate)',
                  backgroundColor: 'var(--surface-3)',
                  borderLeft: '2px solid var(--teal)',
                  padding: '1px 5px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <FolderKanban size={10} strokeWidth={1.5} absoluteStrokeWidth />
                {projectMap.get(task.project_id) || task.project_id}
              </span>
            )}

            {/* Source badge */}
            {task.source === 'meeting' && task.meeting_title && !compact && (
              <span
                className="text-[11px]"
                style={{ color: 'var(--teal)', opacity: 0.85 }}
              >
                {formatBrandName(task.meeting_title.split(':')[0])}
              </span>
            )}
          </div>
        </div>

        {/* Assignee avatar — fades out on hover so the hover-action buttons
            (which sit at the same right edge) replace it instead of rendering
            ON TOP of the face (#92, Nick 2026-06-24). */}
        <div className="flex-shrink-0 transition-opacity group-hover:opacity-0" style={{ width: 28, height: 28 }}>
          <Avatar
            name={person.name}
            initials={person.initials}
            photoUrl={person.photoUrl}
            variant="ice"
            size="base-sm"
          />
        </div>
      </div>

      {/* Action buttons — hidden until hover, then fully interactive. Opaque
          card-matching background so the cluster cleanly covers the faded avatar
          and never bleeds the title through the icons (#92). */}
      <div data-hover-actions className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity" style={{ background: isDone ? 'var(--hover-subtle)' : 'var(--cream)', borderRadius: 'var(--radius-md)' }}>
        {/* Quick complete/uncomplete toggle — primary action, always discoverable */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            const prev = task.status
            const next = isTaskDone(task) ? 'todo' : 'done'
            onStatusChange(task.id, next)
            showUndo(`${isTaskDone(task) ? 'Reopened' : 'Completed'} task`, () => onStatusChange(task.id, prev))
          }}
          title={isTaskDone(task) ? 'Reopen' : 'Complete'}
          className="hover:!bg-[rgba(15,25,35,0.10)] dark:hover:!bg-[rgba(255,255,255,0.12)]"
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '6px',
            cursor: 'pointer',
            color: 'var(--slate)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >
          {isTaskDone(task) ? <RotateCcw size={15} strokeWidth={1.5} absoluteStrokeWidth /> : <CheckCircle2 size={15} strokeWidth={1.5} absoluteStrokeWidth />}
        </button>

        {/* Priority cycle */}
        <button
          onClick={(e) => { e.stopPropagation(); cyclePriority() }}
          title={`Priority: ${task.priority}`}
          className="hover:!bg-[rgba(15,25,35,0.10)] dark:hover:!bg-[rgba(255,255,255,0.12)]"
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '6px',
            cursor: 'pointer',
            color: 'var(--slate)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >
          <Flag size={15} strokeWidth={1.5} absoluteStrokeWidth style={{ color: PRIORITY_COLORS[task.priority] || 'var(--slate)' }} />
        </button>

        {/* Peek (view details) */}
        <button
          onClick={(e) => { e.stopPropagation(); onClick?.() }}
          title="View details"
          className="hover:!bg-[rgba(15,25,35,0.10)] dark:hover:!bg-[rgba(255,255,255,0.12)]"
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '6px',
            cursor: 'pointer',
            color: 'var(--slate)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >
          <Eye size={15} strokeWidth={1.5} absoluteStrokeWidth />
        </button>

        {/* Accept/Decline — meeting approval tasks only (source='meeting_approval').
            Shown when pending; Re-accept shown when declined. */}
        {task.approval_status === 'pending' && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                mutateTask({ id: task.id, fields: { approval_status: 'accepted' } })
                showUndo('Meeting accepted', () => mutateTask({ id: task.id, fields: { approval_status: 'pending' } }))
              }}
              title="Accept meeting"
              data-testid="approval-accept"
              className="hover:!bg-[rgba(15,25,35,0.10)] dark:hover:!bg-[rgba(255,255,255,0.12)]"
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '6px',
                cursor: 'pointer',
                color: 'var(--task-accent-green)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'manipulation',
              }}
            >
              <ThumbsUp size={15} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                mutateTask({ id: task.id, fields: { approval_status: 'declined' } })
                showUndo('Meeting declined', () => mutateTask({ id: task.id, fields: { approval_status: 'pending' } }))
              }}
              title="Decline meeting"
              data-testid="approval-decline"
              className="hover:!bg-[rgba(15,25,35,0.10)] dark:hover:!bg-[rgba(255,255,255,0.12)]"
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '6px',
                cursor: 'pointer',
                color: 'var(--task-accent-coral)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'manipulation',
              }}
            >
              <ThumbsDown size={15} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
          </>
        )}

        {/* Re-accept — shown on declined tasks in the declined quick-view */}
        {task.approval_status === 'declined' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              mutateTask({ id: task.id, fields: { approval_status: 'accepted' } })
              showUndo('Meeting re-accepted', () => mutateTask({ id: task.id, fields: { approval_status: 'declined' } }))
            }}
            title="Re-accept meeting"
            data-testid="approval-reaccept"
            className="hover:!bg-[rgba(15,25,35,0.10)] dark:hover:!bg-[rgba(255,255,255,0.12)]"
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '6px',
              cursor: 'pointer',
              color: 'var(--task-accent-green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation',
            }}
          >
            <ThumbsUp size={15} strokeWidth={1.5} absoluteStrokeWidth />
          </button>
        )}
      </div>
    </div>
  )
}


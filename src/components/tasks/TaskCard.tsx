import { Circle, CheckCircle2, Clock, AlertTriangle, CalendarDays, FolderKanban, Flag, RotateCcw, Eye } from 'lucide-react'
import { useUndoToast } from '../UndoToast'
import Avatar from '../Avatar'
import { getPersonInfo } from '../../data/team'
import { formatShortDate } from '../../lib/dateUtils'
import { formatBrandName } from '../BrandName'
import { updateTask } from '../../lib/api'
import type { TaskRow } from '../../lib/api'

function hasBlockers(task: TaskRow): boolean {
  return !!task.blocked_by && task.blocked_by.split(',').filter(s => s.trim()).length > 0
}

interface TaskCardProps {
  task: TaskRow
  onStatusChange: (id: string, status: string) => void
  onPriorityChange?: (id: string, priority: string) => void
  compact?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

const statusOptions = [
  { value: 'todo', label: 'To Do', icon: Circle, color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'var(--teal)' },
  { value: 'done', label: 'Done', icon: CheckCircle2, color: 'var(--green, #22c55e)' },
  { value: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'var(--maroon)' },
]

const priorityConfig: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgent', color: 'var(--maroon)', bg: 'rgba(122, 0, 25, 0.1)' },
  high: { label: 'High', color: 'var(--orange)', bg: 'rgba(194, 65, 12, 0.1)' },
  medium: { label: 'Med', color: 'var(--gold)', bg: 'rgba(201, 168, 76, 0.1)' },
  low: { label: 'Low', color: 'var(--slate)', bg: 'rgba(100, 116, 139, 0.1)' },
}

const PRIORITY_ORDER = ['low', 'medium', 'high', 'urgent'] as const
const PRIORITY_COLORS: Record<string, string> = {
  low: 'var(--slate)',
  medium: 'var(--gold)',
  high: 'var(--orange)',
  urgent: 'var(--maroon)',
}

const STATUS_CYCLE = ['todo', 'in_progress', 'done'] as const

export default function TaskCard({ task, onStatusChange, onPriorityChange, compact = false, onClick, onMouseEnter, onMouseLeave }: TaskCardProps) {
  const { showUndo } = useUndoToast()
  const person = getPersonInfo(task.assignee)
  const priority = priorityConfig[task.priority] || priorityConfig.medium
  const isOverdue = task.due_date && !task.completed && new Date(task.due_date + 'T23:59:59') < new Date()
  const isDone = task.status === 'done'

  const cyclePriority = () => {
    const idx = PRIORITY_ORDER.indexOf(task.priority as typeof PRIORITY_ORDER[number])
    const next = PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length]
    if (onPriorityChange) {
      onPriorityChange(task.id, next)
    } else {
      updateTask(task.id, { priority: next })
    }
  }

  const isBlocked = hasBlockers(task)
  const statusColor = (statusOptions.find((s) => s.value === task.status) || statusOptions[0]).color
  const effectiveBorderColor = isBlocked && !isDone ? 'var(--maroon)' : statusColor

  return (
    <div
      className="group relative rounded-lg border hover:shadow-md"
      // CSS handles the hover lift — no JS onMouse handlers needed for transform
      style={{
        borderColor: isOverdue ? 'var(--maroon)' : 'var(--border-light)',
        borderLeft: `3px solid ${effectiveBorderColor}`,
        backgroundColor: isDone ? 'rgba(0,0,0,0.02)' : 'var(--cream)',
        opacity: isDone ? 0.7 : 1,
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
            title={`Status: ${(statusOptions.find((s) => s.value === task.status) || statusOptions[0]).label} — click to advance`}
            style={{ background: 'none', border: 'none', padding: '4px', margin: '-4px' }}
          >
            {(() => {
              const opt = statusOptions.find((s) => s.value === task.status) || statusOptions[0]
              const Icon = opt.icon
              return <Icon size={18} className="status-transition" style={{ color: opt.color }} />
            })()}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm leading-snug"
            style={{
              fontFamily: 'var(--font-sans)',
              color: 'var(--ink)',
              textDecoration: isDone ? 'line-through' : 'none',
            }}
          >
            {formatBrandName(task.title || task.description)}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {/* Blocked badge */}
            {isBlocked && !isDone && (
              <span
                className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--maroon)',
                  backgroundColor: 'rgba(122, 0, 25, 0.1)',
                }}
              >
                <AlertTriangle size={9} />
                Blocked
              </span>
            )}

            {/* Priority badge */}
            <span
              className="text-[11px] px-1.5 py-0.5 rounded font-medium status-transition"
              style={{
                fontFamily: 'var(--font-sans)',
                color: priority.color,
                backgroundColor: priority.bg,
              }}
            >
              {priority.label}
            </span>

            {/* Due date */}
            {task.due_date && (
              <span
                className="flex items-center gap-1 text-[11px]"
                style={{
                  fontFamily: 'var(--font-sans)',
                  color: isOverdue ? 'var(--maroon)' : 'var(--slate)',
                  fontWeight: isOverdue ? 600 : 400,
                }}
              >
                <CalendarDays size={10} />
                {isOverdue ? 'Overdue' : formatShortDate(task.due_date)}
              </span>
            )}

            {/* Project */}
            {task.project_id && !compact && (
              <span
                className="flex items-center gap-1 text-[11px]"
                style={{ fontFamily: 'var(--font-sans)', color: 'var(--gold)', opacity: 0.8 }}
              >
                <FolderKanban size={10} />
                {task.project_id}
              </span>
            )}

            {/* Source badge */}
            {task.source === 'meeting' && task.meeting_title && !compact && (
              <span
                className="text-[11px]"
                style={{ fontFamily: 'var(--font-sans)', color: 'var(--teal)', opacity: 0.7 }}
              >
                {formatBrandName(task.meeting_title.split(':')[0])}
              </span>
            )}
          </div>
        </div>

        {/* Assignee avatar */}
        <div className="flex-shrink-0" style={{ width: 28, height: 28 }}>
          <Avatar
            name={person.name}
            initials={person.initials}
            photoUrl={person.photoUrl}
            size="sm"
            variant="ice"
            className="!w-7 !h-7 !min-w-0 !min-h-0 !text-[8px]"
          />
        </div>
      </div>

      {/* Action buttons — hidden until hover, then fully interactive */}
      <div data-hover-actions className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
        {/* Quick complete/uncomplete toggle — primary action, always discoverable */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            const prev = task.status
            const next = task.completed ? 'todo' : 'done'
            onStatusChange(task.id, next)
            showUndo(`${task.completed ? 'Reopened' : 'Completed'} task`, () => onStatusChange(task.id, prev))
          }}
          title={task.completed ? 'Reopen' : 'Complete'}
          className="hover:!bg-[rgba(15,25,35,0.10)] dark:hover:!bg-[rgba(255,255,255,0.12)]"
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            padding: '6px',
            cursor: 'pointer',
            color: 'var(--slate)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >
          {task.completed ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />}
        </button>

        {/* Priority cycle */}
        <button
          onClick={(e) => { e.stopPropagation(); cyclePriority() }}
          title={`Priority: ${task.priority}`}
          className="hover:!bg-[rgba(15,25,35,0.10)] dark:hover:!bg-[rgba(255,255,255,0.12)]"
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            padding: '6px',
            cursor: 'pointer',
            color: 'var(--slate)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >
          <Flag size={15} style={{ color: PRIORITY_COLORS[task.priority] || 'var(--slate)' }} />
        </button>

        {/* Peek (view details) */}
        <button
          onClick={(e) => { e.stopPropagation(); onClick?.() }}
          title="View details"
          className="hover:!bg-[rgba(15,25,35,0.10)] dark:hover:!bg-[rgba(255,255,255,0.12)]"
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            padding: '6px',
            cursor: 'pointer',
            color: 'var(--slate)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >
          <Eye size={15} />
        </button>
      </div>
    </div>
  )
}

export { statusOptions, priorityConfig }

import { useState } from 'react'
import { Circle, CheckCircle2, Clock, AlertTriangle, CalendarDays, FolderKanban } from 'lucide-react'
import Avatar from '../Avatar'
import { getPersonInfo } from '../../data/team'
import { formatShortDate } from '../../lib/dateUtils'
import type { TaskRow } from '../../lib/api'

interface TaskCardProps {
  task: TaskRow
  onStatusChange: (id: string, status: string) => void
  compact?: boolean
}

const statusOptions = [
  { value: 'todo', label: 'To Do', icon: Circle, color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'var(--teal)' },
  { value: 'done', label: 'Done', icon: CheckCircle2, color: 'var(--green, #22c55e)' },
  { value: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'var(--maroon)' },
]

const priorityConfig: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgent', color: 'var(--maroon)', bg: 'rgba(122, 0, 25, 0.1)' },
  high: { label: 'High', color: '#c2410c', bg: 'rgba(194, 65, 12, 0.1)' },
  medium: { label: 'Med', color: 'var(--gold)', bg: 'rgba(201, 168, 76, 0.1)' },
  low: { label: 'Low', color: 'var(--slate)', bg: 'rgba(100, 116, 139, 0.1)' },
}

export default function TaskCard({ task, onStatusChange, compact = false }: TaskCardProps) {
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const person = getPersonInfo(task.assignee)
  const priority = priorityConfig[task.priority] || priorityConfig.medium
  const isOverdue = task.due_date && !task.completed && new Date(task.due_date + 'T23:59:59') < new Date()
  const isDone = task.status === 'done'

  return (
    <div
      className="group rounded-lg border transition-all"
      style={{
        borderColor: isOverdue ? 'var(--maroon)' : 'var(--border-light)',
        backgroundColor: isDone ? 'rgba(0,0,0,0.02)' : 'white',
        opacity: isDone ? 0.7 : 1,
      }}
    >
      <div className={`flex items-start gap-3 ${compact ? 'p-2.5' : 'p-3.5'}`}>
        {/* Status dropdown trigger */}
        <div className="relative flex-shrink-0 mt-0.5">
          <button
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            className="cursor-pointer"
            style={{ background: 'none', border: 'none', padding: '4px', margin: '-4px' }}
          >
            {(() => {
              const opt = statusOptions.find((s) => s.value === task.status) || statusOptions[0]
              const Icon = opt.icon
              return <Icon size={18} style={{ color: opt.color }} />
            })()}
          </button>
          {showStatusDropdown && (
            <div
              className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg border py-1 min-w-[140px]"
              style={{ backgroundColor: 'white', borderColor: 'var(--border-light)' }}
            >
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onStatusChange(task.id, opt.value)
                    setShowStatusDropdown(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-black/5 transition-colors"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    color: task.status === opt.value ? opt.color : 'var(--ink)',
                    fontWeight: task.status === opt.value ? 600 : 400,
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                  }}
                >
                  <opt.icon size={14} style={{ color: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </div>
          )}
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
            {task.title || task.description}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {/* Priority badge */}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{
                fontFamily: 'var(--font-mono)',
                color: priority.color,
                backgroundColor: priority.bg,
              }}
            >
              {priority.label}
            </span>

            {/* Due date */}
            {task.due_date && (
              <span
                className="flex items-center gap-1 text-[10px]"
                style={{
                  fontFamily: 'var(--font-mono)',
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
                className="flex items-center gap-1 text-[10px]"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', opacity: 0.8 }}
              >
                <FolderKanban size={10} />
                {task.project_id}
              </span>
            )}

            {/* Source badge */}
            {task.source === 'meeting' && task.meeting_title && !compact && (
              <span
                className="text-[10px]"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)', opacity: 0.7 }}
              >
                {task.meeting_title.split(':')[0]}
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
    </div>
  )
}

export { statusOptions, priorityConfig }

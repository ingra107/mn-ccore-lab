import { useMemo } from 'react'
import { Circle, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import TaskCard from './TaskCard'
import type { TaskRow } from '../../lib/api'

interface TaskBoardViewProps {
  tasks: TaskRow[]
  onStatusChange: (id: string, status: string) => void
  onSelect?: (task: TaskRow) => void
}

const columns = [
  { key: 'todo', label: 'To Do', icon: Circle, color: 'var(--slate)', bg: 'rgba(100,116,139,0.06)' },
  { key: 'in_progress', label: 'In Progress', icon: Clock, color: 'var(--teal)', bg: 'rgba(45,138,138,0.06)' },
  { key: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'var(--maroon)', bg: 'rgba(122,0,25,0.06)' },
  { key: 'done', label: 'Done', icon: CheckCircle2, color: 'var(--green, #22c55e)', bg: 'rgba(34,197,94,0.06)' },
]

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export default function TaskBoardView({ tasks, onStatusChange, onSelect }: TaskBoardViewProps) {
  const tasksByStatus = useMemo(() => {
    const map: Record<string, TaskRow[]> = {}
    for (const col of columns) map[col.key] = []
    for (const task of tasks) {
      const bucket = map[task.status] || map.todo
      bucket.push(task)
    }
    // Sort within each column by priority
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2))
    }
    return map
  }, [tasks])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {columns.map((col) => {
        const Icon = col.icon
        const columnTasks = tasksByStatus[col.key] || []
        return (
          <div key={col.key}>
            {/* Column header */}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-t-lg border-b-2 mb-2"
              style={{
                backgroundColor: col.bg,
                borderColor: col.color,
              }}
            >
              <Icon size={14} style={{ color: col.color }} />
              <span
                className="text-sm font-medium"
                style={{ fontFamily: 'var(--font-sans)', color: col.color }}
              >
                {col.label}
              </span>
              <span
                className="ml-auto text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: col.bg,
                  color: col.color,
                  fontWeight: 600,
                }}
              >
                {columnTasks.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 min-h-[200px]">
              {columnTasks.map((task) => (
                <TaskCard key={task.id} task={task} onStatusChange={onStatusChange} compact onClick={onSelect ? () => onSelect(task) : undefined} />
              ))}
              {columnTasks.length === 0 && (
                <div
                  className="flex items-center justify-center py-8 rounded-lg border border-dashed"
                  style={{
                    borderColor: 'var(--border-light)',
                    color: 'var(--slate)',
                    opacity: 0.4,
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                  }}
                >
                  No tasks
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

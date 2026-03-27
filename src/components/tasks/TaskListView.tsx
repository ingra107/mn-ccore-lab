import { useState, useMemo } from 'react'
import { ArrowUpDown } from 'lucide-react'
import TaskCard from './TaskCard'
import type { TaskRow } from '../../lib/api'

interface TaskListViewProps {
  tasks: TaskRow[]
  onStatusChange: (id: string, status: string) => void
  onSelect?: (task: TaskRow) => void
}

type SortKey = 'priority' | 'due_date' | 'assignee' | 'created_at' | 'status'

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const statusOrder: Record<string, number> = { blocked: 0, in_progress: 1, todo: 2, done: 3 }

export default function TaskListView({ tasks, onStatusChange, onSelect }: TaskListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // Done tasks always at bottom
      if (a.completed !== b.completed) return a.completed - b.completed

      let cmp = 0
      switch (sortKey) {
        case 'priority':
          cmp = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
          break
        case 'status':
          cmp = (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2)
          break
        case 'due_date': {
          const da = a.due_date || '9999'
          const db = b.due_date || '9999'
          cmp = da.localeCompare(db)
          break
        }
        case 'assignee':
          cmp = (a.assignee || '').localeCompare(b.assignee || '')
          break
        case 'created_at':
          cmp = b.created_at.localeCompare(a.created_at) // newest first
          break
      }
      return sortAsc ? cmp : -cmp
    })
  }, [tasks, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const SortButton = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors"
      style={{
        fontFamily: 'var(--font-mono)',
        color: sortKey === field ? 'var(--teal)' : 'var(--slate)',
        fontWeight: sortKey === field ? 600 : 400,
        cursor: 'pointer',
        background: sortKey === field ? 'rgba(45,138,138,0.08)' : 'none',
        border: 'none',
      }}
    >
      {label}
      <ArrowUpDown size={10} style={{ opacity: sortKey === field ? 1 : 0.3 }} />
    </button>
  )

  return (
    <div>
      {/* Sort bar */}
      <div className="flex items-center gap-1 mb-3 pb-2 border-b" style={{ borderColor: 'var(--border-light)' }}>
        <span className="text-[10px] uppercase tracking-wider mr-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
          Sort:
        </span>
        <SortButton label="Priority" field="priority" />
        <SortButton label="Status" field="status" />
        <SortButton label="Due Date" field="due_date" />
        <SortButton label="Assignee" field="assignee" />
        <SortButton label="Newest" field="created_at" />
      </div>

      {/* Task list */}
      <div className="flex flex-col gap-2">
        {sorted.map((task) => (
          <TaskCard key={task.id} task={task} onStatusChange={onStatusChange} onClick={onSelect ? () => onSelect(task) : undefined} />
        ))}
        {sorted.length === 0 && (
          <div
            className="text-center py-12 text-sm"
            style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}
          >
            No tasks match the current filters
          </div>
        )}
      </div>
    </div>
  )
}

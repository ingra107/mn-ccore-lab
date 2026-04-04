import { useState, useMemo, useEffect, useCallback } from 'react'
import { ArrowUpDown, CheckCircle2 } from 'lucide-react'
import TaskCard from './TaskCard'
import TaskPeekOverlay from './TaskPeekOverlay'
import type { TaskRow } from '../../lib/api'

interface TaskListViewProps {
  tasks: TaskRow[]
  onStatusChange: (id: string, status: string) => void
  onSelect?: (task: TaskRow) => void
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}

type SortKey = 'priority' | 'due_date' | 'assignee' | 'created_at' | 'status'

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const statusOrder: Record<string, number> = { blocked: 0, in_progress: 1, todo: 2, done: 3 }

export default function TaskListView({ tasks, onStatusChange, onSelect, selectedIds, onToggleSelect }: TaskListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortAsc, setSortAsc] = useState(true)
  const [hoveredTask, setHoveredTask] = useState<TaskRow | null>(null)
  const [peekTask, setPeekTask] = useState<TaskRow | null>(null)

  const handleSpaceKey = useCallback((e: KeyboardEvent) => {
    // Only activate if no peek is open and a task is hovered
    if (e.key === ' ' && hoveredTask && !peekTask) {
      // Don't intercept if user is typing in an input
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      setPeekTask(hoveredTask)
    }
  }, [hoveredTask, peekTask])

  useEffect(() => {
    window.addEventListener('keydown', handleSpaceKey)
    return () => window.removeEventListener('keydown', handleSpaceKey)
  }, [handleSpaceKey])

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
      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors"
      style={{
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
    <div className="table-container" style={{ padding: '16px 20px' }}>
      {/* Sort bar */}
      <div className="flex items-center gap-1 mb-3 pb-2 border-b" style={{ borderColor: 'var(--border-light)' }}>
        <span className="text-[11px] uppercase tracking-wider mr-1" style={{ color: 'var(--slate)', opacity: 0.5 }}>
          Sort:
        </span>
        <SortButton label="Priority" field="priority" />
        <SortButton label="Status" field="status" />
        <SortButton label="Due Date" field="due_date" />
        <SortButton label="Assignee" field="assignee" />
        <SortButton label="Newest" field="created_at" />
      </div>

      {/* Task list */}
      <div className="flex flex-col gap-3">
        {sorted.map((task) => (
          <div key={task.id} className="flex items-start gap-2">
            {onToggleSelect && (
              <div
                onClick={(e) => { e.stopPropagation(); onToggleSelect(task.id) }}
                className="flex-shrink-0 cursor-pointer mt-3"
                style={{ width: 20, height: 20 }}
              >
                {selectedIds?.has(task.id) ? (
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={12} style={{ color: 'white' }} />
                  </div>
                ) : (
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid var(--border-light)' }} />
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <TaskCard
                task={task}
                onStatusChange={onStatusChange}
                onClick={onSelect ? () => onSelect(task) : undefined}
                onMouseEnter={() => setHoveredTask(task)}
                onMouseLeave={() => setHoveredTask((prev) => (prev?.id === task.id ? null : prev))}
              />
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="text-center py-16">
            <div
              className="mx-auto mb-3"
              style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.06)' }}
            >
              <CheckCircle2 size={24} style={{ color: 'var(--teal)', opacity: 0.5 }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              No tasks match the current filters
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)', opacity: 0.5 }}>
              Try adjusting your sort or filter settings
            </p>
          </div>
        )}
      </div>

      <TaskPeekOverlay task={peekTask} onClose={() => setPeekTask(null)} />
    </div>
  )
}

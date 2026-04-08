import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, List, LayoutGrid, GanttChartSquare, ChevronDown, CheckCircle2, CheckSquare } from 'lucide-react'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import ToggleButton from '../../components/ToggleButton'
import TaskGridView from '../../components/tasks/TaskGridView'
import TaskBoardView from '../../components/tasks/TaskBoardView'
import TaskTimelineView from '../../components/tasks/TaskTimelineView'
import TaskDetailPanel from '../../components/tasks/TaskDetailPanel'
import CreateTaskModal from '../../components/tasks/CreateTaskModal'
import { useUndoToast } from '../../components/UndoToast'
import { useTasks } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import type { TaskRow } from '../../lib/api'
import { useCreateTask, useUpdateTaskStatus, useUpdateTask, useBulkUpdateTasks } from '../../hooks/useMutations'
import BulkActionToolbar from '../../components/tasks/BulkActionToolbar'
import { getPersonInfo } from '../../data/team'

type ViewMode = 'list' | 'board' | 'timeline'

const alternateViews: { key: ViewMode; label: string; icon: typeof List; description: string }[] = [
  { key: 'board', label: 'Board', icon: LayoutGrid, description: 'Kanban columns by status' },
  { key: 'timeline', label: 'Timeline', icon: GanttChartSquare, description: 'Tasks on a time axis' },
]

type GroupBy = 'none' | 'due_date' | 'priority' | 'project' | 'status'
type SortBy = 'priority' | 'due_date' | 'title'

const groupByOptions: { key: GroupBy; label: string }[] = [
  { key: 'none', label: 'No Grouping' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'priority', label: 'Priority' },
  { key: 'project', label: 'Project' },
  { key: 'status', label: 'Status' },
]

const sortByOptions: { key: SortBy; label: string }[] = [
  { key: 'priority', label: 'Priority' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'title', label: 'Title' },
]

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export default function MyTasks() {
  const [view, setView] = useState<ViewMode>('list')
  const [showCreate, setShowCreate] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupBy>('due_date')
  const [sortBy, setSortBy] = useState<SortBy>('due_date')

  // For now, show all tasks (no auth = no current user detection)
  // When Cloudflare Access is enabled, this will filter to the authenticated user's slug
  const { data: allTasks = [], isLoading } = useTasks()
  const createTask = useCreateTask()
  const updateStatus = useUpdateTaskStatus()
  const updateTask = useUpdateTask()
  const { showSuccess, showUndo } = useUndoToast()
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const bulkUpdate = useBulkUpdateTasks()

  const handleBulkAction = (action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete', value?: string) => {
    bulkUpdate.mutate({ ids: [...selectedIds], action, value }, {
      onSuccess: () => setSelectedIds(new Set()),
    })
  }
  const handleFieldChange = (id: string, field: string, value: unknown) => {
    updateTask.mutate({ id, fields: { [field]: value } })
  }

  const { user } = useAuth()
  const currentUser = user?.email?.split('@')[0]?.toLowerCase() || null

  // Filter to current user's tasks
  const tasks = useMemo(() => {
    if (!currentUser) return allTasks // Show all if no auth
    return allTasks.filter((t) => t.assignee === currentUser)
  }, [allTasks, currentUser])

  const handleStatusChange = (id: string, status: string) => {
    const task = allTasks.find(t => t.id === id)
    const prev = task?.status || 'todo'
    updateStatus.mutate({ id, status })
    const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked' }
    showUndo(`Status → ${labels[status] || status}`, () => updateStatus.mutate({ id, status: prev }))
  }

  const handleCreate = (task: {
    title: string
    description: string
    assignee: string
    project_id?: string
    due_date?: string
    priority?: string
  }) => {
    createTask.mutate(task, {
      onSuccess: () => showSuccess('Task created'),
    })
  }

  const pendingCount = tasks.filter((t) => !t.completed).length
  const completedCount = tasks.filter((t) => t.completed).length
  const displayTasks = showCompleted ? tasks : tasks.filter((t) => !t.completed)
  const person = currentUser ? getPersonInfo(currentUser) : null

  return (
    <div>
      <PageHeader
        icon={<CheckSquare size={20} />}
        title={person ? `${person.name.split(' ')[0]}'s Tasks` : 'My Tasks'}
        subtitle={`${pendingCount} active task${pendingCount !== 1 ? 's' : ''}`}
        count={pendingCount}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--teal)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Plus size={16} />
            New Task
          </button>
        }
      >
        {/* Controls: View + Group By + Sort By */}
        <div className="flex items-center gap-3 flex-wrap">
          <ToggleButton active={view === 'list'} onClick={() => setView('list')}>
            <List size={14} />
            List
          </ToggleButton>
          <ViewDropdown view={view} setView={setView} views={alternateViews} />

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: 'var(--slate)', opacity: 0.5 }}>Group by:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{
                fontSize: '12px',
                color: groupBy !== 'none' ? 'var(--teal)' : 'var(--slate)',
                backgroundColor: groupBy !== 'none' ? 'rgba(45,138,138,0.06)' : 'transparent',
                borderColor: groupBy !== 'none' ? 'var(--teal)' : 'var(--border-light)',
                cursor: 'pointer',
                appearance: 'none' as const,
                WebkitAppearance: 'none' as const,
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
                paddingRight: '20px',
              }}
            >
              {groupByOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: 'var(--slate)', opacity: 0.5 }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{
                fontSize: '12px',
                color: 'var(--slate)',
                borderColor: 'var(--border-light)',
                cursor: 'pointer',
                appearance: 'none' as const,
                WebkitAppearance: 'none' as const,
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
                paddingRight: '20px',
              }}
            >
              {sortByOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          {completedCount > 0 && (
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
              style={{
                backgroundColor: showCompleted ? 'rgba(34,197,94,0.1)' : 'transparent',
                color: showCompleted ? 'var(--green)' : 'var(--slate)',
                border: `1px solid ${showCompleted ? 'rgba(34,197,94,0.3)' : 'var(--border-light)'}`,
                cursor: 'pointer',
                opacity: showCompleted ? 1 : 0.5,
              }}
            >
              <CheckCircle2 size={10} />
              {showCompleted ? `Hide ${completedCount} done` : `Show ${completedCount} done`}
            </button>
          )}
        </div>
      </PageHeader>

      {!currentUser && (
        <div
          className="mt-4 px-4 py-3 rounded-lg border text-sm"
          style={{
            borderColor: 'var(--gold)',
            backgroundColor: 'rgba(201,168,76,0.06)',
            color: 'var(--ink)',
          }}
        >
          Showing all lab tasks. Sign in with your @umn.edu account to see only your tasks.
        </div>
      )}

      {/* Content */}
      <div className="mt-5">
        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={40} />}
            title={currentUser ? 'All caught up!' : 'No tasks yet'}
            subtitle={currentUser
              ? 'You have no active tasks assigned to you.'
              : 'Sign in to see your personal tasks, or create one below.'}
            action={{ label: 'Create a task', onClick: () => setShowCreate(true) }}
          />
        ) : view !== 'list' ? (
          <>
            {view === 'board' && <TaskBoardView tasks={displayTasks} onStatusChange={handleStatusChange} onSelect={setSelectedTask} />}
            {view === 'timeline' && <TaskTimelineView tasks={displayTasks} onStatusChange={handleStatusChange} onOpenDetail={setSelectedTask} />}
          </>
        ) : groupBy === 'none' ? (
          <TaskGridView tasks={sortTasks(displayTasks, sortBy)} onStatusChange={handleStatusChange} onFieldChange={handleFieldChange} onOpenDetail={setSelectedTask} selectedIds={selectedIds} onToggleSelect={(id) => setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })} />
        ) : (
          <GroupedTaskList tasks={displayTasks} groupBy={groupBy} sortBy={sortBy} onStatusChange={handleStatusChange} onFieldChange={handleFieldChange} onOpenDetail={setSelectedTask} />
        )}
      </div>

      {/* Create modal */}
      <CreateTaskModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />

      {/* Detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}

      <BulkActionToolbar
        selectedIds={selectedIds}
        selectedTasks={displayTasks.filter(t => selectedIds.has(t.id))}
        onClear={() => setSelectedIds(new Set())}
        onBulkAction={handleBulkAction}
        isUpdating={bulkUpdate.isPending}
      />
    </div>
  )
}

// ── Sort helper ──────────────────────────────────────────────
function sortTasks(tasks: any[], sortBy: SortBy) {
  return [...tasks].sort((a, b) => {
    if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
    if (sortBy === 'due_date') return (a.due_date || '9999').localeCompare(b.due_date || '9999')
    return (a.title || '').localeCompare(b.title || '')
  })
}

// ── Grouped Task List ──────────────────────────────────────────
function GroupedTaskList({ tasks, groupBy, sortBy, onStatusChange, onFieldChange, onOpenDetail }: {
  tasks: any[]
  groupBy: GroupBy
  sortBy: SortBy
  onStatusChange: (id: string, status: string) => void
  onFieldChange: (id: string, field: string, value: unknown) => void
  onOpenDetail?: (task: TaskRow) => void
}) {
  const groups = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const task of tasks) {
      let key: string
      if (groupBy === 'due_date') {
        if (!task.due_date) key = 'No Due Date'
        else {
          const d = new Date(task.due_date + 'T12:00:00')
          const now = new Date()
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
          const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)
          if (d < today) key = 'Overdue'
          else if (d < tomorrow) key = 'Today'
          else if (d < weekEnd) key = 'This Week'
          else key = 'Later'
        }
      } else if (groupBy === 'priority') {
        key = (task.priority || 'medium').charAt(0).toUpperCase() + (task.priority || 'medium').slice(1)
      } else if (groupBy === 'project') {
        key = task.project_id || 'No Project'
      } else {
        key = (task.status || 'todo').replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      }
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(task)
    }

    // Sort groups by a sensible order
    const entries = [...map.entries()]
    if (groupBy === 'due_date') {
      const order = ['Overdue', 'Today', 'This Week', 'Later', 'No Due Date']
      entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    } else if (groupBy === 'priority') {
      const order = ['Urgent', 'High', 'Medium', 'Low']
      entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    }

    return entries.map(([label, items]) => ({ label, items: sortTasks(items, sortBy) }))
  }, [tasks, groupBy, sortBy])

  const groupColors: Record<string, string> = {
    'Overdue': 'var(--maroon)',
    'Today': 'var(--teal)',
    'This Week': 'var(--gold)',
    'Urgent': 'var(--maroon)',
    'High': 'var(--orange)',
    'In Progress': 'var(--teal)',
    'Blocked': 'var(--maroon)',
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ label, items }) => (
        <div key={label}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: groupColors[label] || 'var(--slate)', opacity: groupColors[label] ? 1 : 0.3 }} />
            <h3 className="text-xs font-normal uppercase tracking-wider" style={{ color: groupColors[label] || 'var(--ink)' }}>
              {label}
            </h3>
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.55 }}>
              {items.length}
            </span>
            {/* Mini progress bar */}
            {(() => {
              const done = items.filter(t => t.completed).length
              const total = items.length
              if (total === 0 || done === 0) return null
              const pct = Math.round((done / total) * 100)
              return (
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: 'var(--green)', transition: 'width 300ms ease' }} />
                  </div>
                  <span className="text-[9px]" style={{ color: 'var(--green)', opacity: 0.7 }}>{pct}%</span>
                </div>
              )
            })()}
          </div>
          <TaskGridView tasks={items} onStatusChange={onStatusChange} onFieldChange={onFieldChange} onOpenDetail={onOpenDetail} />
        </div>
      ))}
    </div>
  )
}

// Reusable view dropdown
function ViewDropdown({ view, setView, views }: { view: ViewMode; setView: (v: ViewMode) => void; views: typeof alternateViews }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const currentView = views.find(v => v.key === view)
  const CurrentIcon = currentView?.icon || List

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
        style={{
          color: currentView ? 'var(--teal)' : 'var(--slate)',
          backgroundColor: currentView ? 'rgba(45,138,138,0.08)' : 'transparent',
          borderColor: currentView ? 'var(--teal)' : 'var(--border-light)',
          cursor: 'pointer',
        }}
      >
        {currentView && <CurrentIcon size={13} />}
        {currentView ? currentView.label : 'More views'}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-lg border shadow-lg z-50 py-1 min-w-[200px]"
          style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-light)' }}
        >
          {views.map((v) => {
            const Icon = v.icon
            return (
              <button
                key={v.key}
                onClick={() => { setView(v.key); setOpen(false) }}
                className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ cursor: 'pointer', border: 'none', background: 'none' }}
              >
                <Icon size={16} style={{ color: view === v.key ? 'var(--teal)' : 'var(--slate)', marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div className="text-sm font-medium" style={{ color: view === v.key ? 'var(--teal)' : 'var(--ink)' }}>
                    {v.label}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--slate)', opacity: 0.7 }}>
                    {v.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

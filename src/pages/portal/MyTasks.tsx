import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, List, LayoutGrid, GanttChartSquare, ChevronDown, CheckCircle2, CheckSquare } from 'lucide-react'
import { SkeletonList } from '../../components/Skeleton'
import SectionHeader from '../../components/SectionHeader'
import ToggleButton from '../../components/ToggleButton'
import TaskListView from '../../components/tasks/TaskListView'
import TaskBoardView from '../../components/tasks/TaskBoardView'
import TaskTimelineView from '../../components/tasks/TaskTimelineView'
import CreateTaskModal from '../../components/tasks/CreateTaskModal'
import { useTasks } from '../../hooks/useApiData'
import { useCreateTask, useUpdateTaskStatus } from '../../hooks/useMutations'
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
  const [sortBy, setSortBy] = useState<SortBy>('priority')

  // For now, show all tasks (no auth = no current user detection)
  // When Cloudflare Access is enabled, this will filter to the authenticated user's slug
  const { data: allTasks = [], isLoading } = useTasks()
  const createTask = useCreateTask()
  const updateStatus = useUpdateTaskStatus()

  // Get current user slug from JWT cookie (or fallback to showing prompt)
  const currentUser = useMemo(() => {
    // Try to get from Cloudflare Access JWT
    try {
      const cookies = document.cookie.split(';').map((c) => c.trim())
      const cfCookie = cookies.find((c) => c.startsWith('CF_Authorization='))
      if (cfCookie) {
        const jwt = cfCookie.split('=')[1]
        const payload = JSON.parse(atob(jwt.split('.')[1]))
        if (payload.email) {
          return payload.email.split('@')[0].toLowerCase()
        }
      }
    } catch { /* no auth */ }
    return null
  }, [])

  // Filter to current user's tasks
  const tasks = useMemo(() => {
    if (!currentUser) return allTasks // Show all if no auth
    return allTasks.filter((t) => t.assignee === currentUser)
  }, [allTasks, currentUser])

  const handleStatusChange = (id: string, status: string) => {
    updateStatus.mutate({ id, status })
  }

  const handleCreate = (task: {
    title: string
    description: string
    assignee: string
    project_id?: string
    due_date?: string
    priority?: string
  }) => {
    createTask.mutate(task)
  }

  const pendingCount = tasks.filter((t) => !t.completed).length
  const person = currentUser ? getPersonInfo(currentUser) : null

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <SectionHeader
          icon={CheckSquare}
          title={person ? `${person.name.split(' ')[0]}'s Tasks` : 'My Tasks'}
          subtitle={`${pendingCount} active task${pendingCount !== 1 ? 's' : ''}`}
        />
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors mt-1"
          style={{
            fontFamily: 'var(--font-sans)',
            backgroundColor: 'var(--teal)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          New Task
        </button>
      </div>

      {!currentUser && (
        <div
          className="mt-4 px-4 py-3 rounded-lg border text-sm"
          style={{
            fontFamily: 'var(--font-sans)',
            borderColor: 'var(--gold)',
            backgroundColor: 'rgba(201,168,76,0.06)',
            color: 'var(--ink)',
          }}
        >
          Showing all lab tasks. Sign in with your @umn.edu account to see only your tasks.
        </div>
      )}

      {/* Controls: View + Group By + Sort By */}
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <ToggleButton active={view === 'list'} onClick={() => setView('list')}>
          <List size={14} />
          List
        </ToggleButton>
        <ViewDropdown view={view} setView={setView} views={alternateViews} />

        <div className="flex-1" />

        {/* Group By */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>Group by:</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded-full border px-2.5 py-1 text-xs"
            style={{
              fontFamily: 'var(--font-sans)',
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

        {/* Sort By */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-full border px-2.5 py-1 text-xs"
            style={{
              fontFamily: 'var(--font-sans)',
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
      </div>

      {/* Content */}
      <div className="mt-5">
        {isLoading ? (
          <SkeletonList count={3} />
        ) : tasks.length === 0 ? (
          <div className="text-center py-20">
            <div
              className="mx-auto mb-4"
              style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.08)' }}
            >
              <CheckCircle2 size={28} style={{ color: 'var(--teal)', opacity: 0.6 }} />
            </div>
            <p className="text-base font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
              {currentUser ? 'All caught up!' : 'No tasks yet'}
            </p>
            <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
              {currentUser
                ? 'You have no active tasks assigned to you.'
                : 'Sign in to see your personal tasks, or create one below.'}
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--teal)', borderColor: 'var(--teal)', background: 'none', cursor: 'pointer' }}
            >
              <Plus size={15} />
              Create a task
            </button>
          </div>
        ) : view !== 'list' ? (
          <>
            {view === 'board' && <TaskBoardView tasks={tasks} onStatusChange={handleStatusChange} />}
            {view === 'timeline' && <TaskTimelineView tasks={tasks} onStatusChange={handleStatusChange} />}
          </>
        ) : groupBy === 'none' ? (
          <TaskListView tasks={sortTasks(tasks, sortBy)} onStatusChange={handleStatusChange} />
        ) : (
          <GroupedTaskList tasks={tasks} groupBy={groupBy} sortBy={sortBy} onStatusChange={handleStatusChange} />
        )}
      </div>

      {/* Create modal */}
      <CreateTaskModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
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
function GroupedTaskList({ tasks, groupBy, sortBy, onStatusChange }: {
  tasks: any[]
  groupBy: GroupBy
  sortBy: SortBy
  onStatusChange: (id: string, status: string) => void
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
    'High': '#c2410c',
    'In Progress': 'var(--teal)',
    'Blocked': 'var(--maroon)',
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ label, items }) => (
        <div key={label}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: groupColors[label] || 'var(--slate)', opacity: groupColors[label] ? 1 : 0.3 }} />
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: groupColors[label] || 'var(--ink)' }}>
              {label}
            </h3>
            <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
              {items.length}
            </span>
          </div>
          <TaskListView tasks={items} onStatusChange={onStatusChange} />
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
          fontFamily: 'var(--font-sans)',
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
          style={{ backgroundColor: 'var(--card-bg, #fff)', borderColor: 'var(--border-light)' }}
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
                  <div className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', color: view === v.key ? 'var(--teal)' : 'var(--ink)' }}>
                    {v.label}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
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

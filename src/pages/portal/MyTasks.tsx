import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, List, LayoutGrid, GanttChartSquare, ChevronDown, CheckCircle2 } from 'lucide-react'
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

export default function MyTasks() {
  const [view, setView] = useState<ViewMode>('list')
  const [showCreate, setShowCreate] = useState(false)

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

      {/* View selector */}
      <div className="mt-5 flex items-center gap-2">
        <ToggleButton active={view === 'list'} onClick={() => setView('list')}>
          <List size={14} />
          List
        </ToggleButton>

        {/* Alternate views dropdown */}
        <ViewDropdown view={view} setView={setView} views={alternateViews} />
      </div>

      {/* Content */}
      <div className="mt-5">
        {isLoading ? (
          <div
            className="text-center py-16 text-sm"
            style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}
          >
            Loading tasks...
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 size={40} style={{ color: 'var(--border-light)', margin: '0 auto 12px' }} />
            <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
              {currentUser ? 'No tasks assigned to you' : 'No tasks yet'}
            </p>
            <p className="text-xs mt-1 max-w-xs mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
              {currentUser
                ? 'Tasks assigned to you in meetings or by PIs will show up here.'
                : 'Sign in to see your personal tasks, or create one below.'}
            </p>
          </div>
        ) : (
          <>
            {view === 'list' && <TaskListView tasks={tasks} onStatusChange={handleStatusChange} />}
            {view === 'board' && <TaskBoardView tasks={tasks} onStatusChange={handleStatusChange} />}
            {view === 'timeline' && <TaskTimelineView tasks={tasks} onStatusChange={handleStatusChange} />}
          </>
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

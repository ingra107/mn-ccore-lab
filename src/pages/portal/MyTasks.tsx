import { useState, useMemo } from 'react'
import { Plus, List, LayoutGrid, GanttChartSquare } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import TaskListView from '../../components/tasks/TaskListView'
import TaskBoardView from '../../components/tasks/TaskBoardView'
import TaskTimelineView from '../../components/tasks/TaskTimelineView'
import CreateTaskModal from '../../components/tasks/CreateTaskModal'
import { useTasks } from '../../hooks/useApiData'
import { useCreateTask, useUpdateTaskStatus } from '../../hooks/useMutations'
import { getPersonInfo } from '../../data/team'

type ViewMode = 'list' | 'board' | 'timeline'

const views: { key: ViewMode; label: string; icon: typeof List }[] = [
  { key: 'list', label: 'List', icon: List },
  { key: 'board', label: 'Board', icon: LayoutGrid },
  { key: 'timeline', label: 'Timeline', icon: GanttChartSquare },
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

      {/* View tabs */}
      <div className="mt-5 flex items-center gap-2">
        {views.map((v) => {
          const Icon = v.icon
          const active = view === v.key
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors"
              style={{
                borderColor: active ? 'var(--teal)' : 'var(--border-light)',
                backgroundColor: active ? 'rgba(45,138,138,0.1)' : 'transparent',
                color: active ? 'var(--teal)' : 'var(--slate)',
                fontFamily: 'var(--font-sans)',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              <Icon size={14} />
              {v.label}
            </button>
          )
        })}
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

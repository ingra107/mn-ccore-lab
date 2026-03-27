import { useState } from 'react'
import { Plus, List, LayoutGrid, Users, GanttChartSquare } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import TaskFilters from '../../components/tasks/TaskFilters'
import TaskListView from '../../components/tasks/TaskListView'
import TaskBoardView from '../../components/tasks/TaskBoardView'
import TaskStandUpView from '../../components/tasks/TaskStandUpView'
import TaskTimelineView from '../../components/tasks/TaskTimelineView'
import TaskDetailPanel from '../../components/tasks/TaskDetailPanel'
import CreateTaskModal from '../../components/tasks/CreateTaskModal'
import { useTasks } from '../../hooks/useApiData'
import { useCreateTask, useUpdateTaskStatus } from '../../hooks/useMutations'
import type { TaskRow } from '../../lib/api'

type ViewMode = 'list' | 'board' | 'standup' | 'timeline'

const views: { key: ViewMode; label: string; icon: typeof List }[] = [
  { key: 'list', label: 'List', icon: List },
  { key: 'board', label: 'Board', icon: LayoutGrid },
  { key: 'standup', label: 'Stand Up', icon: Users },
  { key: 'timeline', label: 'Timeline', icon: GanttChartSquare },
]

export default function Tasks() {
  const [view, setView] = useState<ViewMode>('list')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  const [filters, setFilters] = useState({
    assignee: '',
    status: '',
    priority: '',
    project: '',
  })

  // Build query params from filters
  const queryFilters: Record<string, string> = {}
  if (filters.assignee) queryFilters.assignee = filters.assignee
  if (filters.status) queryFilters.status = filters.status
  if (filters.priority) queryFilters.priority = filters.priority
  if (filters.project) queryFilters.project = filters.project

  const { data: tasks = [], isLoading } = useTasks(
    Object.keys(queryFilters).length > 0 ? queryFilters : undefined
  )
  const createTask = useCreateTask()
  const updateStatus = useUpdateTaskStatus()

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

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <SectionHeader
          title="All Tasks"
          subtitle={`${pendingCount} active across the lab`}
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

      {/* View tabs + Filters */}
      <div className="mt-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
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

        <TaskFilters filters={filters} onChange={setFilters} />
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
            {view === 'list' && <TaskListView tasks={tasks} onStatusChange={handleStatusChange} onSelect={setSelectedTask} />}
            {view === 'board' && <TaskBoardView tasks={tasks} onStatusChange={handleStatusChange} onSelect={setSelectedTask} />}
            {view === 'standup' && <TaskStandUpView tasks={tasks} onStatusChange={handleStatusChange} />}
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

      {/* Detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  )
}

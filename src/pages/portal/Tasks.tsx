import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, List, LayoutGrid, Users, GanttChartSquare, CheckCircle2, Filter, ListTodo } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { getUserRole, ROLE_DEFAULTS } from '../../lib/roleDefaults'
import { SkeletonList } from '../../components/Skeleton'
import SectionHeader from '../../components/SectionHeader'
import TaskFilters from '../../components/tasks/TaskFilters'
import SavedViewsBar from '../../components/tasks/SavedViewsBar'
import TaskListView from '../../components/tasks/TaskListView'
import TaskBoardView from '../../components/tasks/TaskBoardView'
import TaskStandUpView from '../../components/tasks/TaskStandUpView'
import TaskTimelineView from '../../components/tasks/TaskTimelineView'
import TaskDetailPanel from '../../components/tasks/TaskDetailPanel'
import CreateTaskModal from '../../components/tasks/CreateTaskModal'
import BulkActionToolbar from '../../components/tasks/BulkActionToolbar'
import ToggleButton from '../../components/ToggleButton'
import { useTasks } from '../../hooks/useApiData'
import { useCreateTask, useUpdateTaskStatus, useBulkUpdateTasks } from '../../hooks/useMutations'
import { useSavedViews } from '../../hooks/useSavedViews'
import type { ViewFilters } from '../../hooks/useSavedViews'
import type { TaskRow } from '../../lib/api'

type ViewMode = 'list' | 'board' | 'standup' | 'timeline'

const alternateViews: { key: ViewMode; label: string; icon: typeof List; description: string }[] = [
  { key: 'board', label: 'Board', icon: LayoutGrid, description: 'Kanban columns by status' },
  { key: 'standup', label: 'By Person', icon: Users, description: 'Tasks grouped by assignee' },
  { key: 'timeline', label: 'Timeline', icon: GanttChartSquare, description: 'Tasks on a time axis' },
]

export default function Tasks() {
  const { user } = useAuth()
  const role = getUserRole(user?.email)
  const defaultView = useMemo(() => ROLE_DEFAULTS[role].taskView as ViewMode, [role])

  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<ViewMode>(defaultView)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const bulkUpdate = useBulkUpdateTasks()

  // Auto-open create modal from URL params (keyboard shortcut C)
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowCreate(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])
  const [filters, setFilters] = useState({
    assignee: '',
    status: '',
    priority: '',
    project: '',
  })

  const {
    views,
    activeViewId,
    activeViewFilters,
    setActiveViewId,
    saveView,
    renameView,
    deleteView,
  } = useSavedViews('nick')

  const currentViewFilters: ViewFilters = {
    assignee: filters.assignee || '',
    status: (filters.status || 'all') as ViewFilters['status'],
    search: '',
    sort: 'due_asc',
  }

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

  const activeFilterCount = Object.values(filters).filter(Boolean).length

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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkAction = (action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete', value?: string) => {
    bulkUpdate.mutate({ ids: [...selectedIds], action, value }, {
      onSuccess: () => setSelectedIds(new Set()),
    })
  }

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [filters.assignee, filters.status, filters.priority, filters.project, showCompleted])

  const pendingCount = tasks.filter((t) => !t.completed).length
  const completedCount = tasks.filter((t) => t.completed).length
  const displayTasks = showCompleted ? tasks : tasks.filter((t) => !t.completed)

  return (
    <div>
      {/* Header: Title + Filter chips + New Task button */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
          <SectionHeader
            title="All Tasks"
            subtitle={`${pendingCount} active across the lab`}
            icon={ListTodo}
          />
          {/* Inline filter chips */}
          <div className="mt-1">
            <TaskFilters filters={filters} onChange={setFilters} />
          </div>
        </div>
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

      {/* Saved view presets */}
      <div className="mt-3">
        <SavedViewsBar
          views={views}
          activeViewId={activeViewId}
          currentFilters={currentViewFilters}
          activeViewFilters={activeViewFilters}
          onSelectView={(id) => {
            setActiveViewId(id)
            const view = views.find(v => v.id === id)
            if (view) {
              const resolved = {
                ...view.filters,
                assignee: view.filters.assignee === '__me__' ? 'nick' : view.filters.assignee,
              }
              setFilters({
                assignee: resolved.assignee,
                status: resolved.status === 'all' ? '' : resolved.status,
                priority: '',
                project: '',
              })
            }
          }}
          onSaveView={saveView}
          onRenameView={renameView}
          onDeleteView={deleteView}
        />
      </div>

      {/* View selector */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* All views inline */}
          <ToggleButton active={view === 'list'} onClick={() => setView('list')}>
            <List size={14} />
            List
          </ToggleButton>
          {alternateViews.map((v) => {
            const Icon = v.icon
            return (
              <ToggleButton key={v.key} active={view === v.key} onClick={() => setView(v.key)}>
                <Icon size={14} />
                {v.label}
              </ToggleButton>
            )
          })}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Show completed toggle */}
          {completedCount > 0 && (
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
              style={{
                fontFamily: 'var(--font-mono)',
                backgroundColor: showCompleted ? 'rgba(34,197,94,0.1)' : 'transparent',
                color: showCompleted ? '#16a34a' : 'var(--slate)',
                border: `1px solid ${showCompleted ? 'rgba(34,197,94,0.3)' : 'var(--border-light)'}`,
                cursor: 'pointer',
                opacity: showCompleted ? 1 : 0.5,
              }}
            >
              <CheckCircle2 size={10} />
              {showCompleted ? `Hide ${completedCount} done` : `Show ${completedCount} done`}
            </button>
          )}

          {/* Active filter indicator */}
          {activeFilterCount > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium"
              style={{ fontFamily: 'var(--font-mono)', backgroundColor: 'rgba(45,138,138,0.1)', color: 'var(--teal)' }}
            >
              <Filter size={10} />
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mt-5">
        {isLoading ? (
          <SkeletonList count={5} />
        ) : displayTasks.length === 0 ? (
          <div className="text-center py-20">
            <div
              className="mx-auto mb-4"
              style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.08)' }}
            >
              <CheckCircle2 size={28} style={{ color: 'var(--teal)', opacity: 0.6 }} />
            </div>
            <p className="text-base font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
              No tasks yet
            </p>
            <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
              Tasks created in meetings, assigned by PIs, or added by team members will appear here.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--teal)', borderColor: 'var(--teal)', background: 'none', cursor: 'pointer' }}
            >
              <Plus size={15} />
              Create first task
            </button>
          </div>
        ) : (
          <>
            {view === 'list' && <TaskListView tasks={displayTasks} onStatusChange={handleStatusChange} onSelect={setSelectedTask} selectedIds={selectedIds} onToggleSelect={toggleSelect} />}
            {view === 'board' && <TaskBoardView tasks={displayTasks} onStatusChange={handleStatusChange} onSelect={setSelectedTask} />}
            {view === 'standup' && <TaskStandUpView tasks={displayTasks} onStatusChange={handleStatusChange} />}
            {view === 'timeline' && <TaskTimelineView tasks={displayTasks} onStatusChange={handleStatusChange} />}
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

      {/* Bulk action toolbar */}
      <BulkActionToolbar
        selectedIds={selectedIds}
        selectedTasks={tasks.filter((t) => selectedIds.has(t.id))}
        onClear={() => setSelectedIds(new Set())}
        onBulkAction={handleBulkAction}
        isUpdating={bulkUpdate.isPending}
      />
    </div>
  )
}

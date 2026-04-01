import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, List, LayoutGrid, Users, GanttChartSquare, CheckCircle2, Filter, ListTodo } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { getUserRole, ROLE_DEFAULTS } from '../../lib/roleDefaults'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import TaskFilters from '../../components/tasks/TaskFilters'
import SavedViewsBar from '../../components/tasks/SavedViewsBar'
import TaskGridView from '../../components/tasks/TaskGridView'
import TaskBoardView from '../../components/tasks/TaskBoardView'
import TaskStandUpView from '../../components/tasks/TaskStandUpView'
import TaskTimelineView from '../../components/tasks/TaskTimelineView'
import TaskDetailPanel from '../../components/tasks/TaskDetailPanel'
import TaskPeekOverlay from '../../components/tasks/TaskPeekOverlay'
import CreateTaskModal from '../../components/tasks/CreateTaskModal'
import BulkActionToolbar from '../../components/tasks/BulkActionToolbar'
import ToggleButton from '../../components/ToggleButton'
import { useTasks } from '../../hooks/useApiData'
import { useCreateTask, useUpdateTaskStatus, useUpdateTask, useBulkUpdateTasks } from '../../hooks/useMutations'
import { useSavedViews } from '../../hooks/useSavedViews'
import { useTaskKeyboardShortcuts } from '../../hooks/useTaskKeyboardShortcuts'
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
  const [peekTask, setPeekTask] = useState<TaskRow | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [focusedTaskIndex, setFocusedTaskIndex] = useState(-1)
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
  const updateTask = useUpdateTask()

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const handleStatusChange = (id: string, status: string) => {
    updateStatus.mutate({ id, status })
  }

  const handleFieldChange = (id: string, field: string, value: unknown) => {
    updateTask.mutate({ id, fields: { [field]: value } })
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

  // Get the currently focused task for peek/actions
  const focusedTask = focusedTaskIndex >= 0 && focusedTaskIndex < displayTasks.length
    ? displayTasks[focusedTaskIndex]
    : null

  // Sync peek task when focused index changes while peek is open
  useEffect(() => {
    if (peekTask && focusedTask) {
      setPeekTask(focusedTask)
    }
  }, [focusedTask]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset focused index when tasks change (filter, sort, etc.)
  useEffect(() => {
    setFocusedTaskIndex(-1)
  }, [filters.assignee, filters.status, filters.priority, filters.project, showCompleted, view])

  // Status cycle: todo -> in_progress -> done
  const STATUS_CYCLE = ['todo', 'in_progress', 'done'] as const
  const cycleStatus = useCallback(() => {
    if (!focusedTask) return
    const idx = STATUS_CYCLE.indexOf(focusedTask.status as typeof STATUS_CYCLE[number])
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    handleStatusChange(focusedTask.id, next)
  }, [focusedTask]) // eslint-disable-line react-hooks/exhaustive-deps

  const togglePeek = useCallback(() => {
    if (peekTask) {
      setPeekTask(null)
    } else if (focusedTask) {
      setPeekTask(focusedTask)
    } else if (displayTasks.length > 0) {
      setFocusedTaskIndex(0)
      setPeekTask(displayTasks[0])
    }
  }, [peekTask, focusedTask, displayTasks])

  const openDetailForFocused = useCallback(() => {
    if (focusedTask) {
      setPeekTask(null)
      setSelectedTask(focusedTask)
    }
  }, [focusedTask])

  const toggleSelectFocused = useCallback(() => {
    if (focusedTask) {
      toggleSelect(focusedTask.id)
    }
  }, [focusedTask]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeOverlay = useCallback(() => {
    if (peekTask) {
      setPeekTask(null)
    } else if (selectedTask) {
      setSelectedTask(null)
    }
  }, [peekTask, selectedTask])

  // Only enable task shortcuts in list view
  const isListView = view === 'list'
  useTaskKeyboardShortcuts({
    taskCount: isListView ? displayTasks.length : 0,
    focusedIndex: focusedTaskIndex,
    setFocusedIndex: setFocusedTaskIndex,
    peekOpen: !!peekTask,
    togglePeek,
    openDetail: openDetailForFocused,
    cycleStatus,
    toggleSelect: toggleSelectFocused,
    isBlocked: !!selectedTask || showCreate,
    closeOverlay,
  })

  return (
    <div>
      <PageHeader
        icon={<ListTodo size={20} />}
        title="All Tasks"
        subtitle={`${pendingCount} active across the lab`}
        count={pendingCount}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
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
        }
      >
        {/* Saved view presets */}
        <div className="mb-3">
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

        {/* Inline filter chips */}
        <div className="mb-3">
          <TaskFilters filters={filters} onChange={setFilters} />
        </div>

        {/* View selector */}
        <div className="flex items-center gap-1.5 flex-wrap">
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

          <div className="flex-1" />

          {completedCount > 0 && (
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
              style={{
                fontFamily: 'var(--font-sans)',
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

          {activeFilterCount > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium"
              style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'rgba(45,138,138,0.1)', color: 'var(--teal)' }}
            >
              <Filter size={10} />
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
            </span>
          )}
        </div>
      </PageHeader>

      {/* Content */}
      <div className="mt-5">
        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : displayTasks.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={40} />}
            title="No tasks yet"
            subtitle="Tasks created in meetings, assigned by PIs, or added by team members will appear here."
            action={{ label: 'Create first task', onClick: () => setShowCreate(true) }}
          />
        ) : (
          <>
            {view === 'list' && (
              <TaskGridView
                tasks={displayTasks}
                onStatusChange={handleStatusChange}
                onFieldChange={handleFieldChange}
                onSelect={(task) => {
                  // Click on row = set as peek target if peek is open, otherwise just focus
                  if (peekTask) setPeekTask(task)
                }}
                onOpenDetail={(task) => {
                  setPeekTask(null)
                  setSelectedTask(task)
                }}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                focusedIndex={focusedTaskIndex}
                onFocusIndex={setFocusedTaskIndex}
              />
            )}
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

      {/* Peek overlay (Space bar) */}
      <TaskPeekOverlay
        task={peekTask}
        onClose={() => setPeekTask(null)}
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

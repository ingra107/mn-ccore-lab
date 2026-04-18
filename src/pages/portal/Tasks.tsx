import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
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
import PageTooltip from '../../components/PageTooltip'
import { TableControls } from '../../components/table'
import { useUndoToast } from '../../components/UndoToast'
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
  const userSlug = user?.email?.split('@')[0]?.toLowerCase() || null

  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<ViewMode>(defaultView)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  const [peekTask, setPeekTask] = useState<TaskRow | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [focusedTaskIndex, setFocusedTaskIndex] = useState(-1)
  const [showFilters, setShowFilters] = useState(false)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const bulkUpdate = useBulkUpdateTasks()
  const { showSuccess, showUndo } = useUndoToast()

  const toggleExpandTask = useCallback((id: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Auto-open create modal from URL params (keyboard shortcut C)
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowCreate(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // F key toggles filters on task pages
  useEffect(() => {
    const handler = () => setShowFilters(prev => !prev)
    document.addEventListener('toggle-filters', handler)
    return () => document.removeEventListener('toggle-filters', handler)
  }, [])
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
    const task = tasks.find(t => t.id === id)
    const prev = task?.status || 'todo'
    updateStatus.mutate({ id, status })
    const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked', waiting_external: 'Waiting (External)' }
    showUndo(`Status → ${labels[status] || status}`, () => updateStatus.mutate({ id, status: prev }))
  }

  const handleFieldChange = (id: string, field: string, value: unknown) => {
    // Look up the prev value so the undo toast can revert. Skip undo for
    // content fields where a revert is noisy (title/description — users
    // typically don't mean to undo free-text edits).
    const task = tasks.find((t) => t.id === id)
    const prev = task ? (task as unknown as Record<string, unknown>)[field] : undefined
    updateTask.mutate({ id, fields: { [field]: value } })
    if (task && prev !== undefined && prev !== value && !['title', 'description'].includes(field)) {
      const label = field.replace(/_/g, ' ')
      showUndo(`${label.charAt(0).toUpperCase() + label.slice(1)} → ${String(value ?? 'none')}`, () =>
        updateTask.mutate({ id, fields: { [field]: prev } }),
      )
    }
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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkAction = (action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete' | 'snooze' | 'status', value?: string) => {
    if (action === 'snooze') {
      // Snooze: push due date by N days for each selected task
      const days = parseInt(value || '1', 10)
      for (const id of selectedIds) {
        const task = tasks.find(t => t.id === id)
        if (!task?.due_date) continue
        const d = new Date(task.due_date + 'T12:00:00')
        d.setDate(d.getDate() + days)
        const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        handleFieldChange(id, 'due_date', newDate)
      }
      showUndo(`Snoozed ${selectedIds.size} task(s) +${days}d`, () => {})
      setSelectedIds(new Set())
      return
    }
    bulkUpdate.mutate({ ids: [...selectedIds], action, value }, {
      onSuccess: () => setSelectedIds(new Set()),
    })
  }

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [filters.assignee, filters.status, filters.priority, filters.project, showCompleted])

  const filteredByUser = myTasksOnly && userSlug
    ? tasks.filter((t) => t.assignee === userSlug)
    : tasks
  const pendingCount = filteredByUser.filter((t) => !t.completed).length
  const completedCount = filteredByUser.filter((t) => t.completed).length
  const displayTasks = showCompleted ? filteredByUser : filteredByUser.filter((t) => !t.completed)

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

  // B shortcut: open detail panel for focused task (dependencies section)
  const addBlockerForFocused = useCallback(() => {
    if (focusedTask) {
      setPeekTask(null)
      setSelectedTask(focusedTask)
    }
  }, [focusedTask])

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
    addBlocker: addBlockerForFocused,
    toggleFilters: useCallback(() => setShowFilters(prev => !prev), []),
    expandFocused: useCallback(() => {
      if (focusedTask && !expandedTasks.has(focusedTask.id)) toggleExpandTask(focusedTask.id)
    }, [focusedTask, expandedTasks, toggleExpandTask]),
    collapseFocused: useCallback(() => {
      if (focusedTask && expandedTasks.has(focusedTask.id)) toggleExpandTask(focusedTask.id)
    }, [focusedTask, expandedTasks, toggleExpandTask]),
    createTask: useCallback(() => setShowCreate(true), []),
    editFocusedTitle: useCallback(() => {
      const row = document.querySelector('.task-row-focused .task-title-clickable')
      if (row) row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    }, []),
    editFocusedDueDate: useCallback(() => {
      const row = document.querySelector('.task-row-focused .task-row-meta button')
      if (row) (row as HTMLButtonElement).click()
    }, []),
    assignFocused: useCallback(() => {
      // Click the assignee picker on the focused row
      const row = document.querySelector('.task-row-focused .inline-assignee-btn')
      if (row) (row as HTMLButtonElement).click()
    }, []),
    snoozeFocused: useCallback(() => {
      if (!focusedTask || !focusedTask.due_date) return
      const d = new Date(focusedTask.due_date + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      handleFieldChange(focusedTask.id, 'due_date', newDate)
      showUndo(`Snoozed to ${newDate}`, () => handleFieldChange(focusedTask.id, 'due_date', focusedTask.due_date))
    }, [focusedTask, handleFieldChange, showUndo]),
  })

  // Dynamic page title
  useEffect(() => {
    document.title = pendingCount > 0 ? `(${pendingCount}) All Tasks | MN-CCORE` : 'All Tasks | MN-CCORE'
    return () => { document.title = 'MN-CCORE Lab Hub' }
  }, [pendingCount])

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
              backgroundColor: 'var(--teal-solid)',
              color: 'var(--ink-bright, #fff)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Plus size={16} />
            New Task
          </button>
        }
      >
        {/* View selector + filter toggle (always visible) */}
        <TableControls
          views={[
            { key: 'list', icon: <List size={14} />, label: 'List' },
            ...alternateViews.map((v) => ({ key: v.key, icon: <v.icon size={14} />, label: v.label })),
          ]}
          activeView={view}
          onViewChange={(v) => setView(v as ViewMode)}
          filters={
            <>
              {userSlug && (
                <button
                  onClick={() => setMyTasksOnly(!myTasksOnly)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: myTasksOnly ? 'var(--teal-active)' : 'transparent',
                    color: myTasksOnly ? 'var(--teal)' : 'var(--slate)',
                    border: `1px solid ${myTasksOnly ? 'rgba(45,138,138,0.3)' : 'var(--border-light)'}`,
                    cursor: 'pointer',
                    opacity: myTasksOnly ? 1 : 0.85,
                  }}
                >
                  <Users size={10} />
                  My Tasks
                </button>
              )}
            </>
          }
          rightExtra={
            <>
              {completedCount > 0 && (
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: showCompleted ? 'rgba(34,197,94,0.1)' : 'transparent',
                    color: showCompleted ? 'var(--green)' : 'var(--slate)',
                    border: `1px solid ${showCompleted ? 'rgba(34,197,94,0.3)' : 'var(--border-light)'}`,
                    cursor: 'pointer',
                    opacity: showCompleted ? 1 : 0.85,
                  }}
                >
                  <CheckCircle2 size={10} />
                  {showCompleted ? `Hide ${completedCount} done` : `Show ${completedCount} done`}
                </button>
              )}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor: showFilters || activeFilterCount > 0 ? 'var(--teal-active)' : 'transparent',
                  color: showFilters || activeFilterCount > 0 ? 'var(--teal)' : 'var(--slate)',
                  border: `1px solid ${showFilters || activeFilterCount > 0 ? 'var(--teal)' : 'var(--border-light)'}`,
                  cursor: 'pointer',
                  opacity: showFilters || activeFilterCount > 0 ? 1 : 0.85,
                }}
                title="Toggle filters (F)"
              >
                {activeFilterCount > 0 && (
                  <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: 'var(--teal-solid)', flexShrink: 0 }} />
                )}
                <Filter size={10} />
                Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
              <PageTooltip id="tasks-filter" text="Press F to toggle filters" />
            </>
          }
          count={pendingCount}
          countLabel="active"
        />

        {/* Collapsible filter panel (F key or button toggle) */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.0, 0.0, 0.2, 1.0] }}
              className="overflow-hidden"
            >
              <div className="pt-3 pb-1 space-y-2">
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
                <TaskFilters filters={filters} onChange={setFilters} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PageHeader>

      {/* Content — CLS fix: reserve container height so skeleton→grid swap doesn't shift */}
      <div className="mt-5" style={{ minHeight: 'calc(100vh - 320px)' }}>
        {isLoading ? (
          <TableSkeleton rows={12} cols={5} />
        ) : displayTasks.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={40} />}
            title="All clear"
            subtitle="No active tasks right now. They'll appear here as projects move forward, meetings generate action items, or someone assigns work."
            action={{ label: 'Create first task', onClick: () => setShowCreate(true) }}
          />
        ) : (
          <>
            {view === 'list' && (
              <TaskGridView
                tasks={displayTasks}
                allTasks={tasks}
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
                onPeek={(task) => setPeekTask(task)}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                focusedIndex={focusedTaskIndex}
                onFocusIndex={setFocusedTaskIndex}
                expandedTasks={expandedTasks}
                onToggleExpand={toggleExpandTask}
              />
            )}
            {view === 'board' && <TaskBoardView tasks={displayTasks} onStatusChange={handleStatusChange} onSelect={setSelectedTask} />}
            {view === 'standup' && <TaskStandUpView tasks={displayTasks} onStatusChange={handleStatusChange} onOpenDetail={(task) => { setPeekTask(null); setSelectedTask(task) }} />}
            {view === 'timeline' && <TaskTimelineView tasks={displayTasks} onStatusChange={handleStatusChange} onOpenDetail={(task) => { setPeekTask(null); setSelectedTask(task) }} />}
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
          onPrev={(() => {
            const idx = displayTasks.findIndex(t => t.id === selectedTask.id)
            return idx > 0 ? () => setSelectedTask(displayTasks[idx - 1]) : undefined
          })()}
          onNext={(() => {
            const idx = displayTasks.findIndex(t => t.id === selectedTask.id)
            return idx >= 0 && idx < displayTasks.length - 1 ? () => setSelectedTask(displayTasks[idx + 1]) : undefined
          })()}
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

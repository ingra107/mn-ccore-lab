import { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, List, LayoutGrid, GanttChartSquare, Users, ChevronDown, CheckCircle2, CheckSquare, Zap, Flame, X, Pin, GripVertical, Hourglass } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import ToggleButton from '../../components/ToggleButton'
import TaskGridView from '../../components/tasks/TaskGridView'
import TaskTitle from '../../components/tasks/TaskTitle'
// Alternate views are lazy — most users open MyTasks in 'list' (grid).
const TaskBoardView = lazy(() => import('../../components/tasks/TaskBoardView'))
const TaskStandUpView = lazy(() => import('../../components/tasks/TaskStandUpView'))
const TaskTimelineView = lazy(() => import('../../components/tasks/TaskTimelineView'))
const loadTaskDetailPanel = () => import('../../components/tasks/TaskDetailPanel')
const TaskDetailPanel = lazy(loadTaskDetailPanel)
import CreateTaskModal from '../../components/tasks/CreateTaskModal'
import { useUndoToast } from '../../components/UndoToast'
import { useTasks } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import type { TaskRow } from '../../lib/api'
import { useCreateTask, useUpdateTaskStatus, useUpdateTask, useBulkUpdateTasks } from '../../hooks/useMutations'
import BulkActionToolbar from '../../components/tasks/BulkActionToolbar'
import { getPersonInfo } from '../../data/team'
import DensityToggle, { useDensity, densityClass } from '../../components/DensityToggle'
import { useTaskKeyboardShortcuts } from '../../hooks/useTaskKeyboardShortcuts'

type ViewMode = 'list' | 'board' | 'standup' | 'timeline'
type QuickFilter = 'all' | 'today' | 'this_week' | 'overdue' | 'no_date' | 'waiting_on'

const alternateViews: { key: ViewMode; label: string; icon: typeof List; description: string }[] = [
  { key: 'board', label: 'Board', icon: LayoutGrid, description: 'Kanban columns by status' },
  { key: 'standup', label: 'By Person', icon: Users, description: 'Tasks grouped by assignee' },
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

import { PRIORITY_ORDER } from '../../lib/taskConstants'

export default function MyTasks() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<ViewMode>('list')
  const [showCreate, setShowCreate] = useState(() => searchParams.get('create') === 'true')
  const [groupBy, setGroupBy] = useState<GroupBy>('due_date')
  const [sortBy, setSortBy] = useState<SortBy>('due_date')
  const [density, setDensity] = useDensity()

  // Open create modal if ?create=true param is present, then clear it
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowCreate(true)
      setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('create'); return next }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Preload TaskDetailPanel chunk on idle so the first row click doesn't pay
  // a ~400ms Tiptap lazy-load delay. (R9-6 — Nick's bug #8.)
  useEffect(() => {
    const idleId =
      typeof (window as any).requestIdleCallback === 'function'
        ? (window as any).requestIdleCallback(() => { void loadTaskDetailPanel() }, { timeout: 2000 })
        : window.setTimeout(() => { void loadTaskDetailPanel() }, 1500)
    return () => {
      if (typeof (window as any).cancelIdleCallback === 'function') (window as any).cancelIdleCallback(idleId)
      else window.clearTimeout(idleId as number)
    }
  }, [])

  // For now, show all tasks (no auth = no current user detection)
  // When Cloudflare Access is enabled, this will filter to the authenticated user's slug
  const { data: allTasks = [], isLoading } = useTasks()
  const createTask = useCreateTask()
  const updateStatus = useUpdateTaskStatus()
  const updateTask = useUpdateTask()
  const { showSuccess, showUndo } = useUndoToast()
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showAllTasks, setShowAllTasks] = useState(false)
  const bulkUpdate = useBulkUpdateTasks()
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    localStorage.getItem('hub-signin-banner-dismissed') === 'true'
  )

  const handleBulkAction = (action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete' | 'snooze' | 'status', value?: string) => {
    if (action === 'snooze') {
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
  const handleFieldChange = useCallback((id: string, field: string, value: unknown) => {
    // Capture prev so we can undo priority/assignee/due_date/project changes.
    // Skip content fields (title/description) — text-edit undo is noisy.
    const task = allTasks.find((t) => t.id === id)
    const prev = task ? (task as unknown as Record<string, unknown>)[field] : undefined
    updateTask.mutate({ id, fields: { [field]: value } })
    if (task && prev !== undefined && prev !== value && !['title', 'description'].includes(field)) {
      const label = field.replace(/_/g, ' ')
      showUndo(`${label.charAt(0).toUpperCase() + label.slice(1)} → ${String(value ?? 'none')}`, () =>
        updateTask.mutate({ id, fields: { [field]: prev } }),
      )
    }
  }, [allTasks, updateTask, showUndo])

  const { user } = useAuth()
  const currentUser = emailToSlug(user?.email) || null

  // Filter to current user's tasks (or all tasks when showAllTasks is true)
  const tasks = useMemo(() => {
    if (showAllTasks) return allTasks
    if (!currentUser) return allTasks // Show all if no auth
    return allTasks.filter((t) => t.assignee === currentUser)
  }, [allTasks, currentUser, showAllTasks])

  const handleStatusChange = useCallback((id: string, status: string) => {
    const task = allTasks.find(t => t.id === id)
    const prev = task?.status || 'todo'
    updateStatus.mutate({ id, status })
    const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked', waiting_external: 'Waiting (External)' }
    showUndo(`Status → ${labels[status] || status}`, () => updateStatus.mutate({ id, status: prev }))
  }, [allTasks, updateStatus, showUndo])

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

  // PI slug for "Waiting On" filter — uses auth if available, else defaults to 'nick-ingraham'
  const piSlug = currentUser || 'nick-ingraham'

  // Quick date filter
  const quickFiltered = useMemo(() => {
    // "Waiting On" uses allTasks — shows tasks delegated to others, regardless of Mine/All toggle
    if (quickFilter === 'waiting_on') {
      return allTasks
        .filter(t => !t.completed && t.assignee !== piSlug && (t.status === 'todo' || t.status === 'in_progress' || t.status === 'waiting_external'))
        .sort((a, b) => {
          // Sort by staleness: tasks with oldest updated_at first (most stale at top)
          const aDate = a.updated_at || a.created_at
          const bDate = b.updated_at || b.created_at
          return aDate.localeCompare(bDate)
        })
    }
    const base = showCompleted ? tasks : tasks.filter((t) => !t.completed)
    if (quickFilter === 'all') return base
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)
    switch (quickFilter) {
      case 'today': return base.filter(t => t.due_date && new Date(t.due_date + 'T12:00:00') >= today && new Date(t.due_date + 'T12:00:00') < tomorrow)
      case 'this_week': return base.filter(t => t.due_date && new Date(t.due_date + 'T12:00:00') >= today && new Date(t.due_date + 'T12:00:00') < weekEnd)
      case 'overdue': return base.filter(t => !t.completed && t.due_date && new Date(t.due_date + 'T23:59:59') < now)
      case 'no_date': return base.filter(t => !t.due_date)
      default: return base
    }
  }, [tasks, allTasks, showCompleted, quickFilter, piSlug])
  const displayTasks = quickFiltered

  // ── Keyboard shortcut state ──────────────────────────────────
  const [focusedTaskIndex, setFocusedTaskIndex] = useState(-1)

  const isListView = view === 'list'

  // Focused task derived from index — works in all groupBy modes using flat displayTasks order
  const focusedTask = useMemo(() => {
    if (!isListView) return null
    if (focusedTaskIndex < 0 || focusedTaskIndex >= displayTasks.length) return null
    return displayTasks[focusedTaskIndex]
  }, [isListView, focusedTaskIndex, displayTasks])

  // Cycle status for focused task: todo → in_progress → done
  const STATUS_CYCLE: Record<string, string> = { todo: 'in_progress', in_progress: 'done', done: 'todo', blocked: 'todo', waiting_external: 'todo' }
  const cycleStatus = useCallback(() => {
    if (!focusedTask) return
    const next = STATUS_CYCLE[focusedTask.status] ?? 'in_progress'
    handleStatusChange(focusedTask.id, next)
  }, [focusedTask]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelectFocused = useCallback(() => {
    if (!focusedTask) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(focusedTask.id)) next.delete(focusedTask.id)
      else next.add(focusedTask.id)
      return next
    })
  }, [focusedTask])

  const openDetailForFocused = useCallback(() => {
    if (focusedTask) setSelectedTask(focusedTask)
  }, [focusedTask])

  const closeOverlay = useCallback(() => {
    if (selectedTask) setSelectedTask(null)
    else if (showCreate) setShowCreate(false)
  }, [selectedTask, showCreate])

  const createTaskShortcut = useCallback(() => setShowCreate(true), [])

  const snoozeFocused = useCallback(() => {
    if (!focusedTask || !focusedTask.due_date) return
    const d = new Date(focusedTask.due_date + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    handleFieldChange(focusedTask.id, 'due_date', newDate)
    showUndo(`Snoozed to ${newDate}`, () => handleFieldChange(focusedTask.id, 'due_date', focusedTask.due_date))
  }, [focusedTask]) // eslint-disable-line react-hooks/exhaustive-deps

  const assignFocused = useCallback(() => {
    const row = document.querySelector('.task-row-focused .inline-assignee-btn')
    if (row) (row as HTMLButtonElement).click()
  }, [])

  // Helper: set focused index by task ID (used by grouped view when user clicks a row)
  const handleFocusById = useCallback((id: string) => {
    const idx = displayTasks.findIndex(t => t.id === id)
    if (idx >= 0) setFocusedTaskIndex(idx)
  }, [displayTasks])

  useTaskKeyboardShortcuts({
    taskCount: isListView ? displayTasks.length : 0,
    focusedIndex: focusedTaskIndex,
    setFocusedIndex: setFocusedTaskIndex,
    peekOpen: false,
    togglePeek: openDetailForFocused,
    openDetail: openDetailForFocused,
    cycleStatus,
    toggleSelect: toggleSelectFocused,
    isBlocked: !!selectedTask || showCreate,
    closeOverlay,
    createTask: createTaskShortcut,
    snoozeFocused,
    assignFocused,
  })

  // Quick filter counts for pills
  const filterCounts = useMemo(() => {
    const active = tasks.filter(t => !t.completed)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)
    return {
      today: active.filter(t => t.due_date && new Date(t.due_date + 'T12:00:00') >= today && new Date(t.due_date + 'T12:00:00') < tomorrow).length,
      this_week: active.filter(t => t.due_date && new Date(t.due_date + 'T12:00:00') >= today && new Date(t.due_date + 'T12:00:00') < weekEnd).length,
      overdue: active.filter(t => t.due_date && new Date(t.due_date + 'T23:59:59') < now).length,
      no_date: active.filter(t => !t.due_date).length,
      waiting_on: allTasks.filter(t => !t.completed && t.assignee !== piSlug && (t.status === 'todo' || t.status === 'in_progress' || t.status === 'waiting_external')).length,
    }
  }, [tasks, allTasks, piSlug])

  // "Focus Next" — smart scoring: urgency × priority × freshness
  // Returns top 3 auto-suggestions; user can pin up to 5 total
  const FOCUS_MAX = 5
  const FOCUS_AUTO = 3

  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('mytasks-focus-pinned')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  // Persist pinned to localStorage
  useEffect(() => {
    localStorage.setItem('mytasks-focus-pinned', JSON.stringify(pinnedIds))
  }, [pinnedIds])

  const scoredTasks = useMemo(() => {
    const active = tasks.filter(t => !t.completed && t.status !== 'blocked' && t.status !== 'waiting_external')
    if (active.length === 0) return []
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return active.map(t => {
      let score = 0
      const pWeight: Record<string, number> = { urgent: 40, high: 25, medium: 10, low: 2 }
      score += pWeight[t.priority] ?? 10
      if (t.due_date) {
        const due = new Date(t.due_date + 'T12:00:00')
        const daysUntil = (due.getTime() - today.getTime()) / 86400000
        if (daysUntil < 0) score += 50 + Math.min(Math.abs(daysUntil) * 3, 30)
        else if (daysUntil <= 1) score += 35
        else if (daysUntil <= 3) score += 20
        else if (daysUntil <= 7) score += 10
      }
      if (t.status === 'in_progress') score += 15
      return { task: t, score }
    }).sort((a, b) => b.score - a.score)
  }, [tasks])

  // Merge: pinned tasks first (in order), then auto-suggestions to fill up to FOCUS_MAX
  const focusTasks = useMemo(() => {
    // Resolve pinned (filter out completed/deleted)
    const validPinned = pinnedIds
      .map(id => tasks.find(t => t.id === id && !t.completed))
      .filter(Boolean) as TaskRow[]
    // Auto-suggest top N, excluding already pinned
    const pinnedSet = new Set(pinnedIds)
    const autoSuggested = scoredTasks
      .filter(s => !pinnedSet.has(s.task.id))
      .slice(0, Math.max(0, FOCUS_AUTO - validPinned.length))
      .map(s => s.task)
    return [...validPinned, ...autoSuggested].slice(0, FOCUS_MAX)
  }, [pinnedIds, scoredTasks, tasks])

  const focusPinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])

  const pinTask = useCallback((id: string) => {
    setPinnedIds(prev => {
      if (prev.includes(id)) return prev
      if (prev.length >= FOCUS_MAX) return prev
      return [...prev, id]
    })
    showUndo('Pinned to Focus Next', () => {
      setPinnedIds(prev => prev.filter(p => p !== id))
    })
  }, [showUndo])

  const unpinTask = useCallback((id: string) => {
    setPinnedIds(prev => prev.filter(p => p !== id))
  }, [])

  const moveFocusTask = useCallback((fromIndex: number, toIndex: number) => {
    setPinnedIds(prev => {
      // Ensure all focus tasks are pinned for reordering
      const allFocusIds = focusTasks.map(t => t.id)
      const merged = [...new Set([...prev, ...allFocusIds])].slice(0, FOCUS_MAX)
      const result = [...merged]
      const [moved] = result.splice(fromIndex, 1)
      result.splice(toIndex, 0, moved)
      return result
    })
  }, [focusTasks])

  // Drag-and-drop sensors for Focus Next — TouchSensor for mobile parity (P1-R2-08)
  const focusSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const handleFocusDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = focusTasks.findIndex(t => t.id === active.id)
    const newIndex = focusTasks.findIndex(t => t.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      moveFocusTask(oldIndex, newIndex)
    }
  }, [focusTasks, moveFocusTask])

  // Task completion streak
  const streak = useMemo(() => {
    const completed = tasks.filter(t => t.completed && t.completed_at).map(t => {
      const d = new Date(t.completed_at!)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })
    if (completed.length === 0) return 0
    const uniqueDays = [...new Set(completed)].sort().reverse()
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    let count = 0
    let checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    // Allow starting from today or yesterday
    if (uniqueDays[0] !== todayStr) {
      checkDate.setDate(checkDate.getDate() - 1)
      const yStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`
      if (!uniqueDays.includes(yStr)) return 0
    }
    for (let i = 0; i < 365; i++) {
      const dStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`
      if (uniqueDays.includes(dStr)) {
        count++
        checkDate.setDate(checkDate.getDate() - 1)
      } else break
    }
    return count
  }, [tasks])

  // Dynamic page title with count
  useEffect(() => {
    const count = tasks.filter(t => !t.completed).length
    document.title = count > 0 ? `(${count}) Tasks | MN-CCORE` : 'Tasks | MN-CCORE'
    return () => { document.title = 'MN-CCORE Lab Hub' }
  }, [tasks])

  return (
    <div className="content-container">
      <PageHeader
        icon={<CheckSquare size={20} />}
        title="Tasks"
        subtitle={
          <span className="flex items-center gap-2">
            {pendingCount} active task{pendingCount !== 1 ? 's' : ''}
            {streak >= 2 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: 'var(--gold-emphasis)', color: 'var(--gold-on-emphasis)' }}>
                <Flame size={10} />
                {streak}d streak
              </span>
            )}
          </span>
        }
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
        {/* Controls: View + Group By + Sort By */}
        <div className="flex items-center gap-3 flex-wrap">
          <ToggleButton active={view === 'list'} onClick={() => setView('list')}>
            <List size={14} />
            List
          </ToggleButton>
          <ViewDropdown view={view} setView={setView} views={alternateViews} />

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>Group by:</span>
            <select
              aria-label="Group tasks by"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{
                fontSize: '12px',
                color: groupBy !== 'none' ? 'var(--teal)' : 'var(--slate)',
                backgroundColor: groupBy !== 'none' ? 'var(--teal-hover)' : 'transparent',
                borderColor: groupBy !== 'none' ? 'var(--teal)' : 'var(--border-subtle)',
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
            <span className="text-[11px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>Sort:</span>
            <select
              aria-label="Sort tasks by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{
                fontSize: '12px',
                color: 'var(--slate)',
                borderColor: 'var(--border-subtle)',
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
                border: `1px solid ${showCompleted ? 'rgba(34,197,94,0.3)' : 'var(--border-subtle)'}`,
                cursor: 'pointer',
                opacity: showCompleted ? 1 : 0.85,
              }}
            >
              <CheckCircle2 size={10} />
              {showCompleted ? `Hide ${completedCount} done` : `Show ${completedCount} done`}
            </button>
          )}

          <DensityToggle value={density} onChange={setDensity} />
        </div>
      </PageHeader>

      {!currentUser && !showAllTasks && !bannerDismissed && (
        <div
          className="mt-4 px-4 rounded-lg border text-sm"
          style={{
            borderColor: 'var(--border-subtle)',
            borderLeftColor: 'var(--teal-subtle)',
            borderLeftWidth: 3,
            backgroundColor: 'var(--surface-1)',
            color: 'var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            height: 44,
          }}
        >
          <span>
            Showing all lab tasks. <a href="/api/auth/login" style={{ color: 'var(--teal)', fontWeight: 'var(--weight-ui)' as any, textDecoration: 'underline' }}>Sign in</a> with your @umn.edu account to see only your tasks.
          </span>
          <button
            onClick={() => {
              localStorage.setItem('hub-signin-banner-dismissed', 'true')
              setBannerDismissed(true)
            }}
            title="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--slate)',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              opacity: 0.85,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
            aria-label="Dismiss sign-in banner"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Scope toggle: Mine / All */}
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <div className="inline-flex items-center rounded-md overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setShowAllTasks(false)}
            style={{
              padding: 'var(--sp-xs) var(--sp-md)',
              fontSize: 'var(--text-small)',
              fontWeight: !showAllTasks ? 'var(--weight-ui)' : 'var(--weight-body)',
              background: !showAllTasks ? 'var(--teal-active)' : 'none',
              color: !showAllTasks ? 'var(--teal)' : 'var(--slate)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Mine
          </button>
          <button
            onClick={() => setShowAllTasks(true)}
            style={{
              padding: 'var(--sp-xs) var(--sp-md)',
              fontSize: 'var(--text-small)',
              fontWeight: showAllTasks ? 'var(--weight-ui)' : 'var(--weight-body)',
              background: showAllTasks ? 'var(--teal-active)' : 'none',
              color: showAllTasks ? 'var(--teal)' : 'var(--slate)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            All {allTasks.filter(t => !t.completed).length}
          </button>
        </div>
      </div>

      {/* Quick filter pills. R4-P2-08 partial — on ≤420px viewports the
          row scrolls horizontally instead of wrapping to 3 lines that
          push task rows below the fold. Full bottom-sheet drawer
          deferred; horizontal scroll is the 80% fix. */}
      <div className="quick-filter-row flex items-center gap-2 mt-2 flex-wrap sm:flex-wrap max-[420px]:flex-nowrap max-[420px]:overflow-x-auto max-[420px]:-mx-3 max-[420px]:px-3">
        {([
          { key: 'all' as QuickFilter, label: 'All', count: pendingCount },
          { key: 'today' as QuickFilter, label: 'Today', count: filterCounts.today },
          { key: 'this_week' as QuickFilter, label: 'This Week', count: filterCounts.this_week },
          { key: 'overdue' as QuickFilter, label: 'Overdue', count: filterCounts.overdue },
          { key: 'no_date' as QuickFilter, label: 'No Date', count: filterCounts.no_date },
          { key: 'waiting_on' as QuickFilter, label: 'Waiting On', count: filterCounts.waiting_on },
        ]).map(f => {
          const pillColor = f.key === 'overdue' ? { bg: 'rgba(122,0,25,0.1)', fg: 'var(--maroon)', border: 'rgba(122,0,25,0.3)' }
            : f.key === 'waiting_on' ? { bg: 'var(--gold-emphasis)', fg: 'var(--gold)', border: 'rgba(201,168,76,0.4)' }
            : { bg: 'var(--teal-active)', fg: 'var(--teal)', border: 'rgba(45,138,138,0.3)' }
          return (
          <button
            key={f.key}
            onClick={() => setQuickFilter(f.key)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: quickFilter === f.key ? pillColor.bg : 'transparent',
              color: quickFilter === f.key ? pillColor.fg : 'var(--slate)',
              border: `1px solid ${quickFilter === f.key ? pillColor.border : 'var(--border-subtle)'}`,
              cursor: 'pointer',
              opacity: quickFilter === f.key ? 1 : 0.85,
            }}
          >
            {f.label}
            {/* No opacity — teal count span at 0.9 fails AA on faint-teal
                active bg (4.32:1). Full opacity passes. r7 2026-04-22. */}
            {f.count > 0 && <span>{f.count}</span>}
          </button>
          )
        })}
      </div>

      {/* Status distribution bar */}
      {pendingCount > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 flex rounded-full overflow-hidden" style={{ height: 4, background: 'var(--border-subtle)' }}>
            {(() => {
              const active = tasks.filter(t => !t.completed)
              const todo = active.filter(t => t.status === 'todo').length
              const inProgress = active.filter(t => t.status === 'in_progress').length
              const blocked = active.filter(t => t.status === 'blocked').length
              const waitingExt = active.filter(t => t.status === 'waiting_external').length
              const total = active.length || 1
              return (
                <>
                  {inProgress > 0 && <div style={{ width: `${(inProgress / total) * 100}%`, background: 'var(--teal-solid)', transition: 'width 300ms ease' }} />}
                  {todo > 0 && <div style={{ width: `${(todo / total) * 100}%`, background: 'var(--slate)', opacity: 0.85, transition: 'width 300ms ease' }} />}
                  {waitingExt > 0 && <div style={{ width: `${(waitingExt / total) * 100}%`, background: 'var(--orange)', transition: 'width 300ms ease' }} />}
                  {blocked > 0 && <div style={{ width: `${(blocked / total) * 100}%`, background: 'var(--maroon-solid)', transition: 'width 300ms ease' }} />}
                </>
              )
            })()}
          </div>
          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
            {tasks.filter(t => !t.completed && t.status === 'in_progress').length} active
          </span>
        </div>
      )}

      {/* Focus Next — auto-suggest top 3, pin up to 5 (Mine view only) */}
      {focusTasks.length > 0 && quickFilter === 'all' && !showCompleted && !showAllTasks && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} style={{ color: 'var(--gold)' }} />
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--teal)' }}>
              Focus Next
            </span>
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
              {focusTasks.length}/{FOCUS_MAX}
            </span>
          </div>
          <DndContext sensors={focusSensors} collisionDetection={closestCenter} onDragEnd={handleFocusDragEnd}>
            <SortableContext items={focusTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1">
                {focusTasks.map((task, idx) => (
                  <SortableFocusItem
                    key={task.id}
                    task={task}
                    index={idx}
                    isPinned={focusPinnedSet.has(task.id)}
                    onSelect={setSelectedTask}
                    onPin={pinTask}
                    onUnpin={unpinTask}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Waiting On summary — shown when filter is active */}
      {quickFilter === 'waiting_on' && displayTasks.length > 0 && (
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'rgba(201,168,76,0.3)', backgroundColor: 'var(--gold-hover)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Hourglass size={14} style={{ color: 'var(--gold)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              Waiting On Others
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--gold)', backgroundColor: 'var(--gold-emphasis)' }}>
              {displayTasks.length} task{displayTasks.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {displayTasks.slice(0, 5).map(task => {
              const now = new Date()
              const lastUpdate = task.updated_at || task.created_at
              const daysWaiting = Math.floor((now.getTime() - new Date(lastUpdate).getTime()) / 86400000)
              const person = getPersonInfo(task.assignee)
              return (
                <div key={task.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink)' }}>
                  <span className="w-14 flex-shrink-0 text-right font-medium" style={{
                    color: daysWaiting >= 14 ? 'var(--maroon)' : daysWaiting >= 7 ? 'var(--orange)' : daysWaiting >= 3 ? 'var(--gold)' : 'var(--slate)',
                    fontSize: '10px',
                  }}>
                    {daysWaiting}d waiting
                  </span>
                  <span className="w-20 truncate flex-shrink-0" style={{ color: 'var(--slate)', fontSize: '10px' }}>
                    {person.name.split(' ')[0]}
                  </span>
                  <span className="truncate" style={{ cursor: 'pointer' }} onClick={() => setSelectedTask(task)}>
                    <TaskTitle title={task.title} fallback={task.description} showChip={false} />
                  </span>
                </div>
              )
            })}
            {displayTasks.length > 5 && (
              <span className="text-[10px] mt-1" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                +{displayTasks.length - 5} more in the table below
              </span>
            )}
          </div>
        </div>
      )}

      {/* Content — no minHeight reservation so short task lists don't leave
          a large empty box below. Skeleton already reserves space during
          load so CLS is bounded by the skeleton→content swap. GH #23.
          Supersedes CLAUDE.md rule #16's stability requirement. r7 2026-04-23. */}
      <div className={`mt-5 ${densityClass(density)}`}>
        {isLoading ? (
          <TableSkeleton rows={12} cols={5} />
        ) : displayTasks.length === 0 && quickFilter !== 'waiting_on' ? (
          <EmptyState
            icon={<CheckCircle2 size={40} />}
            title={currentUser ? 'All caught up!' : 'No tasks yet'}
            subtitle={currentUser
              ? streak >= 2
                ? `Zero active tasks. ${streak}-day completion streak — keep it going!`
                : completedCount > 0
                  ? `Zero active tasks. ${completedCount} completed recently.`
                  : 'You have no active tasks assigned to you.'
              : <><a href="/api/auth/login" style={{ color: 'var(--teal)', fontWeight: 'var(--weight-ui)' as any, textDecoration: 'underline' }}>Sign in</a> to see your personal tasks, or create one below.</>}
            action={{ label: 'Create a task', onClick: () => setShowCreate(true) }}
          />
        ) : view !== 'list' ? (
          <>
            {view === 'board' && <Suspense fallback={<TableSkeleton />}><TaskBoardView tasks={displayTasks} onStatusChange={handleStatusChange} onSelect={setSelectedTask} /></Suspense>}
            {view === 'standup' && <Suspense fallback={<TableSkeleton />}><TaskStandUpView tasks={displayTasks} onStatusChange={handleStatusChange} onOpenDetail={setSelectedTask} /></Suspense>}
            {view === 'timeline' && <Suspense fallback={<TableSkeleton />}><TaskTimelineView tasks={displayTasks} onStatusChange={handleStatusChange} onOpenDetail={setSelectedTask} /></Suspense>}
          </>
        ) : groupBy === 'none' ? (
          <TaskGridView tasks={sortTasks(displayTasks, sortBy)} onStatusChange={handleStatusChange} onFieldChange={handleFieldChange} onOpenDetail={setSelectedTask} selectedIds={selectedIds} onToggleSelect={(id) => setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })} onPinToFocus={pinTask} pinnedIds={focusPinnedSet} focusedIndex={focusedTaskIndex} onFocusIndex={setFocusedTaskIndex} />
        ) : (
          <GroupedTaskList tasks={displayTasks} groupBy={groupBy} sortBy={sortBy} onStatusChange={handleStatusChange} onFieldChange={handleFieldChange} onOpenDetail={setSelectedTask} selectedIds={selectedIds} onToggleSelect={(id) => setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })} onPinToFocus={pinTask} pinnedIds={focusPinnedSet} focusedTaskId={focusedTask?.id ?? null} onFocusId={handleFocusById} />
        )}
      </div>

      {/* Create modal */}
      <CreateTaskModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />

      {/* Detail panel — lazy loaded (M-30) */}
      {selectedTask && (
        <Suspense fallback={null}>
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
        </Suspense>
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

// ── Sortable Focus Item ──────────────────────────────────────
function SortableFocusItem({ task, index, isPinned, onSelect, onPin, onUnpin }: {
  task: TaskRow
  index: number
  isPinned: boolean
  onSelect: (task: TaskRow) => void
  onPin: (id: string) => void
  onUnpin: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 'var(--z-sticky)' : 'auto',
    background: isPinned
      ? 'linear-gradient(135deg, rgba(45,138,138,0.06), rgba(201,168,76,0.06))'
      : 'linear-gradient(135deg, rgba(45,138,138,0.02), rgba(201,168,76,0.02))',
    borderColor: isPinned ? 'rgba(45,138,138,0.25)' : 'var(--teal-emphasis)',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors"
    >
      {/* Drag handle — owns the dnd-kit attributes/listeners so the wrapper
          div stays role-free (axe nested-interactive, 2026-04-18). */}
      <button
        {...attributes}
        {...listeners}
        aria-label="Reorder task"
        className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0"
        style={{ background: 'none', border: 'none', padding: '2px', color: 'var(--slate)' }}
      >
        <GripVertical size={14} />
      </button>
      <span className="text-[10px] font-medium" style={{ color: 'var(--teal)', flexShrink: 0, width: '14px', textAlign: 'center' }}>
        {index + 1}
      </span>
      <div
        className="min-w-0 flex-1"
        onClick={() => onSelect(task)}
        style={{ cursor: 'pointer' }}
      >
        <div className="text-sm truncate" style={{ color: 'var(--ink)' }}>
          <TaskTitle title={task.title} fallback={task.description} />
        </div>
      </div>
      {task.due_date && (
        <span className="text-[10px] flex-shrink-0" style={{ color: new Date(task.due_date + 'T23:59:59') < new Date() ? 'var(--maroon)' : 'var(--slate)', opacity: 0.85 }}>
          {task.due_date}
        </span>
      )}
      {/* Pin/unpin button */}
      <button
        onClick={(e) => { e.stopPropagation(); isPinned ? onUnpin(task.id) : onPin(task.id) }}
        aria-label={isPinned ? 'Unpin from focus' : 'Pin to focus'}
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity flex items-center justify-center"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: isPinned ? 'var(--teal)' : 'var(--slate)', minHeight: 44, minWidth: 44, flexShrink: 0 }}
        title={isPinned ? 'Unpin from focus' : 'Pin to focus'}
      >
        {isPinned ? <X size={14} /> : <Pin size={14} />}
      </button>
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
function GroupedTaskList({ tasks, groupBy, sortBy, onStatusChange, onFieldChange, onOpenDetail, selectedIds, onToggleSelect, onPinToFocus, pinnedIds, focusedTaskId, onFocusId }: {
  tasks: any[]
  groupBy: GroupBy
  sortBy: SortBy
  onStatusChange: (id: string, status: string) => void
  onFieldChange: (id: string, field: string, value: unknown) => void
  onOpenDetail?: (task: TaskRow) => void
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onPinToFocus?: (id: string) => void
  pinnedIds?: Set<string>
  focusedTaskId?: string | null
  onFocusId?: (id: string) => void
}) {
  const groups = useMemo(() => {
    const map = new Map<string, any[]>()
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    for (const task of tasks) {
      let key: string
      if (groupBy === 'due_date') {
        if (!task.due_date) key = 'No Due Date'
        else {
          const d = new Date(task.due_date + 'T12:00:00')
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

    // P2-03: when OVERDUE has >15 items, split it by age so a 74-day-stale
    // tracker no longer scans the same as a 3-day-stale galley proof.
    if (groupBy === 'due_date') {
      const overdue = map.get('Overdue')
      if (overdue && overdue.length > 15) {
        const critical: any[] = []
        const urgent: any[] = []
        const recent: any[] = []
        for (const t of overdue) {
          const due = new Date(t.due_date + 'T12:00:00')
          const days = Math.floor((today.getTime() - due.getTime()) / 86400000)
          if (days >= 60) critical.push(t)
          else if (days >= 30) urgent.push(t)
          else recent.push(t)
        }
        map.delete('Overdue')
        if (critical.length > 0) map.set('Critical · 60d+', critical)
        if (urgent.length > 0) map.set('Urgent · 30–60d', urgent)
        if (recent.length > 0) map.set('Recent · <30d', recent)
      }
    }

    // Sort groups by a sensible order
    const entries = [...map.entries()]
    if (groupBy === 'due_date') {
      const order = [
        'Critical · 60d+', 'Urgent · 30–60d', 'Recent · <30d',
        'Overdue', 'Today', 'This Week', 'Later', 'No Due Date',
      ]
      entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    } else if (groupBy === 'priority') {
      const order = ['Urgent', 'High', 'Medium', 'Low']
      entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    }

    return entries.map(([label, items]) => ({ label, items: sortTasks(items, sortBy) }))
  }, [tasks, groupBy, sortBy])

  const groupColors: Record<string, string> = {
    'Overdue': 'var(--maroon)',
    'Critical · 60d+': 'var(--maroon)',
    'Urgent · 30–60d': 'var(--orange)',
    'Recent · <30d': 'var(--slate)',
    'Today': 'var(--teal)',
    'This Week': 'var(--gold)',
    'Urgent': 'var(--maroon)',
    'High': 'var(--orange)',
    'In Progress': 'var(--teal)',
    'Blocked': 'var(--maroon)',
    'Waiting External': 'var(--orange)',
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ label, items }) => (
        <div key={label}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: groupColors[label] || 'var(--slate)', opacity: groupColors[label] ? 1 : 0.85 }} />
            <h3 className="text-xs font-normal uppercase tracking-wider" style={{ color: groupColors[label] || 'var(--ink)' }}>
              {label}
            </h3>
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
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
                  <div style={{ width: 40, height: 3, borderRadius: 'var(--radius-sm)', background: 'var(--border-subtle)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 'var(--radius-sm)', background: 'var(--green)', transition: 'width 300ms ease' }} />
                  </div>
                  <span className="text-[10px]" style={{ color: 'var(--green)', opacity: 0.85 }}>{pct}%</span>
                </div>
              )
            })()}
          </div>
          <TaskGridView
            tasks={items}
            onStatusChange={onStatusChange}
            onFieldChange={onFieldChange}
            onOpenDetail={onOpenDetail}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onPinToFocus={onPinToFocus}
            pinnedIds={pinnedIds}
            focusedIndex={focusedTaskId != null ? items.findIndex(t => t.id === focusedTaskId) : undefined}
            onFocusIndex={onFocusId ? (idx) => { if (idx >= 0 && idx < items.length) onFocusId(items[idx].id) } : undefined}
          />
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
          backgroundColor: currentView ? 'var(--teal-active)' : 'transparent',
          borderColor: currentView ? 'var(--teal)' : 'var(--border-subtle)',
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
          style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }}
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
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--slate)', opacity: 0.85 }}>
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

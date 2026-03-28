import { useState, useRef, useEffect } from 'react'
import { Plus, List, LayoutGrid, Users, GanttChartSquare, ChevronDown, Filter, FileText } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import TaskFilters from '../../components/tasks/TaskFilters'
import TaskListView from '../../components/tasks/TaskListView'
import TaskBoardView from '../../components/tasks/TaskBoardView'
import TaskStandUpView from '../../components/tasks/TaskStandUpView'
import TaskTimelineView from '../../components/tasks/TaskTimelineView'
import TaskDetailPanel from '../../components/tasks/TaskDetailPanel'
import CreateTaskModal from '../../components/tasks/CreateTaskModal'
import ToggleButton from '../../components/ToggleButton'
import { useTasks } from '../../hooks/useApiData'
import { useCreateTask, useUpdateTaskStatus } from '../../hooks/useMutations'
import type { TaskRow } from '../../lib/api'

type ViewMode = 'list' | 'board' | 'standup' | 'timeline'

const alternateViews: { key: ViewMode; label: string; icon: typeof List; description: string }[] = [
  { key: 'board', label: 'Board', icon: LayoutGrid, description: 'Kanban columns by status' },
  { key: 'standup', label: 'By Person', icon: Users, description: 'Tasks grouped by assignee' },
  { key: 'timeline', label: 'Timeline', icon: GanttChartSquare, description: 'Tasks on a time axis' },
]

export default function Tasks() {
  const [view, setView] = useState<ViewMode>('list')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  const [showViewMenu, setShowViewMenu] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const [filters, setFilters] = useState({
    assignee: '',
    status: '',
    priority: '',
    project: '',
  })

  // Close view menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setShowViewMenu(false)
      }
    }
    if (showViewMenu) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showViewMenu])

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

  const pendingCount = tasks.filter((t) => !t.completed).length
  const currentViewLabel = view === 'list' ? 'List' : view === 'board' ? 'Board' : view === 'standup' ? 'By Person' : 'Timeline'
  const CurrentViewIcon = view === 'list' ? List : view === 'board' ? LayoutGrid : view === 'standup' ? Users : GanttChartSquare

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <SectionHeader
            title="All Tasks"
            subtitle={`${pendingCount} active across the lab — track, assign, and manage work`}
          />
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

      {/* View selector + Filters */}
      <div className="mt-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Primary: List view */}
          <ToggleButton active={view === 'list'} onClick={() => setView('list')}>
            <List size={14} />
            List
          </ToggleButton>

          {/* Views dropdown for alternate views */}
          <div className="relative" ref={viewMenuRef}>
            <button
              onClick={() => setShowViewMenu(!showViewMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
              style={{
                fontFamily: 'var(--font-sans)',
                color: view !== 'list' ? 'var(--teal)' : 'var(--slate)',
                backgroundColor: view !== 'list' ? 'rgba(45,138,138,0.08)' : 'transparent',
                borderColor: view !== 'list' ? 'var(--teal)' : 'var(--border-light)',
                cursor: 'pointer',
              }}
            >
              {view !== 'list' && <CurrentViewIcon size={13} />}
              {view !== 'list' ? currentViewLabel : 'More views'}
              <ChevronDown size={12} />
            </button>

            {showViewMenu && (
              <div
                className="absolute top-full left-0 mt-1 rounded-lg border shadow-lg z-50 py-1 min-w-[200px]"
                style={{ backgroundColor: 'var(--card-bg, #fff)', borderColor: 'var(--border-light)' }}
              >
                {alternateViews.map((v) => {
                  const Icon = v.icon
                  return (
                    <button
                      key={v.key}
                      onClick={() => { setView(v.key); setShowViewMenu(false) }}
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

          {/* Spacer */}
          <div className="flex-1" />

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
        ) : tasks.length === 0 ? (
          <div className="text-center py-16">
            <FileText size={40} style={{ color: 'var(--border-light)', margin: '0 auto 12px' }} />
            <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
              No tasks yet
            </p>
            <p className="text-xs mt-1 max-w-xs mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
              Tasks created in meetings, assigned by PIs, or added by team members will appear here.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'rgba(45,138,138,0.08)', color: 'var(--teal)', border: 'none', cursor: 'pointer' }}
            >
              <Plus size={14} />
              Create first task
            </button>
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

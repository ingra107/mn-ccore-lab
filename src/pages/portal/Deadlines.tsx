import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Clock, List, GanttChartSquare, AlertTriangle, FolderKanban, Pencil, X, Check, GitBranch, Presentation, Download } from 'lucide-react'
import DensityToggle, { useDensity, densityClass } from '../../components/DensityToggle'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import ToggleButton from '../../components/ToggleButton'
import Avatar from '../../components/Avatar'
import InlineSelect from '../../components/InlineSelect'
import InlineDatePicker from '../../components/InlineDatePicker'
import { useUndoToast } from '../../components/UndoToast'
import BulkActionToolbar from '../../components/tasks/BulkActionToolbar'
import { ColumnHeader, TableContainer } from '../../components/table'
import { useTasks, useUpcomingConferences, useProjects } from '../../hooks/useApiData'
import { useUpdateTaskStatus, useUpdateTask, useBulkUpdateTasks } from '../../hooks/useMutations'
import { useGrantTimeline } from '../../hooks/useGrantTimeline'
import { getPersonInfo } from '../../data/team'
import { formatShortDate } from '../../lib/dateUtils'
import { PATHS } from '../../constants/paths'
import { useQueryClient } from '@tanstack/react-query'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import TaskDetailPanel from '../../components/tasks/TaskDetailPanel'
import PageTooltip from '../../components/PageTooltip'
import type { TaskRow } from '../../lib/api'

interface DeadlineItem {
  id: string
  title: string
  due_date: string
  type: 'task' | 'milestone'
  assignee?: string
  project?: string
  status: string
  priority?: string
  isOverdue: boolean
  daysUntil: number
  future_note?: string | null
  future_note_author?: string | null
}

type ViewMode = 'list' | 'timeline'

export default function Deadlines() {
  const [view, setView] = useState<ViewMode>('list')
  const [filterType, setFilterType] = useState<string>('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [density, setDensity] = useDensity()
  type DeadlineSortKey = 'title' | 'project' | 'due_date' | 'assignee' | 'status' | 'type'
  const [sortKey, setSortKey] = useState<DeadlineSortKey>('due_date')
  const [sortAsc, setSortAsc] = useState(true)
  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key as DeadlineSortKey); setSortAsc(true) }
  }

  const { data: tasks = [], isLoading: tasksLoading } = useTasks()
  const { data: grants = [], isLoading: grantsLoading } = useGrantTimeline()
  const { data: projectsList = [] } = useProjects()
  const projectMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projectsList) {
      if (p.slug) map.set(p.slug, p.short_name || p.title)
    }
    return map
  }, [projectsList])
  const updateTaskStatus = useUpdateTaskStatus()
  const updateTask = useUpdateTask()
  const bulkUpdate = useBulkUpdateTasks()
  const { showUndo } = useUndoToast()
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const toggleSelect = (id: string) => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const isLoading = tasksLoading || grantsLoading

  const handleFieldChange = useCallback((id: string, field: string, value: unknown) => {
    updateTask.mutate({ id, fields: { [field]: value } })
  }, [updateTask])

  const handleBulkAction = useCallback((action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete' | 'snooze' | 'status', value?: string) => {
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
  }, [selectedIds, tasks, handleFieldChange, showUndo, bulkUpdate])

  const handleOpenDetail = useCallback((item: DeadlineItem) => {
    if (item.type !== 'task') return
    const task = tasks.find(t => t.id === item.id)
    if (task) setSelectedTask(task)
  }, [tasks])

  const handleStatusChange = useCallback((id: string, newStatus: string, prevStatus: string) => {
    updateTaskStatus.mutate({ id, status: newStatus })
    const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked', waiting_external: 'Waiting (External)' }
    showUndo(`Status → ${labels[newStatus] || newStatus}`, () => updateTaskStatus.mutate({ id, status: prevStatus }))
  }, [updateTaskStatus, showUndo])

  const handleDueDateChange = useCallback((id: string, newDate: string | null) => {
    const task = tasks.find(t => t.id === id)
    const prevDate = task?.due_date ?? null
    updateTask.mutate({ id, fields: { due_date: newDate } })
    showUndo(
      newDate ? `Due → ${newDate}` : 'Cleared due date',
      () => updateTask.mutate({ id, fields: { due_date: prevDate } }),
    )
  }, [tasks, updateTask, showUndo])

  // Aggregate all deadlines
  const deadlines = useMemo(() => {
    const now = new Date()
    const items: DeadlineItem[] = []

    // Tasks with due dates
    for (const task of tasks) {
      if (!task.due_date) continue
      const dueDate = new Date(task.due_date + 'T23:59:59')
      const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      items.push({
        id: task.id,
        title: task.title || task.description,
        due_date: task.due_date,
        type: 'task',
        assignee: task.assignee,
        project: task.project_id || undefined,
        status: task.status,
        priority: task.priority,
        isOverdue: !task.completed && dueDate < now,
        daysUntil,
      })
    }

    // Grant milestones
    for (const grant of grants) {
      for (const milestone of grant.milestones || []) {
        if (!milestone.target_date) continue
        const dueDate = new Date(milestone.target_date + 'T23:59:59')
        const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        items.push({
          id: milestone.id,
          title: `${grant.mechanism}: ${milestone.title}`,
          due_date: milestone.target_date,
          type: 'milestone',
          project: grant.title,
          status: milestone.status,
          isOverdue: milestone.status !== 'completed' && dueDate < now,
          daysUntil,
          future_note: milestone.future_note,
          future_note_author: milestone.future_note_author,
        })
      }
    }

    // Filter
    const filtered = filterType
      ? items.filter((d) => d.type === filterType)
      : items

    // Sort by date
    return filtered.sort((a, b) => a.due_date.localeCompare(b.due_date))
  }, [tasks, grants, filterType])

  // Group by time period
  const overdue = deadlines.filter((d) => d.isOverdue && d.status !== 'done' && d.status !== 'completed')
  const thisWeek = deadlines.filter((d) => !d.isOverdue && d.daysUntil >= 0 && d.daysUntil <= 7 && d.status !== 'done')
  const nextWeek = deadlines.filter((d) => d.daysUntil > 7 && d.daysUntil <= 14 && d.status !== 'done')
  const later = deadlines.filter((d) => d.daysUntil > 14 && d.status !== 'done')
  const completed = deadlines.filter((d) => d.status === 'done' || d.status === 'completed')

  useListKeyboardNav({
    itemCount: view === 'list' ? deadlines.length : 0,
    focusedIndex,
    setFocusedIndex,
  })

  // Dynamic page title
  useEffect(() => {
    document.title = overdue.length > 0
      ? `Deadlines (${overdue.length} overdue) | MN-CCORE`
      : 'Deadlines | MN-CCORE'
    return () => { document.title = 'MN-CCORE Lab Hub' }
  }, [overdue.length])

  return (
    <div>
      <PageHeader
        icon={<Clock size={20} />}
        title="Deadlines & Milestones"
        subtitle={overdue.length > 0
          ? `${overdue.length} overdue, ${thisWeek.length + nextWeek.length} upcoming`
          : `${thisWeek.length + nextWeek.length} upcoming`
        }
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {([
              { key: 'list' as ViewMode, label: 'List', icon: List },
              { key: 'timeline' as ViewMode, label: 'Timeline', icon: GanttChartSquare },
            ]).map((v) => {
              const Icon = v.icon
              const active = view === v.key
              return (
                <ToggleButton
                  key={v.key}
                  active={active}
                  onClick={() => setView(v.key)}
                >
                  <Icon size={14} />
                  {v.label}
                </ToggleButton>
              )
            })}
          </div>
          <Link
            to={PATHS.deadlineCascade}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
            style={{
              fontSize: '12px',
              color: 'var(--teal)',
              border: '1px solid rgba(45,138,138,0.2)',
              textDecoration: 'none',
            }}
          >
            <GitBranch size={12} />
            Cascade View
          </Link>
          <button
            onClick={() => {
              const items = [...overdue, ...thisWeek, ...nextWeek, ...later].filter(d => d.status !== 'done')
              let ical = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//MN-CCORE//Deadlines//EN\nCALSCALE:GREGORIAN\n'
              for (const d of items) {
                const dateStr = d.due_date.replace(/-/g, '')
                ical += `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${dateStr}\nSUMMARY:${d.title.replace(/[,;\\]/g, ' ')}\nDESCRIPTION:${d.type} - ${d.status}\nUID:${d.id}@mn-ccore-deadlines\nEND:VEVENT\n`
              }
              ical += 'END:VCALENDAR'
              const blob = new Blob([ical], { type: 'text/calendar' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'mnccore-deadlines.ics'
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs transition-colors border"
            style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', background: 'none', cursor: 'pointer', opacity: 0.85 }}
            title="Export deadlines as .ics calendar file"
            aria-label="Export to .ics"
          >
            <Download size={12} />
            Export
          </button>
          <PageTooltip id="deadlines-timeline-hint" text="Switch to Timeline for a visual map" />
          <DensityToggle value={density} onChange={setDensity} />

          <select
            aria-label="Filter deadlines by type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-full border px-3 py-1.5 text-xs"
            style={{
              fontSize: '12px',
              color: filterType ? 'var(--teal)' : 'var(--slate)',
              backgroundColor: filterType ? 'var(--teal-hover)' : 'transparent',
              borderColor: filterType ? 'var(--teal)' : 'var(--border-subtle)',
              cursor: 'pointer',
              appearance: 'none' as const,
              WebkitAppearance: 'none' as const,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
              paddingRight: '24px',
            }}
          >
            <option value="">All Types</option>
            <option value="task">Tasks</option>
            <option value="milestone">Grant Milestones</option>
          </select>
        </div>
      </PageHeader>

      {/* Urgent deadline banner — CLS fix R7: reserve 72px slot */}
      <div style={{ minHeight: '72px', marginTop: 'var(--sp-md)', contain: 'layout' }}>
      {(() => {
        const nextUrgent = [...overdue, ...thisWeek].filter(d => d.status !== 'done' && d.status !== 'completed')[0]
        if (!nextUrgent) return null
        const isOver = nextUrgent.isOverdue
        const daysText = isOver
          ? `${Math.abs(nextUrgent.daysUntil)}d overdue`
          : nextUrgent.daysUntil === 0 ? 'Due today' : nextUrgent.daysUntil === 1 ? 'Due tomorrow' : `${nextUrgent.daysUntil}d away`
        return (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg border"
            style={{
              background: isOver ? 'var(--maroon-hover)' : 'var(--teal-hover)',
              borderColor: isOver ? 'rgba(122,0,25,0.2)' : 'rgba(45,138,138,0.2)',
            }}
          >
            <AlertTriangle size={16} style={{ color: isOver ? 'var(--maroon)' : 'var(--gold)', flexShrink: 0 }} />
            <div className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--ink)' }}>
              {nextUrgent.title}
            </div>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: isOver ? 'rgba(122,0,25,0.1)' : 'var(--teal-active)',
                color: isOver ? 'var(--maroon)' : 'var(--teal)',
              }}
            >
              {daysText}
            </span>
          </div>
        )
      })()}
      </div>

      {/* Content — CLS fix (C8 R6): reserve viewport height AND render a skeleton whose
          structural layout (TableContainer + column header + N rows at row-height) mirrors the
          final list layout pixel-for-pixel. Prevents layout thrash when data swaps in. */}
      <div className="mt-5" style={{ minHeight: 'calc(100vh - 280px)', contain: 'layout' }}>
        {isLoading ? (
          <TableContainer className={densityClass(density)}>
            <div
              className="hidden sm:grid"
              style={{
                gridTemplateColumns: '32px minmax(200px, 3fr) 140px 120px 100px 100px 80px',
                padding: 'var(--sp-sm) var(--sp-lg)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
              aria-hidden="true"
            >
              <div />
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: 10, width: '50%', background: 'var(--surface-2)', opacity: 0.85, borderRadius: 'var(--radius-sm)' }} />
              ))}
            </div>
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={`skel-${i}`}
                style={{
                  height: 'var(--row-height)',
                  boxSizing: 'border-box',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 var(--sp-lg)',
                  gap: 'var(--sp-md)',
                  opacity: 0.85,
                }}
                aria-hidden="true"
              >
                <div style={{ width: 16, height: 16, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }} />
                <div style={{ flex: 1, height: 12, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }} />
                <div style={{ width: 80, height: 12, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }} />
                <div style={{ width: 60, height: 12, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }} />
              </div>
            ))}
          </TableContainer>
        ) : view === 'list' ? (
          <TableContainer className={densityClass(density)}>
            {/* Column headers — hidden on mobile */}
            <div
              className="hidden sm:grid"
              style={{
                gridTemplateColumns: '32px minmax(200px, 3fr) 140px 120px 100px 100px 80px',
                padding: 'var(--sp-sm) var(--sp-lg)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div />
              {([
                { label: 'Title', key: 'title' as const },
                { label: 'Project', key: 'project' as const },
                { label: 'Due Date', key: 'due_date' as const },
                { label: 'Assignee', key: 'assignee' as const },
                { label: 'Status', key: 'status' as const },
                { label: 'Type', key: 'type' as const },
              ]).map((col) => (
                <ColumnHeader
                  key={col.key}
                  label={col.label}
                  sortKey={col.key}
                  currentSort={sortKey}
                  sortAsc={sortAsc}
                  onSort={handleSort}
                />
              ))}
            </div>

            {/* Grouped rows */}
            <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
              {[
                { title: 'Overdue', items: overdue, color: 'var(--maroon)' },
                { title: 'This Week', items: thisWeek, color: 'var(--teal)' },
                { title: 'Next Week', items: nextWeek, color: 'var(--gold)' },
                { title: 'Later', items: later, color: 'var(--slate)' },
                { title: `Completed (${completed.length})`, items: completed.slice(0, 5), color: 'var(--green)' },
              ].filter(g => g.items.length > 0).map((group) => (
                <motion.div key={group.title} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                  <DeadlineTableSection title={group.title} items={group.items} color={group.color} onStatusChange={handleStatusChange} onDueDateChange={handleDueDateChange} onOpenDetail={handleOpenDetail} projectMap={projectMap} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
                </motion.div>
              ))}
            </motion.div>

            {deadlines.length === 0 && (
              <EmptyState
                icon={<Clock size={40} />}
                title="The runway is clear"
                subtitle="Nothing due in the next 90 days. Enjoy the quiet — deadlines surface here as tasks and grant milestones land."
              />
            )}

            {/* Calculations row */}
            {deadlines.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--sp-xl)',
                  padding: 'var(--sp-sm) var(--sp-lg)',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--teal-hover)',
                }}
              >
                {[
                  { label: 'Total', value: deadlines.length },
                  ...(overdue.length > 0 ? [{ label: 'Overdue', value: overdue.length, color: 'var(--maroon)' }] : []),
                  { label: 'This Week', value: thisWeek.length },
                  { label: 'Next Week', value: nextWeek.length },
                  { label: 'Later', value: later.length },
                  { label: 'Done', value: completed.length, color: 'var(--green)' },
                ].map(s => (
                  <span key={s.label} style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                    {s.label}{' '}
                    <span style={{ fontWeight: 600, color: (s as any).color || 'var(--slate)', opacity: 1 }}>
                      {s.value}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </TableContainer>
        ) : (
          <DeadlineTimeline items={[...overdue, ...thisWeek, ...nextWeek, ...later]} />
        )}
      </div>

      {/* Upcoming Conferences */}
      <UpcomingConferencesSection />

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}

      <BulkActionToolbar
        selectedIds={selectedIds}
        selectedTasks={tasks.filter(t => selectedIds.has(t.id))}
        onClear={() => setSelectedIds(new Set())}
        onBulkAction={handleBulkAction}
        isUpdating={bulkUpdate.isPending}
      />
    </div>
  )
}

// ── Deadline Table Section (columnar) ────────────────────────

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do', color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', color: 'var(--teal)' },
  { value: 'waiting_external', label: 'Waiting External', color: 'var(--orange)' },
  { value: 'blocked', label: 'Blocked', color: 'var(--maroon)' },
  { value: 'done', label: 'Done', color: 'var(--green)' },
]

// ── Reusable deadline item row ───────────────────────────────────────────────

function DeadlineItemRow({ item, onStatusChange, onDueDateChange, onOpenDetail, projectMap, selectedIds, onToggleSelect }: {
  item: DeadlineItem
  onStatusChange?: (id: string, newStatus: string, prevStatus: string) => void
  onDueDateChange?: (id: string, newDate: string | null) => void
  onOpenDetail?: (item: DeadlineItem) => void
  projectMap: Map<string, string>
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}) {
  const person = item.assignee ? getPersonInfo(item.assignee) : null
  const isDone = item.status === 'done' || item.status === 'completed'
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)', opacity: isDone ? 0.85 : 1 }}>
      {/* Desktop row — hidden on mobile */}
      <div
        className="deadline-list-row hidden sm:grid hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
        style={{
          gridTemplateColumns: '32px minmax(200px, 3fr) 140px 120px 100px 100px 80px',
          padding: `var(--row-padding-y, 8px) 16px`,
          alignItems: 'center',
        }}
      >
        {/* Checkbox */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {item.type === 'task' && onToggleSelect ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id) }}
              style={{
                width: 18, height: 18, borderRadius: 'var(--radius-sm)',
                border: `1.5px solid ${selectedIds?.has(item.id) ? 'var(--teal)' : 'var(--border-default)'}`,
                background: selectedIds?.has(item.id) ? 'var(--teal-solid)' : 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, transition: 'all 150ms ease', flexShrink: 0,
              }}
              aria-label={selectedIds?.has(item.id) ? 'Deselect task' : 'Select task'}
            >
              {selectedIds?.has(item.id) && <Check size={12} style={{ color: 'var(--ink-bright, #fff)' }} />}
            </button>
          ) : <div style={{ width: 18 }} />}
        </div>

        {/* Title — clickable for tasks */}
        <span
          onClick={item.type === 'task' && onOpenDetail ? () => onOpenDetail(item) : undefined}
          className={item.type === 'task' ? 'task-title-clickable' : ''}
          style={{
            fontSize: 'var(--value-size)', fontWeight: 400,
            color: 'var(--ink)', textDecoration: isDone ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
            minWidth: 0,
            cursor: item.type === 'task' && onOpenDetail ? 'pointer' : 'default',
            borderRadius: 'var(--radius-sm)', padding: '1px 4px', margin: '-1px -4px',
            transition: 'background var(--transition-fast) ease',
          }}
        >
          {item.title}
        </span>

        {/* Project */}
        <span style={{
          fontSize: 'var(--text-small)',
          color: 'var(--teal)',
          opacity: 0.85,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
        }}>
          {item.project ? (projectMap.get(item.project) || item.project) : ''}
        </span>

        {/* Due date — inline editable for tasks, read-only for milestones (grant timeline is server-derived) */}
        {item.type === 'task' && onDueDateChange ? (
          <div onClick={(e) => e.stopPropagation()} data-testid={`task-due-${item.id}`}>
            <InlineDatePicker
              value={item.due_date}
              onChange={(newDate) => onDueDateChange(item.id, newDate)}
            />
          </div>
        ) : (
          <span style={{
            fontSize: 'var(--text-label)',
            color: item.isOverdue ? 'var(--maroon)' : 'var(--slate)',
            fontWeight: item.isOverdue ? 500 : 400,
            opacity: item.isOverdue ? 1 : 0.85,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {item.isOverdue ? 'Overdue' : formatShortDate(item.due_date)}
          </span>
        )}

        {/* Assignee */}
        <div className="flex items-center gap-1.5">
          {person ? (
            <div style={{ width: 20, height: 20, flexShrink: 0 }}>
              <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="xs" variant="ice" />
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75 }}>—</span>
          )}
        </div>

        {/* Status — InlineSelect for tasks */}
        <div onClick={(e) => e.stopPropagation()}>
          {item.type === 'task' && onStatusChange ? (
            <InlineSelect
              value={item.status}
              options={STATUS_OPTIONS}
              onChange={(val) => onStatusChange(item.id, val, item.status)}
              size="sm"
            />
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75 }}>—</span>
          )}
        </div>

        {/* Type badge */}
        <span style={{
          fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)',
          color: item.type === 'milestone' ? 'var(--gold)' : 'var(--teal)',
          opacity: 0.85,
        }}>
          {item.type === 'milestone' ? 'Milestone' : 'Task'}
        </span>
      </div>

      {/* Mobile row — shown only on mobile */}
      <div
        className="sm:hidden hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors flex items-start gap-2"
        style={{ padding: `var(--row-padding-y, 12px) 16px` }}
      >
        {item.type === 'task' && onToggleSelect && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id) }}
            style={{
              width: 18, height: 18, borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${selectedIds?.has(item.id) ? 'var(--teal)' : 'var(--border-default)'}`,
              background: selectedIds?.has(item.id) ? 'var(--teal-solid)' : 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, transition: 'all 150ms ease', flexShrink: 0, marginTop: 2,
            }}
            aria-label={selectedIds?.has(item.id) ? 'Deselect task' : 'Select task'}
          >
            {selectedIds?.has(item.id) && <Check size={12} style={{ color: 'var(--ink-bright, #fff)' }} />}
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <span style={{
            fontSize: '14px', fontWeight: 500,
            color: 'var(--ink)', textDecoration: isDone ? 'line-through' : 'none',
            display: 'block', marginBottom: '4px',
          }}>
            {item.title}
          </span>
          {/* Metadata row */}
          <div className="flex items-center gap-3 flex-wrap">
            {item.type === 'task' && onDueDateChange ? (
              <div onClick={(e) => e.stopPropagation()}>
                <InlineDatePicker
                  value={item.due_date}
                  onChange={(newDate) => onDueDateChange(item.id, newDate)}
                />
              </div>
            ) : (
              <span style={{
                fontSize: 'var(--label-size)',
                color: item.isOverdue ? 'var(--maroon)' : 'var(--slate)',
                fontWeight: item.isOverdue ? 500 : 400,
              }}>
                {item.isOverdue ? 'Overdue' : formatShortDate(item.due_date)}
              </span>
            )}
            <span style={{
              fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)',
              color: item.type === 'milestone' ? 'var(--gold)' : 'var(--teal)',
              opacity: 0.85,
            }}>
              {item.type === 'milestone' ? 'Milestone' : 'Task'}
            </span>
            {person && (
              <div style={{ width: 18, height: 18, flexShrink: 0 }}>
                <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm-icon" variant="ice" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Deadline Table Section (columnar, virtual scrolling for large groups) ────────────

const VIRTUAL_THRESHOLD = 20  // sections exceeding this row count get virtualized
// Row heights match CSS density values: compact=36, default=44, relaxed=52
const DENSITY_ROW_HEIGHT: Record<string, number> = { compact: 36, default: 44, relaxed: 52 }

function DeadlineTableSection({ title, items, color, onStatusChange, onDueDateChange, onOpenDetail, projectMap, selectedIds, onToggleSelect }: { title: string; items: DeadlineItem[]; color: string; onStatusChange?: (id: string, newStatus: string, prevStatus: string) => void; onDueDateChange?: (id: string, newDate: string | null) => void; onOpenDetail?: (item: DeadlineItem) => void; projectMap: Map<string, string>; selectedIds?: Set<string>; onToggleSelect?: (id: string) => void }) {
  const [expanded, setExpanded] = useState(!title.startsWith('Completed'))
  const useVirtual = expanded && items.length > VIRTUAL_THRESHOLD
  const parentRef = useRef<HTMLDivElement>(null)
  const [density] = useDensity()
  const rowHeight = DENSITY_ROW_HEIGHT[density] ?? 44

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
    enabled: useVirtual,
  })

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px 6px', textAlign: 'left' }}
      >
        <div style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
          {title}
        </span>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.75 }}>
          {items.length}
        </span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
      </button>

      {/* Small sections: plain map render */}
      {expanded && !useVirtual && items.map((item) => (
        <DeadlineItemRow
          key={item.id}
          item={item}
          onStatusChange={onStatusChange}
          onDueDateChange={onDueDateChange}
          onOpenDetail={onOpenDetail}
          projectMap={projectMap}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      ))}

      {/* Large sections: virtualized scrollable window */}
      {expanded && useVirtual && (
        <div
          ref={parentRef}
          style={{ height: Math.min(items.length * rowHeight, 440), minHeight: Math.min(items.length * rowHeight, 440), overflow: 'auto' }}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = items[virtualRow.index]
              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    top: virtualRow.start,
                    width: '100%',
                    height: virtualRow.size,
                  }}
                >
                  <DeadlineItemRow
                    item={item}
                    onStatusChange={onStatusChange}
                    onDueDateChange={onDueDateChange}
                    onOpenDetail={onOpenDetail}
                    projectMap={projectMap}
                    selectedIds={selectedIds}
                    onToggleSelect={onToggleSelect}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}


// ── Deadline Row ─────────────────────────────────────────────

function DeadlineRow({ item }: { item: DeadlineItem }) {
  const person = item.assignee ? getPersonInfo(item.assignee) : null
  const isDone = item.status === 'done' || item.status === 'completed'
  const isDueSoon = item.daysUntil >= 0 && item.daysUntil <= 7
  const isMilestone = item.type === 'milestone'

  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState(item.future_note || '')
  const [saving, setSaving] = useState(false)
  const queryClient = useQueryClient()

  const handleSaveNote = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/milestones/${item.id}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteText }),
      })
      if (res.ok) {
        setEditingNote(false)
        queryClient.invalidateQueries({ queryKey: ['grants-timeline'] })
      }
    } finally {
      setSaving(false)
    }
  }, [item.id, noteText, queryClient])

  return (
    <div>
      <div
        className="flex items-center gap-3 py-2 px-3 rounded-lg transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
        style={{ opacity: isDone ? 0.85 : 1 }}
      >
        {/* Type icon */}
        {isMilestone ? (
          <FolderKanban size={14} style={{ color: 'var(--gold)', flexShrink: 0 }} />
        ) : item.isOverdue ? (
          <AlertTriangle size={14} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
        ) : (
          <Clock size={14} style={{ color: 'var(--teal)', flexShrink: 0, opacity: 0.85 }} />
        )}

        {/* Title */}
        <span
          className="flex-1 text-sm truncate"
          style={{
            color: 'var(--ink)',
            textDecoration: isDone ? 'line-through' : 'none',
          }}
        >
          {item.title}
        </span>

        {/* Add note link (milestones only, no existing note) */}
        {isMilestone && !item.future_note && !isDone && !editingNote && (
          <button
            onClick={() => setEditingNote(true)}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
            style={{
              color: 'var(--gold)',
              opacity: 0.85,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Pencil size={9} />
            Note to future me
          </button>
        )}

        {/* Project */}
        {item.project && (
          <span className="text-[10px] hidden sm:block" style={{ color: 'var(--gold)', opacity: 0.85 }}>
            {item.project}
          </span>
        )}

        {/* Priority */}
        {item.priority && (item.priority === 'urgent' || item.priority === 'high') && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ color: item.priority === 'urgent' ? 'var(--maroon)' : 'var(--orange)', backgroundColor: item.priority === 'urgent' ? 'var(--maroon-hover)' : 'var(--orange-hover)' }}>
            {item.priority}
          </span>
        )}

        {/* Assignee */}
        {person && (
          <div style={{ width: 22, height: 22 }}>
            <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm-plus" variant="ice" />
          </div>
        )}

        {/* Date */}
        <span
          className="text-[11px] flex-shrink-0 w-16 text-right"
          style={{
            color: item.isOverdue ? 'var(--maroon)' : 'var(--slate)',
            fontWeight: item.isOverdue ? 600 : 400,
            opacity: item.isOverdue ? 1 : 0.85,
          }}
        >
          {item.daysUntil === 0 ? 'Today' : item.daysUntil === 1 ? 'Tomorrow' : formatShortDate(item.due_date)}
        </span>
      </div>

      {/* Future Me note callout — shown when milestone is due within 7 days */}
      {isMilestone && item.future_note && isDueSoon && !isDone && (
        <div className="ml-8 mr-3 mt-1 mb-2 p-3 rounded-lg" style={{
          background: 'var(--gold-hover)',
          border: '1px solid rgba(201,168,76,0.15)',
          borderLeft: '3px solid var(--gold)',
        }}>
          <div className="flex items-center justify-between gap-1.5 mb-1">
            <div className="flex items-center gap-1.5">
              <Clock size={10} style={{ color: 'var(--gold)' }} />
              <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--gold)' }}>
                Note from past you
              </span>
            </div>
            <button
              onClick={() => { setNoteText(item.future_note || ''); setEditingNote(true) }}
              aria-label="Edit future-me note"
              className="flex items-center gap-1 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03] rounded px-1"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <Pencil size={9} style={{ color: 'var(--slate)', opacity: 0.75 }} />
            </button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.5, fontStyle: 'italic', margin: 0 }}>
            {item.future_note}
          </p>
        </div>
      )}

      {/* Future Me note — compact indicator when not due soon */}
      {isMilestone && item.future_note && !isDueSoon && !isDone && (
        <div className="ml-8 mr-3 mt-0.5 mb-1 flex items-center gap-1.5">
          <Clock size={9} style={{ color: 'var(--gold)', opacity: 0.85 }} />
          <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>
            Future Me note attached
          </span>
          <button
            onClick={() => { setNoteText(item.future_note || ''); setEditingNote(true) }}
            className="flex items-center gap-1 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03] rounded px-1"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Pencil size={8} style={{ color: 'var(--slate)', opacity: 0.75 }} />
          </button>
        </div>
      )}

      {/* Inline note editor */}
      {isMilestone && editingNote && (
        <div className="ml-8 mr-3 mt-1 mb-2 p-3 rounded-lg" style={{
          background: 'var(--gold-hover)',
          border: '1px solid rgba(201,168,76,0.2)',
        }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Pencil size={10} style={{ color: 'var(--gold)' }} />
            <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--gold)' }}>
              Note to future me
            </span>
          </div>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="What should you remember when this milestone arrives? Context, decisions, things to watch for..."
            rows={3}
            style={{
              fontSize: '12px',
              color: 'var(--ink)',
              lineHeight: 1.5,
              width: '100%',
              resize: 'vertical',
              border: '1px solid rgba(201,168,76,0.15)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 10px',
              background: 'var(--cream)',
              outline: 'none',
            }}
            autoFocus
          />
          <div className="flex items-center gap-2 mt-2 justify-end">
            <button
              onClick={() => { setEditingNote(false); setNoteText(item.future_note || '') }}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={11} />
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
              style={{
                color: 'var(--gold)',
                background: 'var(--gold-active)',
                border: '1px solid rgba(201,168,76,0.2)',
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.85 : 1,
              }}
            >
              <Check size={11} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Upcoming Conferences ────────────────────────────────────

const CONF_STATUS_PILL: Record<string, { bg: string; color: string }> = {
  planning: { bg: 'rgba(129,140,153,0.12)', color: 'var(--slate)' },
  submitted: { bg: 'var(--gold-emphasis)', color: 'var(--gold)' },
  accepted: { bg: 'color-mix(in srgb, var(--teal) 12%, transparent)', color: 'var(--teal)' },
  preparing: { bg: 'rgba(91,155,213,0.12)', color: '#5b9bd5' },
  presented: { bg: 'rgba(52,168,83,0.12)', color: '#34a853' },
  rejected: { bg: 'rgba(134,48,62,0.12)', color: 'var(--maroon)' },
}

const CONF_MATERIALS_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  drafting: 'Drafting',
  review: 'In Review',
  final: 'Final',
}

function UpcomingConferencesSection() {
  const { data: conferences = [], isLoading } = useUpcomingConferences()

  if (isLoading || conferences.length === 0) return null

  return (
    <div
      className="table-container"
      style={{
        padding: '16px 20px',
        marginTop: '1.5rem',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Presentation size={14} style={{ color: 'var(--teal)', opacity: 0.85 }} />
        <span
          style={{
            fontSize: 'var(--label-size)',
            fontWeight: 'var(--label-weight)',
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Upcoming Conferences
        </span>
        <span style={{ fontSize: '10px', color: 'var(--teal)', opacity: 0.85 }}>
          ({conferences.length})
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {['Conference', 'Project', 'Deadline', 'Status', 'Prep'].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '6px 8px',
                  fontSize: 'var(--label-size)',
                  fontWeight: 'var(--label-weight)',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-label)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {conferences.map((conf) => {
            const pill = CONF_STATUS_PILL[conf.status] || CONF_STATUS_PILL.planning
            const isOverdue = conf.days_until !== null && conf.days_until < 0 && conf.status === 'planning'
            const relevantDate = conf.status === 'planning' && conf.abstract_due
              ? conf.abstract_due
              : conf.conference_date

            return (
              <tr key={conf.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: 'var(--sp-sm)', fontWeight: 500, color: 'var(--ink)' }}>
                  {conf.conference}
                  <div
                    style={{
                      fontSize: 'var(--label-size)',
                      color: 'var(--slate)',
                      opacity: 'var(--ink-label)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '180px',
                    }}
                    title={conf.title}
                  >
                    {conf.title}
                  </div>
                </td>
                <td style={{ padding: 'var(--sp-sm)' }}>
                  {conf.project_slug ? (
                    <Link
                      to={PATHS.project(conf.project_slug)}
                      style={{
                        fontSize: 'var(--label-size)',
                        color: 'var(--teal)',
                        textDecoration: 'none',
                      }}
                    >
                      {conf.project_title || conf.project_slug}
                    </Link>
                  ) : (
                    <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>--</span>
                  )}
                </td>
                <td style={{ padding: 'var(--sp-sm)', whiteSpace: 'nowrap' }}>
                  {relevantDate ? (
                    <div>
                      <span
                        style={{
                          fontSize: 'var(--label-size)',
                          color: isOverdue ? 'var(--maroon)' : 'var(--ink)',
                          fontWeight: isOverdue ? 600 : 400,
                        }}
                      >
                        {formatShortDate(relevantDate)}
                      </span>
                      {conf.days_until !== null && (
                        <span
                          style={{
                            fontSize: '10px',
                            color: isOverdue ? 'var(--maroon)' : 'var(--slate)',
                            opacity: isOverdue ? 0.8 : 0.85,
                            marginLeft: '4px',
                          }}
                        >
                          ({conf.days_until}d)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>--</span>
                  )}
                </td>
                <td style={{ padding: 'var(--sp-sm)' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-lg)',
                      fontSize: '10px',
                      fontWeight: 600,
                      background: pill.bg,
                      color: pill.color,
                      textTransform: 'capitalize',
                    }}
                  >
                    {conf.status}
                  </span>
                </td>
                <td style={{ padding: 'var(--sp-sm)' }}>
                  {['accepted', 'preparing'].includes(conf.status) ? (
                    <span style={{ fontSize: 'var(--value-size)', color: 'var(--ink)' }}>
                      {CONF_MATERIALS_LABEL[conf.materials_status] || conf.materials_status}
                    </span>
                  ) : (
                    <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>--</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Timeline View ────────────────────────────────────────────

function DeadlineTimeline({ items }: { items: DeadlineItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<GanttChartSquare size={40} />}
        title="Timeline is clear"
        subtitle="Task due dates and grant milestones plot onto this timeline as they're scheduled."
      />
    )
  }

  // Group by week
  const byWeek = useMemo(() => {
    const groups = new Map<string, DeadlineItem[]>()
    for (const item of items) {
      const d = new Date(item.due_date + 'T12:00:00')
      // Get Monday of the week
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d)
      monday.setDate(diff)
      const key = monday.toISOString().split('T')[0]
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div
        className="absolute left-2 top-0 bottom-0 w-0.5"
        style={{ backgroundColor: 'var(--border-subtle)' }}
      />

      {byWeek.map(([weekStart, weekItems]) => {
        const weekDate = new Date(weekStart + 'T12:00:00')
        const weekEnd = new Date(weekDate)
        weekEnd.setDate(weekEnd.getDate() + 6)

        return (
          <div key={weekStart} className="mb-6 relative">
            {/* Week dot */}
            <div
              className="absolute -left-4 top-0.5 w-3 h-3 rounded-full border-2"
              style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--teal)' }}
            />

            {/* Week label */}
            <div className="mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                {formatShortDate(weekStart)} — {formatShortDate(weekEnd.toISOString().split('T')[0])}
              </span>
            </div>

            {/* Items */}
            <div className="flex flex-col gap-1.5">
              {weekItems.map((item) => (
                <DeadlineRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

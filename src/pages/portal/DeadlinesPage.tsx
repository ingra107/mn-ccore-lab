import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { portalTitle } from '../../constants/pageLabels'
import { Link } from 'react-router-dom'
import { Clock, List, GanttChartSquare, AlertTriangle, FolderKanban, Pencil, X, Check, GitBranch, Presentation, Download } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import QueryState from '../../components/QueryState'
import ToggleButton from '../../components/ToggleButton'
import Avatar from '../../components/Avatar'
import InlineSelect from '../../components/InlineSelect'
import { useUndoToast } from '../../components/UndoToast'
import BulkActionToolbar from '../../components/tasks/BulkActionToolbar'
import { useTasks, useUpcomingConferences, useProjects } from '../../hooks/useApiData'
import { useUpdateTask, useBulkUpdateTasks, useUpdateGrantMilestone } from '../../hooks/useMutations'
import { useTaskFieldEditors } from '../../hooks/useTaskFieldEditors'
import { useGrantTimeline } from '../../hooks/useGrantTimeline'
import { getPersonInfo } from '../../data/team'
import { formatShortDate, localDateKey, isOverdue, dueLabelText, isDoneStatus } from '../../lib/dateUtils'
import DueLabel from '../../components/DueLabel'
import { PATHS } from '../../constants/paths'
import { useQueryClient } from '@tanstack/react-query'
import { useSelection } from '../MyTasks/hooks/useSelection'
import TaskDetailPanel from '../../components/tasks/TaskDetailPanel'
import type { TaskRow } from '../../lib/api'
import { ICON_PROPS } from '../../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../../lib/taskGrouping'
import RegulatoryExpiringList from '../../components/RegulatoryExpiringList'
import { projectFullTitleHint, projectShortLabel, taskFullTitleHint, taskShortLabel } from '../../lib/displayNames'
import { DeadlineList, type DeadlineItem, type DeadlineProject } from './DeadlineList'

type ViewMode = 'list' | 'timeline'

export default function DeadlinesPage() {
  const [view, setView] = useState<ViewMode>('list')
  const [filterType, setFilterType] = useState<string>('')

  const { data: tasks = [], isLoading: tasksLoading, isError: tasksError, error: tasksErr } = useTasks()
  const { data: grants = [], isLoading: grantsLoading } = useGrantTimeline()
  const { data: projectsList = [] } = useProjects()
  // Short names (wave 0), the long title on hover.
  const projectsBySlug = useMemo(() => {
    const m = new Map<string, DeadlineProject>()
    for (const p of projectsList) if (p.slug) m.set(p.slug, { name: projectShortLabel(p), slug: p.slug, fullTitle: projectFullTitleHint(p) })
    return m
  }, [projectsList])
  const updateTask = useUpdateTask()
  const bulkUpdate = useBulkUpdateTasks()
  const updateMilestone = useUpdateGrantMilestone()
  const queryClient = useQueryClient()
  const { showUndo } = useUndoToast()
  // P2-3: shared task field editors (status + due here) — one optimistic + undo
  // implementation across ListView and Deadlines. Milestone status stays local
  // (grant-milestone mutation + grants-timeline invalidation are Deadlines-specific).
  const taskEditors = useTaskFieldEditors()
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  // Same selection as the Tasks Table: x, shift-click range, ctrl-click toggle.
  const { selected: selectedIds, setSelected: setSelectedIds, toggleSelect, selectRange, anchorId } = useSelection()
  const isLoading = tasksLoading || grantsLoading

  const handleFieldChange = useCallback((id: string, field: string, value: unknown) => {
    updateTask.mutate({ id, fields: { [field]: value } })
  }, [updateTask])

  const handleBulkAction = useCallback((action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete' | 'snooze' | 'status', value?: string) => {
    if (action === 'snooze') {
      const days = parseInt(value || '1', 10)
      // S2: capture prior due dates before mutating so Undo restores the exact
      // pre-snooze values; report tasks skipped for having no due date.
      const prior: Array<{ id: string; due_date: string }> = []
      let skipped = 0
      for (const id of selectedIds) {
        const task = tasks.find(t => t.id === id)
        if (!task?.due_date) { skipped++; continue }
        prior.push({ id, due_date: task.due_date })
        const d = new Date(task.due_date + 'T12:00:00')
        d.setDate(d.getDate() + days)
        const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        handleFieldChange(id, 'due_date', newDate)
      }
      const snoozedLabel = `${prior.length} snoozed +${days}d`
      const skippedLabel = skipped > 0 ? ` · ${skipped} skipped (no due date)` : ''
      showUndo(`${snoozedLabel}${skippedLabel}`, () => {
        for (const p of prior) handleFieldChange(p.id, 'due_date', p.due_date)
      })
      setSelectedIds(new Set())
      return
    }
    bulkUpdate.mutate({ ids: [...selectedIds], action, value }, {
      onSuccess: () => setSelectedIds(new Set()),
    })
  }, [selectedIds, setSelectedIds, tasks, handleFieldChange, showUndo, bulkUpdate])

  // P2-3: delegate task status to the shared editor (signature adapter — the
  // row callback is (id, next, prev); the shared hook is (id, prev, next)).
  const handleStatusChange = useCallback((id: string, newStatus: string, prevStatus: string) => {
    taskEditors.onStatusChange(id, prevStatus, newStatus)
  }, [taskEditors])

  // S12: grant-milestone status is now editable from Deadlines via the existing
  // mutation. The mutation invalidates grant-milestones* but NOT this page's
  // grants-timeline query, so refresh it explicitly on settle.
  const handleMilestoneStatusChange = useCallback((id: string, newStatus: string, prevStatus: string) => {
    const invalidate = { onSettled: () => queryClient.invalidateQueries({ queryKey: ['grants-timeline'] }) }
    updateMilestone.mutate({ id, fields: { status: newStatus } }, invalidate)
    const labels: Record<string, string> = { upcoming: 'Upcoming', in_progress: 'In Progress', completed: 'Completed', overdue: 'Overdue' }
    showUndo(`Milestone → ${labels[newStatus] || newStatus}`, () =>
      updateMilestone.mutate({ id, fields: { status: prevStatus } }, invalidate),
    )
  }, [updateMilestone, queryClient, showUndo])

  // P2-3: delegate task due-date edits to the shared editor (resolves prev from
  // the row here, since the row callback is (id, newDate) only).
  const handleDueDateChange = useCallback((id: string, newDate: string | null) => {
    const task = tasks.find(t => t.id === id)
    taskEditors.onDateChange(id, task?.due_date ?? null, newDate)
  }, [tasks, taskEditors])

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
        title: taskShortLabel(task),
        fullTitle: taskFullTitleHint(task),
        due_date: task.due_date,
        type: 'task',
        assignee: task.assignee,
        project: task.project_id || undefined,
        status: task.status,
        priority: task.priority,
        isOverdue: isOverdue(task.due_date, task.status),
        daysUntil,
        task,
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
          isOverdue: milestone.status !== 'completed' && isOverdue(milestone.target_date),
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

  // Group by time period. Each item lands in exactly one group: a done task
  // or a completed grant milestone is Completed only (a completed milestone
  // used to show in Later as well).
  const { overdue, thisWeek, nextWeek, later, completed } = useMemo(() => {
    const open = deadlines.filter((d) => !isDoneStatus(d.status))
    return {
      overdue: open.filter((d) => d.isOverdue),
      thisWeek: open.filter((d) => !d.isOverdue && d.daysUntil >= 0 && d.daysUntil <= 7),
      nextWeek: open.filter((d) => d.daysUntil > 7 && d.daysUntil <= 14),
      later: open.filter((d) => d.daysUntil > 14),
      completed: deadlines.filter((d) => isDoneStatus(d.status)),
    }
  }, [deadlines])
  const listGroups = useMemo(() => [
    { title: 'Overdue', items: overdue },
    { title: 'This week', items: thisWeek },
    { title: 'Next week', items: nextWeek },
    { title: 'Later', items: later },
    { title: 'Completed', items: completed, limit: 5 },
  ].filter((g) => g.items.length > 0), [overdue, thisWeek, nextWeek, later, completed])
  const openTask = useCallback((task: TaskRow) => setSelectedTask(task), [])

  // Dynamic page title
  useEffect(() => {
    document.title = portalTitle('Deadlines', overdue.length > 0 ? `${overdue.length} overdue` : undefined)
  }, [overdue.length])

  // T2.1 (2026-05-28): adopt QueryState for auth-error consistency.
  // Mirrors AnalyticsPage / PIAnalytics post-/simplify so the auth-vs-generic
  // error message is identical across pages. errorStatus drives the 401/403
  // "Sign in" copy; otherwise the generic "Something went wrong" message.
  if (tasksError) {
    const status = (tasksErr as (Error & { status?: number }) | null)?.status
    return (
      <div className="content-container">
        <PageHeader icon={<Clock {...ICON_PROPS} size={20} />} title="Deadlines & Milestones" subtitle="" />
        <QueryState isLoading={false} isError={true} errorStatus={status}>
          {null}
        </QueryState>
      </div>
    )
  }

  return (
    <div className="content-container">
      <PageHeader
        icon={<Clock {...ICON_PROPS} size={20} />}
        title="Deadlines & Milestones"
        subtitle={overdue.length > 0
          ? `${overdue.length} overdue, ${thisWeek.length + nextWeek.length + later.length} upcoming`
          : `${thisWeek.length + nextWeek.length + later.length} upcoming`
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
                  <Icon {...ICON_PROPS} size={14} />
                  {v.label}
                </ToggleButton>
              )
            })}
          </div>
          <Link
            to={PATHS.deadlineCascadeTab}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
            style={{
              fontSize: '12px',
              color: 'var(--teal)',
              border: '1px solid rgba(45,138,138,0.2)',
              textDecoration: 'none',
            }}
          >
            <GitBranch {...ICON_PROPS} size={12} />
            Cascade View
          </Link>
          <button
            onClick={() => {
              const items = [...overdue, ...thisWeek, ...nextWeek, ...later].filter(d => d.status !== 'done')
              let ical = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//MN-CCORE//Deadlines//EN\nCALSCALE:GREGORIAN\n'
              for (const d of items) {
                const dateStr = d.due_date.replace(/-/g, '')
                ical += `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${dateStr}\nSUMMARY:${(d.fullTitle ?? d.title).replace(/[,;\\]/g, ' ')}\nDESCRIPTION:${d.type} - ${d.status}\nUID:${d.id}@mn-ccore-deadlines\nEND:VEVENT\n`
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
            <Download {...ICON_PROPS} size={12} />
            Export
          </button>
          {/* S21: removed the "Switch to Timeline" promo coach-mark — it sat
              inline in the toolbar and overlapped interactive chrome. The
              Timeline view toggle (above) is already visible. */}

          <InlineSelect
            value={filterType}
            options={[
              { value: '', label: 'All Types' },
              { value: 'task', label: 'Tasks' },
              { value: 'milestone', label: 'Grant Milestones' },
            ]}
            onChange={setFilterType}
            alwaysShowChevron
          />
        </div>
      </PageHeader>

      {/* Regulatory items expiring within 60 days, each with an .ics reminder
          (moved here from the retired My Hub page, 2026-10-09). */}
      <RegulatoryExpiringList />

      {/* Urgent deadline banner — CLS fix R7: reserve 72px slot */}
      <div style={{ minHeight: '72px', marginTop: 'var(--sp-md)', contain: 'layout' }}>
      {(() => {
        const nextUrgent = [...overdue, ...thisWeek].filter(d => d.status !== 'done' && d.status !== 'completed')[0]
        if (!nextUrgent) return null
        const isOver = nextUrgent.isOverdue
        // Same wording as the rows below, so the banner and the list never disagree.
        const daysText = dueLabelText(nextUrgent.due_date, isOver)
        return (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg border"
            style={{
              background: isOver ? 'var(--maroon-hover)' : 'var(--teal-hover)',
              borderColor: isOver ? 'rgba(122,0,25,0.2)' : 'rgba(45,138,138,0.2)',
            }}
          >
            <AlertTriangle {...ICON_PROPS} size={16} style={{ color: isOver ? 'var(--maroon)' : 'var(--gold)', flexShrink: 0 }} />
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

      {/* Content — CLS fix (C8 R6): reserve viewport height and render skeleton rows at
          the list's row height, so the data swaps in without layout thrash. */}
      <div className="mt-5" style={{ minHeight: 'calc(100vh - 280px)', contain: 'layout' }}>
        {isLoading ? (
          // Skeleton rows at the sleek row's height, so the list swaps in without a jump.
          <div aria-hidden="true" style={{ padding: '38px 10px 0' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={`skel-${i}`} style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 16, height: 16, borderRadius: 5, background: 'var(--surface-2)' }} />
                <div style={{ flex: 1, height: 12, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }} />
                <div style={{ width: 80, height: 12, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }} />
                <div style={{ width: 60, height: 12, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }} />
              </div>
            ))}
          </div>
        ) : view === 'list' ? (
          <>
            {deadlines.length === 0 ? (
              <EmptyState
                icon={<Clock size={40} />}
                title="The runway is clear"
                subtitle="Nothing due in the next 90 days. Enjoy the quiet — deadlines surface here as tasks and grant milestones land."
              />
            ) : (
              <DeadlineList
                groups={listGroups}
                projects={projectsBySlug}
                selected={selectedIds}
                toggleSelect={toggleSelect}
                selectRange={selectRange}
                anchorId={anchorId}
                setSelected={setSelectedIds}
                onOpenTask={openTask}
                onStatusChange={handleStatusChange}
                onMilestoneStatusChange={handleMilestoneStatusChange}
                onDueDateChange={handleDueDateChange}
              />
            )}

            {/* Counts and the keys, one quiet line under the rows. */}
            {deadlines.length > 0 && (
              <div className="sr-foot" style={{ padding: '10px 10px 12px', flexWrap: 'wrap' }}>
                {([
                  { label: 'Total', value: deadlines.length },
                  ...(overdue.length > 0 ? [{ label: 'Overdue', value: overdue.length, overdue: true }] : []),
                  { label: 'This week', value: thisWeek.length },
                  { label: 'Next week', value: nextWeek.length },
                  { label: 'Later', value: later.length },
                  { label: 'Done', value: completed.length },
                ] as { label: string; value: number; overdue?: boolean }[]).map(s => (
                  <span key={s.label}>
                    {s.label}{' '}
                    <span style={{ fontWeight: 600, color: s.overdue ? 'var(--sk-od)' : 'var(--sk-t2)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
                  </span>
                ))}
                <span style={{ flex: 1 }} />
                <span className="hidden sm:inline"><kbd>j</kbd> <kbd>k</kbd> move</span>
                <span className="hidden sm:inline"><kbd>x</kbd> or ⇧click select</span>
                <span className="hidden sm:inline"><kbd>e</kbd> <kbd>⏎</kbd> open</span>
                <span className="hidden sm:inline"><kbd>esc</kbd> clear</span>
              </div>
            )}
          </>
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

// ── Deadline Row ─────────────────────────────────────────────

function DeadlineRow({ item }: { item: DeadlineItem }) {
  const person = item.assignee ? getPersonInfo(item.assignee) : null
  const isDone = item.status === 'done' || item.status === 'completed'
  const isDueSoon = item.daysUntil >= 0 && item.daysUntil <= 7
  const isMilestone = item.type === 'milestone'

  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState(item.future_note || '')
  const [saving, setSaving] = useState(false)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editingNote) noteTextareaRef.current?.focus({ preventScroll: true })
  }, [editingNote])
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
          <FolderKanban {...ICON_PROPS} size={14} style={{ color: 'var(--gold)', flexShrink: 0 }} />
        ) : item.isOverdue ? (
          <AlertTriangle {...ICON_PROPS} size={14} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
        ) : (
          <Clock {...ICON_PROPS} size={14} style={{ color: 'var(--teal)', flexShrink: 0, opacity: 0.85 }} />
        )}

        {/* Title */}
        <span
          className="flex-1 text-sm truncate"
          style={{
            color: 'var(--ink)',
            textDecoration: isDone ? 'line-through' : 'none',
          }}
          title={item.fullTitle}
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
            <Pencil {...ICON_PROPS} size={9} />
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
        <DueLabel
          due={item.due_date}
          status={item.status}
          className="text-[11px] flex-shrink-0 w-16 text-right"
          style={{ opacity: item.isOverdue ? 1 : 0.85 }}
        />
      </div>

      {/* Future Me note callout — shown when milestone is due within 7 days */}
      {isMilestone && item.future_note && isDueSoon && !isDone && (
        <div className="ml-8 mr-3 mt-1 mb-2 p-3 rounded-lg" style={{
          background: 'var(--gold-hover)',
          border: `1px solid ${withAlpha(ACCENT_GOLD, 15)}`,
          borderLeft: '3px solid var(--gold)',
        }}>
          <div className="flex items-center justify-between gap-1.5 mb-1">
            <div className="flex items-center gap-1.5">
              <Clock {...ICON_PROPS} size={10} style={{ color: 'var(--gold)' }} />
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
              <Pencil {...ICON_PROPS} size={9} style={{ color: 'var(--slate)', opacity: 0.75 }} />
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
          <Clock {...ICON_PROPS} size={9} style={{ color: 'var(--gold)', opacity: 0.85 }} />
          <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>
            Future Me note attached
          </span>
          <button
            onClick={() => { setNoteText(item.future_note || ''); setEditingNote(true) }}
            className="flex items-center gap-1 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03] rounded px-1"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Pencil {...ICON_PROPS} size={8} style={{ color: 'var(--slate)', opacity: 0.75 }} />
          </button>
        </div>
      )}

      {/* Inline note editor */}
      {isMilestone && editingNote && (
        <div className="ml-8 mr-3 mt-1 mb-2 p-3 rounded-lg" style={{
          background: 'var(--gold-hover)',
          border: `1px solid ${withAlpha(ACCENT_GOLD, 20)}`,
        }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Pencil {...ICON_PROPS} size={10} style={{ color: 'var(--gold)' }} />
            <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--gold)' }}>
              Note to future me
            </span>
          </div>
          <textarea
            ref={noteTextareaRef}
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
              border: `1px solid ${withAlpha(ACCENT_GOLD, 15)}`,
              borderRadius: 'var(--radius-md)',
              padding: '8px 10px',
              background: 'var(--cream)',
              outline: 'none',
            }}
          />
          <div className="flex items-center gap-2 mt-2 justify-end">
            <button
              onClick={() => { setEditingNote(false); setNoteText(item.future_note || '') }}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X {...ICON_PROPS} size={11} />
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
              style={{
                color: 'var(--gold)',
                background: 'var(--gold-active)',
                border: `1px solid ${withAlpha(ACCENT_GOLD, 20)}`,
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.85 : 1,
              }}
            >
              <Check {...ICON_PROPS} size={11} />
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
        <Presentation {...ICON_PROPS} size={14} style={{ color: 'var(--teal)', opacity: 0.85 }} />
        <span
          style={{
            fontSize: 'var(--label-size)',
            fontWeight: 'var(--label-weight)',
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
          }}
        >
          Upcoming conferences
        </span>
        <span style={{ fontSize: '10px', color: 'var(--teal)' }}>
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
  // Group by week — must be above the early return to satisfy Rules of Hooks.
  // When items is empty the memo returns an empty array and the EmptyState
  // renders below; the memo result is never used in that branch.
  const byWeek = useMemo(() => {
    const groups = new Map<string, DeadlineItem[]>()
    for (const item of items) {
      const d = new Date(item.due_date + 'T12:00:00')
      // Get Monday of the week
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d)
      monday.setDate(diff)
      const key = localDateKey(monday)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<GanttChartSquare size={40} />}
        title="Timeline is clear"
        subtitle="Task due dates and grant milestones plot onto this timeline as they're scheduled."
      />
    )
  }

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
                {formatShortDate(weekStart)} — {formatShortDate(localDateKey(weekEnd))}
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

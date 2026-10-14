// MeetingActionList -- a meeting's action items as shared task rows, with the
// triage verbs in place and a selection bar scoped to this list.
//
// ONE component for two surfaces (Nick: every affordance identical on every
// surface): the meeting page (pages/MeetingDetail.tsx) and the meeting's Today
// card (components/today/MeetingActionsCard.tsx). It owns the row behaviour
// that used to live inline in MeetingDetail: done toggle, quick delete with a
// real undo, project re-route, assign, date, and the bulk bar (Assign, Date,
// Project, Complete, Delete, Clear). Selection state lives here, so "2
// selected" always means two of THIS list's rows.
//
// Action items are task rows. The list is fed by GET /api/meetings/:id, which
// joins `tasks.meeting_id IN (meetings.id, meetings.source_id)` (the dual id
// space); this component never matches a meeting id to a task's meeting_id.
// It patches the `['meeting', meetingId]` cache optimistically: the shared task
// mutations only reach the ['tasks'] caches.

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Trash2, X } from 'lucide-react'
import type { TaskRow } from '../../lib/api'
import type { MeetingDetail as MeetingDetailData } from '../../hooks/useApiData'
import { useProjects } from '../../hooks/useApiData'
import { useBulkUpdateTasks, useRestoreTask, useUpdateTask } from '../../hooks/useMutations'
import { useToast } from '../../hooks/useToast'
import { useUndoToast } from '../UndoToast'
import { isTaskDone } from '../../lib/taskGrouping'
import { taskShortLabel } from '../../lib/displayNames'
import { ICON_PROPS } from '../../lib/iconProps'
import { TaskRow as SharedTaskRow } from '../tasks/TaskRow'
import { TaskRowActions } from '../tasks/TaskRowActions'
import TaskDetailPanel from '../tasks/LazyTaskDetailPanel'
import { InlineDetail } from '../../pages/MyTasks/components/InlineDetail'
import GhostSelect from '../ui/GhostSelect'
import InlineDatePicker from '../InlineDatePicker'
import { getAssignableMembers } from '../../lib/assignableMembers'
import { useProjectPairs } from '../../hooks/useProjectPairs'
import { decodePair } from '../../lib/projectPairs'

export interface MeetingActionListProps {
  meetingId: string
  /** Deduped and sorted (lib/meetingActionItems.prepareActionItems). */
  items: TaskRow[]
  /** Show at most this many rows, then a "Show N more" control (phone card). */
  maxVisible?: number
  /** Told whenever the selection changes. */
  onSelectionChange?: (ids: Set<string>) => void
}

export function MeetingActionList({ meetingId, items, maxVisible, onSelectionChange }: MeetingActionListProps) {
  const queryClient = useQueryClient()
  const updateTask = useUpdateTask()
  const bulkUpdateTasks = useBulkUpdateTasks()
  const restoreTask = useRestoreTask()
  const { showError } = useToast()
  const { showUndo } = useUndoToast()
  const { data: allProjects = [] } = useProjects()
  const projectsBySlug = useMemo(() => {
    const m = new Map<string, { name: string; slug: string; primary_folder?: string | null }>()
    for (const p of allProjects) m.set(p.slug, { name: p.title, slug: p.slug, primary_folder: p.primary_folder })
    return m
  }, [allProjects])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [fullEditorTask, setFullEditorTask] = useState<TaskRow | null>(null)
  const [showAll, setShowAll] = useState(false)

  const meetingQueryKey = ['meeting', meetingId] as const

  function setSelection(next: Set<string>) {
    setSelected(next)
    onSelectionChange?.(next)
  }
  function toggleSelect(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelection(next)
  }
  const clearSelection = () => setSelection(new Set())

  // Optimistically rewrite the ['meeting', id] cache and hand back the
  // revert/settle pair (the shared task hooks cannot see this cache's shape).
  function patchActionItems(mutate: (rows: TaskRow[]) => TaskRow[]) {
    const prevData = queryClient.getQueryData<MeetingDetailData>(meetingQueryKey)
    queryClient.setQueryData<MeetingDetailData>(meetingQueryKey, (data) => data && {
      ...data,
      action_items: mutate(data.action_items || []),
    })
    return {
      revert: () => queryClient.setQueryData(meetingQueryKey, prevData),
      settle: () => {
        queryClient.invalidateQueries({ queryKey: meetingQueryKey })
        // The Today card's "N open" and the Meetings list counts read /api/meetings.
        queryClient.invalidateQueries({ queryKey: ['meetings'] })
      },
    }
  }
  const patchRows = (ids: string[], patch: Partial<TaskRow>) =>
    patchActionItems((rows) => rows.map((a) => (ids.includes(a.id) ? { ...a, ...patch } : a)))

  // ── one row ──────────────────────────────────────────────────────────────
  function handleToggleDone(item: TaskRow) {
    const wasDone = isTaskDone(item)
    const { revert, settle } = patchRows([item.id], wasDone ? { status: 'todo', completed: 0 } : { status: 'done', completed: 1 })
    if (wasDone) {
      updateTask.mutate({ id: item.id, fields: { status: 'todo', completed: 0 } }, {
        onError: revert,
        onSuccess: () => {
          settle()
          showUndo('Marked not done', () => updateTask.mutate({ id: item.id, fields: { status: 'done', completed: 1 } }, { onSuccess: settle }))
        },
      })
    } else {
      runBatch({ ids: [item.id], action: 'complete' }, { revert, settle }, 'complete', () =>
        showUndo('Completed', () => updateTask.mutate({ id: item.id, fields: { status: 'todo', completed: 0 } }, { onSuccess: settle })))
    }
  }

  // Quick delete with a REAL 5s undo: the delete lands at once (a tombstone via
  // the bulk 'delete' action), undo calls the restore endpoint with the status
  // the row had, because D1 cannot recover it. No confirm dialog: this is the
  // high-volume case (Nick 2026-07-21).
  function handleDelete(item: TaskRow) {
    const label = taskShortLabel(item) || 'action item'
    const shortLabel = label.length > 40 ? `${label.slice(0, 40)}…` : label
    const prevStatus = item.status && item.status !== 'deleted' ? item.status : 'todo'
    const { revert, settle } = patchActionItems((rows) => rows.filter((a) => a.id !== item.id))
    runBatch({ ids: [item.id], action: 'delete' }, { revert, settle }, 'delete', () =>
      showUndo(`Deleted "${shortLabel}"`, () => {
        restoreTask.mutate({ id: item.id, prevStatus }, {
          onSuccess: settle,
          onError: () => showError(`Could not restore "${shortLabel}"`),
        })
      }))
  }

  // Re-route a row to a project (and product, for a "Project ~ Product" pick).
  function handleReassign(item: TaskRow, next: string | null, nextProduct: string | null = null) {
    const prev = item.project_id ?? null
    const prevProduct = item.product_id ?? null
    if (prev === next && (nextProduct == null || nextProduct === prevProduct)) return
    const apply = (value: string | null, product: string | null) => {
      const { revert, settle } = patchRows([item.id], { project_id: value, product_id: product })
      updateTask.mutate({ id: item.id, fields: { project_id: value, product_id: product } }, {
        onError: () => { revert(); showError('Could not change project') },
        onSuccess: settle,
      })
    }
    apply(next, nextProduct)
    const nextName = next ? (projectsBySlug.get(next)?.name ?? next) : null
    showUndo(nextName ? `Moved to ${nextName}` : 'Project cleared', () => apply(prev, prevProduct))
  }

  // One field on one row, with undo (assignee, due_date).
  function handleField(item: TaskRow, field: 'assignee' | 'due_date', value: string | null, label: string) {
    const prev = (item[field] ?? null) as string | null
    if (prev === value) return
    const apply = (v: string | null) => {
      const { revert, settle } = patchRows([item.id], { [field]: v } as Partial<TaskRow>)
      updateTask.mutate({ id: item.id, fields: { [field]: v } }, {
        onError: () => { revert(); showError(`Could not change ${label}`) },
        onSuccess: settle,
      })
    }
    apply(value)
    showUndo(`${label[0].toUpperCase()}${label.slice(1)} changed`, () => apply(prev))
  }

  // ── the selection ────────────────────────────────────────────────────────
  // Always read the selection through the CURRENT rows: an id whose row was
  // deleted, or moved off this meeting, is not selected any more.
  const selectedRows = items.filter((r) => selected.has(r.id))
  const selectedIds = new Set(selectedRows.map((r) => r.id))

  type BatchInput = Parameters<typeof bulkUpdateTasks.mutate>[0]
  // POST /api/tasks/batch answers 200 even when it refuses some ids
  // (`{data:{ok, applied, failed}}`), so success is read from the body. A refusal
  // rolls the whole patch back, re-reads the truth, and names the rows.
  function runBatch(input: BatchInput, undoable: { revert: () => void; settle: () => void }, verb: string, onOk: () => void) {
    bulkUpdateTasks.mutate(input, {
      onError: () => { undoable.revert(); showError(`Could not ${verb}`) },
      onSuccess: (res) => {
        const data = (res as { data?: { ok?: boolean; failed?: { id: string; reason?: string }[] } } | null)?.data
        const failed = data?.failed ?? []
        if (failed.length > 0 || data?.ok === false) {
          undoable.revert()
          undoable.settle()
          const names = failed.slice(0, 3).map((f) => {
            const row = items.find((r) => r.id === f.id)
            return `"${(row && taskShortLabel(row)) || f.id}"`
          }).join(', ')
          showError(`Could not ${verb} ${failed.length || input.ids.length} of ${input.ids.length}${names ? `: ${names}` : ''}`)
          return
        }
        undoable.settle()
        onOk()
      },
    })
  }

  // Restore each id's previous value of `field` (the undo of a bulk assign/date).
  function undoField(rows: TaskRow[], field: 'assignee' | 'due_date') {
    const { settle } = patchActionItems((all) => all.map((a) => {
      const was = rows.find((r) => r.id === a.id)
      return was ? { ...a, [field]: was[field] ?? null } : a
    }))
    for (const r of rows) updateTask.mutate({ id: r.id, fields: { [field]: r[field] ?? null } }, { onSuccess: settle })
  }

  function bulkAssign(slug: string) {
    const rows = selectedRows
    const ids = rows.map((r) => r.id)
    runBatch({ ids, action: 'assign', value: slug }, patchRows(ids, { assignee: slug }), 'assign',
      () => showUndo(`Assigned ${ids.length} action items`, () => undoField(rows, 'assignee')))
    clearSelection()
  }

  function bulkDate(date: string | null) {
    const rows = selectedRows
    const ids = rows.map((r) => r.id)
    runBatch({ ids, action: 'due_date', value: date }, patchRows(ids, { due_date: date }), date ? 'set the date on' : 'clear the date on',
      () => showUndo(date ? `Dated ${ids.length} action items` : `Cleared the date on ${ids.length} action items`, () => undoField(rows, 'due_date')))
    clearSelection()
  }

  // No batch route for project: one write per row, one optimistic patch, one undo.
  function bulkProject(project: string | null, product: string | null) {
    const rows = selectedRows
    const ids = rows.map((r) => r.id)
    const { revert, settle } = patchRows(ids, { project_id: project, product_id: product })
    Promise.all(ids.map((id) => updateTask.mutateAsync({ id, fields: { project_id: project, product_id: product } })))
      .then(() => {
        settle()
        showUndo(`Moved ${ids.length} action items`, () => {
          const { settle: s2 } = patchActionItems((all) => all.map((a) => {
            const was = rows.find((r) => r.id === a.id)
            return was ? { ...a, project_id: was.project_id ?? null, product_id: was.product_id ?? null } : a
          }))
          for (const r of rows) updateTask.mutate({ id: r.id, fields: { project_id: r.project_id ?? null, product_id: r.product_id ?? null } }, { onSuccess: s2 })
        })
      })
      .catch(() => { revert(); showError('Could not move the action items'); settle() })
    clearSelection()
  }

  function bulkComplete() {
    const ids = selectedRows.map((r) => r.id)
    runBatch({ ids, action: 'complete' }, patchRows(ids, { status: 'done', completed: 1 }), 'complete', () =>
      showUndo(`Completed ${ids.length} action items`, () => {
        const { settle } = patchRows(ids, { status: 'todo', completed: 0 })
        for (const id of ids) updateTask.mutate({ id, fields: { status: 'todo', completed: 0 } }, { onSuccess: settle })
      }))
    clearSelection()
  }

  function bulkDelete() {
    const rows = selectedRows
    const ids = rows.map((r) => r.id)
    const patch = patchActionItems((all) => all.filter((a) => !ids.includes(a.id)))
    runBatch({ ids, action: 'delete' }, patch, 'delete', () =>
      showUndo(`Deleted ${ids.length} action items`, () => {
        for (const r of rows) restoreTask.mutate({ id: r.id, prevStatus: r.status && r.status !== 'deleted' ? r.status : 'todo' }, { onSuccess: patch.settle })
      }))
    clearSelection()
  }

  // ── render ───────────────────────────────────────────────────────────────
  const pending = items.filter((a) => !isTaskDone(a))
  const completed = items.filter((a) => isTaskDone(a))
  const ordered = [...pending, ...completed]
  const cap = maxVisible && !showAll && ordered.length > maxVisible ? maxVisible : ordered.length
  const shown = new Set(ordered.slice(0, cap).map((a) => a.id))

  function renderRow(item: TaskRow) {
    const done = isTaskDone(item)
    const project = item.project_id ? projectsBySlug.get(item.project_id) ?? null : null
    return (
      <SharedTaskRow
        key={item.id}
        task={item}
        // project={null}: TaskRowActions owns both project affordances (picker
        // chip + navigation arrow), so the row must not print ProjectTag too.
        project={null}
        // stack: title on its own line, the meta wraps beneath it (the meeting
        // page's half-width column and the card both squeeze an inline layout).
        stack
        isDone={done}
        onToggleDone={() => handleToggleDone(item)}
        isExpanded={expandedId === item.id}
        onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
        onOpenEditor={() => setFullEditorTask(item)}
        isSelected={selectedIds.has(item.id)}
        selectionActive={selectedIds.size > 0}
        onToggleSelect={() => toggleSelect(item.id)}
        selectBox
        // The date is an editable picker in rowActions; the static chip stays off.
        hideDue
        rowActions={
          <TaskRowActions
            isDone={done}
            projectId={item.project_id ?? null}
            productId={item.product_id ?? null}
            assignee={item.assignee}
            onAssigneeChange={(slug) => handleField(item, 'assignee', slug, 'owner')}
            due={item.due_date ?? null}
            onDueChange={(d) => handleField(item, 'due_date', d, 'date')}
            onToggleDone={() => handleToggleDone(item)}
            onOpenEditor={() => setFullEditorTask(item)}
            onProjectChange={(next, prd) => handleReassign(item, next, prd)}
            onDelete={() => handleDelete(item)}
          />
        }
      >
        <InlineDetail
          task={item}
          projectName={project?.name}
          primaryFolder={project?.primary_folder}
          onOpenEditor={() => setFullEditorTask(item)}
        />
      </SharedTaskRow>
    )
  }

  const visiblePending = pending.filter((a) => shown.has(a.id))
  const visibleCompleted = completed.filter((a) => shown.has(a.id))
  const hiddenCount = ordered.length - shown.size

  return (
    <div data-testid="meeting-action-list" data-meeting-id={meetingId}>
      {visiblePending.length > 0 && <div className="md-actions">{visiblePending.map(renderRow)}</div>}

      {visibleCompleted.length > 0 && (
        <div className="md-actions">
          <p style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--sk-t3)', margin: '6px 14px 2px' }}>
            Completed
          </p>
          {visibleCompleted.map(renderRow)}
        </div>
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          className="tk-btn tk-sm"
          style={{ margin: '6px 14px' }}
          onClick={() => setShowAll(true)}
        >
          Show {hiddenCount} more
        </button>
      )}
      {showAll && maxVisible && ordered.length > maxVisible && (
        <button type="button" className="tk-btn tk-sm" style={{ margin: '6px 14px' }} onClick={() => setShowAll(false)}>
          Show fewer
        </button>
      )}

      {/* Bottom of the list, pinned while it scrolls: one bar per list, so it
          can only reach this list's rows. */}
      {selectedIds.size >= 2 && (
        <MeetingActionBar
          count={selectedIds.size}
          onAssign={bulkAssign}
          onDate={bulkDate}
          onProject={bulkProject}
          onComplete={bulkComplete}
          onDelete={bulkDelete}
          onClear={clearSelection}
        />
      )}

      {fullEditorTask && (
        <TaskDetailPanel task={fullEditorTask} onClose={() => setFullEditorTask(null)} />
      )}
    </div>
  )
}

// The bar's pickers wear the same box as its buttons (.tk-btn.tk-sm).
const BAR_TRIGGER: React.CSSProperties = {
  boxShadow: 'inset 0 0 0 1px var(--sk-line2)', borderRadius: 'var(--r-ctl)', padding: '4px 9px', fontSize: 12, fontWeight: 500,
}

// ── the selection bar ───────────────────────────────────────────────────────
// Accent strip (a selection is the accent's job), scoped to the list above it.
// Assign / Date / Project open the same pickers the rows use; Complete and
// Delete act at once and both undo.
function MeetingActionBar({ count, onAssign, onDate, onProject, onComplete, onDelete, onClear }: {
  count: number
  onAssign: (slug: string) => void
  onDate: (date: string | null) => void
  onProject: (project: string | null, product: string | null) => void
  onComplete: () => void
  onDelete: () => void
  onClear: () => void
}) {
  const members = useMemo(() => getAssignableMembers().map((m) => ({ value: m.slug, label: m.name })), [])
  const { optionsWith } = useProjectPairs()
  const projectOptions = optionsWith('').map((o) => ({ value: o.value, label: o.label }))

  return (
    <div
      role="toolbar"
      aria-label={`${count} action items selected`}
      data-testid="meeting-action-bar"
      className="meeting-action-bar"
    >
      <span className="meeting-action-bar-n">{count} selected</span>
      <GhostSelect
        aria-label="Assign selected to"
        value=""
        triggerLabel="Assign"
        onChange={onAssign}
        options={members}
        searchable
        maxWidth={120}
        triggerColor="var(--sk-t1)"
        triggerStyle={BAR_TRIGGER}
      />
      {/* The date picker's trigger is the label "Date"; picking a day applies it. */}
      <span className="meeting-action-bar-date-host">
        <InlineDatePicker
          value={null}
          onChange={onDate}
          display={<span className="meeting-action-bar-date">Date</span>}
        />
      </span>
      <button type="button" className="tk-btn tk-sm" onClick={() => onDate(null)}>
        Clear date
      </button>
      <GhostSelect
        aria-label="Move selected to project"
        value=""
        triggerLabel="Project"
        onChange={(v) => { const d = decodePair(v); onProject(d.project_id ?? null, d.product_id ?? null) }}
        options={projectOptions}
        searchable
        maxWidth={120}
        triggerColor="var(--sk-t1)"
        triggerStyle={BAR_TRIGGER}
      />
      <button type="button" className="tk-btn tk-sm" onClick={onComplete}>
        <CheckCircle2 {...ICON_PROPS} size={12} aria-hidden /> Complete
      </button>
      <button type="button" className="tk-btn tk-sm meeting-action-bar-danger" onClick={onDelete}>
        <Trash2 {...ICON_PROPS} size={12} aria-hidden /> Delete
      </button>
      <button type="button" className="tk-btn tk-sm" onClick={onClear} aria-label="Clear selection">
        <X {...ICON_PROPS} size={12} aria-hidden /> Clear
      </button>
    </div>
  )
}

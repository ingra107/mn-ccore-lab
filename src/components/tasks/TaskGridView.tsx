import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Circle, Pencil, Archive, CalendarPlus, Link2, Plus } from 'lucide-react'
import InlineAssigneePicker from '../InlineAssigneePicker'
import InlineDatePicker from '../InlineDatePicker'
import { useUndoToast } from '../UndoToast'
import { formatBrandName } from '../BrandName'
import TaskContextMenu from './TaskContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useSubtasks } from '../../hooks/useApiData'
import { useCreateSubtask, useToggleSubtask } from '../../hooks/useMutations'
import { STATUS_OPTIONS, PRIORITY_OPTIONS, PRIORITY_ORDER, STATUS_ORDER } from '../../lib/taskConstants'
import type { TaskRow } from '../../lib/api'

interface TaskGridViewProps {
  tasks: TaskRow[]
  allTasks?: TaskRow[] // for resolving blocker names
  onStatusChange: (id: string, status: string) => void
  onFieldChange: (id: string, field: string, value: unknown) => void
  onSelect?: (task: TaskRow) => void
  onOpenDetail?: (task: TaskRow) => void
  onPeek?: (task: TaskRow) => void
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  focusedIndex?: number
  onFocusIndex?: (index: number) => void
  expandedTasks?: Set<string>
  onToggleExpand?: (id: string) => void
}

function parseBlockedByIds(blockedBy: string | null): string[] {
  if (!blockedBy) return []
  return blockedBy.split(',').map(s => s.trim()).filter(Boolean)
}

type SortKey = 'priority' | 'due_date' | 'assignee' | 'status' | 'title'

export default function TaskGridView({ tasks, allTasks, onStatusChange, onFieldChange, onSelect, onOpenDetail, onPeek, selectedIds, onToggleSelect, focusedIndex, onFocusIndex, expandedTasks: controlledExpanded, onToggleExpand: controlledToggleExpand }: TaskGridViewProps) {
  const { showUndo } = useUndoToast()
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortAsc, setSortAsc] = useState(true)
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set())
  const { state: contextMenuState, openMenu: openContextMenu, closeMenu: closeContextMenu } = useContextMenu()

  const expandedTasks = controlledExpanded ?? internalExpanded
  const toggleExpand = (id: string) => {
    if (controlledToggleExpand) {
      controlledToggleExpand(id)
    } else {
      setInternalExpanded(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
  }
  const contextMenuTask = useMemo(
    () => (contextMenuState.taskId ? tasks.find(t => t.id === contextMenuState.taskId) ?? null : null),
    [contextMenuState.taskId, tasks]
  )

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed - b.completed
      let cmp = 0
      switch (sortKey) {
        case 'priority': cmp = (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2); break
        case 'status': cmp = (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2); break
        case 'due_date': cmp = (a.due_date || '9999').localeCompare(b.due_date || '9999'); break
        case 'assignee': cmp = (a.assignee || '').localeCompare(b.assignee || ''); break
        case 'title': cmp = (a.title || a.description || '').localeCompare(b.title || b.description || ''); break
      }
      return sortAsc ? cmp : -cmp
    })
  }, [tasks, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const colStyle = { display: 'grid', gridTemplateColumns: '32px 1fr 120px 100px 120px 100px', alignItems: 'center' } as const

  return (
    <div className="table-container">
      {/* Column headers — clickable for sort */}
      <div style={{ ...colStyle, padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div />
        <SortableColumnHeader label="TITLE" field="title" active={sortKey} asc={sortAsc} onSort={handleSort} />
        <SortableColumnHeader label="ASSIGNEE" field="assignee" active={sortKey} asc={sortAsc} onSort={handleSort} />
        <SortableColumnHeader label="DUE DATE" field="due_date" active={sortKey} asc={sortAsc} onSort={handleSort} />
        <SortableColumnHeader label="STATUS" field="status" active={sortKey} asc={sortAsc} onSort={handleSort} />
        <SortableColumnHeader label="PRIORITY" field="priority" active={sortKey} asc={sortAsc} onSort={handleSort} />
      </div>

      {/* Rows */}
      {sorted.map((task, index) => (
        <Fragment key={task.id}>
          <TaskGridRow
            task={task}
            allTasks={allTasks || tasks}
            index={index}
            colStyle={colStyle}
            onStatusChange={onStatusChange}
            onFieldChange={onFieldChange}
            onSelect={onSelect}
            onOpenDetail={onOpenDetail}
            showUndo={showUndo}
            selected={selectedIds?.has(task.id)}
            onToggleSelect={onToggleSelect}
            isFocused={focusedIndex === index}
            onFocusIndex={onFocusIndex}
            onContextMenu={openContextMenu}
            expanded={expandedTasks.has(task.id)}
            onToggleExpand={() => toggleExpand(task.id)}
          />
          <AnimatePresence>
            {expandedTasks.has(task.id) && (
              <InlineSubtaskRow key={`sub-${task.id}`} taskId={task.id} />
            )}
          </AnimatePresence>
        </Fragment>
      ))}

      {sorted.length === 0 && (
        <div style={{ padding: '48px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: 'var(--slate)', opacity: 0.4 }}>
            No tasks match the current filters
          </p>
        </div>
      )}

      {/* Context menu */}
      <TaskContextMenu
        state={contextMenuState}
        task={contextMenuTask}
        onClose={closeContextMenu}
        onStatusChange={onStatusChange}
        onFieldChange={onFieldChange}
        onOpenDetail={onOpenDetail}
        onPeek={onPeek}
        onArchive={(t) => {
          const prev = t.status
          onStatusChange(t.id, 'done')
          showUndo('Archived task', () => onStatusChange(t.id, prev))
        }}
      />

      <style>{`
        .col-header {
          font-family: var(--font-sans);
          font-size: 10px;
          font-weight: 500;
          color: var(--slate);
          opacity: 0.5;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .task-grid-row:hover .subtask-expand-btn {
          opacity: 0.5 !important;
        }
        .task-grid-row:hover .subtask-expand-btn:hover {
          opacity: 0.8 !important;
        }
      `}</style>
    </div>
  )
}

// ── Sortable Column Header ─────────────────────────────────

function SortableColumnHeader({ label, field, active, asc, onSort }: { label: string; field: SortKey; active: SortKey; asc: boolean; onSort: (k: SortKey) => void }) {
  const isActive = active === field
  return (
    <button
      onClick={() => onSort(field)}
      className="col-header"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        opacity: isActive ? 0.9 : undefined,
        color: isActive ? 'var(--teal)' : undefined,
      }}
    >
      {label}
      {isActive && (asc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
    </button>
  )
}

// ── Grid Row ─────────────────────────────────────────────────

function TaskGridRow({
  task, allTasks, index, colStyle, onStatusChange, onFieldChange, onSelect, onOpenDetail, showUndo, selected, onToggleSelect, isFocused, onFocusIndex, onContextMenu, expanded, onToggleExpand,
}: {
  task: TaskRow
  allTasks: TaskRow[]
  index: number
  colStyle: React.CSSProperties
  onStatusChange: (id: string, status: string) => void
  onFieldChange: (id: string, field: string, value: unknown) => void
  onSelect?: (task: TaskRow) => void
  onOpenDetail?: (task: TaskRow) => void
  showUndo: (msg: string, onUndo: () => void) => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
  isFocused?: boolean
  onFocusIndex?: (index: number) => void
  onContextMenu?: (e: React.MouseEvent, taskId: string) => void
  expanded?: boolean
  onToggleExpand?: () => void
}) {
  const isDone = task.status === 'done'
  const blockerIds = useMemo(() => parseBlockedByIds(task.blocked_by), [task.blocked_by])
  const hasBlockers = blockerIds.length > 0
  const blockerNames = useMemo(() => {
    if (!hasBlockers) return ''
    return blockerIds
      .map(id => allTasks.find(t => t.id === id))
      .filter(Boolean)
      .map(t => t!.title || t!.description)
      .join(', ')
  }, [hasBlockers, blockerIds, allTasks])
  // isOverdue computed by InlineDatePicker now
  const rowRef = useRef<HTMLDivElement>(null)
  const [completingAnim, setCompletingAnim] = useState(false)
  const [rowFadeAnim, setRowFadeAnim] = useState(false)
  const prevStatusRef = useRef(task.status)

  // Scroll focused row into view
  useEffect(() => {
    if (isFocused && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isFocused])

  // Detect status change to 'done' for completion animation
  useEffect(() => {
    if (task.status === 'done' && prevStatusRef.current !== 'done') {
      setCompletingAnim(true)
      setRowFadeAnim(true)
      const timer = setTimeout(() => setCompletingAnim(false), 350)
      const fadeTimer = setTimeout(() => setRowFadeAnim(false), 200)
      return () => { clearTimeout(timer); clearTimeout(fadeTimer) }
    }
    prevStatusRef.current = task.status
  }, [task.status])

  return (
    <div
      ref={rowRef}
      style={{
        ...colStyle,
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        cursor: onSelect ? 'pointer' : 'default',
        opacity: isDone ? 0.5 : 1,
        transition: 'background 120ms ease, opacity 200ms ease',
        position: 'relative',
      }}
      className={`task-grid-row hover:bg-black/[0.02] dark:hover:bg-white/[0.02] ${isFocused ? 'task-row-focused' : ''} ${rowFadeAnim ? 'task-row-complete-fade' : ''}`}
      onClick={() => {
        onFocusIndex?.(index)
        onSelect?.(task)
      }}
      onContextMenu={(e) => onContextMenu?.(e, task.id)}
    >
      {/* Checkbox */}
      <div onClick={(e) => { e.stopPropagation(); onToggleSelect?.(task.id) }} style={{ cursor: 'pointer' }}>
        {onToggleSelect ? (
          <div style={{
            width: 16, height: 16, borderRadius: 4,
            border: selected ? 'none' : '1.5px solid var(--border-light)',
            background: selected ? 'var(--teal)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {selected && <CheckCircle2 size={10} style={{ color: 'white' }} />}
          </div>
        ) : <div style={{ width: 16 }} />}
      </div>

      {/* Title */}
      <div style={{ minWidth: 0, paddingRight: '12px' }}>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand?.() }}
            className="subtask-expand-btn"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
              display: 'flex', alignItems: 'center', flexShrink: 0,
              color: 'var(--slate)', opacity: expanded ? 0.7 : 0.25,
              transition: 'opacity var(--transition-fast) ease',
            }}
            title={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
          >
            <ChevronRight size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform var(--transition-fast) ease' }} />
          </button>
          {hasBlockers && (
            <span title={`Blocked by: ${blockerNames}`} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
              <Link2 size={12} style={{ color: 'var(--maroon)', opacity: 0.7 }} />
            </span>
          )}
          <span style={{
            fontSize: '13px',
            fontWeight: 400,
            color: 'var(--ink)',
            textDecoration: isDone ? 'line-through' : 'none',
            lineHeight: 1.4,
          }}>
            {formatBrandName(task.title || task.description)}
          </span>
        </div>
      </div>

      {/* Assignee — inline picker */}
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <InlineAssigneePicker
          value={task.assignee}
          onChange={(slug) => onFieldChange(task.id, 'assignee', slug)}
        />
      </div>

      {/* Due date — inline date picker */}
      <div onClick={(e) => e.stopPropagation()}>
        <InlineDatePicker
          value={task.due_date}
          onChange={(date) => onFieldChange(task.id, 'due_date', date)}
        />
      </div>

      {/* Status — inline dropdown (show Blocked label for tasks with blockers) */}
      <InlineCellSelect
        value={task.status}
        options={STATUS_OPTIONS}
        onChange={(val) => {
          const prev = task.status
          onStatusChange(task.id, val)
          showUndo(`Status → ${STATUS_OPTIONS.find(o => o.value === val)?.label}`, () => onStatusChange(task.id, prev))
        }}
        renderValue={(opt) => {
          // If task has blockers and is in blocked status, emphasize it
          const effectiveStatus = (hasBlockers && opt !== 'done') ? 'blocked' : opt
          const Icon = (STATUS_OPTIONS.find(o => o.value === effectiveStatus) || STATUS_OPTIONS[0])
          const IconComp = Icon.icon
          return (
            <span className={`flex items-center gap-1.5 status-transition ${completingAnim && opt === 'done' ? 'task-complete-anim' : ''}`} style={{ color: Icon.color }}>
              <IconComp size={13} />
              <span>{(hasBlockers && opt !== 'done' && opt !== 'blocked') ? 'Blocked' : Icon.label}</span>
            </span>
          )
        }}
      />

      {/* Priority — inline dropdown */}
      <InlineCellSelect
        value={task.priority}
        options={PRIORITY_OPTIONS}
        onChange={(val) => onFieldChange(task.id, 'priority', val)}
        renderValue={(val) => {
          const opt = PRIORITY_OPTIONS.find(o => o.value === val) || PRIORITY_OPTIONS[1]
          return <span className="status-transition" style={{ color: opt.color }}>{opt.label}</span>
        }}
      />

      {/* Hover row actions */}
      <div className="task-grid-row-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="task-grid-row-action-btn"
          onClick={() => onOpenDetail?.(task)}
          title="Edit task"
        >
          <Pencil size={12} />
          Edit
        </button>
        <button
          className="task-grid-row-action-btn"
          onClick={() => {
            const prev = task.status
            onStatusChange(task.id, 'done')
            showUndo('Archived task', () => onStatusChange(task.id, prev))
          }}
          title="Archive task"
        >
          <Archive size={12} />
        </button>
        <button
          className="task-grid-row-action-btn"
          title="Add to Meeting (coming soon)"
          style={{ opacity: 0.5 }}
        >
          <CalendarPlus size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Inline Subtask Row (Linear-style expand) ─────────────────

function InlineSubtaskRow({ taskId }: { taskId: string }) {
  const { data: subtasks = [] } = useSubtasks(taskId)
  const createSubtask = useCreateSubtask(taskId)
  const toggleSubtask = useToggleSubtask(taskId)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const completed = subtasks.filter((s) => s.completed).length
  const total = subtasks.length

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    createSubtask.mutate(newTitle.trim())
    setNewTitle('')
    inputRef.current?.focus()
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      style={{ overflow: 'hidden' }}
    >
      <div
        style={{
          padding: '6px 16px 10px 64px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(45, 138, 138, 0.02)',
        }}
      >
        {/* Progress indicator */}
        {total > 0 && (
          <div className="flex items-center gap-2 mb-1.5">
            <div style={{ flex: 1, height: 2, borderRadius: 1, background: 'rgba(201,168,76,0.12)', overflow: 'hidden' }}>
              <div style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%`, height: '100%', background: completed === total ? 'var(--teal)' : 'var(--gold)', borderRadius: 1, transition: 'width 0.3s ease' }} />
            </div>
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>{completed}/{total}</span>
          </div>
        )}

        {/* Subtask list */}
        {subtasks.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 py-1 group"
            style={{ transition: 'opacity 150ms ease' }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); toggleSubtask.mutate(s.id) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
            >
              {s.completed ? (
                <CheckCircle2 size={14} style={{ color: 'var(--teal)' }} />
              ) : (
                <Circle size={14} style={{ color: 'var(--slate)', opacity: 0.3 }} />
              )}
            </button>
            <span
              style={{
                fontSize: '12px',
                color: s.completed ? 'var(--slate)' : 'var(--ink)',
                textDecoration: s.completed ? 'line-through' : 'none',
                opacity: s.completed ? 0.5 : 0.8,
              }}
            >
              {s.title}
            </span>
          </div>
        ))}

        {/* Add subtask input */}
        <form onSubmit={handleAdd} className="flex items-center gap-2 mt-0.5" onClick={(e) => e.stopPropagation()}>
          <Plus size={12} style={{ color: 'var(--slate)', opacity: 0.25, flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add subtask..."
            style={{
              flex: 1, fontSize: '12px', background: 'none', border: 'none',
              outline: 'none', color: 'var(--ink)', padding: '3px 0',
            }}
          />
        </form>
      </div>
    </motion.div>
  )
}

// ── Inline Cell Select ───────────────────────────────────────

function InlineCellSelect({
  value, options, onChange, renderValue,
}: {
  value: string
  options: { value: string; label: string; color?: string }[]
  onChange: (val: string) => void
  renderValue: (val: string) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="inline-flex items-center gap-1 rounded-md transition-colors"
        style={{
          padding: '3px 8px',
          border: '1px solid transparent',
          background: 'none',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 400,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'rgba(45,138,138,0.04)' }}
        onMouseLeave={(e) => { if (!open) { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' } }}
      >
        {renderValue(value)}
        <ChevronDown size={10} style={{ opacity: 0.3, marginLeft: '2px' }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div
            className="absolute z-50 mt-1 rounded-lg overflow-hidden"
            style={{
              top: '100%', left: 0, minWidth: '130px',
              background: 'var(--cream)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-card-hover)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                  padding: '7px 12px', border: 'none', cursor: 'pointer',
                  background: opt.value === value ? 'rgba(45,138,138,0.06)' : 'none',
                  fontSize: '12px', fontWeight: opt.value === value ? 500 : 400,
                  color: opt.color || 'var(--ink)', textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(45,138,138,0.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = opt.value === value ? 'rgba(45,138,138,0.06)' : 'none' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

import { useState, useMemo, useEffect, useRef } from 'react'
import { Circle, CheckCircle2, Clock, AlertTriangle, ChevronDown, Pencil, Archive, CalendarPlus } from 'lucide-react'
import InlineAssigneePicker from '../InlineAssigneePicker'
import InlineDatePicker from '../InlineDatePicker'
import { useUndoToast } from '../UndoToast'
import { formatBrandName } from '../BrandName'
import type { TaskRow } from '../../lib/api'

interface TaskGridViewProps {
  tasks: TaskRow[]
  onStatusChange: (id: string, status: string) => void
  onFieldChange?: (id: string, field: string, value: unknown) => void
  onSelect?: (task: TaskRow) => void
  onOpenDetail?: (task: TaskRow) => void
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  focusedIndex?: number
  onFocusIndex?: (index: number) => void
}

type SortKey = 'priority' | 'due_date' | 'assignee' | 'status' | 'title'

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const statusOrder: Record<string, number> = { blocked: 0, in_progress: 1, todo: 2, done: 3 }

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do', icon: Circle, color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'var(--teal)' },
  { value: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'var(--maroon)' },
  { value: 'done', label: 'Done', icon: CheckCircle2, color: 'var(--green)' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'var(--slate)' },
  { value: 'medium', label: 'Medium', color: 'var(--gold)' },
  { value: 'high', label: 'High', color: 'var(--orange)' },
  { value: 'urgent', label: 'Urgent', color: 'var(--maroon)' },
]

export default function TaskGridView({ tasks, onStatusChange, onFieldChange, onSelect, onOpenDetail, selectedIds, onToggleSelect, focusedIndex, onFocusIndex }: TaskGridViewProps) {
  const { showUndo } = useUndoToast()
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed - b.completed
      let cmp = 0
      switch (sortKey) {
        case 'priority': cmp = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2); break
        case 'status': cmp = (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2); break
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
      {/* Sort row */}
      <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--slate)', opacity: 0.5 }}>
          Sort by:
        </span>
        <SortPill label="Due Date" field="due_date" active={sortKey} onSort={handleSort} />
        <SortPill label="Priority" field="priority" active={sortKey} onSort={handleSort} />
        <SortPill label="Status" field="status" active={sortKey} onSort={handleSort} />
        <SortPill label="Assignee" field="assignee" active={sortKey} onSort={handleSort} />
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--slate)', opacity: 0.4 }}>
          {tasks.filter(t => !t.completed).length} task{tasks.filter(t => !t.completed).length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Column headers */}
      <div style={{ ...colStyle, padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div />
        <span className="col-header">TITLE</span>
        <span className="col-header">ASSIGNEES</span>
        <span className="col-header">DUE DATE</span>
        <span className="col-header">STATUS</span>
        <span className="col-header">PRIORITY</span>
      </div>

      {/* Rows */}
      {sorted.map((task, index) => (
        <TaskGridRow
          key={task.id}
          task={task}
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
        />
      ))}

      {sorted.length === 0 && (
        <div style={{ padding: '48px 16px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--slate)', opacity: 0.4 }}>
            No tasks match the current filters
          </p>
        </div>
      )}

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
      `}</style>
    </div>
  )
}

// ── Sort Pill ────────────────────────────────────────────────

function SortPill({ label, field, active, onSort }: { label: string; field: SortKey; active: SortKey; onSort: (k: SortKey) => void }) {
  const isActive = active === field
  return (
    <button
      onClick={() => onSort(field)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 10px',
        borderRadius: '6px',
        border: isActive ? '1px solid var(--teal)' : '1px solid transparent',
        background: isActive ? 'rgba(45,138,138,0.08)' : 'none',
        color: isActive ? 'var(--teal)' : 'var(--slate)',
        fontFamily: 'var(--font-sans)',
        fontSize: '11px',
        fontWeight: isActive ? 500 : 400,
        cursor: 'pointer',
      }}
    >
      {label}
      {isActive && <ChevronDown size={10} />}
    </button>
  )
}

// ── Grid Row ─────────────────────────────────────────────────

function TaskGridRow({
  task, index, colStyle, onStatusChange, onFieldChange, onSelect, onOpenDetail, showUndo, selected, onToggleSelect, isFocused, onFocusIndex,
}: {
  task: TaskRow
  index: number
  colStyle: React.CSSProperties
  onStatusChange: (id: string, status: string) => void
  onFieldChange?: (id: string, field: string, value: unknown) => void
  onSelect?: (task: TaskRow) => void
  onOpenDetail?: (task: TaskRow) => void
  showUndo: (msg: string, onUndo: () => void) => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
  isFocused?: boolean
  onFocusIndex?: (index: number) => void
}) {
  const isDone = task.status === 'done'
  const _isOverdue = task.due_date && !task.completed && new Date(task.due_date + 'T23:59:59') < new Date()
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
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          fontWeight: 400,
          color: 'var(--ink)',
          textDecoration: isDone ? 'line-through' : 'none',
          lineHeight: 1.4,
        }}>
          {formatBrandName(task.title || task.description)}
        </span>
      </div>

      {/* Assignee — inline picker */}
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <InlineAssigneePicker
          value={task.assignee}
          onChange={(slug) => {
            if (onFieldChange) {
              onFieldChange(task.id, 'assignee', slug)
            } else {
              import('../../lib/api').then(({ updateTask }) => updateTask(task.id, { assignee: slug }))
            }
          }}
        />
      </div>

      {/* Due date — inline date picker */}
      <div onClick={(e) => e.stopPropagation()}>
        <InlineDatePicker
          value={task.due_date}
          onChange={(date) => {
            if (onFieldChange) {
              onFieldChange(task.id, 'due_date', date)
            } else {
              import('../../lib/api').then(({ updateTask }) => updateTask(task.id, { due_date: date }))
            }
          }}
        />
      </div>

      {/* Status — inline dropdown */}
      <InlineCellSelect
        value={task.status}
        options={STATUS_OPTIONS}
        onChange={(val) => {
          const prev = task.status
          onStatusChange(task.id, val)
          showUndo(`Status → ${STATUS_OPTIONS.find(o => o.value === val)?.label}`, () => onStatusChange(task.id, prev))
        }}
        renderValue={(opt) => {
          const Icon = (STATUS_OPTIONS.find(o => o.value === opt) || STATUS_OPTIONS[0])
          const IconComp = Icon.icon
          return (
            <span className={`flex items-center gap-1.5 status-transition ${completingAnim && opt === 'done' ? 'task-complete-anim' : ''}`} style={{ color: Icon.color }}>
              <IconComp size={13} />
              <span>{Icon.label}</span>
            </span>
          )
        }}
      />

      {/* Priority — inline dropdown */}
      <InlineCellSelect
        value={task.priority}
        options={PRIORITY_OPTIONS}
        onChange={(val) => {
          if (onFieldChange) {
            onFieldChange(task.id, 'priority', val)
          } else {
            import('../../lib/api').then(({ updateTask }) => updateTask(task.id, { priority: val }))
          }
        }}
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
          fontFamily: 'var(--font-sans)',
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
                  fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: opt.value === value ? 500 : 400,
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

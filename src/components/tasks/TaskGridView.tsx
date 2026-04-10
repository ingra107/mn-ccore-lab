import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Circle, Archive, Link2, Plus, MessageSquare, FolderOpen, ExternalLink, Play, Clipboard, Check } from 'lucide-react'
import InlineAssigneePicker from '../InlineAssigneePicker'
import InlineDatePicker from '../InlineDatePicker'
import { useUndoToast } from '../UndoToast'
import { formatBrandName } from '../BrandName'
import TaskContextMenu from './TaskContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useSubtasks } from '../../hooks/useApiData'
import { useCreateSubtask, useToggleSubtask } from '../../hooks/useMutations'
import { STATUS_OPTIONS, STATUS_BG, PRIORITY_OPTIONS, PRIORITY_CONFIG, PRIORITY_ORDER, STATUS_ORDER } from '../../lib/taskConstants'
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
  const [sortKey, setSortKey] = useState<SortKey>('due_date')
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

  const colStyle = { display: 'grid', gridTemplateColumns: '32px minmax(200px, 2fr) 1fr 1fr 1fr 1fr 60px', alignItems: 'center' } as const

  const ROW_HEIGHT = 44
  const parentRef = useRef<HTMLDivElement>(null)

  // Estimate row size: expanded rows are taller to account for subtask section
  const estimateSize = useCallback(
    (index: number) => {
      const task = sorted[index]
      if (task && expandedTasks.has(task.id)) {
        return ROW_HEIGHT + 160 // base row + estimated subtask section
      }
      return ROW_HEIGHT
    },
    [sorted, expandedTasks],
  )

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 15,
  })

  // Re-measure all rows when expandedTasks changes
  useEffect(() => {
    virtualizer.measure()
  }, [expandedTasks, virtualizer])

  // Scroll focused row into view within the virtual list
  useEffect(() => {
    if (focusedIndex != null && focusedIndex >= 0 && focusedIndex < sorted.length) {
      virtualizer.scrollToIndex(focusedIndex, { align: 'auto', behavior: 'smooth' })
    }
  }, [focusedIndex, sorted.length, virtualizer])

  return (
    <div className="table-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Column headers — clickable for sort, hidden on mobile */}
      <div className="task-grid-header" style={{ ...colStyle, padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div />
        <SortableColumnHeader label="TITLE" field="title" active={sortKey} asc={sortAsc} onSort={handleSort} />
        <SortableColumnHeader label="ASSIGNEE" field="assignee" active={sortKey} asc={sortAsc} onSort={handleSort} />
        <SortableColumnHeader label="DUE DATE" field="due_date" active={sortKey} asc={sortAsc} onSort={handleSort} />
        <SortableColumnHeader label="STATUS" field="status" active={sortKey} asc={sortAsc} onSort={handleSort} />
        <SortableColumnHeader label="PRIORITY" field="priority" active={sortKey} asc={sortAsc} onSort={handleSort} />
        <div /> {/* Actions column spacer */}
      </div>

      {/* Virtualized scrollable area */}
      <div
        ref={parentRef}
        style={{ flex: 1, overflow: 'auto', minHeight: Math.min(sorted.length * ROW_HEIGHT + 4, 600) }}
      >
        {sorted.length > 0 ? (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const task = sorted[virtualRow.index]
              const isExpanded = expandedTasks.has(task.id)
              return (
                <div
                  key={task.id}
                  data-index={virtualRow.index}
                  ref={(el) => {
                    // Dynamic measurement for expanded rows
                    if (el) virtualizer.measureElement(el)
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <TaskGridRow
                    task={task}
                    allTasks={allTasks || tasks}
                    index={virtualRow.index}
                    colStyle={colStyle}
                    onStatusChange={onStatusChange}
                    onFieldChange={onFieldChange}
                    onSelect={onSelect}
                    onOpenDetail={onOpenDetail}
                    showUndo={showUndo}
                    selected={selectedIds?.has(task.id)}
                    onToggleSelect={onToggleSelect}
                    isFocused={focusedIndex === virtualRow.index}
                    onFocusIndex={onFocusIndex}
                    onContextMenu={openContextMenu}
                    expanded={isExpanded}
                    onToggleExpand={() => toggleExpand(task.id)}
                  />
                  <AnimatePresence>
                    {isExpanded && (
                      <InlineSubtaskRow key={`sub-${task.id}`} taskId={task.id} />
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ padding: '48px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
              No tasks match the current filters
            </p>
          </div>
        )}
      </div>

      {/* Calculations row — Notion-style summary (NOT virtualized, stays fixed at bottom) */}
      {sorted.length > 0 && <div style={{ flexShrink: 0 }}><CalculationsRow tasks={sorted} /></div>}

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
        @media (max-width: 768px) {
          .task-grid-header {
            display: none !important;
          }
          .task-grid-row {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 6px 12px !important;
            padding: 12px 16px !important;
            align-items: center !important;
          }
          .task-grid-row .task-row-checkbox {
            display: none !important;
          }
          .task-grid-row .task-row-title {
            order: 1 !important;
            width: 100% !important;
            padding-right: 0 !important;
          }
          .task-grid-row .task-row-meta {
            order: 2 !important;
          }
          .task-grid-row .task-row-status {
            order: 3 !important;
          }
          .task-grid-row .task-row-priority {
            order: 4 !important;
          }
          .task-grid-row .task-grid-row-actions {
            display: none !important;
          }
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
  // isOverdue computed by InlineDatePicker now
  const rowRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [quickComment, setQuickComment] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [completingAnim, setCompletingAnim] = useState(false)
  const [rowFadeAnim, setRowFadeAnim] = useState(false)
  const prevStatusRef = useRef(task.status)

  // Scroll-into-view is handled by the virtualizer at the parent level

  // Detect status change to 'done' for completion animation
  useEffect(() => {
    if (task.status === 'done' && prevStatusRef.current !== 'done') {
      setCompletingAnim(true)
      setRowFadeAnim(true)
      const timer = setTimeout(() => setCompletingAnim(false), 350)
      const fadeTimer = setTimeout(() => setRowFadeAnim(false), 650)
      return () => { clearTimeout(timer); clearTimeout(fadeTimer) }
    }
    prevStatusRef.current = task.status
  }, [task.status])

  return (
    <div
      ref={rowRef}
      data-testid={`task-row-${task.id}`}
      style={{
        ...colStyle,
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        borderLeft: `3px solid ${
          task.priority === 'urgent' ? 'var(--maroon)' :
          task.priority === 'high' ? 'var(--orange)' :
          'transparent'
        }`,
        cursor: onSelect ? 'pointer' : 'default',
        opacity: isDone ? 0.5 : 1,
        transition: 'background 150ms ease, opacity 150ms ease',
        position: 'relative',
      }}
      className={`task-grid-row hover:bg-black/[0.02] dark:hover:bg-white/[0.02] ${isFocused ? 'task-row-focused' : ''} ${rowFadeAnim ? 'task-row-complete-fade' : ''}`}
      tabIndex={0}
      onClick={() => {
        onFocusIndex?.(index)
        onSelect?.(task)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onOpenDetail?.(task) }
      }}
      onContextMenu={(e) => onContextMenu?.(e, task.id)}
    >
      {/* Checkbox */}
      <div className="task-row-checkbox" onClick={(e) => { e.stopPropagation(); onToggleSelect?.(task.id) }} style={{ cursor: 'pointer' }}>
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
      <div className="task-row-title" style={{ minWidth: 0, paddingRight: '12px' }}>
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
            <span className="relative group" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
              <Link2 size={12} style={{ color: 'var(--maroon)', opacity: 0.7 }} />
              <span
                className="absolute left-full ml-2 hidden group-hover:block z-30 rounded-lg shadow-lg border py-2 px-3"
                style={{
                  backgroundColor: 'var(--cream)',
                  borderColor: 'var(--border-light)',
                  minWidth: '180px',
                  maxWidth: '260px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              >
                <span className="text-[9px] uppercase tracking-wider block mb-1.5" style={{ color: 'var(--maroon)', fontWeight: 600 }}>Blocked by</span>
                {blockerIds.map(id => {
                  const bt = allTasks.find(t => t.id === id)
                  if (!bt) return null
                  return (
                    <span key={id} className="flex items-center gap-1.5 text-[11px] mb-1" style={{ color: 'var(--ink)' }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: bt.completed ? 'var(--green)' : bt.status === 'in_progress' ? 'var(--teal)' : 'var(--slate)',
                        flexShrink: 0,
                      }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bt.title || bt.description}
                      </span>
                    </span>
                  )
                })}
              </span>
            </span>
          )}
          {editingTitle ? (
            <input
              ref={titleInputRef}
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { onFieldChange(task.id, 'title', titleDraft); setEditingTitle(false) }
                if (e.key === 'Escape') setEditingTitle(false)
                e.stopPropagation()
              }}
              onBlur={() => { if (titleDraft.trim() && titleDraft !== task.title) onFieldChange(task.id, 'title', titleDraft); setEditingTitle(false) }}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 'var(--value-size)',
                fontWeight: 400,
                color: 'var(--ink)',
                background: 'var(--cream)',
                border: '1px solid var(--teal)',
                borderRadius: '4px',
                padding: '2px 6px',
                outline: 'none',
                width: '100%',
              }}
            />
          ) : (
            <span
              role="button"
              tabIndex={0}
              data-testid={`task-title-${task.id}`}
              onClick={(e) => { e.stopPropagation(); onOpenDetail?.(task) }}
              onDoubleClick={(e) => { e.stopPropagation(); setTitleDraft(task.title || task.description); setEditingTitle(true) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpenDetail?.(task) } if (e.key === 'F2') { e.stopPropagation(); setTitleDraft(task.title || task.description); setEditingTitle(true) } }}
              style={{
                fontSize: 'var(--value-size)',
                fontWeight: 400,
                color: 'var(--ink)',
                textDecoration: isDone ? 'line-through' : 'none',
                lineHeight: 1.4,
                cursor: onOpenDetail ? 'pointer' : 'default',
                borderRadius: '3px',
                padding: '1px 4px',
                margin: '-1px -4px',
                transition: 'background var(--transition-fast) ease',
              }}
              className="task-title-clickable"
            >
              {formatBrandName(task.title || task.description)}
            </span>
          )}
          {task.source && task.source !== 'manual' && (
            <span
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '8px',
                backgroundColor: task.source === 'meeting' ? 'rgba(45,138,138,0.1)' :
                  task.source === 'recurrence' ? 'rgba(201,168,76,0.1)' :
                  'rgba(148,163,184,0.1)',
                color: task.source === 'meeting' ? 'var(--teal)' :
                  task.source === 'recurrence' ? 'var(--gold)' :
                  'var(--slate)',
                flexShrink: 0,
                lineHeight: '14px',
              }}
            >
              {task.source === 'meeting' ? 'meeting' : task.source === 'recurrence' ? 'recurring' : task.source}
            </span>
          )}
          {!isDone && task.created_at && (() => {
            const age = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86400000)
            if (age < 14) return null
            return (
              <span
                title={`Open for ${age} days`}
                style={{
                  fontSize: '9px',
                  padding: '1px 5px',
                  borderRadius: '8px',
                  backgroundColor: age > 30 ? 'rgba(122,0,25,0.1)' : 'rgba(194,65,12,0.1)',
                  color: age > 30 ? 'var(--maroon)' : 'var(--orange)',
                  flexShrink: 0,
                  lineHeight: '14px',
                }}
              >
                {age}d
              </span>
            )
          })()}
          {task.project_id && (
            <span
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '8px',
                backgroundColor: 'rgba(45,138,138,0.06)',
                color: 'var(--teal)',
                flexShrink: 0,
                lineHeight: '14px',
                opacity: 0.7,
                maxWidth: '100px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={task.project_id}
            >
              {task.project_id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 20)}
            </span>
          )}
          <TaskKeyLinks task={task} />
        </div>
      </div>

      {/* Metadata row — wraps on mobile */}
      <div className="task-row-meta flex items-center gap-1.5" data-testid={`task-assignee-${task.id}`} onClick={(e) => e.stopPropagation()}>
        <InlineAssigneePicker
          value={task.assignee}
          onChange={(slug) => onFieldChange(task.id, 'assignee', slug)}
          compact
        />
        {/* Unacknowledged indicator — gold dot when assigned but not acknowledged */}
        {task.assignee && !task.acknowledged_at && !isDone && (
          <span
            title="Not yet acknowledged"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: 'var(--gold)',
              flexShrink: 0,
              opacity: 0.8,
            }}
          />
        )}
      </div>

      {/* Due date — inline date picker */}
      <div className="task-row-meta" data-testid={`task-due-${task.id}`} onClick={(e) => e.stopPropagation()}>
        <InlineDatePicker
          value={task.due_date}
          onChange={(date) => onFieldChange(task.id, 'due_date', date)}
        />
      </div>

      {/* Status — inline dropdown (show Blocked label for tasks with blockers) */}
      <div className="task-row-status" data-testid={`task-status-${task.id}`}>
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
            <span
              className={`flex items-center gap-1.5 status-transition ${completingAnim && opt === 'done' ? 'task-complete-anim' : ''}`}
              style={{
                color: Icon.color,
                background: STATUS_BG[effectiveStatus] || STATUS_BG.todo,
                padding: '2px 8px',
                borderRadius: '9999px',
              }}
            >
              <IconComp size={13} />
              <span>{(hasBlockers && opt !== 'done' && opt !== 'blocked') ? 'Blocked' : Icon.label}</span>
            </span>
          )
        }}
      />
      {task.status === 'in_progress' && task.created_at && (() => {
        const days = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86400000)
        if (days < 7) return null
        return (
          <span
            title={`In progress for ${days} days — consider updating`}
            style={{ fontSize: '8px', color: 'var(--orange)', opacity: 0.7, marginTop: '1px' }}
          >
            ⚠ {days}d
          </span>
        )
      })()}
      </div>

      {/* Priority — inline dropdown */}
      <div className="task-row-priority" data-testid={`task-priority-${task.id}`}>
      <InlineCellSelect
        value={task.priority}
        options={PRIORITY_OPTIONS}
        onChange={(val) => onFieldChange(task.id, 'priority', val)}
        renderValue={(val) => {
          const opt = PRIORITY_OPTIONS.find(o => o.value === val) || PRIORITY_OPTIONS[1]
          const cfg = PRIORITY_CONFIG[val as keyof typeof PRIORITY_CONFIG]
          return (
            <span className="status-transition" style={{
              color: opt.color,
              background: cfg?.bg || 'rgba(100, 116, 139, 0.1)',
              padding: '2px 8px',
              borderRadius: '9999px',
            }}>
              {opt.label}
            </span>
          )
        }}
      />
      </div>

      {/* Row actions — own grid column, not absolute */}
      <div className="task-grid-row-actions" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
        <button
          className="task-grid-row-action-btn"
          onClick={() => setQuickComment(!quickComment)}
          title="Quick comment"
        >
          <MessageSquare size={12} />
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
      </div>

      {/* Quick comment input — below the row */}
      {quickComment && (
        <div
          style={{ gridColumn: '1 / -1', padding: '4px 16px 8px 48px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-2">
            <input
              autoFocus
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && commentDraft.trim()) {
                  fetch(`/api/tasks/${task.id}/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: commentDraft.trim() }),
                  })
                  setCommentDraft('')
                  setQuickComment(false)
                  showUndo('Comment added', () => {})
                }
                if (e.key === 'Escape') { setQuickComment(false); setCommentDraft('') }
                e.stopPropagation()
              }}
              onBlur={() => { if (!commentDraft.trim()) { setQuickComment(false); setCommentDraft('') } }}
              placeholder="Add a quick note..."
              className="flex-1 text-[12px] px-2.5 py-1.5 rounded-lg border bg-transparent"
              style={{ color: 'var(--ink)', borderColor: 'var(--teal)', outline: 'none' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Key Link Icons ──────────────────────────────────────────

function KeyLinkIcon({ url, label }: { url: string; label?: string | null }) {
  const [copied, setCopied] = useState(false)

  const isLocalPath = url.startsWith('file:///') || url.startsWith('C:') || url.startsWith('/') && !url.startsWith('//')
  const isBat = url.endsWith('.bat') || url.endsWith('.cmd') || url.endsWith('.ps1')
  const isHttp = url.startsWith('http')

  let Icon = ExternalLink
  let href = url
  if (isBat) {
    Icon = Play
    const cleanPath = url.replace('file:///', '')
    href = `mnccore://launch/${cleanPath}`
  } else if (isLocalPath) {
    Icon = FolderOpen
    const cleanPath = url.replace('file:///', '')
    href = `mnccore://open/${cleanPath}`
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <span className="inline-flex items-center gap-0.5" style={{ flexShrink: 0 }}>
      <a
        href={href}
        target={isHttp ? '_blank' : undefined}
        rel={isHttp ? 'noopener noreferrer' : undefined}
        onClick={(e) => e.stopPropagation()}
        title={label || url}
        style={{
          color: 'var(--teal)',
          opacity: 0.5,
          transition: 'opacity var(--transition-fast) ease',
          display: 'inline-flex',
          alignItems: 'center',
          padding: '1px',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
      >
        <Icon size={14} />
      </a>
      <button
        onClick={handleCopy}
        title="Copy link"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: copied ? 'var(--green)' : 'var(--slate)',
          opacity: copied ? 1 : 0.35,
          transition: 'opacity var(--transition-fast) ease, color var(--transition-fast) ease',
          display: 'inline-flex',
          alignItems: 'center',
          padding: '1px',
        }}
        onMouseEnter={(e) => { if (!copied) e.currentTarget.style.opacity = '0.8' }}
        onMouseLeave={(e) => { if (!copied) e.currentTarget.style.opacity = '0.35' }}
      >
        {copied ? <Check size={11} /> : <Clipboard size={11} />}
      </button>
    </span>
  )
}

function TaskKeyLinks({ task }: { task: TaskRow }) {
  const links = [
    { url: task.key_link_1, desc: task.key_link_1_desc },
    { url: task.key_link_2, desc: task.key_link_2_desc },
    { url: task.key_link_3, desc: task.key_link_3_desc },
  ].filter(l => l.url)

  if (links.length === 0) return null

  return (
    <span className="inline-flex items-center gap-1" style={{ flexShrink: 0 }}>
      {links.map((l, i) => (
        <KeyLinkIcon key={i} url={l.url!} label={l.desc} />
      ))}
    </span>
  )
}

// ── Inline Subtask Row (Linear-style expand) ─────────────────

function InlineSubtaskRow({ taskId }: { taskId: string }) {
  const { data: subtasks = [] } = useSubtasks(taskId)
  const createSubtask = useCreateSubtask(taskId)
  const toggleSubtask = useToggleSubtask(taskId)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input when row appears
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 200)
    return () => clearTimeout(timer)
  }, [])

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
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>{completed}/{total}</span>
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

// ── Calculations Row (Notion-style summary) ──────────────────

function CalculationsRow({ tasks }: { tasks: TaskRow[] }) {
  const overdueCount = tasks.filter(t => !t.completed && t.due_date && t.due_date < new Date().toISOString().split('T')[0]).length
  const todoCount = tasks.filter(t => t.status === 'todo').length
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length
  const doneCount = tasks.filter(t => t.completed).length

  const pct = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0

  const stats = [
    { label: 'Count', value: tasks.length },
    ...(overdueCount > 0 ? [{ label: 'Overdue', value: overdueCount, color: 'var(--maroon)' }] : []),
    { label: 'To Do', value: todoCount },
    { label: 'In Progress', value: inProgressCount, color: 'var(--teal)' },
    ...(doneCount > 0 ? [{ label: 'Done', value: `${doneCount} (${pct}%)`, color: 'var(--green)' }] : []),
  ]

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--sp-xl)',
        padding: '8px 16px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(45, 138, 138, 0.02)',
      }}
    >
      {stats.map(s => (
        <span key={s.label} style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
          {s.label}{' '}
          <span style={{ fontWeight: 600, color: s.color || 'var(--slate)', opacity: 1 }}>
            {s.value}
          </span>
        </span>
      ))}
    </div>
  )
}

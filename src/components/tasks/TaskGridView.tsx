import { useState, useMemo, useEffect, useRef, useCallback, useId } from 'react'
import { useSelectMode } from '../../hooks/useSelectMode'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Archive, Link2, Plus, MessageSquare, Clipboard, Check, GripVertical, Pin, RotateCcw, Square } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import InlineAssigneePicker from '../InlineAssigneePicker'
import InlineDatePicker from '../InlineDatePicker'
import { useUndoToast } from '../UndoToast'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'
import { classifyUrl } from '../../lib/urlClassify'
import TaskTitle from './TaskTitle'
import TaskContextMenu from './TaskContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useSubtasks, useProjects } from '../../hooks/useApiData'
import { useCreateSubtask, useToggleSubtask, useReorderSubtasks } from '../../hooks/useMutations'
import { STATUS_OPTIONS, STATUS_BG, PRIORITY_OPTIONS, PRIORITY_CONFIG, PRIORITY_ORDER, STATUS_ORDER } from '../../lib/taskConstants'
import { useTableConfig } from '../../hooks/useTableConfig'
import { ColumnHeader } from '../table'
import type { TaskRow } from '../../lib/api'
import { useLongPress } from '../../hooks/useLongPress'
import { useSwipeAction } from '../../hooks/useSwipeAction'
import { motion } from 'framer-motion'
import { localDateKey } from '../../lib/dateUtils'
import { parseDbUtc } from '../../lib/time'
import { ICON_PROPS } from '../../lib/iconProps'

// ── Column definitions for resize + tab nav ─────────────────
// Full column set: checkbox + DATA_COLUMNS + actions
// Sortable data columns (excludes checkbox and actions which are pinned at edges)
const DATA_COLUMNS = ['title', 'assignee', 'project', 'due_date', 'status', 'priority'] as const

const DEFAULT_WIDTHS: Record<string, number> = {
  checkbox: 32,
  title: 0, // flex (minmax)
  assignee: 110,
  project: 130,
  due_date: 100,
  status: 120,
  priority: 80,
  actions: 90,
}

const MIN_WIDTHS: Record<string, number> = {
  checkbox: 32,
  title: 150,
  assignee: 60,
  project: 60,
  due_date: 60,
  status: 60,
  priority: 60,
  actions: 90,
}

// Display labels for data columns
const COLUMN_LABELS: Record<string, string> = {
  title: 'TITLE',
  assignee: 'ASSIGNEE',
  project: 'PROJECT',
  due_date: 'DUE DATE',
  status: 'STATUS',
  priority: 'PRIORITY',
}

// Legacy: static editable column indices (used as fallback)
const EDITABLE_COL_INDICES = [1, 2, 3, 4, 5, 6] // title, assignee, project, due_date, status, priority

const DEFAULT_TABLE_CONFIG = {
  sortKey: 'due_date',
  sortAsc: true,
  sorts: [{ key: 'due_date', asc: true }],
  columnWidths: { ...DEFAULT_WIDTHS },
  filters: {},
}

function buildGridTemplate(widths: Record<string, number>, orderedDataCols: string[]): string {
  // Always: checkbox first, actions last, data columns in orderedDataCols order
  const parts: string[] = []
  // Checkbox
  parts.push(`${widths.checkbox ?? DEFAULT_WIDTHS.checkbox}px`)
  // Data columns in order
  for (const col of orderedDataCols) {
    if (col === 'title') {
      const w = widths.title && widths.title > 0 ? widths.title : 0
      parts.push(w > 0 ? `${w}px` : 'minmax(200px, 3fr)')
    } else {
      const w = widths[col] ?? DEFAULT_WIDTHS[col]
      parts.push(`${w}px`)
    }
  }
  // Actions
  parts.push(`${widths.actions ?? DEFAULT_WIDTHS.actions}px`)
  return parts.join(' ')
}

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
  // Range-select (shift+click). anchorId is the pivot task; onSelectRange
  // receives (targetId, orderedIds, anchorId) — same signature as selectRange
  // in useSelection. Optional: callers that don't need range-select omit these.
  anchorId?: string | null
  onSelectRange?: (targetId: string, orderedIds: string[], anchor: string | null) => void
  focusedIndex?: number
  onFocusIndex?: (index: number) => void
  expandedTasks?: Set<string>
  onToggleExpand?: (id: string) => void
  onPinToFocus?: (id: string) => void
  pinnedIds?: Set<string>
  isLoading?: boolean
}

function parseBlockedByIds(blockedBy: string | null): string[] {
  if (!blockedBy) return []
  return blockedBy.split(',').map(s => s.trim()).filter(Boolean)
}

type SortKey = 'priority' | 'due_date' | 'assignee' | 'status' | 'title' | 'project'

export default function TaskGridView({ tasks, allTasks, onStatusChange, onFieldChange, onSelect, onOpenDetail, onPeek, selectedIds, onToggleSelect, anchorId, onSelectRange, focusedIndex, onFocusIndex, expandedTasks: controlledExpanded, onToggleExpand: controlledToggleExpand, onPinToFocus, pinnedIds, isLoading }: TaskGridViewProps) {
  const { showUndo } = useUndoToast()

  // ── Table config (persisted sort + column widths + column order) ──
  const { config: tableConfig, setSortKey: handleSortKey, addSecondarySort, setColumnWidth, setColumnOrder, reset: resetTableConfig } = useTableConfig('task-grid', DEFAULT_TABLE_CONFIG)
  const sortKey = tableConfig.sortKey as SortKey
  const sortAsc = tableConfig.sortAsc
  const sorts = tableConfig.sorts
  const colWidths = tableConfig.columnWidths

  // ── Ordered data columns (user-reorderable, excludes checkbox/actions) ──
  const orderedDataCols = useMemo(() => {
    const order = tableConfig.columnOrder
    if (!order?.length) return [...DATA_COLUMNS]
    // Build ordered list from saved order, only including valid data columns
    const validSet = new Set<string>(DATA_COLUMNS)
    const result: string[] = []
    for (const key of order) {
      if (validSet.has(key)) {
        result.push(key)
        validSet.delete(key)
      }
    }
    // Append any new columns not in saved order
    for (const key of DATA_COLUMNS) {
      if (validSet.has(key)) result.push(key)
    }
    return result
  }, [tableConfig.columnOrder])

  // ── Column reorder DnD (separate from subtask DnD) ──
  // TouchSensor delay 300ms — longer than row drag so a tap on header
  // sorts (not drags) by default.
  const columnSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
  )

  const handleColumnDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedDataCols.indexOf(active.id as string)
    const newIndex = orderedDataCols.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    const newOrder = arrayMove(orderedDataCols, oldIndex, newIndex)
    setColumnOrder(newOrder)
  }, [orderedDataCols, setColumnOrder])

  // ── Select-mode affordance — true while Ctrl/Meta is physically held ──
  // Extracted to useSelectMode (Phase G) — gated on whether onToggleSelect
  // is provided so surfaces without selection skip the listeners entirely.
  const selectModeActive = useSelectMode(!!onToggleSelect)

  // ── Column resize state ──
  const [resizingCol, setResizingCol] = useState<string | null>(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)

  const handleResizeStart = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingCol(col)
    resizeStartX.current = e.clientX
    resizeStartWidth.current = colWidths[col] ?? DEFAULT_WIDTHS[col]
  }, [colWidths])

  useEffect(() => {
    if (!resizingCol) return
    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current
      const minW = MIN_WIDTHS[resizingCol] ?? 60
      const newWidth = Math.max(minW, resizeStartWidth.current + delta)
      setColumnWidth(resizingCol, newWidth)
    }
    const onMouseUp = () => setResizingCol(null)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
  }, [resizingCol, setColumnWidth])

  const handleResizeDoubleClick = useCallback((col: string) => {
    setColumnWidth(col, DEFAULT_WIDTHS[col])
  }, [setColumnWidth])

  // ── Cell focus for Tab navigation ──
  const [focusedCell, setFocusedCell] = useState<[number, number] | null>(null) // [rowIndex, colIndex]

  const handleCellTab = useCallback((rowIndex: number, colIndex: number, shift: boolean) => {
    const currentEditableIdx = EDITABLE_COL_INDICES.indexOf(colIndex)
    if (currentEditableIdx === -1) return
    if (shift) {
      if (currentEditableIdx > 0) {
        setFocusedCell([rowIndex, EDITABLE_COL_INDICES[currentEditableIdx - 1]])
      } else if (rowIndex > 0) {
        setFocusedCell([rowIndex - 1, EDITABLE_COL_INDICES[EDITABLE_COL_INDICES.length - 1]])
      }
    } else {
      if (currentEditableIdx < EDITABLE_COL_INDICES.length - 1) {
        setFocusedCell([rowIndex, EDITABLE_COL_INDICES[currentEditableIdx + 1]])
      } else {
        setFocusedCell([rowIndex + 1, EDITABLE_COL_INDICES[0]])
      }
    }
  }, [])

  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set())

  // Project data for the PROJECT column
  const { data: projects = [] } = useProjects()
  const projectMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) {
      if (p.slug) map.set(p.slug, p.short_name || p.title)
    }
    return map
  }, [projects])
  const projectOptions = useMemo(() => [
    { value: '', label: 'None' },
    ...projects.filter(p => p.slug).map(p => ({ value: p.slug, label: p.short_name || p.title })),
  ], [projects])
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

  // Compare two tasks by a single sort key
  const compareByKey = useCallback((a: TaskRow, b: TaskRow, key: string): number => {
    switch (key) {
      case 'priority': return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
      case 'status': return (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2)
      case 'due_date': return (a.due_date || '9999').localeCompare(b.due_date || '9999')
      case 'assignee': return (a.assignee || '').localeCompare(b.assignee || '')
      case 'title': return (a.title || a.description || '').localeCompare(b.title || b.description || '')
      case 'project': return (projectMap.get(a.project_id || '') || a.project_id || '').localeCompare(projectMap.get(b.project_id || '') || b.project_id || '')
      default: return 0
    }
  }, [projectMap])

  const sorted = useMemo(() => {
    const activeSorts = sorts.length > 0 ? sorts : [{ key: sortKey, asc: sortAsc }]
    return [...tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed - b.completed
      // Chain through sort levels (max 2)
      for (const s of activeSorts) {
        const cmp = compareByKey(a, b, s.key)
        if (cmp !== 0) return s.asc ? cmp : -cmp
      }
      return 0
    })
  }, [tasks, sorts, sortKey, sortAsc, compareByKey])

  // Stable sorted id list for range-select (respects current sort order).
  const sortedIds = useMemo(() => sorted.map(t => t.id), [sorted])

  /** Regular click replaces sort; Shift+Click adds secondary sort */
  const handleSort = useCallback((key: string, shiftKey?: boolean) => {
    if (shiftKey) {
      addSecondarySort(key)
    } else {
      handleSortKey(key)
    }
  }, [handleSortKey, addSecondarySort])

  const gridTemplate = useMemo(() => buildGridTemplate(colWidths, orderedDataCols), [colWidths, orderedDataCols])
  const colStyle = useMemo(() => ({
    display: 'grid' as const,
    gridTemplateColumns: gridTemplate,
    alignItems: 'center' as const,
    // 4px → 10px: hover-action icons sat flush against Priority pill,
    // reading as overlap. GH #22. r7 2026-04-22.
    gap: '0 10px',
  }), [gridTemplate])

  const parentRef = useRef<HTMLDivElement>(null)

  // Read row height from CSS variable (density-aware)
  const [rowHeight, setRowHeight] = useState(44)
  // R4 hotfix: mobile viewport forces flex-wrap rows → tall stacked layout
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const readHeight = () => {
      const val = getComputedStyle(el).getPropertyValue('--row-height').trim()
      const px = parseInt(val, 10)
      if (px > 0) setRowHeight(px)
    }
    readHeight()
    // Re-read when density class changes on a parent element
    const observer = new MutationObserver(readHeight)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Estimate row size: expanded rows are taller to account for subtask section.
  // Mobile rows use flex-wrap and stack ≥96px tall — use that as base.
  const mobileRowEstimate = 96
  const estimateSize = useCallback(
    (index: number) => {
      const task = sorted[index]
      const base = isMobile ? mobileRowEstimate : rowHeight
      if (task && expandedTasks.has(task.id)) {
        return base + 160 // base row + estimated subtask section
      }
      return base
    },
    [sorted, expandedTasks, rowHeight, isMobile],
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

  // Check if config differs from defaults (for Reset view button)
  const hasMultiSort = sorts.length > 1
  const hasColumnReorder = tableConfig.columnOrder?.length ? !DATA_COLUMNS.every((c, i) => tableConfig.columnOrder![i] === c) : false
  const configDiffers = sortKey !== DEFAULT_TABLE_CONFIG.sortKey ||
    sortAsc !== DEFAULT_TABLE_CONFIG.sortAsc ||
    hasMultiSort ||
    hasColumnReorder ||
    Object.keys(colWidths).some(k => colWidths[k] !== DEFAULT_WIDTHS[k])

  return (
    <div
      className={`table-container${selectModeActive && onToggleSelect ? ' task-grid-select-mode' : ''}`}
      aria-label="Tasks"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Reset view button — only show when config differs from defaults */}
      {configDiffers && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--sp-xs) var(--sp-lg) 0', flexShrink: 0 }}>
          <button
            onClick={resetTableConfig}
            title="Reset view to defaults"
            className="hov-opacity"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', color: 'var(--slate)', opacity: 0.75,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 6px', borderRadius: 'var(--radius-sm)',
              transition: 'opacity var(--duration-normal) var(--ease-out)',
              '--hov-opacity': '0.9',
            } as React.CSSProperties}
          >
            <RotateCcw {...ICON_PROPS} size={11} />
            Reset view
          </button>
        </div>
      )}

      {/* Column headers — clickable for sort, draggable for reorder, hidden on mobile */}
      <DndContext
        id="column-reorder"
        sensors={columnSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleColumnDragEnd}
      >
        <SortableContext items={orderedDataCols} strategy={horizontalListSortingStrategy}>
          <div className="task-grid-header" style={{ ...colStyle, padding: 'var(--sp-sm) var(--sp-lg)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <div /> {/* Checkbox spacer — not sortable */}
            {orderedDataCols.map(col => (
              <SortableColumnHeader
                key={col}
                columnKey={col}
                label={COLUMN_LABELS[col] || col.toUpperCase()}
                field={col}
                sorts={sorts}
                onSort={handleSort}
                onResizeStart={handleResizeStart}
                onResizeDoubleClick={handleResizeDoubleClick}
                isResizing={resizingCol === col}
                align={col === 'due_date' ? 'right' : undefined}
              />
            ))}
            <div /> {/* Actions spacer — not sortable */}
          </div>
        </SortableContext>
      </DndContext>

      {/* Virtualized scrollable area — CLS fix (C8 R6): minHeight STABLE across loading state.
          Never flip between calc() and content-derived pixels — CLS measures content position,
          not just wrapper height. A constant viewport-relative reserve keeps everything below
          pinned regardless of whether we're rendering skeletons or the virtualizer. */}
      <div
        ref={parentRef}
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 'calc(100vh - 320px)',
          scrollbarGutter: 'stable',
          contain: 'layout',
        }}
      >
        {isLoading && sorted.length === 0 ? (
          // Skeleton rows: match expected row height so container reserves vertical space
          <div style={{ width: '100%' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={`skel-${i}`}
                style={{
                  height: rowHeight,
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
          </div>
        ) : sorted.length > 0 ? (
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
                    orderedDataCols={orderedDataCols}
                    onStatusChange={onStatusChange}
                    onFieldChange={onFieldChange}
                    onSelect={onSelect}
                    onOpenDetail={onOpenDetail}
                    showUndo={showUndo}
                    selected={selectedIds?.has(task.id)}
                    onToggleSelect={onToggleSelect}
                    onSelectRange={onSelectRange}
                    anchorId={anchorId}
                    orderedTaskIds={sortedIds}
                    selectModeActive={selectModeActive}
                    isFocused={focusedIndex === virtualRow.index}
                    onFocusIndex={onFocusIndex}
                    onContextMenu={openContextMenu}
                    expanded={isExpanded}
                    onToggleExpand={() => toggleExpand(task.id)}
                    projectMap={projectMap}
                    projectOptions={projectOptions}
                    onPinToFocus={onPinToFocus}
                    isPinnedToFocus={pinnedIds?.has(task.id)}
                    focusedCell={focusedCell}
                    onCellTab={handleCellTab}
                    onCellFocus={setFocusedCell}
                  />
                                    {isExpanded && (
                      <InlineSubtaskRow
                        key={`sub-${task.id}`}
                        taskId={task.id}
                        onHeightChange={() => virtualizer.measure()}
                      />
                    )}
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
        /* Resize handles */
        .resize-handle {
          background: transparent;
          transition: background var(--duration-normal) var(--ease-out);
        }
        .resize-handle:hover {
          background: var(--teal);
          opacity: 0.85;
        }
        .resize-handle-active {
          background: var(--teal);
          opacity: 0.85;
        }
        /* Column drag handles — subtle on hover */
        .col-drag-handle {
          opacity: 0;
          transition: opacity var(--transition-fast) var(--ease-out);
        }
        .task-grid-header > div:hover .col-drag-handle {
          opacity: 0.35;
        }
        .col-drag-handle:hover {
          opacity: 0.85 !important;
        }
        /* Cell focus ring for Tab navigation */
        .cell-focused {
          outline: 2px solid var(--teal);
          outline-offset: -2px;
          border-radius: var(--radius-sm);
        }
        .task-grid-row:hover .subtask-expand-btn {
          opacity: 0.85 !important;
        }
        .task-grid-row:hover .subtask-expand-btn:hover {
          opacity: 0.8 !important;
        }
        /* Hover badges are visually hidden until row hover/focus.
           a11y: also remove from accessibility tree so screen readers
           don't read phantom project/age badges aloud for every row.
           Audit measured ~120 phantom announcements per /tasks visit
           before this guard. */
        .task-grid-row .hover-badge {
          opacity: 0;
          visibility: hidden;
          transition: opacity var(--transition-fast) var(--ease-out);
        }
        .task-grid-row:hover .hover-badge,
        .task-grid-row:focus-within .hover-badge {
          opacity: 1;
          visibility: visible;
        }
        /* Frozen first columns on narrow viewports */
        @media (max-width: 1024px) {
          .task-grid-row > :nth-child(1) {
            position: sticky;
            left: 0;
            z-index: 1;
            background: inherit;
          }
          .task-grid-row > :nth-child(2) {
            position: sticky;
            left: 32px;
            z-index: 1;
            background: inherit;
          }
          .task-grid-header > :nth-child(1) {
            position: sticky;
            left: 0;
            z-index: 1;
            background: inherit;
          }
          .task-grid-header > :nth-child(2) {
            position: sticky;
            left: 32px;
            z-index: 1;
            background: inherit;
          }
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

// ── Sortable + Resizable Column Header (drag to reorder + resize handle) ──

function SortableColumnHeader({
  columnKey, label, field, sorts, onSort, onResizeStart, onResizeDoubleClick, isResizing, align,
}: {
  columnKey: string
  label: string
  field: string
  sorts: { key: string; asc: boolean }[]
  onSort: (key: string, shiftKey?: boolean) => void
  onResizeStart: (col: string, e: React.MouseEvent) => void
  onResizeDoubleClick: (col: string) => void
  isResizing: boolean
  align?: 'left' | 'right'
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: columnKey })
  const sortIdx = sorts.findIndex(s => s.key === field)
  const isActive = sortIdx >= 0
  const currentAsc = isActive ? sorts[sortIdx].asc : true
  const sortRank = sorts.length > 1 && isActive ? sortIdx + 1 : undefined

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition: transition || undefined,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 'var(--z-sticky)' : undefined,
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  }

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      onClick={(e) => {
        // Only sort on click if not dragging
        if (!isDragging) onSort(field, e.shiftKey)
      }}
    >
      {/* Drag handle owns the dnd-kit a11y attributes so the outer div stays
          role-free (axe nested-interactive, 2026-04-18). The handle itself
          is a button; the ColumnHeader inside renders another button for
          sort — still two interactive elements side by side, not nested. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder column: ${label}`}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 2px',
          marginRight: '2px',
          background: 'none',
          border: 'none',
          color: 'var(--slate)',
          opacity: 0.75,
          flexShrink: 0,
          transition: 'opacity var(--transition-fast) var(--ease-out)',
        }}
        className="col-drag-handle"
        onClick={(e) => e.stopPropagation()}
        title="Drag to reorder column"
      >
        <GripVertical {...ICON_PROPS} size={10} />
      </button>
      <ColumnHeader
        label={label}
        sortKey={field}
        currentSort={isActive ? field : ''}
        sortAsc={currentAsc}
        onSort={() => {/* handled by parent div onClick for shiftKey access */}}
        sortRank={sortRank}
        align={align}
      />
      <div
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '4px', cursor: 'col-resize', zIndex: 'var(--z-sticky)' }}
        onMouseDown={(e) => { e.stopPropagation(); onResizeStart(field, e) }}
        onDoubleClick={(e) => { e.stopPropagation(); onResizeDoubleClick(field) }}
        className={isResizing ? 'resize-handle-active' : 'resize-handle'}
      />
    </div>
  )
}

// ── Grid Row ─────────────────────────────────────────────────

function TaskGridRow({
  task, allTasks, index, colStyle, orderedDataCols, onStatusChange, onFieldChange, onSelect, onOpenDetail, showUndo, selected, onToggleSelect, onSelectRange, anchorId, orderedTaskIds, selectModeActive, isFocused, onFocusIndex, onContextMenu, expanded, onToggleExpand, projectMap, projectOptions, onPinToFocus, isPinnedToFocus, focusedCell, onCellTab, onCellFocus,
}: {
  task: TaskRow
  allTasks: TaskRow[]
  index: number
  colStyle: React.CSSProperties
  orderedDataCols: string[]
  onStatusChange: (id: string, status: string) => void
  onFieldChange: (id: string, field: string, value: unknown) => void
  onSelect?: (task: TaskRow) => void
  onOpenDetail?: (task: TaskRow) => void
  showUndo: (msg: string, onUndo: () => void) => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
  onSelectRange?: (targetId: string, orderedIds: string[], anchor: string | null) => void
  anchorId?: string | null
  orderedTaskIds?: string[]
  selectModeActive?: boolean
  isFocused?: boolean
  onFocusIndex?: (index: number) => void
  onContextMenu?: (e: React.MouseEvent, taskId: string) => void
  expanded?: boolean
  onToggleExpand?: () => void
  projectMap: Map<string, string>
  projectOptions: { value: string; label: string }[]
  onPinToFocus?: (id: string) => void
  isPinnedToFocus?: boolean
  focusedCell?: [number, number] | null
  onCellTab?: (rowIndex: number, colIndex: number, shift: boolean) => void
  onCellFocus?: (cell: [number, number] | null) => void
}) {
  const isDone = task.status === 'done'
  const blockerIds = useMemo(() => parseBlockedByIds(task.blocked_by), [task.blocked_by])
  const hasBlockers = blockerIds.length > 0
  const rowRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [quickComment, setQuickComment] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [completingAnim, setCompletingAnim] = useState(false)
  const [rowFadeAnim, setRowFadeAnim] = useState(false)
  const prevStatusRef = useRef(task.status)

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

  // DD-7 long-press on mobile opens the same context menu that right-click
  // opens on desktop. iOS/Android have no right-click; long-press is the
  // canonical equivalent. Fires at 500ms; cancels on scroll/move.
  const longPress = useLongPress((e) => {
    const syntheticMouseEvent = {
      preventDefault: () => {},
      stopPropagation: () => {},
      clientX: 'touches' in e ? e.touches[0]?.clientX ?? 0 : 0,
      clientY: 'touches' in e ? e.touches[0]?.clientY ?? 0 : 0,
    } as unknown as React.MouseEvent
    onContextMenu?.(syntheticMouseEvent, task.id)
  })

  // DD-7 row-level swipe (mobile <768px only; noop on desktop via the hook's
  // internal gating). Right-swipe completes (or reopens if done); left-swipe
  // opens the same context menu long-press does. Both are recoverable: the
  // complete fires an undo toast; the context menu is explicit action.
  const swipe = useSwipeAction({
    onSwipeRight: () => {
      if (!isDone) {
        const prev = task.status
        onStatusChange(task.id, 'done')
        showUndo('Completed task', () => onStatusChange(task.id, prev))
      } else {
        const prev = task.status
        onStatusChange(task.id, 'todo')
        showUndo('Reopened task', () => onStatusChange(task.id, prev))
      }
    },
    onSwipeLeft: () => {
      const syntheticMouseEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: 0,
        clientY: 0,
      } as unknown as React.MouseEvent
      onContextMenu?.(syntheticMouseEvent, task.id)
    },
  })

  // Cell focus props for Tab navigation
  const cellProps = useCallback((colIndex: number) => {
    const isCellFocused = focusedCell?.[0] === index && focusedCell?.[1] === colIndex
    return {
      tabIndex: EDITABLE_COL_INDICES.includes(colIndex) ? 0 : -1,
      className: isCellFocused ? 'cell-focused' : '',
      onFocus: () => onCellFocus?.([index, colIndex]),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
          e.preventDefault()
          onCellTab?.(index, colIndex, e.shiftKey)
        }
      },
    }
  }, [focusedCell, index, onCellFocus, onCellTab])

  // Auto-focus cell when focusedCell matches this row
  const cellRefs = useRef<Record<number, HTMLDivElement | null>>({})
  useEffect(() => {
    if (focusedCell?.[0] === index && focusedCell?.[1] != null) {
      const el = cellRefs.current[focusedCell[1]]
      if (el && document.activeElement !== el) el.focus()
    }
  }, [focusedCell, index])

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* DD-7 swipe action reveal layers — hidden on desktop (opacity stays 0
          because useSwipeAction disables drag and x stays pinned). On mobile,
          fade in as the row translates. */}
      <motion.div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background: 'var(--green-hover, rgba(28,115,59,0.12))',
          color: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          padding: '0 var(--sp-lg)',
          fontSize: '12px', fontWeight: 600,
          opacity: swipe.leftActionOpacity,
          pointerEvents: 'none',
        }}
      >
        <Check {...ICON_PROPS} size={14} />&nbsp;{isDone ? 'Reopen' : 'Complete'}
      </motion.div>
      <motion.div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background: 'var(--gold-hover, rgba(201,168,76,0.15))',
          color: 'var(--gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '0 var(--sp-lg)',
          fontSize: '12px', fontWeight: 600,
          opacity: swipe.rightActionOpacity,
          pointerEvents: 'none',
        }}
      >
        Menu
      </motion.div>
      <motion.div
      ref={rowRef}
      data-testid={`task-row-${task.id}`}
      data-selected={selected ? 'true' : undefined}
      {...swipe.motionProps}
      style={{
        ...colStyle,
        padding: '0 var(--sp-lg)',
        minHeight: 'var(--row-height)',
        boxSizing: 'border-box' as const,
        fontSize: 'var(--cell-font-size)',
        borderBottom: '1px solid var(--border-subtle)',
        borderLeft: `3px solid ${
          task.priority === 'urgent' ? 'var(--maroon)' :
          task.priority === 'high' ? 'var(--orange)' :
          'transparent'
        }`,
        cursor: selectModeActive && onToggleSelect ? 'cell' : (onOpenDetail || onSelect) ? 'pointer' : 'default',
        opacity: isDone ? 0.85 : 1,
        transition: 'background var(--duration-normal) var(--ease-out), opacity var(--duration-normal) var(--ease-out)',
        position: 'relative',
        background: 'var(--cream)',
        ...swipe.motionProps.style,
      }}
      className={`task-grid-row hover:bg-black/[0.02] dark:hover:bg-white/[0.02] ${isFocused ? 'task-row-focused' : ''} ${rowFadeAnim ? 'task-row-complete-fade' : ''}`}
      data-focused={isFocused ? 'true' : undefined}
      tabIndex={0}
      onClick={(e) => {
        onFocusIndex?.(index)
        if (e.shiftKey && onSelectRange && orderedTaskIds) {
          // Shift+click → range from anchor to this task in current sort order
          e.preventDefault()
          onSelectRange(task.id, orderedTaskIds, anchorId ?? null)
        } else if ((e.ctrlKey || e.metaKey) && onToggleSelect) {
          // Ctrl/Meta+click → toggle + set anchor
          e.preventDefault()
          onToggleSelect(task.id)
        } else if (onOpenDetail) {
          onOpenDetail(task)
        } else {
          onSelect?.(task)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onOpenDetail?.(task) }
      }}
      onContextMenu={(e) => { longPress.onContextMenu(e); onContextMenu?.(e, task.id) }}
      onTouchStart={(e) => { longPress.onTouchStart(e); swipe.motionProps.onTouchStart(e) }}
      onTouchMove={longPress.onTouchMove}
      onTouchEnd={longPress.onTouchEnd}
      onTouchCancel={longPress.onTouchCancel}
    >
      {/* Leftmost circle — 1-click complete (with undo). Ctrl/⌘+click or
          shift-click toggles row selection for bulk actions (also works on
          the row body — see row onClick above). GH #25. r7 2026-04-22.
          While Ctrl/Meta is held (selectModeActive), the visual swaps to a
          selection-square so it's clear clicking will SELECT, not complete. */}
      <div
        className="task-row-checkbox"
        onClick={(e) => {
          e.stopPropagation()
          if (e.ctrlKey || e.metaKey) {
            onToggleSelect?.(task.id)
          } else if (!isDone) {
            const prev = task.status
            onStatusChange(task.id, 'done')
            showUndo('Completed task', () => onStatusChange(task.id, prev))
          } else {
            // Already done — reopen to todo
            const prev = task.status
            onStatusChange(task.id, 'todo')
            showUndo('Reopened task', () => onStatusChange(task.id, prev))
          }
        }}
        title={
          selectModeActive && onToggleSelect
            ? (selected ? 'Deselect row' : 'Select row')
            : isDone
              ? 'Click to reopen · Ctrl-click to select'
              : 'Click to complete · Ctrl-click to select'
        }
        aria-label={
          selectModeActive && onToggleSelect
            ? (selected ? 'Deselect task' : 'Select task')
            : isDone ? 'Reopen task' : 'Complete task'
        }
        style={{ cursor: 'pointer' }}
      >
        {selectModeActive && onToggleSelect && !selected ? (
          /* Select-mode affordance: show a selection-square when Ctrl/Meta held */
          <div style={{
            width: 16, height: 16, borderRadius: 'var(--radius-sm)',
            border: '1.5px solid var(--teal-solid)',
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background var(--transition-fast), border var(--transition-fast)',
          }}>
            <Square {...ICON_PROPS} size={8} style={{ color: 'var(--teal-solid)' }} />
          </div>
        ) : (
          <div style={{
            width: 16, height: 16, borderRadius: 'var(--radius-circle)',
            border: selected ? '2px solid var(--teal-solid)' : isDone ? 'none' : '1.5px solid var(--border-subtle)',
            background: isDone ? 'var(--teal-solid)' : selected ? 'var(--teal-emphasis)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background var(--transition-fast), border var(--transition-fast)',
          }}>
            {isDone && <CheckCircle2 {...ICON_PROPS} size={10} style={{ color: '#fff' }} />}
            {!isDone && selected && <CheckCircle2 {...ICON_PROPS} size={10} style={{ color: 'var(--teal-solid)' }} />}
          </div>
        )}
      </div>

      {/* Data cells — rendered in orderedDataCols order */}
      {orderedDataCols.map((col, colIdx) => {
        // colIdx + 1 because grid position 0 is checkbox
        const gridPos = colIdx + 1
        const cp = cellProps(gridPos)
        switch (col) {
          case 'title':
            return (
              <div
                key="title"
               
                className={`task-row-title ${cp.className}`}
                ref={el => { cellRefs.current[gridPos] = el }}
                tabIndex={cp.tabIndex}
                onFocus={cp.onFocus}
                onKeyDown={(e) => {
                  cp.onKeyDown(e)
                  if (e.key === 'Enter') { e.preventDefault(); onOpenDetail?.(task) }
                }}
                style={{ minWidth: 0, paddingRight: '12px' }}
              >
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleExpand?.() }}
                    className="subtask-expand-btn"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                      display: 'flex', alignItems: 'center', flexShrink: 0,
                      color: 'var(--slate)', opacity: expanded ? 0.85 : 0.25,
                      transition: 'opacity var(--transition-fast) var(--ease-out)',
                    }}
                    title={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
                  >
                    <ChevronRight {...ICON_PROPS} size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform var(--transition-fast) var(--ease-out)' }} />
                  </button>
                  {hasBlockers && (
                    <span className="relative group" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                      <Link2 {...ICON_PROPS} size={12} style={{ color: 'var(--maroon)', opacity: 0.85 }} />
                      <span
                        className="absolute left-full ml-2 hidden group-hover:block z-30 rounded-lg shadow-lg border py-2 px-3"
                        style={{
                          backgroundColor: 'var(--cream)',
                          borderColor: 'var(--border-subtle)',
                          minWidth: '180px',
                          maxWidth: '260px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      >
                        <span className="text-[10px] uppercase tracking-wider block mb-1.5" style={{ color: 'var(--maroon)', fontWeight: 600 }}>Blocked by</span>
                        {blockerIds.map(id => {
                          const bt = allTasks.find(t => t.id === id)
                          if (!bt) return null
                          return (
                            <span key={id} className="flex items-center gap-1.5 text-[11px] mb-1" style={{ color: 'var(--ink)' }}>
                              <span style={{
                                width: 6, height: 6, borderRadius: 'var(--radius-circle)',
                                background: bt.completed ? 'var(--green)' : bt.status === 'in_progress' ? 'var(--teal-solid)' : 'var(--slate)',
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
                        borderRadius: 'var(--radius-sm)',
                        padding: '2px 6px',
                        outline: 'none',
                        width: '100%',
                      }}
                    />
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Open task: ${task.title || task.description || 'untitled'}`}
                      data-testid={`task-title-${task.id}`}
                      onClick={(e) => {
                        // Modifier-held → route to the same select logic as the row body.
                        // Ctrl/Meta → toggle+anchor; Shift → range. Never open detail.
                        if (e.shiftKey && onSelectRange && orderedTaskIds) {
                          e.preventDefault(); e.stopPropagation()
                          onSelectRange(task.id, orderedTaskIds, anchorId ?? null)
                          return
                        }
                        if ((e.ctrlKey || e.metaKey) && onToggleSelect) {
                          e.preventDefault(); e.stopPropagation()
                          onToggleSelect(task.id)
                          return
                        }
                        e.stopPropagation(); onOpenDetail?.(task)
                      }}
                      onDoubleClick={(e) => {
                        // Never open the title editor while a modifier is held.
                        if (e.shiftKey || e.ctrlKey || e.metaKey) return
                        e.stopPropagation(); setTitleDraft(task.title || task.description); setEditingTitle(true)
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpenDetail?.(task) } if (e.key === 'F2') { e.stopPropagation(); setTitleDraft(task.title || task.description); setEditingTitle(true) } }}
                      style={{
                        fontSize: 'var(--text-base)',
                        fontWeight: 'var(--weight-heading)',
                        color: 'var(--ink)',
                        textDecoration: isDone ? 'line-through' : 'none',
                        lineHeight: 1.35,
                        cursor: onOpenDetail ? 'pointer' : 'default',
                        borderRadius: 'var(--radius-sm)',
                        padding: '1px 4px',
                        margin: '-1px -4px',
                        transition: 'background var(--transition-fast) var(--ease-out)',
                      }}
                      className="task-title-clickable"
                    >
                      <TaskTitle title={task.title} fallback={task.description} />
                    </span>
                  )}
                  {task.source && task.source !== 'manual' && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-lg)',
                        backgroundColor: task.source === 'meeting' ? 'var(--teal-active)' :
                          task.source === 'recurrence' ? 'var(--gold-active)' :
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
                  {!isDone && (() => {
                    const dateStr = task.updated_at || task.created_at
                    if (!dateStr) return null
                    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
                    if (days < 7) return null
                    const bgColor = days > 30 ? 'var(--maroon-hover)' : days > 14 ? 'var(--gold-hover)' : 'var(--hover-light)'
                    const textColor = days > 30 ? 'var(--maroon)' : days > 14 ? 'var(--gold)' : 'var(--slate)'
                    return (
                      <span
                        className="hover-badge"
                        title={`Last updated ${days} days ago`}
                        style={{
                          fontSize: 'var(--text-caption)',
                          fontWeight: 'var(--weight-ui)',
                          padding: '1px 4px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: bgColor,
                          color: textColor,
                          opacity: 0.85,
                          flexShrink: 0,
                          lineHeight: '14px',
                        }}
                      >
                        {days}d
                      </span>
                    )
                  })()}
                  {task.project_id && (
                    <Link
                      to={PATHS.project(task.project_id)}
                      onClick={(e) => e.stopPropagation()}
                      className="hover-badge hov-bg hov-color"
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--surface-3)',
                        borderLeft: '2px solid var(--teal)',
                        color: 'var(--slate)',
                        flexShrink: 0,
                        lineHeight: '14px',
                        maxWidth: '100px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textDecoration: 'none',
                        transition: 'background-color 150ms ease, color 150ms ease',
                        '--hov-bg': 'var(--teal-active)',
                        '--hov-color': 'var(--teal)',
                      } as React.CSSProperties}
                      title={`Work on ${task.project_id}`}
                    >
                      {(projectMap.get(task.project_id) ?? task.project_id).slice(0, 20)}
                    </Link>
                  )}
                  <TaskKeyLinks task={task} />
                </div>
              </div>
            )
          case 'assignee':
            return (
              <div
                key="assignee"
               
                className={`task-row-meta flex items-center gap-1.5 ${cp.className}`}
                ref={el => { cellRefs.current[gridPos] = el }}
                tabIndex={cp.tabIndex}
                onFocus={cp.onFocus}
                onKeyDown={cp.onKeyDown}
                data-testid={`task-assignee-${task.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <InlineAssigneePicker
                  value={task.assignee}
                  onChange={(slug) => onFieldChange(task.id, 'assignee', slug)}
                  compact
                />
                {task.assignee && !task.acknowledged_at && !isDone && (
                  <span
                    title="Not yet acknowledged"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 'var(--radius-circle)',
                      backgroundColor: 'var(--gold)',
                      flexShrink: 0,
                      opacity: 0.8,
                    }}
                  />
                )}
              </div>
            )
          case 'project':
            return (
              <div
                key="project"
               
                className={`task-row-meta ${cp.className}`}
                ref={el => { cellRefs.current[gridPos] = el }}
                tabIndex={cp.tabIndex}
                onFocus={cp.onFocus}
                onKeyDown={cp.onKeyDown}
                data-testid={`task-project-${task.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <InlineCellSelect
                  label="Project"
                  value={task.project_id || ''}
                  options={projectOptions}
                  onChange={(val) => onFieldChange(task.id, 'project_id', val || null)}
                  renderValue={(val) => {
                    const name = val ? projectMap.get(val) || val : null
                    return (
                      <span
                        style={{
                          fontSize: 'var(--text-small)',
                          color: name ? 'var(--teal)' : 'var(--slate)',
                          opacity: name ? 0.85 : 'var(--ink-hint)',
                          maxWidth: '110px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                        }}
                        title={name || undefined}
                      >
                        {name || '\u2014'}
                      </span>
                    )
                  }}
                />
              </div>
            )
          case 'due_date':
            return (
              <div
                key="due_date"
               
                className={`task-row-meta col-numeric ${cp.className}`}
                ref={el => { cellRefs.current[gridPos] = el }}
                tabIndex={cp.tabIndex}
                onFocus={cp.onFocus}
                onKeyDown={cp.onKeyDown}
                data-testid={`task-due-${task.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'flex', justifyContent: 'flex-end' }}
              >
                <InlineDatePicker
                  value={task.due_date}
                  onChange={(date) => onFieldChange(task.id, 'due_date', date)}
                />
              </div>
            )
          case 'status':
            return (
              <div
                key="status"
                className={`task-row-status ${cp.className}`}
                ref={el => { cellRefs.current[gridPos] = el }}
                tabIndex={cp.tabIndex}
                onFocus={cp.onFocus}
                onKeyDown={cp.onKeyDown}
                data-testid={`task-status-${task.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <InlineCellSelect
                  label="Status"
                  value={task.status}
                  options={STATUS_OPTIONS}
                  onChange={(val) => {
                    const prev = task.status
                    onStatusChange(task.id, val)
                    showUndo(`Status \u2192 ${STATUS_OPTIONS.find(o => o.value === val)?.label}`, () => onStatusChange(task.id, prev))
                  }}
                  renderValue={(opt) => {
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
                          borderRadius: 'var(--radius-full)',
                        }}
                      >
                        <IconComp size={13} />
                        <span>{(hasBlockers && opt !== 'done' && opt !== 'blocked') ? 'Blocked' : Icon.label}</span>
                      </span>
                    )
                  }}
                />
                {task.status === 'in_progress' && task.created_at && (() => {
                  const days = Math.floor((Date.now() - parseDbUtc(task.created_at).getTime()) / 86400000)
                  if (days < 7) return null
                  return (
                    <span
                      title={`In progress for ${days} days \u2014 consider updating`}
                      style={{ fontSize: 'var(--text-micro)', color: 'var(--orange)', opacity: 0.85, marginTop: '1px' }}
                    >
                      {'\u26A0'} {days}d
                    </span>
                  )
                })()}
              </div>
            )
          case 'priority':
            return (
              <div
                key="priority"
                className={`task-row-priority ${cp.className}`}
                ref={el => { cellRefs.current[gridPos] = el }}
                tabIndex={cp.tabIndex}
                onFocus={cp.onFocus}
                onKeyDown={cp.onKeyDown}
                data-testid={`task-priority-${task.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <InlineCellSelect
                  label="Priority"
                  value={task.priority}
                  options={PRIORITY_OPTIONS}
                  onChange={(val) => onFieldChange(task.id, 'priority', val)}
                  renderValue={(val) => {
                    const opt = PRIORITY_OPTIONS.find(o => o.value === val) || PRIORITY_OPTIONS[1]
                    const cfg = PRIORITY_CONFIG[val as keyof typeof PRIORITY_CONFIG]
                    return (
                      <span className="status-transition" style={{
                        color: opt.color,
                        opacity: 0.85,
                        background: cfg?.bg || 'rgba(100, 116, 139, 0.1)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                      }}>
                        {opt.label}
                      </span>
                    )
                  }}
                />
              </div>
            )
          default:
            return null
        }
      })}

      {/* Row actions — own grid column, not absolute */}
      <div className="task-grid-row-actions" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
        {onPinToFocus && !isPinnedToFocus && !task.completed && (
          <button
            className="task-grid-row-action-btn"
            onClick={() => onPinToFocus(task.id)}
            title="Pin to Focus Next"
            aria-label="Pin to Focus Next"
          >
            <Pin {...ICON_PROPS} size={12} />
          </button>
        )}
        <button
          className="task-grid-row-action-btn"
          onClick={() => setQuickComment(!quickComment)}
          title="Quick comment"
          aria-label="Add quick comment"
        >
          <MessageSquare {...ICON_PROPS} size={12} />
        </button>
        <button
          className="task-grid-row-action-btn"
          onClick={() => {
            const prev = task.status
            onStatusChange(task.id, 'done')
            showUndo('Archived task', () => onStatusChange(task.id, prev))
          }}
          title="Archive task"
          aria-label="Archive task"
        >
          <Archive {...ICON_PROPS} size={12} />
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
                  // M08: await the fetch and check res.ok before showing success
                  // (pre-fix: fire-and-forget, toast showed before response).
                  const content = commentDraft.trim();
                  setCommentDraft('');
                  setQuickComment(false);
                  (async () => {
                    try {
                      const res = await fetch(`/api/tasks/${task.id}/comments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content }),
                      });
                      if (!res.ok) {
                        // Restore draft so the user can retry
                        setCommentDraft(content);
                        setQuickComment(true);
                        console.error('quick-comment failed', res.status);
                      } else {
                        showUndo('Comment added', () => {});
                      }
                    } catch {
                      setCommentDraft(content);
                      setQuickComment(true);
                    }
                  })();
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
      </motion.div>
    </div>
  )
}

// ── Key Link Icons ──────────────────────────────────────────

function KeyLinkIcon({ url, label }: { url: string; label?: string | null }) {
  const { launch } = useProtocolLaunch()

  const { href, Icon, typeLabel, isHttp } = classifyUrl(url)

  // Non-http links fire through the ONE protocol-launch chokepoint
  // (clipboard backup + toast — that toast is the single feedback path).
  const handleNonHttpClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    void launch(href, {
      copyText: url,
      successMessage: `Opening ${typeLabel.toLowerCase()}… (path copied as backup)`,
    })
  }

  return (
    <span className="inline-flex items-center gap-0.5" style={{ flexShrink: 0 }}>
      <a
        href={isHttp ? href : url}
        target={isHttp ? '_blank' : undefined}
        rel={isHttp ? 'noopener noreferrer' : undefined}
        onClick={isHttp ? (e) => e.stopPropagation() : handleNonHttpClick}
        title={label || (isHttp ? url : `Click to copy path: ${url}`)}
        className="hov-opacity"
        style={{
          color: 'var(--teal)',
          opacity: 0.85,
          transition: 'opacity var(--transition-fast) var(--ease-out)',
          display: 'inline-flex',
          alignItems: 'center',
          padding: '1px',
          '--hov-opacity': '1',
        } as React.CSSProperties}
      >
        <Icon {...ICON_PROPS} size={14} />
      </a>
      <button
        onClick={handleNonHttpClick}
        title="Copy link"
        className="hov-opacity"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--slate)',
          opacity: 0.85,
          transition: 'opacity var(--transition-fast) var(--ease-out), color var(--transition-fast) var(--ease-out)',
          display: 'inline-flex',
          alignItems: 'center',
          padding: '1px',
          '--hov-opacity': '0.8',
        } as React.CSSProperties}
      >
        <Clipboard {...ICON_PROPS} size={11} />
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

// ── Inline Sortable Subtask Item ──────────────────────────────

function InlineSortableSubtask({ subtask, onToggle }: { subtask: { id: string; title: string; completed: number }; onToggle: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: subtask.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 'var(--z-sticky)' : ('auto' as const),
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, transition: `opacity var(--duration-normal) var(--ease-out), ${transition || ''}` }}
      className="flex items-center gap-2 py-1 group"
      {...attributes}
    >
      <button
        {...listeners}
        className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        style={{ background: 'none', border: 'none', padding: '1px', color: 'var(--slate)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical {...ICON_PROPS} size={10} style={{ opacity: 0.85 }} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(subtask.id) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
      >
        {subtask.completed ? (
          <CheckCircle2 {...ICON_PROPS} size={14} style={{ color: 'var(--teal)' }} />
        ) : (
          <Circle {...ICON_PROPS} size={14} style={{ color: 'var(--slate)', opacity: 0.75 }} />
        )}
      </button>
      <span
        style={{
          fontSize: '12px',
          color: subtask.completed ? 'var(--slate)' : 'var(--ink)',
          textDecoration: subtask.completed ? 'line-through' : 'none',
          opacity: subtask.completed ? 0.85 : 0.8,
        }}
      >
        {subtask.title}
      </span>
    </div>
  )
}

// ── Inline Subtask Row (Linear-style expand) ─────────────────

function InlineSubtaskRow({ taskId, onHeightChange }: { taskId: string; onHeightChange?: () => void }) {
  const { data: subtasks = [] } = useSubtasks(taskId)
  const createSubtask = useCreateSubtask(taskId)
  const toggleSubtask = useToggleSubtask(taskId)
  const reorderSubtasks = useReorderSubtasks(taskId)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const prevSubtaskCount = useRef(subtasks.length)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 200)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (subtasks.length !== prevSubtaskCount.current) {
      prevSubtaskCount.current = subtasks.length
      onHeightChange?.()
    }
  }, [subtasks.length, onHeightChange])

  const completed = subtasks.filter((s) => s.completed).length
  const total = subtasks.length

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    createSubtask.mutate(newTitle.trim())
    setNewTitle('')
    inputRef.current?.focus()
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = subtasks.findIndex((s) => s.id === active.id)
    const newIndex = subtasks.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(subtasks, oldIndex, newIndex)
    reorderSubtasks.mutate(reordered.map((s) => s.id))
    onHeightChange?.()
  }

  const [subtaskListRef] = useAutoAnimate<HTMLDivElement>()

  return (
    <div>
      <div
        style={{
          padding: '6px 16px 10px 48px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--teal-hover)',
        }}
      >
        {total > 0 && (
          <div className="flex items-center gap-2 mb-1.5">
            <div style={{ flex: 1, height: 2, borderRadius: 'var(--radius-sm)', background: 'var(--gold-emphasis)', overflow: 'hidden' }}>
              <div style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%`, height: '100%', background: completed === total ? 'var(--teal-solid)' : 'var(--gold)', borderRadius: 'var(--radius-sm)', transition: 'width var(--duration-slow) var(--ease-out)' }} />
            </div>
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>{completed}/{total}</span>
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div ref={subtaskListRef}>
              {subtasks.map((s) => (
              <InlineSortableSubtask
                key={s.id}
                subtask={s}
                onToggle={(id) => toggleSubtask.mutate(id)}
              />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <form onSubmit={handleAdd} className="flex items-center gap-2 mt-0.5" onClick={(e) => e.stopPropagation()}>
          <Plus {...ICON_PROPS} size={12} style={{ color: 'var(--slate)', opacity: 0.75, flexShrink: 0 }} />
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
    </div>
  )
}

// ── Inline Cell Select ───────────────────────────────────────

function InlineCellSelect({
  value, options, onChange, renderValue, label,
}: {
  value: string
  options: { value: string; label: string; color?: string }[]
  onChange: (val: string) => void
  renderValue: (val: string) => React.ReactNode
  /** Screen-reader label (axe button-name); falls back to label of current value. */
  label?: string
}) {
  const selectedLabel = options.find(o => o.value === value)?.label ?? value
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number }>({ top: 0, left: 0, minWidth: 130 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const listboxIdBase = useId()
  const listboxId = useRef(listboxIdBase)
  const filterRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!filter) return options
    const lower = filter.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(lower))
  }, [options, filter])

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, minWidth: Math.max(130, rect.width) })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    setFilter('')
    setFocusedIdx(-1)
    setTimeout(() => filterRef.current?.focus(), 0)
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) { setOpen(false) }
    }
    // Close on outside scroll only. Scrolling INSIDE the dropdown (long option
    // lists) must not close it. Prior behavior closed on any scroll because
    // the capture-phase listener fired for the dropdown's own overflow-y:auto
    // scrolls.
    const onScroll = (e: Event) => {
      const target = e.target as Node | null
      if (target && dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, updatePosition])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && focusedIdx >= 0 && filtered[focusedIdx]) { e.preventDefault(); onChange(filtered[focusedIdx].value); setOpen(false) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  const activeDescendant = open && focusedIdx >= 0 && filtered[focusedIdx]
    ? `${listboxId.current}-opt-${focusedIdx}`
    : undefined

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        role="combobox"
        aria-label={label ? `${label}: ${selectedLabel} — click to change` : selectedLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId.current : undefined}
        aria-activedescendant={activeDescendant}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="inline-flex items-center gap-1 rounded-md transition-colors hov-bg hov-border"
        style={{
          padding: '3px 8px',
          border: '1px solid transparent',
          background: 'none',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 400,
          '--hov-bg': open ? 'none' : 'var(--teal-hover)',
          '--hov-border': open ? 'transparent' : 'var(--border-subtle)',
        } as React.CSSProperties}
      >
        {renderValue(value)}
        <ChevronDown {...ICON_PROPS} size={10} className="inline-select-chevron" />
      </button>

      {open && createPortal(
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 'var(--z-dropdown)' }}
            onClick={(e) => { e.stopPropagation(); setOpen(false) }}
          />
          <div
            ref={dropdownRef}
            id={listboxId.current}
            role="listbox"
            aria-label="Select option"
            onKeyDown={handleKeyDown}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              minWidth: pos.minWidth,
              zIndex: 'var(--z-modal)',
              background: 'var(--cream)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-menu)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {options.length >= 5 && (
              <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                <input
                  ref={filterRef}
                  value={filter}
                  onChange={(e) => { setFilter(e.target.value); setFocusedIdx(0) }}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Filter..."
                  style={{
                    width: '100%', fontSize: 'var(--text-small)', color: 'var(--ink)',
                    background: 'var(--field-bg)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)', padding: 'var(--sp-xs) var(--sp-sm)', outline: 'none',
                  }}
                />
              </div>
            )}
            {filtered.map((opt, idx) => (
              <button
                key={opt.value}
                id={`${listboxId.current}-opt-${idx}`}
                role="option"
                aria-selected={opt.value === value ? "true" : "false"}
                onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                  padding: '7px 12px', border: 'none', cursor: 'pointer',
                  background: idx === focusedIdx
                    ? 'var(--teal-active)'
                    : opt.value === value ? 'var(--teal-hover)' : 'none',
                  fontSize: '12px', fontWeight: opt.value === value ? 500 : 400,
                  color: opt.color || 'var(--ink)', textAlign: 'left',
                  transition: 'background var(--duration-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => { setFocusedIdx(idx); e.currentTarget.style.background = 'var(--teal-active)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = idx === focusedIdx ? 'var(--teal-active)' : opt.value === value ? 'var(--teal-hover)' : 'none' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

// ── Calculations Row (Notion-style summary) ──────────────────

function CalculationsRow({ tasks }: { tasks: TaskRow[] }) {
  // Single pass over tasks instead of 4 separate .filter() chains. With
  // 600+ tasks rerendering on every keystroke (search input, filter
  // toggle), the prior version recomputed everything ~5×/keystroke.
  const stats = useMemo(() => {
    const today = localDateKey()
    let overdue = 0, todo = 0, inProgress = 0, done = 0
    for (const t of tasks) {
      if (t.completed) done++
      else if (t.status === 'todo') todo++
      else if (t.status === 'in_progress') inProgress++
      if (!t.completed && t.due_date && t.due_date < today) overdue++
    }
    const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0
    return [
      { label: 'Count', value: tasks.length },
      ...(overdue > 0 ? [{ label: 'Overdue', value: overdue, color: 'var(--maroon)' }] : []),
      { label: 'To Do', value: todo },
      { label: 'In Progress', value: inProgress, color: 'var(--teal)' },
      ...(done > 0 ? [{ label: 'Done', value: `${done} (${pct}%)`, color: 'var(--green)' }] : []),
    ]
  }, [tasks])

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--sp-xl)',
        padding: 'var(--sp-sm) var(--sp-lg)',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--surface-1)',
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

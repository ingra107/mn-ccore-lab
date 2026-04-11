import { useMemo, useState, useCallback, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Circle, Clock, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Layers } from 'lucide-react'
import TaskCard from './TaskCard'
import Avatar from '../Avatar'
import { getPersonInfo } from '../../data/team'
import type { TaskRow } from '../../lib/api'

interface TaskBoardViewProps {
  tasks: TaskRow[]
  onStatusChange: (id: string, status: string) => void
  onSelect?: (task: TaskRow) => void
}

type GroupByField = 'status' | 'priority' | 'assignee'

const columns = [
  { key: 'todo', label: 'To Do', icon: Circle, color: 'var(--slate)', bg: 'rgba(100,116,139,0.06)' },
  { key: 'in_progress', label: 'In Progress', icon: Clock, color: 'var(--teal)', bg: 'var(--teal-hover)' },
  { key: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'var(--maroon)', bg: 'var(--maroon-hover)' },
  { key: 'done', label: 'Done', icon: CheckCircle2, color: 'var(--green)', bg: 'var(--green-hover)' },
]

const priorityConfig: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgent', color: 'var(--maroon)', bg: 'var(--maroon-hover)' },
  high: { label: 'High', color: 'var(--orange)', bg: 'var(--orange-hover)' },
  medium: { label: 'Medium', color: 'var(--gold)', bg: 'var(--gold-hover)' },
  low: { label: 'Low', color: 'var(--slate)', bg: 'rgba(100,116,139,0.06)' },
}

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

const COLLAPSED_KEY = 'mnccore-board-collapsed-v1'
const SWIMLANE_COLLAPSED_KEY = 'mnccore-swimlane-collapsed-v1'

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveCollapsed(state: Record<string, boolean>) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state))
}

function loadSwimlaneCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SWIMLANE_COLLAPSED_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveSwimlaneCollapsed(state: Record<string, boolean>) {
  localStorage.setItem(SWIMLANE_COLLAPSED_KEY, JSON.stringify(state))
}

export default function TaskBoardView({ tasks, onStatusChange, onSelect }: TaskBoardViewProps) {
  const [activeTask, setActiveTask] = useState<TaskRow | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupByField>('status')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed)
  const [swimlaneCollapsed, setSwimlaneCollapsed] = useState<Record<string, boolean>>(loadSwimlaneCollapsed)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  useEffect(() => { saveCollapsed(collapsed) }, [collapsed])
  useEffect(() => { saveSwimlaneCollapsed(swimlaneCollapsed) }, [swimlaneCollapsed])

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const toggleSwimlaneCollapse = useCallback((key: string) => {
    setSwimlaneCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Group tasks by status for standard board
  const tasksByStatus = useMemo(() => {
    const map: Record<string, TaskRow[]> = {}
    for (const col of columns) map[col.key] = []
    for (const task of tasks) {
      const bucket = map[task.status] || map.todo
      bucket.push(task)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2))
    }
    return map
  }, [tasks])

  // Build swimlane data when grouping by non-status field
  const swimlaneData = useMemo(() => {
    if (groupBy === 'status') return null

    const lanes = new Map<string, TaskRow[]>()
    for (const task of tasks) {
      const key = groupBy === 'priority' ? (task.priority || 'medium') : (task.assignee || 'unassigned')
      if (!lanes.has(key)) lanes.set(key, [])
      lanes.get(key)!.push(task)
    }

    // Sort lanes
    const sortedEntries = [...lanes.entries()].sort((a, b) => {
      if (groupBy === 'priority') {
        return (priorityOrder[a[0]] ?? 2) - (priorityOrder[b[0]] ?? 2)
      }
      return a[0].localeCompare(b[0])
    })

    return sortedEntries.map(([key, laneTasks]) => {
      const tasksByCol: Record<string, TaskRow[]> = {}
      for (const col of columns) tasksByCol[col.key] = []
      for (const task of laneTasks) {
        const bucket = tasksByCol[task.status] || tasksByCol.todo
        bucket.push(task)
      }
      return { key, tasks: laneTasks, tasksByCol }
    })
  }, [tasks, groupBy])

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id)
    setActiveTask(task || null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over) {
      setOverColumnId(null)
      return
    }
    const overData = over.data.current
    if (overData?.type === 'column') {
      // Auto-expand collapsed column on drag over
      const colKey = over.id as string
      setOverColumnId(colKey)
      if (collapsed[colKey]) {
        setCollapsed((prev) => ({ ...prev, [colKey]: false }))
      }
    } else if (overData?.type === 'task') {
      setOverColumnId(overData.status as string)
    } else {
      setOverColumnId(null)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null)
    setOverColumnId(null)
    const { active, over } = event
    if (!over) return

    const taskId = active.id as string
    const overId = over.id as string
    const draggedTask = tasks.find((t) => t.id === taskId)
    if (!draggedTask) return

    const overData = over.data.current
    let targetStatus: string | undefined

    if (overData?.type === 'column') {
      targetStatus = overId
    } else if (overData?.type === 'task') {
      targetStatus = overData.status as string
    } else {
      const targetColumn = columns.find((c) => c.key === overId)
      if (targetColumn) {
        targetStatus = targetColumn.key
      } else {
        const targetTask = tasks.find((t) => t.id === overId)
        if (targetTask) targetStatus = targetTask.status
      }
    }

    if (targetStatus && targetStatus !== draggedTask.status) {
      onStatusChange(taskId, targetStatus)
    }
  }

  const renderLaneLabel = (key: string) => {
    if (groupBy === 'priority') {
      const cfg = priorityConfig[key] || priorityConfig.medium
      return (
        <span className="flex items-center gap-2" style={{ color: cfg.color, fontSize: 'var(--value-size)', fontWeight: 'var(--label-weight)' }}>
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: cfg.color, opacity: 0.7 }} />
          {cfg.label}
        </span>
      )
    }
    if (groupBy === 'assignee') {
      const person = getPersonInfo(key)
      return (
        <span className="flex items-center gap-2" style={{ fontSize: 'var(--value-size)', fontWeight: 'var(--label-weight)', color: 'var(--ink)' }}>
          <div style={{ width: 20, height: 20 }}>
            <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[6px]" />
          </div>
          {person.name}
        </span>
      )
    }
    return <span style={{ fontSize: 'var(--value-size)', fontWeight: 'var(--label-weight)', color: 'var(--ink)' }}>{key}</span>
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Group By selector */}
      <div className="flex items-center gap-2 mb-3">
        <Layers size={13} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
          Group by:
        </span>
        {(['status', 'priority', 'assignee'] as const).map((field) => (
          <button
            key={field}
            onClick={() => setGroupBy(field)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 10px',
              borderRadius: 'var(--radius-md)',
              border: groupBy === field ? '1px solid var(--teal)' : '1px solid transparent',
              background: groupBy === field ? 'var(--teal-active)' : 'none',
              color: groupBy === field ? 'var(--teal)' : 'var(--slate)',
              fontSize: 'var(--label-size)',
              fontWeight: groupBy === field ? 'var(--label-weight)' : 400,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {field === 'assignee' ? 'Assignee' : field === 'priority' ? 'Priority' : 'Status'}
          </button>
        ))}
      </div>

      {/* Standard status board (no swimlanes) */}
      {groupBy === 'status' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {columns.map((col) => {
            const Icon = col.icon
            const columnTasks = tasksByStatus[col.key] || []
            const taskIds = columnTasks.map((t) => t.id)
            const isCollapsed = !!collapsed[col.key]

            if (isCollapsed) {
              return (
                <CollapsedColumn
                  key={col.key}
                  id={col.key}
                  label={col.label}
                  icon={Icon}
                  color={col.color}
                  bg={col.bg}
                  count={columnTasks.length}
                  isOver={overColumnId === col.key}
                  onExpand={() => toggleCollapse(col.key)}
                />
              )
            }

            return (
              <DroppableColumn key={col.key} id={col.key} isOver={overColumnId === col.key}>
                {/* Column header */}
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-t-lg border-b-2 mb-2"
                  style={{ backgroundColor: col.bg, borderColor: col.color }}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleCollapse(col.key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', color: col.color }}
                      title="Collapse column"
                    >
                      <ChevronDown size={12} />
                    </button>
                    <Icon size={14} style={{ color: col.color }} />
                    <span className="text-sm font-medium" style={{ color: col.color }}>
                      {col.label}
                    </span>
                  </div>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: col.bg, color: col.color, fontWeight: 600 }}
                  >
                    {columnTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2 min-h-[200px]">
                    {columnTasks.map((task) => (
                      <SortableTaskCard
                        key={task.id}
                        task={task}
                        onStatusChange={onStatusChange}
                        onSelect={onSelect}
                      />
                    ))}
                    {columnTasks.length === 0 && (
                      <div
                        className="flex items-center justify-center py-8 rounded-lg border border-dashed"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--slate)',
                          opacity: 'var(--ink-hint)',
                          fontSize: '12px',
                        }}
                      >
                        Drop here
                      </div>
                    )}
                  </div>
                </SortableContext>
              </DroppableColumn>
            )
          })}
        </div>
      )}

      {/* Swimlane view (groupBy = priority or assignee) */}
      {swimlaneData && (
        <div className="flex flex-col gap-4">
          {swimlaneData.map((lane) => {
            const isLaneCollapsed = !!swimlaneCollapsed[lane.key]

            return (
              <div key={lane.key}>
                {/* Swimlane header */}
                <button
                  onClick={() => toggleSwimlaneCollapse(lane.key)}
                  className="flex items-center gap-2 w-full mb-2 pb-1.5"
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    padding: 'var(--sp-xs) 0',
                  }}
                >
                  {isLaneCollapsed ? (
                    <ChevronRight size={14} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
                  ) : (
                    <ChevronDown size={14} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
                  )}
                  {renderLaneLabel(lane.key)}
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full ml-1"
                    style={{ background: 'var(--ice)', color: 'var(--slate)', fontWeight: 'var(--label-weight)' }}
                  >
                    {lane.tasks.length}
                  </span>
                </button>

                {/* Swimlane columns */}
                {!isLaneCollapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pl-4">
                    {columns.map((col) => {
                      const Icon = col.icon
                      const columnTasks = lane.tasksByCol[col.key] || []
                      const taskIds = columnTasks.map((t) => t.id)

                      return (
                        <DroppableColumn key={`${lane.key}-${col.key}`} id={col.key} isOver={overColumnId === col.key}>
                          <div
                            className="flex items-center justify-between px-2 py-1.5 rounded-t-lg border-b mb-1.5"
                            style={{ backgroundColor: col.bg, borderColor: `color-mix(in srgb, ${col.color} 30%, transparent)` }}
                          >
                            <div className="flex items-center gap-1.5">
                              <Icon size={12} style={{ color: col.color, opacity: 0.7 }} />
                              <span className="text-xs" style={{ color: col.color, opacity: 0.8 }}>
                                {col.label}
                              </span>
                            </div>
                            <span className="text-[10px]" style={{ color: col.color, opacity: 0.6 }}>
                              {columnTasks.length}
                            </span>
                          </div>
                          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                            <div className="flex flex-col gap-1.5 min-h-[80px]">
                              {columnTasks.map((task) => (
                                <SortableTaskCard
                                  key={task.id}
                                  task={task}
                                  onStatusChange={onStatusChange}
                                  onSelect={onSelect}
                                />
                              ))}
                              {columnTasks.length === 0 && (
                                <div
                                  className="flex items-center justify-center py-4 rounded border border-dashed"
                                  style={{
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--slate)',
                                    opacity: 0.3,
                                    fontSize: '10px',
                                  }}
                                >
                                  --
                                </div>
                              )}
                            </div>
                          </SortableContext>
                        </DroppableColumn>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Drag overlay */}
      <DragOverlay>
        {activeTask && (
          <div style={{ opacity: 0.85, transform: 'rotate(3deg)', boxShadow: 'var(--shadow-card-hover)' }}>
            <TaskCard task={activeTask} onStatusChange={() => {}} compact />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ── Collapsed Column ────────────────────────────────────────

function CollapsedColumn({
  id, label, icon: Icon, color, bg, count, isOver, onExpand,
}: {
  id: string
  label: string
  icon: typeof Circle
  color: string
  bg: string
  count: number
  isOver: boolean
  onExpand: () => void
}) {
  const { setNodeRef } = useDroppable({ id, data: { type: 'column' } })

  return (
    <div
      ref={setNodeRef}
      onClick={onExpand}
      style={{
        transition: 'all 150ms ease',
        backgroundColor: isOver ? 'var(--teal-hover)' : bg,
        border: isOver ? '2px dashed var(--gold)' : '2px solid transparent',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--sp-sm) var(--sp-xs)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--sp-sm)',
        minHeight: '200px',
      }}
    >
      <button
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          color,
        }}
        title="Expand column"
      >
        <ChevronRight size={12} />
      </button>

      {/* Vertical label */}
      <div
        style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          fontSize: '12px',
          fontWeight: 'var(--label-weight)',
          color,
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>

      <Icon size={14} style={{ color, opacity: 0.7 }} />

      {/* Count badge */}
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px]"
        style={{
          fontWeight: 600,
          color,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
        }}
      >
        {count}
      </span>
    </div>
  )
}

// ── Droppable Column ─────────────────────────────────────────

function DroppableColumn({ id, children, isOver }: { id: string; children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id, data: { type: 'column' } })

  return (
    <div
      ref={setNodeRef}
      style={{
        transition: 'all 150ms ease',
        backgroundColor: isOver ? 'var(--teal-hover)' : 'transparent',
        border: isOver ? '2px dashed var(--gold)' : '2px solid transparent',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--sp-xs)',
      }}
    >
      {children}
    </div>
  )
}

// ── Sortable Task Card ───────────────────────────────────────

function SortableTaskCard({
  task,
  onStatusChange,
  onSelect,
}: {
  task: TaskRow
  onStatusChange: (id: string, status: string) => void
  onSelect?: (task: TaskRow) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', status: task.status },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: 'grab' as const,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard
        task={task}
        onStatusChange={onStatusChange}
        compact
        onClick={onSelect ? () => onSelect(task) : undefined}
      />
    </div>
  )
}

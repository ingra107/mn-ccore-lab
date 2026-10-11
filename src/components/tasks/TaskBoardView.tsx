import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, ChevronDown, ChevronRight, Layers, ThumbsUp } from 'lucide-react'
import { TaskRow as CardTaskRow } from '../today/TaskRow'
import { Face } from '../today/skin'
import { getPersonInfo } from '../../data/team'
import type { TaskRow } from '../../lib/api'
import { ICON_PROPS } from '../../lib/iconProps'
import { InputSafeKeyboardSensor, InputSafePointerSensor, InputSafeTouchSensor } from '../../lib/dndSensors'
import { useTodayState, type TodayStateApi } from '../../hooks/useTodayState'
import { useUpdateTask } from '../../hooks/mutations'
import { useUndoToast } from '../UndoToast'
import { isTaskDone } from '../../lib/taskGrouping'
import { PRIORITY_OPTIONS } from '../../lib/taskConstants'

// Board cards are the Today card (today/TaskRow over tasks/TaskCardRow), the same
// one List renders: bold title, the project as a muted line, due pill + priority
// on one context line, the owner's photo face top right, folder + Work on under
// it. Board-only: a click opens the task panel (no inline drawer in a narrow
// column), and the priority word cycles on click. Column heads are plain text;
// the one colour left on the board is urgent's orange edge (Nick approved the
// mock 2026-10-10, Scratch/mockups/2026-10-10-tasks-table-rows.html).

type ProjectInfo = { name: string; slug: string; category?: string | null; primary_folder?: string | null }

interface TaskBoardViewProps {
  tasks: TaskRow[]
  onStatusChange: (id: string, status: string) => void
  onSelect?: (task: TaskRow) => void
  projectsByPid?: Map<string, ProjectInfo>
}

const NO_PROJECTS = new Map<string, ProjectInfo>()

type GroupByField = 'status' | 'priority' | 'assignee'

const columns = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
]

const priorityLabel: Record<string, string> = Object.fromEntries(PRIORITY_OPTIONS.map((o) => [o.value, o.label]))
const PRIORITY_CYCLE = ['low', 'medium', 'high', 'urgent'] as const

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

// Enter on a card opens it, so only Space picks one up (SortableTaskCard).
const BOARD_DRAG_INSTRUCTIONS = {
  draggable: 'Enter opens the task. Space picks the card up; the arrow keys move it to another column, Space drops it, Escape cancels.',
}

const COLLAPSED_KEY ='mnccore-board-collapsed-v1'
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

export default function TaskBoardView({ tasks, onStatusChange, onSelect, projectsByPid = NO_PROJECTS }: TaskBoardViewProps) {
  const [activeTask, setActiveTask] = useState<TaskRow | null>(null)
  const state = useTodayState(tasks)
  const cardProps: CardProps = { state, projectsByPid, onSelect }
  const [overColumnId, setOverColumnId] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupByField>('status')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed)
  const [swimlaneCollapsed, setSwimlaneCollapsed] = useState<Record<string, boolean>>(loadSwimlaneCollapsed)

  // PointerSensor covers mouse + trackpad; TouchSensor unlocks mobile
  // (250ms long-press so tap-to-open-detail still works); KeyboardSensor
  // gives a11y drag via arrow keys. Fix for P1-R2-08. Input-safe variants
  // (lib/dndSensors) keep typing/text-selection in nested form fields from
  // activating a drag (#481: TouchSensor was the one sensor still stock here
  // — same class as the 242ec76e Pointer/Keyboard fix, just missed).
  const sensors = useSensors(
    useSensor(InputSafePointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(InputSafeTouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(InputSafeKeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
      return <span className={`tk-bd-lane${key === 'urgent' ? ' tk-bd-urg' : ''}`}>{priorityLabel[key] ?? priorityLabel.medium}</span>
    }
    if (groupBy === 'assignee') {
      const person = getPersonInfo(key)
      return (
        <span className="tk-bd-lane">
          {key !== 'unassigned' && <Face slug={key} />}
          {person.name}
        </span>
      )
    }
    return <span className="tk-bd-lane">{key}</span>
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      accessibility={{ screenReaderInstructions: BOARD_DRAG_INSTRUCTIONS }}
    >
      <div className="tk tk-board">
        {/* Group By selector */}
        <div className="tk-bd-group">
          <Layers {...ICON_PROPS} size={13} aria-hidden />
          <span>Group by</span>
          {(['status', 'priority', 'assignee'] as const).map((field) => (
            <button
              key={field}
              type="button"
              onClick={() => setGroupBy(field)}
              className={groupBy === field ? 'tk-on' : undefined}
              aria-pressed={groupBy === field}
            >
              {field === 'assignee' ? 'Assignee' : field === 'priority' ? 'Priority' : 'Status'}
            </button>
          ))}
        </div>

        {/* Standard status board (no swimlanes) */}
        {groupBy === 'status' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {columns.map((col) => {
              const columnTasks = tasksByStatus[col.key] || []
              const taskIds = columnTasks.map((t) => t.id)
              const isCollapsed = !!collapsed[col.key]

              if (isCollapsed) {
                return (
                  <CollapsedColumn
                    key={col.key}
                    id={col.key}
                    label={col.label}
                    count={columnTasks.length}
                    isOver={overColumnId === col.key}
                    onExpand={() => toggleCollapse(col.key)}
                  />
                )
              }

              return (
                <DroppableColumn key={col.key} id={col.key} isOver={overColumnId === col.key}>
                  {/* Column head: plain text and a muted count, no coloured rule. */}
                  <h4 className="tk-bd-h">
                    <button
                      type="button"
                      className="tk-bd-col"
                      onClick={() => toggleCollapse(col.key)}
                      title="Collapse column"
                      aria-label={`Collapse ${col.label}`}
                    >
                      <ChevronDown {...ICON_PROPS} size={12} />
                    </button>
                    {col.label}
                    <span className="tk-bd-n">{columnTasks.length}</span>
                  </h4>

                  <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                    <div className="tk-bd-list">
                      {columnTasks.map((task) => (
                        <SortableTaskCard key={task.id} task={task} {...cardProps} />
                      ))}
                      {columnTasks.length === 0 && <div className="tk-bd-empty">Nothing here</div>}
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
                  <button
                    type="button"
                    onClick={() => toggleSwimlaneCollapse(lane.key)}
                    className="tk-bd-lh"
                    aria-expanded={!isLaneCollapsed}
                  >
                    {isLaneCollapsed ? <ChevronRight {...ICON_PROPS} size={14} /> : <ChevronDown {...ICON_PROPS} size={14} />}
                    {renderLaneLabel(lane.key)}
                    <span className="tk-bd-n">{lane.tasks.length}</span>
                  </button>

                  {!isLaneCollapsed && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pl-4">
                      {columns.map((col) => {
                        const columnTasks = lane.tasksByCol[col.key] || []
                        const taskIds = columnTasks.map((t) => t.id)

                        return (
                          <DroppableColumn key={`${lane.key}-${col.key}`} id={col.key} isOver={overColumnId === col.key}>
                            <h4 className="tk-bd-h tk-bd-sm">
                              {col.label}
                              <span className="tk-bd-n">{columnTasks.length}</span>
                            </h4>
                            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                              <div className="tk-bd-list tk-bd-sm">
                                {columnTasks.map((task) => (
                                  <SortableTaskCard key={task.id} task={task} {...cardProps} />
                                ))}
                                {columnTasks.length === 0 && <div className="tk-bd-empty tk-bd-sm">Nothing here</div>}
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

        {/* Drag overlay: the same card, lifted. */}
        <DragOverlay>
          {activeTask && (
            <div className="tk-bd-lift">
              <BoardCard task={activeTask} {...cardProps} />
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  )
}

// ── Collapsed Column ────────────────────────────────────────

function CollapsedColumn({
  id, label, count, isOver, onExpand,
}: {
  id: string
  label: string
  count: number
  isOver: boolean
  onExpand: () => void
}) {
  const { setNodeRef } = useDroppable({ id, data: { type: 'column' } })

  return (
    <div ref={setNodeRef} onClick={onExpand} className={`tk-bd-collapsed${isOver ? ' tk-bd-over' : ''}`}>
      <button type="button" className="tk-bd-col" title="Expand column" aria-label={`Expand ${label}`}>
        <ChevronRight {...ICON_PROPS} size={12} />
      </button>
      <div className="tk-bd-vert">{label}</div>
      <span className="tk-bd-n">{count}</span>
    </div>
  )
}

// ── Droppable Column ─────────────────────────────────────────

function DroppableColumn({ id, children, isOver }: { id: string; children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id, data: { type: 'column' } })

  return (
    <div ref={setNodeRef} className={`tk-bd-colw${isOver ? ' tk-bd-over' : ''}`}>
      {children}
    </div>
  )
}

// ── Board card ───────────────────────────────────────────────

type CardProps = {
  state: TodayStateApi
  projectsByPid: Map<string, ProjectInfo>
  onSelect?: (task: TaskRow) => void
}

const noop = () => {}

/** The Today card with the Board's extras on its context line: the priority
 *  word (a click cycles low -> medium -> high -> urgent -> low, as the old
 *  card's flag button did), Blocked, and Re-accept on a declined meeting task.
 *  Urgent's word is the orange Urgent tag (the mock's context line), so the
 *  title row drops its own copy on the board (index.css) and urgent can still
 *  step back down. Re-accept shows on done cards too: declining a meeting task
 *  marks it done (PendingMeetingsCard), so the Done column is the only place
 *  it can appear. */
export function BoardCard({ task, state, projectsByPid, onSelect }: { task: TaskRow } & CardProps) {
  const { mutate: mutateTask } = useUpdateTask()
  const { showUndo } = useUndoToast()
  const done = isTaskDone(task)
  const blocked = !done && !!task.blocked_by && task.blocked_by.split(',').some((s) => s.trim())
  const pri = task.priority || 'medium'
  const urgent = pri === 'urgent'

  const cyclePriority = () => {
    const idx = PRIORITY_CYCLE.indexOf(pri as typeof PRIORITY_CYCLE[number])
    const next = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]
    mutateTask({ id: task.id, fields: { priority: next } })
    showUndo(`Priority set to ${priorityLabel[next]}`, () => mutateTask({ id: task.id, fields: { priority: pri } }))
  }

  const extraPills = (
    <>
      {!done && (
        <button
          type="button"
          className={`tk-prio tip${urgent ? ' tk-tag tk-urgtag' : pri === 'high' ? ' tk-hi' : ''}`}
          onClick={(e) => { e.stopPropagation(); cyclePriority() }}
          onMouseDown={(e) => e.stopPropagation()}
          data-tip="Priority: click to change"
          aria-label={`Priority ${priorityLabel[pri] ?? pri}. Click to change`}
        >
          {priorityLabel[pri] ?? pri}
        </button>
      )}
      {blocked && (
        <span className="tk-pill" title={`Blocked by ${task.blocked_by}`}>
          <AlertTriangle {...ICON_PROPS} size={12} aria-hidden />Blocked
        </span>
      )}
      {task.approval_status === 'declined' && (
        <button
          type="button"
          className="tk-pill tk-btnp tip"
          data-testid="approval-reaccept"
          onClick={(e) => {
            e.stopPropagation()
            mutateTask({ id: task.id, fields: { approval_status: 'accepted' } })
            showUndo('Meeting re-accepted', () => mutateTask({ id: task.id, fields: { approval_status: 'declined' } }))
          }}
          onMouseDown={(e) => e.stopPropagation()}
          data-tip="Re-accept meeting"
          aria-label="Re-accept meeting"
        >
          <ThumbsUp {...ICON_PROPS} size={11} aria-hidden />Re-accept
        </button>
      )}
    </>
  )

  const open = onSelect ? () => onSelect(task) : undefined
  return (
    <CardTaskRow
      task={task}
      project={task.project_id ? projectsByPid.get(task.project_id) ?? null : null}
      state={state}
      expandedId={null}
      onExpand={noop}
      projectsByPid={projectsByPid}
      done={done}
      noDrag
      // No onOpenEditor: the title would be its own role=button focus stop,
      // and on the board a title click already opens through the header.
      onOpen={open ?? noop}
      extraPills={extraPills}
    />
  )
}

// ── Sortable Task Card ───────────────────────────────────────

function SortableTaskCard({ task, ...cardProps }: { task: TaskRow } & CardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', status: task.status },
  })
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const describedBy = attributes['aria-describedby']

  // The card header (.tk-tch) is the card's ONE focus stop: Enter opens the
  // task, Space picks the card up (arrows move it, Space drops, Esc cancels).
  // The wrapper used to carry dnd-kit's role=button + tabIndex too, a second
  // nested focus stop on every card. Making the header the activator node also
  // means a Space or Enter from an inner control (the done box, the priority
  // word) can never pick the card up: dnd-kit only activates when the key's
  // target IS the activator. Focus returns to the header after a drop.
  useLayoutEffect(() => {
    const header = wrapRef.current?.querySelector<HTMLElement>('.tk-tch') ?? null
    setActivatorNodeRef(header)
    header?.setAttribute('aria-describedby', describedBy)
  }, [setActivatorNodeRef, describedBy])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab' as const,
  }

  return (
    <div
      ref={(el) => { wrapRef.current = el; setNodeRef(el) }}
      style={style}
      className="tk-bd-card"
      {...listeners}
      // The header handles its own Space (it expands on Today) and stops it,
      // so on the board Space is handed to dnd-kit here, before the header
      // sees it, and marked handled (preventDefault) so the header skips it.
      // No stopPropagation: React's would also stop the native event, and
      // the drop Space must reach dnd-kit's window listener. Enter still
      // reaches the header and opens the task.
      onKeyDownCapture={(e) => {
        if (e.key !== ' ' || !(e.target as HTMLElement).classList.contains('tk-tch')) return
        listeners?.onKeyDown?.(e)
        e.preventDefault()
      }}
    >
      <BoardCard task={task} {...cardProps} />
    </div>
  )
}

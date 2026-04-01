import { useMemo, useState } from 'react'
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
import { Circle, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import TaskCard from './TaskCard'
import type { TaskRow } from '../../lib/api'

interface TaskBoardViewProps {
  tasks: TaskRow[]
  onStatusChange: (id: string, status: string) => void
  onSelect?: (task: TaskRow) => void
}

const columns = [
  { key: 'todo', label: 'To Do', icon: Circle, color: 'var(--slate)', bg: 'rgba(100,116,139,0.06)' },
  { key: 'in_progress', label: 'In Progress', icon: Clock, color: 'var(--teal)', bg: 'rgba(45,138,138,0.06)' },
  { key: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'var(--maroon)', bg: 'rgba(122,0,25,0.06)' },
  { key: 'done', label: 'Done', icon: CheckCircle2, color: 'var(--green, #22c55e)', bg: 'rgba(34,197,94,0.06)' },
]

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export default function TaskBoardView({ tasks, onStatusChange, onSelect }: TaskBoardViewProps) {
  const [activeTask, setActiveTask] = useState<TaskRow | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

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
      setOverColumnId(over.id as string)
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

    // Determine target status from column or task data
    const overData = over.data.current
    let targetStatus: string | undefined

    if (overData?.type === 'column') {
      targetStatus = overId
    } else if (overData?.type === 'task') {
      targetStatus = overData.status as string
    } else {
      // Fallback: check if overId matches a column key
      const targetColumn = columns.find((c) => c.key === overId)
      if (targetColumn) {
        targetStatus = targetColumn.key
      } else {
        // Or a task's status
        const targetTask = tasks.find((t) => t.id === overId)
        if (targetTask) targetStatus = targetTask.status
      }
    }

    if (targetStatus && targetStatus !== draggedTask.status) {
      onStatusChange(taskId, targetStatus)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((col) => {
          const Icon = col.icon
          const columnTasks = tasksByStatus[col.key] || []
          const taskIds = columnTasks.map((t) => t.id)

          return (
            <DroppableColumn key={col.key} id={col.key} isOver={overColumnId === col.key}>
              {/* Column header */}
              <div
                className="flex items-center justify-between px-3 py-2 rounded-t-lg border-b-2 mb-2"
                style={{ backgroundColor: col.bg, borderColor: col.color }}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} style={{ color: col.color }} />
                  <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', color: col.color }}>
                    {col.label}
                  </span>
                </div>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ fontFamily: 'var(--font-sans)', backgroundColor: col.bg, color: col.color, fontWeight: 600 }}
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
                        borderColor: 'var(--border-light)',
                        color: 'var(--slate)',
                        opacity: 0.4,
                        fontFamily: 'var(--font-sans)',
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

      {/* Drag overlay — shows the card being dragged */}
      <DragOverlay>
        {activeTask && (
          <div style={{ opacity: 0.85, transform: 'rotate(3deg)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
            <TaskCard task={activeTask} onStatusChange={() => {}} compact />
          </div>
        )}
      </DragOverlay>
    </DndContext>
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
        backgroundColor: isOver ? 'rgba(45, 138, 138, 0.04)' : 'transparent',
        border: isOver ? '2px dashed var(--gold)' : '2px solid transparent',
        borderRadius: '8px',
        padding: '4px',
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

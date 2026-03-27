import { useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
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

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const taskId = active.id as string
    const overId = over.id as string

    // Check if dropped on a column
    const targetColumn = columns.find((c) => c.key === overId)
    if (targetColumn) {
      const task = tasks.find((t) => t.id === taskId)
      if (task && task.status !== targetColumn.key) {
        onStatusChange(taskId, targetColumn.key)
      }
      return
    }

    // Check if dropped on another task — use that task's column
    const targetTask = tasks.find((t) => t.id === overId)
    if (targetTask) {
      const task = tasks.find((t) => t.id === taskId)
      if (task && task.status !== targetTask.status) {
        onStatusChange(taskId, targetTask.status)
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((col) => {
          const Icon = col.icon
          const columnTasks = tasksByStatus[col.key] || []
          const taskIds = columnTasks.map((t) => t.id)

          return (
            <DroppableColumn key={col.key} id={col.key}>
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
                  style={{ fontFamily: 'var(--font-mono)', backgroundColor: col.bg, color: col.color, fontWeight: 600 }}
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
          <div style={{ opacity: 0.9, transform: 'rotate(2deg)' }}>
            <TaskCard task={activeTask} onStatusChange={() => {}} compact />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ── Droppable Column ─────────────────────────────────────────

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useSortable({ id, data: { type: 'column' } })

  return (
    <div
      ref={setNodeRef}
      style={{
        transition: 'background-color 150ms ease',
        backgroundColor: isOver ? 'rgba(45, 138, 138, 0.04)' : 'transparent',
        borderRadius: '8px',
        padding: isOver ? '4px' : '0',
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
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
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

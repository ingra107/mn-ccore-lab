import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Target, GripVertical, Circle, Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import PomodoroCircles from './PomodoroCircles'

interface FocusTask {
  id: string
  title: string
  description?: string
  project_title?: string
  project_slug?: string
  priority?: string
  due_date?: string | null
}

interface FocusTaskSlotProps {
  tasks: FocusTask[]
  pomodoroData: Record<string, { completed: number; active: boolean }>
  onComplete: (id: string) => void
  onStartPomo: (taskId: string) => void
  onClickTitle: (task: FocusTask) => void
  onAddClick: () => void
  suggestions?: any[]
  onAcceptSuggestion?: (task: any) => void
}

function SortableFocusItem({ task, index, pomodorosCompleted, pomodoroActive, onComplete, onStartPomo, onClickTitle }: {
  task: FocusTask
  index: number
  pomodorosCompleted: number
  pomodoroActive: boolean
  onComplete: (id: string) => void
  onStartPomo: (taskId: string) => void
  onClickTitle: (task: FocusTask) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', slotType: 'focus', task },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        className="flex items-center gap-3 py-2.5 group"
        style={{ borderBottom: '1px solid rgba(201,168,76,0.06)' }}
      >
        {/* Drag handle */}
        <div {...listeners} style={{ cursor: 'grab', touchAction: 'none' }}>
          <GripVertical size={14} style={{ color: 'var(--slate)', opacity: 0.3 }} />
        </div>

        {/* Number */}
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700,
          color: 'var(--teal)', opacity: 0.6, width: 16, textAlign: 'center', flexShrink: 0,
        }}>
          {index + 1}
        </span>

        {/* Complete */}
        <button
          onClick={() => onComplete(task.id)}
          className="flex-shrink-0 hover:scale-110 transition-transform"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <Circle size={16} style={{ color: 'var(--slate)', opacity: 0.3 }} />
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <button
            onClick={() => onClickTitle(task)}
            className="block w-full text-left truncate"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)',
            }}
          >
            {task.title || task.description}
          </button>
          {task.project_title && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--gold)', opacity: 0.7 }}>
              {task.project_title}
            </span>
          )}
        </div>

        {/* Pomodoro */}
        <PomodoroCircles
          completed={pomodorosCompleted}
          active={pomodoroActive}
          onClickCircle={() => onStartPomo(task.id)}
        />
      </div>
    </div>
  )
}

export default function FocusTaskSlot({ tasks, pomodoroData, onComplete, onStartPomo, onClickTitle, onAddClick, suggestions = [], onAcceptSuggestion }: FocusTaskSlotProps) {
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: 'focus-slot',
    data: { type: 'slot', slotType: 'focus' },
  })

  const taskIds = tasks.map(t => t.id)
  const emptySlots = Math.max(0, 3 - tasks.length)

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Target size={14} style={{ color: 'var(--teal)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--teal)' }}>
          Focus Tasks
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)', opacity: 0.5 }}>
          {tasks.length}/3
        </span>
      </div>

      <div
        ref={setDropRef}
        className="rounded-lg overflow-hidden"
        style={{
          border: `1px solid ${isOver ? 'var(--teal)' : 'rgba(45,138,138,0.15)'}`,
          background: isOver ? 'rgba(45,138,138,0.03)' : 'transparent',
          transition: 'all 0.2s ease',
        }}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div className="px-3">
            {tasks.map((task, i) => {
              const pomo = pomodoroData[task.id] || { completed: 0, active: false }
              return (
                <SortableFocusItem
                  key={task.id}
                  task={task}
                  index={i}
                  pomodorosCompleted={pomo.completed}
                  pomodoroActive={pomo.active}
                  onComplete={onComplete}
                  onStartPomo={onStartPomo}
                  onClickTitle={onClickTitle}
                />
              )
            })}
          </div>
        </SortableContext>

        {/* Empty slots — show suggestions or placeholder */}
        {emptySlots > 0 && (
          <div className="px-3">
            {Array.from({ length: emptySlots }).map((_, i) => {
              const suggestion = suggestions[i]
              return suggestion ? (
                <motion.button
                  key={`suggest-${i}`}
                  onClick={() => onAcceptSuggestion?.(suggestion)}
                  className="w-full flex items-center gap-3 py-2.5 text-left"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: i < emptySlots - 1 ? '1px solid rgba(201,168,76,0.04)' : undefined,
                  }}
                  whileHover={{ backgroundColor: 'rgba(45,138,138,0.03)' }}
                >
                  <div style={{ width: 14 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--teal)', opacity: 0.3, width: 16, textAlign: 'center' }}>
                    {tasks.length + i + 1}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: suggestion._isCarried ? 'var(--gold)' : 'var(--teal)', opacity: 0.4, textTransform: 'uppercase', flexShrink: 0 }}>
                    {suggestion._isCarried ? 'Carried' : 'Suggested'}
                  </span>
                  <span className="truncate" style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)', opacity: 0.35 }}>
                    {suggestion.title || suggestion.description}
                  </span>
                  <Plus size={12} style={{ color: 'var(--teal)', opacity: 0.3, flexShrink: 0 }} />
                </motion.button>
              ) : (
                <motion.button
                  key={`empty-${i}`}
                  onClick={onAddClick}
                  className="w-full flex items-center gap-3 py-2.5"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: i < emptySlots - 1 ? '1px solid rgba(201,168,76,0.04)' : undefined,
                  }}
                  whileHover={{ backgroundColor: 'rgba(45,138,138,0.03)' }}
                >
                  <div style={{ width: 14 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--teal)', opacity: 0.3, width: 16, textAlign: 'center' }}>
                    {tasks.length + i + 1}
                  </span>
                  <Plus size={14} style={{ color: 'var(--slate)', opacity: 0.2 }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--slate)', opacity: 0.3, fontStyle: 'italic' }}>
                    Drag a task here
                  </span>
                </motion.button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Moon, GripVertical, Circle, Plus } from 'lucide-react'
import { motion } from 'framer-motion'

interface EveningTask {
  id: string
  title: string
  description?: string
  project_title?: string
  project_slug?: string
  priority?: string
  due_date?: string | null
}

interface EveningTaskSlotProps {
  tasks: EveningTask[]
  onComplete: (id: string) => void
  onClickTitle: (task: EveningTask) => void
  onAddClick: () => void
}

function SortableEveningItem({ task, onComplete, onClickTitle }: {
  task: EveningTask
  onComplete: (id: string) => void
  onClickTitle: (task: EveningTask) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', slotType: 'evening', task },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 0.85,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        className="flex items-center gap-3 py-2.5 group"
        style={{ borderBottom: '1px solid rgba(201,168,76,0.04)' }}
      >
        {/* Drag handle */}
        <div {...listeners} style={{ cursor: 'grab', touchAction: 'none' }}>
          <GripVertical size={14} style={{ color: 'var(--slate)', opacity: 0.75 }} />
        </div>

        {/* Complete */}
        <button
          onClick={() => onComplete(task.id)}
          className="flex-shrink-0 hover:scale-110 transition-transform"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <Circle size={16} style={{ color: 'var(--slate)', opacity: 0.75 }} />
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <button
            onClick={() => onClickTitle(task)}
            className="block w-full text-left truncate"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: '13px', color: 'var(--muted)',
            }}
          >
            {task.title || task.description}
          </button>
          {task.project_title && (
            <span style={{ fontSize: '10px', color: 'var(--gold)', opacity: 'var(--ink-label)' }}>
              {task.project_title}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EveningTaskSlot({ tasks, onComplete, onClickTitle, onAddClick }: EveningTaskSlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'evening-slot',
    data: { type: 'slot', slotType: 'evening' },
  })

  const taskIds = tasks.map(t => t.id)

  return (
    <div className="mb-6">
      {/* Subtle divider */}
      <div className="flex items-center gap-3 mb-3 mt-2">
        <div style={{ flex: 1, height: 1, background: 'var(--gold-active)' }} />
        <span style={{ fontSize: '10px', color: 'var(--gold)', opacity: 'var(--ink-hint)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          later
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--gold-active)' }} />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <Moon size={13} style={{ color: 'var(--gold)', opacity: 0.85 }} />
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--gold)', opacity: 0.85 }}>
          This Evening
        </span>
        {tasks.length > 0 && (
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
            {tasks.length}
          </span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className="rounded-lg"
        style={{
          border: `1px solid ${isOver ? 'var(--gold)' : 'rgba(201,168,76,0.1)'}`,
          background: isOver ? 'var(--gold-hover)' : 'transparent',
          transition: 'all 0.2s ease',
          minHeight: tasks.length === 0 ? 40 : undefined,
          opacity: 0.85,
        }}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div className="px-3">
            {tasks.map((task) => (
              <SortableEveningItem
                key={task.id}
                task={task}
                onComplete={onComplete}
                onClickTitle={onClickTitle}
              />
            ))}
          </div>
        </SortableContext>

        <motion.button
          onClick={onAddClick}
          className="w-full flex items-center justify-center gap-1 py-2"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            borderTop: tasks.length > 0 ? '1px solid rgba(201,168,76,0.04)' : undefined,
          }}
          whileHover={{ backgroundColor: 'var(--gold-hover)' }}
        >
          <Plus size={12} style={{ color: 'var(--gold)', opacity: 0.85 }} />
          <span style={{ fontSize: '11px', color: 'var(--gold)', opacity: 0.85 }}>
            Defer to evening
          </span>
        </motion.button>
      </div>
    </div>
  )
}

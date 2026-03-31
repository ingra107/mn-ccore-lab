import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Zap, GripVertical, Plus } from 'lucide-react'
import { motion } from 'framer-motion'

interface QuickWinTask {
  id: string
  title: string
  description?: string
  project_title?: string
  project_slug?: string
}

interface QuickWinsListProps {
  tasks: QuickWinTask[]
  onComplete: (id: string) => void
  onClickTitle: (task: QuickWinTask) => void
  onAddClick: () => void
}

function SortableQuickWin({ task, onComplete, onClickTitle }: {
  task: QuickWinTask
  onComplete: (id: string) => void
  onClickTitle: (task: QuickWinTask) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', slotType: 'quick_win', task },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        className="flex items-center gap-2 py-1.5 group"
        style={{ borderBottom: '1px solid rgba(201,168,76,0.04)' }}
      >
        <div {...listeners} style={{ cursor: 'grab', touchAction: 'none' }}>
          <GripVertical size={12} style={{ color: 'var(--slate)', opacity: 0.2 }} />
        </div>

        <button
          onClick={() => onComplete(task.id)}
          className="flex-shrink-0 hover:scale-110 transition-transform"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div style={{
            width: 14, height: 14, borderRadius: 3,
            border: '1.5px solid var(--slate)', opacity: 0.3,
          }} />
        </button>

        <button
          onClick={() => onClickTitle(task)}
          className="flex-1 text-left truncate"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)',
          }}
        >
          {task.title || task.description}
        </button>

        {task.project_title && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--slate)', opacity: 0.5, flexShrink: 0 }}>
            {task.project_title}
          </span>
        )}
      </div>
    </div>
  )
}

export default function QuickWinsList({ tasks, onComplete, onClickTitle, onAddClick }: QuickWinsListProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'quick-win-slot',
    data: { type: 'slot', slotType: 'quick_win' },
  })

  const taskIds = tasks.map(t => t.id)

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Zap size={13} style={{ color: 'var(--slate)', opacity: 0.6 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--slate)', opacity: 0.7 }}>
          Quick Wins
        </span>
        {tasks.length > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)', opacity: 0.4 }}>
            {tasks.length}
          </span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className="rounded-lg"
        style={{
          border: `1px solid ${isOver ? 'var(--slate)' : 'rgba(100,116,139,0.1)'}`,
          background: isOver ? 'rgba(100,116,139,0.03)' : 'transparent',
          transition: 'all 0.2s ease',
          minHeight: tasks.length === 0 ? 40 : undefined,
        }}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div className="px-3">
            {tasks.map((task) => (
              <SortableQuickWin
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
          whileHover={{ backgroundColor: 'rgba(100,116,139,0.03)' }}
        >
          <Plus size={12} style={{ color: 'var(--slate)', opacity: 0.3 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)', opacity: 0.3 }}>
            Add quick win
          </span>
        </motion.button>
      </div>
    </div>
  )
}

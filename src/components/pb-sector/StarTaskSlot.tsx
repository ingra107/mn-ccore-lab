import { useDroppable } from '@dnd-kit/core'
import { Star, Plus, GripVertical } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import PomodoroCircles from './PomodoroCircles'

interface StarTaskSlotProps {
  task: any | null
  pomodorosCompleted: number
  pomodoroActive: boolean
  onComplete: (id: string) => void
  onStartPomo: (taskId: string) => void
  onClickTitle: (task: any) => void
  onAddClick: () => void
  suggestion?: any | null
  onAcceptSuggestion?: (task: any) => void
}

export default function StarTaskSlot({ task, pomodorosCompleted, pomodoroActive, onComplete, onStartPomo, onClickTitle, onAddClick, suggestion, onAcceptSuggestion }: StarTaskSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: 'star-slot', data: { type: 'slot', slotType: 'star' } })

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Star size={14} style={{ color: 'var(--gold)', fill: 'var(--gold)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--gold)' }}>
          Your One Thing
        </span>
      </div>

      <div
        ref={setNodeRef}
        style={{
          minHeight: 64,
          borderRadius: 12,
          border: task
            ? '2px solid var(--gold)'
            : `2px dashed ${isOver ? 'var(--gold)' : 'rgba(201,168,76,0.25)'}`,
          background: task
            ? 'rgba(201,168,76,0.04)'
            : isOver ? 'rgba(201,168,76,0.06)' : 'transparent',
          boxShadow: task ? '0 0 20px rgba(201,168,76,0.1)' : undefined,
          transition: 'all 0.2s ease',
          padding: task ? 0 : undefined,
        }}
      >
        <AnimatePresence mode="wait">
          {task ? (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-3 px-4 py-3"
            >
              <GripVertical size={14} style={{ color: 'var(--gold)', opacity: 0.4, cursor: 'grab', flexShrink: 0 }} />

              {/* Complete button */}
              <button
                onClick={() => onComplete(task.id)}
                className="flex-shrink-0 hover:scale-110 transition-transform"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: '2px solid var(--gold)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} />
              </button>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onClickTitle(task)}
                  className="block w-full text-left truncate"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 600, color: 'var(--ink)',
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

              {/* Pomodoro circles */}
              <PomodoroCircles
                completed={pomodorosCompleted}
                active={pomodoroActive}
                onClickCircle={() => onStartPomo(task.id)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              {suggestion ? (
                <button
                  onClick={() => onAcceptSuggestion?.(suggestion)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201,168,76,0.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--gold)', opacity: 0.5, textTransform: 'uppercase', flexShrink: 0 }}>
                    Suggested
                  </span>
                  <span className="truncate" style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)', opacity: 0.4 }}>
                    {suggestion.title || suggestion.description}
                  </span>
                  <Plus size={14} style={{ color: 'var(--gold)', opacity: 0.4, flexShrink: 0 }} />
                </button>
              ) : (
                <button
                  onClick={onAddClick}
                  className="w-full flex items-center justify-center gap-2 py-4"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <Plus size={16} style={{ color: 'var(--gold)', opacity: 0.4 }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--gold)', opacity: 0.5, fontStyle: 'italic' }}>
                    What is the ONE thing you must do today?
                  </span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

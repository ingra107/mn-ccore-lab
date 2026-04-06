import { useState, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Circle, CheckCircle2, ListChecks, Plus, Trash2,
} from 'lucide-react'
import CollapsibleSection from '../../CollapsibleSection'
import { useSubtasks } from '../../../hooks/useApiData'
import { useCreateSubtask, useToggleSubtask, useDeleteSubtask } from '../../../hooks/useMutations'

// ── Subtask Section (collapsible wrapper) ───────────────────

export function SubtaskSection({ taskId }: { taskId: string }) {
  const { data: subtasks = [] } = useSubtasks(taskId)
  const total = subtasks.length
  const completed = subtasks.filter((s) => s.completed).length

  return (
    <CollapsibleSection
      title="Subtasks"
      icon={<ListChecks size={11} style={{ color: 'var(--slate)', opacity: 0.5 }} />}
      badge={total > 0 ? `${completed}/${total}` : null}
      defaultOpen={total > 0}
      storageKey={`task-subtasks-${taskId}`}
    >
      <SubtaskChecklist taskId={taskId} />
    </CollapsibleSection>
  )
}

// ── Subtask Checklist ────────────────────────────────────────

export function SubtaskChecklist({ taskId }: { taskId: string }) {
  const { data: subtasks = [] } = useSubtasks(taskId)
  const createSubtask = useCreateSubtask(taskId)
  const toggleSubtask = useToggleSubtask(taskId)
  const deleteSubtask = useDeleteSubtask(taskId)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const completed = subtasks.filter((s) => s.completed).length
  const total = subtasks.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const allDone = total > 0 && completed === total

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    createSubtask.mutate(newTitle.trim())
    setNewTitle('')
    inputRef.current?.focus()
  }

  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] mb-2" style={{ color: 'var(--slate)', opacity: 0.65, fontWeight: 500 }}>
        <ListChecks size={12} style={{ opacity: 0.7 }} />
        Subtasks ({completed}/{total})
      </label>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(201, 168, 76, 0.15)', overflow: 'hidden', marginBottom: '0.75rem' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: allDone ? 'var(--teal)' : 'var(--gold)', borderRadius: 2, transition: 'width 0.3s ease' }} />
        </div>
      )}

      {/* Subtask list */}
      <div className="flex flex-col gap-0.5 mb-2">
        <AnimatePresence initial={false}>
          {subtasks.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.15 }}
              className="group flex items-center gap-2 py-1.5 px-1 -mx-1 rounded hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors"
            >
              {/* Toggle button */}
              <button
                onClick={() => toggleSubtask.mutate(s.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
              >
                {s.completed ? (
                  <CheckCircle2 size={16} style={{ color: 'var(--teal)' }} />
                ) : (
                  <Circle size={16} style={{ color: 'var(--slate)', opacity: 0.3 }} />
                )}
              </button>

              {/* Title */}
              <span
                className="flex-1 text-sm min-w-0 truncate"
                style={{
                  color: s.completed ? 'var(--slate)' : 'var(--ink)',
                  textDecoration: s.completed ? 'line-through' : 'none',
                  opacity: s.completed ? 0.5 : 1,
                }}
              >
                {s.title}
              </span>

              {/* Delete button (visible on hover) */}
              <button
                onClick={() => deleteSubtask.mutate(s.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--slate)', flexShrink: 0 }}
              >
                <Trash2 size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add subtask input */}
      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <Plus size={14} style={{ color: 'var(--slate)', opacity: 0.3, flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add subtask..."
          className="flex-1 text-sm outline-none bg-transparent py-1"
          style={{ color: 'var(--ink)', border: 'none' }}
        />
      </form>
    </div>
  )
}

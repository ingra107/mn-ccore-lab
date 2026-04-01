import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface TaskSearchDropdownProps {
  tasks: any[]
  excludeIds: Set<string>
  isOpen: boolean
  onClose: () => void
  onSelect: (task: any) => void
  slotLabel: string
}

export default function TaskSearchDropdown({ tasks, excludeIds, isOpen, onClose, onSelect, slotLabel }: TaskSearchDropdownProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Filter: not completed, not already in plan, matches query
  const filtered = tasks.filter(t => {
    if (t.completed) return false
    if (excludeIds.has(t.id)) return false
    if (!query) return true
    const q = query.toLowerCase()
    return (t.title || '').toLowerCase().includes(q)
      || (t.project_title || '').toLowerCase().includes(q)
  }).slice(0, 12)

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(15,25,35,0.2)' }}
        onClick={onClose}
      >
        <div
          className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-xl shadow-lg overflow-hidden" style={{ background: 'var(--cream)', border: '2px solid var(--gold)' }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(201,168,76,0.1)' }}>
              <Search size={16} style={{ color: 'var(--gold)', opacity: 0.6 }} />
              <input
                ref={inputRef}
                type="text"
                placeholder={`Add task to ${slotLabel}...`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onClose()
                  if (e.key === 'Enter' && filtered.length > 0) { onSelect(filtered[0]); onClose() }
                }}
                className="flex-1"
                style={{
                  fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)',
                  background: 'transparent', border: 'none', outline: 'none',
                }}
              />
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <X size={16} style={{ color: 'var(--slate)', opacity: 0.5 }} />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--slate)', opacity: 0.5 }}>
                    {query ? 'No matching tasks' : 'No available tasks'}
                  </span>
                </div>
              ) : (
                filtered.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => { onSelect(task); onClose() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(201,168,76,0.04)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201,168,76,0.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Priority dot */}
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: task.priority === 'urgent' ? 'var(--maroon)' : task.priority === 'high' ? '#e67e22' : task.priority === 'medium' ? 'var(--gold)' : 'var(--slate)',
                    }} />

                    <div className="flex-1 min-w-0">
                      <span className="block truncate" style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)' }}>
                        {task.title || task.description}
                      </span>
                      {task.project_title && (
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', color: 'var(--gold)', opacity: 0.6 }}>
                          {task.project_title}
                        </span>
                      )}
                    </div>

                    {task.due_date && (
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', color: 'var(--slate)', opacity: 0.5, flexShrink: 0 }}>
                        {task.due_date}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

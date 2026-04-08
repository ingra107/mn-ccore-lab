import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { spring } from '../lib/animations'

interface ShortcutHelpProps {
  open: boolean
  onClose: () => void
}

const shortcuts = [
  {
    category: 'Navigation (G + key)',
    items: [
      { keys: 'G D', action: 'Go to Dashboard' },
      { keys: 'G H', action: 'Go to My Hub' },
      { keys: 'G T', action: 'Go to Tasks' },
      { keys: 'G P', action: 'Go to Projects' },
      { keys: 'G M', action: 'Go to Meetings' },
      { keys: 'G C', action: 'Go to Calendar' },
      { keys: 'G I', action: 'Go to Ideas' },
      { keys: 'G L', action: 'Go to Research Digest' },
      { keys: 'G G', action: 'Go to Grants' },
      { keys: 'G K', action: 'Go to Deadlines' },
      { keys: 'G Y', action: 'Go to My Tasks' },
      { keys: 'G A', action: 'Go to Activity' },
      { keys: 'G S', action: 'Go to Search' },
    ],
  },
  {
    category: 'Actions',
    items: [
      { keys: 'C', action: 'Create new task' },
      { keys: 'N', action: 'Submit new idea' },
    ],
  },
  {
    category: 'Global',
    items: [
      { keys: '⌘ K', action: 'Command palette' },
      { keys: '⌘ N', action: 'Quick add task' },
      { keys: '/', action: 'Search' },
      { keys: 'F', action: 'Focus mode (hide sidebar + header)' },
      { keys: '[', action: 'Toggle sidebar' },
      { keys: '⌘ .', action: 'Cycle theme (light/dark/system)' },
      { keys: '?', action: 'This help' },
    ],
  },
  {
    category: 'Task List',
    items: [
      { keys: 'J', action: 'Focus next task' },
      { keys: 'K', action: 'Focus previous task' },
      { keys: 'Space', action: 'Peek task' },
      { keys: 'Enter', action: 'Open task detail' },
      { keys: 'S', action: 'Cycle status' },
      { keys: 'X', action: 'Toggle selection' },
      { keys: 'E', action: 'Edit task title inline' },
      { keys: 'D', action: 'Set due date' },
      { keys: 'Z', action: 'Snooze task (+1 day)' },
      { keys: 'B', action: 'Add blocker' },
      { keys: '→', action: 'Expand subtasks' },
      { keys: '←', action: 'Collapse subtasks' },
      { keys: 'Esc', action: 'Close panel' },
    ],
  },
  {
    category: 'Project List',
    items: [
      { keys: 'J', action: 'Focus next project' },
      { keys: 'K', action: 'Focus previous project' },
      { keys: 'Enter', action: 'Open project detail' },
      { keys: 'Esc', action: 'Clear selection' },
    ],
  },
]

export default function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          style={{ backgroundColor: 'rgba(15, 25, 35, 0.5)' }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label="Keyboard shortcuts"
            aria-modal="true"
            className="w-full max-w-md rounded-xl shadow-2xl border overflow-hidden mx-4"
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={spring.snappy}
            style={{ backgroundColor: 'var(--card-bg, #fff)', borderColor: 'var(--border-light)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
              <h3 className="text-sm font-normal" style={{ color: 'var(--ink)' }}>
                Keyboard Shortcuts
              </h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '4px' }}>
                <X size={16} />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto flex flex-col gap-4">
              {shortcuts.map((group) => (
                <div key={group.category}>
                  <h4 className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--slate)', opacity: 0.5 }}>
                    {group.category}
                  </h4>
                  <div className="flex flex-col gap-1">
                    {group.items.map((item) => (
                      <div key={item.keys} className="flex items-center justify-between py-1">
                        <span className="text-sm" style={{ color: 'var(--ink)' }}>
                          {item.action}
                        </span>
                        <div className="flex items-center gap-1">
                          {item.keys.split(' ').map((key, i) => (
                            <kbd
                              key={i}
                              className="text-[11px] px-2 py-0.5 rounded border min-w-[24px] text-center"
                              style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', borderColor: 'var(--border-light)', backgroundColor: 'var(--cream)' }}
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

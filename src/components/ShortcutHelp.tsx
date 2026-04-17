import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { spring } from '../lib/animations'

interface ShortcutHelpProps {
  open: boolean
  onClose: () => void
}

const shortcuts = [
  {
    category: 'Navigation (press G, then key — 1s window)',
    items: [
      { keys: 'G D', action: 'Go to Dashboard' },
      { keys: 'G T', action: 'Go to My Tasks' },
      { keys: 'G P', action: 'Go to Projects' },
      { keys: 'G M', action: 'Go to Meetings' },
      { keys: 'G E', action: 'Go to Deadlines' },
      { keys: 'G I', action: 'Go to Ideas' },
      { keys: 'G S', action: 'Go to Settings' },
      { keys: 'G C', action: 'Go to Calendar' },
      { keys: 'G H', action: 'Go to Home' },
      { keys: 'G R', action: 'Go to Research Digest' },
      { keys: 'G G', action: 'Go to Grants' },
      { keys: 'G A', action: 'Go to Activity' },
    ],
  },
  {
    category: 'Actions',
    items: [
      { keys: 'C', action: 'Create new task' },
      { keys: 'N', action: 'New task (navigates to Tasks + opens create modal)' },
    ],
  },
  {
    category: 'Global',
    items: [
      { keys: '⌘ K', action: 'Command palette' },
      { keys: '⌘ N', action: 'Quick add task' },
      { keys: '⌘ I', action: 'Quick capture to Peripheral Brain inbox' },
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
      { keys: 'A', action: 'Assign task' },
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
      { keys: 'P', action: 'Pin / unpin project' },
      { keys: 'Enter', action: 'Open project detail' },
      { keys: 'Esc', action: 'Clear selection' },
    ],
  },
  {
    category: 'Calendar',
    items: [
      { keys: '←', action: 'Previous period' },
      { keys: '→', action: 'Next period' },
      { keys: 'T', action: 'Jump to today' },
    ],
  },
]

export default function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Save previously focused element; focus close button on open; restore on close
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement
      const id = setTimeout(() => closeButtonRef.current?.focus(), 50)
      return () => clearTimeout(id)
    } else {
      previousFocusRef.current?.focus()
    }
  }, [open])

  // Escape key + focus trap
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableSelectors =
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
        ).filter((el) => !el.hasAttribute('disabled'))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 'var(--z-modal-backdrop)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcut-help-title"
            className="w-full max-w-md rounded-xl shadow-2xl border overflow-hidden mx-4"
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={spring.snappy}
            style={{ backgroundColor: 'var(--card-bg, #fff)', borderColor: 'var(--border-subtle)', zIndex: 'var(--z-modal)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <h3 id="shortcut-help-title" className="text-sm font-normal" style={{ color: 'var(--ink)' }}>
                Keyboard Shortcuts
              </h3>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 'var(--sp-xs)' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto flex flex-col gap-4">
              {shortcuts.map((group) => (
                <div key={group.category}>
                  <h4 className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
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
                              style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', borderColor: 'var(--border-subtle)', backgroundColor: 'var(--cream)' }}
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

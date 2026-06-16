// ShortcutHelp — keyboard shortcut reference panel.
// Uses ui/Modal (animated=true for framer-motion enter/exit; previous-focus
// restoration is now owned by Modal so the local previousFocusRef is gone).
import Modal from './ui/Modal'

const shortcuts = [
  {
    category: 'Navigation (press G, then key — 1s window)',
    items: [
      { keys: 'G D', action: 'Go to Today' },
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
      { keys: 'q', action: 'Quick add task' },
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

interface ShortcutHelpProps {
  open: boolean
  onClose: () => void
}

export default function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard Shortcuts"
      maxWidth="sm"
      variant="modal"
      animated
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto', fontSize: 11, color: 'var(--slate)' }}>
          <kbd
            className="text-[11px] px-2 py-0.5 rounded border"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', borderColor: 'var(--border-subtle)', backgroundColor: 'var(--cream)' }}
          >
            Esc
          </kbd>
          <span>Close this panel</span>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
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
    </Modal>
  )
}

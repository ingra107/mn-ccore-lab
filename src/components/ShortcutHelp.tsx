import { X } from 'lucide-react'

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
      { keys: 'G L', action: 'Go to Literature' },
      { keys: 'G G', action: 'Go to Grants' },
      { keys: 'G K', action: 'Go to Deadlines' },
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
      { keys: '?', action: 'This help' },
    ],
  },
  {
    category: 'Task Detail Panel',
    items: [
      { keys: 'Click', action: 'Open task detail' },
      { keys: 'Esc', action: 'Close panel' },
    ],
  },
]

export default function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15, 25, 35, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl border overflow-hidden mx-4"
        style={{ backgroundColor: 'var(--card-bg, #fff)', borderColor: 'var(--border-light)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <h3 className="text-sm font-normal" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
            Keyboard Shortcuts
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto flex flex-col gap-4">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h4 className="text-[10px] uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
                {group.category}
              </h4>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <div key={item.keys} className="flex items-center justify-between py-1">
                    <span className="text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
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
      </div>
    </div>
  )
}

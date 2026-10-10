import { useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useDarkMode } from '../hooks/useDarkMode'
import { ICON_PROPS } from '../lib/iconProps'

/**
 * Theme picker shared by the portal and the public site: the button shows the
 * CURRENT mode (sun / moon / monitor) and opens a Light / Dark / System menu.
 */
export default function ThemeMenu() {
  const { mode, setTheme } = useDarkMode()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md transition-colors cursor-pointer"
        style={{ color: 'var(--slate)' }}
        aria-label="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {mode === 'light' ? <Sun {...ICON_PROPS} size={18} /> : mode === 'dark' ? <Moon {...ICON_PROPS} size={18} /> : <Monitor {...ICON_PROPS} size={18} />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 rounded-lg border shadow-lg z-50 py-1 min-w-[140px]"
            style={{ backgroundColor: 'var(--cream, #fff)', borderColor: 'var(--border-subtle)' }}
          >
            {([
              { key: 'light' as const, icon: Sun, label: 'Light' },
              { key: 'dark' as const, icon: Moon, label: 'Dark' },
              { key: 'system' as const, icon: Monitor, label: 'System' },
            ]).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => { setTheme(key); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{
                  color: mode === key ? 'var(--teal)' : 'var(--ink)',
                  fontWeight: mode === key ? 500 : 400,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Icon {...ICON_PROPS} size={15} style={{ opacity: mode === key ? 1 : 0.85 }} />
                {label}
                {mode === key && <span className="ml-auto text-[10px]" style={{ color: 'var(--teal)' }}>&#10003;</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

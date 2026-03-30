import { useState, useCallback, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, Sun, Moon, Monitor, Search, Plus } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useDarkMode } from '../hooks/useDarkMode'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'
import ShortcutHelp from './ShortcutHelp'
import PageTransition from './PageTransition'
import GlobalQuickAddModal, { useQuickAddShortcut } from './GlobalQuickAdd'
import RouteProgressBar from './RouteProgressBar'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

export default function PortalLayout() {
  const { mode, setTheme } = useDarkMode()
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const { showHelp, setShowHelp, gPending } = useKeyboardShortcuts()
  useQuickAddShortcut(useCallback(() => setQuickAddOpen(true), []))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('mn-ccore-sidebar-collapsed') === 'true'
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('mn-ccore-sidebar-collapsed', String(next))
      return next
    })
  }, [])

  // Listen for keyboard shortcut [ to toggle sidebar
  useEffect(() => {
    const handler = () => toggleSidebar()
    document.addEventListener('toggle-sidebar', handler)
    return () => document.removeEventListener('toggle-sidebar', handler)
  }, [toggleSidebar])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <RouteProgressBar />

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="lg:hidden fixed top-0 left-0 z-40">
            <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Main content area */}
      <div
        className={`transition-all duration-200 ${
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'
        }`}
      >
        {/* Top bar */}
        <header
          className="sticky top-0 z-20 h-14 flex items-center px-4 border-b backdrop-blur-sm"
          style={{
            backgroundColor: 'rgba(var(--bg-rgb, 250,248,243), 0.9)',
            borderColor: 'var(--border-light)',
          }}
        >
          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 mr-2 rounded-md"
            onClick={() => setMobileOpen(true)}
            style={{ color: 'var(--ink)' }}
          >
            <Menu size={20} />
          </button>

          {/* Search trigger */}
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm transition-colors hover:bg-black/5"
            style={{ borderColor: 'var(--border-light)', color: 'var(--slate)', fontFamily: 'var(--font-sans)', cursor: 'pointer', background: 'none', opacity: 0.7 }}
          >
            <Search size={14} />
            <span>Search...</span>
            <kbd className="text-[10px] px-1 py-0.5 rounded border ml-2" style={{ fontFamily: 'var(--font-mono)', borderColor: 'var(--border-light)' }}>
              ⌘K
            </kbd>
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Theme picker */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="p-2 rounded-md transition-colors flex items-center gap-1"
              style={{ color: 'var(--slate)' }}
              aria-label="Change theme"
            >
              {mode === 'light' ? <Sun size={18} /> : mode === 'dark' ? <Moon size={18} /> : <Monitor size={18} />}
            </button>
            {showThemeMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowThemeMenu(false)} />
                <div
                  className="absolute right-0 top-full mt-1 rounded-lg border shadow-lg z-50 py-1 min-w-[140px]"
                  style={{ backgroundColor: 'var(--cream, #fff)', borderColor: 'var(--border-light)' }}
                >
                  {([
                    { key: 'light' as const, icon: Sun, label: 'Light' },
                    { key: 'dark' as const, icon: Moon, label: 'Dark' },
                    { key: 'system' as const, icon: Monitor, label: 'System' },
                  ]).map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={() => { setTheme(key); setShowThemeMenu(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        color: mode === key ? 'var(--teal)' : 'var(--ink)',
                        fontWeight: mode === key ? 500 : 400,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon size={15} style={{ opacity: mode === key ? 1 : 0.5 }} />
                      {label}
                      {mode === key && <span className="ml-auto text-[10px]" style={{ color: 'var(--teal)' }}>&#10003;</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 md:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>
      </div>

      {/* Command Palette (global) */}
      <CommandPalette />

      {/* Shortcut Help */}
      <ShortcutHelp open={showHelp} onClose={() => setShowHelp(false)} />

      {/* Global Quick Add */}
      <GlobalQuickAddModal isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />

      {/* Floating quick-add button */}
      <button
        onClick={() => setQuickAddOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
        style={{
          background: 'var(--teal)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(45,138,138,0.35)',
        }}
        aria-label="Quick add task (Ctrl+N)"
        title="Quick add task (Ctrl+N)"
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>

      {/* G-key pending indicator */}
      {gPending && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full shadow-lg border" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--teal)' }}>
          <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>
            G → press a key to navigate...
          </span>
        </div>
      )}
    </div>
  )
}

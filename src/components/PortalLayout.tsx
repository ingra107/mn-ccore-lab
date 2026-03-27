import { useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, Sun, Moon, Search } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useDarkMode } from '../hooks/useDarkMode'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'
import ShortcutHelp from './ShortcutHelp'
import PageTransition from './PageTransition'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

export default function PortalLayout() {
  const { isDark, toggle: toggleDark } = useDarkMode()
  const { showHelp, setShowHelp, gPending } = useKeyboardShortcuts()
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
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
            <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
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
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors hover:bg-black/5"
            style={{ borderColor: 'var(--border-light)', color: 'var(--slate)', fontFamily: 'var(--font-sans)', cursor: 'pointer', background: 'none', opacity: 0.6 }}
          >
            <Search size={14} />
            <span>Search...</span>
            <kbd className="text-[10px] px-1 py-0.5 rounded border ml-2" style={{ fontFamily: 'var(--font-mono)', borderColor: 'var(--border-light)' }}>
              ⌘K
            </kbd>
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            className="p-2 rounded-md transition-colors"
            style={{ color: 'var(--slate)' }}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
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

      {/* G-key pending indicator */}
      {gPending && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full shadow-lg border" style={{ backgroundColor: 'white', borderColor: 'var(--teal)' }}>
          <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>
            G → press a key to navigate...
          </span>
        </div>
      )}
    </div>
  )
}

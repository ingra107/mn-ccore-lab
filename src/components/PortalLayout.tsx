import { useState, useCallback, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, X, Sun, Moon, Monitor, Search, Plus, AlignJustify, AlignLeft } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useDarkMode } from '../hooks/useDarkMode'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'
import ShortcutHelp from './ShortcutHelp'
import PageTransition from './PageTransition'
import GlobalQuickAddModal, { useQuickAddShortcut } from './GlobalQuickAdd'
import RouteProgressBar from './RouteProgressBar'
import ScrollToTop from './ScrollToTop'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useDensity } from '../hooks/useDensity'
import { useFavicon } from '../hooks/useFavicon'
import { useRealtimeSync } from '../hooks/useRealtimeSync'
import { UndoToastProvider } from './UndoToast'
import StatusBar from './StatusBar'

export default function PortalLayout() {
  const { mode, setTheme } = useDarkMode()
  const { density, toggle: toggleDensity } = useDensity()
  useFavicon()
  useRealtimeSync()
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const { showHelp, setShowHelp, gPending } = useKeyboardShortcuts()
  useQuickAddShortcut(useCallback(() => setQuickAddOpen(true), []))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('mn-ccore-sidebar-collapsed') === 'true'
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const [focusMode, setFocusMode] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Close mobile menu on Escape key
  useEffect(() => {
    if (!mobileOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mobileOpen])

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

  // Ctrl+. to cycle theme (light → dark → system)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault()
        setTheme(mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mode, setTheme])

  // Listen for F key to toggle focus mode
  useEffect(() => {
    const handler = () => setFocusMode((prev) => !prev)
    document.addEventListener('toggle-focus', handler)
    return () => document.removeEventListener('toggle-focus', handler)
  }, [])

  return (
    <UndoToastProvider>
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <RouteProgressBar />

      {/* Desktop sidebar (hidden in focus mode) */}
      {!focusMode && (
        <div className="hidden lg:block">
          <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        </div>
      )}

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
          focusMode ? '' : sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'
        }`}
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
      >
        {/* Top bar (hidden in focus mode) */}
        <header
          className={`sticky top-0 z-20 flex items-center px-4 border-b backdrop-blur-sm transition-all duration-200 ${focusMode ? 'h-0 overflow-hidden opacity-0 border-none' : 'h-14'}`}
          style={{
            backgroundColor: 'rgba(var(--bg-rgb, 255,255,255), 0.9)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Mobile hamburger */}
          <button
            className="lg:hidden flex items-center justify-center min-w-[44px] min-h-[44px] mr-2 rounded-md"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
            style={{ color: 'var(--ink)' }}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Search trigger */}
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="hidden sm:flex items-center gap-2 px-5 py-2 rounded-lg border text-sm transition-colors hover:bg-black/5"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--slate)', cursor: 'pointer', background: 'none', minWidth: '220px' }}
          >
            <Search size={14} />
            <span>Search...</span>
            <kbd className="text-[10px] px-1 py-0.5 rounded border ml-2" style={{ fontFamily: 'var(--font-mono)', borderColor: 'var(--border-subtle)' }}>
              ⌘K
            </kbd>
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Density toggle */}
          <button
            onClick={toggleDensity}
            className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md transition-colors"
            style={{ color: 'var(--slate)' }}
            aria-label={`Switch to ${density === 'comfortable' ? 'compact' : 'comfortable'} view`}
            title={`${density === 'comfortable' ? 'Compact' : 'Comfortable'} view`}
          >
            {density === 'comfortable' ? <AlignJustify size={18} /> : <AlignLeft size={18} />}
          </button>

          {/* Theme picker */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md transition-colors"
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
                  style={{ backgroundColor: 'var(--cream, #fff)', borderColor: 'var(--border-subtle)' }}
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
        <main className="portal-content p-4 md:p-6 lg:p-8" style={{ flex: 1 }}>
          <AnimatePresence mode="wait">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>

        {/* Status bar */}
        <StatusBar onOpenShortcuts={() => setShowHelp(true)} />
      </div>

      {/* Command Palette (global) */}
      <CommandPalette />

      {/* Shortcut Help */}
      <ShortcutHelp open={showHelp} onClose={() => setShowHelp(false)} />

      {/* Focus mode indicator */}
      {focusMode && (
        <button
          onClick={() => setFocusMode(false)}
          className="fixed top-3 right-3 z-50 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-opacity opacity-30 hover:opacity-100"
          style={{ color: 'var(--teal)', borderColor: 'var(--teal)', background: 'var(--cream)', cursor: 'pointer' }}
        >
          Focus · F to exit
        </button>
      )}

      {/* Global Quick Add */}
      <GlobalQuickAddModal isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />

      {/* Floating quick-add button */}
      <button
        data-testid="fab-quick-add"
        onClick={() => setQuickAddOpen(true)}
        className="fixed right-5 z-40 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
        style={{
          bottom: 'calc(24px + 12px)', // above status bar (24px) + 12px gap
          background: 'var(--teal)',
          color: 'var(--ink-bright, #fff)',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(45,138,138,0.25)',
          opacity: 0.85,
        }}
        aria-label="Quick add task (Ctrl+N)"
        title="Quick add task (Ctrl+N)"
      >
        <Plus size={20} strokeWidth={2.5} />
      </button>

      <ScrollToTop />

      {/* G-key pending indicator */}
      {gPending && (
        <div className="fixed left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full shadow-lg border" style={{ bottom: 'calc(24px + 12px)', backgroundColor: 'var(--cream)', borderColor: 'var(--teal)' }}>
          <span className="text-xs" style={{ color: 'var(--teal)' }}>
            G → press a key to navigate...
          </span>
        </div>
      )}
    </div>
    </UndoToastProvider>
  )
}

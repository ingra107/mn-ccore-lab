import { useState, useCallback, useEffect, useLayoutEffect, useRef, Suspense } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Menu, X, Sun, Moon, Monitor, Search, Plus } from 'lucide-react'
import { useDarkMode } from '../hooks/useDarkMode'
import { modKeyLabel, openCommandPalette } from '../lib/platform'
import Sidebar from './Sidebar'
import LogoMark from './LogoMark'
import CommandPalette from './CommandPalette'
import ShortcutHelp from './ShortcutHelp'
import RouteTransition from './RouteTransition'
import PageLoader from './PageLoader'
import GlobalQuickAddModal, { useQuickAddShortcut } from './GlobalQuickAddModal'
import QuickCaptureInbox from './QuickCaptureInbox'
import RouteProgressBar from './RouteProgressBar'
import ScrollToTop from './ScrollToTop'
import MobileTabBar from './MobileTabBar'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useFavicon } from '../hooks/useFavicon'
import { useRealtimeSync } from '../hooks/useRealtimeSync'
import { UndoToastProvider } from './UndoToast'
import StatusBar from './StatusBar'
import PulsePill from './whatsnew/PulsePill'
import { PATHS } from '../constants/paths'
import { PORTAL_PAGE_LABELS, portalTitle } from '../constants/pageLabels'
import { ICON_PROPS } from '../lib/iconProps'
import { Button } from './ui/Button'

export default function PortalLayout() {
  const { mode, setTheme, isDark } = useDarkMode()
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
  const themePickerRef = useRef<HTMLDivElement>(null)
  const navDialogRef = useRef<HTMLDivElement>(null)
  const hamburgerRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const [focusMode, setFocusMode] = useState(false)

  // D3(a): every named portal page gets "<nav label> · MN-CCORE" in the tab.
  // A LAYOUT effect on purpose: it runs before any page's passive useEffect
  // (usePageMeta), so a page that sets its own title (a count, a record
  // name) still wins, and a page that sets none no longer inherits the last
  // page's title or the public site's.
  useLayoutEffect(() => {
    const label = PORTAL_PAGE_LABELS[location.pathname]
    if (label) document.title = portalTitle(label)
  }, [location.pathname])

  // Close mobile menu on route change. Adjusted during render (React's
  // "adjusting state when a prop changes" pattern) rather than an effect.
  const [prevPathname, setPrevPathname] = useState(location.pathname)
  if (location.pathname !== prevPathname) {
    setPrevPathname(location.pathname)
    setMobileOpen(false)
  }

  // Theme menu: close on a tap or click anywhere outside the picker, or Escape.
  // A document listener, not a `fixed inset-0` click-away div: the header's
  // backdrop-blur makes it the containing block for fixed descendants, so that
  // div covered only the 56px header and a tap on the page left the menu open
  // (overnight 2026-10-14 audit, G1-2). A listener has no box to clip.
  useEffect(() => {
    if (!showThemeMenu) return
    const onDown = (e: PointerEvent) => {
      if (!themePickerRef.current?.contains(e.target as Node)) setShowThemeMenu(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowThemeMenu(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showThemeMenu])

  // Mobile navigation dialog: focus moves into it on open (it is aria-modal),
  // and back to the hamburger on close if focus was left inside it.
  useEffect(() => {
    if (!mobileOpen) return
    const dialog = navDialogRef.current
    dialog?.focus()
    const opener = hamburgerRef.current
    return () => {
      if (dialog && dialog.contains(document.activeElement)) opener?.focus()
    }
  }, [mobileOpen])

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
    <div className="min-h-screen portal-shell" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Skip to content — first focusable element, visible on focus only.
          Keyboard users can press Tab once from page-load to jump past the
          sidebar + header and land in the main region. */}
      <a
        href="#portal-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded"
        style={{ background: 'var(--job-accent-solid)', color: 'var(--ink-bright, #fff)' }}
      >
        Skip to content
      </a>
      <RouteProgressBar />

      {/* Desktop sidebar (hidden in focus mode) */}
      {!focusMode && (
        <div className="hidden lg:block">
          <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        </div>
      )}

      {/* Mobile sidebar overlay. Modal layers (--z-modal-backdrop / --z-modal),
          above the MobileTabBar (--z-sidebar): at z-30/z-40 the tab bar stayed
          undimmed and tappable over the backdrop and cut off the sidebar's
          account row (overnight 2026-10-14 audit, G1-10). */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 lg:hidden"
            style={{ zIndex: 'var(--z-modal-backdrop)' }}
            onClick={() => setMobileOpen(false)}
          />
          <div
            ref={navDialogRef}
            tabIndex={-1}
            className="lg:hidden fixed top-0 left-0 outline-none"
            style={{ zIndex: 'var(--z-modal)' }}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Main content area */}
      <div
        className={`transition-all duration-200 ${
          focusMode ? '' : sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'
        }`}
        // --portal-header-h: the sticky top bar's height (h-14 = 56px, 0 in focus
        // mode), so a sticky header inside the page sits just under it.
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', '--portal-header-h': focusMode ? '0px' : '56px' } as React.CSSProperties}
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
          <Button size="icon"
            ref={hamburgerRef}
            className="lg:hidden flex items-center justify-center min-w-[44px] min-h-[44px] mr-2 rounded-md"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen}
            style={{ color: 'var(--ink)' }}
          >
            {mobileOpen ? <X {...ICON_PROPS} size={20} /> : <Menu {...ICON_PROPS} size={20} />}
          </Button>

          {/* Mobile brand mark — only below lg, kept tight (28px) so the
              top bar stays usable. Tapping returns to /dashboard. */}
          <Link
            to={PATHS.dashboard}
            aria-label="MN-CCORE Lab Hub — Dashboard"
            className="lg:hidden flex items-center mr-1"
            style={{ color: 'inherit' }}
          >
            <LogoMark
              dark={isDark}
              alt=""
              width={28}
              height={28}
              style={{ display: 'block' }}
            />
          </Link>

          {/* Search trigger — the ONLY way into the command palette on a device
              with no keyboard, so it must render below lg. At lg+ the sidebar
              Search entry opens the palette, so this would be a second copy. It used to be
              `hidden sm:flex`, which made the palette unreachable on a phone:
              no Cmd+K, no trigger, and every palette-only action (Bug Squasher,
              Backlog Wave, quick filters) went with it. Below `sm` it collapses
              to the icon alone; the label, the fixed width and the ⌘K hint are
              desktop affordances and stay behind the breakpoint. */}
          <button
            onClick={openCommandPalette}
            aria-label="Open command palette"
            className="lg:hidden flex items-center gap-2 px-3 sm:px-5 py-2 sm:min-w-[220px] rounded-lg text-sm transition-colors hover:bg-black/5"
            style={{ boxShadow: 'inset 0 0 0 1px var(--field-edge)', color: 'var(--slate)', cursor: 'pointer', background: 'none' }}
          >
            <Search {...ICON_PROPS} size={14} />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden sm:inline text-[10px] px-1 py-0.5 rounded ml-2" style={{ fontFamily: 'var(--font-mono)', background: 'var(--sk-line)' }}>
              {modKeyLabel()}+K
            </kbd>
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* What's new / Lab pulse pill (#156): approved release notes,
              Nick's announcements and the lab's day, on every portal page.
              Read state is per person on the server (user_prefs). */}
          <div className="hidden sm:flex items-center mr-2">
            <PulsePill />
          </div>

          {/* P3-7: per-surface density toggle removed — one global density lives
              in Settings → Appearance (key: hub-table-density, compact default). */}

          {/* Theme picker */}
          <div className="relative" ref={themePickerRef}>
            <Button size="icon"
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md transition-colors"
              style={{ color: 'var(--slate)' }}
              aria-label="Change theme"
            >
              {mode === 'light' ? <Sun {...ICON_PROPS} size={18} /> : mode === 'dark' ? <Moon {...ICON_PROPS} size={18} /> : <Monitor {...ICON_PROPS} size={18} />}
            </Button>
            {showThemeMenu && (
              <>
                <div
                  className="absolute right-0 top-full mt-1 rounded-lg z-50 py-1 min-w-[140px]"
                  style={{ backgroundColor: 'var(--cream, #fff)', boxShadow: 'var(--shadow-menu)' }}
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
                        color: mode === key ? 'var(--job-accent)' : 'var(--ink)',
                        fontWeight: mode === key ? 500 : 400,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon {...ICON_PROPS} size={15} style={{ opacity: mode === key ? 1 : 0.85 }} />
                      {label}
                      {mode === key && <span className="ml-auto text-[10px]" style={{ color: 'var(--job-accent)' }}>&#10003;</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        {/* Mobile + iPad portrait: leave room for MobileTabBar (56px) +
            safe-area + breathing room. The tab bar lives through <1024 (UX-9),
            so the bottom clearance must persist to lg too — switching it off at
            md (768) re-introduced the covered-last-row bug at 768–1023.
            Audit caught content covered on calendar + project detail with the
            prior 1rem buffer; 3rem so the last row comfortably clears the bar. */}
        <main
          id="portal-main"
          className="portal-content p-4 md:p-6 lg:p-8 pb-[calc(var(--fab-stack-2)+56px)] lg:pb-8"
          style={{ flex: 1 }}
        >
          {/* The shell stays up while a page chunk loads: without this boundary a
              lazy page suspended to the app-level one and the WHOLE shell
              (sidebar, header, tab bar) was replaced by the loader. */}
          <Suspense fallback={<PageLoader />}>
            <RouteTransition />
          </Suspense>
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
        // .tk-btn sets position:relative, which beats Tailwind's .fixed on the
        // same element; the wrapper carries the viewport pin.
        <div
          data-testid="focus-exit-pill"
          className="fixed top-3 right-3 z-50 transition-opacity opacity-30 hover:opacity-100"
        >
          <button
            onClick={() => setFocusMode(false)}
            className="tk-btn tk-sel"
            style={{ cursor: 'pointer' }}
          >
            Focus · F to exit
          </button>
        </div>
      )}

      {/* Global Quick Add */}
      <GlobalQuickAddModal isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />

      {/* Universal Quick Capture → Peripheral Brain inbox (Ctrl+I) */}
      <QuickCaptureInbox />

      {/* Floating quick-add button: desktop only. Below lg it sat on the right-edge
          action slot of the card behind it; the More drawer has a Capture entry. */}
      <Button size="icon"
        data-testid="fab-quick-add"
        onClick={() => setQuickAddOpen(true)}
        className="fixed right-5 z-40 w-10 h-10 rounded-full hidden lg:flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
        style={{
          bottom: 'var(--fab-stack-1)',
          background: 'var(--job-accent-solid)',
          color: 'var(--ink-bright, #fff)',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 2px 8px color-mix(in srgb, var(--job-accent) 25%, transparent)',
          opacity: 0.85,
        }}
        aria-label="Quick add task (press q)"
        title="Quick add task (press q)"
      >
        <Plus size={20} strokeWidth={2.5} />
      </Button>

      <ScrollToTop />

      {/* Mobile bottom tab bar (md:hidden internally) */}
      {!focusMode && <MobileTabBar />}

      {/* Chord leader indicator — shows when G is armed */}
      {gPending && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Chord leader armed — press a navigation key"
          style={{
            position: 'fixed',
            bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
            right: '24px',
            zIndex: 'var(--z-toast)',
            padding: '6px 12px',
            backgroundColor: 'var(--sk-card)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-small)',
            fontWeight: 'var(--weight-ui)',
            color: 'var(--ink-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: 'var(--shadow-menu)',
            animation: 'chord-pulse 1s ease-in-out infinite',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          <kbd style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1px 5px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--sk-line)',
            fontSize: 'var(--text-label)',
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.4,
            color: 'var(--ink-primary)',
            fontWeight: 'var(--weight-ui)',
          }}>g</kbd>
          <span style={{ color: 'var(--ink-label)' }}>…</span>
          <span
            aria-hidden="true"
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--job-accent-solid)',
              animation: 'chord-dot-pulse 1s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
        </div>
      )}
    </div>
    </UndoToastProvider>
  )
}

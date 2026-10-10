import { useState, useEffect, Suspense } from 'react'
import { lazyRoute } from '../lib/lazyRoute'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ListChecks,
  FolderKanban,
  Search,
  MoreHorizontal,
  X,
  Calendar,
  Clock,
  FileText,
  Users,
  Activity,
  BarChart3,
  HelpCircle,
  Award,
  BookOpen,
  Library,
  Target,
  Settings,
  Bug,
  LayoutGrid,
  User,
  TrendingUp,
  History,
  Zap,
  Video,
  ExternalLink,
  Plus,
  Inbox,
} from 'lucide-react'
import { PATHS } from '../constants/paths'
import { PORTAL_PAGE_LABELS } from '../constants/pageLabels'
import { ICON_PROPS } from '../lib/iconProps'
import { useAuth } from '../hooks/useAuth'
import { QUICK_ADD_EVENT, openGlobalQuickAdd } from './GlobalQuickAddModal'

const BugReportModal = lazyRoute(() => import('./BugReportModal'))


/**
 * Mobile bottom tab bar — Today, Tasks, Projects, Search + a "More" drawer
 * whose groups mirror the desktop sidebar (nav redesign, 2026-10-09). Hidden on desktop via
 * `lg:hidden` — it stays visible through iPad portrait (768–1023), the band
 * where the desktop sidebar is absent (UX-9, 2026-06-09). Respects
 * safe-area-inset-bottom.
 */
export default function MobileTabBar() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const isPi = user?.isPi ?? false
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)

  // Close drawer when route changes (covers programmatic nav after Link click).
  // Adjusted during render (React's "adjusting state when a prop changes"
  // pattern) rather than an effect.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOverflowOpen(false)
  }

  // Escape key closes drawer
  useEffect(() => {
    if (!overflowOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverflowOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [overflowOpen])

  const primaryTabs = [
    { to: PATHS.dashboard, icon: LayoutDashboard, label: 'Today' },
    { to: PATHS.myTasks, icon: ListChecks, label: 'Tasks' },
    { to: PATHS.projects, icon: FolderKanban, label: 'Projects' },
    { to: PATHS.search, icon: Search, label: 'Search' },
  ]

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 flex items-stretch justify-around border-t"
        style={{
          zIndex: 'var(--z-sidebar)',
          backgroundColor: 'var(--cream)',
          borderColor: 'var(--border-subtle)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        aria-label="Primary navigation"
      >
        {primaryTabs.map((tab) => {
          const Icon = tab.icon
          // Reactive: pathname from useLocation() updates on every client-side nav (C7 audit)
          const active = pathname === tab.to || pathname.startsWith(tab.to + '/')
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className="flex flex-col items-center justify-center flex-1"
              style={{
                minHeight: 56,
                paddingTop: 'var(--sp-sm)',
                paddingBottom: 'var(--sp-sm)',
                color: active ? 'var(--teal)' : 'var(--ink-muted)',
                textDecoration: 'none',
                fontWeight: active ? 500 : 400,
              }}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.label}
            >
              <Icon size={20} {...ICON_PROPS} aria-hidden="true" />
              <span style={{ fontSize: 'var(--text-micro)', marginTop: 2 }}>{tab.label}</span>
            </Link>
          )
        })}

        {/* "More" — every other page, grouped like the sidebar */}
        <button
          type="button"
          onClick={() => setOverflowOpen(true)}
          className="flex flex-col items-center justify-center flex-1"
          style={{
            minHeight: 56,
            paddingTop: 'var(--sp-sm)',
            paddingBottom: 'var(--sp-sm)',
            color: overflowOpen ? 'var(--teal)' : 'var(--ink-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontWeight: overflowOpen ? 500 : 400,
          }}
          aria-label="More navigation"
          aria-expanded={overflowOpen}
          aria-controls="mobile-overflow-drawer"
        >
          <MoreHorizontal size={20} {...ICON_PROPS} aria-hidden="true" />
          <span style={{ fontSize: 'var(--text-micro)', marginTop: 2 }}>More</span>
        </button>
      </nav>

      {/* Bottom-sheet overflow drawer */}
      {overflowOpen && (
        <div
          className="lg:hidden fixed inset-0"
          role="dialog"
          aria-modal="true"
          aria-label="All sections"
          id="mobile-overflow-drawer"
          onClick={() => setOverflowOpen(false)}
          style={{
            background: 'rgba(0,0,0,0.5)',
            zIndex: 'var(--z-modal)',
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--cream)',
              width: '100%',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
              maxHeight: '75vh',
              overflowY: 'auto',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
              borderTop: '1px solid var(--border-default)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div
                style={{
                  fontSize: 'var(--text-label)',
                  opacity: 0.85,
                  fontWeight: 500,
                }}
              >
                All pages
              </div>
              <button
                type="button"
                onClick={() => setOverflowOpen(false)}
                aria-label="Close menu"
                className="flex items-center justify-center"
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ink-muted)',
                }}
              >
                <X size={20} {...ICON_PROPS} />
              </button>
            </div>

            {/* Capture — the two floating buttons (quick add, inbox) are hidden
                below lg: they sat on the right-edge Work-on / folder slot of
                whichever card row was behind them. They open the same sheets
                through the same events the FABs and shortcuts use. */}
            <div style={{ marginBottom: 12 }}>
              <div
                style={{ fontSize: '10px', opacity: 0.85, marginBottom: 6, paddingLeft: 12, fontWeight: 500 }}
              >
                Capture
              </div>
              {[
                { label: 'Quick add task', icon: Plus, event: QUICK_ADD_EVENT },
                { label: 'Quick capture to inbox', icon: Inbox, event: 'mn-ccore:open-inbox' },
              ].map(({ label, icon: Icon, event }) => (
                <button
                  key={event}
                  type="button"
                  data-testid={event === 'mn-ccore:open-inbox' ? 'more-quick-capture-inbox' : 'more-quick-add'}
                  onClick={() => { setOverflowOpen(false); if (event === QUICK_ADD_EVENT) openGlobalQuickAdd(); else window.dispatchEvent(new CustomEvent(event)) }}
                  className="flex items-center gap-3 rounded-md"
                  style={{
                    padding: '10px 12px',
                    minHeight: 44,
                    width: '100%',
                    color: 'var(--ink)',
                    fontSize: 'var(--text-base)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Icon size={18} {...ICON_PROPS} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {OVERFLOW_SECTIONS.filter((section) => !section.piOnly || isPi).map((section) => (
              <div key={section.title} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: '10px',
                    opacity: 0.85,
                    marginBottom: 6,
                    paddingLeft: 12,
                    fontWeight: 500,
                  }}
                >
                  {section.title}
                </div>
                {section.routes.map((route) => {
                  const Icon = route.icon
                  const active = pathname === route.to
                  return (
                    <Link
                      key={route.to}
                      to={route.to}
                      className="flex items-center gap-3 rounded-md"
                      style={{
                        padding: '10px 12px',
                        minHeight: 44,
                        color: active ? 'var(--teal)' : 'var(--ink)',
                        textDecoration: 'none',
                        fontSize: 'var(--text-base)',
                        background: active ? 'var(--teal-active)' : 'transparent',
                      }}
                    >
                      <Icon size={18} {...ICON_PROPS} aria-hidden="true" />
                      <span>{route.label}</span>
                    </Link>
                  )
                })}
              </div>
            ))}

            {/* Support — mobile users can't reach the sidebar's Report-a-Bug
                button, so expose it here. Surfaced via deep-audit persona test. */}
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: '10px',
                  opacity: 0.85,
                  marginBottom: 6,
                  paddingLeft: 12,
                  fontWeight: 500,
                }}
              >
                Support
              </div>
              <button
                type="button"
                onClick={() => { setOverflowOpen(false); setBugReportOpen(true) }}
                className="flex items-center gap-3 rounded-md"
                style={{
                  padding: '10px 12px',
                  minHeight: 44,
                  width: '100%',
                  color: 'var(--ink)',
                  textDecoration: 'none',
                  fontSize: 'var(--text-base)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Bug size={18} {...ICON_PROPS} aria-hidden="true" />
                <span>Report a bug</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {bugReportOpen && (
        <Suspense fallback={null}>
          <BugReportModal open={bugReportOpen} onClose={() => setBugReportOpen(false)} />
        </Suspense>
      )}
    </>
  )
}

// Overflow routes, grouped like the desktop sidebar (2026-10-09): the main
// items not in the tab bar, Lab Overview for a PI, the avatar menu, PI tools,
// then the pages reached only from the command palette on desktop (kept here
// because a phone has no Ctrl+K). Labels come from the one page-name map.
type OverflowRoute = { to: string; icon: typeof LayoutDashboard; label: string }
const OVERFLOW_SECTIONS: { title: string; piOnly?: boolean; routes: OverflowRoute[] }[] = [
  {
    title: 'Hub',
    routes: [
      { to: PATHS.calendar, icon: Calendar, label: PORTAL_PAGE_LABELS[PATHS.calendar] },
      { to: PATHS.deadlines, icon: Clock, label: PORTAL_PAGE_LABELS[PATHS.deadlines] },
      { to: PATHS.meetings, icon: Video, label: PORTAL_PAGE_LABELS[PATHS.meetings] },
      { to: PATHS.manuscripts, icon: FileText, label: PORTAL_PAGE_LABELS[PATHS.manuscripts] },
      { to: PATHS.grants, icon: Award, label: PORTAL_PAGE_LABELS[PATHS.grants] },
      { to: PATHS.library, icon: Library, label: PORTAL_PAGE_LABELS[PATHS.library] },
      { to: PATHS.team, icon: Users, label: PORTAL_PAGE_LABELS[PATHS.team] },
    ],
  },
  {
    title: 'PI',
    piOnly: true,
    routes: [
      { to: PATHS.overview, icon: LayoutGrid, label: PORTAL_PAGE_LABELS[PATHS.overview] },
    ],
  },
  {
    title: 'You',
    routes: [
      { to: PATHS.profile, icon: User, label: PORTAL_PAGE_LABELS[PATHS.profile] },
      { to: PATHS.myItems, icon: Target, label: 'My Items' },
      { to: PATHS.settings, icon: Settings, label: PORTAL_PAGE_LABELS[PATHS.settings] },
      { to: PATHS.activity, icon: Activity, label: PORTAL_PAGE_LABELS[PATHS.activity] },
      { to: PATHS.analytics, icon: BarChart3, label: PORTAL_PAGE_LABELS[PATHS.analytics] },
      { to: PATHS.insights, icon: TrendingUp, label: PORTAL_PAGE_LABELS[PATHS.insights] },
    ],
  },
  {
    title: 'PI tools',
    piOnly: true,
    routes: [
      { to: PATHS.sessions, icon: History, label: PORTAL_PAGE_LABELS[PATHS.sessions] },
      { to: PATHS.launches, icon: Zap, label: PORTAL_PAGE_LABELS[PATHS.launches] },
    ],
  },
  {
    title: 'More',
    routes: [
      { to: PATHS.ask, icon: HelpCircle, label: PORTAL_PAGE_LABELS[PATHS.ask] },
      { to: PATHS.narratives, icon: BookOpen, label: PORTAL_PAGE_LABELS[PATHS.narratives] },
      { to: PATHS.decisions, icon: HelpCircle, label: PORTAL_PAGE_LABELS[PATHS.decisions] },
      { to: '/', icon: ExternalLink, label: 'Back to website' },
    ],
  },
]

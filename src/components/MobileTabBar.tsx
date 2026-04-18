import { useState, useEffect, lazy, Suspense } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Home,
  ListChecks,
  FolderKanban,
  Search,
  MoreHorizontal,
  X,
  Calendar,
  Clock,
  FileText,
  Lightbulb,
  CheckSquare,
  Users,
  Activity,
  BarChart3,
  HelpCircle,
  Award,
  BookOpen,
  Newspaper,
  Target,
  Settings,
  Bug,
} from 'lucide-react'

const BugReportModal = lazy(() => import('./BugReportModal'))

/**
 * Mobile bottom tab bar — 4 primary routes + "More" overflow drawer
 * that exposes the remaining ~14 portal routes. Hidden on tablet/desktop
 * via `md:hidden`. Respects safe-area-inset-bottom.
 */
export default function MobileTabBar() {
  const { pathname } = useLocation()
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)

  // Close drawer when route changes (covers programmatic nav after Link click)
  useEffect(() => {
    setOverflowOpen(false)
  }, [pathname])

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
    { to: '/dashboard', icon: Home, label: 'Home' },
    { to: '/my-tasks', icon: ListChecks, label: 'Tasks' },
    { to: '/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/search', icon: Search, label: 'Search' },
  ]

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex items-stretch justify-around border-t"
        style={{
          zIndex: 'var(--z-sidebar)',
          backgroundColor: 'var(--surface-1)',
          borderColor: 'var(--border-subtle)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          backdropFilter: 'blur(8px)',
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
              <Icon size={20} aria-hidden="true" />
              <span style={{ fontSize: 'var(--text-micro)', marginTop: 2 }}>{tab.label}</span>
            </Link>
          )
        })}

        {/* "More" overflow button — exposes remaining 14 portal routes */}
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
          <MoreHorizontal size={20} aria-hidden="true" />
          <span style={{ fontSize: 'var(--text-micro)', marginTop: 2 }}>More</span>
        </button>
      </nav>

      {/* Bottom-sheet overflow drawer */}
      {overflowOpen && (
        <div
          className="md:hidden fixed inset-0"
          role="dialog"
          aria-modal="true"
          aria-label="All sections"
          id="mobile-overflow-drawer"
          onClick={() => setOverflowOpen(false)}
          style={{
            background: 'rgba(0,0,0,0.5)',
            zIndex: 'var(--z-modal, 1000)',
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface-1)',
              width: '100%',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
              maxHeight: '75vh',
              overflowY: 'auto',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div
                style={{
                  fontSize: 'var(--text-label)',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.06em',
                  opacity: 0.85,
                  fontWeight: 500,
                }}
              >
                All Sections
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
                <X size={20} />
              </button>
            </div>

            {OVERFLOW_SECTIONS.map((section) => (
              <div key={section.title} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: '10px',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.06em',
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
                      <Icon size={18} aria-hidden="true" />
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
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.06em',
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
                <Bug size={18} aria-hidden="true" />
                <span>Report a Bug</span>
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

// Overflow routes — the ~16 portal routes not in the primary 4 tabs.
// Grouped by functional section; sorted within each section by usage frequency.
const OVERFLOW_SECTIONS: {
  title: string
  routes: { to: string; icon: typeof Home; label: string }[]
}[] = [
  {
    title: 'Work',
    routes: [
      { to: '/personal', icon: CheckSquare, label: 'Personal' },
      { to: '/calendar', icon: Calendar, label: 'Calendar' },
      { to: '/deadlines', icon: Clock, label: 'Deadlines' },
      { to: '/my-items', icon: Target, label: 'My Items' },
    ],
  },
  {
    title: 'Research',
    routes: [
      { to: '/manuscripts', icon: FileText, label: 'Manuscripts' },
      { to: '/ideas', icon: Lightbulb, label: 'Ideas' },
      { to: '/decisions', icon: HelpCircle, label: 'Decisions' },
      { to: '/grants', icon: Award, label: 'Grants' },
      { to: '/meetings', icon: Users, label: 'Meetings' },
      { to: '/meeting-notes', icon: BookOpen, label: 'Meeting Notes' },
      { to: '/digest', icon: Newspaper, label: 'Research Digest' },
      { to: '/ask', icon: HelpCircle, label: 'Ask the Lab' },
      { to: '/narratives', icon: BookOpen, label: 'Narratives' },
    ],
  },
  {
    title: 'Lab',
    routes: [
      { to: '/activity', icon: Activity, label: 'Activity' },
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/pi-analytics', icon: BarChart3, label: 'PI Analytics' },
      { to: '/mentee-milestones', icon: Target, label: 'Mentee Milestones' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

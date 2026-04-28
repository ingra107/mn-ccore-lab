import { lazy, Suspense, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import Layout from './components/Layout'
import PortalLayout from './components/PortalLayout'
import ViewTransitionWrapper from './components/ViewTransitionWrapper'
import PageErrorBoundary from './components/PageErrorBoundary'
import RequireAuth from './components/RequireAuth'
const Home = lazy(() => import('./pages/Home'))
import { AuthProvider } from './context/AuthContext'
import { PATHS } from './constants/paths'

// Error boundary to prevent one page crash from taking down the app
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null; showDetail: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, showDetail: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'Unknown error'
      return (
        <div style={{ padding: '3rem 2rem', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-circle)', backgroundColor: 'var(--maroon-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--maroon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.25rem', color: 'var(--ink)', margin: '0 0 var(--sp-sm)' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--slate)', maxWidth: 420, margin: '0 0 20px', lineHeight: 1.5 }}>
            This page hit an error, but everything else still works. Try refreshing, or navigate to another page.
          </p>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-lg)' }}>
            <button
              onClick={() => { this.setState({ hasError: false, error: null, showDetail: false }); window.location.reload() }}
              style={{ fontSize: '13px', padding: '8px 20px', borderRadius: 'var(--radius-lg)', border: 'none', backgroundColor: 'var(--teal-solid)', color: 'var(--ink-bright, #fff)', cursor: 'pointer' }}
            >
              Try again
            </button>
            <button
              onClick={() => { window.location.href = PATHS.dashboard }}
              style={{ fontSize: '13px', padding: '8px 20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--slate)', cursor: 'pointer' }}
            >
              Go to Today
            </button>
          </div>
          <button
            onClick={() => this.setState({ showDetail: !this.state.showDetail })}
            style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {this.state.showDetail ? 'Hide details' : 'Show error details'}
          </button>
          {this.state.showDetail && (
            <pre style={{ marginTop: 'var(--sp-md)', padding: 'var(--sp-md) var(--sp-lg)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--hover-subtle)', fontSize: '11px', color: 'var(--slate)', textAlign: 'left', maxWidth: 500, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {errorMsg}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onSettled: () => {
        // Notify other tabs on the same device after any mutation
        try {
          const bc = new BroadcastChannel('mnccore-sync')
          bc.postMessage('changed')
          bc.close()
        } catch { /* BroadcastChannel not supported */ }
      },
    },
  },
})

// Public pages — lazy-loaded
const Team = lazy(() => import('./pages/Team'))
const NickLab = lazy(() => import('./pages/NickLab'))
const NateLab = lazy(() => import('./pages/NateLab'))
const MemberPage = lazy(() => import('./pages/MemberPage'))
const Publications = lazy(() => import('./pages/Publications'))
const PublicationDetail = lazy(() => import('./pages/PublicationDetail'))
const Contact = lazy(() => import('./pages/Contact'))
const Network = lazy(() => import('./pages/Network'))

// Portal pages — lazy-loaded (existing)
const Dashboard = lazy(() => import('./pages/Dashboard'))
const TodayPage = lazy(() => import('./pages/portal/TodayPage'))
const Projects = lazy(() => import('./pages/Projects'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const Meetings = lazy(() => import('./pages/Meetings'))
const MeetingDetail = lazy(() => import('./pages/MeetingDetail'))
const MeetingPrep = lazy(() => import('./pages/MeetingPrep'))
const Digest = lazy(() => import('./pages/Digest'))

const TrajectoryPage = lazy(() => import('./pages/TrajectoryPage'))
const MyItems = lazy(() => import('./pages/MyItems'))

// New portal pages (Phase H1 — placeholders, built out in later phases)
const Personal = lazy(() => import('./pages/portal/Personal'))
const MyTasksLegacy = lazy(() => import('./pages/portal/MyTasks'))
const UnifiedMyTasks = lazy(() => import('./pages/portal/UnifiedMyTasks'))
const CalendarPage = lazy(() => import('./pages/portal/CalendarPage'))
const Deadlines = lazy(() => import('./pages/portal/Deadlines'))
const Manuscripts = lazy(() => import('./pages/portal/Manuscripts'))
const Ideas = lazy(() => import('./pages/portal/Ideas'))
const SearchPage = lazy(() => import('./pages/portal/SearchPage'))
const ActivityPage = lazy(() => import('./pages/portal/ActivityPage'))
const AnalyticsPage = lazy(() => import('./pages/portal/AnalyticsPage'))
const InsightsPage = lazy(() => import('./pages/portal/InsightsPage'))
const SettingsPage = lazy(() => import('./pages/portal/SettingsPage'))
const ProfilePage = lazy(() => import('./pages/portal/ProfilePage'))
const MeetingNotesPage = lazy(() => import('./pages/portal/MeetingNotesPage'))
const DecisionsPage = lazy(() => import('./pages/portal/DecisionsPage'))
const NarrativesPage = lazy(() => import('./pages/portal/NarrativesPage'))
const AskTheLab = lazy(() => import('./pages/portal/AskTheLab'))
const PIAnalytics = lazy(() => import('./pages/portal/PIAnalytics'))
const PBSector = lazy(() => import('./pages/portal/PBSector'))
const SessionHistory = lazy(() => import('./pages/portal/SessionHistory'))
const MenteeMilestones = lazy(() => import('./pages/portal/MenteeMilestones'))
const DeadlineCascadePage = lazy(() => import('./pages/portal/DeadlineCascadePage'))
const Pulse = lazy(() => import('./pages/Pulse'))
const GrantsPortal = lazy(() => import('./pages/portal/Grants'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }}
        />
        <span className="text-sm" style={{ color: 'var(--slate)' }}>
          Loading...
        </span>
      </div>
    </div>
  )
}

/**
 * Navigate helper that expands `:slug`-style path params into the target URL.
 * React Router's plain <Navigate to="/x/:slug"> does NOT substitute params.
 * Used by the legacy-path redirect shims so that e.g. /projects/foo bounces
 * correctly to /portal/projects/foo instead of /portal/projects/:slug.
 */
function NavigateWithParams({ to }: { to: string }) {
  const params = useParams()
  let resolved = to
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) resolved = resolved.replace(`:${key}`, value)
  }
  return <Navigate to={resolved} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthProvider>
          <ViewTransitionWrapper>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Standalone pages (no layout wrapper) */}
                <Route path="/pulse" element={<ErrorBoundary><Pulse /></ErrorBoundary>} />

                {/* Public pages: top nav layout */}
                <Route element={<Layout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/team" element={<ErrorBoundary><Team /></ErrorBoundary>} />
                  <Route path="/nick" element={<ErrorBoundary><NickLab /></ErrorBoundary>} />
                  <Route path="/nate" element={<ErrorBoundary><NateLab /></ErrorBoundary>} />
                  <Route path="/team/:slug" element={<ErrorBoundary><MemberPage /></ErrorBoundary>} />
                  {/* CV page removed — not needed */}
                  <Route path="/team/:slug/trajectory" element={<ErrorBoundary><TrajectoryPage /></ErrorBoundary>} />
                  <Route path="/publications" element={<ErrorBoundary><Publications /></ErrorBoundary>} />
                  <Route path="/publications/:id" element={<ErrorBoundary><PublicationDetail /></ErrorBoundary>} />
                  <Route path="/network" element={<ErrorBoundary><Network /></ErrorBoundary>} />
                  <Route path="/contact" element={<ErrorBoundary><Contact /></ErrorBoundary>} />
                </Route>

                {/* Legacy root-path redirects (2026-04-21 migration).
                    Anyone hitting an old URL bounces to the /portal/*
                    equivalent. Placed OUTSIDE RequireAuth so the bounce
                    happens before any auth gate — the portal URL handles
                    auth. Kept indefinitely; cost is negligible. */}
                <Route path="/dashboard" element={<Navigate to="/portal/dashboard" replace />} />
                <Route path="/personal" element={<Navigate to="/portal/personal" replace />} />
                <Route path="/my-items" element={<Navigate to="/portal/my-items" replace />} />
                <Route path="/my-tasks" element={<Navigate to="/portal/my-tasks" replace />} />
                <Route path="/tasks" element={<Navigate to="/portal/my-tasks" replace />} />
                <Route path="/calendar" element={<Navigate to="/portal/calendar" replace />} />
                <Route path="/deadlines" element={<Navigate to="/portal/deadlines" replace />} />
                <Route path="/deadline-cascade" element={<Navigate to="/portal/deadline-cascade" replace />} />
                <Route path="/projects" element={<Navigate to="/portal/projects" replace />} />
                <Route path="/projects/:slug" element={<NavigateWithParams to="/portal/projects/:slug" />} />
                <Route path="/manuscripts" element={<Navigate to="/portal/manuscripts" replace />} />
                <Route path="/ideas" element={<Navigate to="/portal/ideas" replace />} />
                <Route path="/ask" element={<Navigate to="/portal/ask" replace />} />
                <Route path="/decisions" element={<Navigate to="/portal/decisions" replace />} />
                <Route path="/narratives" element={<Navigate to="/portal/narratives" replace />} />
                <Route path="/digest" element={<Navigate to="/portal/digest" replace />} />
                <Route path="/research-digest" element={<Navigate to="/portal/digest" replace />} />
                <Route path="/search" element={<Navigate to="/portal/search" replace />} />
                <Route path="/grants" element={<Navigate to="/portal/grants" replace />} />
                <Route path="/meetings" element={<Navigate to="/portal/meetings" replace />} />
                <Route path="/meetings/:id" element={<NavigateWithParams to="/portal/meetings/:id" />} />
                <Route path="/meetings/:id/prep" element={<NavigateWithParams to="/portal/meetings/:id/prep" />} />
                <Route path="/meeting-prep" element={<Navigate to="/portal/meetings" replace />} />
                <Route path="/meeting-notes" element={<Navigate to="/portal/meeting-notes" replace />} />
                <Route path="/activity" element={<Navigate to="/portal/activity" replace />} />
                <Route path="/analytics" element={<Navigate to="/portal/analytics" replace />} />
                <Route path="/pi/analytics" element={<Navigate to="/portal/pi/analytics" replace />} />
                <Route path="/pi-analytics" element={<Navigate to="/portal/pi/analytics" replace />} />
                <Route path="/mentee-milestones" element={<Navigate to="/portal/mentee-milestones" replace />} />
                <Route path="/pb" element={<Navigate to="/portal/pb" replace />} />
                <Route path="/sessions" element={<Navigate to="/portal/sessions" replace />} />
                <Route path="/settings" element={<Navigate to="/portal/settings" replace />} />

                {/* Portal pages: sidebar layout — wrapped in RequireAuth so
                    flipping VITE_REQUIRE_AUTH=1 or appending ?strict=1 to
                    the URL instantly gates portal access (2026-04-18). */}
                <Route element={<RequireAuth><PortalLayout /></RequireAuth>}>
                  {/* Portal-prefixed canonical routes (2026-04-21 migration). */}
                  {/* Today B2 — operating-day landing (CLAUDE.md Rule 52).
                      The old card-grid Dashboard moved to /portal/overview
                      below, kept indefinitely as Lab Overview. */}
                  <Route path="/portal/dashboard" element={<ErrorBoundary><PageErrorBoundary pageName="Today"><TodayPage /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/overview" element={<ErrorBoundary><PageErrorBoundary pageName="LabOverview"><Dashboard /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/personal" element={<ErrorBoundary><Personal /></ErrorBoundary>} />
                  <Route path="/portal/my-items" element={<ErrorBoundary><MyItems /></ErrorBoundary>} />
                  {/* MyTasks Round 2 — unified 3-view page (Columns / Lanes / List).
                      View choice persists in localStorage.mt_view (Rule 55). */}
                  <Route path="/portal/my-tasks" element={<ErrorBoundary><PageErrorBoundary pageName="MyTasks"><UnifiedMyTasks /></PageErrorBoundary></ErrorBoundary>} />
                  {/* Legacy MyTasks (pre-Round 2). Kept for one sprint as a
                      safety net; remove once Round 2 has soaked. */}
                  <Route path="/portal/my-tasks-legacy" element={<ErrorBoundary><MyTasksLegacy /></ErrorBoundary>} />
                  <Route path="/portal/tasks" element={<Navigate to="/portal/my-tasks" replace />} />
                  <Route path="/portal/calendar" element={<ErrorBoundary><CalendarPage /></ErrorBoundary>} />
                  <Route path="/portal/deadlines" element={<ErrorBoundary><Deadlines /></ErrorBoundary>} />
                  <Route path="/portal/deadline-cascade" element={<ErrorBoundary><DeadlineCascadePage /></ErrorBoundary>} />
                  <Route path="/portal/projects" element={<ErrorBoundary><Projects /></ErrorBoundary>} />
                  <Route path="/portal/projects/:slug" element={<ErrorBoundary><PageErrorBoundary pageName="ProjectDetail"><ProjectDetail /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/manuscripts" element={<ErrorBoundary><Manuscripts /></ErrorBoundary>} />
                  <Route path="/portal/ideas" element={<ErrorBoundary><Ideas /></ErrorBoundary>} />
                  <Route path="/portal/ask" element={<ErrorBoundary><AskTheLab /></ErrorBoundary>} />
                  <Route path="/portal/decisions" element={<ErrorBoundary><PageErrorBoundary pageName="DecisionsPage"><DecisionsPage /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/narratives" element={<ErrorBoundary><NarrativesPage /></ErrorBoundary>} />
                  <Route path="/portal/digest" element={<ErrorBoundary><Digest /></ErrorBoundary>} />
                  <Route path="/portal/search" element={<ErrorBoundary><SearchPage /></ErrorBoundary>} />
                  <Route path="/portal/grants" element={<ErrorBoundary><PageErrorBoundary pageName="Grants"><GrantsPortal /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/meetings" element={<ErrorBoundary><Meetings /></ErrorBoundary>} />
                  <Route path="/portal/meetings/:id" element={<ErrorBoundary><MeetingDetail /></ErrorBoundary>} />
                  <Route path="/portal/meetings/:id/prep" element={<ErrorBoundary><MeetingPrep /></ErrorBoundary>} />
                  <Route path="/portal/meeting-notes" element={<ErrorBoundary><MeetingNotesPage /></ErrorBoundary>} />
                  <Route path="/portal/activity" element={<ErrorBoundary><ActivityPage /></ErrorBoundary>} />
                  <Route path="/portal/analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />
                  <Route path="/portal/insights" element={<ErrorBoundary><InsightsPage /></ErrorBoundary>} />
                  <Route path="/portal/pi/analytics" element={<ErrorBoundary><PageErrorBoundary pageName="PIAnalytics"><PIAnalytics /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/mentee-milestones" element={<ErrorBoundary><MenteeMilestones /></ErrorBoundary>} />
                  <Route path="/portal/pb" element={<ErrorBoundary><PBSector /></ErrorBoundary>} />
                  <Route path="/portal/sessions" element={<ErrorBoundary><SessionHistory /></ErrorBoundary>} />
                  <Route path="/portal/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
                  <Route path="/portal/profile" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />

                  {/* Team member pages — under portal layout when navigating
                      from inside the portal. Audit caught: clicking a teammate
                      from the sidebar would drop the logged-in user back into
                      the public marketing chrome (Fraunces titles, top nav,
                      footer). The /team list itself stays public so non-team
                      visitors can browse the lab on the marketing site. */}
                  <Route path="/portal/team/:slug" element={<ErrorBoundary><MemberPage /></ErrorBoundary>} />
                  <Route path="/portal/team/:slug/trajectory" element={<ErrorBoundary><TrajectoryPage /></ErrorBoundary>} />
                </Route>

                {/* Catch-all: redirect unknown paths to dashboard */}
                <Route path="*" element={<Navigate to="/portal/dashboard" replace />} />
              </Routes>
            </Suspense>
          </ViewTransitionWrapper>
        </AuthProvider>
      </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  )
}

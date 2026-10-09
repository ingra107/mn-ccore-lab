import { Suspense, Component, useEffect } from 'react'
import { lazyRoute, isStaleChunkError } from './lib/lazyRoute'
import type { ReactNode, ErrorInfo } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import Layout from './components/Layout'
import PortalLayout from './components/PortalLayout'
import ViewTransitionWrapper from './components/ViewTransitionWrapper'
import PageErrorBoundary from './components/PageErrorBoundary'
import RequireAuth from './components/RequireAuth'
import HeartbeatLine from './components/HeartbeatLine'
import { Button } from './components/ui/Button'
import { TooltipLayer } from './components/TooltipLayer'
const Home = lazyRoute(() => import('./pages/Home'))
import { AuthProvider } from './context/AuthContext'
import { AllProjectsRouteGuard } from './components/AllProjectsControls'
import { PATHS, PUBLIC_PATHS } from './constants/paths'

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
      // A stale chunk — this tab is running a build that a deploy replaced — is
      // the one class where this boundary's usual copy is FALSE: "everything
      // else still works" is wrong (every route this tab has not loaded yet is
      // equally dead) and "navigate to another page" walks the user onto the
      // next dead chunk. lazyRoute() already spent its one automatic reload
      // before the error could reach here; only a reload recovers, so say so.
      // Copy matches PageErrorBoundary, which handles the same case.
      const stale = isStaleChunkError(this.state.error)
      const errorMsg = this.state.error?.message || 'Unknown error'
      return (
        <div style={{ padding: '3rem 2rem', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-circle)', backgroundColor: 'var(--maroon-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--maroon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.25rem', color: 'var(--ink)', margin: '0 0 var(--sp-sm)' }}>
            {stale ? 'This tab is running an old version' : 'Something went wrong'}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--slate)', maxWidth: 420, margin: '0 0 20px', lineHeight: 1.5 }}>
            {stale
              ? 'The Hub was updated while this tab was open. Reload to get the current version.'
              : 'This page hit an error, but everything else still works. Try refreshing, or navigate to another page.'}
          </p>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-lg)' }}>
            <Button
              variant="primary"
              onClick={() => { this.setState({ hasError: false, error: null, showDetail: false }); window.location.reload() }}
            >
              {stale ? 'Reload' : 'Try again'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => { window.location.href = PATHS.dashboard }}
            >
              Go to Today
            </Button>
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
const Team = lazyRoute(() => import('./pages/Team'))
const NickLab = lazyRoute(() => import('./pages/NickLab'))
const NateLab = lazyRoute(() => import('./pages/NateLab'))
const MemberPage = lazyRoute(() => import('./pages/MemberPage'))
const Publications = lazyRoute(() => import('./pages/Publications'))
const PublicationDetail = lazyRoute(() => import('./pages/PublicationDetail'))
const Contact = lazyRoute(() => import('./pages/Contact'))
const JoinPage = lazyRoute(() => import('./pages/JoinPage'))
const NotFound = lazyRoute(() => import('./pages/NotFound'))
const Network = lazyRoute(() => import('./pages/Network'))

// Portal pages — lazy-loaded (existing)
const TodayPage = lazyRoute(() => import('./pages/portal/TodayPage'))
const ProjectDetail = lazyRoute(() => import('./pages/ProjectDetail'))
const ArtifactPage = lazyRoute(() => import('./pages/portal/ArtifactPage'))
const MeetingDetail = lazyRoute(() => import('./pages/MeetingDetail'))
const MeetingPrep = lazyRoute(() => import('./pages/MeetingPrep'))

// Tabbed pages (nav redesign, 2026-10-09). Each tab renders the page it
// replaced, unchanged; the old routes redirect to the tab (see below).
const LabOverviewHost = lazyRoute(() => import('./pages/portal/hosts/LabOverviewHost'))
const ProjectsHost = lazyRoute(() => import('./pages/portal/hosts/ProjectsHost'))
const MeetingsHost = lazyRoute(() => import('./pages/portal/hosts/MeetingsHost'))
const LibraryPage = lazyRoute(() => import('./pages/portal/hosts/LibraryPage'))
const LaunchesPage = lazyRoute(() => import('./pages/portal/LaunchesPage'))

const TrajectoryPage = lazyRoute(() => import('./pages/TrajectoryPage'))
const MyItems = lazyRoute(() => import('./pages/MyItems'))

// New portal pages (Phase H1 — placeholders, built out in later phases)
const UnifiedMyTasks = lazyRoute(() => import('./pages/MyTasks'))
const CalendarPage = lazyRoute(() => import('./pages/portal/CalendarPage'))
const DeadlinesPage = lazyRoute(() => import('./pages/portal/DeadlinesPage'))
const ManuscriptsPage = lazyRoute(() => import('./pages/portal/ManuscriptsPage'))
const SearchPage = lazyRoute(() => import('./pages/portal/SearchPage'))
const ActivityPage = lazyRoute(() => import('./pages/portal/ActivityPage'))
const AnalyticsPage = lazyRoute(() => import('./pages/portal/AnalyticsPage'))
const InsightsPage = lazyRoute(() => import('./pages/portal/InsightsPage'))
const SettingsPage = lazyRoute(() => import('./pages/portal/SettingsPage'))
const ProfilePage = lazyRoute(() => import('./pages/portal/ProfilePage'))
const DecisionsPage = lazyRoute(() => import('./pages/portal/DecisionsPage'))
const NarrativesPage = lazyRoute(() => import('./pages/portal/NarrativesPage'))
const AskTheLab = lazyRoute(() => import('./pages/portal/AskTheLab'))
const TeamDirectoryPage = lazyRoute(() => import('./pages/portal/TeamDirectoryPage'))
const SessionHistory = lazyRoute(() => import('./pages/portal/SessionHistory'))
const Pulse = lazyRoute(() => import('./pages/Pulse'))
const GrantsPage = lazyRoute(() => import('./pages/portal/GrantsPage'))

function PageLoader() {
  // P1-10: the lab's own ECG pulse instead of a generic spinner. HeartbeatLine
  // is reduced-motion safe (pauses fully-drawn) and shares the favicon trace.
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3" role="status" aria-label="Loading">
        <HeartbeatLine width={180} height={48} color="var(--gold)" ariaLabel="Loading" />
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

/**
 * Redirect shim that PRESERVES the query string. Plain <Navigate to="/x">
 * drops `?create=true` / `?open=<id>` etc., which silently breaks deep-links
 * that hop through a redirect (e.g. /portal/tasks?create=true →
 * /portal/my-tasks). Use this for any legacy-path shim whose target hosts a
 * deep-link consumer.
 */
function NavigateKeepSearch({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

function FullLoadRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation()
  useEffect(() => { window.location.replace(`${to}${search}${hash}`) }, [to, search, hash])
  return <PageLoader />
}

/**
 * Redirect to a target that carries its own query (a tab: /portal/projects?
 * tab=ideas) and MERGE the incoming query into it, so /portal/ideas?create=true
 * lands on /portal/projects?tab=ideas&create=true. NavigateKeepSearch would
 * append a second '?'. The target's own keys win over an incoming duplicate.
 */
function NavigateToTab({ to }: { to: string }) {
  const { search } = useLocation()
  const [path, query = ''] = to.split('?')
  const merged = new URLSearchParams(search)
  for (const [k, v] of new URLSearchParams(query)) merged.set(k, v)
  const qs = merged.toString()
  return <Navigate to={qs ? `${path}?${qs}` : path} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
      {/* Global tooltip layer — renders styled [data-tip] chips in a body
          portal so they escape overflow clipping (Nick 2026-07-09). */}
      <TooltipLayer />
      <BrowserRouter>
        <AuthProvider>
          <AllProjectsRouteGuard />
          <ViewTransitionWrapper>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Standalone pages (no layout wrapper) */}
                <Route path="/pulse" element={<ErrorBoundary><Pulse /></ErrorBoundary>} />

                {/* Public pages: top nav layout */}
                <Route element={<Layout />}>
                  {/* Home is lazy too — without a boundary, a stale Home chunk
                      that survives lazyRoute's one automatic reload would
                      unmount the entire tree (blank page). Same class as the
                      other public routes below. */}
                  <Route path="/" element={<ErrorBoundary><Home /></ErrorBoundary>} />
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
                  {/* The Member Hub tab's page for a signed-in non-member. */}
                  <Route path={PUBLIC_PATHS.join} element={<ErrorBoundary><JoinPage /></ErrorBoundary>} />
                  {/* Unknown paths: a not-found page in the public chrome, with
                      a link home and one into the Hub (sign-in when logged
                      out). It replaced a redirect to /portal/dashboard, which
                      sent a mistyped public URL to the sign-in wall. */}
                  <Route path="*" element={<ErrorBoundary><NotFound /></ErrorBoundary>} />
                </Route>

                {/* Legacy root-path redirects (2026-04-21 migration).
                    Anyone hitting an old URL bounces to the /portal/*
                    equivalent. Placed OUTSIDE RequireAuth so the bounce
                    happens before any auth gate — the portal URL handles
                    auth. Kept indefinitely; cost is negligible. */}
                <Route path="/dashboard" element={<NavigateKeepSearch to="/portal/dashboard" />} />
                {/* Bare /portal had no route and fell into the public Not-found page.
                    A FULL load, not a client-side hop: bare /portal is outside the
                    Cloudflare Access policy, so only a real request to
                    /portal/dashboard reaches the edge login for signed-out users. */}
                <Route path="/portal" element={<FullLoadRedirect to="/portal/dashboard" />} />
                {/* My Hub merged into Today (2026-10-09). */}
                <Route path="/personal" element={<NavigateKeepSearch to={PATHS.dashboard} />} />
                {/* Entity-bearing legacy redirects MUST keep the query string —
                    notification links are minted as /tasks?open=<id>; a plain
                    <Navigate> drops ?open so the click landed on "just another
                    page" instead of opening the task (Nick 2026-06-11). */}
                <Route path="/my-items" element={<NavigateKeepSearch to="/portal/my-items" />} />
                <Route path="/my-tasks" element={<NavigateKeepSearch to="/portal/my-tasks" />} />
                <Route path="/tasks" element={<NavigateKeepSearch to="/portal/my-tasks" />} />
                <Route path="/calendar" element={<NavigateKeepSearch to="/portal/calendar" />} />
                <Route path="/deadlines" element={<NavigateKeepSearch to="/portal/deadlines" />} />
                <Route path="/deadline-cascade" element={<NavigateToTab to={PATHS.deadlineCascadeTab} />} />
                <Route path="/projects" element={<NavigateKeepSearch to="/portal/projects" />} />
                <Route path="/projects/:slug" element={<NavigateWithParams to="/portal/projects/:slug" />} />
                <Route path="/manuscripts" element={<NavigateKeepSearch to="/portal/manuscripts" />} />
                <Route path="/ideas" element={<NavigateToTab to={PATHS.ideasTab} />} />
                <Route path="/ask" element={<NavigateKeepSearch to="/portal/ask" />} />
                <Route path="/decisions" element={<NavigateKeepSearch to="/portal/decisions" />} />
                <Route path="/narratives" element={<NavigateKeepSearch to="/portal/narratives" />} />
                <Route path="/digest" element={<NavigateToTab to={PATHS.digestTab} />} />
                <Route path="/research-digest" element={<NavigateToTab to={PATHS.digestTab} />} />
                <Route path="/search" element={<NavigateKeepSearch to="/portal/search" />} />
                <Route path="/grants" element={<NavigateKeepSearch to="/portal/grants" />} />
                <Route path="/meetings" element={<NavigateKeepSearch to="/portal/meetings" />} />
                <Route path="/meetings/:id" element={<NavigateWithParams to="/portal/meetings/:id" />} />
                <Route path="/meetings/:id/prep" element={<NavigateWithParams to="/portal/meetings/:id/prep" />} />
                <Route path="/meeting-prep" element={<NavigateKeepSearch to="/portal/meetings" />} />
                <Route path="/meeting-notes" element={<NavigateToTab to={PATHS.transcriptsTab} />} />
                <Route path="/activity" element={<NavigateKeepSearch to="/portal/activity" />} />
                <Route path="/analytics" element={<NavigateKeepSearch to="/portal/analytics" />} />
                <Route path="/pi/analytics" element={<NavigateToTab to={PATHS.piAnalyticsTab} />} />
                <Route path="/pi-analytics" element={<NavigateToTab to={PATHS.piAnalyticsTab} />} />
                <Route path="/mentee-milestones" element={<NavigateToTab to={PATHS.menteeMilestonesTab} />} />
                <Route path="/sessions" element={<NavigateKeepSearch to="/portal/sessions" />} />
                <Route path="/settings" element={<NavigateKeepSearch to="/portal/settings" />} />
                <Route path="/artifacts" element={<NavigateToTab to={PATHS.library} />} />
                <Route path="/library" element={<NavigateToTab to={PATHS.library} />} />

                {/* Pages merged by the nav redesign (2026-10-09). Every old
                    portal URL redirects to its new home, query kept, so no
                    bookmark, notification link or test path 404s. Outside
                    RequireAuth like the shims above: the target handles auth. */}
                <Route path="/portal/personal" element={<NavigateKeepSearch to={PATHS.dashboard} />} />
                <Route path="/portal/artifacts" element={<NavigateToTab to={PATHS.library} />} />
                <Route path="/portal/digest" element={<NavigateToTab to={PATHS.digestTab} />} />
                <Route path="/portal/ideas" element={<NavigateToTab to={PATHS.ideasTab} />} />
                <Route path="/portal/meeting-notes" element={<NavigateToTab to={PATHS.transcriptsTab} />} />
                <Route path="/portal/pi/analytics" element={<NavigateToTab to={PATHS.piAnalyticsTab} />} />
                <Route path="/portal/mentee-milestones" element={<NavigateToTab to={PATHS.menteeMilestonesTab} />} />
                <Route path="/portal/deadline-cascade" element={<NavigateToTab to={PATHS.deadlineCascadeTab} />} />

                {/* Portal pages: sidebar layout — wrapped in RequireAuth so
                    flipping VITE_REQUIRE_AUTH=1 or appending ?strict=1 to
                    the URL instantly gates portal access (2026-04-18). */}
                <Route element={<RequireAuth><PortalLayout /></RequireAuth>}>
                  {/* Portal-prefixed canonical routes (2026-04-21 migration). */}
                  {/* Today B2 — operating-day landing (CLAUDE.md Rule 52).
                      The old card-grid Dashboard moved to /portal/overview
                      below, kept indefinitely as Lab Overview. */}
                  <Route path="/portal/dashboard" element={<ErrorBoundary><PageErrorBoundary pageName="Today"><TodayPage /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/overview" element={<ErrorBoundary><LabOverviewHost /></ErrorBoundary>} />
                  <Route path="/portal/my-items" element={<ErrorBoundary><MyItems /></ErrorBoundary>} />
                  {/* MyTasks Round 2 — unified 3-view page (List / Lanes / Columns,
                      List default on bare arrival; ?view= deep-links win). */}
                  <Route path="/portal/my-tasks" element={<ErrorBoundary><PageErrorBoundary pageName="MyTasks"><UnifiedMyTasks /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/tasks" element={<NavigateKeepSearch to="/portal/my-tasks" />} />
                  <Route path="/portal/calendar" element={<ErrorBoundary><CalendarPage /></ErrorBoundary>} />
                  <Route path="/portal/deadlines" element={<ErrorBoundary><DeadlinesPage /></ErrorBoundary>} />
                  <Route path="/portal/projects" element={<ErrorBoundary><ProjectsHost /></ErrorBoundary>} />
                  <Route path="/portal/projects/:slug" element={<ErrorBoundary><PageErrorBoundary pageName="ProjectDetail"><ProjectDetail /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/library" element={<ErrorBoundary><PageErrorBoundary pageName="Library"><LibraryPage /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/artifacts/:id" element={<ErrorBoundary><PageErrorBoundary pageName="ArtifactPage"><ArtifactPage /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/manuscripts" element={<ErrorBoundary><ManuscriptsPage /></ErrorBoundary>} />
                  <Route path="/portal/ask" element={<ErrorBoundary><AskTheLab /></ErrorBoundary>} />
                  <Route path="/portal/decisions" element={<ErrorBoundary><PageErrorBoundary pageName="DecisionsPage"><DecisionsPage /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/narratives" element={<ErrorBoundary><NarrativesPage /></ErrorBoundary>} />
                  <Route path="/portal/search" element={<ErrorBoundary><SearchPage /></ErrorBoundary>} />
                  <Route path="/portal/grants" element={<ErrorBoundary><PageErrorBoundary pageName="Grants"><GrantsPage /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/meetings" element={<ErrorBoundary><MeetingsHost /></ErrorBoundary>} />
                  <Route path="/portal/meetings/:id" element={<ErrorBoundary><MeetingDetail /></ErrorBoundary>} />
                  <Route path="/portal/meetings/:id/prep" element={<ErrorBoundary><MeetingPrep /></ErrorBoundary>} />
                  <Route path="/portal/activity" element={<ErrorBoundary><ActivityPage /></ErrorBoundary>} />
                  <Route path="/portal/analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />
                  <Route path="/portal/insights" element={<ErrorBoundary><InsightsPage /></ErrorBoundary>} />
                  <Route path="/portal/sessions" element={<ErrorBoundary><SessionHistory /></ErrorBoundary>} />
                  <Route path="/portal/launches" element={<ErrorBoundary><LaunchesPage /></ErrorBoundary>} />
                  <Route path="/portal/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
                  <Route path="/portal/profile" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />

                  {/* Team member pages — under portal layout when navigating
                      from inside the portal. Audit caught: clicking a teammate
                      from the sidebar would drop the logged-in user back into
                      the public marketing chrome (Fraunces titles, top nav,
                      footer). The /team list itself stays public so non-team
                      visitors can browse the lab on the marketing site. */}
                  <Route path="/portal/team" element={<ErrorBoundary><TeamDirectoryPage /></ErrorBoundary>} />
                  <Route path="/portal/team/:slug" element={<ErrorBoundary><MemberPage /></ErrorBoundary>} />
                  <Route path="/portal/team/:slug/trajectory" element={<ErrorBoundary><TrajectoryPage /></ErrorBoundary>} />
                </Route>

              </Routes>
            </Suspense>
          </ViewTransitionWrapper>
        </AuthProvider>
      </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  )
}

import { lazy, Suspense, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import PortalLayout from './components/PortalLayout'
import Home from './pages/Home'
import { AuthProvider } from './context/AuthContext'

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
          <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: 'rgba(122,0,25,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--maroon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.25rem', color: 'var(--ink)', margin: '0 0 8px' }}>
            Something went wrong
          </h2>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--slate)', maxWidth: 420, margin: '0 0 20px', lineHeight: 1.5 }}>
            This page hit an error, but everything else still works. Try refreshing, or navigate to another page.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => { this.setState({ hasError: false, error: null, showDetail: false }); window.location.reload() }}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', padding: '8px 20px', borderRadius: 8, border: 'none', backgroundColor: 'var(--teal)', color: 'white', cursor: 'pointer' }}
            >
              Try again
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard' }}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--slate)', cursor: 'pointer' }}
            >
              Go to Dashboard
            </button>
          </div>
          <button
            onClick={() => this.setState({ showDetail: !this.state.showDetail })}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)', opacity: 0.5, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {this.state.showDetail ? 'Hide details' : 'Show error details'}
          </button>
          {this.state.showDetail && (
            <pre style={{ marginTop: 12, padding: '12px 16px', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.03)', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)', textAlign: 'left', maxWidth: 500, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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
const Projects = lazy(() => import('./pages/Projects'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const Meetings = lazy(() => import('./pages/Meetings'))
const MeetingDetail = lazy(() => import('./pages/MeetingDetail'))
const Digest = lazy(() => import('./pages/Digest'))
const CVPage = lazy(() => import('./pages/CVPage'))
const GrantsPage = lazy(() => import('./pages/Grants'))
const MyItems = lazy(() => import('./pages/MyItems'))

// New portal pages (Phase H1 — placeholders, built out in later phases)
const Personal = lazy(() => import('./pages/portal/Personal'))
const Tasks = lazy(() => import('./pages/portal/Tasks'))
const MyTasks = lazy(() => import('./pages/portal/MyTasks'))
const CalendarPage = lazy(() => import('./pages/portal/CalendarPage'))
const Deadlines = lazy(() => import('./pages/portal/Deadlines'))
const Manuscripts = lazy(() => import('./pages/portal/Manuscripts'))
const Ideas = lazy(() => import('./pages/portal/Ideas'))
const SearchPage = lazy(() => import('./pages/portal/SearchPage'))
const ActivityPage = lazy(() => import('./pages/portal/ActivityPage'))
const AnalyticsPage = lazy(() => import('./pages/portal/AnalyticsPage'))
const SettingsPage = lazy(() => import('./pages/portal/SettingsPage'))
const MeetingNotesPage = lazy(() => import('./pages/portal/MeetingNotesPage'))
const DecisionsPage = lazy(() => import('./pages/portal/DecisionsPage'))
const Pulse = lazy(() => import('./pages/Pulse'))
// GrantsPortal placeholder available when existing Grants page is fully migrated
// const GrantsPortal = lazy(() => import('./pages/portal/Grants'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }}
        />
        <span className="text-sm" style={{ color: 'var(--slate)', fontFamily: 'var(--font-mono)' }}>
          Loading...
        </span>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
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
                  <Route path="/team/:slug/cv" element={<ErrorBoundary><CVPage /></ErrorBoundary>} />
                  <Route path="/publications" element={<ErrorBoundary><Publications /></ErrorBoundary>} />
                  <Route path="/publications/:id" element={<ErrorBoundary><PublicationDetail /></ErrorBoundary>} />
                  <Route path="/network" element={<ErrorBoundary><Network /></ErrorBoundary>} />
                  <Route path="/contact" element={<ErrorBoundary><Contact /></ErrorBoundary>} />
                </Route>

                {/* Portal pages: sidebar layout */}
                <Route element={<PortalLayout />}>
                  {/* Workspace */}
                  <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                  <Route path="/personal" element={<ErrorBoundary><Personal /></ErrorBoundary>} />
                  <Route path="/my-items" element={<ErrorBoundary><MyItems /></ErrorBoundary>} />

                  {/* Planning */}
                  <Route path="/my-tasks" element={<ErrorBoundary><MyTasks /></ErrorBoundary>} />
                  <Route path="/tasks" element={<ErrorBoundary><Tasks /></ErrorBoundary>} />
                  <Route path="/calendar" element={<ErrorBoundary><CalendarPage /></ErrorBoundary>} />
                  <Route path="/deadlines" element={<ErrorBoundary><Deadlines /></ErrorBoundary>} />

                  {/* Research */}
                  <Route path="/projects" element={<ErrorBoundary><Projects /></ErrorBoundary>} />
                  <Route path="/projects/:slug" element={<ErrorBoundary><ProjectDetail /></ErrorBoundary>} />
                  <Route path="/manuscripts" element={<ErrorBoundary><Manuscripts /></ErrorBoundary>} />
                  <Route path="/ideas" element={<ErrorBoundary><Ideas /></ErrorBoundary>} />
                  <Route path="/decisions" element={<ErrorBoundary><DecisionsPage /></ErrorBoundary>} />
                  <Route path="/digest" element={<ErrorBoundary><Digest /></ErrorBoundary>} />
                  <Route path="/search" element={<ErrorBoundary><SearchPage /></ErrorBoundary>} />
                  <Route path="/grants" element={<ErrorBoundary><GrantsPage /></ErrorBoundary>} />

                  {/* Meetings */}
                  <Route path="/meetings" element={<ErrorBoundary><Meetings /></ErrorBoundary>} />
                  <Route path="/meetings/:id" element={<ErrorBoundary><MeetingDetail /></ErrorBoundary>} />
                  <Route path="/meeting-notes" element={<ErrorBoundary><MeetingNotesPage /></ErrorBoundary>} />

                  {/* Lab */}
                  <Route path="/activity" element={<ErrorBoundary><ActivityPage /></ErrorBoundary>} />
                  <Route path="/analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />
                  <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
                </Route>
              </Routes>
            </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

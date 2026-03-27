import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import PortalLayout from './components/PortalLayout'
import Home from './pages/Home'
import { AuthProvider } from './context/AuthContext'

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
                {/* Public pages: top nav layout */}
                <Route element={<Layout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="/nick" element={<NickLab />} />
                  <Route path="/nate" element={<NateLab />} />
                  <Route path="/team/:slug" element={<MemberPage />} />
                  <Route path="/team/:slug/cv" element={<CVPage />} />
                  <Route path="/publications" element={<Publications />} />
                  <Route path="/network" element={<Network />} />
                  <Route path="/contact" element={<Contact />} />
                </Route>

                {/* Portal pages: sidebar layout */}
                <Route element={<PortalLayout />}>
                  {/* Workspace */}
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/personal" element={<Personal />} />
                  <Route path="/my-items" element={<MyItems />} />

                  {/* Planning */}
                  <Route path="/my-tasks" element={<MyTasks />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/deadlines" element={<Deadlines />} />

                  {/* Research */}
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/projects/:slug" element={<ProjectDetail />} />
                  <Route path="/manuscripts" element={<Manuscripts />} />
                  <Route path="/ideas" element={<Ideas />} />
                  <Route path="/digest" element={<Digest />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/grants" element={<GrantsPage />} />

                  {/* Meetings */}
                  <Route path="/meetings" element={<Meetings />} />
                  <Route path="/meetings/:id" element={<MeetingDetail />} />
                </Route>
              </Routes>
            </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import Home from './pages/Home'
import { DataProvider } from './hooks/useLocalData'
import { AuthProvider } from './context/AuthContext'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

// Lazy-loaded pages — each becomes its own chunk
const Team = lazy(() => import('./pages/Team'))
const NickLab = lazy(() => import('./pages/NickLab'))
const NateLab = lazy(() => import('./pages/NateLab'))
const MemberPage = lazy(() => import('./pages/MemberPage'))
const Publications = lazy(() => import('./pages/Publications'))
const Contact = lazy(() => import('./pages/Contact'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Network = lazy(() => import('./pages/Network'))
const Projects = lazy(() => import('./pages/Projects'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const Meetings = lazy(() => import('./pages/Meetings'))
const MeetingDetail = lazy(() => import('./pages/MeetingDetail'))

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
          <DataProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="/nick" element={<NickLab />} />
                  <Route path="/nate" element={<NateLab />} />
                  <Route path="/team/:slug" element={<MemberPage />} />
                  <Route path="/publications" element={<Publications />} />
                  <Route path="/network" element={<Network />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/projects/:slug" element={<ProjectDetail />} />
                  <Route path="/meetings" element={<Meetings />} />
                <Route path="/meetings/:id" element={<MeetingDetail />} />
                </Route>
              </Routes>
            </Suspense>
          </DataProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

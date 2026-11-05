// Pages a person can reach and cannot use say so (fable audit and live walk, 2026-11-05).
//   F12           Profile: a PI with no directory row gets the note, not a skeleton.
//   F33 + walk 4  Session History: a member gets a note, and no dead aggregate.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import ProfilePage from '../pages/portal/ProfilePage'
import SessionHistory from '../pages/portal/SessionHistory'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const pi: AuthUser = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}
const member: AuthUser = { ...pi, email: 'eddin022@umn.edu', slug: 'casey-eddington', isPi: false, canShowAllProjects: false }

let routes: Record<string, unknown> = {}
let requests: { path: string; method: string }[] = []
let postStatus = 200
const realFetch = window.fetch
beforeEach(() => {
  routes = { '/api/meetings/cadence-check': { recommendation: 'no_upcoming', reasons: [], data: { recommendation: 'no_upcoming', reasons: [] } } }
  requests = []
  postStatus = 200
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin).pathname
    const method = init?.method ?? 'GET'
    requests.push({ path, method })
    if (method === 'POST') return new Response(JSON.stringify({ data: {} }), { status: postStatus, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify(routes[path] ?? { data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof window.fetch
})
afterEach(() => { window.fetch = realFetch })

function tree(node: React.ReactElement, user: AuthUser = pi, start = '/') {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider>
          <MemoryRouter initialEntries={[start]}>
            <Routes><Route path="*" element={node} /></Routes>
          </MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

describe('Profile', () => {
  it('tells a signed-in person with no directory row what to do, instead of a skeleton forever', async () => {
    routes['/api/team'] = { data: [] }
    const host = await mount(tree(<ProfilePage />), { ready: (h) => h.textContent?.includes('No profile yet'), label: 'no-profile note' })
    expect(host.textContent).toContain('Ask Nick to add you')
    expect(host.textContent).not.toContain('auto-create')
  })
})

describe('Session History', () => {
  it('shows a member a note, not the "set up the hook" empty state their 403 used to read as', async () => {
    const host = await mount(tree(<SessionHistory />, member), { ready: (h) => h.textContent?.includes('Session History'), label: 'page' })
    expect(host.textContent).toContain('Session history is for the PI')
    expect(host.textContent).not.toContain('SessionEnd hook')
    expect(requests.some((r) => r.path.startsWith('/api/pb/'))).toBe(false)
  })

  it('drops the commits and actions aggregates and columns: every row holds zero', async () => {
    routes['/api/pb/sessions/stats'] = { data: { total_sessions: 2, total_hours: 3, total_commits: 0, total_actions: 0, avg_minutes: 30, sessions_this_week: 1, per_project: [], per_day: [] } }
    routes['/api/pb/sessions'] = { data: [{ id: 's1', started_at: '2026-11-04T12:00:00Z', ended_at: null, machine: 'home', project_name: null, summary: 'Worked', actions_count: 0, commits_count: 0, duration_minutes: 30 }] }
    const host = await mount(tree(<SessionHistory />), { ready: (h) => h.textContent?.includes('Worked'), label: 'session row' })
    expect(host.textContent).toContain('Total hours')
    expect(host.textContent).not.toMatch(/commits/i)
    expect(host.textContent).not.toMatch(/actions/i)
  })
})

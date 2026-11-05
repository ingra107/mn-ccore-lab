// R15: a failed read must not look like an empty one. The Calendar reported zero
// events on a 500, and an artifact's discussion read "No discussion yet" on a 500.
// An empty state appears only after a successful empty read.
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import CalendarPage from '../pages/portal/CalendarPage'
import ArtifactPage from '../pages/portal/ArtifactPage'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** First matching fragment answers; anything else is an empty success. */
function stubFetch(routes: [string, () => Response][]) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [fragment, answer] of routes) if (url.includes(fragment)) return answer()
    return respond(200, { data: [] })
  })
}

const user = { email: 'bob@umn.edu', slug: 'bob', name: 'Bob', isAuthenticated: true, isPi: false, isMember: true, canShowAllProjects: false, piResolved: true }
function tree(path: string, route: string, page: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false } as never}>
        <UndoToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes><Route path={route} element={page} /></Routes>
          </MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}
const text = (h: HTMLElement) => h.textContent ?? ''

describe('Calendar page', () => {
  const page = () => tree('/portal/calendar', '/portal/calendar', <CalendarPage />)

  it('a failed read says so, and reports no event count', async () => {
    stubFetch([['/api/calendar/events', () => respond(500, { error: 'boom' })]])
    const host = await mount(page(), { ready: (h) => text(h).includes('Something went wrong'), label: 'calendar error state' })
    expect(text(host)).not.toContain('0 event')
  })

  it('a successful empty read shows the zero count and the grid', async () => {
    stubFetch([['/api/calendar/events', () => respond(200, { data: [], count: 0 })]])
    const host = await mount(page(), { ready: (h) => text(h).includes('0 events'), label: 'calendar zero count' })
    expect(text(host)).not.toContain('Something went wrong')
  })
})

describe('Calendar date labels (R14)', () => {
  it('a row on its hard deadline says so; a row on its due date does not', async () => {
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`
    const row = (id: string, title: string, date_kind: string) => ({ id, date, title, kind: 'task', type: 'task', category: 'medium', meta: { date_kind } })
    stubFetch([['/api/calendar/events', () => respond(200, { data: [row('t1', 'Progress report', 'deadline'), row('t2', 'Write summary', 'due')], count: 2 })]])
    const host = await mount(tree('/portal/calendar', '/portal/calendar', <CalendarPage />), { ready: (h) => text(h).includes('Write summary'), label: 'calendar rows' })
    expect(text(host)).toContain('Deadline: Progress report')
    expect(text(host)).not.toContain('Deadline: Write summary')
  })
})

describe('Artifact page', () => {
  const artifact = {
    id: 'art_1', title: 'The doc', body_md: 'Body', content_type: 'markdown', visibility: 'team', version: 1,
    created_by: 'bob', created_at: '2026-11-01 10:00:00', updated_at: '2026-11-01 10:00:00', versions: [], tags: [],
  }
  const page = () => tree('/portal/artifacts/art_1', '/portal/artifacts/:id', <ArtifactPage />)

  it('a failed discussion read says so, and does not claim there is no discussion', async () => {
    stubFetch([
      ['/api/artifacts/art_1/activity', () => respond(500, { error: 'boom' })],
      ['/api/artifacts/art_1', () => respond(200, { data: artifact })],
    ])
    const host = await mount(page(), { ready: (h) => text(h).includes('discussion unavailable'), label: 'discussion error note' })
    expect(text(host)).toContain('The doc')
    expect(text(host)).not.toContain('No discussion yet')
  })

  it('a successful empty discussion says there is none', async () => {
    stubFetch([
      ['/api/artifacts/art_1/activity', () => respond(200, { data: [], hidden_count: 0 })],
      ['/api/artifacts/art_1', () => respond(200, { data: artifact })],
    ])
    const host = await mount(page(), { ready: (h) => text(h).includes('No discussion yet'), label: 'empty discussion' })
    expect(text(host)).not.toContain('unavailable')
  })

  it('a failed artifact read is an error, not "not found"', async () => {
    stubFetch([['/api/artifacts/art_1', () => respond(500, { error: 'boom' })]])
    const host = await mount(page(), { ready: (h) => text(h).includes('Something went wrong'), label: 'artifact error state' })
    expect(text(host)).not.toContain('Artifact not found')
  })

  it('a real 404 still says not found', async () => {
    stubFetch([['/api/artifacts/art_1', () => respond(404, { error: 'Artifact not found' })]])
    await mount(page(), { ready: (h) => text(h).includes('Artifact not found'), label: 'artifact not found' })
  })
})

// Guards the activity controls through the Today reskin (badge + first-name
// restyle): for the PI, a Hermes day thread and a drawer activity line must
// still render the dismiss (EyeOff, v102 root dismiss) and the two-step delete
// (DeleteEntryButton, #120 "Click again to delete permanently"), and a
// non-author non-PI must get neither. Also: the delete arms on first click and
// fires only on the second.
//
// Runs in real Chromium (vitest.config.ts browser mode).

import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import { DayActivityFeed } from '../components/today/DayActivityFeed'
import { ActivityPeek } from '../components/today/ActivityPeek'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const entry = (over: Record<string, unknown>) => ({
  id: 'e1', entity_type: 'task', entity_id: 't1', project_id: null, kind: 'comment', visibility: 'team',
  actor_slug: 'nick-ingraham', body: 'added ICC 0.05 numbers', mentions_json: null, update_type: null,
  metadata_json: null, created_at: '2026-10-09 13:40:00', reply_count: 0, ...over,
})

const user = (over: Record<string, unknown>) => ({
  email: 'x@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: false, piResolved: true, ...over,
})

function wrap(u: ReturnType<typeof user>, node: ReactElement): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user: u, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider>
          <MemoryRouter><div className="tk">{node}</div></MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

function stubFeed(rows: unknown[]) {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => (init?.method === 'POST' ? { ok: true } : { data: rows, hidden_count: 0 }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const labels = (host: HTMLElement) => [...host.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? '')

describe('activity controls survive the badge + first-name restyle', () => {
  it('drawer activity line: PI sees dismiss and delete, and delete is two-step', async () => {
    const f = stubFeed([entry({ actor_slug: 'lianne-siegel' })])
    const host = await mount(wrap(user({}), <ActivityPeek taskId="t1" onViewAll={() => {}} />), {
      ready: (h) => h.querySelector('[data-activity-id]'), label: 'ActivityPeek',
    })
    expect(host.textContent).toContain('Lianne')
    expect(labels(host)).toContain('Dismiss thread')
    expect(labels(host)).toContain('Delete entry')

    const del = [...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Delete entry')!
    del.click()
    await new Promise((r) => setTimeout(r, 30))
    expect(labels(host)).toContain('Click again to delete permanently')
    expect(f.mock.calls.some((c) => String(c[0]).includes('/delete'))).toBe(false)
    ;[...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Click again to delete permanently')!.click()
    for (let i = 0; i < 50 && !f.mock.calls.some((c) => String(c[0]).includes('/delete')); i++) await new Promise((r) => setTimeout(r, 10))
    expect(f.mock.calls.some((c) => String(c[0]).includes('/api/activity/e1/delete'))).toBe(true)
    vi.unstubAllGlobals()
  })

  it('drawer activity line: a non-author non-PI gets neither control', async () => {
    stubFeed([entry({ actor_slug: 'lianne-siegel' })])
    const host = await mount(wrap(user({ isPi: false, slug: 'casey-eddington' }), <ActivityPeek taskId="t1" onViewAll={() => {}} />), {
      ready: (h) => h.querySelector('[data-activity-id]'), label: 'ActivityPeek',
    })
    expect(labels(host)).not.toContain('Dismiss thread')
    expect(labels(host)).not.toContain('Delete entry')
    vi.unstubAllGlobals()
  })

  it('Hermes day thread: PI sees dismiss and delete on the root', async () => {
    stubFeed([entry({ entity_type: 'day', actor_slug: 'nick-ingraham', body: '@hermes what is left on the K23 RPPR?', visibility: 'author' })])
    const host = await mount(wrap(user({}), <DayActivityFeed dateKey="2026-10-09" />), {
      ready: (h) => h.querySelector('.detail-card'), label: 'DayActivityFeed',
    })
    expect(host.textContent).toContain('Nick')
    expect(labels(host)).toContain('Dismiss thread')
    expect(labels(host)).toContain('Delete entry')
    vi.unstubAllGlobals()
  })
})

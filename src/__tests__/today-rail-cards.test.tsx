// Today rail cards folded in from the retired My Items page: NewActivityCard
// and CommitmentsCard. Render, empty state, and the PI-only gate on commitments
// (the commitments table has no owner column, so a member must never fetch it).
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/useAuth'
import { NewActivityCard } from '../components/today/rail/NewActivityCard'
import { CommitmentsCard } from '../components/today/rail/CommitmentsCard'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const user = (over: Record<string, unknown>) => ({
  email: 'x@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: false, piResolved: true, ...over,
})

function wrap(u: ReturnType<typeof user>, node: ReactElement): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user: u, isAuthenticated: true, isLoading: false }}>
        <MemoryRouter><div className="tk">{node}</div></MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

function stubApi(unseen: unknown[], commitments: unknown[]) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes('/api/commitments') ? { data: commitments } : { data: unseen }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const unseenRow = (over: Record<string, unknown>) => ({
  entity_type: 'task', entity_id: 't1', new_count: 2, latest_at: '2026-10-12 10:00:00',
  title: 'Draft the aims', project_slug: 'p1', ...over,
})

const commitment = (over: Record<string, unknown>) => ({
  id: 'c1', commitment: 'Send the revised aims', to_whom: 'Amy Hall', to_slug: null, status: 'open',
  due_date: '2099-01-01', source: 'meeting: Lab meeting', project: null, task_id: null,
  created_at: '2026-10-01', completed_at: null, ...over,
})

const settle = () => new Promise((r) => setTimeout(r, 150))

describe('NewActivityCard', () => {
  it('renders task and project rows with a type cue, and drops meeting rows', async () => {
    stubApi([
      unseenRow({}),
      unseenRow({ entity_type: 'project', entity_id: 'p1', title: 'R01 Aims' }),
      unseenRow({ entity_type: 'meeting', entity_id: 'm1', title: 'Lab meeting' }),
    ], [])
    const host = await mount(wrap(user({}), <NewActivityCard />), {
      ready: (h) => h.querySelector('[data-b2-new-activity]'), label: 'NewActivityCard',
    })
    const text = host.textContent ?? ''
    expect(text).toContain('Draft the aims')
    expect(text).toContain('R01 Aims')
    expect(text).not.toContain('Lab meeting')
    expect(text).toContain('Task')
    expect(text).toContain('Project')
  })

  it('renders nothing when there is no unseen activity', async () => {
    stubApi([], [])
    const host = await mount(wrap(user({}), <NewActivityCard />), { ready: (h) => h.querySelector('.tk'), label: 'host' })
    await settle()
    expect(host.querySelector('[data-b2-new-activity]')).toBeNull()
  })
})

describe('CommitmentsCard', () => {
  it('shows the PI their open commitments with the source meeting as visible text, done rows newest first', async () => {
    stubApi([], [
      commitment({}),
      commitment({ id: 'c2', commitment: 'Old done', status: 'done', completed_at: '2026-09-01' }),
      commitment({ id: 'c3', commitment: 'Newer done', status: 'done', completed_at: '2026-10-05' }),
    ])
    const host = await mount(wrap(user({}), <CommitmentsCard />), {
      ready: (h) => h.querySelector('[data-b2-commitments]'), label: 'CommitmentsCard',
    })
    expect(host.textContent).toContain('Send the revised aims')
    expect(host.textContent).toContain('To Amy Hall')
    expect(host.textContent).toContain('From Lab meeting')
    const more = [...host.querySelectorAll('button')].find((b) => /done/.test(b.textContent ?? ''))!
    more.click()
    await expect.poll(() => host.textContent).toContain('Newer done')
    const t = host.textContent ?? ''
    expect(t.indexOf('Newer done')).toBeLessThan(t.indexOf('Old done'))
  })

  it('renders nothing when the PI has no commitments', async () => {
    stubApi([], [])
    const host = await mount(wrap(user({}), <CommitmentsCard />), { ready: (h) => h.querySelector('.tk'), label: 'host' })
    await settle()
    expect(host.querySelector('[data-b2-commitments]')).toBeNull()
  })

  it('renders nothing for a member and never requests /api/commitments', async () => {
    const f = stubApi([], [commitment({})])
    const host = await mount(wrap(user({ isPi: false, slug: 'casey-eddington' }), <CommitmentsCard />), {
      ready: (h) => h.querySelector('.tk'), label: 'host',
    })
    await settle()
    expect(host.querySelector('[data-b2-commitments]')).toBeNull()
    expect(f.mock.calls.some((c) => String(c[0]).includes('/api/commitments'))).toBe(false)
  })
})

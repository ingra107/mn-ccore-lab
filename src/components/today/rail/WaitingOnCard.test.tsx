// #168: waiting projects get their own small card, leave No next step with one
// click, and a date on one is an ordinary check-in task. Real Chromium with fetch
// stubbed; the test reads the exact writes the Hub would receive.

import '../../../index.css'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../../../hooks/useAuth'
import { UndoToastProvider } from '../../UndoToast'
import { NoNextStepCard } from './NoNextStepCard'
import { WaitingOnCard } from './WaitingOnCard'
import type { TaskRow } from '../../../lib/api'
import { mount, cleanupMountsAfterEach, waitFor } from '../../../__tests__/testMount'

cleanupMountsAfterEach()
afterEach(() => vi.unstubAllGlobals())

const user = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}
const ypsa = { id: 'proj_y', slug: 'asci-ypsa', title: 'ASCI YPSA Award', short_name: 'ASCI YPSA', status: 'waiting_external' }

type Write = { url: string; body: Record<string, unknown> }
function stub(projects: Record<string, unknown>[], gaps: Record<string, unknown>[] = []) {
  const writes: Write[] = []
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (init?.method && init.method !== 'GET') {
      const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      writes.push({ url: u, body })
      return { ok: true, status: 200, json: async () => ({ data: { id: 'task_new', ...body } }) } as Response
    }
    const data = u.includes('/next-step-gaps') ? { data: gaps, count: gaps.length }
      : u.includes('/api/projects') ? { data: projects } : { data: [] }
    return { ok: true, status: 200, json: async () => data } as Response
  }))
  return writes
}
function wrap(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider><MemoryRouter><div className="tk">{node}</div></MemoryRouter></UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}
const named = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement

describe('Waiting on', () => {
  it('No next step offers Waiting, which writes the shared status and nothing else', async () => {
    const writes = stub([{ ...ypsa, status: 'active' }], [{ id: 'proj_y', slug: 'asci-ypsa', title: 'ASCI YPSA Award', tier: 1, last_movement: null }])
    const host = await mount(wrap(<NoNextStepCard />), { ready: (h) => h.querySelector('[data-testid="no-next-step-proj_y"]'), label: 'gap row' })
    named(host, 'Waiting').click()
    await waitFor(() => writes.length > 0, 'the status write')
    expect(writes).toHaveLength(1)
    expect(writes[0].url).toContain('/api/projects/asci-ypsa')
    expect(writes[0].body).toMatchObject({ status: 'waiting_external' })
  })

  it('lists waiting projects with no date until one is set', async () => {
    stub([ypsa, { id: 'proj_a', slug: 'a', title: 'Active one', status: 'active' }])
    const host = await mount(wrap(<WaitingOnCard tasks={[]} />), { ready: (h) => h.querySelector('[data-testid="waiting-asci-ypsa"]'), label: 'waiting row' })
    expect(host.querySelector('[data-testid="waiting-count"]')?.textContent).toBe('1')
    expect(host.querySelector('[data-testid="waiting-asci-ypsa"]')?.textContent).toContain('Set check-in')
    expect(host.textContent).not.toContain('Active one')
  })

  it('shows the date of an open check-in on the project', async () => {
    stub([ypsa])
    const checkin = { id: 'task_c', kind: 'checkin', project_id: 'asci-ypsa', due_date: '2026-12-01', status: 'todo', completed: 0 } as unknown as TaskRow
    const host = await mount(wrap(<WaitingOnCard tasks={[checkin]} />), { ready: (h) => h.querySelector('[data-testid="waiting-asci-ypsa"]'), label: 'waiting row' })
    expect(host.querySelector('[data-testid="waiting-asci-ypsa"]')?.textContent).toContain('Check in 12/01')
  })

  it('Back to active writes the status and offers undo', async () => {
    const writes = stub([ypsa])
    const host = await mount(wrap(<WaitingOnCard tasks={[]} />), { ready: (h) => h.querySelector('[data-testid="waiting-done-asci-ypsa"]'), label: 'waiting row' })
    ;(host.querySelector('[data-testid="waiting-done-asci-ypsa"]') as HTMLButtonElement).click()
    await waitFor(() => writes.length > 0, 'the status write')
    expect(writes[0].body).toMatchObject({ status: 'active' })
    await waitFor(() => document.body.textContent?.includes('ASCI YPSA is active again'), 'the undo toast')
  })

  it('renders nothing when no project is waiting', async () => {
    stub([{ ...ypsa, status: 'active' }])
    const host = await mount(wrap(<WaitingOnCard tasks={[]} />), { ready: () => true, label: 'mounted' })
    await new Promise((r) => setTimeout(r, 150))
    expect(host.querySelector('[data-pick="waiting-on"]')).toBeNull()
  })
})

// #163: a failed background refetch must not replace Today with "Could not load
// Today". The Hub answered 503 (D1 overloaded) in bursts while Nick clicked; a
// refetch failure sets isError with the data still in hand, and the page threw
// that data away. Only a first load with nothing to show gets the error screen.

import '../index.css'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import TodayPage from '../pages/portal/TodayPage'
import { todayKey } from '../lib/taskGrouping'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const user = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}
const openTask = {
  id: 'task_1', title: 'Rate the proposals', short_title: null, description: '', assignee: 'nick-ingraham',
  due_date: todayKey(), priority: 'high', status: 'todo', completed: 0, completed_at: null, project_id: null, kind: 'task',
  acknowledged_at: '2026-01-01', created_at: '2026-11-01 15:00:00', updated_at: '2026-11-01 15:00:00',
}

function respond(status: number, body: unknown) {
  return { ok: status < 400, status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response
}

/** Tasks answer per `tasksStatus()`; everything else is an empty list. */
function stubFetch(tasksStatus: () => number) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    const u = String(url)
    if (u.includes('/api/tasks')) {
      const s = tasksStatus()
      return s < 400 ? respond(s, { data: [openTask], count: 1 }) : respond(s, { error: 'D1 DB is overloaded' })
    }
    if (u.includes('/api/projects')) return respond(200, { data: [], count: 0 })
    // Every other widget on Today has its own unavailable state.
    return respond(404, { error: 'not stubbed' })
  }))
}

function page(qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider>
          <MemoryRouter><TodayPage /></MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

describe('Today survives a failed refetch (#163)', () => {
  it('keeps the tasks on screen and says the refresh failed', async () => {
    let status = 200
    stubFetch(() => status)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const host = await mount(page(qc), { ready: (h) => (h.textContent ?? '').includes('Rate the proposals'), label: 'first load' })

    status = 503
    await qc.invalidateQueries({ queryKey: ['tasks'] })
    await waitFor(() => (host.textContent ?? '').includes('tasks unavailable'), 'refresh note')

    expect(host.textContent).not.toContain('Could not load Today')
    expect(host.textContent).toContain('Rate the proposals')
  })

  it('still shows the error screen when the first load fails with nothing to show', async () => {
    stubFetch(() => 503)
    const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } })
    const host = await mount(page(qc), { ready: (h) => (h.textContent ?? '').includes('Could not load Today'), label: 'error screen' })
    expect(host.textContent).toContain('Could not load Today')
  })
})

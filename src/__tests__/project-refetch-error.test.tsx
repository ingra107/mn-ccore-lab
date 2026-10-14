// A refetch that fails AFTER data loaded keeps the cached data (react-query 5).
// The project page must keep showing those tasks, not swap them for
// "tasks unavailable". The note is for a query that never loaded.
// Real Chromium; the real ProjectDetail against a stubbed fetch.
import { describe, it, expect, afterEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UndoToastProvider } from '../components/UndoToast'
import ProjectDetail from '../pages/ProjectDetail'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function stub(state: { tasksOk: boolean }) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (/\/api\/tasks\?/.test(url)) {
      return state.tasksOk
        ? json({ data: [{ id: 't1', title: 'Write the methods section', status: 'todo', completed: 0, project_id: 'p1', priority: 'medium' }], count: 1 })
        : json({ error: 'boom' }, 500)
    }
    if (url.endsWith('/api/projects')) return json({ data: [{ id: 'proj_1', slug: 'p1', title: 'Project One', status: 'active', category: 'MNCCORE', pi: 'nick-ingraham' }], count: 1 })
    return json({ data: [], count: 0 })
  }) as typeof fetch
}

describe('ProjectDetail tasks: refetch error vs load error', () => {
  it('keeps cached tasks on screen when a refetch fails; shows the note when the first load fails', async () => {
    const state = { tasksOk: true }
    stub(state)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const host = await mount(
      <QueryClientProvider client={qc}>
        <UndoToastProvider>
          <MemoryRouter initialEntries={['/portal/projects/p1']}>
            <Routes><Route path="/portal/projects/:slug" element={<ProjectDetail />} /></Routes>
          </MemoryRouter>
        </UndoToastProvider>
      </QueryClientProvider>,
      { ready: (h) => /Write the methods section/.test(h.textContent ?? ''), label: 'project page with its task' },
    )
    // Now the refetch fails.
    state.tasksOk = false
    await qc.refetchQueries({ queryKey: ['tasks'] })
    const key = ['tasks', { project: 'p1' }]
    await waitFor(() => qc.getQueryState(key)?.status === 'error' && qc.getQueryState(key)?.fetchStatus === 'idle', 'refetch failed')
    // react-query 5: the query is in error AND still holds its data.
    expect(qc.getQueryState(key)?.data).toBeDefined()
    await new Promise((r) => setTimeout(r, 150)) // let React commit the error state
    expect(host.textContent).toContain('Write the methods section')
    expect(host.textContent).not.toContain('tasks unavailable')
  })

  it('shows "tasks unavailable" when the first load fails', async () => {
    stub({ tasksOk: false })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await mount(
      <QueryClientProvider client={qc}>
        <UndoToastProvider>
          <MemoryRouter initialEntries={['/portal/projects/p1']}>
            <Routes><Route path="/portal/projects/:slug" element={<ProjectDetail />} /></Routes>
          </MemoryRouter>
        </UndoToastProvider>
      </QueryClientProvider>,
      { ready: (h) => /tasks unavailable/.test(h.textContent ?? ''), label: 'tasks unavailable note' },
    )
  })
})

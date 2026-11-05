// A link can name a task that is not on the viewer's own list (Meeting Prep, an
// assigner's notification). The real My Tasks page, from a member's seat, against
// a stubbed fetch; api/routes/tasks.open-by-id.test.ts runs the server half on the
// real worker. The page must open what the server gives it and say so plainly
// when the server gives it nothing.
//
// Run: npx vitest run --config vitest.config.ts src/__tests__/my-tasks-open-by-id.test.tsx

import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import MyTasks from '../pages/MyTasks'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const CASEY = {
  email: 'eddin022@umn.edu', slug: 'casey-eddington', isAuthenticated: true, isPi: false, isMember: true,
  canShowAllProjects: false, piResolved: true,
}

const row = (id: string, title: string, assignee: string, over: Record<string, unknown> = {}) => ({
  id, title, assignee, status: 'todo', priority: 'medium', completed: 0, description: '', project_id: null,
  due_date: null, created_at: '2026-11-01 00:00:00', watchers: null, ...over,
})
const MINE = row('task_mine', 'My own task', 'casey-eddington')
const NATES = row('task_nates', 'Overdue item of Nate', 'nate-mesfin')
const NATES_QUESTION = row('task_q', 'Question of Nate', 'nate-mesfin', { kind: 'question' })
const readable = [NATES, NATES_QUESTION]
const data = (rows: unknown[], status = 200) => new Response(JSON.stringify({ data: rows }), { status })

function stubFetch(failLookup = false, listDelayMs = 0) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input)
    urls.push(url)
    if (url.startsWith('/api/tasks?')) {
      const ids = new URL(url, 'https://x').searchParams.get('ids')
      if (ids === null) {
        await new Promise((r) => setTimeout(r, listDelayMs))
        return data([MINE])
      }
      if (failLookup) return data([], 500)
      // The server's read rule: a task the viewer cannot read is simply not returned.
      return data(readable.filter((t) => ids.split(',').includes(t.id)))
    }
    return data([])
  }))
  return urls
}

function Where() {
  const loc = useLocation()
  return <span data-testid="where">{loc.search}</span>
}

function mountAt(initial: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user: CASEY, isAuthenticated: true, isLoading: false } as never}>
        <MemoryRouter initialEntries={[initial]}>
          <UndoToastProvider><MyTasks /><Where /></UndoToastProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
    { ready: (h) => h.querySelector('input, button'), label: 'My Tasks' },
  )
}

const panel = () => document.querySelector<HTMLElement>('[data-testid="task-detail-panel"]')
const note = (h: ParentNode) => h.querySelector<HTMLElement>('[data-testid="task-open-miss"]')

describe('My Tasks: a link to a task off the list of the viewer', () => {
  it('control: a task on her own list opens, with no by-id lookup', async () => {
    const urls = stubFetch()
    await mountAt('/?open=task_mine')
    await waitFor(() => !!panel(), 'the panel')
    expect(panel()!.textContent).toContain('My own task')
    expect(urls.some((u) => u.includes('ids='))).toBe(false)
  })

  it('opens a task of another person that she may read, on ?open=', async () => {
    stubFetch()
    const h = await mountAt('/?open=task_nates')
    await waitFor(() => !!panel(), 'the panel')
    expect(panel()!.textContent).toContain('Overdue item of Nate')
    expect(note(h)).toBeNull()
  })

  it('opens on ?openTask= too, which the page must not strip before it reads it', async () => {
    // A list slower than the first state-to-URL sync, as on a real network.
    stubFetch(false, 200)
    await mountAt('/?openTask=task_nates')
    await waitFor(() => !!panel(), 'the panel')
    expect(panel()!.textContent).toContain('Overdue item of Nate')
  })

  it('opens a question of another person, which the plain by-id read leaves out', async () => {
    stubFetch()
    await mountAt('/?open=task_q')
    await waitFor(() => !!panel(), 'the panel')
    expect(panel()!.textContent).toContain('Question of Nate')
  })

  it('a task she cannot read opens nothing, says so, and the note can be dismissed', async () => {
    stubFetch()
    const h = await mountAt('/?open=task_hidden')
    await waitFor(() => !!note(h), 'the note')
    expect(note(h)!.textContent).toMatch(/can't be opened/)
    expect(panel()).toBeNull()
    await waitFor(() => !h.querySelector('[data-testid="where"]')!.textContent!.includes('open='), 'the link stripped')
    expect(h.textContent).toContain('My own task') // her list stays
    note(h)!.querySelector('button')!.click()
    await waitFor(() => !note(h), 'the note gone')
  })

  it('a failed lookup says it failed, not that the task cannot be opened', async () => {
    stubFetch(true)
    const h = await mountAt('/?open=task_nates')
    await waitFor(() => !!note(h), 'the note')
    expect(note(h)!.textContent).toMatch(/didn't load/)
    expect(panel()).toBeNull()
  })
})

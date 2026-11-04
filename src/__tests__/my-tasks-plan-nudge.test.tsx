// The Plan your week row on the real My Tasks page. The row means "the viewer's
// own full list holds no plan for this week", so a list that is someone else's,
// or that never loaded, must not raise it (Task 8 review, I1). The row is checked
// against a positive control, so "no row" cannot pass because the page never drew.
//
// Run: npx vitest run --config vitest.config.ts src/__tests__/my-tasks-plan-nudge.test.tsx

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import MyTasks from '../pages/MyTasks'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-03T15:00:00Z')) // a Tuesday: week of 2026-11-02
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const OWNER = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', name: 'Nick', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}

const planThisWeek = {
  id: 'task_plan', title: 'Plan your week', assignee: 'nick-ingraham', status: 'todo', source: 'week_plan', kind: 'question',
  completed: 0, created_at: '2026-11-02T14:00:00Z',
  question_spec_json: JSON.stringify({
    v: 1, kind: 'week_plan', week_start: '2026-11-02', tz: 'America/Chicago', prompt: 'p', expires_at: null,
    candidates: [{ task_id: 'task_a', title: 'A', why: '', evidence: [], options: [
      { key: 'a1', label: 'One', direction: 'd', deliverable_kind: 'gmail_draft', recommended: true },
      { key: 'a2', label: 'Two', direction: 'd', deliverable_kind: 'gmail_draft', recommended: false },
    ] }],
  }),
  question_answer_json: JSON.stringify({ v: 1, choice: 'save', via: 'hub', at: '2026-11-02T14:00:00Z', picks: [{ task_id: 'task_a', option_key: 'a1', text: null, start: false }] }),
  question_consumed_json: null,
}

/** `tasks(url)` answers the task list; everything else is an empty list. */
function stubFetch(tasks: (url: string) => Response) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input)
    urls.push(url)
    if (url.startsWith('/api/tasks?') || url === '/api/tasks') return tasks(url)
    return new Response(JSON.stringify({ data: [] }), { status: 200 })
  }))
  return urls
}
const rows = (data: unknown[]) => new Response(JSON.stringify({ data }), { status: 200 })

function mountAt(initial: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user: OWNER, isAuthenticated: true, isLoading: false } as never}>
        <MemoryRouter initialEntries={[initial]}>
          <UndoToastProvider><MyTasks /></UndoToastProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
    { ready: (h) => h.querySelector('input, button'), label: 'My Tasks' },
  )
}
const nudge = (h: ParentNode) => h.querySelector('[data-testid="q-week-plan"]')
const settle = () => new Promise((r) => setTimeout(r, 150))

describe('My Tasks: the Plan your week row', () => {
  it('control: the owner on his own list, with no plan this week, gets the row', async () => {
    const urls = stubFetch(() => rows([]))
    const host = await mountAt('/')
    await waitFor(() => !!nudge(host), 'the row')
    expect(urls.some((u) => u.includes('assignee=nick-ingraham'))).toBe(true)
  })

  it('control: his own list holding this week\'s plan shows no row', async () => {
    stubFetch(() => rows([planThisWeek]))
    const host = await mountAt('/')
    await settle()
    expect(nudge(host)).toBeNull()
  })

  it('a member\'s list holds none of his plan rows, so it raises no row, planned week or not', async () => {
    const urls = stubFetch((url) => rows(url.includes('assignee=nick-ingraham') ? [planThisWeek] : []))
    const host = await mountAt('/?assignee=casey-eddington')
    await waitFor(() => urls.some((u) => u.includes('assignee=casey-eddington')), 'the scoped read')
    await settle()
    expect(nudge(host)).toBeNull()
  })

  it('a failed task read is not "no plan": no row', async () => {
    const urls = stubFetch(() => new Response('{}', { status: 500 }))
    const host = await mountAt('/')
    await waitFor(() => urls.some((u) => u.includes('assignee=nick-ingraham')), 'the read')
    await settle()
    expect(nudge(host)).toBeNull()
  })
})

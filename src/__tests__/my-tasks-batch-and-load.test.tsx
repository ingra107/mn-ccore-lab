// My Tasks tells the truth about a batch that was partly refused (S04), about the
// single-row Delete (it says Delete, like the bulk bar, and acts the same), and
// about a task list that did not load (S08). The real page against a stubbed fetch.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import MyTasks from '../pages/MyTasks'
import { InlineDetail } from '../pages/MyTasks/components/InlineDetail'
import { bulkDeleteCopy } from '../pages/MyTasks/constants'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const CASEY = {
  email: 'eddin022@umn.edu', slug: 'casey-eddington', isAuthenticated: true, isPi: false, isMember: true,
  canShowAllProjects: false, piResolved: true,
}
const row = (id: string, title: string) => ({
  id, title, assignee: 'casey-eddington', status: 'todo', priority: 'medium', completed: 0, description: '', project_id: null,
  due_date: null, created_at: '2026-11-01 00:00:00', watchers: null,
})
const ROWS = [row('t1', 'First task'), row('t2', 'Second task'), row('t3', 'Third task')]
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Answer = (url: string, init?: RequestInit) => Response | undefined
function stubFetch(answer: Answer = () => undefined) {
  const calls: Array<{ url: string; method: string; body: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return answer(url, init) ?? (url.startsWith('/api/tasks?') ? json({ data: ROWS }) : json({ data: [] }))
  }))
  return calls
}

const tree = (node: React.ReactNode, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => (
  <QueryClientProvider client={qc}>
    <AuthContext.Provider value={{ user: CASEY, isAuthenticated: true, isLoading: false } as never}>
      <MemoryRouter initialEntries={['/portal/my-tasks']}>
        <UndoToastProvider>{node}</UndoToastProvider>
      </MemoryRouter>
    </AuthContext.Provider>
  </QueryClientProvider>
)

const titleEl = (title: string) => [...document.querySelectorAll<HTMLElement>('*')].find((e) => e.children.length === 0 && e.textContent?.trim() === title)
const pageText = () => document.body.textContent ?? ''

async function openWithAllSelected() {
  const host = await mount(tree(<MyTasks />), { ready: () => titleEl('First task'), label: 'the list' })
  for (const title of ['First task', 'Second task', 'Third task']) {
    titleEl(title)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))
  }
  await waitFor(() => /3 selected/.test(pageText()), 'three selected')
  return host
}
const bulkButton = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!

const refuseT2 = (url: string) => (url.endsWith('/api/tasks/batch')
  ? json({ data: { ok: false, count: 2, applied: ['t1', 't3'], failed: [{ id: 't2', reason: 'conflict — the task changed under you' }] } })
  : undefined)

describe('S04: a partly refused batch', () => {
  it('says how many landed and why the rest did not, and keeps the refused row selected', async () => {
    stubFetch(refuseT2)
    await openWithAllSelected()
    bulkButton('✓ Complete').click()
    await waitFor(() => /Completed 2 tasks/.test(pageText()) && /1 not changed/.test(pageText()), 'the honest toast')
    expect(pageText()).toContain('the task changed under you')
    expect(pageText()).not.toContain('Completed 3 tasks')
    await waitFor(() => /1 selected/.test(pageText()), 'the refused row stays selected')
  })

  it('a fully accepted batch still says the whole count and clears the selection', async () => {
    stubFetch((url) => (url.endsWith('/api/tasks/batch') ? json({ data: { ok: true, count: 3, applied: ['t1', 't2', 't3'], failed: [] } }) : undefined))
    await openWithAllSelected()
    bulkButton('✓ Complete').click()
    await waitFor(() => /Completed 3 tasks/.test(pageText()), 'the toast')
    await waitFor(() => !/selected/.test(pageText()), 'selection cleared')
  })

  it('a fully refused batch claims nothing and keeps every row selected', async () => {
    stubFetch((url) => (url.endsWith('/api/tasks/batch')
      ? json({ data: { ok: false, count: 0, applied: [], failed: ['t1', 't2', 't3'].map((id) => ({ id, reason: 'not allowed' })) } })
      : undefined))
    await openWithAllSelected()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    bulkButton('Delete').click()
    await waitFor(() => /3 tasks not changed/.test(pageText()), 'the refusal')
    expect(pageText()).not.toMatch(/Deleted \d/)
    expect(/3 selected/.test(pageText())).toBe(true)
  })
})

describe('the single-task Delete in the inline detail', () => {
  const task = ROWS[0] as unknown as TaskRow

  it('says Delete, not Archive, and sends what the bulk bar sends', async () => {
    const calls = stubFetch((url) => (url.endsWith('/api/tasks/batch') ? json({ data: { ok: true, count: 1, applied: ['t1'], failed: [] } }) : undefined))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const host = await mount(tree(<InlineDetail task={task} />), { ready: (h) => h.querySelector('button'), label: 'inline detail' })
    const names = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(names).toContain('Delete')
    expect(names).not.toContain('Archive')
    expect(host.textContent).not.toMatch(/archive/i)
    ;[...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Delete')!.click()
    expect(confirm).toHaveBeenCalledWith(bulkDeleteCopy(1).confirm)
    await waitFor(() => pageText().includes(bulkDeleteCopy(1).toast), 'the toast')
    expect(calls.find((c) => c.url.endsWith('/api/tasks/batch'))?.body).toEqual({ ids: ['t1'], action: 'delete' })
  })

  it('a refused delete does not say Deleted', async () => {
    stubFetch((url) => (url.endsWith('/api/tasks/batch') ? json({ data: { ok: false, count: 0, applied: [], failed: [{ id: 't1', reason: 'not allowed' }] } }) : undefined))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const host = await mount(tree(<InlineDetail task={task} />), { ready: (h) => h.querySelector('button'), label: 'inline detail' })
    ;[...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Delete')!.click()
    await waitFor(() => /not allowed/.test(pageText()), 'the refusal')
    expect(pageText()).not.toContain(bulkDeleteCopy(1).toast)
  })
})

describe('S08: a task list that did not load', () => {
  it('the first load fails: says so, offers Retry, shows no empty state and no zero count, and Retry loads', async () => {
    let up = false
    stubFetch((url) => (url.startsWith('/api/tasks?') && !up ? json({ error: 'boom' }, 500) : undefined))
    await mount(tree(<MyTasks />), { ready: () => /Could not load your tasks/.test(pageText()), label: 'the error' })
    expect(pageText()).not.toMatch(/caught up/i)
    expect(pageText()).not.toMatch(/no tasks match/i)
    expect(pageText()).not.toMatch(/0 visible/)
    up = true
    ;[...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry')!.click()
    await waitFor(() => !!titleEl('First task'), 'the list after Retry')
    expect(pageText()).not.toContain('Could not load your tasks')
  })

  it('a refetch fails with data in hand: the list stays, with a small note', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
    let fail = false
    stubFetch((url) => (url.startsWith('/api/tasks?') && fail ? json({ error: 'boom' }, 500) : undefined))
    await mount(tree(<MyTasks />, qc), { ready: () => titleEl('First task'), label: 'the list' })
    fail = true
    await qc.refetchQueries({ queryKey: ['tasks'] })
    await waitFor(() => /unavailable/.test(pageText()), 'the note')
    expect(titleEl('First task')).toBeTruthy()
    expect(pageText()).not.toContain('Could not load your tasks')
  })
})

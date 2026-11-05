// The task panel's fields say what they do (fable-audit-2: G01, G04, G11, G12,
// G15, G27, G31, improvement 10). Real Chromium; the real panel against a
// stubbed fetch that records every write.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import TaskDetailPanel, { OverviewQuickAdd } from '../components/tasks/TaskDetailPanel'
import { UndoToastProvider } from '../components/UndoToast'
import { activityQueryKey } from '../lib/askHermes'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const task = (over: Partial<TaskRow> = {}) => ({
  id: 'task_f1', title: 'Write the panel test', status: 'todo', priority: 'medium',
  assignee: 'nick-ingraham', completed: 0, description: '', project_id: null, due_date: null,
  created_at: '2026-11-01 00:00:00', watchers: null, ...over,
} as unknown as TaskRow)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function stubFetch(answer: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  const calls: Array<{ url: string; method: string; body: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return answer(url, init) ?? json({ data: [] })
  }))
  return calls
}

function tree(node: React.ReactNode, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UndoToastProvider>{node}</UndoToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const panelReady = { ready: () => document.querySelector('[data-testid="task-detail-panel"]'), label: 'panel' }
const panel = () => document.querySelector<HTMLElement>('[data-testid="task-detail-panel"]')!
const byText = (root: Element, tag: string, text: string | RegExp) =>
  [...root.querySelectorAll<HTMLElement>(tag)].filter((e) => (typeof text === 'string' ? e.textContent?.trim() === text : text.test(e.textContent ?? '')))
const until = async <T,>(get: () => T, label: string): Promise<NonNullable<T>> => {
  await waitFor(() => !!get(), label)
  return get() as NonNullable<T>
}

function typeInto(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('G04: the assignee menu offers only what the API accepts', () => {
  it('has no Unassigned option', async () => {
    stubFetch()
    await mount(tree(<TaskDetailPanel task={task()} onClose={() => {}} />), panelReady)
    panel().querySelector<HTMLElement>('button[aria-label^="Assignee:"]')!.click()
    await until(() => panel().querySelector('[role="listbox"][aria-label="Select assignee"]'), 'assignee menu')
    const options = [...panel().querySelectorAll('[role="listbox"][aria-label="Select assignee"] [role="option"]')]
    expect(options.length).toBeGreaterThan(0)
    expect(options.map((o) => o.textContent?.trim())).not.toContain('Unassigned')
  })
})

describe('G01: the watcher picker', () => {
  it('says what being added means and writes a JSON array', async () => {
    const calls = stubFetch()
    await mount(tree(<TaskDetailPanel task={task()} onClose={() => {}} />), panelReady)
    expect(panel().textContent).toMatch(/can see and edit this task, and is notified when it changes/i)
    byText(panel(), 'button', /^\+ Add/)[0].click()
    const casey = await until(() => byText(panel(), 'button', /Casey/)[0], 'people list')
    casey.click()
    const isWrite = (c: { url: string; method: string }) => c.method === 'POST' && /\/api\/tasks\/task_f1/.test(c.url)
    await until(() => calls.find(isWrite), 'the write')
    const watchers = (calls.find(isWrite)!.body as { watchers: string }).watchers
    expect(JSON.parse(watchers)).toEqual([expect.stringMatching(/casey/)])
  })

  it('removes a watcher', async () => {
    const calls = stubFetch()
    await mount(tree(<TaskDetailPanel task={task({ watchers: '["casey-eddington"]' })} onClose={() => {}} />), panelReady)
    panel().querySelector<HTMLElement>('[aria-label^="Remove watcher Casey"]')!.click()
    const isWrite = (c: { url: string; method: string }) => c.method === 'POST' && /\/api\/tasks\/task_f1/.test(c.url)
    await until(() => calls.find(isWrite), 'the write')
    expect((calls.find(isWrite)!.body as { watchers: unknown }).watchers).toBeNull()
  })

  it.each([['the JSON form', '["casey-eddington"]'], ['the old comma form', 'casey-eddington']])(
    'shows a chip from %s',
    async (_label, watchers) => {
      stubFetch()
      await mount(tree(<TaskDetailPanel task={task({ watchers })} onClose={() => {}} />), panelReady)
      expect(panel().querySelector('[aria-label^="Remove watcher Casey"]')).not.toBeNull()
    },
  )
})

describe('The Instructions field is gone', () => {
  it('renders no Instructions block, and a stored value does not bring it back', async () => {
    stubFetch()
    await mount(tree(<TaskDetailPanel task={task({ instructions: 'Old protocol text' })} onClose={() => {}} />), panelReady)
    expect(byText(panel(), 'label, div, span', /^Recurrence$/).length).toBeGreaterThan(0) // the Details tab drew
    expect(panel().textContent).not.toMatch(/Instructions/)
    expect(panel().textContent).not.toMatch(/Old protocol text/)
  })
})

describe('G11: the Reminder field is gone', () => {
  it('renders no Reminder control', async () => {
    stubFetch()
    await mount(tree(<TaskDetailPanel task={task()} onClose={() => {}} />), panelReady)
    expect(panel().textContent).not.toMatch(/Reminder/)
    expect(panel().querySelector('input[type="number"]')).toBeNull()
  })
})

describe('G12: one Files surface', () => {
  it('the Files tab is the only one, and the task_files link list is gone', async () => {
    const calls = stubFetch()
    await mount(tree(<TaskDetailPanel task={task()} onClose={() => {}} />), panelReady)
    expect(byText(panel(), 'button', 'Files')).toHaveLength(1)
    expect(panel().textContent).not.toMatch(/Add link\b/)
    await new Promise((r) => setTimeout(r, 50))
    expect(calls.some((c) => /\/api\/tasks\/[^/]+\/files/.test(c.url))).toBe(false)
  })
})

describe('G31: an untitled task', () => {
  it('starts its title editor empty, with the description only as a placeholder', async () => {
    const calls = stubFetch()
    const description = 'The whole long description of this task'
    await mount(tree(<TaskDetailPanel task={task({ title: '', description })} onClose={() => {}} />), panelReady)
    panel().querySelector<HTMLElement>('h3[aria-label="Edit title"]')!.click()
    const input = await until(() => panel().querySelector<HTMLInputElement>('#task-detail-title input'), 'title input')
    expect(input.value).toBe('')
    expect(input.placeholder).toContain(description)
    input.blur()
    await new Promise((r) => setTimeout(r, 50))
    expect(calls.filter((c) => c.method === 'POST' && (c.body as { title?: string })?.title !== undefined)).toEqual([])
  })
})

describe('G27: panel text stays above the opacity floor', () => {
  it('the created line reads at full opacity and 11px', async () => {
    stubFetch()
    await mount(tree(<TaskDetailPanel task={task()} onClose={() => {}} />), panelReady)
    const line = byText(panel(), 'span', /^Created /)[0].parentElement!
    expect(getComputedStyle(line).opacity).toBe('1')
    expect(getComputedStyle(line).fontSize).toBe('11px')
  })

  it('"See all" reads at full opacity and 11px', async () => {
    stubFetch()
    const host = await mount(tree(<OverviewQuickAdd taskId="task_f1" onJumpToTab={() => {}} />), { ready: (h) => h.querySelector('textarea'), label: 'composer' })
    typeInto(host.querySelector('textarea')!, 'x')
    const seeAll = await until(() => byText(host, 'button', /See all/)[0], 'see all')
    expect(getComputedStyle(seeAll).opacity).toBe('1')
    expect(getComputedStyle(seeAll).fontSize).toBe('11px')
  })
})

describe('S05: the panel shows the newest cached copy of its task', () => {
  it('an older copy in an earlier list does not replace the newer one', async () => {
    stubFetch()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(['tasks', { assignee: 'old-list' }], [task({ title: 'The old title', updated_at: '2026-11-01 08:00:00' })])
    qc.setQueryData(['tasks', { assignee: 'new-list' }], [task({ title: 'The new title', updated_at: '2026-11-02 08:00:00' })])
    await mount(tree(<TaskDetailPanel task={task({ title: 'The new title', updated_at: '2026-11-02 08:00:00' })} onClose={() => {}} />, qc), panelReady)
    await new Promise((r) => setTimeout(r, 50))
    expect(panel().querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input')?.value + panel().textContent).toContain('The new title')
    expect(panel().querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input')?.value + panel().textContent).not.toContain('The old title')
  })
})

describe('G15: a task comment that fails says so', () => {
  it('keeps the text and raises the failed-write toast', async () => {
    stubFetch((url, init) => (init?.method === 'POST' && /\/comments$/.test(url) ? json({ error: 'You cannot comment here' }, 403) : undefined))
    const host = await mount(tree(<OverviewQuickAdd taskId="task_f1" onJumpToTab={() => {}} />), { ready: (h) => h.querySelector('textarea'), label: 'composer' })
    typeInto(host.querySelector('textarea')!, 'A comment that will fail')
    await until(() => host.querySelector('button[type="submit"]'), 'post button')
    host.querySelector('form')!.requestSubmit()
    await waitFor(() => /You cannot comment here/.test(document.body.textContent ?? ''), 'the failure toast')
    expect(host.querySelector('textarea')!.value).toBe('A comment that will fail')
  })

  it('a comment that lands clears the box and says Comment posted', async () => {
    const calls = stubFetch()
    const host = await mount(tree(<OverviewQuickAdd taskId="task_f1" onJumpToTab={() => {}} />), { ready: (h) => h.querySelector('textarea'), label: 'composer' })
    typeInto(host.querySelector('textarea')!, 'A comment')
    await until(() => host.querySelector('button[type="submit"]'), 'post button')
    host.querySelector('form')!.requestSubmit()
    await waitFor(() => /Comment posted/.test(document.body.textContent ?? ''), 'the success toast')
    expect(host.querySelector('textarea')!.value).toBe('')
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ content: 'A comment' })
  })
})

describe('Improvement 10: Delete says what goes with it', () => {
  it('names the comments and notes the delete removes', async () => {
    stubFetch()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } })
    qc.setQueryData([...activityQueryKey('task', 'task_f1'), false], {
      hiddenCount: 0,
      entries: [
        { id: 'a', kind: 'comment', reply_count: 1 },
        { id: 'b', kind: 'comment', reply_count: 0 },
        { id: 'c', kind: 'update', reply_count: 0 },
        { id: 'd', kind: 'system', reply_count: 0 },
      ],
    })
    await mount(tree(<TaskDetailPanel task={task()} onClose={() => {}} />, qc), panelReady)
    panel().querySelector<HTMLElement>('button[aria-label="Delete task"]')!.click()
    await waitFor(() => /Deleted "Write the panel test" with 3 comments and 1 note/.test(document.body.textContent ?? ''), 'the delete toast')
  })

  it('stays plain when nothing goes with it', async () => {
    stubFetch()
    await mount(tree(<TaskDetailPanel task={task()} onClose={() => {}} />), panelReady)
    panel().querySelector<HTMLElement>('button[aria-label="Delete task"]')!.click()
    await waitFor(() => /Deleted "Write the panel test"/.test(document.body.textContent ?? ''), 'the delete toast')
    expect(document.body.textContent).not.toMatch(/Deleted "Write the panel test" with/)
  })
})

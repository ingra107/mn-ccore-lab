// The project page's Tasks tab and rail (fable-audit-2: G05, G08, G13, G14, G15,
// G18, G25, improvements 4 and 13). Real Chromium; the real ProjectDetail
// against a stubbed fetch that records every write.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UndoToastProvider } from '../components/UndoToast'
import ProjectDetail from '../pages/ProjectDetail'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks() })

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const TASKS = [
  { id: 't1', title: 'Write the methods section', status: 'todo', completed: 0, project_id: 'p1', priority: 'medium', assignee: 'nick-ingraham', due_date: '2026-12-01' },
  { id: 't2', title: 'Finished the abstract', status: 'done', completed: 1, project_id: 'p1', priority: 'medium', assignee: 'nick-ingraham', due_date: null },
]
const PROJECT = { id: 'proj_1', slug: 'p1', title: 'Project One', status: 'active', category: 'MNCCORE', pi: 'nick-ingraham', description: 'Old words', short_name: 'P One' }

type Write = { url: string; body: Record<string, unknown> }

function stub(refuse?: RegExp) {
  const writes: Write[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') {
      writes.push({ url, body: init.body ? JSON.parse(String(init.body)) : {} })
      if (refuse?.test(url)) return json({ error: 'The Hub refused this' }, 403)
      return json({ data: { id: 'x' } })
    }
    if (/\/api\/tasks\?/.test(url)) return json({ data: TASKS, count: TASKS.length })
    if (url.endsWith('/api/projects')) return json({ data: [PROJECT], count: 1 })
    return json({ data: [], count: 0 })
  }) as typeof fetch
  return writes
}

async function page(writes: Write[], tab = 'tasks') {
  void writes
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(
    <QueryClientProvider client={qc}>
      <UndoToastProvider>
        <MemoryRouter initialEntries={[`/portal/projects/p1?tab=${tab}`]}>
          <Routes><Route path="/portal/projects/:slug" element={<ProjectDetail />} /></Routes>
        </MemoryRouter>
      </UndoToastProvider>
    </QueryClientProvider>,
    {
      ready: (h) => (tab === 'tasks' ? h.querySelector('[data-testid="task-row-t1"]') : /Project One/.test(h.textContent ?? '')),
      label: 'project page',
    },
  )
}

const until = async <T,>(get: () => T, label: string): Promise<NonNullable<T>> => {
  await waitFor(() => !!get(), label)
  return get() as NonNullable<T>
}
const row = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`[data-testid="task-row-${id}"]`)!
const bodyText = () => document.body.textContent ?? ''

function typeInto(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('G05 + G25: one undo toast, in words', () => {
  it('the circle fires one toast, with no raw status beside it', async () => {
    const writes = stub()
    const host = await page(writes)
    row(host, 't1').querySelector<HTMLElement>('.task-row-checkbox')!.click()
    await waitFor(() => /Completed task/.test(bodyText()), 'the toast')
    await new Promise((r) => setTimeout(r, 50))
    expect(bodyText()).not.toMatch(/Status → done/)
  })

  it('the context menu status keeps an undo, with the label rather than the enum', async () => {
    stub()
    const host = await page([])
    row(host, 't1').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }))
    const menu = await until(() => [...document.body.querySelectorAll<HTMLElement>('div')].find((d) => d.style.animation.includes('contextMenuIn')), 'the menu')
    const status = [...menu.querySelectorAll<HTMLElement>('button, div')].find((e) => e.textContent?.trim().startsWith('Status'))!
    status.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    const blocked = await until(() => [...menu.querySelectorAll<HTMLElement>('button')].find((e) => e.textContent?.trim() === 'Blocked'), 'blocked item')
    blocked.click()
    await waitFor(() => /Status → Blocked/.test(bodyText()), 'the labelled toast')
    expect(bodyText()).not.toMatch(/Status → blocked/)
  })
})

describe('G08 + G14: retired row controls', () => {
  it('a row has no subtask chevron and no Archive button', async () => {
    stub()
    const host = await page([])
    const r = row(host, 't1')
    expect(r.querySelector('[aria-label*="subtasks"]')).toBeNull()
    expect(r.querySelector('[aria-label="Archive task"]')).toBeNull()
  })

  it('the context menu offers no Archive', async () => {
    stub()
    const host = await page([])
    row(host, 't1').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }))
    await until(() => [...document.body.querySelectorAll<HTMLElement>('button, [role="menuitem"], div')].find((e) => e.textContent?.trim() === 'Status'), 'the menu')
    expect([...document.body.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].map((e) => e.textContent?.trim())).not.toContain('Archive')
  })
})

describe('G18: a done row', () => {
  it('is not dimmed as a whole: strikethrough and the muted token carry the state', async () => {
    stub()
    const host = await page([])
    ;[...host.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim().startsWith('All'))!.click()
    const done = await until(() => row(host, 't2'), 'the done row')
    expect(getComputedStyle(done).opacity).toBe('1')
    const title = host.querySelector<HTMLElement>('[data-testid="task-title-t2"]')!
    expect(getComputedStyle(title).textDecorationLine).toBe('line-through')
    expect(title.style.color).toBe('var(--muted)')
  })
})

describe('G15: the grid quick comment', () => {
  async function openComment(host: HTMLElement) {
    row(host, 't1').querySelector<HTMLElement>('[aria-label="Add quick comment"]')!.click()
    const input = await until(() => row(host, 't1').querySelector<HTMLInputElement>('input[placeholder="Add a quick note..."]'), 'comment input')
    typeInto(input, 'My note')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }

  it('a failure says so and restores the draft', async () => {
    stub(/\/comments$/)
    const host = await page([])
    await openComment(host)
    await waitFor(() => /The Hub refused this/.test(bodyText()), 'the failure toast')
    const input = await until(() => row(host, 't1').querySelector<HTMLInputElement>('input[placeholder="Add a quick note..."]'), 'restored input')
    expect(input.value).toBe('My note')
  })

  it('a success says Comment added, with no Undo that does nothing', async () => {
    const writes = stub()
    const host = await page(writes)
    await openComment(host)
    await waitFor(() => /Comment added/.test(bodyText()), 'the toast')
    expect(writes.find((w) => /\/comments$/.test(w.url))?.body).toEqual({ content: 'My note' })
    const toast = [...document.body.querySelectorAll<HTMLElement>('div')].filter((d) => /^Comment added/.test(d.textContent ?? '')).pop()!
    expect(toast.textContent).not.toMatch(/Undo/)
  })
})

describe('Improvement 4: Copy copies the filter on screen and says how many', () => {
  it.each([
    ['Done', 'Copied 1 completed task', '- [x] Finished the abstract'],
    ['Active', 'Copied 1 open task', '- [ ] Write the methods section (due 2026-12-01)'],
    ['All', 'Copied 2 tasks', '- [ ] Write the methods section (due 2026-12-01)\n- [x] Finished the abstract'],
  ])('%s', async (filter, toast, text) => {
    stub()
    const written = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(written)
    const host = await page([])
    const chip = [...host.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim().startsWith(filter))!
    chip.click()
    await new Promise((r) => setTimeout(r, 20))
    host.querySelector<HTMLElement>('button[aria-label="Copy task list to clipboard"]')!.click()
    await waitFor(() => bodyText().includes(toast), 'the count toast')
    expect(written).toHaveBeenCalledWith(text)
  })
})

describe('G15 + improvement 13: the project rail composer', () => {
  async function compose(host: HTMLElement, text: string) {
    const box = await until(() => host.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Post a note"]'), 'composer')
    typeInto(box, text)
    await new Promise((r) => setTimeout(r, 20))
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    return box
  }

  it('a note that lands says so and clears the box', async () => {
    const writes = stub()
    const host = await page(writes, 'overview')
    const box = await compose(host, 'A project note')
    await waitFor(() => /Note added/.test(bodyText()), 'the toast')
    expect(writes.find((w) => /\/updates$/.test(w.url))?.body).toMatchObject({ content: 'A project note', update_type: 'progress' })
    await waitFor(() => box.value === '', 'box cleared')
  })

  it('a refused note says why and keeps the text', async () => {
    stub(/\/updates$/)
    const host = await page([], 'overview')
    const box = await compose(host, 'A note that fails')
    await waitFor(() => /The Hub refused this/.test(bodyText()), 'the failure toast')
    expect(box.value).toBe('A note that fails')
  })

  it('hints the key the team actually has', async () => {
    stub()
    const host = await page([], 'overview')
    const box = await until(() => host.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Post a note"]'), 'composer')
    expect(box.placeholder).toMatch(/Ctrl\+Enter/)
  })
})

describe('G13: project text can be cleared', () => {
  it('emptying the description sends null, which the route accepts', async () => {
    const writes = stub()
    const host = await page(writes, 'overview')
    const text = await until(() => host.querySelector<HTMLElement>('[data-desc-text]'), 'description')
    text.click()
    const box = await until(() => host.querySelector<HTMLTextAreaElement>('textarea[rows="3"]'), 'description editor')
    typeInto(box, '')
    await new Promise((r) => setTimeout(r, 20))
    box.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await until(() => writes.find((w) => /\/api\/projects\/p1$/.test(w.url)), 'the write')
    expect(writes.find((w) => /\/api\/projects\/p1$/.test(w.url))!.body).toEqual({ description: null })
  })

  it('emptying the short name sends null', async () => {
    const writes = stub()
    const host = await page(writes, 'overview')
    const short = await until(() => host.querySelector<HTMLElement>('[title="Edit short name"]'), 'short name')
    short.click()
    const box = await until(() => host.querySelector<HTMLInputElement>('input[placeholder="Add short name..."]'), 'short name editor')
    typeInto(box, '')
    await new Promise((r) => setTimeout(r, 20))
    box.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await until(() => writes.find((w) => /\/api\/projects\/p1$/.test(w.url)), 'the write')
    expect(writes.find((w) => /\/api\/projects\/p1$/.test(w.url))!.body).toEqual({ short_name: null })
  })
})

// The Decision Log (cold audit 2, 2026-11-05):
//   G24    a filter with no matches says so and offers Clear
//   G30    Recorded or Revisited with no outcome asks for one first
//   imp 7  a Timeline card opens the detail in place
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UndoToastProvider } from '../../components/UndoToast'
import DecisionsPage from './DecisionsPage'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const decision = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Decision ${id}`, rationale: `Why ${id}`, context: null, project_slug: null, meeting_id: null, decided_by: 'nate-mesfin',
  outcome: null, outcome_date: null, outcome_status: 'pending', outcome_sentiment: null, tags: null, linked_projects: null, created_at: '2026-10-06 10:00:00', ...extra,
})

let mounted: { host: HTMLElement; root: Root }[] = []
let decisions: ReturnType<typeof decision>[] = []
let posts: { url: string; body: Record<string, unknown> }[] = []

beforeEach(() => {
  decisions = [decision('a')]
  posts = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}'))
      posts.push({ url, body })
      return json({ data: { id: 'x' } })
    }
    if (url.startsWith('/api/decisions/review') || url.startsWith('/api/decisions/tags')) return json({ data: [] })
    if (url.includes('/similar')) return json({ data: [] })
    if (url.startsWith('/api/decisions')) return json({ data: decisions })
    return json({ data: [] })
  }))
})

afterEach(() => {
  mounted.forEach(({ host, root }) => { act(() => root.unmount()); host.remove() })
  mounted = []
  vi.unstubAllGlobals()
})

async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <UndoToastProvider>
          <MemoryRouter><DecisionsPage /></MemoryRouter>
        </UndoToastProvider>
      </QueryClientProvider>,
    )
  })
  mounted.push({ host, root })
  return host
}

const buttonNamed = (h: HTMLElement, name: string | RegExp) =>
  [...h.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? ''))) as HTMLButtonElement | undefined

const type = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// The row's Outcome cell: open the menu, pick the option.
const pickOutcome = async (h: HTMLElement, label: string) => {
  const trigger = [...h.querySelectorAll<HTMLElement>('.tk-pill')].map((p) => p.closest('button') as HTMLButtonElement).find(Boolean)!
  await act(async () => { trigger.click() })
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((el) => el.textContent?.trim() === label)!
  await act(async () => { option.click() })
}

describe('DecisionsPage empty states', () => {
  it('with no decisions at all: the first-decision invitation', async () => {
    decisions = []
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('No decisions logged yet')
    expect(buttonNamed(h, 'Clear filters')).toBeUndefined()
  })

  it('a search with no matches says so, and Clear brings the list back', async () => {
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('Decision a')
    await type(h.querySelector<HTMLInputElement>('input[placeholder="Search decisions..."]')!, 'zzz')
    expect(h.textContent).not.toContain('No decisions logged yet')
    expect(h.textContent).toContain('No decisions match')
    await act(async () => { buttonNamed(h, 'Clear filters')!.click() })
    expect(h.textContent).toContain('Decision a')
    expect(h.querySelector<HTMLInputElement>('input[placeholder="Search decisions..."]')!.value).toBe('')
  })
})

describe('DecisionsPage outcome select', () => {
  it('Recorded with no outcome opens the outcome field and writes nothing yet', async () => {
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('Decision a')
    await pickOutcome(h, 'Recorded')
    expect(posts).toHaveLength(0)
    await expect.poll(() => h.querySelector('textarea[placeholder="Describe the outcome..."]')).not.toBeNull()
    const box = h.querySelector<HTMLTextAreaElement>('textarea[placeholder="Describe the outcome..."]')!
    await type(box, 'It worked')
    await act(async () => { buttonNamed(h, 'Save Outcome')!.click() })
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0].url).toBe('/api/decisions/a/outcome')
    expect(posts[0].body).toMatchObject({ outcome: 'It worked', outcome_status: 'recorded' })
  })

  it('a decision that has an outcome changes status at once and keeps its outcome', async () => {
    decisions = [decision('b', { outcome: 'Went fine', outcome_status: 'recorded' })]
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('Decision b')
    await pickOutcome(h, 'Revisited')
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0].body).toMatchObject({ outcome: 'Went fine', outcome_status: 'revisited' })
  })
})

describe('DecisionsPage timeline', () => {
  it('a card opens its detail in place, once, and closes again', async () => {
    decisions = [decision('c', { outcome: 'Went fine', outcome_status: 'recorded' })]
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('Decision c')
    await act(async () => { buttonNamed(h, 'Timeline')!.click() })
    await expect.poll(() => buttonNamed(h, 'Decision c')).toBeTruthy()
    expect(h.textContent).not.toContain('Why c')
    const title = buttonNamed(h, 'Decision c')!
    expect(title.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { title.click() })
    expect(buttonNamed(h, 'Decision c')!.getAttribute('aria-expanded')).toBe('true')
    await expect.poll(() => h.textContent).toContain('Why c')
    // Principle 2: the outcome reads once, not on the card and again in the detail.
    expect(h.textContent!.match(/Went fine/g)).toHaveLength(1)
    await act(async () => { buttonNamed(h, 'Decision c')!.click() })
    await expect.poll(() => h.textContent).not.toContain('Why c')
  })
})

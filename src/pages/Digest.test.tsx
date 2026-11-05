// Digest "Copy reading list" (cold audit 2, 2026-11-05):
//   G23    a copy says it happened, with how many
//   imp 9  with a filter on, it copies the papers on screen and says so
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import Digest from './Digest'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const USER: AuthUser = {
  email: 'dan-shyu@umn.edu', slug: 'dan-shyu', isAuthenticated: true, isPi: false, isMember: true, canShowAllProjects: false, piResolved: true,
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const paper = (id: string, status: string, topics: string[]) => ({
  id, title: `Paper ${id}`, authors: 'Smith J', journal: 'Chest', pub_date: '2026-01-01', doi: null, status, topics: JSON.stringify(topics),
  summary: null, significance: null, abstract: null, digest_date: '2026-10-06', relevant_members: [], url: null,
})

let mounted: { host: HTMLElement; root: Root }[] = []
let writes: string[] = []
const SAVED = [paper('s1', 'saved', ['sepsis']), paper('s2', 'saved', ['ards'])]
const DATED = [paper('d1', 'new', ['sepsis']), paper('d2', 'new', ['ards']), paper('d3', 'new', ['sepsis'])]

beforeEach(() => {
  writes = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/digest/dates')) return json({ data: [{ date: '2026-10-06', count: 3 }] })
    if (url.startsWith('/api/digest')) {
      const q = new URL(url, 'https://x').searchParams
      if (q.get('status') === 'saved') return json({ data: q.get('offset') && q.get('offset') !== '0' ? [] : SAVED })
      if (q.get('status')) return json({ data: [], count: 0 })
      const topic = q.get('topic')
      return json({ data: topic ? DATED.filter((p) => p.topics.includes(topic)) : DATED, count: 3 })
    }
    return json({ data: [] })
  }))
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t: string) => { writes.push(t) } },
  })
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
        <AuthContext.Provider value={{ user: USER, isAuthenticated: true, isLoading: false }}>
          <UndoToastProvider>
            <MemoryRouter><Digest /></MemoryRouter>
          </UndoToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  mounted.push({ host, root })
  return host
}

const buttonNamed = (h: ParentNode, name: string | RegExp) =>
  [...h.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? ''))) as HTMLButtonElement | undefined

describe('Digest copy', () => {
  it('with no filter it copies every saved paper and says how many', async () => {
    const h = await mount()
    await expect.poll(() => buttonNamed(h, 'Copy reading list')).toBeTruthy()
    await act(async () => { buttonNamed(h, 'Copy reading list')!.click() })
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]).toContain('Paper s1')
    expect(writes[0]).toContain('Paper s2')
    expect(writes[0]).not.toContain('Paper d1')
    await expect.poll(() => document.body.textContent).toContain('Copied 2 papers')
  })

  it('with a topic on, the button copies the papers on screen and says so', async () => {
    const h = await mount()
    await expect.poll(() => buttonNamed(h, /^Topics/)).toBeTruthy()
    await act(async () => { buttonNamed(h, /^Topics/)!.click() })
    await expect.poll(() => buttonNamed(h, /^sepsis/)).toBeTruthy()
    await act(async () => { buttonNamed(h, /^sepsis/)!.click() })
    await expect.poll(() => buttonNamed(h, 'Copy these 2')).toBeTruthy()
    await act(async () => { buttonNamed(h, 'Copy these 2')!.click() })
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]).toContain('Paper d1')
    expect(writes[0]).toContain('Paper d3')
    expect(writes[0]).not.toContain('Paper d2')
    expect(writes[0]).not.toContain('Paper s1')
    await expect.poll(() => document.body.textContent).toContain('Copied 2 papers')
  })

  it('a clipboard refusal says so', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied') } } })
    const h = await mount()
    await expect.poll(() => buttonNamed(h, 'Copy reading list')).toBeTruthy()
    await act(async () => { buttonNamed(h, 'Copy reading list')!.click() })
    await expect.poll(() => document.body.textContent).toContain('Could not copy')
    expect(document.body.textContent).not.toContain('Copied 2 papers')
  })
})

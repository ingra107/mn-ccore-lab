// Ideas (cold audit 2, 2026-11-05):
//   G06  a status filter with no matches keeps its controls and offers Clear
//   G22  promoting archives the idea only once the project exists
//   G25  the undo toast says a label, not a stored value
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../../hooks/useAuth'
import { UndoToastProvider } from '../../components/UndoToast'
import IdeasPage from './IdeasPage'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const USER: AuthUser = {
  email: 'dan-shyu@umn.edu', slug: 'dan-shyu', isAuthenticated: true, isPi: false, isMember: true, canShowAllProjects: false, piResolved: true,
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const idea = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Idea ${id}`, description: null, submitted_by: 'dan-shyu', status: 'new', votes: 0, research_area: null, created_at: '2026-10-06 10:00:00', ...extra,
})

let mounted: { host: HTMLElement; root: Root }[] = []
let ideas: ReturnType<typeof idea>[] = []
let posts: { url: string; body: Record<string, unknown> }[] = []
let projectStatus = 201

beforeEach(() => {
  ideas = [idea('a')]
  posts = []
  projectStatus = 201
  window.localStorage.setItem('ideas-view', 'kanban')
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      posts.push({ url, body: JSON.parse(String(init.body ?? '{}')) })
      if (url === '/api/projects') return projectStatus === 201 ? json({ data: { slug: 'made' } }, 201) : json({ error: 'That slug is taken' }, projectStatus)
      return json({ data: { id: 'x' } })
    }
    if (url.startsWith('/api/ideas')) {
      const status = new URL(url, 'https://x').searchParams.get('status')
      return json({ data: status ? ideas.filter((i) => i.status === status) : ideas })
    }
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
        <AuthContext.Provider value={{ user: USER, isAuthenticated: true, isLoading: false }}>
          <UndoToastProvider>
            <MemoryRouter><IdeasPage /></MemoryRouter>
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

const pick = async (trigger: HTMLElement, label: string) => {
  await act(async () => { trigger.click() })
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim() === label)!
  await act(async () => { option.click() })
}

describe('IdeasPage', () => {
  it('a status filter with no matches keeps the controls, says so, and Clear goes back', async () => {
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('Idea a')
    await pick(buttonNamed(h, /All Statuses/)!, 'Parked')
    await expect.poll(() => h.textContent).toContain('No parked ideas')
    expect(h.textContent).not.toContain('The board is open')
    expect(buttonNamed(h, 'Board')).toBeTruthy()
    expect(buttonNamed(h, /Parked/)).toBeTruthy()
    await act(async () => { buttonNamed(h, 'Clear filter')!.click() })
    await expect.poll(() => h.textContent).toContain('Idea a')
  })

  it('an empty board with no filter still invites the first idea', async () => {
    ideas = []
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('The board is open')
  })

  it('a refused project create leaves the idea as it was', async () => {
    ideas = [idea('p', { status: 'approved' })]
    projectStatus = 409
    const h = await mount()
    await expect.poll(() => buttonNamed(h, 'Promote to project')).toBeTruthy()
    await act(async () => { buttonNamed(h, 'Promote to project')!.click() })
    await expect.poll(() => buttonNamed(document.body, 'Create Project')?.disabled).toBe(false)
    await act(async () => { buttonNamed(document.body, 'Create Project')!.click() })
    await expect.poll(() => posts.filter((p) => p.url === '/api/projects').length).toBe(1)
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    expect(posts.filter((p) => p.url.startsWith('/api/ideas'))).toHaveLength(0)
  })

  it('a project that lands archives the idea with the note', async () => {
    ideas = [idea('p', { status: 'approved' })]
    const h = await mount()
    await expect.poll(() => buttonNamed(h, 'Promote to project')).toBeTruthy()
    await act(async () => { buttonNamed(h, 'Promote to project')!.click() })
    await expect.poll(() => buttonNamed(document.body, 'Create Project')?.disabled).toBe(false)
    await act(async () => { buttonNamed(document.body, 'Create Project')!.click() })
    await expect.poll(() => posts.find((p) => p.url.startsWith('/api/ideas'))?.body.status).toBe('archived')
    expect(posts.find((p) => p.url.startsWith('/api/ideas'))!.body.description).toContain('Promoted to project "Idea p"')
  })

  it('moving an idea says the status in words', async () => {
    const h = await mount()
    await expect.poll(() => h.querySelector('button[aria-label^="Move idea"]')).not.toBeNull()
    await pick(h.querySelector<HTMLElement>('button[aria-label^="Move idea"]')!, 'Under review')
    await expect.poll(() => document.body.textContent).toContain('Moved to Under review')
    expect(document.body.textContent).not.toContain('Idea →')
  })
})

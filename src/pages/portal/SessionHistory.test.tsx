// Session History (cold audit 2, 2026-11-05):
//   G07    the install guide is for an empty table, not an empty filter
//   imp 6  a row links to its project when the name matches one
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../../hooks/useAuth'
import SessionHistory from './SessionHistory'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PI: AuthUser = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true, canShowAllProjects: true, piResolved: true,
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const session = (id: string, extra: Record<string, unknown> = {}) => ({
  id, started_at: '2026-10-06T10:00:00Z', ended_at: null, machine: 'WORK', project_name: 'Alpha project', project_short_name: 'Alpha', project_slug: 'alpha',
  summary: `Summary ${id}`, actions_count: 0, commits_count: 0, duration_minutes: 10, created_at: '2026-10-06 10:00:00', ...extra,
})

let mounted: { host: HTMLElement; root: Root }[] = []
let sessions: ReturnType<typeof session>[] = []
let failSessions = false

beforeEach(() => {
  sessions = [session('a')]
  failSessions = false
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/pb/sessions/stats')) {
      return json({ data: { total_sessions: sessions.length, total_hours: 1, avg_minutes: 10, sessions_this_week: 0, total_actions: 0, total_commits: 0, per_project: [{ project_name: 'Alpha project', project_short_name: 'Alpha', count: 1, total_minutes: 10 }], per_day: [] } })
    }
    if (url.startsWith('/api/pb/sessions')) {
      if (failSessions) return json({ error: 'boom' }, 500)
      const since = new URL(url, 'https://x').searchParams.get('since')
      return json({ data: since ? [] : sessions })
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
        <AuthContext.Provider value={{ user: PI, isAuthenticated: true, isLoading: false }}>
          <MemoryRouter><SessionHistory /></MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  mounted.push({ host, root })
  return host
}

const buttonNamed = (h: ParentNode, name: string) => [...h.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined
const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('SessionHistory empty states', () => {
  it('no sessions at all: the install guide', async () => {
    sessions = []
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('Set up SessionEnd hook')
  })

  it('a date range with no sessions: no install guide, and Clear goes back', async () => {
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('Summary a')
    await act(async () => { buttonNamed(h, '7d')!.click() })
    await expect.poll(() => h.textContent).toContain('No sessions match')
    expect(h.textContent).not.toContain('SessionEnd')
    await act(async () => { buttonNamed(h, 'Clear filters')!.click() })
    await expect.poll(() => h.textContent).toContain('Summary a')
  })

  it('a search with no matches says so instead of a bare header', async () => {
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('Summary a')
    await type(h.querySelector<HTMLInputElement>('input[placeholder="Search summaries..."]')!, 'zzz')
    expect(h.textContent).toContain('No sessions match')
    await act(async () => { buttonNamed(h, 'Clear filters')!.click() })
    expect(h.textContent).toContain('Summary a')
  })

  it('a failed read is not an empty table', async () => {
    failSessions = true
    const h = await mount()
    await expect.poll(() => buttonNamed(h, 'Retry') ?? [...h.querySelectorAll('button')].find((b) => /retry/i.test(b.textContent ?? ''))).toBeTruthy()
    expect(h.textContent).not.toContain('SessionEnd')
  })
})

describe('SessionHistory project links', () => {
  it('a row whose name matches a project links there; a name with no project stays text', async () => {
    sessions = [session('a'), session('b', { project_name: 'Telegram', project_short_name: null, project_slug: null })]
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('Summary b')
    const link = [...h.querySelectorAll('a')].find((a) => a.textContent?.includes('Alpha'))!
    expect(link.getAttribute('href')).toBe('/portal/projects/alpha')
    expect([...h.querySelectorAll('a')].some((a) => a.textContent?.includes('Telegram'))).toBe(false)
    expect(h.textContent).toContain('Telegram')
  })
})

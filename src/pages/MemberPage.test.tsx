// The team member page (overnight audit 2026-10-14):
//   G11-1  removing an expertise tag must not also open the Team filter
//   G11-9  expertise edit controls only for the member themselves or a PI
//   G11-11 a signed-out visitor sends no /api/commitments request
//   handoff: a signed-in member sees the LIVE project list (mocked API), and
//            the static src/data/projects.ts list is only the signed-out fallback
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act, useEffect } from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import MemberPage from './MemberPage'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SLUG = 'dan-shyu'
const STATIC_TITLE = 'Fellow Project: ICU Handoff Communication Patterns'
const LIVE_TITLE = 'Live project from the API'

let mounted: { host: HTMLElement; root: Root }[] = []
let calls: { url: string; method: string }[] = []
let lastPath = ''

function Probe() {
  const { pathname, search } = useLocation()
  useEffect(() => { lastPath = pathname + search }, [pathname, search])
  return null
}

const asUser = (slug: string | null, isPi = false): AuthUser => ({
  email: slug ? `${slug}@umn.edu` : '', slug: slug ?? '', isAuthenticated: Boolean(slug),
  isPi, isMember: Boolean(slug), canShowAllProjects: false, piResolved: Boolean(slug),
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET' })
    if (url.startsWith('/api/expertise?')) {
      return json({ data: [{ id: 'tag-1', member_slug: SLUG, tag: 'Sepsis', source: 'manual', confidence: 1, created_at: '' }] })
    }
    if (url.includes('/api/expertise/tag-1/delete')) return json({ data: { id: 'tag-1', deleted: true } })
    if (url === `/api/team/${SLUG}/projects`) {
      return json({ data: [{ id: 'proj_live', slug: 'live', title: LIVE_TITLE, status: 'active', home_kind: null, home_stage: null }] })
    }
    if (url.startsWith('/api/commitments')) return json({ error: 'unauthorized' }, 401)
    // The score card and heatmap are not under test; a failed read renders nothing.
    if (url.includes('contribution') || url.includes('heatmap')) return json({ error: 'not under test' }, 404)
    return json({ data: [] })
  }))
})

afterEach(() => {
  mounted.forEach(({ host, root }) => { act(() => root.unmount()); host.remove() })
  mounted = []
  vi.unstubAllGlobals()
})

async function mount(path: string, user: AuthUser): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthContext.Provider value={{ user, isAuthenticated: user.isAuthenticated, isLoading: false }}>
          <UndoToastProvider>
            <MemoryRouter initialEntries={[path]}>
              <Probe />
              <Routes>
                <Route path="/team/:slug" element={<MemberPage />} />
                <Route path="/portal/team/:slug" element={<MemberPage />} />
                <Route path="*" element={<div>elsewhere</div>} />
              </Routes>
            </MemoryRouter>
          </UndoToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  mounted.push({ host, root })
  await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
  return host
}

describe('MemberPage expertise tags', () => {
  it('the member removes their own tag: one delete, no navigation, an aria-label and a 24px target', async () => {
    const h = await mount(`/portal/team/${SLUG}`, asUser(SLUG))
    const remove = h.querySelector('button[aria-label="Remove Sepsis"]') as HTMLButtonElement
    expect(remove).not.toBeNull()
    expect(remove.closest('a')).toBeNull() // never inside the tag's link
    expect(remove.style.minWidth).toBe('24px')
    expect(remove.style.minHeight).toBe('24px')
    await act(async () => { remove.click(); await new Promise((r) => setTimeout(r, 20)) })
    expect(calls.filter((c) => c.url.includes('/api/expertise/tag-1/delete'))).toHaveLength(1)
    expect(lastPath).toBe(`/portal/team/${SLUG}`)
    expect(h.textContent).toContain('Undo')
  })

  it('another member sees the tag but no remove and no Add', async () => {
    const h = await mount(`/portal/team/${SLUG}`, asUser('casey-eddington'))
    expect(h.textContent).toContain('Sepsis')
    expect(h.querySelector('button[aria-label^="Remove"]')).toBeNull()
    expect([...h.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Add')).toBe(false)
  })

  it('the PI may edit any member\'s tags', async () => {
    const h = await mount(`/portal/team/${SLUG}`, asUser('nick-ingraham', true))
    expect(h.querySelector('button[aria-label="Remove Sepsis"]')).not.toBeNull()
  })

  it('the tag itself links to the Team filter', async () => {
    const h = await mount(`/portal/team/${SLUG}`, asUser('casey-eddington'))
    const link = [...h.querySelectorAll('a')].find((a) => a.textContent?.includes('Sepsis'))!
    expect(link.getAttribute('href')).toBe('/portal/team?expertise=Sepsis')
  })
})

describe('MemberPage projects and commitments', () => {
  it('signed out: the static project list, and no /api/commitments request', async () => {
    const h = await mount(`/team/${SLUG}`, asUser(null))
    expect(h.textContent).toContain(STATIC_TITLE)
    expect(h.textContent).not.toContain(LIVE_TITLE)
    expect(calls.some((c) => c.url.startsWith('/api/commitments'))).toBe(false)
    expect(calls.some((c) => c.url.includes(`/api/team/${SLUG}/projects`))).toBe(false)
  })

  it('signed in on the public route: the live list from the API, not the static one', async () => {
    const h = await mount(`/team/${SLUG}`, asUser('casey-eddington'))
    expect(h.textContent).toContain(LIVE_TITLE)
    expect(h.textContent).not.toContain(STATIC_TITLE)
  })
})

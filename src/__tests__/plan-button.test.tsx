// The Plan button, in real Chromium (vitest.config.ts browser mode): it posts
// the Quick Chat launch with the plan seed, shows where a queued launch waits,
// refuses a second press while queued, offers press-again once a queued row
// expires, and renders for the PI only.
//
// The origin is forced to 'mobile' through navigator.userAgentData, so the
// press queues instead of firing mnccore:// on the test browser.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UndoToastProvider } from '../components/UndoToast'
import { PlanButton } from '../components/today/PlanButton'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { PLAN_SEED, type LaunchRow } from '../lib/planLaunch'
import { nowInstant } from '../lib/time'
import { mount, waitFor, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const realUAD = Object.getOwnPropertyDescriptor(navigator, 'userAgentData')
beforeEach(() => {
  Object.defineProperty(navigator, 'userAgentData', { value: { mobile: true }, configurable: true })
})
afterEach(() => {
  vi.unstubAllGlobals()
  if (realUAD) Object.defineProperty(navigator, 'userAgentData', realUAD)
  else delete (navigator as unknown as Record<string, unknown>).userAgentData
})

type Viewer = 'pi' | 'member' | 'unresolved'
const viewerUser = (v: Viewer): AuthUser => ({
  email: 'pi@umn.edu', slug: 'pi', name: 'X', isAuthenticated: true, isPi: v === 'pi', isMember: true,
  canShowAllProjects: v === 'pi', piResolved: v !== 'unresolved',
})

/** launch_log's datetime('now') shape, offset from now by `ms`. */
const dbTime = (ms: number) =>
  new Date(new Date(nowInstant()).getTime() + ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
const launchRow = (o: Partial<LaunchRow> = {}): LaunchRow => ({
  id: 'lnch_1', tag: 'quickchat', seed: PLAN_SEED, origin: 'mobile', status: 'pending',
  created_at: dbTime(-60_000), expires_at: dbTime(2 * 3600_000), ...o,
})

interface Call { url: string; method: string; body: Record<string, unknown> | undefined }
/** GET answers `rows()`; a POST adds a pending mobile row, as the Worker would. */
function stubLaunchApi(rows: () => LaunchRow[], onPost?: () => void) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url === '/api/launch-log' && method === 'POST') {
      onPost?.()
      return new Response(JSON.stringify({ data: { id: 'lnch_new' } }), { status: 201 })
    }
    if (url === '/api/launch-log') return new Response(JSON.stringify({ data: rows() }), { status: 200 })
    return new Response('{}', { status: 200 })
  }))
  return calls
}

async function mountButton(viewer: Viewer = 'pi'): Promise<HTMLElement> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(
    <AuthContext.Provider value={{ user: viewerUser(viewer), isAuthenticated: true, isLoading: false }}>
      <QueryClientProvider client={qc}>
        <UndoToastProvider><div data-ready="1"><PlanButton /></div></UndoToastProvider>
      </QueryClientProvider>
    </AuthContext.Provider>,
    { ready: (h) => h.querySelector('[data-ready]'), label: 'PlanButton' },
  )
}
const btn = (h: HTMLElement) => h.querySelector('[data-testid="plan-button"]') as HTMLButtonElement | null
const posts = (calls: Call[]) => calls.filter((c) => c.url === '/api/launch-log' && c.method === 'POST')

describe('Plan button', () => {
  it('a press posts the quickchat launch with the plan seed and origin; then it reads Queued, with where', async () => {
    let rows: LaunchRow[] = []
    const calls = stubLaunchApi(() => rows, () => { rows = [launchRow()] })
    const host = await mountButton()
    await waitFor(() => btn(host)?.dataset.state === 'ready' && !btn(host)!.disabled, 'Plan ready')
    expect(btn(host)!.textContent).toBe('Plan')

    btn(host)!.click()
    await waitFor(() => posts(calls).length === 1, 'the POST')
    expect(posts(calls)[0].body).toMatchObject({ tag: 'quickchat', seed: PLAN_SEED, origin: 'mobile' })
    await waitFor(() => btn(host)?.dataset.state === 'queued', 'Queued')
    expect(btn(host)!.disabled).toBe(true)
    expect(host.querySelector('[data-testid="plan-note"]')?.textContent).toBe('Queued on your home laptop. It starts when that laptop is on.')
  })

  it('a second press while queued posts nothing', async () => {
    const calls = stubLaunchApi(() => [launchRow()])
    const host = await mountButton()
    await waitFor(() => btn(host)?.dataset.state === 'queued', 'Queued')
    btn(host)!.click()
    btn(host)!.click()
    await new Promise((r) => setTimeout(r, 100))
    expect(posts(calls)).toHaveLength(0)
  })

  it('a queued row past expires_at reads Plan again and can be pressed', async () => {
    const calls = stubLaunchApi(() => [launchRow({ expires_at: dbTime(-5_000) })])
    const host = await mountButton()
    await waitFor(() => btn(host)?.dataset.state === 'expired', 'expired')
    expect(btn(host)!.textContent).toBe('Plan again')
    expect(btn(host)!.disabled).toBe(false)
    expect(host.querySelector('[data-testid="plan-note"]')?.textContent).toMatch(/expired/)
    btn(host)!.click()
    await waitFor(() => posts(calls).length === 1, 'the second POST')
  })

  it('only a row with the plan seed counts: another launch does not make it Queued', async () => {
    stubLaunchApi(() => [launchRow({ seed: 'summarize this' })])
    const host = await mountButton()
    await waitFor(() => btn(host)?.dataset.state === 'ready', 'ready')
    expect(host.querySelector('[data-testid="plan-note"]')).toBeNull()
  })

  it('renders nothing for a member, and for a viewer not yet known, and asks for nothing', async () => {
    for (const viewer of ['member', 'unresolved'] as const) {
      const calls = stubLaunchApi(() => [])
      const host = await mountButton(viewer)
      await new Promise((r) => setTimeout(r, 100))
      expect(btn(host)).toBeNull()
      expect(host.querySelector('[data-testid="plan-note"]')).toBeNull()
      expect(calls).toEqual([])
    }
  })

  it('a failed first read disables the button and says so; Try again re-reads and a queued row then blocks', async () => {
    let fail = true
    const calls = stubLaunchApi(() => [launchRow()])
    const inner = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (fail && url === '/api/launch-log' && (init?.method ?? 'GET') === 'GET') return new Response('{}', { status: 500 })
      return inner(url, init)
    }))
    const host = await mountButton()
    await waitFor(() => btn(host)?.dataset.state === 'unreadable', 'unreadable')
    expect(btn(host)!.disabled).toBe(true)
    expect(host.querySelector('[data-testid="plan-note"]')?.textContent).toContain("Couldn't check the last plan request.")
    btn(host)!.click()
    await new Promise((r) => setTimeout(r, 100))
    expect(posts(calls)).toHaveLength(0)

    fail = false
    ;(host.querySelector('[data-testid="plan-retry"]') as HTMLButtonElement).click()
    await waitFor(() => btn(host)?.dataset.state === 'queued', 'Queued after retry')
    expect(host.querySelector('[data-testid="plan-retry"]')).toBeNull()
  })

  it('a failed background refetch keeps the row already read: still Queued, no error note', async () => {
    let fail = false
    stubLaunchApi(() => [launchRow()])
    const inner = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (fail && url === '/api/launch-log' && (init?.method ?? 'GET') === 'GET') return new Response('{}', { status: 500 })
      return inner(url, init)
    }))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const host = await mount(
      <AuthContext.Provider value={{ user: viewerUser('pi'), isAuthenticated: true, isLoading: false }}>
        <QueryClientProvider client={qc}>
          <UndoToastProvider><div data-ready="1"><PlanButton /></div></UndoToastProvider>
        </QueryClientProvider>
      </AuthContext.Provider>,
      { ready: (h) => h.querySelector('[data-ready]'), label: 'PlanButton' },
    )
    await waitFor(() => btn(host)?.dataset.state === 'queued', 'Queued')
    fail = true
    await qc.refetchQueries({ queryKey: ['launch-log', 'plan'] })
    await new Promise((r) => setTimeout(r, 50))
    expect(btn(host)!.dataset.state).toBe('queued')
    expect(btn(host)!.disabled).toBe(true)
    expect(host.querySelector('[data-testid="plan-retry"]')).toBeNull()
  })
})

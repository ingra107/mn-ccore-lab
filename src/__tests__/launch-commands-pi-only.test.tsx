// @quickchat/@workon start a Claude session on the PI's own machine, and
// POST /api/launch-log refuses every non-PI (2026-10-09). useLaunchCommands
// has three viewer states, and this pins each one:
//   - PI (resolved): routed, POSTs /api/launch-log.
//   - known non-PI (resolved by /api/auth/me): NOT routed, so the caller posts
//     the text as an ordinary comment; nothing is POSTed to /api/launch-log.
//   - unresolved (/api/auth/me not answered yet, or it FAILED and the cookie
//     fallback answered): CONSUMED and refused with a toast -- neither
//     launched nor posted, so a PI's private seed can never leak as
//     team-visible text while his PI status is unknown.
// The last case also drives the real AuthProvider with /api/auth/me failing,
// so the fallback path itself is shown to produce an unresolved user.
//
// Runs in real Chromium (vitest.config.ts browser mode).

import { describe, it, expect, afterEach, vi } from 'vitest'
import { useEffect, type ReactNode } from 'react'
import { UndoToastProvider } from '../components/UndoToast'
import { AuthContext, useAuth, useAuthState } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'
import { useLaunchCommands } from '../hooks/useLaunchCommands'
import { LAUNCH_AUTH_UNRESOLVED_MSG } from '../lib/launchCommands'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

afterEach(() => {
  vi.unstubAllGlobals()
})

function user(isPi: boolean, piResolved: boolean): AuthUser {
  return {
    email: isPi ? 'pi@umn.edu' : 'member@umn.edu', slug: isPi ? 'pi' : 'member', name: 'X',
    isAuthenticated: true, isPi, isMember: true, canShowAllProjects: isPi, piResolved,
  }
}

function Harness({ text, onResult }: { text: string; onResult: (routed: boolean) => void }) {
  const { tryLaunchCommand } = useLaunchCommands()
  useEffect(() => {
    onResult(tryLaunchCommand(text, { taskId: 'task_1' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, [])
  return <div data-ready="1" />
}

function stubFetch(urls: string[], meOk: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    urls.push(url)
    if (url.includes('/api/auth/me')) {
      if (!meOk) throw new TypeError('network down')
      return { ok: true, status: 200, json: async () => ({ authenticated: true, email: 'pi@umn.edu', isPi: true, isMember: true, slug: 'pi' }) }
    }
    return { ok: true, status: 201, json: async () => ({ data: { id: 'lnch_1' } }) }
  }))
}

async function run(u: AuthUser, text: string): Promise<{ routed: boolean | null; urls: string[]; host: HTMLElement }> {
  const urls: string[] = []
  stubFetch(urls, true)
  let routed: boolean | null = null
  const host = await mount(
    <AuthContext.Provider value={{ user: u, isAuthenticated: true, isLoading: false }}>
      <UndoToastProvider>
        <Harness text={text} onResult={(r) => { routed = r }} />
      </UndoToastProvider>
    </AuthContext.Provider>,
    { ready: (h) => h.querySelector('[data-ready]'), label: 'Harness' },
  )
  await new Promise((r) => setTimeout(r, 50))
  return { routed, urls, host }
}

const launchPosts = (urls: string[]) => urls.filter((u) => u.includes('/api/launch-log'))

describe('launch tags: three viewer states (useLaunchCommands)', () => {
  it('PI: routed and POSTs /api/launch-log', async () => {
    const { routed, urls } = await run(user(true, true), '@quickchat summarize this')
    expect(routed).toBe(true)
    expect(launchPosts(urls).length).toBe(1)
  })

  it('known non-PI: not routed (posts as plain text), nothing POSTed', async () => {
    for (const text of ['@quickchat summarize this', '@workon fix the figure']) {
      const { routed, urls } = await run(user(false, true), text)
      expect(routed).toBe(false)
      expect(launchPosts(urls)).toEqual([])
    }
  })

  it('unresolved: consumed (never posted), refused with a toast, nothing POSTed', async () => {
    const { routed, urls } = await run(user(false, false), '@quickchat my private seed')
    expect(routed).toBe(true)
    expect(launchPosts(urls)).toEqual([])
    await new Promise((r) => setTimeout(r, 50))
    expect(document.body.textContent).toContain(LAUNCH_AUTH_UNRESOLVED_MSG)
  })
})

// The real provider: when /api/auth/me fails, the fallback user must be
// UNRESOLVED (not a resolved non-PI), so a launch tag is refused, not posted.
function RealAuth({ children }: { children: ReactNode }) {
  const value = useAuthState()
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
function Probe({ onUser }: { onUser: (u: AuthUser, loading: boolean) => void }) {
  const { user: u, isLoading } = useAuth()
  useEffect(() => { onUser(u, isLoading) }, [u, isLoading, onUser])
  return <div data-ready="1" />
}

describe('/api/auth/me fallback', () => {
  async function settle(meOk: boolean): Promise<AuthUser> {
    stubFetch([], meOk)
    let last: AuthUser | null = null
    let done = false
    await mount(
      <RealAuth><Probe onUser={(u, loading) => { last = u; done = !loading }} /></RealAuth>,
      { ready: (h) => h.querySelector('[data-ready]'), label: 'RealAuth' },
    )
    for (let i = 0; i < 100 && !done; i++) await new Promise((r) => setTimeout(r, 10))
    return last as unknown as AuthUser
  }

  it('a failed /api/auth/me leaves the viewer unresolved', async () => {
    const u = await settle(false)
    expect(u.isPi).toBe(false)
    expect(u.piResolved).toBe(false)
  })

  it('a successful /api/auth/me resolves it', async () => {
    const u = await settle(true)
    expect(u.isPi).toBe(true)
    expect(u.piResolved).toBe(true)
  })
})

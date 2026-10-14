// The cached member slug is a first-paint hint for the cookie route only. It
// must never outlive the session it described: a shared lab computer showed the
// previous member's shell to the next person (cold review, 2026-10-14).
// Real Chromium, real localStorage, real useAuthState against a stubbed fetch.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { useAuthState, authUserFromMe, forgetCachedSlugs } from '../hooks/useAuth'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()

const K = (email: string) => `hub:auth-slug:${email}`
const realFetch = globalThis.fetch

function jwt(email: string): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${b64({ alg: 'none' })}.${b64({ email, name: 'Cookie Name' })}.sig`
}

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  localStorage.clear()
  document.cookie = 'CF_Authorization=; Max-Age=0; path=/'
  globalThis.fetch = realFetch
})

describe('cached slug hygiene', () => {
  it('a member answer drops every other cached member', () => {
    localStorage.setItem(K('a@umn.edu'), 'a-one')
    localStorage.setItem(K('b@umn.edu'), 'b-two')
    authUserFromMe({ authenticated: true, isMember: true, email: 'b@umn.edu', slug: 'b-two' })
    expect(localStorage.getItem(K('a@umn.edu'))).toBeNull()
    expect(localStorage.getItem(K('b@umn.edu'))).toBe('b-two')
  })
  it('a non-member answer drops all of them, including the earlier member\'s', () => {
    localStorage.setItem(K('a@umn.edu'), 'a-one')
    authUserFromMe({ authenticated: true, isMember: false, email: 'stranger@umn.edu' })
    expect(localStorage.getItem(K('a@umn.edu'))).toBeNull()
  })
  it('a signed-out answer drops all of them', () => {
    localStorage.setItem(K('a@umn.edu'), 'a-one')
    expect(authUserFromMe({ authenticated: false })).toBeNull()
    expect(localStorage.getItem(K('a@umn.edu'))).toBeNull()
  })
  it('forgetCachedSlugs() (Sign out) clears every slug key and nothing else', () => {
    localStorage.setItem(K('a@umn.edu'), 'a-one')
    localStorage.setItem('mn-ccore-theme', 'dark')
    forgetCachedSlugs()
    expect(localStorage.getItem(K('a@umn.edu'))).toBeNull()
    expect(localStorage.getItem('mn-ccore-theme')).toBe('dark')
  })
})

describe('cookie route: cached slug paints first, the API hydrates', () => {
  function Probe() {
    const a = useAuthState()
    return <span data-testid="p">{`${a.isLoading ? 'loading' : 'ready'}|${a.user.slug}|${a.user.isPi ? 'pi' : 'nopi'}`}</span>
  }

  it('cookie + cached slug: ready at once with the cached slug, then isPi from /api/auth/me', async () => {
    document.cookie = `CF_Authorization=${jwt('a@umn.edu')}; path=/`
    localStorage.setItem(K('a@umn.edu'), 'a-one')
    let answer!: () => void
    globalThis.fetch = (() => new Promise<Response>((resolve) => {
      answer = () => resolve(new Response(JSON.stringify({ authenticated: true, isMember: true, isPi: true, email: 'a@umn.edu', slug: 'a-one' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })) as typeof fetch
    const host = await mount(<Probe />, { ready: (h) => h.querySelector('[data-testid="p"]'), label: 'Probe' })
    expect(host.textContent).toBe('ready|a-one|nopi')
    await waitFor(() => answer, 'auth fetch asked')
    answer()
    await waitFor(() => host.textContent === 'ready|a-one|pi', 'hydrated')
  })

  it('no cookie: a cached slug alone does NOT paint anyone; the page waits for the API', async () => {
    localStorage.setItem(K('a@umn.edu'), 'a-one')
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch
    const host = await mount(<Probe />, { ready: (h) => h.querySelector('[data-testid="p"]'), label: 'Probe' })
    expect(host.textContent).toBe('loading||nopi')
  })
})

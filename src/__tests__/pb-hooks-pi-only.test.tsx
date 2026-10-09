// /api/pb/* answers 403 to every non-PI caller (api/index.ts, PI gate). The
// usePB* hooks used to fire anyway, so every member's Today showed a
// permanent "session stats unavailable · retry". The hooks now refuse to
// build the request unless the viewer is a PI. This pins both halves: a
// member never sends a /api/pb/* request, and a PI still does.
//
// Runs in real Chromium (vitest.config.ts browser mode).

import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'
import { usePBHealth, usePBSessions, usePBSessionStats } from '../hooks/useApiData'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

afterEach(() => {
  vi.unstubAllGlobals()
})

function Harness() {
  usePBHealth()
  usePBSessions({ limit: 5 })
  usePBSessionStats()
  return <div data-ready="1" />
}

function user(isPi: boolean): AuthUser {
  return {
    email: isPi ? 'pi@umn.edu' : 'member@umn.edu',
    slug: isPi ? 'pi' : 'member',
    name: 'X',
    isAuthenticated: true,
    isPi,
    isMember: true,
    canShowAllProjects: isPi,
  } as AuthUser
}

async function mountAs(isPi: boolean): Promise<string[]> {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    urls.push(String(input))
    return { ok: true, status: 200, json: async () => ({ data: isPi ? { per_day: [] } : null }) }
  }))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const u = user(isPi)
  await mount(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user: u, isAuthenticated: true, isLoading: false }}>
        <Harness />
      </AuthContext.Provider>
    </QueryClientProvider>,
    { ready: () => true, label: 'Harness' },
  )
  await new Promise((r) => setTimeout(r, 100))
  return urls
}

describe('usePB* hooks are PI-only (F1)', () => {
  it('a member sends no /api/pb/* request', async () => {
    const urls = await mountAs(false)
    expect(urls.filter((u) => u.includes('/api/pb/'))).toEqual([])
  })

  it('a PI still fetches all three', async () => {
    const urls = (await mountAs(true)).filter((u) => u.includes('/api/pb/'))
    expect(urls.some((u) => u.includes('/api/pb/health'))).toBe(true)
    expect(urls.some((u) => u.includes('/api/pb/sessions/stats'))).toBe(true)
    expect(urls.some((u) => /\/api\/pb\/sessions(\?|$)/.test(u))).toBe(true)
  })
})

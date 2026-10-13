// /pulse is a wall display that stays open for days. It sits outside
// PortalLayout, so the /api/version poll never runs there; without its own
// timer it shows the counts from the moment it loaded. This pins the timer:
// after five minutes Pulse invalidates the query cache, and it stops on unmount.
//
// Runs in real Chromium (vitest.config.ts browser mode).

import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'
import Pulse from '../pages/Pulse'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Pulse kiosk refresh', () => {
  it('invalidates the query cache every five minutes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) })))
    // Fake only the interval; mount() polls with setTimeout.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const anon = { email: '', slug: '', isAuthenticated: false, isPi: false, isMember: false, canShowAllProjects: false, piResolved: true } as AuthUser
    await mount(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ user: anon, isAuthenticated: false, isLoading: false }}>
          <Pulse />
        </AuthContext.Provider>
      </QueryClientProvider>,
      { ready: (h) => h.querySelector('*'), label: 'Pulse' },
    )
    expect(spy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4 * 60 * 1000)
    expect(spy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60 * 1000)
    expect(spy).toHaveBeenCalledTimes(1)
    // Anonymous viewers must not refetch the 401 /api/tasks query.
    const pred = (spy.mock.calls[0][0] as unknown as { predicate: (q: { queryKey: unknown[] }) => boolean }).predicate
    expect(pred({ queryKey: ['tasks', undefined] })).toBe(false)
    expect(pred({ queryKey: ['projects'] })).toBe(true)
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

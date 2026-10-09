// @quickchat/@workon start a Claude session on the PI's own machine, and
// POST /api/launch-log refuses every non-PI (2026-10-09). useLaunchCommands
// must therefore not route a member's text as a launch: it answers "not
// routed" so the caller posts the text as an ordinary comment, and no
// /api/launch-log request is built. A PI's tag still routes and still POSTs.
//
// Runs in real Chromium (vitest.config.ts browser mode).

import { describe, it, expect, afterEach, vi } from 'vitest'
import { useEffect } from 'react'
import { UndoToastProvider } from '../components/UndoToast'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'
import { useLaunchCommands } from '../hooks/useLaunchCommands'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

afterEach(() => {
  vi.unstubAllGlobals()
})

function user(isPi: boolean): AuthUser {
  return {
    email: isPi ? 'pi@umn.edu' : 'member@umn.edu', slug: isPi ? 'pi' : 'member', name: 'X',
    isAuthenticated: true, isPi, isMember: true, canShowAllProjects: isPi,
  } as AuthUser
}

function Harness({ text, onResult }: { text: string; onResult: (routed: boolean) => void }) {
  const { tryLaunchCommand } = useLaunchCommands()
  useEffect(() => {
    onResult(tryLaunchCommand(text, { taskId: 'task_1' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, [])
  return <div data-ready="1" />
}

async function run(isPi: boolean, text: string): Promise<{ routed: boolean | null; urls: string[] }> {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    urls.push(String(input))
    return { ok: true, status: 201, json: async () => ({ data: { id: 'lnch_1' } }) }
  }))
  let routed: boolean | null = null
  await mount(
    <AuthContext.Provider value={{ user: user(isPi), isAuthenticated: true, isLoading: false }}>
      <UndoToastProvider>
        <Harness text={text} onResult={(r) => { routed = r }} />
      </UndoToastProvider>
    </AuthContext.Provider>,
    { ready: (h) => h.querySelector('[data-ready]'), label: 'Harness' },
  )
  await new Promise((r) => setTimeout(r, 50))
  return { routed, urls }
}

describe('launch tags are PI-only (useLaunchCommands)', () => {
  it('a member: @quickchat and @workon are not routed and nothing is POSTed', async () => {
    for (const text of ['@quickchat summarize this', '@workon fix the figure']) {
      const { routed, urls } = await run(false, text)
      expect(routed).toBe(false)
      expect(urls.filter((u) => u.includes('/api/launch-log'))).toEqual([])
    }
  })

  it('a PI: @quickchat is routed and POSTs /api/launch-log', async () => {
    const { routed, urls } = await run(true, '@quickchat summarize this')
    expect(routed).toBe(true)
    expect(urls.some((u) => u.includes('/api/launch-log'))).toBe(true)
  })
})

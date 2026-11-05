// F08/F09 (2026-11-05): Settings has no Profile or Templates tab. Profile
// wrote four lab_settings keys nothing read; Templates listed workflow
// templates nothing read. /portal/settings opens on Lab, and an old
// #profile or #templates link lands there instead of on a blank panel.
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SettingsPage from '../pages/portal/SettingsPage'
import { enableUserPrefSync, _resetUserPrefsForTests } from '../hooks/useUserPref'
import { mount, waitFor, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const fetched: string[] = []
const writes: Array<{ url: string; method: string; body: unknown }> = []
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  _resetUserPrefsForTests()
  window.history.replaceState(null, '', window.location.pathname)
  vi.restoreAllMocks()
})

async function open(hash: string) {
  fetched.length = 0
  writes.length = 0
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    fetched.push(url)
    if (init?.method && init.method !== 'GET') writes.push({ url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined })
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  window.history.replaceState(null, '', `${window.location.pathname}${hash}`)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(
    <QueryClientProvider client={qc}>
      <MemoryRouter><SettingsPage /></MemoryRouter>
    </QueryClientProvider>,
    { ready: (h) => h.querySelector('[role="tablist"] button.tk-on'), label: 'SettingsPage tab strip' },
  )
}

const tabs = (h: HTMLElement) => [...h.querySelectorAll('[role="tablist"] button')].map((b) => b.textContent?.trim())
const active = (h: HTMLElement) => h.querySelector('[role="tablist"] button.tk-on')?.textContent?.trim()

describe('Settings tabs', () => {
  it('lists Lab, Notifications, Integrations, Appearance and Danger Zone, and opens on Lab', async () => {
    const host = await open('')
    expect(tabs(host)).toEqual(['Lab', 'Notifications', 'Integrations', 'Appearance', 'Danger Zone'])
    expect(active(host)).toBe('Lab')
  })

  it.each(['#profile', '#templates'])('an old %s link lands on Lab', async (hash) => {
    const host = await open(hash)
    expect(active(host)).toBe('Lab')
    await waitFor(() => window.location.hash === '#lab', 'hash rewritten to #lab')
  })

  it('a live hash still opens its tab', async () => {
    const host = await open('#integrations')
    expect(active(host)).toBe('Integrations')
  })

  it("the digest email's Manage notifications link opens the switch, on by default", async () => {
    const host = await open('#notifications')
    expect(active(host)).toBe('Notifications')
    const sw = await waitFor(() => host.querySelector<HTMLButtonElement>('[data-testid="digest-email-switch"]'), 'the switch')
    expect(sw.getAttribute('role')).toBe('switch')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(host.textContent).toMatch(/Daily digest email/)
  })

  it('turning it off saves to the server for this person', async () => {
    const host = await open('#notifications')
    await waitFor(() => !!host.querySelector('[data-testid="digest-email-switch"]'), 'the switch')
    enableUserPrefSync('casey-eddington') // the signed-in person; useAuth has none in this mount
    await waitFor(() => fetched.some((u) => u.endsWith('/api/user-prefs')), 'the first read')
    host.querySelector<HTMLButtonElement>('[data-testid="digest-email-switch"]')!.click()
    await waitFor(() => host.querySelector('[data-testid="digest-email-switch"]')?.getAttribute('aria-checked') === 'false', 'the switch off')
    await waitFor(() => writes.some((w) => w.url.endsWith('/api/user-prefs/digest.email') && w.method === 'PUT' && (w.body as { value: unknown }).value === false), 'the save')
  })

  it('reads no lab settings or workflow templates', async () => {
    await open('')
    await new Promise((r) => setTimeout(r, 50))
    expect(fetched.filter((u) => u.includes('/api/settings') || u.includes('/api/workflow-templates'))).toEqual([])
  })
})

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
import { mount, waitFor, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const fetched: string[] = []
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  window.history.replaceState(null, '', window.location.pathname)
  vi.restoreAllMocks()
})

async function open(hash: string) {
  fetched.length = 0
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetched.push(String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url))
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
  it('lists Lab, Integrations, Appearance and Danger Zone, and opens on Lab', async () => {
    const host = await open('')
    expect(tabs(host)).toEqual(['Lab', 'Integrations', 'Appearance', 'Danger Zone'])
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

  it('reads no lab settings or workflow templates', async () => {
    await open('')
    await new Promise((r) => setTimeout(r, 50))
    expect(fetched.filter((u) => u.includes('/api/settings') || u.includes('/api/workflow-templates'))).toEqual([])
  })
})

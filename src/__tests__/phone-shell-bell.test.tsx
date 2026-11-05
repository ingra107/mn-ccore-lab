// The portal shell on a phone (visual audit 2, H1 + H2), in real Chromium against
// the real index.css.
//  - The closed top bar carries the bell and its count. It used to render only
//    inside the drawer, so unread mentions were invisible.
//  - On desktop the sidebar has the bell, so the top bar's stays hidden.
//  - Report a bug from the drawer closes the drawer first. It used to open
//    underneath it, with the title and most of the text box covered.

import '../index.css'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { page } from 'vitest/browser'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'
import PortalLayout from '../components/PortalLayout'
import { mount, cleanupMountsAfterEach } from './testMount'

// The pill reads its own API shape; the real one is checked in Playwright.
vi.mock('../components/whatsnew/PulsePill', () => ({ default: () => null }))

cleanupMountsAfterEach()

const NOTES = [
  { id: 'n1', type: 'mention', title: 'Nate mentioned you', body: null, link: null, read: 0, created_at: '2026-11-05 13:00:00' },
  { id: 'n2', type: 'mention', title: 'Casey mentioned you', body: null, link: null, read: 0, created_at: '2026-11-05 12:00:00' },
  { id: 'n3', type: 'mention', title: 'Lianne mentioned you', body: null, link: null, read: 0, created_at: '2026-11-05 11:00:00' },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const body = url.includes('/api/notifications') ? { data: NOTES, count: 3, unread: 3 } : { data: [], count: 0 }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

const nick = { email: 'ingra107@umn.edu', slug: 'nick-ingraham', name: 'Nick', isAuthenticated: true, isPi: true, isMember: true, canShowAllProjects: true, piResolved: true } as unknown as AuthUser

const shell = () => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AuthContext.Provider value={{ user: nick, isAuthenticated: true, isLoading: false }}>
      <MemoryRouter initialEntries={['/portal/nothing-here']}><PortalLayout /></MemoryRouter>
    </AuthContext.Provider>
  </QueryClientProvider>
)

const visibleBells = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLElement>('button[aria-label^="Notifications"]')].filter((b) => b.getBoundingClientRect().width > 0)

describe('portal shell bell', () => {
  it('sits in the phone top bar with a 44px target', async () => {
    await page.viewport(390, 844)
    const host = await mount(shell(), { ready: (h) => h.querySelector('header'), label: 'header' })
    const header = host.querySelector('header')!
    await expect.poll(() => visibleBells(header).length).toBe(1)
    const r = visibleBells(header)[0].getBoundingClientRect()
    expect(r.width).toBeGreaterThanOrEqual(44)
    expect(r.height).toBeGreaterThanOrEqual(44)
    // Nothing in the bar is pushed off the phone screen.
    expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth)
  })

  it('is hidden in the desktop top bar, where the sidebar has it', async () => {
    await page.viewport(1440, 900)
    const host = await mount(shell(), { ready: (h) => h.querySelector('header'), label: 'header' })
    expect(visibleBells(host.querySelector('header')!)).toHaveLength(0)
    await expect.poll(() => visibleBells(host.querySelector('[data-testid="sidebar"]')!).length).toBe(1)
  })
})

describe('Report a bug from the phone drawer', () => {
  it('closes the drawer, so the modal is on top and whole', async () => {
    await page.viewport(390, 844)
    const host = await mount(shell(), { ready: (h) => h.querySelector('button[aria-label="Open navigation"]'), label: 'hamburger' })
    host.querySelector<HTMLElement>('button[aria-label="Open navigation"]')!.click()
    await expect.poll(() => !!document.querySelector('[aria-label="Navigation menu"]')).toBe(true)
    // The drawer's own bell is gone: the top bar has it.
    expect(visibleBells(document.querySelector('[aria-label="Navigation menu"]')!)).toHaveLength(0)
    document.querySelector<HTMLElement>('[aria-label="Navigation menu"] button[aria-label="Report a bug"]')!.click()
    await expect.poll(() => !!document.querySelector('[aria-label="Navigation menu"]')).toBe(false)
    const findTitle = () => [...document.querySelectorAll<HTMLElement>('h1,h2,h3')].find((e) => e.textContent?.includes('Report a Bug'))
    await expect.poll(() => !!findTitle(), { timeout: 5000 }).toBe(true)
    const r = findTitle()!.getBoundingClientRect()
    expect(findTitle()!.contains(document.elementFromPoint(r.left + 4, r.top + r.height / 2))).toBe(true)
  })
})

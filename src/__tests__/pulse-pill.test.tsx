// #156: the top-bar What's new / Lab pulse pill (layout A: one pill, two tabs).
// Runs in real Chromium (vitest.config.ts browser mode).
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import PulsePill from '../components/whatsnew/PulsePill'
import type { PulsePayload } from '../../shared/pulse'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals(); try { localStorage.clear() } catch { /* ignore */ } })

const user = { email: 'eddin022@umn.edu', slug: 'casey-eddington', isAuthenticated: true, isPi: false, isMember: true, canShowAllProjects: false, piResolved: true }

function wrap(node: ReactElement): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider><MemoryRouter>{node}</MemoryRouter></UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

// The pref store is module-level and outlives a test, so each test names its
// own release/announcement ids: what one test marked seen cannot unlight the next.
let n = 0
const payload = (over: Partial<PulsePayload> = {}): PulsePayload => (n++, {
  release: { id: `rel_${n}`, title: 'Smoother Today', blurbs: [{ lead: 'One collapse per meeting.', text: 'The caret folds action items too.' }], approvedAt: '2026-10-26T20:00:00.000Z', commitTo: 'c1', status: 'approved', commits: [] },
  pastReleases: [], draft: null,
  announcement: { id: `ann_${n}`, body: 'Lab retreat moved to Nov 14', authorSlug: 'nick-ingraham', createdAt: '2026-10-26T18:00:00.000Z' },
  active: ['nick-ingraham', 'casey-eddington', 'tom-byrd'], tasksDone: 23, milestonesHit: 2, newPapers: 1,
  wins: [{ kind: 'publication', title: 'Sedation trends in CLIF', date: '2026-10-24T00:00:00.000Z', href: null }],
  ...over,
})

function stub(p: PulsePayload) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({
    ok: true, status: 200,
    json: async () => (String(url).startsWith('/api/pulse') ? { data: p } : { data: [] }),
  })))
}

const pill = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('[data-testid="pulse-pill"]')!

describe('PulsePill', () => {
  it('an unseen release lights the pill and opens on What\'s new', async () => {
    stub(payload())
    const host = await mount(wrap(<PulsePill />), { ready: (h) => h.querySelector('[data-pulse-tone="news"]'), label: 'PulsePill' })
    expect(pill(host).textContent).toContain("What's new")
    // Phones show the short form; the full label stays the accessible name.
    expect(host.querySelector('[data-pulse-short]')?.textContent).toBe('New')
    expect(pill(host).getAttribute('aria-label')).toBe("What's new")
    pill(host).click()
    await expect.poll(() => host.textContent).toContain('One collapse per meeting.')
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("What's new")
  })

  it('once opened, the pill settles to the pulse, which shows faces, counts and the announcement', async () => {
    stub(payload())
    const host = await mount(wrap(<PulsePill />), { ready: (h) => h.querySelector('[data-pulse-tone="news"]'), label: 'PulsePill' })
    pill(host).click()
    await expect.poll(() => host.textContent).toContain('One collapse per meeting.')
    pill(host).click() // close: the release was shown, the announcement was not
    await expect.poll(() => pill(host).getAttribute('data-pulse-tone')).toBe('news')
    pill(host).click() // now it opens where the unseen announcement is
    await expect.poll(() => host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Lab pulse')
    pill(host).click()
    await expect.poll(() => pill(host).textContent).toContain('Lab pulse · 3 active')
    pill(host).click()
    await expect.poll(() => host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Lab pulse')
    expect(host.textContent).toContain('Lab retreat moved to Nov 14')
    expect(host.textContent).toContain('23')
    expect(host.textContent).toContain('tasks done this week')
    expect(host.querySelectorAll('[data-pulse-face]').length).toBe(3)
    expect(host.textContent).toContain('Sedation trends in CLIF')
  })

  it('a new announcement alone opens on Lab pulse, where it is shown', async () => {
    stub(payload({ release: null }))
    const host = await mount(wrap(<PulsePill />), { ready: (h) => h.querySelector('[data-pulse-tone="news"]'), label: 'PulsePill' })
    pill(host).click()
    await expect.poll(() => host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Lab pulse')
    expect(host.textContent).toContain('Lab retreat moved to Nov 14')
  })

  it('an empty lab reads quietly', async () => {
    stub(payload({ release: null, announcement: null, active: [], tasksDone: 0, milestonesHit: 0, newPapers: 0, wins: [] }))
    const host = await mount(wrap(<PulsePill />), { ready: (h) => h.querySelector('[data-pulse-tone="pulse"]'), label: 'PulsePill' })
    expect(pill(host).textContent).toContain('Lab pulse · 0 active')
    expect(host.querySelector('[data-pulse-short]')?.textContent).toBe('0')
    pill(host).click()
    await expect.poll(() => host.textContent).toContain('Nobody active in the last day')
    expect(host.textContent).toContain('No announcement in the last two weeks')
  })
})

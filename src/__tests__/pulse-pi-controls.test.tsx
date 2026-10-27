// #156: Nick's controls in the What's new / Lab pulse panel. Only a PI sees the
// draft card and the announcement composer; Approve waits for words; the
// composer stops at 280 characters. Runs in real Chromium.
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
afterEach(() => vi.unstubAllGlobals())

const person = (isPi: boolean) => ({ email: isPi ? 'ingra107@umn.edu' : 'eddin022@umn.edu', slug: isPi ? 'nick-ingraham' : 'casey-eddington', isAuthenticated: true, isPi, isMember: true, canShowAllProjects: false, piResolved: true })

function wrap(isPi: boolean, node: ReactElement): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user: person(isPi), isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider><MemoryRouter>{node}</MemoryRouter></UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

let n = 100
function payload(blurbs: { lead: string; text: string }[]): PulsePayload {
  n++
  return {
    release: null, pastReleases: [],
    draft: { id: `rel_d${n}`, title: blurbs.length ? 'Smoother Today' : '', blurbs, approvedAt: null, commitTo: 'c42', status: 'draft', commits: [{ sha: 'abc', subject: 'Fold Needs you on My Tasks' }] },
    announcement: null, active: [], tasksDone: 0, milestonesHit: 0, newPapers: 0, wins: [],
  }
}

function stub(p: PulsePayload) {
  const f = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => ({
    ok: true, status: 200,
    json: async () => (String(url).startsWith('/api/pulse') ? { data: p } : init?.method === 'POST' ? { data: { id: 'x' } } : { data: [] }),
  }))
  vi.stubGlobal('fetch', f)
  return f
}

const button = (h: HTMLElement, name: string) => [...h.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)
const openPanel = async (h: HTMLElement) => { h.querySelector<HTMLButtonElement>('[data-testid="pulse-pill"]')!.click(); await expect.poll(() => h.querySelector('[role="dialog"]')).toBeTruthy() }

describe('PI controls in the pulse panel', () => {
  it('a non-PI sees no draft and no composer', async () => {
    stub(payload([{ lead: 'L.', text: 'T' }]))
    const host = await mount(wrap(false, <PulsePill />), { ready: (h) => h.querySelector('[data-testid="pulse-pill"]'), label: 'PulsePill' })
    await openPanel(host)
    expect(host.querySelector('[data-testid="draft-release"]')).toBeNull()
    button(host, 'Lab pulse')!.click()
    await expect.poll(() => host.textContent).toContain('Active in the last day')
    expect(host.querySelector('[data-testid="announcement-composer"]')).toBeNull()
  })

  it('the PI sees the draft first; Approve waits for a title and a blurb', async () => {
    stub(payload([]))
    const host = await mount(wrap(true, <PulsePill />), { ready: (h) => h.querySelector('[data-pulse-tone="news"]'), label: 'PulsePill' })
    await openPanel(host)
    await expect.poll(() => host.querySelector('[data-testid="draft-release"]')).toBeTruthy()
    expect(button(host, 'Approve')!.disabled).toBe(true)
    // What shipped, collapsed until asked for, so Nick can check the words against it.
    button(host, 'What shipped (1)')!.click()
    await expect.poll(() => host.textContent).toContain('Fold Needs you on My Tasks')
  })

  it('Approve sends the approve action', async () => {
    const f = stub(payload([{ lead: 'One collapse per meeting.', text: 'The caret folds action items too.' }]))
    const host = await mount(wrap(true, <PulsePill />), { ready: (h) => h.querySelector('[data-pulse-tone="news"]'), label: 'PulsePill' })
    await openPanel(host)
    await expect.poll(() => button(host, 'Approve')?.disabled).toBe(false)
    button(host, 'Approve')!.click()
    await expect.poll(() => f.mock.calls.find((c) => /\/api\/releases\/rel_d\d+$/.test(String(c[0])))).toBeTruthy()
    const call = f.mock.calls.find((c) => /\/api\/releases\/rel_d\d+$/.test(String(c[0])))!
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      action: 'approve',
      reviewed: { commitTo: 'c42', title: 'Smoother Today', blurbs: [{ lead: 'One collapse per meeting.', text: 'The caret folds action items too.' }] },
    })
  })

  it('Discard asks once more, then settles back if not confirmed', async () => {
    const f = stub(payload([{ lead: 'L.', text: 'T' }]))
    const host = await mount(wrap(true, <PulsePill />), { ready: (h) => h.querySelector('[data-pulse-tone="news"]'), label: 'PulsePill' })
    await openPanel(host)
    await expect.poll(() => button(host, 'Discard')).toBeTruthy()
    button(host, 'Discard')!.click()
    await expect.poll(() => button(host, 'Discard draft')).toBeTruthy()
    await expect.poll(() => button(host, 'Discard'), { timeout: 5000 }).toBeTruthy()
    expect(button(host, 'Discard draft')).toBeUndefined()
    expect(f.mock.calls.some((c) => /\/api\/releases\/rel_d\d+$/.test(String(c[0])))).toBe(false)
  })

  it('the composer refuses 281 characters and posts 12', async () => {
    const f = stub(payload([{ lead: 'L.', text: 'T' }]))
    const host = await mount(wrap(true, <PulsePill />), { ready: (h) => h.querySelector('[data-testid="pulse-pill"]'), label: 'PulsePill' })
    await openPanel(host)
    button(host, 'Lab pulse')!.click()
    await expect.poll(() => host.querySelector('[data-testid="announcement-composer"]')).toBeTruthy()
    const field = host.querySelector<HTMLTextAreaElement>('#announcement-body')!
    const type = (v: string) => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      set.call(field, v)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    type('x'.repeat(281))
    await expect.poll(() => button(host, 'Post')?.disabled).toBe(true)
    // Spaces around the text do not count: the server trims too.
    type(`  ${'x'.repeat(280)}  `)
    await expect.poll(() => button(host, 'Post')?.disabled).toBe(false)
    type('Retreat Nov 14')
    await expect.poll(() => button(host, 'Post')?.disabled).toBe(false)
    button(host, 'Post')!.click()
    await expect.poll(() => f.mock.calls.find((c) => String(c[0]) === '/api/announcements')).toBeTruthy()
    const call = f.mock.calls.find((c) => String(c[0]) === '/api/announcements')!
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ body: 'Retreat Nov 14' })
  })
})

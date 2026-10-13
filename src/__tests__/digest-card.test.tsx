// Research Digest card (Nick 2026-10-13): the newest note on the card with a
// "Make task" action, phone swipe right = Save with an Undo, no duplicate
// status chip, and a Saved view that spans every digest date.
//
// Runs in real Chromium (vitest.config.ts browser mode); fetch is stubbed per URL.

import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import Digest from '../pages/Digest'
import { page } from 'vitest/browser'
import { mount, waitFor, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(async () => {
  vi.unstubAllGlobals()
  await page.viewport(1280, 900)
})

const paper = (over: Record<string, unknown>) => ({
  id: 'p-new', title: 'New paper', authors: 'Smith J', journal: 'Lancet', pub_date: '2026-10-01', abstract: null,
  summary: null, significance: null, pmid: '222', doi: null, relevance_score: 9, relevance_reason: null,
  topics: '["sepsis"]', status: 'new', status_at: null, digest_date: '2026-10-13', relevant_members: [],
  note_count: 0, latest_note: null, ...over,
})

const NEW = paper({
  note_count: 2,
  latest_note: {
    id: 'n1', author_slug: 'nick-ingraham', content: 'get the full text: did the pooled analysis have data?',
    created_at: '2026-10-13 12:00:00', task_id: null, task_visible: false,
  },
})
const OLD_SAVED = paper({ id: 'p-old', title: 'Old saved paper', digest_date: '2026-09-01', status: 'saved' })

type Call = { url: string; method: string; body: unknown }

function stubApi() {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) })
    if (method === 'POST' && url.includes('/task')) return ok({ task_id: 'task_x', created: true })
    if (method === 'POST') return ok({})
    if (url.startsWith('/api/digest/dates')) return ok([{ date: '2026-10-13', count: 1 }, { date: '2026-09-01', count: 1 }])
    if (url.startsWith('/api/digest?')) {
      const qs = new URLSearchParams(url.split('?')[1])
      if (qs.get('status') === 'saved' && !qs.get('date')) return ok([OLD_SAVED])
      if (qs.get('date') === '2026-10-13') return ok([NEW])
      return ok([])
    }
    return ok([])
  }))
  return calls
}

function wrap(node: ReactElement): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = {
    email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
    canShowAllProjects: false, piResolved: true,
  }
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider>
          <MemoryRouter>{node}</MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

const card = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`[data-testid="digest-paper-${id}"]`)
const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.textContent ?? '').trim().startsWith(text))

describe('Research Digest card', () => {
  it('shows the newest note with first name, offers Make task, and no status chip', async () => {
    const calls = stubApi()
    const host = await mount(wrap(<Digest />), { ready: (h) => card(h, 'p-new'), label: 'digest card' })
    const c = card(host, 'p-new')!
    const note = c.querySelector('[data-testid="digest-latest-note"]')!
    expect(note.textContent).toContain('Nick')
    expect(note.textContent).toContain('get the full text')
    // "Discuss" became "Note", with the count.
    expect(button(c, 'Note 2')).toBeTruthy()
    expect(button(c, 'Discuss')).toBeUndefined()
    // The status reads once, on the Save button; the footer chip is gone.
    expect(c.textContent).not.toContain('Unread')

    button(note, 'Make task')!.click()
    await expect.poll(() => calls.some((x) => x.method === 'POST' && x.url === '/api/digest/comments/n1/task')).toBe(true)
  })

  it('Saved lists every saved paper across dates, without the date row', async () => {
    const calls = stubApi()
    const host = await mount(wrap(<Digest />), { ready: (h) => card(h, 'p-new'), label: 'digest card' })
    const saved = await waitFor(() => button(host, 'Saved'), 'Saved filter')
    saved.click()
    await waitFor(() => card(host, 'p-old'), 'saved paper from an older digest')
    expect(card(host, 'p-new')).toBeNull()
    expect(host.textContent).not.toContain('Digest date')
    expect(calls.some((x) => x.url.startsWith('/api/digest?') && x.url.includes('status=saved') && !x.url.includes('date='))).toBe(true)
  })

  it('a right swipe on a phone saves, and Undo puts it back', async () => {
    await page.viewport(390, 844) // a phone: the hook only drags below 768px
    expect(window.innerWidth).toBeLessThan(768)
    const calls = stubApi()
    const host = await mount(wrap(<Digest />), { ready: (h) => card(h, 'p-new'), label: 'digest card' })
    const el = card(host, 'p-new')!
    const r = el.getBoundingClientRect()
    const y = r.top + 20
    const x0 = r.left + 40
    const pe = (type: string, x: number) =>
      new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType: 'touch' })
    el.dispatchEvent(pe('pointerdown', x0))
    const dist = window.innerWidth * 0.6
    for (let i = 1; i <= 12; i++) {
      window.dispatchEvent(pe('pointermove', x0 + (dist * i) / 12))
      await new Promise((res) => requestAnimationFrame(() => res(null)))
    }
    window.dispatchEvent(pe('pointerup', x0 + dist))
    await expect.poll(() => calls.find((x) => x.method === 'POST' && x.url === '/api/digest/p-new/status')?.body).toEqual({ status: 'saved' })
    const undo = await waitFor(() => button(document.body, 'Undo'), 'undo toast')
    undo.click()
    await expect.poll(() => calls.filter((x) => x.method === 'POST' && x.url === '/api/digest/p-new/status').map((x) => x.body))
      .toEqual([{ status: 'saved' }, { status: 'new' }])
  })

  // A full right drag across the card, with the given pointer type.
  async function drag(el: HTMLElement, pointerType: string) {
    const r = el.getBoundingClientRect()
    const y = r.top + 20
    const x0 = r.left + 40
    const pe = (type: string, x: number) =>
      new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType })
    el.dispatchEvent(pe('pointerdown', x0))
    const dist = window.innerWidth * 0.6
    for (let i = 1; i <= 12; i++) {
      window.dispatchEvent(pe('pointermove', x0 + (dist * i) / 12))
      await new Promise((res) => requestAnimationFrame(() => res(null)))
    }
    window.dispatchEvent(pe('pointerup', x0 + dist))
    // Give a drag end, had one started, time to fire its action.
    for (let i = 0; i < 6; i++) await new Promise((res) => requestAnimationFrame(() => res(null)))
  }

  it('a mouse drag at 1280px is not a swipe: no status POST', async () => {
    await page.viewport(1280, 900)
    expect(window.innerWidth).toBeGreaterThanOrEqual(768)
    const calls = stubApi()
    const host = await mount(wrap(<Digest />), { ready: (h) => card(h, 'p-new'), label: 'digest card' })
    await drag(card(host, 'p-new')!, 'mouse')
    await new Promise((res) => setTimeout(res, 300))
    expect(calls.filter((x) => x.method === 'POST' && x.url.endsWith('/status'))).toEqual([])
    expect(document.body.textContent).not.toContain('Undo')
  })

  it('a mouse drag on a phone-width window is not a swipe either', async () => {
    await page.viewport(390, 844)
    const calls = stubApi()
    const host = await mount(wrap(<Digest />), { ready: (h) => card(h, 'p-new'), label: 'digest card' })
    await drag(card(host, 'p-new')!, 'mouse')
    await new Promise((res) => setTimeout(res, 300))
    expect(calls.filter((x) => x.method === 'POST' && x.url.endsWith('/status'))).toEqual([])
  })

  it('Undo waits for the swipe write to settle before it posts', async () => {
    await page.viewport(390, 844)
    const calls = stubApi()
    // Hold the first status POST open until the test releases it.
    let release!: () => void
    const held = new Promise<void>((res) => { release = res })
    const inner = (globalThis.fetch as unknown as { getMockImplementation: () => (u: string, i?: RequestInit) => Promise<unknown> }).getMockImplementation()
    let first = true
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const out = inner(url, init)
      if (first && init?.method === 'POST' && url.endsWith('/status')) { first = false; await held }
      return out
    }))
    const host = await mount(wrap(<Digest />), { ready: (h) => card(h, 'p-new'), label: 'digest card' })
    await drag(card(host, 'p-new')!, 'touch')
    const undo = await waitFor(() => button(document.body, 'Undo'), 'undo toast')
    undo.click()
    await new Promise((res) => setTimeout(res, 200))
    // The save is still in flight, so the Undo has not posted.
    expect(calls.filter((x) => x.method === 'POST' && x.url.endsWith('/status')).map((x) => x.body)).toEqual([{ status: 'saved' }])
    release()
    await expect.poll(() => calls.filter((x) => x.method === 'POST' && x.url.endsWith('/status')).map((x) => x.body))
      .toEqual([{ status: 'saved' }, { status: 'new' }])
  })
})

// Slack-style threads: a root shows a compact summary row (faces, N replies,
// New, last reply); clicking expands the replies in place, oldest first, with
// the reply box at the bottom. Dismiss and the two-step delete stay on the root
// and the replies for the PI. Real Chromium (vitest.config.ts browser mode).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import { DayActivityFeed } from '../components/today/DayActivityFeed'
import { ActivityThread } from '../components/activity/ActivityThread'
import { threadParticipants } from '../components/activity/threadParticipants'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
beforeEach(() => { localStorage.clear(); replies = [...ALL_REPLIES] })

const row = (over: Record<string, unknown>) => ({
  id: 'r', entity_type: 'day', entity_id: '2026-10-09', project_id: null, kind: 'comment', visibility: 'author',
  actor_slug: 'nick-ingraham', body: 'x', mentions_json: null, update_type: null, metadata_json: null,
  created_at: '2026-10-09 13:00:00', reply_count: 0, ...over,
})
const user = { email: 'x@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true, canShowAllProjects: false, piResolved: true }

function wrap(node: ReactElement): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider><MemoryRouter><div className="tk">{node}</div></MemoryRouter></UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

// Roots arrive newest first (server order); replies arrive scrambled on purpose.
const roots = [
  row({ id: 'new', body: '@hermes second ask', created_at: '2026-10-09 15:00:00' }),
  row({
    id: 'old', body: '@hermes first ask', created_at: '2026-10-09 12:00:00', reply_count: 2,
    last_reply_at: '2026-10-09 12:20:00', last_reply_actor: 'claude-ai', participants: 'lianne-siegel,claude-ai',
  }),
]
const ALL_REPLIES = [
  row({ id: 'b', parent_id: 'old', actor_slug: 'claude-ai', body: 'second answer', created_at: '2026-10-09 12:20:00' }),
  row({ id: 'a', parent_id: 'old', actor_slug: 'lianne-siegel', body: 'first answer', created_at: '2026-10-09 12:10:00' }),
]
let replies = [...ALL_REPLIES]

const SEEN_AT = '2026-10-09 12:05:00' // server-side entity_seen: before the newest reply
function stub() {
  const f = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && String(url).endsWith('/delete')) {
      const id = String(url).split('/')[3]
      replies = replies.filter((r) => r.id !== id)
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }
    return {
      ok: true, status: 200,
      json: async () => (String(url).includes('/replies') ? { data: replies }
        : String(url).includes('/seen/unseen') ? { data: [{ entity_type: 'day', entity_id: '2026-10-09', new_count: 1, latest_at: '2026-10-09 12:20:00', seen_at: SEEN_AT, title: null, project_slug: null }] }
        : { data: roots, hidden_count: 0 }),
    }
  })
  vi.stubGlobal('fetch', f)
  return f
}
const labels = (h: HTMLElement) => [...h.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? '')
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ready = (h: HTMLElement) => h.querySelector('.tk-thr')

describe('Slack-style threads', () => {
  it('collapsed: roots keep order, replies are not separate items, summary shows faces, count, New', async () => {
    stub()
    const host = await mount(wrap(<DayActivityFeed dateKey="2026-10-09" />), { ready, label: 'DayActivityFeed' })
    await wait(50)
    const text = host.textContent ?? ''
    expect(text.indexOf('second ask')).toBeLessThan(text.indexOf('first ask'))
    expect(text).not.toContain('first answer')
    const sum = host.querySelector('.tk-thr')!
    expect(sum.textContent).toContain('2 replies')
    expect(sum.textContent).toContain('New')
    expect(sum.querySelectorAll('.tk-face').length).toBe(3) // Nick, Lianne, Hermes
    expect(sum.querySelector('.tk-herm')).not.toBeNull()
    expect(sum.getAttribute('aria-expanded')).toBe('false')
    vi.unstubAllGlobals()
  })

  it('expand: replies oldest to newest, reply box at the bottom, New clears, collapse hides', async () => {
    stub()
    const host = await mount(wrap(<DayActivityFeed dateKey="2026-10-09" />), { ready, label: 'DayActivityFeed' })
    ;(host.querySelector('.tk-thr') as HTMLButtonElement).click()
    for (let i = 0; i < 50 && !(host.textContent ?? '').includes('second answer'); i++) await wait(10)
    const text = host.textContent ?? ''
    expect(text.indexOf('first answer')).toBeLessThan(text.indexOf('second answer'))
    expect(host.querySelector('textarea')).not.toBeNull()
    expect(host.querySelector('.tk-thr')!.textContent).not.toContain('New')
    ;(host.querySelector('.tk-thr') as HTMLButtonElement).click()
    await wait(30)
    expect(host.textContent).not.toContain('first answer')
    vi.unstubAllGlobals()
  })

  it('PI keeps dismiss and two-step delete on the Hermes roots and on the replies', async () => {
    stub()
    const host = await mount(wrap(<DayActivityFeed dateKey="2026-10-09" />), { ready, label: 'DayActivityFeed' })
    expect(labels(host).filter((l) => l === 'Dismiss thread').length).toBe(2)
    ;(host.querySelector('.tk-thr') as HTMLButtonElement).click()
    for (let i = 0; i < 50 && !(host.textContent ?? '').includes('second answer'); i++) await wait(10)
    expect(labels(host).filter((l) => l === 'Delete entry').length).toBe(4)
    vi.unstubAllGlobals()
  })

  it('participants: root author first, then repliers in order, no repeats', () => {
    expect(threadParticipants('nick-ingraham', 'lianne-siegel,claude-ai,nick-ingraham')).toEqual(['nick-ingraham', 'lianne-siegel', 'claude-ai'])
    expect(threadParticipants('nick-ingraham', null)).toEqual(['nick-ingraham'])
  })

  it('a reply from the viewer alone never shows New', async () => {
    stub()
    const mine = { ...roots[1], last_reply_actor: 'nick-ingraham', participants: 'nick-ingraham' }
    const host = await mount(wrap(<ActivityThread root={mine as never} invalidateKeys={[]} />), { ready, label: 'ActivityThread' })
    await wait(50)
    expect(host.querySelector('.tk-thr')!.textContent).not.toContain('New')
    vi.unstubAllGlobals()
  })

  it('the summary row costs no replies request; replies load only on expand', async () => {
    const f = stub()
    const host = await mount(wrap(<DayActivityFeed dateKey="2026-10-09" />), { ready, label: 'DayActivityFeed' })
    await wait(80)
    expect(f.mock.calls.some((c) => String(c[0]).includes('/replies'))).toBe(false)
    ;(host.querySelector('.tk-thr') as HTMLButtonElement).click()
    for (let i = 0; i < 50 && !f.mock.calls.some((c) => String(c[0]).includes('/replies')); i++) await wait(10)
    expect(f.mock.calls.some((c) => String(c[0]).includes('/api/activity/old/replies'))).toBe(true)
    vi.unstubAllGlobals()
  })

  it('Reply opens the thread and reads it: New clears after a collapse', async () => {
    stub()
    const host = await mount(wrap(<DayActivityFeed dateKey="2026-10-09" />), { ready, label: 'DayActivityFeed' })
    await wait(50)
    expect(host.querySelector('.tk-thr')!.textContent).toContain('New')
    const replyBtn = [...host.querySelectorAll('button')].filter((b) => b.textContent === 'Reply')[1] as HTMLButtonElement
    replyBtn.click()
    for (let i = 0; i < 50 && !(host.textContent ?? '').includes('second answer'); i++) await wait(10)
    expect(localStorage.getItem('thread-seen:old')).toBe('2026-10-09 12:20:00')
    ;(host.querySelector('.tk-thr') as HTMLButtonElement).click() // collapse
    await wait(30)
    expect(host.querySelector('.tk-thr')!.textContent).not.toContain('New')
    vi.unstubAllGlobals()
  })

  it('deleting a reply removes it from the open thread', async () => {
    const f = stub()
    const host = await mount(wrap(<DayActivityFeed dateKey="2026-10-09" />), { ready, label: 'DayActivityFeed' })
    ;(host.querySelector('.tk-thr') as HTMLButtonElement).click()
    for (let i = 0; i < 50 && !(host.textContent ?? '').includes('second answer'); i++) await wait(10)
    const replyRow = [...host.querySelectorAll('.detail-card')].find((c) => (c.textContent ?? '').includes('first answer'))!
    ;(replyRow.querySelector('button[aria-label="Delete entry"]') as HTMLButtonElement).click()
    await wait(30)
    ;(replyRow.querySelector('button[aria-label="Click again to delete permanently"]') as HTMLButtonElement).click()
    for (let i = 0; i < 80 && (host.textContent ?? '').includes('first answer'); i++) await wait(10)
    expect(f.mock.calls.some((c) => String(c[0]).includes('/api/activity/a/delete'))).toBe(true)
    expect(host.textContent).not.toContain('first answer')
    expect(host.textContent).toContain('second answer')
    vi.unstubAllGlobals()
  })
})

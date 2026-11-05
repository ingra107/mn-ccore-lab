// SmartCompose and its two controlled callers: a post clears only the text it sent.
// Text written while the post was pending was never sent, so it stays. Real Chromium.
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SmartCompose from '../components/SmartCompose'
import { ActivityThread } from '../components/activity/ActivityThread'
import MeetingActivityFeed from '../components/meetings/MeetingActivityFeed'
import { UndoToastProvider } from '../components/UndoToast'
import { AuthContext } from '../hooks/useAuth'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const user = { email: 'x@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true, canShowAllProjects: true, piResolved: true }

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const wrap = (node: ReactElement) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false } as never}>
      <UndoToastProvider><MemoryRouter>{node}</MemoryRouter></UndoToastProvider>
    </AuthContext.Provider>
  </QueryClientProvider>
)

function typeInto(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const send = (el: HTMLTextAreaElement) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))
const box = (h: Element) => h.querySelector('textarea') as HTMLTextAreaElement
const composerReady = { ready: (h: HTMLElement) => h.querySelector('textarea'), label: 'composer' }

function stubFetch(onPost?: () => Promise<Response>) {
  const posts: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(String(input)); if (onPost) return onPost() }
    return json({ data: [], hidden_count: 0 })
  }))
  return posts
}

describe('SmartCompose, owning its own text', () => {
  it('keeps what was typed while the post was pending', async () => {
    stubFetch()
    const gate = deferred<void>()
    const onSubmit = vi.fn(() => gate.promise)
    const host = await mount(wrap(<SmartCompose onSubmit={onSubmit} />), composerReady)
    typeInto(box(host), 'message A')
    await waitFor(() => box(host).value === 'message A', 'typed A')
    send(box(host))
    await waitFor(() => onSubmit.mock.calls.length === 1, 'submitted')
    typeInto(box(host), 'draft B')
    await waitFor(() => box(host).value === 'draft B', 'typed B')
    gate.resolve()
    await new Promise((r) => setTimeout(r, 50))
    expect(box(host).value).toBe('draft B')
  })

  it('clears unchanged text', async () => {
    stubFetch()
    const host = await mount(wrap(<SmartCompose onSubmit={async () => {}} />), composerReady)
    typeInto(box(host), 'message A')
    await waitFor(() => box(host).value === 'message A', 'typed A')
    send(box(host))
    await waitFor(() => box(host).value === '', 'cleared')
  })

  it('a typed @hermes ask on a task keeps later text too', async () => {
    const gate = deferred<Response>()
    stubFetch(() => gate.promise)
    const host = await mount(wrap(<SmartCompose taskId="task_a" />), composerReady)
    typeInto(box(host), '@hermes a question')
    await waitFor(() => box(host).value === '@hermes a question', 'typed')
    send(box(host))
    await new Promise((r) => setTimeout(r, 20))
    typeInto(box(host), 'draft B')
    await waitFor(() => box(host).value === 'draft B', 'typed B')
    gate.resolve(json({ data: {}, hermes: { dispatched: true } }, 201))
    await new Promise((r) => setTimeout(r, 50))
    expect(box(host).value).toBe('draft B')
  })
})

describe('the reply box in a thread', () => {
  const root = {
    id: 'root1', entity_type: 'task', entity_id: 't', project_id: null, kind: 'comment', visibility: 'team', actor_slug: 'nate-mesfin',
    body: 'a comment', mentions_json: null, update_type: null, metadata_json: null, created_at: '2026-10-09 13:00:00', reply_count: 0,
  }
  const thread = () => wrap(<ActivityThread root={root as never} invalidateKeys={[]} startComposing />)

  it('keeps what was typed while the reply was pending, and stays open', async () => {
    const gate = deferred<Response>()
    stubFetch(() => gate.promise)
    const host = await mount(thread(), composerReady)
    typeInto(box(host), 'reply A')
    await waitFor(() => box(host).value === 'reply A', 'typed A')
    send(box(host))
    await new Promise((r) => setTimeout(r, 20))
    typeInto(box(host), 'draft B')
    await waitFor(() => box(host).value === 'draft B', 'typed B')
    gate.resolve(json({ data: {} }, 201))
    await new Promise((r) => setTimeout(r, 50))
    expect(box(host).value).toBe('draft B')
  })

  it('clears unchanged text', async () => {
    stubFetch(async () => json({ data: {} }, 201))
    const host = await mount(thread(), composerReady)
    typeInto(box(host), 'reply A')
    await waitFor(() => box(host).value === 'reply A', 'typed A')
    send(box(host))
    await waitFor(() => box(host).value === '', 'cleared')
  })
})

describe('the meeting discussion box', () => {
  it('keeps what was typed while the post was pending', async () => {
    const gate = deferred<Response>()
    stubFetch(() => gate.promise)
    const host = await mount(wrap(<MeetingActivityFeed meetingId="mtg1" />), composerReady)
    typeInto(box(host), 'remark A')
    await waitFor(() => box(host).value === 'remark A', 'typed A')
    send(box(host))
    await new Promise((r) => setTimeout(r, 20))
    typeInto(box(host), 'draft B')
    await waitFor(() => box(host).value === 'draft B', 'typed B')
    gate.resolve(json({ data: {} }, 201))
    await new Promise((r) => setTimeout(r, 50))
    expect(box(host).value).toBe('draft B')
  })

  it('clears unchanged text', async () => {
    stubFetch(async () => json({ data: {} }, 201))
    const host = await mount(wrap(<MeetingActivityFeed meetingId="mtg1" />), composerReady)
    typeInto(box(host), 'remark A')
    await waitFor(() => box(host).value === 'remark A', 'typed A')
    send(box(host))
    await waitFor(() => box(host).value === '', 'cleared')
  })
})

// The task composer and the artifact composer: the lock reaches the server in
// both modes (S01), a draft belongs to its task (S02), and a post clears only the
// text it sent (S03). Real Chromium, the real component, fetch stubbed.
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { OverviewQuickAdd } from '../components/tasks/TaskDetailPanel'
import { UndoToastProvider } from '../components/UndoToast'
import { AuthContext } from '../hooks/useAuth'
import ArtifactPage from '../pages/portal/ArtifactPage'
import { _resetTaskDraftsForTests } from '../lib/taskDrafts'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

cleanupMountsAfterEach()
beforeEach(() => { _resetTaskDraftsForTests() })
afterEach(() => { vi.unstubAllGlobals() })

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Call = { url: string; method: string; body: unknown }
function stubFetch(answer: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined = () => undefined) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
    return (await answer(url, init)) ?? json({ data: [] })
  }))
  return calls
}

function deferred() {
  let resolve!: (r: Response) => void
  const promise = new Promise<Response>((r) => { resolve = r })
  return { promise, resolve }
}

function tree(node: React.ReactNode, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UndoToastProvider>{node}</UndoToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function typeInto(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const composerReady = { ready: (h: HTMLElement) => h.querySelector('textarea'), label: 'composer' }
const box = (h: Element) => h.querySelector('textarea') as HTMLTextAreaElement
const until = async <T,>(get: () => T, label: string): Promise<NonNullable<T>> => {
  await waitFor(() => !!get(), label)
  return get() as NonNullable<T>
}
const buttonNamed = (h: Element, name: RegExp) =>
  [...h.querySelectorAll('button')].find((b) => name.test(b.getAttribute('aria-label') ?? '') || name.test((b.textContent ?? '').trim()))

async function post(host: HTMLElement) {
  await until(() => host.querySelector('button[type="submit"]'), 'post button')
  host.querySelector('form')!.requestSubmit()
}
const pickNote = async (host: HTMLElement) => {
  (await until(() => buttonNamed(host, /^Note$/), 'note mode')).click()
  await waitFor(() => host.querySelector('textarea')?.placeholder.includes('Log progress') === true, 'note mode on')
}
const lock = async (host: HTMLElement) => {
  (await until(() => host.querySelector<HTMLElement>('button[role="switch"]'), 'lock')).click()
}

describe('S01: the lock reaches the server in both modes', () => {
  async function send(mode: 'comment' | 'note', locked: boolean) {
    const calls = stubFetch()
    const host = await mount(tree(<OverviewQuickAdd taskId="task_a" onJumpToTab={() => {}} />), composerReady)
    if (mode === 'note') await pickNote(host)
    typeInto(box(host), 'ordinary text')
    if (locked) await lock(host)
    await post(host)
    return until(() => calls.find((c) => c.method === 'POST'), 'the post')
  }

  it('Note, locked: the body says visibility author', async () => {
    const c = await send('note', true)
    expect(c.url).toMatch(/\/api\/tasks\/task_a\/updates$/)
    expect(c.body).toEqual({ content: 'ordinary text', update_type: 'progress', visibility: 'author' })
  })

  it('Note, unlocked: the body carries no visibility', async () => {
    const c = await send('note', false)
    expect(c.url).toMatch(/\/api\/tasks\/task_a\/updates$/)
    expect(c.body).toEqual({ content: 'ordinary text', update_type: 'progress' })
  })

  it('Comment, locked: the body says @me', async () => {
    const c = await send('comment', true)
    expect(c.url).toMatch(/\/api\/tasks\/task_a\/comments$/)
    expect(c.body).toEqual({ content: '@me ordinary text' })
  })

  it('Comment, unlocked: the body is the text', async () => {
    const c = await send('comment', false)
    expect(c.body).toEqual({ content: 'ordinary text' })
  })

  it('the Note tooltip stops saying the team will see it once the lock is on', async () => {
    stubFetch()
    const host = await mount(tree(<OverviewQuickAdd taskId="task_a" onJumpToTab={() => {}} />), composerReady)
    typeInto(box(host), 'x')
    const noteBtn = await until(() => buttonNamed(host, /^Note$/), 'note mode')
    expect(noteBtn.getAttribute('title')).toMatch(/visible to the team/)
    await lock(host)
    await waitFor(() => /only you/i.test(buttonNamed(host, /^Note$/)!.getAttribute('title') ?? ''), 'the tooltip follows the lock')
  })
})

describe('S02: a draft belongs to its task', () => {
  // A plain root, so the test can re-render one mounted composer with another
  // task id, which is what the panel does on a dependency click or next-task.
  function mountSwitchable() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const show = (taskId: string) => act(async () => {
      root.render(tree(<OverviewQuickAdd taskId={taskId} onJumpToTab={() => {}} />, qc))
    })
    const stop = () => { root.unmount(); host.remove() }
    return { host, show, stop }
  }

  it("A's draft does not appear on B, and comes back on A", async () => {
    stubFetch()
    const { host, show, stop } = mountSwitchable()
    await show('task_a')
    await until(() => box(host), 'composer')
    typeInto(box(host), 'draft for A')
    await waitFor(() => box(host).value === 'draft for A', 'typed')
    await show('task_b')
    await waitFor(() => box(host).value === '', "B's box is empty")
    await show('task_a')
    await waitFor(() => box(host).value === 'draft for A', "A's draft is back")
    stop()
  })

  it('a locked draft keeps its lock when the person comes back to it', async () => {
    const calls = stubFetch()
    const { host, show, stop } = mountSwitchable()
    await show('task_a')
    await until(() => box(host), 'composer')
    typeInto(box(host), 'private draft')
    await lock(host)
    await show('task_b')
    await waitFor(() => box(host).value === '', "B's box is empty")
    await show('task_a')
    await waitFor(() => box(host).value === 'private draft', "A's draft is back")
    await post(host)
    const sent = await until(() => calls.find((c) => c.method === 'POST'), 'the post')
    expect(sent.body).toEqual({ content: '@me private draft' })
    stop()
  })

  it("an upload started on A lands in A's draft, not in B's box", async () => {
    const gate = deferred()
    const up = stubFetch((url) => {
      if (url.endsWith('/api/upload/url')) return gate.promise
      if (url.endsWith('/api/upload/done')) return json({ data: { url: 'https://r2.test/notes.txt' } })
      return undefined
    })
    const { host, show, stop } = mountSwitchable()
    await show('task_a')
    await until(() => box(host), 'composer')
    typeInto(box(host), 'x')
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    const dt = new DataTransfer()
    dt.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }))
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => up.some((c) => c.url.endsWith('/api/upload/url')), 'the upload started')
    await show('task_b')
    await waitFor(() => box(host).value === '', "B's box is empty")
    gate.resolve(json({ data: { uploadUrl: 'https://r2.test/put', key: 'k', ticket: 't' } }))
    await waitFor(() => up.some((c) => c.url.endsWith('/api/upload/done')), 'the upload finished')
    await waitFor(() => /Attached notes\.txt/.test(document.body.textContent ?? ''), 'the toast')
    expect(box(host).value).toBe('')
    await show('task_a')
    await waitFor(() => box(host).value.includes('notes.txt'), "the link is in A's draft")
    stop()
  })

  it('a post that lands after switching away still clears the draft it sent', async () => {
    const gate = deferred()
    stubFetch((_url, init) => (init?.method === 'POST' ? gate.promise : undefined))
    const { host, show, stop } = mountSwitchable()
    await show('task_a')
    await until(() => box(host), 'composer')
    typeInto(box(host), 'sent from A')
    await post(host)
    await show('task_b')
    await waitFor(() => box(host).value === '', "B's box is empty")
    gate.resolve(json({ data: {} }, 201))
    await waitFor(() => /Comment posted/.test(document.body.textContent ?? ''), 'it landed')
    await show('task_a')
    await waitFor(() => box(host).value === '', 'the sent draft does not return')
    stop()
  })
})

describe('S03: a post clears only the text it sent', () => {
  it('task composer: text written while the post is pending survives', async () => {
    const gate = deferred()
    stubFetch((_url, init) => (init?.method === 'POST' ? gate.promise : undefined))
    const host = await mount(tree(<OverviewQuickAdd taskId="task_a" onJumpToTab={() => {}} />), composerReady)
    typeInto(box(host), 'message A')
    await post(host)
    typeInto(box(host), 'draft B')
    await waitFor(() => box(host).value === 'draft B', 'typed B')
    gate.resolve(json({ data: {} }, 201))
    await waitFor(() => /Comment posted/.test(document.body.textContent ?? ''), 'A landed')
    expect(box(host).value).toBe('draft B')
  })

  it('task composer: unchanged text clears on success', async () => {
    stubFetch()
    const host = await mount(tree(<OverviewQuickAdd taskId="task_a" onJumpToTab={() => {}} />), composerReady)
    typeInto(box(host), 'message A')
    await post(host)
    await waitFor(() => box(host).value === '', 'cleared')
  })

  const artifact = { id: 'art_1', title: 'The doc', body_md: '# hi', version: 1, created_by: 'bob', created_at: '2026-11-01 00:00:00', updated_at: '2026-11-01 00:00:00', content_type: 'markdown', visibility: 'team', versions: [], tags: [] }
  const user = { email: 'bob@umn.edu', slug: 'bob', name: 'Bob', isAuthenticated: true, isPi: false, isMember: true, canShowAllProjects: false, piResolved: true }
  const page = () => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false } as never}>
        <UndoToastProvider>
          <MemoryRouter initialEntries={['/portal/artifacts/art_1']}>
            <Routes><Route path="/portal/artifacts/:id" element={<ArtifactPage />} /></Routes>
          </MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
  const artifactStub = (onPost: () => Response | Promise<Response>) => stubFetch((url, init) => {
    if (init?.method === 'POST') return onPost()
    if (url.includes('/activity')) return json({ data: [], hidden_count: 0 })
    if (url.includes('/api/artifacts/art_1')) return json({ data: artifact })
    return undefined
  })
  const artifactReady = { ready: (h: HTMLElement) => h.querySelector('textarea[aria-label="Add a comment"]'), label: 'artifact composer' }

  it('artifact composer: text written while the post is pending survives', async () => {
    const gate = deferred()
    artifactStub(() => gate.promise)
    const host = await mount(page(), artifactReady)
    const area = () => host.querySelector('textarea[aria-label="Add a comment"]') as HTMLTextAreaElement
    typeInto(area(), 'message A')
    await waitFor(() => buttonNamed(host, /^Comment$/)?.disabled === false, 'post ready')
    buttonNamed(host, /^Comment$/)!.click()
    await until(() => buttonNamed(host, /Posting/), 'posting')
    typeInto(area(), 'draft B')
    await waitFor(() => area().value === 'draft B', 'typed B')
    gate.resolve(json({ data: {} }, 201))
    await waitFor(() => /Comment posted/.test(document.body.textContent ?? ''), 'A landed')
    expect(area().value).toBe('draft B')
  })

  it('artifact composer: unchanged text clears on success, and the lock resets', async () => {
    artifactStub(() => json({ data: {} }, 201))
    const host = await mount(page(), artifactReady)
    const area = () => host.querySelector('textarea[aria-label="Add a comment"]') as HTMLTextAreaElement
    typeInto(area(), 'message A')
    buttonNamed(host, /Visible to team/)!.click()
    await until(() => buttonNamed(host, /Only you/), 'locked')
    await waitFor(() => buttonNamed(host, /^Comment$/)?.disabled === false, 'post ready')
    buttonNamed(host, /^Comment$/)!.click()
    await waitFor(() => area().value === '', 'cleared')
    await until(() => buttonNamed(host, /Visible to team/), 'lock reset')
  })
})

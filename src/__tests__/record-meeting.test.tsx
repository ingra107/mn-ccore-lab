// Meetings (fable audit and live walk, 2026-11-05).
//   F16     a refused POST keeps the form and says so; no page reload.
//   walk 5  the action-item hint names each token's job.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import Meetings from '../pages/Meetings'
import meetingsSource from '../pages/Meetings.tsx?raw'
import meetingDetailSource from '../pages/MeetingDetail.tsx?raw'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()

const pi: AuthUser = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}

let routes: Record<string, unknown> = {}
let requests: { path: string; method: string }[] = []
let postStatus = 200
const realFetch = window.fetch
beforeEach(() => {
  routes = { '/api/meetings/cadence-check': { recommendation: 'no_upcoming', reasons: [], data: { recommendation: 'no_upcoming', reasons: [] } } }
  requests = []
  postStatus = 200
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin).pathname
    const method = init?.method ?? 'GET'
    requests.push({ path, method })
    if (method === 'POST') return new Response(JSON.stringify({ data: {} }), { status: postStatus, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify(routes[path] ?? { data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof window.fetch
})
afterEach(() => { window.fetch = realFetch })

function tree(node: React.ReactElement, user: AuthUser = pi, start = '/') {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider>
          <MemoryRouter initialEntries={[start]}>
            <Routes><Route path="*" element={node} /></Routes>
          </MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

const setValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('Record meeting', () => {
  async function submit(status: number) {
    postStatus = status
    const host = await mount(tree(<Meetings />, pi, '/?create=true'), {
      ready: () => document.querySelector('#new-meeting-date'),
      label: 'record form',
    })
    setValue(document.querySelector('#new-meeting-date') as HTMLInputElement, '2026-11-06')
    const title = document.querySelector('#new-meeting-title') as HTMLInputElement
    setValue(title, 'Grant sync')
    const save = await waitFor(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => /^save meeting$/i.test(b.textContent?.trim() ?? '') && !b.disabled), 'save button')
    save!.click()
    return { host, title }
  }

  it('keeps the form and says so when the server refuses', async () => {
    const { title } = await submit(500)
    await waitFor(() => /could not/i.test(document.body.textContent ?? ''), 'error toast')
    expect(title.isConnected).toBe(true)
    expect(title.value).toBe('Grant sync')
  })

  it('closes the form and refetches the list on success, with no page reload', async () => {
    const { title } = await submit(200)
    await waitFor(() => !title.isConnected, 'form closed')
    const reads = requests.filter((r) => r.path === '/api/meetings' && r.method === 'GET').length
    expect(reads).toBeGreaterThanOrEqual(2)
    expect(meetingsSource).not.toContain('window.location.reload')
  })
})

describe('Meeting action-item hint', () => {
  it('names what each token does, in the quick-add modal words', () => {
    expect(meetingDetailSource).toContain('<span>p1-p3 priority</span>')
    expect(meetingDetailSource).toContain('<span>Apr 15 due date</span>')
  })
})

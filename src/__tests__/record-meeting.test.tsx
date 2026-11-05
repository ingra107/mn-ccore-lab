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

describe('Meetings page, with a meeting and a task on it', () => {
  const rows = () => {
    routes['/api/meetings'] = { data: [{ id: 'm1', date: '2020-01-01', title: 'Lab sync', type: 'biweekly', attendees: '[]', agenda: null, notes: null, decisions: null, status: 'past', audience: 'lab', action_count: 1, open_action_count: 1 }] }
    // A task can have no description: it has only a title.
    routes['/api/tasks'] = { data: [{ id: 't1', title: 'Circulate agenda', description: null, meeting_id: 'm1', assignee: 'nick-ingraham', status: 'todo', priority: 'medium' }] }
  }
  const ready = () => document.querySelector('[data-testid="view-full-meeting"]')

  it('a linked task with no description does not take the page down', async () => {
    rows()
    await mount(tree(<Meetings />), { ready, label: 'meeting detail' })
    await waitFor(() => /1 pending/.test(document.body.textContent ?? ''), 'the task counted')
    expect(document.querySelector('[data-testid="view-full-meeting"]')).not.toBeNull()
  })

  it('shows one filled teal button: Record Meeting is primary, View Full Meeting is secondary', async () => {
    rows()
    await mount(tree(<Meetings />), { ready, label: 'meeting detail' })
    const view = document.querySelector<HTMLElement>('[data-testid="view-full-meeting"]')!
    const record = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => /Record Meeting/.test(b.textContent ?? ''))!
    expect(record.style.background).toContain('var(--job-accent-solid)')
    expect(view.style.background).not.toContain('teal')
    expect(view.style.background).not.toContain('--job-accent')
  })
})

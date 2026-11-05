// While Today's task reads are in flight, no card may claim a count or an empty
// state. /api/tasks takes seconds (3.8 MB), and until it answered the rail said
// "None. Clean slate." under Overdue and the Plan header read "1 of 2 done"
// before settling on "4 of 9". A count or label must be true: a dash waits.

import '../index.css'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import TodayPage from '../pages/portal/TodayPage'
import { SlippingCard } from '../components/today/rail/SlippingCard'
import { todayKey } from '../lib/taskGrouping'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const user = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}
const base = {
  description: '', short_title: null, status: 'todo', completed: 0, completed_at: null, project_id: null, kind: 'task',
  priority: 'high', acknowledged_at: '2026-01-01', created_at: '2026-11-01 15:00:00', updated_at: '2026-11-01 15:00:00',
}
const overdue = { ...base, id: 'task_o', title: 'Late thing', assignee: 'nick-ingraham', due_date: '2020-01-01' }
const planned = { ...base, id: 'task_p', title: 'Planned thing', assignee: 'nick-ingraham', due_date: todayKey(), planned_for: todayKey(), plan_slot: 'strip', plan_rank: 1 }
const theirs = { ...base, id: 'task_t', title: 'Theirs planned', assignee: 'someone-else', due_date: todayKey(), planned_for: todayKey(), plan_slot: 'strip', plan_rank: 2 }

function respond(status: number, body: unknown) {
  return { ok: status < 400, status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response
}

/** `own` / `others` are the two task reads: a row list answers, null holds the read pending. */
function stubFetch(own: unknown[] | null, others: unknown[] | null) {
  const never = new Promise<Response>(() => {})
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    const u = String(url)
    if (u.includes('/api/tasks')) {
      const rows = u.includes('others_of=') ? others : own
      return rows === null ? never : Promise.resolve(respond(200, { data: rows, count: rows.length }))
    }
    if (u.includes('/api/projects')) return Promise.resolve(respond(200, { data: [], count: 0 }))
    return Promise.resolve(respond(404, { error: 'not stubbed' }))
  }))
}

function page(qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider>
          <MemoryRouter><TodayPage /></MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const attention = (h: HTMLElement) => h.querySelector('[data-b2-attention]')?.textContent ?? ''
const planText = (h: HTMLElement) => h.querySelector('[data-testid="plan-section"]')?.textContent ?? ''

describe('Today makes no claim from a read that has not answered', () => {
  it('Needs attention and Completed today wait on the task read', async () => {
    stubFetch(null, null)
    const host = await mount(page(client()), { ready: (h) => !!h.querySelector('[data-b2-attention]'), label: 'rail' })
    expect(attention(host)).not.toContain('Clean slate')
    expect(attention(host)).not.toContain('None.')
    expect(attention(host)).toContain('—')
    expect(host.querySelector('[data-b2-completed] .tk-cnt')?.textContent).toBe('—')
  })

  it('Needs attention names the overdue task once the read answers', async () => {
    stubFetch([overdue], [])
    const host = await mount(page(client()), { ready: (h) => attention(h).includes('Late thing'), label: 'answered' })
    expect(attention(host)).not.toContain('Clean slate')
  })

  it('says "Clean slate" only after a read that came back empty', async () => {
    stubFetch([], [])
    const host = await mount(page(client()), { ready: (h) => attention(h).includes('Clean slate'), label: 'empty' })
    expect(attention(host)).toContain('Clean slate')
  })

  it('the Plan count waits for the others read too: a pick can sit with someone else', async () => {
    stubFetch([planned], null)
    const host = await mount(page(client()), { ready: (h) => planText(h).includes('Planned thing'), label: 'own only' })
    expect(planText(host)).not.toMatch(/\d+ of \d+ done/)
    expect(host.querySelector('[data-testid="plan-section"] .tk-cnt')?.textContent).toBe('—')
  })

  it('the Plan count shows once both reads answered', async () => {
    stubFetch([planned], [theirs])
    const host = await mount(page(client()), { ready: (h) => /\d+ of \d+ done/.test(planText(h)), label: 'both' })
    await waitFor(() => /0 of 1 done/.test(planText(host)), 'count')
  })
})

describe('SlippingCard', () => {
  it('shows no empty verdict or waiting count while the task read is out', async () => {
    const host = await mount(
      <QueryClientProvider client={client()}>
        <MemoryRouter><SlippingCard meetings={[]} tasks={[]} viewerSlug="nick-ingraham" tasksPending meetingsPending /></MemoryRouter>
      </QueryClientProvider>,
      { ready: (h) => !!h.querySelector('[data-pick="slipping"]'), label: 'slipping' },
    )
    const t = host.textContent ?? ''
    expect(t).not.toContain('Nothing has gone quiet')
    expect(t).not.toContain('No milestones')
    expect(t).not.toMatch(/\b0 waiting/)
  })
})

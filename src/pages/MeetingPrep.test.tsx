// Meeting Prep (cold audit 2, 2026-11-05):
//   G16    a refused or failed read is not "Meeting not found"
//   G21    the counts match the lists under them; a previous meeting with no items says so
//   G29    the countdown names a day and invents no hour
//   imp 2  a row opens its task
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MeetingPrep from './MeetingPrep'
import { localDateKey } from '../lib/dateUtils'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localDateKey(d) }
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Task ${id}`, description: null, kind: null, assignee: 'nate-mesfin', due_date: inDays(3), priority: 'medium', status: 'todo', completed: 0, ...extra,
})

let mounted: { host: HTMLElement; root: Root }[] = []
let prep: Record<string, unknown>
let status = 200

beforeEach(() => {
  status = 200
  prep = {
    meeting: { id: 'm1', title: 'Prep meeting', date: inDays(3), status: 'upcoming', attendees: null },
    previousMeeting: null, previousActionItems: [], recentActivity: [], upcomingDeadlines: [], overdueTasks: [], agendaItems: [],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/api/meetings/m1/prep') return status === 200 ? json({ data: prep }) : json({ error: 'refused' }, status)
    return json({ data: [] })
  }))
})

afterEach(() => {
  mounted.forEach(({ host, root }) => { act(() => root.unmount()); host.remove() })
  mounted = []
  vi.unstubAllGlobals()
})

async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/portal/meetings/m1/prep']}>
          <Routes><Route path="/portal/meetings/:id/prep" element={<MeetingPrep />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  })
  mounted.push({ host, root })
  await expect.poll(() => host.textContent).not.toBe('')
  return host
}

describe('MeetingPrep', () => {
  it('a 403 or 500 says the read failed, with a retry, not "Meeting not found"', async () => {
    for (const code of [403, 500]) {
      status = code
      const h = await mount()
      await expect.poll(() => h.querySelector('button')?.textContent ?? '').toMatch(/retry/i)
      expect(h.textContent).not.toContain('not found')
    }
  })

  it('a 404 is still "not found"', async () => {
    status = 404
    const h = await mount()
    await expect.poll(() => h.textContent).toMatch(/not found/i)
  })

  it('counts match the lists: the rest of the overdue and deadline rows are one click away', async () => {
    prep.overdueTasks = Array.from({ length: 7 }, (_, i) => row(`o${i}`, { due_date: inDays(-3) }))
    prep.upcomingDeadlines = Array.from({ length: 11 }, (_, i) => row(`d${i}`))
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('Task o4')
    expect(h.textContent).not.toContain('Task o5')
    expect(h.textContent).not.toContain('Task d8')
    expect(h.textContent).toMatch(/Show 2 more overdue \(2 hidden\)/)
    expect(h.textContent).toMatch(/Show 3 more deadlines \(3 hidden\)/)
    const more = [...h.querySelectorAll('button')].find((b) => /Show 2 more/.test(b.textContent ?? ''))!
    await act(async () => { more.click() })
    expect(h.textContent).toContain('Task o6')
  })

  it('a previous meeting with no action items says so, and no previous meeting says that', async () => {
    prep.previousMeeting = { id: 'm0', date: '2026-09-22', title: 'Last time' }
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('No action items from Sep 22')
    expect(h.textContent).not.toContain('No previous meeting found')
    prep.previousMeeting = null
    const h2 = await mount()
    await expect.poll(() => h2.textContent).toContain('No previous meeting found')
  })

  it('the countdown names a day and no hour, whatever the meeting time', async () => {
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('In 3 days')
    expect(h.textContent).not.toMatch(/\d+h\b/)
    expect(h.textContent).not.toMatch(/until meeting/)
    prep.meeting = { ...(prep.meeting as object), date: inDays(0) }
    const h2 = await mount()
    await expect.poll(() => h2.textContent).toContain('Today')
  })

  it('every row opens its task', async () => {
    prep.overdueTasks = [row('o1', { due_date: inDays(-3) })]
    prep.upcomingDeadlines = [row('d1')]
    prep.previousMeeting = { id: 'm0', date: '2026-09-22', title: 'Last time' }
    prep.previousActionItems = [row('p1'), row('p2', { completed: 1 })]
    const h = await mount()
    await expect.poll(() => h.textContent).toContain('Task o1')
    const hrefs = [...h.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    for (const id of ['o1', 'd1', 'p1', 'p2']) expect(hrefs).toContain(`/portal/my-tasks?open=${id}`)
  })
})

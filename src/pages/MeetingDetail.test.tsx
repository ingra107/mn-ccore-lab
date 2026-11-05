// The meeting page (cold audit 2, 2026-11-05):
//   G02/imp 1  a decision logged here shows here; the form starts on the meeting's project
//   G15        a failed agenda reorder says so and puts the order back
//   G17        the lab switch's aria-checked is the string form (Rule 39)
//   G26        Copy summary copies the list the page shows, with first names
//   imp 11     an attendee chip links to the member page
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import MeetingDetail from './MeetingDetail'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const USER: AuthUser = {
  email: 'dan-shyu@umn.edu', slug: 'dan-shyu', isAuthenticated: true, isPi: false, isMember: true, canShowAllProjects: false, piResolved: true,
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const task = (id: string, extra: Record<string, unknown>) => ({
  id, title: id, short_title: null, description: null, assignee: 'nick-ingraham', status: 'todo', completed: 0, due_date: null, priority: 'medium', project_id: null, meeting_id: 'm1', ...extra,
})

let mounted: { host: HTMLElement; root: Root }[] = []
let meeting: Record<string, unknown>
let posts: { url: string; body: Record<string, unknown> }[] = []
let reorderStatus = 200
let writes: string[] = []

beforeEach(() => {
  posts = []
  writes = []
  reorderStatus = 200
  meeting = {
    id: 'm1', date: '2026-10-06', title: 'A meeting', type: 'ad-hoc', status: 'upcoming', audience: 'lab',
    attendees: JSON.stringify(['nate-mesfin', 'someone@stanford.edu']), agenda: '[]', notes: null,
    decisions: JSON.stringify(['Pushed by the debrief']), tags: null, granted_projects: null, source_id: null,
    can_manage_access: true,
    action_items: [],
    agenda_items: [],
    logged_decisions: [{ id: 'dec-1', title: 'Use CLIF 2.1 for the cohort', decided_by: 'nate-mesfin', outcome: null, outcome_status: 'pending', created_at: '2026-10-06 10:00:00' }],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') {
      posts.push({ url, body: JSON.parse(String(init.body ?? '{}')) })
      if (url.endsWith('/agenda/reorder')) return reorderStatus === 200 ? json({ data: { ok: true } }) : json({ error: 'nope' }, reorderStatus)
      return json({ data: { id: 'x' } })
    }
    if (url === '/api/meetings/m1') return json({ data: meeting })
    if (url.startsWith('/api/projects') && !url.includes('products')) {
      return json({ data: [
        { id: 'proj_a', slug: 'alpha', title: 'Alpha project', short_name: 'Alpha', status: 'active', category: 'MNCCORE' },
        { id: 'proj_b', slug: 'beta', title: 'Beta project', short_name: 'Beta', status: 'active', category: 'MNCCORE' },
      ] })
    }
    if (url === '/api/team') return json({ data: [{ id: 'tm', slug: 'nate-mesfin', name: 'Nate Mesfin', email: 'mesfin@umn.edu', member_type: 'director' }] })
    return json({ data: [] })
  }))
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t: string) => { writes.push(t) } },
  })
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
        <AuthContext.Provider value={{ user: USER, isAuthenticated: true, isLoading: false }}>
          <UndoToastProvider>
            <MemoryRouter initialEntries={['/portal/meetings/m1']}>
              <Routes><Route path="/portal/meetings/:id" element={<MeetingDetail />} /></Routes>
            </MemoryRouter>
          </UndoToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  mounted.push({ host, root })
  await expect.poll(() => host.querySelector('[data-testid="meeting-rail"]')).not.toBeNull()
  return host
}

const buttonNamed = (h: HTMLElement, name: string | RegExp) =>
  [...h.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? ''))) as HTMLButtonElement

describe('MeetingDetail decisions', () => {
  it('shows a logged decision beside the pushed list, linked to the Decision Log', async () => {
    const h = await mount()
    expect(h.textContent).toContain('Pushed by the debrief')
    const link = [...h.querySelectorAll('a')].find((a) => a.textContent?.includes('Use CLIF 2.1')) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/portal/decisions?open=dec-1')
    expect(link.closest('li')!.textContent).toContain('Nathan')
    expect(h.textContent).not.toContain('No decisions logged yet')
  })

  it('with only a logged decision, the empty note is gone', async () => {
    meeting.decisions = null
    const h = await mount()
    expect(h.textContent).toContain('Use CLIF 2.1')
    expect(h.textContent).not.toContain('No decisions logged yet')
  })

  it("Log decision starts on the meeting's one project, and sends it", async () => {
    meeting.granted_projects = JSON.stringify([{ id: 'proj_b', slug: 'beta', short_name: 'Beta', title: 'Beta project' }])
    const h = await mount()
    await act(async () => { buttonNamed(h, 'Log decision').click() })
    await expect.poll(() => h.querySelector<HTMLSelectElement>('select[aria-label="Decision project"]')?.value).toBe('beta')
    const input = h.querySelector<HTMLInputElement>('input[placeholder="What was decided?"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'A new call')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { buttonNamed(h, 'Save').click() })
    await expect.poll(() => posts.find((p) => p.url === '/api/decisions')?.body.project_slug).toBe('beta')
    expect(posts.find((p) => p.url === '/api/decisions')!.body.meeting_id).toBe('m1')
  })

  it('a meeting on two projects starts on no project', async () => {
    meeting.tags = JSON.stringify(['alpha', 'beta'])
    const h = await mount()
    await act(async () => { buttonNamed(h, 'Log decision').click() })
    await expect.poll(() => h.querySelector<HTMLSelectElement>('select[aria-label="Decision project"]')?.value).toBe('')
  })
})

describe('MeetingDetail controls', () => {
  it('the lab switch says aria-checked in the string form (Rule 39), on and off', async () => {
    const h = await mount()
    expect(h.querySelector('button[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
    meeting.audience = 'private'
    const h2 = await mount()
    expect(h2.querySelector('button[role="switch"]')!.getAttribute('aria-checked')).toBe('false')
  })

  it('Copy summary copies the deduped open items with first names, and the logged decisions', async () => {
    meeting.action_items = [
      task('t1', { title: 'Draft the abstract', assignee: 'nate-mesfin', created_at: '2026-10-06 10:00:00' }),
      task('t2', { title: '[Carried forward] Draft the abstract', assignee: 'nate-mesfin', created_at: '2026-10-06 10:00:01' }),
      task('t3', { title: 'Already done', completed: 1, status: 'done' }),
    ]
    const h = await mount()
    await act(async () => { buttonNamed(h, 'Copy summary').click() })
    await expect.poll(() => writes.length).toBe(1)
    const text = writes[0]
    expect(text.match(/Draft the abstract/g)).toHaveLength(1)
    expect(text).toContain('Draft the abstract (Nathan)')
    expect(text).not.toContain('@')
    expect(text).not.toContain('Already done')
    expect(text).toContain('- Pushed by the debrief')
    expect(text).toContain('- Use CLIF 2.1 for the cohort')
  })

  it('an attendee on the team links to the member page; an outsider does not', async () => {
    const h = await mount()
    const rail = h.querySelector('[data-testid="meeting-rail"]')!
    const links = [...rail.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links).toContain('/portal/team/nate-mesfin')
    expect(links.some((l) => l?.includes('stanford'))).toBe(false)
  })
})

describe('MeetingDetail agenda reorder', () => {
  const drag = async (h: HTMLElement, from: number, to: number) => {
    const grips = [...h.querySelectorAll<HTMLElement>('button[aria-label="Reorder item"]')]
    const a = grips[from].getBoundingClientRect()
    const b = grips[to].getBoundingClientRect()
    const at = (x: number, y: number) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, isPrimary: true, pointerId: 1 })
    await act(async () => { grips[from].dispatchEvent(new PointerEvent('pointerdown', at(a.x + 2, a.y + 2))) })
    for (const [x, y] of [[a.x + 2, a.y + 12], [b.x + 2, (a.y + b.y) / 2], [b.x + 2, b.y + 2]]) {
      await act(async () => {
        document.dispatchEvent(new PointerEvent('pointermove', at(x, y)))
        await new Promise((r) => setTimeout(r, 30))
      })
    }
    await act(async () => { document.dispatchEvent(new PointerEvent('pointerup', at(b.x + 2, b.y + 2))) })
  }
  const order = (h: HTMLElement) => [...h.querySelectorAll('button[aria-label="Reorder item"]')].map((g) => g.parentElement!.textContent?.replace(/Added by.*/, ''))

  beforeEach(() => {
    meeting.agenda_items = ['First', 'Second', 'Third'].map((content, i) => ({ id: `ag${i}`, meeting_id: 'm1', content, added_by: 'a@umn.edu', type: 'discussion', sort_order: i + 1 }))
  })

  it('a landed reorder posts the new order and keeps it', async () => {
    const h = await mount()
    await drag(h, 0, 1)
    await expect.poll(() => posts.find((p) => p.url.endsWith('/agenda/reorder'))).toBeTruthy()
    const ids = posts.find((p) => p.url.endsWith('/agenda/reorder'))!.body.ids as string[]
    expect(ids).not.toEqual(['ag0', 'ag1', 'ag2'])
    const names: Record<string, string> = { ag0: 'First', ag1: 'Second', ag2: 'Third' }
    await expect.poll(() => order(h)).toEqual(ids.map((id) => names[id]))
  })

  it('a refused reorder says so and puts the order back', async () => {
    reorderStatus = 500
    const h = await mount()
    await drag(h, 0, 1)
    await expect.poll(() => posts.length).toBeGreaterThan(0)
    await expect.poll(() => order(h)).toEqual(['First', 'Second', 'Third'])
    await expect.poll(() => document.body.textContent, { timeout: 3000 }).toMatch(/Not saved/)
  })
})

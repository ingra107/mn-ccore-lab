// A page's numbers and controls describe what is on screen (fable audit and live
// walk, 2026-11-05).
//   F14 + walk 6  Projects: the hero counts the rows below it and says which rows.
//   F19           Grants: the list's count and pills leave with the list.
//   F20           Deadlines: the empty state claims no 90-day window.
//   F21           Deadlines: a Timeline row opens the task, as a List row does.
//   walk 2        Deadlines: an approval is not a deadline.
//   walk 3        Manuscripts names its stalled clock.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { page } from 'vitest/browser'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import Projects from '../pages/Projects'
import GrantsPage from '../pages/portal/GrantsPage'
import DeadlinesPage from '../pages/portal/DeadlinesPage'
import ManuscriptsPage from '../pages/portal/ManuscriptsPage'
import { addDaysYmd, localDateKey } from '../lib/dateUtils'
import { nowInstant } from '../lib/time'
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

describe('Projects counts', () => {
  const project = (slug: string, status: string, category = 'CLIF', updated = '2020-01-01 00:00:00') =>
    ({ id: `proj_${slug}`, slug, title: slug, status, category, updated_at: updated, last_meaningful_movement: updated })

  beforeEach(() => {
    routes['/api/projects'] = { data: [
      project('a', 'active'), project('b', 'active', 'MNCCORE', nowInstant()),
      project('c', 'waiting_external'), project('d', 'done'), project('e', 'done'),
    ] }
  })

  // Wide: on a phone this line is in the Filters sheet (phone-filter-header.test.tsx).
  beforeEach(async () => { await page.viewport(1280, 900) })
  afterEach(async () => { await page.viewport(414, 896) })

  // Hub #170: the stage tally's chips filter the list. a and c share one stage
  // (grant, Preparing); b is a manuscript.
  describe('stage tally chips', () => {
    const prod = (kind: string, kindLabel: string, stage: string, label: string, ord: number) =>
      [{ id: `pr_${stage}`, kind, kind_label: kindLabel, stage, stage_label: label, kind_sort: 1, stage_ordinal: ord, is_home: 1 }]
    beforeEach(() => {
      routes['/api/projects/products'] = { byProject: {
        proj_a: prod('grant', 'Grant application', 'preparing', 'Preparing', 1),
        proj_b: prod('manuscript', 'Manuscript', 'drafting', 'Drafting', 2),
        proj_c: prod('grant', 'Grant application', 'preparing', 'Preparing', 1),
      }, kinds: [] }
    })
    // Sorted by text: the tally lists stages in the order the list meets them.
    const chips = (h: HTMLElement) => [...h.querySelectorAll<HTMLButtonElement>('[data-testid="pj-tally"] button')].sort((x, y) => (x.textContent ?? '').localeCompare(y.textContent ?? ''))
    const heroOf = (h: HTMLElement) => h.querySelector('[data-testid="hero-number"]')?.textContent

    it('a chip is a keyboard-reachable button; pressing it filters the list, a second press clears it', async () => {
      const host = await mount(tree(<Projects />), { ready: (h) => chips(h).length === 2, label: 'chips' })
      expect(chips(host).map((b) => b.textContent)).toEqual(['Drafting 1', 'Grant application · Preparing 2'])
      expect(chips(host).every((b) => b.tabIndex === 0 && b.getAttribute('aria-pressed') === 'false')).toBe(true)
      expect(heroOf(host)).toBe('3open')
      chips(host)[1].click()
      await waitFor(() => heroOf(host) === '2open', 'filtered to the grant stage')
      // The other chip keeps its count and stays pressable; the pressed one is marked.
      expect(chips(host).map((b) => b.textContent)).toEqual(['Drafting 1', 'Grant application · Preparing 2'])
      expect(chips(host)[1].getAttribute('aria-pressed')).toBe('true')
      expect(chips(host)[0].getAttribute('aria-pressed')).toBe('false')
      chips(host)[1].click()
      await waitFor(() => heroOf(host) === '3open', 'cleared by a second press')
    })

    it('the tally total reads the rows under the pick, the chips keep their counts', async () => {
      const host = await mount(tree(<Projects />), { ready: (h) => chips(h).length === 2, label: 'chips' })
      chips(host)[0].click()
      await waitFor(() => heroOf(host) === '1open', 'filtered to Drafting')
      expect(host.querySelector('[data-testid="pj-tally"] span')?.textContent).toBe('1 project')
      expect(chips(host).map((b) => b.textContent)).toEqual(['Drafting 1', 'Grant application · Preparing 2'])
    })

    it('on Pipeline the pick does not narrow the board (no chip is there to clear it)', async () => {
      const host = await mount(tree(<Projects />), { ready: (h) => chips(h).length === 2, label: 'chips' })
      chips(host)[0].click()
      await waitFor(() => heroOf(host) === '1open', 'filtered')
      ;[...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Pipeline' || /Pipeline/.test(b.textContent ?? ''))!.click()
      await waitFor(() => heroOf(host) === '3open', 'the full list under Pipeline')
    })

    it('a pick no project holds is dropped from the URL, so it cannot come back', async () => {
      const host = await mount(tree(<Projects />, pi, '/?stage=manuscript%3Adrafting&category=CLIF'), { ready: (h) => chips(h).length > 0, label: 'chips' })
      await waitFor(() => chips(host).length === 1 && heroOf(host) === '2open', 'two CLIF projects, no pick')
      // Let the URL write land (a click in the same tick would read the old query), then go back to All groups.
      await new Promise((r) => setTimeout(r, 50))
      ;[...host.querySelectorAll('.tk-flt button')].find((b) => /^All groups/.test(b.textContent ?? ''))!.click()
      await waitFor(() => heroOf(host) === '3open', 'all groups, nothing narrowed')
      expect(chips(host).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    })

    it('counts stay correct under another filter, and a stage nothing holds is no filter', async () => {
      // ?category=CLIF leaves a and c (both Preparing); b is MN-CCORE.
      const host = await mount(tree(<Projects />, pi, '/?category=CLIF&stage=manuscript%3Adrafting'), { ready: (h) => chips(h).length > 0, label: 'chips' })
      expect(chips(host).map((b) => b.textContent)).toEqual(['Grant application · Preparing 2'])
      // the stale ?stage= matches no chip: the list is not emptied under it
      expect(heroOf(host)).toBe('2open')
      expect(chips(host)[0].getAttribute('aria-pressed')).toBe('false')
    })
  })

  it('heroes the open rows as "open", and the tab says the same', async () => {
    const host = await mount(tree(<Projects />), { ready: (h) => h.querySelector('[data-testid="hero-number"]')?.textContent === '3open', label: 'hero' })
    expect(host.textContent).toContain('2 done hidden')
    await waitFor(() => document.title.includes('3 open'), 'tab title')
  })

  it('counts the filtered rows when a filter narrows them', async () => {
    // a is stale; b moved today; c is waiting, so not "active" and not stalled.
    const host = await mount(tree(<Projects />, pi, '/?filter=stalled'), { ready: (h) => h.querySelector('[data-testid="hero-number"]')?.textContent === '1stalled', label: 'hero' })
    expect(host.textContent).toContain('1 CLIF')
    expect(host.textContent).not.toContain('MN-CCORE ·')
  })

  it('on a phone keeps Find and Filters in the header, and everything that moved in the sheet', async () => {
    await page.viewport(390, 844)
    const host = await mount(tree(<Projects />, pi, '/?filter=stalled'), { ready: (h) => h.querySelector<HTMLElement>('.tk-filters-btn'), label: 'Filters' })
    const btn = host.querySelector<HTMLElement>('.tk-filters-btn')!
    expect(btn.getAttribute('aria-label')).toBe('Filters, 1 on')
    expect(host.querySelector('[data-testid="projects-find"]')).not.toBeNull()
    expect(host.textContent).not.toContain('All groups')
    expect(host.querySelector('[data-testid="pj-tally"]')).toBeNull()
    btn.click()
    const sheet = await waitFor(() => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Filters"]'), 'the sheet')
    await waitFor(() => sheet.textContent?.includes('1 CLIF'), 'the count line, once the list has loaded')
    for (const w of ['All groups', 'MN-CCORE', 'CLIF', 'Open', 'Active', 'Any status', 'Stalled', 'Show all projects (admin)']) expect(sheet.textContent).toContain(w)
    expect(sheet.querySelector('[data-testid="pj-tally"]')).not.toBeNull()
  })
})

describe('Grants tabs', () => {
  it('shows the count and status filters on My Grants only', async () => {
    const host = await mount(tree(<GrantsPage />), {
      ready: (h) => h.querySelector('[aria-label="Grant status"]'),
      label: 'grant filters',
    })
    expect(host.textContent).toMatch(/\d+\s*grants/)
    ;[...host.querySelectorAll('button')].find((b) => b.textContent === 'Post-Award')!.click()
    await waitFor(() => !host.querySelector('[aria-label="Grant status"]'), 'filters gone on Post-Award')
    expect(host.textContent).not.toMatch(/\d+\s*grants/)
  })
})

describe('Deadlines', () => {
  it('makes no 90-day claim when empty', async () => {
    const host = await mount(tree(<DeadlinesPage />), { ready: (h) => h.textContent?.includes('The runway is clear'), label: 'empty state' })
    expect(host.textContent).not.toContain('90 days')
  })

  it('opens the task from a Timeline row', async () => {
    const today = localDateKey()
    routes['/api/tasks'] = { data: [{ id: 't1', title: 'Send the aims', description: '', assignee: 'nick-ingraham', status: 'todo', priority: 'medium', completed: 0, due_date: addDaysYmd(today, 2), created_at: '2026-01-01' }] }
    const host = await mount(tree(<DeadlinesPage />), { ready: (h) => h.textContent?.includes('Send the aims'), label: 'list' })
    const timeline = [...host.querySelectorAll<HTMLElement>('button')].find((b) => /timeline/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.title} ${b.textContent}`))!
    timeline.click()
    const row = await waitFor(() => [...host.querySelectorAll<HTMLButtonElement>('button[data-deadline-row]')].find((b) => b.textContent?.includes('Send the aims')), 'timeline row')
    row!.click()
    await waitFor(() => requests.some((r) => r.path.includes('/api/tasks/t1')) || document.querySelector('[data-testid="task-detail-panel"], [role="dialog"]'), 'task panel')
  })

  it('does not list a meeting approval as a deadline', async () => {
    const today = localDateKey()
    routes['/api/tasks'] = { data: [
      { id: 't1', title: 'Real work', description: '', assignee: 'nick-ingraham', status: 'todo', priority: 'medium', completed: 0, due_date: addDaysYmd(today, -2), created_at: '2026-01-01' },
      { id: 't2', title: 'Meeting: Sync [pending approval]', description: '', assignee: 'nick-ingraham', status: 'todo', priority: 'medium', completed: 0, due_date: addDaysYmd(today, -2), approval_status: 'pending', created_at: '2026-01-01' },
    ] }
    const host = await mount(tree(<DeadlinesPage />), { ready: (h) => h.textContent?.includes('Real work'), label: 'list' })
    expect(host.textContent).toContain('1 overdue')
    expect(host.textContent).not.toContain('pending approval')
  })
})

describe('Manuscripts stalled', () => {
  it('names the clock on its filter', async () => {
    const host = await mount(tree(<ManuscriptsPage />), { ready: (h) => [...h.querySelectorAll('button')].some((b) => b.textContent?.includes('Stalled')), label: 'stalled filter' })
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Stalled'))!
    expect(btn.textContent).toContain('Stalled in stage')
  })
})

// Falsifiers against the uncommitted diff. Each test LOGS what it finds and asserts
// the claim the diff makes, so a red here is the claim failing.
import 'C:/Users/ingra107/mn-ccore-lab-wt/w1107-ui/src/index.css'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { page } from 'vitest/browser'
import { useState } from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from 'C:/Users/ingra107/mn-ccore-lab-wt/w1107-ui/src/hooks/useAuth'
import { UndoToastProvider } from 'C:/Users/ingra107/mn-ccore-lab-wt/w1107-ui/src/components/UndoToast'
import Projects from 'C:/Users/ingra107/mn-ccore-lab-wt/w1107-ui/src/pages/Projects'
import TodayPage from 'C:/Users/ingra107/mn-ccore-lab-wt/w1107-ui/src/pages/portal/TodayPage'
import { TaskGroup } from 'C:/Users/ingra107/mn-ccore-lab-wt/w1107-ui/src/components/today/TaskGroup'
import { mount, cleanupMountsAfterEach, waitFor } from 'C:/Users/ingra107/mn-ccore-lab-wt/w1107-ui/src/__tests__/testMount'

cleanupMountsAfterEach()
const pi: AuthUser = { email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true, canShowAllProjects: true, piResolved: true }
const log = (...a: unknown[]) => console.log('[PROBE]', ...a)

let routes: Record<string, unknown> = {}
const realFetch = window.fetch
let lastLoc = ''
function Loc() { lastLoc = useLocation().search; return null }
function tree(node: React.ReactElement, start = '/') {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext.Provider value={{ user: pi, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider>
          <MemoryRouter initialEntries={[start]}>
            <Loc />
            <Routes><Route path="*" element={node} /></Routes>
          </MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

describe('Projects stage chips', () => {
  const project = (slug: string, category = 'CLIF') => ({ id: `proj_${slug}`, slug, title: slug, status: 'active', category, updated_at: '2020-01-01 00:00:00', last_meaningful_movement: '2020-01-01 00:00:00' })
  const prod = (kind: string, kindLabel: string, stage: string, label: string, ord: number) => [{ id: `pr_${stage}`, kind, kind_label: kindLabel, stage, stage_label: label, kind_sort: 1, stage_ordinal: ord, is_home: 1 }]
  beforeEach(async () => {
    await page.viewport(1280, 900)
    routes = {
      '/api/meetings/cadence-check': { recommendation: 'no_upcoming', reasons: [], data: { recommendation: 'no_upcoming', reasons: [] } },
      '/api/projects': { data: [project('alpha'), project('bravo', 'MNCCORE'), project('charlie'), project('delta')] },
      '/api/projects/products': { byProject: {
        proj_alpha: prod('grant', 'Grant application', 'preparing', 'Preparing', 1),
        proj_bravo: prod('manuscript', 'Manuscript', 'drafting', 'Drafting', 2),
        proj_charlie: prod('grant', 'Grant application', 'preparing', 'Preparing', 1),
        proj_delta: prod('grant', 'Grant application', 'preparing', 'Preparing', 1),
      }, kinds: [] },
    }
    window.fetch = (async (input: RequestInfo | URL) => {
      const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin).pathname
      return new Response(JSON.stringify(routes[path] ?? { data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof window.fetch
  })
  afterEach(async () => { window.fetch = realFetch; await page.viewport(414, 896) })
  const tally = (h: ParentNode) => h.querySelector('[data-testid="pj-tally"]') as HTMLElement | null
  const chip = (h: ParentNode, re: RegExp) => [...(tally(h)?.querySelectorAll('button') ?? [])].find((b) => re.test(b.textContent ?? '')) as HTMLButtonElement
  const hero = (h: ParentNode) => h.querySelector('[data-testid="hero-number"]')?.textContent

  it('F1: the tally total agrees with the rows under a stage pick', async () => {
    const h = await mount(tree(<Projects />), { ready: (x) => chip(x, /Drafting/), label: 'chips' })
    chip(h, /Drafting/).click()
    await waitFor(() => hero(h) === '1open', 'filtered')
    const totalSpan = tally(h)!.querySelector('span')!.textContent
    log('F1 hero', hero(h), '| tally first span', totalSpan, '| tally text', tally(h)!.textContent)
    expect(totalSpan).toBe('1 project')
  })

  it('F2: on Pipeline a stage pick stays visible and clearable', async () => {
    const h = await mount(tree(<Projects />), { ready: (x) => chip(x, /Drafting/), label: 'chips' })
    chip(h, /Drafting/).click()
    await waitFor(() => hero(h) === '1open', 'filtered')
    const pipe = [...h.querySelectorAll('button')].find((b) => /Pipeline/.test(b.textContent ?? '') || b.getAttribute('aria-label') === 'Pipeline') as HTMLButtonElement
    pipe.click()
    await waitFor(() => h.querySelector('.pipeline-board'), 'pipeline board')
    log('F2 search', lastLoc, '| hero', hero(h), '| tally present', !!tally(h), '| pressed chips', h.querySelectorAll('button[aria-pressed="true"]').length, '| clear filters button', [...h.querySelectorAll('button')].some((b) => /clear/i.test(b.textContent ?? '')))
    log('F2 pressed labels', [...h.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent).join(' / '))
    log('F2 mentions Drafting anywhere as a control', [...h.querySelectorAll('button')].filter((b) => /Drafting/.test(b.textContent ?? '')).length)
    expect(tally(h)).not.toBeNull()
  })

  it('F3: a Find that misses the picked stage does not silently drop the pick', async () => {
    const h = await mount(tree(<Projects />), { ready: (x) => chip(x, /Drafting/), label: 'chips' })
    chip(h, /Drafting/).click()
    await waitFor(() => hero(h) === '1open', 'filtered')
    const input = h.querySelector<HTMLInputElement>('[data-testid="projects-find"] input')!
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, 'alpha'); input.dispatchEvent(new Event('input', { bubbles: true }))
    await waitFor(() => hero(h) !== '1open' || /found/.test(hero(h) ?? ''), 'find applied')
    await waitFor(() => /found/.test(hero(h) ?? ''), 'found')
    log('F3 search', lastLoc, '| hero', hero(h), '| rows alpha shown', h.textContent?.includes('alpha'), '| pressed', [...(tally(h)?.querySelectorAll('button[aria-pressed="true"]') ?? [])].map((b) => b.textContent))
    set.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true }))
    await waitFor(() => !/found/.test(hero(h) ?? ''), 'cleared')
    log('F3 after clearing Find: hero', hero(h), '| pressed', [...(tally(h)?.querySelectorAll('button[aria-pressed="true"]') ?? [])].map((b) => b.textContent))
  })

  it('F4: a pick survives a group switch away and back', async () => {
    const h = await mount(tree(<Projects />, '/?stage=grant%3Apreparing'), { ready: (x) => chip(x, /Preparing/)?.getAttribute('aria-pressed') === 'true', label: 'picked' })
    const groupBtn = (re: RegExp) => [...h.querySelectorAll('.tk-flt button')].find((b) => re.test(b.textContent ?? '')) as HTMLButtonElement
    log('F4 start', lastLoc, hero(h))
    groupBtn(/^MN-CCORE/).click()
    await waitFor(() => lastLoc.includes('category'), 'category set')
    await waitFor(() => hero(h) === '1open', 'mnccore')
    log('F4 MN-CCORE (no Preparing there)', lastLoc, hero(h), '| pressed chips', tally(h)?.querySelectorAll('button[aria-pressed="true"]').length, '| FiltersButton n/a on desktop')
    groupBtn(/^All groups/).click()
    await waitFor(() => !lastLoc.includes('category'), 'category cleared')
    await waitFor(() => hero(h) === '3open', 'back: the pick came back')
    log('F4 back on All groups', lastLoc, hero(h), '| pressed', [...(tally(h)?.querySelectorAll('button[aria-pressed="true"]') ?? [])].map((b) => b.textContent))
  })

  it('F5: phone sheet chips are touch sized, like the sheet links beside them', async () => {
    await page.viewport(390, 844)
    const h = await mount(tree(<Projects />), { ready: (x) => x.querySelector('.tk-filters-btn'), label: 'Filters' })
    await waitFor(() => hero(h) === '4open', 'loaded')
    h.querySelector<HTMLElement>('.tk-filters-btn')!.click()
    const sheet = await waitFor(() => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Filters"]'), 'sheet')
    const chipEl = await waitFor(() => chip(sheet, /Drafting/), 'chip in sheet')
    const link = sheet.querySelector<HTMLElement>('.tk-flt button')!
    log('F5 chip h', chipEl.getBoundingClientRect().height, 'w', chipEl.getBoundingClientRect().width, '| sibling link h', link.getBoundingClientRect().height)
    expect(chipEl.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })
})

describe('Today due window', () => {
  const ME = 'nick-ingraham'
  const civil = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` }
  const row = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id, title: id, status: 'todo', completed: 0, priority: 'medium', kind: 'task', assignee: ME, acknowledged_at: '2026-01-01', due_date: null, ...over }) as never
  const state = { planned: {}, done: {}, plannedIds: () => [], markDone: () => {}, uncheck: () => {}, planAt: () => {}, unplan: () => {} } as never
  const ids = (h: ParentNode) => [...h.querySelectorAll('[data-task-id]')].map((e) => e.getAttribute('data-task-id'))

  it('F6: pressing a narrower window changes an already-opened section', async () => {
    function H() {
      const [w, setW] = useState(30)
      return (
        <QueryClientProvider client={new QueryClient()}><MemoryRouter><div className="tk">
          <button id="to7" onClick={() => setW(7)}>7</button>
          <TaskGroup skey="writing" tasks={[row('in3', { due_date: civil(3) }), row('in20', { due_date: civil(20) }), row('far', { due_date: civil(60) })]} projectsByPid={new Map()} state={state} viewerSlug={ME} windowDays={w} />
        </div></MemoryRouter></QueryClientProvider>
      )
    }
    const h = await mount(<H />, { ready: (x) => x.querySelector('section'), label: 'section' })
    log('F6 at 30', ids(h))
    ;[...h.querySelectorAll('button')].find((b) => /Show \d+ more/.test(b.textContent ?? ''))!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => ids(h).length === 3, 'show more open')
    h.querySelector<HTMLButtonElement>('#to7')!.click()
    await new Promise((r) => setTimeout(r, 100))
    log('F6 after pressing 7 with Show more open', ids(h), '| button', [...h.querySelectorAll('.tk-further')].map((b) => b.textContent))
    expect(ids(h)).toEqual(['in3'])
  })

  it('F7: the Tasks header fits a phone, with the 44px window links', async () => {
    const rows = [{ id: 'other', title: 'Title other', short_title: null, description: '', assignee: ME, due_date: civil(3), priority: 'medium', status: 'todo', completed: 0, completed_at: null, project_id: null, kind: 'task', acknowledged_at: '2026-01-01', created_at: '2026-11-01 15:00:00', updated_at: '2026-11-01 15:00:00' }]
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const u = String(url)
      const known = u.includes('/api/tasks') || u.includes('/api/projects') || u.includes('/api/meetings') || u.includes('/api/launch-log') || u.includes('/api/integrations/calendar/events')
      const body = u.includes('/api/tasks') ? { data: u.includes('others_of') ? [] : rows, count: 1 } : known ? { data: [], count: 0, events: [] } : { error: 'not stubbed' }
      return { ok: known, status: known ? 200 : 404, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response
    }))
    for (const width of [360, 390, 768, 1280]) {
      await page.viewport(width, 844)
      const h = await mount(tree(<TodayPage />), { ready: (x) => x.querySelector('[data-task-id="other"]'), label: 'today ' + width })
      const group = h.querySelector<HTMLElement>('[aria-label="Show tasks due within"]')!
      const head = group.parentElement!
      const r = head.getBoundingClientRect()
      const btns = [...group.querySelectorAll('button')].map((b) => { const x = b.getBoundingClientRect(); return `${b.textContent}:${Math.round(x.left)}-${Math.round(x.right)}h${Math.round(x.height)}` })
      const hint = head.querySelector<HTMLElement>('.today-section-hint')
      log(`F7 w=${width} head ${Math.round(r.width)}x${Math.round(r.height)} right=${Math.round(r.right)} | doc scrollW ${document.documentElement.scrollWidth} | head scrollW ${head.scrollWidth} | ${btns.join(' ')} | hint ${hint ? getComputedStyle(hint).display : 'none'}`)
      expect(document.documentElement.scrollWidth, `page overflow at ${width}`).toBeLessThanOrEqual(width)
      expect(group.getBoundingClientRect().right).toBeLessThanOrEqual(r.right + 0.5); expect(`w${width} headH ${Math.round(r.height)} btns ${btns.join(' ')}`).toBe('')
    }
    await page.viewport(414, 896)
    vi.unstubAllGlobals()
  })
})

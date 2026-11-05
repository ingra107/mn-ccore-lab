// Nick's phone picks, 2026-11-05, measured in Chromium against the real index.css:
//   M15 Manuscripts shows the list first; the rail follows it, and a one-line
//       summary above the list says when something there wants him.
//   M20 A meeting card's action rows get the phone's width: no time gutter there.
//   M27 Grants phone rows use the sleek row anatomy, each value under a label.

import '../index.css'
import { describe, it, expect, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { page } from 'vitest/browser'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import ManuscriptsPage from '../pages/portal/ManuscriptsPage'
import GrantList from '../components/grants/GrantList'
import { TimelineGrid } from '../components/today/TimelineGrid'
import { PlanSection } from '../components/today/PlanSection'
import type { AcceptedWeekPlan } from '../lib/weekPlan'
import type { PlanSectionModel } from '../lib/planSection'
import type { TaskRow } from '../lib/api'
import type { TodayEvent } from '../components/today/constants'
import type { TodayStateApi } from '../hooks/useTodayState'
import { formatUsd, type GrantProduct } from '../lib/grants'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()

const pi: AuthUser = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}

let routes: Record<string, unknown> = {}
const realFetch = window.fetch
function stubApi(next: Record<string, unknown>) {
  routes = next
  window.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin).pathname
    return new Response(JSON.stringify(routes[path] ?? { data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof window.fetch
}
afterEach(async () => {
  window.fetch = realFetch
  await page.viewport(1280, 900)
})

const tree = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AuthContext.Provider value={{ user: pi, isAuthenticated: true, isLoading: false }}>
      <UndoToastProvider><MemoryRouter>{node}</MemoryRouter></UndoToastProvider>
    </AuthContext.Provider>
  </QueryClientProvider>
)

describe('M15: Manuscripts on a phone', () => {
  const project = { id: 'proj_a', slug: 'a', name: 'Alpha paper', title: 'Alpha paper', status: 'active', category: 'MNCCORE', pi: 'nick-ingraham' }
  const product = { id: 'prd_a', project_id: 'proj_a', project_slug: 'a', kind: 'manuscript', stage: 'writing', is_home: 1 }
  const apiWith = (attention: Record<string, unknown[]>) => ({
    '/api/projects': { data: [project] },
    '/api/products': { data: [product] },
    '/api/manuscripts/attention': { data: { revisions_overdue: [], awaiting_review: [], stale_drafts: [], ...attention } },
  })
  const mountPage = () => mount(tree(<ManuscriptsPage />), { ready: (h) => h.querySelector('.pwr-rail'), label: 'the rail' })

  it('the list comes before the rail, in the DOM and on screen', async () => {
    await page.viewport(390, 844)
    stubApi(apiWith({}))
    const host = await mountPage()
    const main = host.querySelector<HTMLElement>('.pwr-main')!
    const rail = host.querySelector<HTMLElement>('.pwr-rail')!
    expect(main.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(main.getBoundingClientRect().top).toBeLessThan(rail.getBoundingClientRect().top)
  })

  it('says one line above the list when something wants him, and the line reaches the rail', async () => {
    await page.viewport(390, 844)
    stubApi(apiWith({ stale_drafts: [{ slug: 'a', name: 'Alpha paper' }, { slug: 'b', name: 'Beta paper' }] }))
    const host = await mountPage()
    const line = await waitFor(() => host.querySelector<HTMLButtonElement>('[data-testid="attention-line"]'), 'the line')
    expect(line!.textContent).toContain('2 need your attention')
    expect(getComputedStyle(line!).display).not.toBe('none')
    expect(line!.closest('.pwr-main')).not.toBeNull()
    const rail = host.querySelector<HTMLElement>('.pwr-rail')!
    let reached = false
    rail.scrollIntoView = () => { reached = true }
    line!.click()
    expect(reached).toBe(true)
  })

  it('no line when nothing wants him', async () => {
    await page.viewport(390, 844)
    stubApi(apiWith({}))
    const host = await mountPage()
    await new Promise((r) => setTimeout(r, 100))
    expect(host.querySelector('[data-testid="attention-line"]')).toBeNull()
  })

  it('no line on a desktop, where the rail already shows beside the list', async () => {
    await page.viewport(1440, 900)
    stubApi(apiWith({ stale_drafts: [{ slug: 'a', name: 'Alpha paper' }] }))
    const host = await mount(<div style={{ width: 1400 }}>{tree(<ManuscriptsPage />)}</div>, { ready: (h) => h.querySelector('[data-testid="attention-line"]'), label: 'the line' })
    expect(getComputedStyle(host.querySelector('[data-testid="attention-line"]')!).display).toBe('none')
  })
})

describe('M20: the meeting card on the Today timeline', () => {
  const event = { id: 'mtg_1', time: '9:00 AM', end: '10:00 AM', startMin: 540, endMin: 600, title: 'Lab standup' } as TodayEvent
  const state = { planned: {}, done: {}, plannedIds: () => [], markDone: () => {}, uncheck: () => {}, planAt: () => {}, unplan: () => {} } as unknown as TodayStateApi
  const grid = (isPhone: boolean) => tree(
    <div className="tk" style={{ width: isPhone ? 342 : 900 }}>
      <TimelineGrid
        events={[event]} tasks={[]} state={state} projectsByPid={new Map()} expandedId={null} onExpand={() => {}}
        notes={{}} onNote={() => {}} saveStatus={{}} onDismiss={() => {}} isPhone={isPhone} now={480} inMeeting={false}
      />
    </div>,
  )
  const card = (h: HTMLElement) => h.querySelector<HTMLElement>('.meeting-row-header')

  it('on a phone the card starts at the panel edge, and the card itself gives the time', async () => {
    await page.viewport(390, 844)
    stubApi({})
    const host = await mount(grid(true), { ready: card, label: 'meeting card' })
    const left = card(host)!.getBoundingClientRect().left - host.querySelector<HTMLElement>('.tk')!.getBoundingClientRect().left
    expect(left).toBeLessThanOrEqual(2)
    for (const lab of host.querySelectorAll<HTMLElement>('.tk-tlab')) expect(getComputedStyle(lab).display).toBe('none')
    expect(card(host)!.textContent).toContain('9:00 AM')
  })

  it('on a desktop the gutter and its labels stay', async () => {
    await page.viewport(1440, 900)
    stubApi({})
    const host = await mount(grid(false), { ready: card, label: 'meeting card' })
    const left = card(host)!.getBoundingClientRect().left - host.querySelector<HTMLElement>('.tk')!.getBoundingClientRect().left
    expect(left).toBeGreaterThanOrEqual(50)
    expect(getComputedStyle(host.querySelector<HTMLElement>('.tk-tlab')!).display).not.toBe('none')
  })
})

describe('M5: the Plan head on a phone', () => {
  it('keeps the count, the week and the button on one line', async () => {
    await page.viewport(390, 844)
    stubApi({})
    const t = { id: 'task_a', title: 'Done thing', assignee: 'nick-ingraham', status: 'done', priority: 'medium', completed: 1, project_id: null } as unknown as TaskRow
    const plan = { spec: { week_start: '2026-11-02', candidates: [] }, picks: [], kept: [], withdrawn: [], at: '', task: t } as unknown as AcceptedWeekPlan
    const model = { today: [], picks: [], done: [t], ids: new Set(['task_a']) } as unknown as PlanSectionModel
    const state = { planned: {}, done: {}, plannedIds: () => [], markDone: () => {}, uncheck: () => {}, planAt: () => {}, unplan: () => {} } as unknown as TodayStateApi
    const host = await mount(
      tree(<div className="tk" style={{ width: 342 }}><PlanSection plan={plan} model={model} state={state} projectsByPid={new Map()} viewerSlug="" /></div>),
      { ready: (h) => h.querySelector('[data-testid="plan-button"]'), label: 'the button' },
    )
    expect(host.querySelector('.tk-cnt')?.textContent).toBe('1 of 1 done')
    const center = (el: Element) => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2 }
    const count = host.querySelector('.tk-cnt')!
    expect(Math.abs(center(count) - center(host.querySelector('[data-testid="plan-button"]')!))).toBeLessThan(6)
    expect(Math.abs(center(count) - center(host.querySelector('.tk-ph .tk-hintx')!))).toBeLessThan(6)
  })
})

describe('M27: Grants rows on a phone', () => {
  const base = {
    project_id: 'proj_K', project_slug: 'k23', project_title: 'K23: Provider Variation', project_short_name: 'K23', pi: 'nick-ingraham',
    stage_ordinal: 1, stage_is_terminal: 0, short_name: null, due_date: null, is_home: 1, lineage_rank: 0, grew_from_id: null, seq: 1, milestones: [],
  }
  const award = { ...base, id: 'prd_aw', kind: 'award', kind_label: 'Award', stage: 'active', stage_label: 'Active', title: null, venue: 'NHLBI K23', deadline: null, period_start: '2022-12-15', period_end: '2027-11-30', amount_usd: 644588, bucket: 'active' } as unknown as GrantProduct
  const app = { ...base, id: 'prd_app', kind: 'grant_application', kind_label: 'Grant application', stage: 'preparing', stage_label: 'Preparing', title: 'R01 renewal', venue: null, deadline: '2026-12-15', period_start: null, period_end: null, amount_usd: null, bucket: 'proposed' } as unknown as GrantProduct
  const rows = (w: number) => tree(<div style={{ width: w }}><GrantList rows={[award, app]} kinds={[]} onEdit={() => {}} /></div>)
  const row = (h: HTMLElement, id: string) => h.querySelector<HTMLElement>(`[data-testid="grant-row-${id}"]`)!
  const labels = (r: HTMLElement) => [...r.querySelectorAll('.gl-lab')].map((l) => l.textContent)

  it('an award shows each value under its label, on the sleek phone row', async () => {
    await page.viewport(390, 844)
    stubApi({})
    const host = await mount(rows(342), { ready: (h) => h.querySelector('.sr-ph'), label: 'phone row' })
    const r = row(host, 'prd_aw')
    expect(r.classList.contains('sr-ph')).toBe(true)
    expect(labels(r)).toEqual(['Venue', 'Stage', 'Start', 'End', 'Amount'])
    expect(r.textContent).toContain(formatUsd(644588))
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
  })

  it('an application names its dates, and offers no amount: no orphan dash', async () => {
    await page.viewport(390, 844)
    stubApi({})
    const host = await mount(rows(342), { ready: (h) => h.querySelector('.sr-ph'), label: 'phone row' })
    const r = row(host, 'prd_app')
    expect(labels(r)).toEqual(['Venue', 'Stage', 'Proposed start', 'Due'])
    expect(r.textContent).not.toContain('—')
    expect(host.querySelector('[data-testid="grant-amount-prd_app"]')).toBeNull()
  })

  it('the long name wraps rather than cuts', async () => {
    await page.viewport(390, 844)
    stubApi({})
    const long = { ...app, id: 'prd_long', title: 'A very long grant application title that cannot possibly fit on one line of a phone' } as GrantProduct
    const host = await mount(tree(<div style={{ width: 342 }}><GrantList rows={[long]} kinds={[]} onEdit={() => {}} /></div>), { ready: (h) => h.querySelector('.sr-ph'), label: 'phone row' })
    const link = row(host, 'prd_long').querySelector<HTMLElement>('.gl-name a')!
    expect(getComputedStyle(link).whiteSpace).toBe('normal')
  })

  it('the wide list keeps its six columns under one header', async () => {
    await page.viewport(1440, 900)
    stubApi({})
    const host = await mount(rows(1200), { ready: (h) => h.querySelector('[role="columnheader"]'), label: 'header' })
    expect([...host.querySelectorAll('[role="columnheader"]')].map((c) => c.textContent)).toEqual(['Grant', 'Venue', 'Stage', 'Start', 'End / due', 'Amount'])
    expect(row(host, 'prd_aw').querySelectorAll('[role="cell"]')).toHaveLength(6)
    expect(row(host, 'prd_aw').querySelector('.gl-lab')).toBeNull()
    expect(host.querySelector('[role="table"]')?.getAttribute('aria-label')).toBe('Grants')
  })
})

// The member trajectory page (overnight audit 2026-10-14):
//   G9-1/G11-4 the Publication Curve draws from `year` (the API sends no pub_date)
//   G9-2       a contribution-timeline paper shows its year, never "Invalid Date"
//   G9-3/G11-2 the timeline shows 50 entries, the rest one click away
//   G9-5       no dead "Link ORCID" link in the empty state
//   G11-8      a visitor who is not the member or the PI sees papers only
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import TrajectoryPage from './TrajectoryPage'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SLUG = 'dan-shyu'
let mounted: { host: HTMLElement; root: Root }[] = []
let publications: { id: string; title: string; journal: string; year: number; doi: string | null }[] = []
let contributionTasks: { id: string; title: string; completed_at: string }[] = []

const asUser = (slug: string | null, isPi = false): AuthUser => ({
  email: slug ? `${slug}@umn.edu` : '', slug: slug ?? '', isAuthenticated: Boolean(slug),
  isPi, isMember: Boolean(slug), canShowAllProjects: false, piResolved: Boolean(slug),
})
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  publications = [
    { id: 'p1', title: 'First paper', journal: 'Chest', year: 2021, doi: null },
    { id: 'p2', title: 'Second paper', journal: 'CCM', year: 2023, doi: null },
    { id: 'p3', title: 'Third paper', journal: 'JAMA', year: 2023, doi: null },
  ]
  contributionTasks = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === `/api/team/${SLUG}/trajectory`) {
      return json({ data: {
        publications, taskStats: [], projects: [], milestones: [], projectStages: [],
        taskMetrics: { total: 0, completed: 0, overdue: 0, avg_days: null },
      } })
    }
    if (url.startsWith(`/api/team/${SLUG}/contributions`)) {
      return json({ data: {
        tasks: contributionTasks.map((t) => ({ ...t, description: null, project_id: null, priority: null })),
        updates: [], comments: [], decisions: [], meetings: [],
        publications: [{ id: 'cp1', title: 'A paper this year', journal: 'Chest', year: 2026 }],
        summary: { tasks_completed: contributionTasks.length, updates_posted: 0, comments_made: 0, decisions_made: 0, meetings_contributed: 0, publications: 1 },
      } })
    }
    return json({ error: 'not under test' }, 404)
  }))
})

afterEach(() => {
  mounted.forEach(({ host, root }) => { act(() => root.unmount()); host.remove() })
  mounted = []
  vi.unstubAllGlobals()
})

async function mount(user: AuthUser): Promise<HTMLElement> {
  const host = document.createElement('div')
  host.style.width = '390px'
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthContext.Provider value={{ user, isAuthenticated: user.isAuthenticated, isLoading: false }}>
          <MemoryRouter initialEntries={[`/team/${SLUG}/trajectory`]}>
            <Routes>
              <Route path="/team/:slug/trajectory" element={<TrajectoryPage />} />
              <Route path="*" element={<div>elsewhere</div>} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  mounted.push({ host, root })
  await act(async () => { await new Promise((r) => setTimeout(r, 80)) })
  return host
}

const button = (h: HTMLElement, text: string | RegExp) =>
  [...h.querySelectorAll('button')].find((b) => (typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? ''))) as HTMLButtonElement | undefined

describe('TrajectoryPage', () => {
  it('draws the publication curve from `year` and lists each paper with its year', async () => {
    const h = await mount(asUser(SLUG))
    expect(h.textContent).toContain('Cumulative publications by year')
    expect(h.textContent).not.toContain('No indexed publications yet')
    const timeline = h.querySelector('#publication-timeline')!
    expect(timeline.textContent).toContain('2021')
    expect(timeline.textContent).toContain('Second paper')
  })

  it('with no papers: a plain empty state, no dead ORCID link', async () => {
    publications = []
    const h = await mount(asUser(SLUG))
    expect(h.textContent).toContain('No indexed publications yet')
    expect(h.textContent).not.toMatch(/ORCID/)
  })

  it('a visitor who is not the member sees the papers and no activity sections', async () => {
    const h = await mount(asUser(null))
    expect(h.textContent).toContain('Second paper')
    expect(h.querySelector('#task-velocity')).toBeNull()
    expect(h.querySelector('#active-projects')).toBeNull()
    expect(h.querySelector('#milestones')).toBeNull()
    expect(button(h, /Contributions/)).toBeUndefined()
  })

  it('contributions: a paper shows its year, and 50 entries show before "Show more"', async () => {
    contributionTasks = Array.from({ length: 120 }, (_, i) => ({
      id: `t${i}`, title: `Task ${i}`, completed_at: `2026-09-${String((i % 28) + 1).padStart(2, '0')} 12:00:00`,
    }))
    const h = await mount(asUser(SLUG))
    await act(async () => { button(h, /Contributions/)!.click() })
    // The tab swap waits out an exit animation, then the panel fetches.
    await expect.poll(() => h.querySelector('#contribution-timeline'), { timeout: 5000 }).not.toBeNull()
    const timeline = h.querySelector('#contribution-timeline')!
    expect(timeline.textContent).not.toContain('Invalid Date')
    const entries = () => timeline.querySelectorAll('p').length
    await expect.poll(entries).toBe(50)
    expect(timeline.textContent).toMatch(/Show 50 more entries \(71 hidden\)/)
    await act(async () => { button(h, /Show 50 more/)!.click(); await new Promise((r) => setTimeout(r, 50)) })
    expect(entries()).toBe(100)
    await act(async () => { button(h, /Show 21 more/)!.click(); await new Promise((r) => setTimeout(r, 50)) })
    expect(entries()).toBe(121)
    expect(timeline.textContent).toContain('A paper this year')
    expect(timeline.textContent).toContain('2026')
  })
})

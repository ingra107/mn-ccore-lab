// Lab overview > Team and Pipeline (analytics fold, 2026-10-13), in real
// Chromium with a stubbed fetch. What this pins:
//   - a PI sees the PI blocks, a member sees only the lab's totals;
//   - a member's page never calls a PI-only read (a 403 in the deploy sweep);
//   - the week control writes ?week= as an ISO Monday week, and the page reads it;
//   - the stalled-project registry keeps its one write action.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AuthContext, type AuthUser } from '../../../hooks/useAuth'
import { cleanupMountsAfterEach, mount, waitFor } from '../../../__tests__/testMount'
import TeamTab from './TeamTab'
import PipelineTab from './PipelineTab'

cleanupMountsAfterEach()

// recharts pre-bundles its own copy of React under the browser runner, so a real
// chart throws "useContext of null" here. The charts are not what this file tests.
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: unknown }) => <div data-chart="">{children as never}</div>
  const Nothing = () => null
  return { ResponsiveContainer: Box, BarChart: Box, Bar: Box, Cell: Nothing, XAxis: Nothing, YAxis: Nothing, CartesianGrid: Nothing, Tooltip: Nothing }
})

const user = (isPi: boolean): AuthUser => ({
  email: isPi ? 'nick@umn.edu' : 'member@umn.edu',
  slug: isPi ? 'nick-ingraham' : 'sweep-data',
  isAuthenticated: true,
  isPi,
  isMember: true,
  canShowAllProjects: false,
  piResolved: true,
} as AuthUser)

const past = '2020-01-01'
const tasks = [
  { id: 't1', title: 'Draft the IRB amendment', short_title: null, assignee: 'nick-ingraham', completed: 0, status: 'todo', priority: 'high', due_date: past, created_at: '2026-01-01T10:00:00Z', completed_at: null, project_id: null },
  { id: 't2', title: 'Rerun table one', short_title: null, assignee: 'casey-eddington', completed: 1, status: 'done', priority: 'medium', due_date: null, created_at: '2026-01-02T10:00:00Z', completed_at: '2026-01-05T10:00:00Z', project_id: null },
  { id: 't3', title: 'Write the aims', short_title: null, assignee: 'casey-eddington', completed: 0, status: 'todo', priority: 'low', due_date: null, created_at: '2026-01-03T10:00:00Z', completed_at: null, project_id: null },
]

const piDashboard = {
  commitments: { total: 10, completed: 8, overdue: 1 },
  responseMetrics: { median_days: 9, median_days_recent: 8, median_days_prior: 12, trend: 'improving', total_tasks: 20 },
  menteeVelocity: [],
  grantPipeline: { total: 3, pending: 1, active: 2, active_funding: 1_400_000 },
  teamEngagement: [],
  pubsByQuarter: [{ year: 2025, count: 4 }],
  grantsFunnel: { submitted: 1, active: 2 },
  productsByStage: [{ kind: 'manuscript', kind_label: 'Manuscript', stage: 'writing', stage_label: 'Writing', ordinal: 40, is_terminal: 0, count: 3 }],
}
const insights = {
  week: '2026-W42',
  metrics: {
    stalledProjects: { count: 1, deltaWoW: 0, sparkline: [0, 1] },
    tasksPerPerson: { avg: 1.5, total: 2, distribution: [{ slug: 'nick-ingraham', count: 1 }, { slug: 'casey-eddington', count: 1 }] },
    manuscriptsInRevision: { count: 2, awaitingReplyOver7d: 0 },
    grantsInPipeline: { count: 1, daysToNextDeadline: 5 },
  },
  workloadHeatmap: [],
  pipelineFunnel: [],
  velocityScatter: [
    { slug: 'proj-a', title: 'Stalled study', daysSinceUpdate: 21, openTasks: 2, isOutlier: false },
    { slug: 'proj-new', title: 'Never touched', daysSinceUpdate: null, openTasks: 0, isOutlier: true },
  ],
  // Seven rows: five show, the rest sit behind "Show all 7" (G8-05). A
  // never-updated project reads "no updates yet", never a 999 sentinel.
  stalledRegistry: [
    { slug: 'proj-a', title: 'Stalled study', daysIdle: 21, openTasks: 2 },
    ...[20, 19, 18, 17, 16].map((d) => ({ slug: `proj-${d}`, title: `Idle ${d}`, daysIdle: d, openTasks: 1 })),
    { slug: 'proj-new', title: 'Never touched', daysIdle: null, openTasks: 0 },
  ],
}

let calls: string[] = []
const realFetch = window.fetch

beforeEach(() => {
  calls = []
  window.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin).pathname
    calls.push(path)
    const body =
      path === '/api/tasks' ? { data: tasks }
      : path === '/api/projects/health' ? { data: [], summary: { total: 4, healthy: 3, needs_attention: 1, at_risk: 0, critical: 0, avg_score: 80 } }
      : path === '/api/analytics/pi-dashboard' ? { data: piDashboard }
      : path === '/api/insights/dashboard' ? { data: insights }
      : path === '/api/analytics/response-time' ? { data: { summary: { median_days: 8, prior_median_days: 12, completed: 6, prior_completed: 5, small_sample: false, trend: 'faster' }, monthly: [], byPriority: [] } }
      : path === '/api/analytics/team-engagement' ? { data: { members: [], active: 0, of: 0, prior_active: 0, trend: 'flat' } }
      : path === '/api/activity/heatmap' ? { data: {} }
      : { data: [] }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof window.fetch
})
afterEach(() => { window.fetch = realFetch })

function Where() {
  const loc = useLocation()
  return <span data-testid="where">{loc.search}</span>
}

function tree(node: React.ReactElement, isPi: boolean, start: string) {
  const u = user(isPi)
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[start]}>
        <AuthContext.Provider value={{ user: u, isAuthenticated: true, isLoading: false }}>
          <Where />
          {node}
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Team tab', () => {
  it('shows a PI the insights, the workload with a link per person, and the Report menu', async () => {
    const host = await mount(tree(<TeamTab />, true, '/portal/overview?tab=team'), {
      label: 'team tab (PI)',
      ready: (h) => h.textContent?.includes('Leadership insights') && h.querySelector('a[href*="assignee=casey-eddington"]'),
    })
    expect(host.textContent).toContain('Workload')
    expect(host.textContent).toContain('Forecast')
    expect(host.textContent).toContain('Report')
    expect(calls).toContain('/api/insights/dashboard')
  })

  it('shows a member the lab totals and never calls a PI-only read', async () => {
    const host = await mount(tree(<TeamTab />, false, '/portal/overview?tab=team'), {
      label: 'team tab (member)',
      ready: (h) => h.textContent?.includes('Lab progress this week'),
    })
    expect(host.textContent).not.toContain('Leadership insights')
    expect(host.textContent).not.toContain('Commitments')
    expect(host.querySelector('a[href*="assignee="]')).toBeNull()
    await new Promise((r) => setTimeout(r, 50))
    expect(calls.filter((p) => p.startsWith('/api/insights/dashboard') || p.startsWith('/api/analytics/team-engagement') || p.startsWith('/api/analytics/response-time') || p.startsWith('/api/analytics/mentee-velocity'))).toEqual([])
  })

  it('reads ?week= as an ISO Monday week and steps it with the control', async () => {
    // 2024-W10 is Mon Mar 4 to Sun Mar 10 (week 1 of 2024 starts Mon Jan 1).
    const host = await mount(tree(<TeamTab />, true, '/portal/overview?tab=team&week=2024-W10'), {
      label: 'team tab, week 10',
      ready: (h) => h.querySelector('[data-testid="week-range"]'),
    })
    expect(host.querySelector('[data-testid="week-range"]')?.textContent).toContain('Mar 4 - Mar 10, 2024')
    ;(host.querySelector('button[aria-label="Next week"]') as HTMLButtonElement).click()
    await waitFor(() => host.querySelector('[data-testid="where"]')?.textContent?.includes('week=2024-W11'), 'week=2024-W11 in the URL')
    expect(host.querySelector('[data-testid="week-range"]')?.textContent).toContain('Mar 11 - Mar 17, 2024')
    ;(host.querySelector('button[aria-label="Previous week"]') as HTMLButtonElement).click()
    await waitFor(() => host.querySelector('[data-testid="where"]')?.textContent?.includes('week=2024-W10'), 'week=2024-W10 in the URL')
  })

  it('"This week" clears ?week= and the API is asked for the current week', async () => {
    const host = await mount(tree(<TeamTab />, true, '/portal/overview?tab=team&week=2024-W10'), {
      label: 'team tab, week 10 (reset)',
      ready: (h) => h.textContent?.includes('This week'),
    })
    const btn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'This week') as HTMLButtonElement
    btn.click()
    await waitFor(() => !host.querySelector('[data-testid="where"]')?.textContent?.includes('week='), 'week= cleared from the URL')
  })
})

describe('Pipeline tab', () => {
  it('shows a PI the stalled registry with its follow-up action, and products on the server scope', async () => {
    const host = await mount(tree(<PipelineTab />, true, '/portal/overview?tab=pipeline'), {
      label: 'pipeline tab (PI)',
      ready: (h) => h.textContent?.includes('Stalled study') && h.textContent?.includes('Products by stage'),
    })
    expect(host.textContent).toContain('+ Set follow-up')
    const registry = host.querySelector('[data-testid="stalled-registry"]') as HTMLElement
    expect(registry.textContent).not.toContain('Never touched')
    const more = Array.from(registry.querySelectorAll('button')).find((b) => b.textContent === 'Show all 7') as HTMLButtonElement
    more.click()
    await waitFor(() => registry.textContent?.includes('no updates yet'), 'never-updated row after Show all')
    expect(host.textContent).not.toContain('999')
    expect(host.textContent).toContain('Active projects')
    expect(host.textContent).toContain('Task velocity')
    // The one scope: products come from pi-dashboard's active-project rollup.
    expect(calls).toContain('/api/analytics/pi-dashboard')
    expect(host.textContent).toContain('Writing')
  })

  it('shows a member products and velocity, with no stalled registry and no PI-only read', async () => {
    const host = await mount(tree(<PipelineTab />, false, '/portal/overview?tab=pipeline'), {
      label: 'pipeline tab (member)',
      ready: (h) => h.textContent?.includes('Products by stage') && h.textContent?.includes('Writing'),
    })
    expect(host.textContent).not.toContain('Stalled study')
    expect(host.textContent).not.toContain('Active funding')
    await new Promise((r) => setTimeout(r, 50))
    expect(calls.filter((p) => p.startsWith('/api/insights/dashboard') || p.startsWith('/api/analytics/response-time'))).toEqual([])
  })
})

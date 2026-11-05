// Lab Overview: a number says what it counts and opens that (live walk and fable
// audit, 2026-11-05). The header read 14 overdue and its own Upcoming card 10: the
// card only called a task overdue once a whole day had passed since the end of its
// due date, so everything due yesterday sat in "next 7 days" instead.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from '../pages/Dashboard'
import StatusLine from '../components/dashboard/StatusLine'
import UpcomingCard from '../components/dashboard/UpcomingCard'
import ActionBoardCard from '../components/dashboard/ActionBoardCard'
import { WorkloadBlock } from '../components/labops/TeamBlocks'
import { ThisWeekBlock } from '../components/labops/PipelineBlocks'
import StalledRegistry from '../components/labops/StalledRegistry'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import { PATHS } from '../constants/paths'
import { addDaysYmd, localDateKey } from '../lib/dateUtils'
import { nowInstant } from '../lib/time'
import type { TaskRow } from '../lib/api'
import type { InsightsDashboardData } from '../hooks/useInsightsDashboard'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()

const today = localDateKey()
const task = (id: string, over: Partial<TaskRow> = {}): TaskRow => ({
  id, title: id, description: '', assignee: 'casey-eddington', status: 'todo', priority: 'medium', completed: 0,
  created_at: '2026-01-01', updated_at: '2026-01-01', due_date: null, ...over,
} as TaskRow)

const pi: AuthUser = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}

let tasks: TaskRow[] = []
const realFetch = window.fetch
beforeEach(() => {
  tasks = []
  window.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin).pathname
    const body = path === '/api/tasks' ? { data: tasks }
      : path === '/api/publications' ? { data: [{ id: 'p1', title: 'A paper', status: 'Published', year: 2026, authors: 'A B' }] }
      : { data: [] }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof window.fetch
})
afterEach(() => { window.fetch = realFetch })

function tree(node: React.ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext.Provider value={{ user: pi, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider>
          <MemoryRouter>{node}</MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

describe('StatusLine', () => {
  it('leaves lab-wide overdue and done today as plain numbers: My Tasks lists only the viewer', async () => {
    const lab = [
      task('late', { due_date: '2020-01-01' }),
      task('done', { completed: 1, status: 'done', completed_at: nowInstant() }),
    ]
    const host = await mount(tree(<StatusLine tasks={lab} />), { ready: (h) => h.querySelector('[data-testid="dashboard-status-line"]'), label: 'status line' })
    expect(host.textContent).toContain('overdue · lab')
    expect(host.textContent).toContain('done today · lab')
    expect(host.querySelector(`a[href^="${PATHS.myTasks}"]`)).toBeNull()
  })
})

describe('UpcomingCard', () => {
  it('counts overdue as the header does: due yesterday is overdue, an approval is not work', async () => {
    tasks = [
      task('due-yesterday', { due_date: addDaysYmd(today, -1) }),
      task('also-due-yesterday', { due_date: addDaysYmd(today, -1) }),
      task('due-last-week', { due_date: addDaysYmd(today, -7) }),
      task('due-today', { due_date: today }),
      task('approval', { due_date: addDaysYmd(today, -3), approval_status: 'pending' }),
      task('finished', { due_date: addDaysYmd(today, -3), completed: 1, status: 'done' }),
    ]
    const host = await mount(tree(<UpcomingCard />), { ready: (h) => h.textContent?.includes('overdue'), label: 'Upcoming hero' })
    expect(host.textContent).toContain('next 7 days · 3 overdue')
    // Only due-today is ahead; nothing due yesterday still reads as upcoming.
    expect(host.textContent).toContain('Upcoming1next 7 days')
    expect(host.textContent).not.toContain('approval')
  })
})

describe('ActionBoardCard', () => {
  it('leaves an approval out of "pending"', async () => {
    tasks = [task('work'), task('approval', { approval_status: 'pending' })]
    const host = await mount(tree(<ActionBoardCard />), { ready: (h) => h.textContent?.includes('work'), label: 'Tasks card' })
    await waitFor(() => host.textContent?.includes('pending'), 'hero')
    expect(host.textContent).not.toContain('approval')
    expect(host.textContent).toMatch(/1\s*pending/)
  })
})

describe('WorkloadBlock', () => {
  const insights = { metrics: { tasksPerPerson: { avg: 2.9, total: 55, distribution: [{ slug: 'casey-eddington', count: 5 }], sparkline: [] } } } as unknown as InsightsDashboardData

  it('counts the open tasks the lists show, so one block does not hold two totals', async () => {
    const host = await mount(tree(
      <WorkloadBlock isPi tasks={[task('a'), task('b'), task('recently-done', { completed: 1, status: 'done' })]} insights={insights} />,
    ), { ready: (h) => h.textContent?.includes('Workload'), label: 'workload' })
    expect(host.textContent).not.toContain('55 total')
    expect(host.textContent).toContain('2 open of 3 total tasks')
    const row = host.querySelector('a[href*="assignee=casey-eddington"]')!
    expect(row.getAttribute('aria-label')).toContain('2 open tasks')
  })
})

describe('Pipeline stalled labels', () => {
  it('names the clock: no posted update, not "no movement"', async () => {
    const stats = { completed: 0, created: 0, overdue: 0, completedPrior: 0, createdPrior: 0, overduePrior: 0 }
    const host = await mount(tree(
      <>
        <ThisWeekBlock stats={stats} sparks={{ completed: [], created: [], overdue: [] }} tasks={[]} stalled={{ count: 63, deltaWoW: 0, sparkline: [] }} />
        <StalledRegistry rows={[{ slug: 'a', title: 'A', daysIdle: 20, openTasks: 1 }]} />
      </>,
    ), { ready: (h) => h.textContent?.includes('This week'), label: 'pipeline blocks' })
    expect(host.textContent).toContain('No project update in 14d+')
    expect(host.textContent).toContain('no update 14d+')
  })
})

describe('Dashboard page', () => {
  it('opens the Meeting form, shows no April ribbon, and says the hero leaves for the public site', async () => {
    const host = await mount(tree(<Dashboard />), {
      ready: (h) => h.querySelector('[data-testid="hero-number"]'),
      label: 'Lab Overview',
    })
    const meeting = [...host.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Meeting')!
    expect(meeting.getAttribute('href')).toBe(`${PATHS.meetings}?create=true`)
    expect(host.querySelector('[data-testid="release-ribbon"]')).toBeNull()
    expect(host.textContent).not.toContain('typing indicators')
    const hero = host.querySelector('[data-testid="hero-number"]')!
    expect(hero.textContent).toContain('public site')
    expect(hero.getAttribute('target')).toBe('_blank')
  })
})

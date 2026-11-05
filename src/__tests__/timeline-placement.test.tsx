// S06: a planned task stays on the timeline when the calendar changes. Gap slots are
// ordinals (between-N) that shift when a meeting goes, so a timed task is placed by
// its stored minute, and a task with no time whose slot no longer exists falls to the
// last gap. S07: two short tasks too close to stack sit side by side. Real TimelineGrid
// in real Chromium.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimelineGrid } from '../components/today/TimelineGrid'
import { minToPx } from '../components/today/timelineModel'
import type { TodayEvent } from '../components/today/constants'
import type { TaskRow } from '../lib/api'
import type { TodayStateApi } from '../hooks/useTodayState'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const meet = (id: string, startMin: number, endMin: number): TodayEvent =>
  ({ id: `cal-${id}`, title: `Meeting ${id}`, time: '', startMin, endMin })
const task = (id: string, over: Partial<TaskRow> = {}) => ({
  id, title: `Task ${id}`, status: 'todo', priority: 'medium', assignee: 'nick-ingraham', completed: 0, description: '',
  project_id: null, due_date: null, created_at: '2026-11-01 00:00:00', planned_for: '2026-11-05', ...over,
} as unknown as TaskRow)

function stateFor(planned: Record<string, string>): TodayStateApi {
  return {
    plannedIds: () => Object.keys(planned),
    planned: Object.fromEntries(Object.entries(planned).map(([id, slot]) => [id, { slot }])),
    planAt: () => {},
    unplan: () => {},
    done: {},
    markDone: () => {},
    uncheck: () => {},
  } as unknown as TodayStateApi
}

async function grid(events: TodayEvent[], tasks: TaskRow[], planned: Record<string, string>, expected: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":[]}', { status: 200 })))
  return mount(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <div className="tk" style={{ width: 800 }}>
          <TimelineGrid
            events={events} tasks={tasks} state={stateFor(planned)} projectsByPid={new Map()} expandedId={null}
            onExpand={() => {}} notes={{}} onNote={() => {}} saveStatus={{}} onDismiss={() => {}} isPhone={false} now={360} inMeeting={false}
          />
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
    { ready: (h) => h.textContent?.includes(expected), label: expected, width: '820px' },
  )
}

const gapOf = (host: HTMLElement, title: string) =>
  [...host.querySelectorAll<HTMLElement>('.tk-gap')].find((g) => g.textContent?.includes(title))
const blockOf = (host: HTMLElement, title: string) => {
  const leaf = [...host.querySelectorAll<HTMLElement>('*')].find((e) => e.children.length === 0 && e.textContent?.includes(title))!
  let el: HTMLElement | null = leaf
  while (el && el.style.position !== 'absolute') el = el.parentElement
  return el
}

describe('S06: a planned task survives a calendar change', () => {
  it('a timed task whose slot is gone renders at its time, in the gap that holds it', async () => {
    // 13:00 was placed in the trailing gap of a two-meeting day (between-2); the
    // 09:00 meeting has since gone, so the only gaps are between-0 and between-1.
    const host = await grid([meet('b', 660, 720)], [task('t', { plan_start_min: 780, estimated_minutes: 60 })], { t: 'between-2' }, 'Task t')
    const gap = gapOf(host, 'Task t')!
    expect(gap).toBeTruthy()
    // The trailing gap starts at 12:00, so 13:00 sits 60 minutes down it.
    const block = blockOf(host, 'Task t')!
    expect(block.style.top).toBe(`${Math.round(minToPx(60))}px`)
  })

  it('a timed task whose stored slot now names the wrong gap moves to the gap that holds its time', async () => {
    // 10:30 was in between-1 (10:00-11:00). The 09:00 meeting has gone: between-1 is
    // now the gap after 12:00, where 10:30 would draw far above the gap's top edge.
    const host = await grid([meet('b', 660, 720)], [task('t', { plan_start_min: 630, estimated_minutes: 30 })], { t: 'between-1' }, 'Task t')
    const block = blockOf(host, 'Task t')!
    expect(parseInt(block.style.top, 10)).toBeGreaterThanOrEqual(0)
    expect(block.style.top).toBe(`${Math.round(minToPx(630 - 360))}px`)
  })

  it('a timed task now under a meeting still shows, stacked in the nearest gap, not drawn on a false time', async () => {
    const host = await grid([meet('a', 600, 660)], [task('t', { plan_start_min: 630, estimated_minutes: 15 })], { t: 'between-0' }, 'Task t')
    expect(gapOf(host, 'Task t')).toBeTruthy()
    expect(blockOf(host, 'Task t')).toBeNull()
  })

  it('a task with no time whose slot is gone falls to the last gap', async () => {
    const host = await grid([meet('b', 660, 720)], [task('t', { plan_start_min: null })], { t: 'between-5' }, 'Task t')
    const gaps = [...host.querySelectorAll<HTMLElement>('.tk-gap')]
    expect(gaps[gaps.length - 1].textContent).toContain('Task t')
  })

  it('a task with no time keeps a slot that still exists', async () => {
    const host = await grid([meet('b', 660, 720)], [task('t', { plan_start_min: null })], { t: 'between-0' }, 'Task t')
    const gaps = [...host.querySelectorAll<HTMLElement>('.tk-gap')]
    expect(gaps[0].textContent).toContain('Task t')
  })

  it('a strip task stays off the timeline', async () => {
    const host = await grid([meet('b', 660, 720)], [task('s', { plan_start_min: null }), task('t', { plan_start_min: null })], { s: 'strip', t: 'between-0' }, 'Task t')
    expect(host.textContent).not.toContain('Task s')
  })
})

describe('S07: short tasks too close to stack', () => {
  it('two 15-minute tasks at 09:00 and 09:15 do not cover each other', async () => {
    const host = await grid([], [
      task('a', { plan_start_min: 540, estimated_minutes: 15 }),
      task('b', { plan_start_min: 555, estimated_minutes: 15 }),
    ], { a: 'between-0', b: 'between-0' }, 'Task b')
    const a = blockOf(host, 'Task a')!.getBoundingClientRect()
    const b = blockOf(host, 'Task b')!.getBoundingClientRect()
    const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    expect(overlapX > 0 && overlapY > 0, `blocks overlap ${overlapX}x${overlapY}`).toBe(false)
  })
})

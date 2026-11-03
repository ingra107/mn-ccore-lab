// Today sections (2026-11-03). Runs in real Chromium (vitest browser mode).
// The Sort strip's one-tap kind buttons call the sort route; a section folds the
// rows that need no attention yet behind "Show N more"; With others starts
// collapsed with "N · x urgent · y overdue"; Peripheral Brain is a row badge.
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TaskGroup } from './TaskGroup'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'
import { waitFor } from '../../__tests__/testMount'

let mounted: { host: HTMLElement; root: Root }[] = []
afterEach(() => {
  mounted.forEach(({ host, root }) => { root.unmount(); host.remove() })
  mounted = []
  vi.unstubAllGlobals()
})

const ME = 'nick-ingraham'
const row = (id: string, over: Partial<TaskRow> = {}): TaskRow => ({
  id, name: id, title: id, status: 'todo', completed: 0, priority: 'medium', kind: 'task',
  assignee: ME, acknowledged_at: '2026-01-01', due_date: null, ...over,
} as unknown as TaskRow)

const state = {
  planned: {}, done: {}, plannedIds: () => [],
  markDone: () => {}, uncheck: () => {}, planAt: () => {}, unplan: () => {},
} as unknown as TodayStateApi

async function mountUi(ui: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><div className="tk">{ui}</div></MemoryRouter>
    </QueryClientProvider>,
  )
  mounted.push({ host, root })
  await waitFor(() => host.querySelector('section'), 'section')
  return host
}

const ids = (h: HTMLElement) => [...h.querySelectorAll('[data-task-id]')].map((e) => e.getAttribute('data-task-id'))
const group = (skey: Parameters<typeof TaskGroup>[0]['skey'], tasks: TaskRow[]) =>
  <TaskGroup skey={skey} tasks={tasks} projectsByPid={new Map()} state={state} viewerSlug={ME} />

describe('Sort section', () => {
  it('offers the four kinds on each row and posts a sort with the section it sat in', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }), text: async () => '{}' })
    vi.stubGlobal('fetch', fetchMock)
    const h = await mountUi(group('sort', [row('u1', { priority: 'high' })]))
    const buttons = [...h.querySelectorAll<HTMLButtonElement>('.tk-sortbtns button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['Review', 'Writing', 'Analysis & Build', 'Replies & admin'])
    buttons[1].click()
    await expect.poll(() => fetchMock.mock.calls.some(([u]) => String(u).includes('/api/tasks/u1/sort'))).toBe(true)
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/tasks/u1/sort'))!
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ op: 'sort', work_kind: 'writing', from_section: 'sort' })
  })

  it('other sections show no sort buttons', async () => {
    const h = await mountUi(group('review', [row('r1', { priority: 'high', work_kind: 'review' })]))
    expect(h.querySelector('.tk-sortbtns')).toBeNull()
  })
})

describe('the fold', () => {
  it('keeps what needs eyes, folds the rest, and "Show N more" reveals it in order', async () => {
    const h = await mountUi(group('writing', [
      row('calm1'),
      row('late', { due_date: '2020-01-01' }),
      row('calm2', { due_date: '2099-01-01' }),
      row('urgent', { priority: 'urgent' }),
      row('fresh', { acknowledged_at: null }),
      row('theirs', { assignee: 'casey-eddington', acknowledged_at: null }),
    ]))
    // urgent first, then overdue, then New; the three calm rows fold
    expect(ids(h)).toEqual(['urgent', 'late', 'fresh'])
    const more = [...h.querySelectorAll('button')].find((b) => /Show 3 more/.test(b.textContent ?? ''))!
    more.click()
    await expect.poll(() => ids(h).length).toBe(6)
    expect(ids(h)).toEqual(['urgent', 'late', 'calm2', 'calm1', 'fresh', 'theirs'])
  })

  it('a section with nothing to fold shows no "Show more"', async () => {
    const h = await mountUi(group('review', [row('a', { priority: 'high' })]))
    expect([...h.querySelectorAll('button')].some((b) => /Show \d+ more/.test(b.textContent ?? ''))).toBe(false)
  })
})

describe('With others', () => {
  it('starts collapsed, headed "N · x urgent · y overdue"', async () => {
    const h = await mountUi(group('others', [
      row('o1', { assignee: 'casey-eddington', priority: 'urgent' }),
      row('o2', { assignee: 'casey-eddington', due_date: '2020-01-01' }),
      row('o3', { assignee: 'steven-arriaza' }),
    ]))
    const head = h.querySelector('[data-others-summary]')!
    expect(head.textContent).toBe('3 · 1 urgent · 1 overdue')
    expect(ids(h)).toEqual([]) // collapsed
    ;(h.querySelector('.tk-clk') as HTMLElement).click()
    await expect.poll(() => ids(h).length).toBeGreaterThan(0)
  })

  it('other sections start open', async () => {
    const h = await mountUi(group('analysis', [row('a1', { priority: 'high' })]))
    expect(ids(h)).toEqual(['a1'])
  })
})

describe('row badges', () => {
  it('Peripheral Brain is a badge on the row, not a section', async () => {
    const h = await mountUi(group('analysis', [row('pb1', { priority: 'high', source: 'pb' })]))
    expect([...h.querySelectorAll('.tk-pill')].some((p) => p.textContent === 'PB')).toBe(true)
  })

  it('"Sorted by hand" shows where "Moved manually" used to', async () => {
    const h = await mountUi(group('review', [row('h1', { priority: 'high', work_kind: 'review', work_kind_set: 'hand' })]))
    expect(h.textContent).toContain('Sorted by hand')
    expect(h.textContent).not.toContain('Moved manually')
  })
})

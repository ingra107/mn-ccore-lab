// The Deadlines List on the sleek row (pages/portal/DeadlineList): groups,
// header sort within groups, j/k / x / e, shift- and ctrl-click select (tasks
// only, never a grant milestone), the complete box, the default status hidden,
// the gold diamond for a grant milestone, and the Completed fold.
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeadlineList, sortDeadlines, type DeadlineGroup, type DeadlineItem } from '../pages/portal/DeadlineList'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const click = (el: Element, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
const key = (k: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

const task = (id: string, title: string, due: string, extra: Partial<TaskRow> = {}) => ({
  id, title, short_title: null, description: '', assignee: 'nick-ingraham', assigned_by: null, watchers: null,
  due_date: due, priority: 'medium', status: 'todo', completed: 0, completed_at: null, project_id: null,
  group_override: null, acknowledged_at: '2026-01-01', updated_at: '2026-10-01', ...extra,
}) as unknown as TaskRow

const fromTask = (t: TaskRow): DeadlineItem => ({
  id: t.id, title: t.title, due_date: t.due_date!, type: 'task', assignee: t.assignee ?? undefined,
  project: t.project_id ?? undefined, status: t.status, priority: t.priority, isOverdue: false, daysUntil: 3, task: t,
})
const grantMs: DeadlineItem = {
  id: 'g1', title: 'R01: Just-in-time', due_date: '2099-02-01', type: 'milestone', project: 'Provider Confounding',
  status: 'upcoming', isOverdue: false, daysUntil: 30,
}

const t1 = task('t1', 'Bravo task', '2099-01-03')
const t2 = task('t2', 'Alpha task', '2099-01-04', { status: 'in_progress', priority: 'urgent' })
const t3 = task('t3', 'Charlie task', '2099-01-05')
const done1 = task('d1', 'Finished thing', '2026-01-01', { status: 'done' })

function groups(): DeadlineGroup[] {
  return [
    { title: 'This week', items: [fromTask(t1), fromTask(t2), grantMs, fromTask(t3)] },
    { title: 'Completed', items: [fromTask(done1)], limit: 5 },
  ]
}

async function renderList(opts: { selected?: Set<string>; width?: number } = {}) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const fns = {
    toggleSelect: vi.fn(), selectRange: vi.fn(), setSelected: vi.fn(), onOpenTask: vi.fn(),
    onStatusChange: vi.fn(), onMilestoneStatusChange: vi.fn(), onDueDateChange: vi.fn(),
  }
  const host = await mount(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <div style={{ width: opts.width ?? 1100 }}>
          <DeadlineList groups={groups()} projects={new Map()} selected={opts.selected ?? new Set()} anchorId="t1" {...fns} />
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
    { ready: (h) => h.querySelectorAll('[data-dl-id]').length === 4, label: 'DeadlineList' },
  )
  const row = (id: string) => host.querySelector(`.sr-row[data-dl-id="${id}"]`)!
  const order = () => [...host.querySelectorAll('.sr-row[data-dl-id]')].map((r) => r.getAttribute('data-dl-id'))
  return { host, row, order, ...fns }
}

describe('Deadlines list on sleek rows', () => {
  it('renders the groups as sleek rows with sortable headers and no Type column; Completed starts folded', async () => {
    const { host, row } = await renderList()
    const heads = [...host.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent)
    expect(heads).toEqual(['', 'Title', 'Project', 'Due', 'Status', 'Owner'])
    expect(host.querySelector('.sr-grp-h[aria-expanded="false"]')!.textContent).toContain('Completed')
    expect(row('d1')).toBeNull()
    click(host.querySelector('.sr-grp-h[aria-expanded="false"]')!)
    await tick()
    expect(row('d1')).not.toBeNull()
    expect(row('d1').className).toContain('sr-done')
  })

  it('a grant milestone is a gold diamond with no complete box; a task has the box', async () => {
    const { row } = await renderList()
    expect(row('g1').querySelector('.sr-dia')).not.toBeNull()
    expect(row('g1').querySelector('.tk-ck')).toBeNull()
    expect(row('g1').querySelector('[aria-label="Hard date: 2099-02-01"]')).not.toBeNull()
    expect(row('t1').querySelector('.tk-ck')).not.toBeNull()
  })

  it('hides the default status, shows any other, and keeps both editable', async () => {
    const { row } = await renderList()
    expect(row('t1').querySelector('[data-col="status"] .tk-pill')).toBeNull()
    expect(row('t1').querySelector('[data-col="status"] .sr-trig')!.textContent).toContain('Status: To Do')
    expect(row('t2').querySelector('[data-col="status"] .tk-pill')!.textContent).toBe('In Progress')
    expect(row('g1').querySelector('[data-col="status"] .tk-pill')).toBeNull()
    click(row('t1').querySelector('[data-col="status"] .sr-trig')!)
    await tick()
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()
  })

  it('the box completes the task (square = complete, Rule 68)', async () => {
    const { row, onStatusChange, toggleSelect } = await renderList()
    click(row('t1').querySelector('.tk-ck')!)
    expect(onStatusChange).toHaveBeenCalledWith('t1', 'done', 'todo')
    expect(toggleSelect).not.toHaveBeenCalled()
  })

  it('no ring on load; j / k show then move the cursor; x selects a task but never a grant milestone; e opens the task; Esc clears', async () => {
    const { row, toggleSelect, onOpenTask, setSelected } = await renderList()
    // No cursor ring before the keyboard is used (prod check 2026-10-11): the
    // first j shows it on the first row, the next moves it.
    expect(row('t1').className).not.toContain('sr-cur')
    key('j'); await tick()
    expect(row('t1').className).toContain('sr-cur')
    key('j'); await tick()
    expect(row('t2').className).toContain('sr-cur')
    key('x')
    expect(toggleSelect).toHaveBeenCalledWith('t2')
    key('e')
    expect(onOpenTask).toHaveBeenCalledWith(t2)
    key('j'); await tick()
    expect(row('g1').className).toContain('sr-cur')
    toggleSelect.mockClear(); onOpenTask.mockClear()
    key('x'); key('e')
    expect(toggleSelect).not.toHaveBeenCalled()
    expect(onOpenTask).not.toHaveBeenCalled()
    key('k'); await tick()
    expect(row('t2').className).toContain('sr-cur')
    key('Escape')
    expect(setSelected).toHaveBeenCalled()
  })

  it('shift-click ranges over the tasks on screen, ctrl-click toggles, a plain click moves the cursor, the title opens', async () => {
    const { row, selectRange, toggleSelect, onOpenTask } = await renderList({ selected: new Set(['t3']) })
    expect(row('t3').className).toContain('sr-sel')
    expect(row('t2').className).toContain('sr-urg')
    click(row('t3'), { shiftKey: true })
    expect(selectRange).toHaveBeenCalledWith('t3', ['t1', 't2', 't3'], 't1')
    click(row('t2'), { ctrlKey: true })
    expect(toggleSelect).toHaveBeenCalledWith('t2')
    click(row('g1'), { ctrlKey: true })
    expect(toggleSelect).toHaveBeenCalledTimes(1)
    click(row('t3').querySelector('[data-col="owner"]')!)
    await tick()
    expect(row('t3').className).toContain('sr-cur')
    click(row('t1').querySelector('.sr-open')!)
    expect(onOpenTask).toHaveBeenCalledWith(t1)
  })

  it('a header click sorts within each group: asc, desc, then the date order again', async () => {
    const { host, order } = await renderList()
    const titleHead = [...host.querySelectorAll('[role="columnheader"] button')].find((b) => b.textContent?.startsWith('Title'))!
    expect(order()).toEqual(['t1', 't2', 'g1', 't3'])
    click(titleHead); await tick()
    expect(order()).toEqual(['t2', 't1', 't3', 'g1'])
    click(titleHead); await tick()
    expect(order()).toEqual(['g1', 't3', 't1', 't2'])
    click(titleHead); await tick()
    expect(order()).toEqual(['t1', 't2', 'g1', 't3'])
  })

  it('the phone layout keeps the box, title, due and face, and drops the default status', async () => {
    const { host, row } = await renderList({ width: 380 })
    await tick(60)
    expect(host.querySelector('.sr-narrow')).not.toBeNull()
    expect(row('t1').querySelector('.sr-ph-lead .tk-ck')).not.toBeNull()
    expect(row('t1').querySelector('.sr-ph-t')!.textContent).toContain('Bravo task')
    expect(row('t1').querySelector('.sr-ph-l [data-col="status"]')!.children.length).toBe(0)
    expect(row('t2').querySelector('.sr-ph-l [data-col="status"] .tk-pill')).not.toBeNull()
    expect(row('t1').querySelector('.sr-ph-trail [data-col="owner"]')!.children.length).toBeGreaterThan(0)
  })
})

describe('sortDeadlines', () => {
  it('puts a blank owner last in both directions and leaves the order alone without a sort', () => {
    const items = [fromTask(t1), { ...grantMs }, fromTask(t3)]
    expect(sortDeadlines(items, null, new Map())).toBe(items)
    expect(sortDeadlines(items, { key: 'owner', dir: 'asc' }, new Map()).at(-1)!.id).toBe('g1')
    expect(sortDeadlines(items, { key: 'owner', dir: 'desc' }, new Map()).at(-1)!.id).toBe('g1')
  })
})

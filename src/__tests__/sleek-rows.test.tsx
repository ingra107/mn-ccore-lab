// The sleek row primitive (components/table/SleekRows) and the two My Tasks
// views on it (Table, Lanes): row states, the header sort cycle, the table
// measuring its own width, and the keyboard / selection contract the views
// keep (j/k, x, shift-click range, ctrl-click toggle, title opens the editor,
// a click in an inline-edit cell never reaches the row).
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SleekTable, SleekRow, type SleekColumn } from '../components/table/SleekRows'
import { nextSleekSort, type SleekSort } from '../components/table/sleekSort'
import { TableView } from '../pages/MyTasks/views/TableView'
import { LanesView } from '../pages/MyTasks/views/LanesView'
import type { TaskRow } from '../lib/api'
import type { GroupKey } from '../pages/MyTasks/constants'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const click = (el: Element, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
const key = (k: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

type Row = { id: string; name: string }
const rows: Row[] = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Bravo' }]
const cols: SleekColumn<Row>[] = [
  { key: 'name', label: 'Name', width: 'minmax(0,1fr)', sortable: true, phone: 'title', render: (r) => <span>{r.name}</span> },
  { key: 'edit', label: 'Edit', width: '80px', interactive: true, phone: 'line', render: (r) => <><button type="button" data-edit={r.id}>edit</button><span data-plain={r.id}>note</span></> },
  { key: 'wide', label: 'Wide', width: '80px', minTableWidth: 900, phone: 'trail', render: () => <span>wide</span> },
]

function Harness({ onRowClick, width }: { onRowClick: (id: string) => void; width: number }) {
  const [sort, setSort] = useState<SleekSort>(null)
  return (
    <div style={{ width }}>
      <SleekTable columns={cols} sort={sort} onSort={setSort}>
        {rows.map((r, i) => (
          <SleekRow key={r.id} row={r} data={{ id: r.id }} cursor={i === 0} selected={i === 1} urgent onClick={() => onRowClick(r.id)} />
        ))}
      </SleekTable>
    </div>
  )
}

describe('SleekTable / SleekRow', () => {
  it('nextSleekSort cycles asc, desc, cleared, and restarts on a new column', () => {
    expect(nextSleekSort(null, 'a')).toEqual({ key: 'a', dir: 'asc' })
    expect(nextSleekSort({ key: 'a', dir: 'asc' }, 'a')).toEqual({ key: 'a', dir: 'desc' })
    expect(nextSleekSort({ key: 'a', dir: 'desc' }, 'a')).toBeNull()
    expect(nextSleekSort({ key: 'a', dir: 'desc' }, 'b')).toEqual({ key: 'b', dir: 'asc' })
  })

  it('carries cursor / selected / urgent states and keeps inline-edit clicks off the row', async () => {
    const onRowClick = vi.fn()
    const host = await mount(<Harness onRowClick={onRowClick} width={1000} />, { ready: (h) => h.querySelectorAll('.sr-row').length === 2, label: 'Harness' })
    const [a, b] = host.querySelectorAll('.sr-row')
    expect(a.className).toContain('sr-cur')
    expect(b.className).toContain('sr-sel')
    expect(b.className).toContain('sr-urg')
    expect(b.getAttribute('data-id')).toBe('b')
    click(host.querySelector('[data-edit="a"]')!)
    expect(onRowClick).not.toHaveBeenCalled()
    click(a.querySelector('[data-col="name"]')!)
    expect(onRowClick).toHaveBeenCalledWith('a')
  })

  it('the header sorts asc, then desc, then clears', async () => {
    const host = await mount(<Harness onRowClick={() => {}} width={1000} />, { ready: (h) => h.querySelector('[role="columnheader"] button'), label: 'Harness' })
    const head = () => host.querySelector('[role="columnheader"]')!
    const btn = () => head().querySelector('button')!
    expect(head().getAttribute('aria-sort')).toBe('none')
    click(btn()); await tick()
    expect(head().getAttribute('aria-sort')).toBe('ascending')
    click(btn()); await tick()
    expect(head().getAttribute('aria-sort')).toBe('descending')
    click(btn()); await tick()
    expect(head().getAttribute('aria-sort')).toBe('none')
  })

  it('measures its own width: drops a column below its minTableWidth and turns to the phone layout below 640', async () => {
    const wide = await mount(<Harness onRowClick={() => {}} width={1000} />, { ready: (h) => h.querySelectorAll('[role="columnheader"]').length === 3, label: 'wide' })
    expect(wide.querySelector('.sr-narrow')).toBeNull()
    const mid = await mount(<Harness onRowClick={() => {}} width={800} />, { ready: (h) => h.querySelectorAll('[role="columnheader"]').length === 2, label: 'mid' })
    expect(mid.textContent).not.toContain('wide')
    const phone = await mount(<Harness onRowClick={() => {}} width={380} />, { ready: (h) => h.querySelector('.sr-narrow .sr-ph'), label: 'phone' })
    expect(phone.querySelector('[role="columnheader"]')).toBeNull()
    expect(phone.querySelector('select[aria-label="Sort by"]')).not.toBeNull()
    expect(phone.querySelector('.sr-ph-t')!.textContent).toContain('Alpha')
    expect(phone.querySelector('.sr-ph-l [data-edit="a"]')).not.toBeNull()
    // minTableWidth governs the desktop grid only: the phone slot still shows.
    expect(phone.querySelector('.sr-ph-trail')!.textContent).toContain('wide')
  })

  it('plain text inside an interactive cell reaches the row; its controls do not', async () => {
    const onRowClick = vi.fn()
    const host = await mount(<Harness onRowClick={onRowClick} width={1000} />, { ready: (h) => h.querySelectorAll('.sr-row').length === 2, label: 'Harness' })
    click(host.querySelector('[data-edit="b"]')!)
    expect(onRowClick).not.toHaveBeenCalled()
    click(host.querySelector('[data-plain="b"]')!)
    expect(onRowClick).toHaveBeenCalledWith('b')
  })
})

const task = (id: string, title: string, extra: Partial<TaskRow> = {}) => ({
  id, title, short_title: null, description: '', assignee: 'nick-ingraham', assigned_by: null, watchers: null,
  due_date: null, priority: 'medium', status: 'todo', completed: 0, completed_at: null, project_id: null,
  group_override: null, acknowledged_at: '2026-01-01', updated_at: '2026-10-01', ...extra,
}) as unknown as TaskRow

function wrap(node: React.ReactNode, width = 1100) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <div style={{ height: 600, width, display: 'flex', flexDirection: 'column' }}>{node}</div>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('My Tasks Table on sleek rows', () => {
  const tasks = [task('t1', 'First task'), task('t2', 'Second task', { priority: 'urgent' }), task('t3', 'Third task')]

  async function renderTable() {
    const fns = { toggleSelect: vi.fn(), selectRange: vi.fn(), setSelected: vi.fn(), setDrawer: vi.fn() }
    const host = await mount(wrap(
      <TableView
        filtered={tasks} isEmpty={false} selected={new Set(['t3'])} anchorId="t1"
        toggleSelect={fns.toggleSelect} selectRange={fns.selectRange} setSelected={fns.setSelected} setDrawer={fns.setDrawer}
        projectsByPid={new Map()} projectOptions={[]} plannedSet={new Set()}
      />,
    ), { ready: (h) => h.querySelectorAll('.list-view-row').length === 3, label: 'TableView' })
    const row = (id: string) => host.querySelector(`.list-view-row[data-task-id="${id}"]`)!
    return { host, row, ...fns }
  }

  it('j / k move the cursor ring; x selects the cursor row; e opens it; Esc clears', async () => {
    const { row, toggleSelect, setDrawer, setSelected } = await renderTable()
    expect(row('t1').className).toContain('sr-cur')
    key('j'); await tick()
    expect(row('t2').className).toContain('sr-cur')
    expect(row('t1').className).not.toContain('sr-cur')
    key('x')
    expect(toggleSelect).toHaveBeenCalledWith('t2')
    key('e')
    expect(setDrawer).toHaveBeenCalledWith('t2')
    key('k'); await tick()
    expect(row('t1').className).toContain('sr-cur')
    key('Escape')
    expect(setSelected).toHaveBeenCalled()
  })

  it('shows selection and urgency on the row; shift-click ranges, ctrl-click toggles, plain click moves the cursor', async () => {
    const { row, toggleSelect, selectRange } = await renderTable()
    expect(row('t3').className).toContain('sr-sel')
    expect(row('t2').className).toContain('sr-urg')
    click(row('t3'), { shiftKey: true })
    expect(selectRange).toHaveBeenCalledWith('t3', ['t1', 't2', 't3'], 't1')
    click(row('t2'), { ctrlKey: true })
    expect(toggleSelect).toHaveBeenCalledWith('t2')
    click(row('t3').querySelector('[data-col="title"]')!)
    await tick()
    expect(row('t3').className).toContain('sr-cur')
  })

  it('after a header click, Enter opens the cursor row instead of sorting again', async () => {
    const { host, setDrawer } = await renderTable()
    const btn = host.querySelector<HTMLButtonElement>('[role="columnheader"] button')!
    const head = btn.closest('[role="columnheader"]')!
    // A mouse click focuses the button first, then fires click with detail 1.
    btn.focus()
    click(btn, { detail: 1 }); await tick()
    expect(head.getAttribute('aria-sort')).toBe('ascending')
    expect(document.activeElement).toBe(host.querySelector('.sr'))
    key('Enter')
    expect(setDrawer).toHaveBeenCalledTimes(1)
    expect(head.getAttribute('aria-sort')).toBe('ascending')
  })

  it('a keyboard press on a header keeps focus on it, so Tab order holds', async () => {
    const { host } = await renderTable()
    const btn = host.querySelector<HTMLButtonElement>('[role="columnheader"] button')!
    btn.focus()
    click(btn, { detail: 0 }); await tick()
    expect(document.activeElement).toBe(btn)
  })

  it('a title click opens the drawer; a modified title click selects instead', async () => {
    const { row, setDrawer, selectRange } = await renderTable()
    click(row('t2').querySelector('.sr-open')!)
    expect(setDrawer).toHaveBeenCalledWith('t2')
    setDrawer.mockClear()
    click(row('t1').querySelector('.sr-open')!, { shiftKey: true })
    expect(setDrawer).not.toHaveBeenCalled()
    expect(selectRange).toHaveBeenCalled()
  })

  it('an inline-edit cell opens its picker without moving the cursor', async () => {
    const { host, row } = await renderTable()
    click(row('t3').querySelector('[data-col="priority"] .sr-trig')!)
    await tick()
    expect(row('t1').className).toContain('sr-cur')
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()
    expect(host.querySelector('[role="columnheader"][aria-sort]')).not.toBeNull()
  })

  it('a milestone row has no complete box and shows its internal and hard dates', async () => {
    const ms = task('m1', 'Submit to sponsor', { kind: 'milestone', due_date: '2099-03-01', deadline: '2099-03-15' } as Partial<TaskRow>)
    const host = await mount(wrap(
      <TableView
        filtered={[ms, tasks[0]]} isEmpty={false} selected={new Set()} anchorId={null}
        toggleSelect={vi.fn()} selectRange={vi.fn()} setSelected={vi.fn()} setDrawer={vi.fn()}
        projectsByPid={new Map()} projectOptions={[]} plannedSet={new Set()}
      />,
    ), { ready: (h) => h.querySelectorAll('.list-view-row').length === 2, label: 'TableView milestone' })
    const row = host.querySelector('.list-view-row[data-task-id="m1"]')!
    expect(row.querySelector('.tk-ck')).toBeNull()
    expect(row.querySelector('[aria-label="Internal date: 2099-03-01"]')).not.toBeNull()
    expect(row.querySelector('[aria-label="Hard date: 2099-03-15"]')).not.toBeNull()
    expect(host.querySelector('.list-view-row[data-task-id="t1"] .tk-ck')).not.toBeNull()
  })

  it('the phone Table keeps the Urgent tag and the owner face, and its due pill still edits', async () => {
    const phoneTasks = [task('p1', 'Upload IRB amendment', { priority: 'urgent', due_date: '2099-01-05' })]
    const host = await mount(wrap(
      <TableView
        filtered={phoneTasks} isEmpty={false} selected={new Set()} anchorId={null}
        toggleSelect={vi.fn()} selectRange={vi.fn()} setSelected={vi.fn()} setDrawer={vi.fn()}
        projectsByPid={new Map()} projectOptions={[]} plannedSet={new Set()}
      />, 390,
    ), { ready: (h) => h.querySelector('.sr-narrow .list-view-row.sr-ph'), label: 'TableView phone' })
    const row = host.querySelector('.list-view-row')!
    expect(row.querySelector('.sr-ph-l .tk-urgtag')).not.toBeNull()
    expect(row.querySelector('.sr-ph-trail [data-col="owner"]')!.children.length).toBeGreaterThan(0)
    click(row.querySelector('.sr-ph-l [data-col="due"] .sr-trig')!)
    await tick()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })
})

describe('My Tasks Lanes on sleek rows', () => {
  const lane = [task('l1', 'Lane one'), task('l2', 'Lane two')]
  const byGroup: Record<GroupKey, TaskRow[]> = { deep: lane, priorities: [], quick: [], pb: [], etl: [] }

  async function renderLanes(selected = new Set<string>()) {
    const fns = { toggleSelect: vi.fn(), selectRange: vi.fn(), setExpanded: vi.fn(), onOpenEditor: vi.fn(), onToggleComplete: vi.fn() }
    const host = await mount(wrap(
      <LanesView
        byGroup={byGroup} selected={selected} anchorId="l1" expanded={null} filterGroup="deep"
        toggleSelect={fns.toggleSelect} selectRange={fns.selectRange} setExpanded={fns.setExpanded}
        onOpenEditor={fns.onOpenEditor} onToggleComplete={fns.onToggleComplete}
        projectsByPid={new Map()} plannedSet={new Set()}
      />,
    ), { ready: (h) => h.querySelectorAll('.sr-row').length === 2, label: 'LanesView' })
    const row = (id: string) => host.querySelector(`.sr-row[data-task-id="${id}"]`)!
    return { host, row, ...fns }
  }

  it('plain click expands, shift-click ranges within the lane, ctrl-click toggles, the title opens the editor, the box completes', async () => {
    const { row, setExpanded, selectRange, toggleSelect, onOpenEditor, onToggleComplete } = await renderLanes()
    click(row('l1').querySelector('[data-col="due"]')!)
    expect(setExpanded).toHaveBeenCalledWith('l1')
    click(row('l2'), { shiftKey: true })
    expect(selectRange).toHaveBeenCalledWith('l2', ['l1', 'l2'], 'l1')
    click(row('l2'), { ctrlKey: true })
    expect(toggleSelect).toHaveBeenCalledWith('l2')
    click(row('l2').querySelector('.sr-open')!)
    expect(onOpenEditor).toHaveBeenCalledWith('l2')
    click(row('l1').querySelector('.tk-ck')!)
    expect(onToggleComplete).toHaveBeenCalledWith(lane[0])
    expect(setExpanded).toHaveBeenCalledTimes(1)
  })

  it('while a selection is open, a plain click selects instead of expanding', async () => {
    const { row, setExpanded, toggleSelect, onOpenEditor } = await renderLanes(new Set(['l1']))
    expect(row('l1').className).toContain('sr-sel')
    click(row('l2'))
    expect(toggleSelect).toHaveBeenCalledWith('l2')
    click(row('l2').querySelector('.sr-open')!)
    expect(onOpenEditor).not.toHaveBeenCalled()
    expect(setExpanded).not.toHaveBeenCalled()
  })

  it('a click on "No project" expands the row (the project cell is not a dead zone)', async () => {
    const { row, setExpanded } = await renderLanes()
    const noProject = row('l1').querySelector('[data-col="project"] .tk-cs')!
    expect(noProject.textContent).toBe('No project')
    click(noProject)
    expect(setExpanded).toHaveBeenCalledWith('l1')
  })
})

describe('My Tasks Lanes milestones', () => {
  it('a milestone shows no complete box and both of its dates', async () => {
    const ms = task('lm', 'Hand to Amy', { kind: 'milestone', due_date: '2099-04-01', deadline: '2099-04-20' } as Partial<TaskRow>)
    const byGroup: Record<GroupKey, TaskRow[]> = { deep: [ms], priorities: [], quick: [], pb: [], etl: [] }
    const host = await mount(wrap(
      <LanesView
        byGroup={byGroup} selected={new Set()} anchorId={null} expanded={null} filterGroup="deep"
        toggleSelect={vi.fn()} selectRange={vi.fn()} setExpanded={vi.fn()}
        onOpenEditor={vi.fn()} onToggleComplete={vi.fn()}
        projectsByPid={new Map()} plannedSet={new Set()}
      />,
    ), { ready: (h) => h.querySelectorAll('.sr-row').length === 1, label: 'LanesView milestone' })
    const row = host.querySelector('.sr-row[data-task-id="lm"]')!
    expect(row.querySelector('.tk-ck')).toBeNull()
    expect(row.querySelector('[aria-label="Internal date: 2099-04-01"]')).not.toBeNull()
    expect(row.querySelector('[aria-label="Hard date: 2099-04-20"]')).not.toBeNull()
  })
})

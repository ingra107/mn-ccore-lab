// Tasks Board on the Today card (Nick approved the mock 2026-10-10,
// Scratch/mockups/2026-10-10-tasks-table-rows.html, "Proposed: Board").
//
// What the Board must still do after the reskin:
// - a click on a card, or Enter on its header, opens the task panel;
// - the done box completes and does NOT open the panel;
// - the priority word cycles priority and does NOT open the panel;
// - every card keeps dnd-kit's focus stop, so a card can still be picked up
//   and moved between columns from the keyboard;
// - folder + Work on are hidden until hover; urgent keeps the orange edge and
//   shows no priority word (its title row says Urgent);
// - an empty column is a quiet "Nothing here" panel, and column heads carry no
//   coloured rule.
//
// Runs in real Chromium with the Today skin CSS injected.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TaskBoardView from '../components/tasks/TaskBoardView'
import type { TaskRow } from '../lib/api'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}), text: async () => '' })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

const tokens = css.slice(css.indexOf('/* ── Stepped-surface tokens'), css.indexOf('/* ── Z-Index Hierarchy'))
const skin = css.slice(css.indexOf('/* ══ Today skin'))
const style = document.createElement('style')
style.textContent = '*,::before,::after{box-sizing:border-box}\n' + tokens + '\n' + skin
document.head.appendChild(style)

function task(id: string, title: string, over: Partial<TaskRow> = {}): TaskRow {
  return {
    id, title, short_title: null, description: '', assignee: 'nick-ingraham',
    assigned_by: null, watchers: null, due_date: '2026-01-02', priority: 'medium', status: 'todo',
    completed: 0, completed_at: null, project_id: 'p', group_override: null, acknowledged_at: '2026-01-01',
    ...over,
  } as unknown as TaskRow
}

const projects = new Map([['p', { name: 'CQODE-CLIF ETL', slug: 'p', primary_folder: 'C:/x' }]])
const TASKS = [
  task('a', 'Locate AMPAC data'),
  task('b', 'Decide Oct A0 NOFO', { priority: 'urgent' }),
  task('c', 'Upgrade CLIFpy 3.0', { status: 'in_progress', priority: 'high' }),
]

async function board(onSelect: (t: TaskRow) => void = () => {}) {
  localStorage.removeItem('mnccore-board-collapsed-v1')
  return mount(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <div style={{ width: 1200 }}>
          <TaskBoardView tasks={TASKS} onStatusChange={() => {}} onSelect={onSelect} projectsByPid={projects} />
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
    { ready: (h) => h.querySelectorAll('.tk-tc').length === 3, label: 'board cards' },
  )
}

const card = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!

describe('Tasks Board cards', () => {
  it('renders the Today card in each column, plain heads, a quiet empty panel', async () => {
    const host = await board()
    expect(host.querySelector('.tk.tk-board')).not.toBeNull()
    const heads = [...host.querySelectorAll<HTMLElement>('h4.tk-bd-h')]
    expect(heads.map((h) => h.textContent)).toEqual(['To Do2', 'In Progress1', 'Blocked0', 'Done0'])
    for (const h of heads) expect(getComputedStyle(h).borderBottomWidth).toBe('0px')
    expect([...host.querySelectorAll('.tk-bd-empty')].map((e) => e.textContent)).toEqual(['Nothing here', 'Nothing here'])
    // The project is its own muted line, on the card's context line.
    expect(card(host, 'a').querySelector('.tk-cs')!.textContent).toBe('CQODE-CLIF ETL')
  })

  it('a card click and Enter on its header open the task', async () => {
    const opened: string[] = []
    const host = await board((t) => opened.push(t.id))
    card(host, 'a').querySelector<HTMLElement>('.tk-tch')!.click()
    card(host, 'c').querySelector<HTMLElement>('.tk-tch')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(opened).toEqual(['a', 'c'])
  })

  it('the done box and the priority word act without opening the task', async () => {
    const opened: string[] = []
    const host = await board((t) => opened.push(t.id))
    card(host, 'a').querySelector<HTMLElement>('button.tk-ck')!.click()
    const prio = card(host, 'c').querySelector<HTMLButtonElement>('button.tk-prio')!
    expect(prio.textContent).toBe('High')
    prio.click()
    expect(opened).toEqual([])
    await new Promise((r) => setTimeout(r, 50))
    const bodies = fetchMock.mock.calls.map(([, init]) => String((init as RequestInit | undefined)?.body ?? ''))
    expect(bodies.some((b) => b.includes('"priority":"urgent"'))).toBe(true)
    expect(bodies.some((b) => b.includes('"status":"done"'))).toBe(true)
  })

  it('keeps the keyboard drag stop on every card', async () => {
    const host = await board()
    for (const w of host.querySelectorAll<HTMLElement>('.tk-bd-card')) {
      expect(w.tabIndex).toBe(0)
      expect(w.getAttribute('aria-roledescription')).toBe('sortable')
    }
  })

  it('urgent keeps the orange edge and no priority word; folder + Work on wait for hover', async () => {
    const host = await board()
    const urgent = card(host, 'b')
    expect(urgent.classList.contains('tk-urg')).toBe(true)
    expect(urgent.querySelector('button.tk-prio')).toBeNull()
    expect(card(host, 'a').classList.contains('tk-urg')).toBe(false)
    const wk = card(host, 'a').querySelector<HTMLElement>('.tk-wk')!
    expect(wk.querySelector('button')).not.toBeNull()
    expect(getComputedStyle(wk).opacity).toBe('0')
  })
})

// Tasks Board on the Today card (Nick approved the mock 2026-10-10,
// Scratch/mockups/2026-10-10-tasks-table-rows.html, "Proposed: Board").
//
// What the Board must still do after the reskin:
// - a click on a card, or Enter on its header, opens the task panel;
// - the done box completes and does NOT open the panel;
// - the priority word cycles priority and does NOT open the panel;
// - the card header is the one focus stop: Enter opens, Space picks the card up
//   for a keyboard move between columns, and a Space from the done box does not;
// - folder + Work on are hidden until hover; due + priority share one line;
//   urgent keeps the orange edge and its Urgent tag cycles back to low;
// - the Done column keeps Re-accept, and reopening from it has an undo;
// - an empty column is a quiet "Nothing here" panel, and column heads carry no
//   coloured rule.
//
// Runs in real Chromium with the Today skin CSS injected.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TaskBoardView from '../components/tasks/TaskBoardView'
import { UndoToastProvider } from '../components/UndoToast'
import { Who } from '../components/today/skin'
import type { TaskRow } from '../lib/api'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { LAUNCHER_STORAGE_KEY } from '../hooks/useLauncherInstalled'

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

// The folder buttons render only for the PI with the launcher switch on
// (WorkOnActions' one gate, schema-v127 review M7). The board renders as Nick.
const PI_USER: AuthUser = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true,
  isMember: true, canShowAllProjects: true, piResolved: true,
}

async function board(onSelect: (t: TaskRow) => void = () => {}, user: AuthUser = PI_USER, launcher = true) {
  localStorage.removeItem('mnccore-board-collapsed-v1')
  localStorage.setItem(LAUNCHER_STORAGE_KEY, launcher ? 'yes' : 'no')
  return mount(
    <AuthContext.Provider value={{ user, isAuthenticated: user.isAuthenticated, isLoading: false }}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <div style={{ width: 1200 }}>
            <TaskBoardView tasks={TASKS} onStatusChange={() => {}} onSelect={onSelect} projectsByPid={projects} />
          </div>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>,
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

  it('the header is the one focus stop; Space on it picks the card up, Space from an inner control does not', async () => {
    const host = await board()
    for (const w of host.querySelectorAll<HTMLElement>('.tk-bd-card')) {
      // The wrapper is no longer a second (nested) role=button focus stop.
      expect(w.hasAttribute('tabindex')).toBe(false)
      expect(w.getAttribute('role')).toBeNull()
      const header = w.querySelector<HTMLElement>('.tk-tch')!
      expect(header.tabIndex).toBe(0)
      // dnd-kit's drag instructions are announced on the header (dnd-kit
      // portals the instruction text in after its first mount, so wait for it).
      const id = header.getAttribute('aria-describedby') ?? ''
      for (let i = 0; i < 50 && !document.getElementById(id); i++) await new Promise((r) => setTimeout(r, 20))
      expect(document.getElementById(id)?.textContent).toMatch(/Space picks the card up/)
      // No title span stop on the board: the header already opens the task.
      expect(w.querySelector('.tk-ct [role="button"]')).toBeNull()
    }
    const space = { key: ' ', code: 'Space', bubbles: true, cancelable: true }
    // Space on the done box: no pick-up.
    card(host, 'a').querySelector<HTMLElement>('button.tk-ck')!.dispatchEvent(new KeyboardEvent('keydown', space))
    await new Promise((r) => setTimeout(r, 30))
    expect(host.querySelector('.tk-bd-lift')).toBeNull()
    // Space on the header: the card lifts into the drag overlay.
    const header = card(host, 'a').querySelector<HTMLElement>('.tk-tch')!
    header.focus()
    header.dispatchEvent(new KeyboardEvent('keydown', space))
    await new Promise((r) => setTimeout(r, 30))
    expect(document.querySelector('.tk-bd-lift')).not.toBeNull()
    // Escape cancels (the overlay then plays its drop animation out).
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 600))
    expect(document.querySelector('.tk-bd-lift')).toBeNull()
  })

  it('urgent keeps the orange edge and its tag is the priority control, which steps back to low', async () => {
    const host = await board()
    const urgent = card(host, 'b')
    expect(urgent.classList.contains('tk-urg')).toBe(true)
    // The title row's own Urgent tag is hidden on the board; the context line carries it.
    expect(getComputedStyle(urgent.querySelector<HTMLElement>('.tk-ct .tk-urgtag')!).display).toBe('none')
    const prio = urgent.querySelector<HTMLButtonElement>('.tk-ctx button.tk-prio')!
    expect(prio.textContent).toBe('Urgent')
    prio.click()
    await new Promise((r) => setTimeout(r, 50))
    const bodies = fetchMock.mock.calls.map(([, init]) => String((init as RequestInit | undefined)?.body ?? ''))
    expect(bodies.some((b) => b.includes('"priority":"low"'))).toBe(true)
    expect(card(host, 'a').classList.contains('tk-urg')).toBe(false)
  })

  it('folder + Work on wait for hover, and due + priority share one line in the column', async () => {
    const host = await board()
    const a = card(host, 'a')
    const wk = a.querySelector<HTMLElement>('.tk-wk')!
    expect(wk.querySelector('button')).not.toBeNull()
    expect(getComputedStyle(wk).opacity).toBe('0')
    // An overdue due pill and the priority word sit on the same line.
    const due = a.querySelector<HTMLElement>('.tk-duepill')!.getBoundingClientRect()
    const pri = a.querySelector<HTMLElement>('button.tk-prio')!.getBoundingClientRect()
    expect(Math.abs(due.top + due.height / 2 - (pri.top + pri.height / 2))).toBeLessThan(4)
    // The context line spans the face column: wider than the title.
    const ctxW = a.querySelector<HTMLElement>('.tk-ctx')!.getBoundingClientRect().width
    const titleW = a.querySelector<HTMLElement>('.tk-ct')!.getBoundingClientRect().width
    expect(ctxW).toBeGreaterThan(titleW)
  })

  it("no folder buttons with the launcher switch off, or for a non-PI (primary_folder is the PI's path)", async () => {
    const off = await board(() => {}, PI_USER, false)
    expect(card(off, 'a').querySelector('.tk-wk button')).toBeNull()
    const member = await board(() => {}, { ...PI_USER, email: 'eddin022@umn.edu', slug: 'casey-eddington', isPi: false, canShowAllProjects: false }, true)
    expect(card(member, 'a').querySelector('.tk-wk button')).toBeNull()
    localStorage.removeItem(LAUNCHER_STORAGE_KEY)
  })
})

describe('Pill names on a tight line', () => {
  it('a long waiting-on phrase stays inside the card; a pill name keeps a 3em floor; a short name is not padded', async () => {
    localStorage.removeItem('mnccore-board-collapsed-v1')
    const waiting = [task('w', 'Decide Oct A0 NOFO/study section', { waiting_on: 'waiting for Dr. Grandon to respond' } as Partial<TaskRow>)]
    const host = await mount(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <div style={{ width: 1200 }}>
            <TaskBoardView tasks={waiting} onStatusChange={() => {}} projectsByPid={projects} />
          </div>
        </MemoryRouter>
      </QueryClientProvider>,
      { ready: (h) => h.querySelector('.tk-tc .tk-pill .tk-pn'), label: 'waiting card' },
    )
    const c = card(host, 'w')
    const edge = c.getBoundingClientRect().right
    for (const el of c.querySelectorAll<HTMLElement>('.tk-ctx > *')) expect(el.getBoundingClientRect().right).toBeLessThanOrEqual(edge + 0.5)
    const pn = c.querySelector<HTMLElement>('.tk-pill .tk-pn')!
    expect(pn.classList.contains('tk-pn-s')).toBe(false)
    const fs = parseFloat(getComputedStyle(pn).fontSize)
    expect(parseFloat(getComputedStyle(pn).minWidth)).toBeCloseTo(3 * fs, 1)

    const tight = await mount(
      <div className="tk" style={{ width: 120 }}>
        <div className="tk-ctx" style={{ flexWrap: 'nowrap' }}>
          <span className="tk-pill" style={{ minWidth: 0, overflow: 'hidden' }}>Waiting on <Who value="the whole biostatistics core team" /></span>
          <span className="tk-pill">Ana <Who value="Ana" /></span>
        </div>
      </div>,
      { ready: (h) => h.querySelectorAll('.tk-pn').length === 2, label: 'tight pills' },
    )
    const [long, short] = tight.querySelectorAll<HTMLElement>('.tk-pn')
    // The long phrase keeps ~3em of letters + an ellipsis, never 0px.
    expect(long.getBoundingClientRect().width).toBeGreaterThanOrEqual(3 * parseFloat(getComputedStyle(long).fontSize) - 0.5)
    // A short name is its own width, not padded to the floor.
    expect(short.classList.contains('tk-pn-s')).toBe(true)
    expect(Math.abs(short.getBoundingClientRect().width - short.scrollWidth)).toBeLessThan(1)
  })
})

describe('Tasks Board Done column', () => {
  it('a declined meeting task (done) keeps Re-accept; a done card shows no priority word', async () => {
    localStorage.removeItem('mnccore-board-collapsed-v1')
    const done = [
      task('d', 'Declined sync', { status: 'done', completed: 1, approval_status: 'declined' } as Partial<TaskRow>),
      task('e', 'Finished thing', { status: 'done', completed: 1 }),
    ]
    const host = await mount(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <UndoToastProvider>
          <MemoryRouter>
            <div style={{ width: 1200 }}>
              <TaskBoardView tasks={done} onStatusChange={() => {}} projectsByPid={projects} />
            </div>
          </MemoryRouter>
        </UndoToastProvider>
      </QueryClientProvider>,
      { ready: (h) => h.querySelectorAll('.tk-tc').length === 2, label: 'done cards' },
    )
    expect(card(host, 'd').querySelector('[data-testid="approval-reaccept"]')).not.toBeNull()
    expect(card(host, 'e').querySelector('[data-testid="approval-reaccept"]')).toBeNull()
    expect(card(host, 'd').querySelector('button.tk-prio')).toBeNull()
    // Reopening from the Done column writes todo and offers an undo.
    card(host, 'e').querySelector<HTMLElement>('button.tk-ck')!.click()
    await new Promise((r) => setTimeout(r, 50))
    const bodies = fetchMock.mock.calls.map(([, init]) => String((init as RequestInit | undefined)?.body ?? ''))
    expect(bodies.some((b) => b.includes('"status":"todo"'))).toBe(true)
    expect(document.body.textContent).toContain('Task reopened')
    expect([...document.querySelectorAll('button')].some((b) => /Undo/i.test(b.textContent ?? '') || /Undo/i.test(b.getAttribute('aria-label') ?? ''))).toBe(true)
  })
})

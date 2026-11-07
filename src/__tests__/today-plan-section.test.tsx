// The Plan section on the REAL Today page (#169 round 2): each task once among
// the lists, Done at the bottom until the next plan, and the two surfaces that
// keep their copy (the timeline, a meeting card). Real Chromium, the real
// TodayPage, useTodayState and mutations; only fetch is stubbed, and it answers
// from a small store so a write shows up in the next read, as on the Hub.

import '../index.css'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import TodayPage from '../pages/portal/TodayPage'
import { civilDatePlusDays, todayKey } from '../lib/taskGrouping'
import { nowInstant } from '../lib/time'
import { LAUNCHER_STORAGE_KEY } from '../hooks/useLauncherInstalled'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals(); localStorage.removeItem(LAUNCHER_STORAGE_KEY) })

const nick = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}
const member = { ...nick, email: 'lianne@umn.edu', slug: 'lianne', isPi: false, canShowAllProjects: false }

type Row = Record<string, unknown>
const DAY = todayKey()
const civilPlus = (n: number) => civilDatePlusDays(DAY, n)
// This week's Monday, whatever day the suite runs: the window holds today.
const WEEK = (() => {
  const [y, m, d] = DAY.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return civilPlus(dow === 0 ? -6 : 1 - dow)
})()

const task = (id: string, extra: Row = {}): Row => ({
  id, title: `Title ${id}`, short_title: null, description: '', assignee: 'nick-ingraham', due_date: null, priority: 'high',
  status: 'todo', completed: 0, completed_at: null, project_id: null, kind: 'task', acknowledged_at: '2026-01-01',
  created_at: '2026-11-01 15:00:00', updated_at: '2026-11-01 15:00:00', ...extra,
})
const opt = (key: string, owner?: string) => ({ key, label: key, direction: `Step ${key}`, deliverable_kind: 'answer', recommended: true, ...(owner ? { owner } : {}) })
const plan = (id: string, at: string, picks: string[], owners: Record<string, string> = {}): Row => task(id, {
  title: 'Plan your week', source: 'week_plan', kind: 'question', created_at: at,
  question_spec_json: JSON.stringify({
    v: 1, kind: 'week_plan', week_start: WEEK, tz: 'America/Chicago', prompt: 'Plan', expires_at: null,
    candidates: picks.map((p) => ({ task_id: p, title: p, why: '', evidence: [], options: [opt(p, owners[p])] })),
  }),
  question_answer_json: JSON.stringify({ v: 1, choice: 'save', via: 'hub', at, picks: picks.map((p) => ({ task_id: p, option_key: p, text: null, start: false })) }),
  question_consumed_json: null,
})

function respond(status: number, body: unknown) {
  return { ok: status < 400, status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response
}

interface Calls { writes: { url: string; body: Row }[] }

/** Serve `rows`; a task POST updates the row it names, so the next read sees it. */
function stubHub(rows: Row[], extra: { meetings?: Row[]; meetingDetail?: Row; calendar?: Row[] } = {}): Calls {
  const calls: Calls = { writes: [] }
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (init?.method && init.method !== 'GET' && u.includes('/api/tasks/')) {
      const body = JSON.parse(String(init.body ?? '{}')) as Row
      calls.writes.push({ url: u, body })
      const id = decodeURIComponent(u.split('/api/tasks/')[1].split(/[/?]/)[0])
      const row = rows.find((r) => r.id === id)
      if (row) {
        Object.assign(row, body)
        if (body.status === 'done') Object.assign(row, { completed: 1, completed_at: nowInstant() })
        else if (body.status) Object.assign(row, { completed: 0, completed_at: null })
      }
      return respond(200, { data: row ?? {} })
    }
    if (u.includes('/api/tasks')) {
      // With others: the second read on the page.
      const list = u.includes('others_of') ? [] : rows
      return respond(200, { data: list, count: list.length })
    }
    if (u.includes('/api/projects')) return respond(200, { data: [], count: 0 })
    if (extra.meetingDetail && u.includes(`/api/meetings/${String(extra.meetingDetail.id)}`)) return respond(200, { data: extra.meetingDetail })
    if (u.includes('/api/meetings')) return respond(200, { data: extra.meetings ?? [], count: (extra.meetings ?? []).length })
    if (u.includes('/api/launch-log')) return respond(200, { data: [] })
    if (u.includes('/api/integrations/calendar/events')) return respond(200, { events: extra.calendar ?? [] })
    // Every other widget on Today has its own unavailable state.
    return respond(404, { error: 'not stubbed' })
  }))
  return calls
}

function page(user: typeof nick = nick) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider>
          <MemoryRouter><TodayPage /></MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

const section = (h: ParentNode) => h.querySelector('[data-testid="plan-section"]') as HTMLElement | null
const inSection = (h: ParentNode, id: string) => !!section(h)?.querySelector(`[data-task-id="${id}"]`)
// The Done group starts folded (Hub #171). The first read of a row in it opens the group.
const inDone = (h: ParentNode, id: string) => {
  const head = section(h)?.querySelector('[data-testid="plan-done"] .tk-plan-donehd') as HTMLElement | null
  if (head && head.getAttribute('aria-expanded') === 'false') head.click()
  return !!section(h)?.querySelector(`[data-testid="plan-done"] [data-task-id="${id}"]`)
}
const inGroups = (h: ParentNode, id: string) => h.querySelectorAll(`[data-group] [data-task-id="${id}"]`).length
const completedSection = (h: ParentNode) => h.querySelector('[data-b2-completed]') as HTMLElement
const openCompleted = (h: ParentNode) => (completedSection(h).querySelector('.tk-clk') as HTMLElement).click()
const loaded = (id: string) => (h: HTMLElement) => h.textContent?.includes(`Title ${id}`)

const AT1 = `${civilPlus(-1)}T14:00:00Z`
const AT2 = `${civilPlus(0)}T00:30:00Z`

describe('The Plan section on Today', () => {
  it('the due-window control starts at 14 days and moves to 30 on a press (Hub #172)', async () => {
    stubHub([task('other')])
    const h = await mount(page(), { ready: loaded('other'), label: 'today' })
    const btns = () => [...h.querySelectorAll<HTMLButtonElement>('[aria-label="Show tasks due within"] button')]
    expect(btns().map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}`)).toEqual(['7d:false', '14d:true', '30d:false'])
    btns()[2].click()
    await waitFor(() => btns()[2].getAttribute('aria-pressed') === 'true', '30d pressed')
    expect(btns()[1].getAttribute('aria-pressed')).toBe('false')
  })

  it('a_pick_does_not_also_show_in_its_section', async () => {
    stubHub([plan('p', AT1, ['a']), task('a'), task('other')])
    const h = await mount(page(), { ready: loaded('a'), label: 'today' })
    await waitFor(() => inGroups(h, 'other') === 1, 'the unpicked task in its section')
    expect(inSection(h, 'a')).toBe(true)
    expect(inGroups(h, 'a')).toBe(0)
    expect(inSection(h, 'other')).toBe(false)
  })

  it('a step whose parent is in the section stays on the parent card, not in a list', async () => {
    stubHub([plan('p', AT1, ['a']), task('a', { step_total: 1, step_done: 0 }), task('s', { parent_id: 'a', title: 'Title s' }), task('other')])
    const h = await mount(page(), { ready: loaded('a'), label: 'today' })
    await waitFor(() => inGroups(h, 'other') === 1, 'groups')
    expect(inGroups(h, 's')).toBe(0)
  })

  it('a_done_pick_is_not_in_completed_today_until_replanned', async () => {
    const rows = [plan('p', AT1, ['a', 'b']), task('a'), task('b'), task('other')]
    const calls = stubHub(rows)
    const h = await mount(page(), { ready: loaded('a'), label: 'today' })
    await waitFor(() => inSection(h, 'a'), 'the pick')

    ;(section(h)!.querySelector('[data-task-id="a"] button[aria-label="Mark done"]') as HTMLElement).click()
    await waitFor(() => inDone(h, 'a'), 'the pick in Done')
    expect(section(h)!.querySelectorAll('[data-task-id="a"]')).toHaveLength(1)
    expect(inGroups(h, 'a')).toBe(0)
    openCompleted(h)
    await waitFor(() => completedSection(h).querySelector('.tk-cnt')?.textContent === '0', 'Completed today stays empty')
    expect(completedSection(h).textContent).not.toContain('Title a')
    // The header count still counts it: counts read what they read before.
    await waitFor(() => h.querySelector('[data-b2-stats] a[aria-label^="1 done:"]'), 'done stat')
    expect(calls.writes.some((w) => w.body.status === 'done')).toBe(true)

    // Reopen from Done: back in its place, in the section, once.
    ;(section(h)!.querySelector('[data-task-id="a"] button[aria-label="Mark not done"]') as HTMLElement).click()
    await waitFor(() => inSection(h, 'a') && !inDone(h, 'a'), 'back in its place')
    expect(section(h)!.querySelectorAll('[data-task-id="a"]')).toHaveLength(1)
    expect(inGroups(h, 'a')).toBe(0)
  })

  it('a_finished_task_after_a_replan_is_in_completed_today_if_today', async () => {
    const done = task('a', { status: 'done', completed: 1, completed_at: nowInstant() })
    stubHub([plan('p1', AT1, ['a', 'b']), plan('p2', AT2, ['b']), done, task('b')])
    const h = await mount(page(), { ready: loaded('b'), label: 'today' })
    await waitFor(() => inSection(h, 'b'), 'the new plan')
    expect(inSection(h, 'a')).toBe(false)
    openCompleted(h)
    await waitFor(() => completedSection(h).textContent?.includes('Title a'), 'the finished pick in Completed today')
    expect(completedSection(h).querySelector('.tk-cnt')?.textContent).toBe('1')
  })

  it('checking a planned non-pick keeps it in Done, once, through the real markDone', async () => {
    const calls = stubHub([task('x', { planned_for: DAY, plan_slot: 'strip', plan_rank: 1 }), task('other')])
    const h = await mount(page(), { ready: loaded('x'), label: 'today' })
    await waitFor(() => inSection(h, 'x'), 'the planned task')
    ;(section(h)!.querySelector('[data-task-id="x"] button[aria-label="Mark done"]') as HTMLElement).click()
    await waitFor(() => inDone(h, 'x'), 'the task in Done')
    await waitFor(() => calls.writes.some((w) => w.body.status === 'done'), 'the done write')
    // Done must not clear the plan columns: they are how Done knows the task was today's.
    expect(calls.writes.some((w) => 'planned_for' in w.body)).toBe(false)
    expect(completedSection(h).querySelector('.tk-cnt')?.textContent).toBe('0')
  })

  it('a_meeting_card_keeps_its_row', async () => {
    const meeting = { id: 'mtg1', date: DAY, title: 'Lab meeting', type: 'team', action_count: 1, open_action_count: 1 }
    const pick = task('a', { meeting_id: 'mtg1' })
    stubHub([plan('p', AT1, ['a']), pick, task('other')], {
      meetings: [meeting],
      meetingDetail: { ...meeting, attendees: '[]', action_items: [pick] },
    })
    const h = await mount(page(), { ready: loaded('a'), label: 'today' })
    await waitFor(() => h.querySelector('[data-testid="meeting-actions-card"] [data-task-id="a"]'), 'the row on the meeting card')
    expect(inSection(h, 'a')).toBe(true)
    expect(inGroups(h, 'a')).toBe(0)
  })

  it('the_timeline_keeps_a_timed_task', async () => {
    // A 14:00 block in the free time after a morning meeting, on any wall clock.
    const at = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString() }
    const event = { id: 'e1', uid: 'u1', title: 'Morning', location: null, startAt: at(9), endAt: at(10), isAllDay: false }
    stubHub([task('x', { planned_for: DAY, plan_slot: 'between-1', plan_rank: 1, plan_start_min: 14 * 60, estimated_minutes: 30 })], { calendar: [event] })
    const h = await mount(page(), { ready: loaded('x'), label: 'today' })
    await waitFor(() => inSection(h, 'x'), 'the section copy')
    await waitFor(() => h.querySelector('[data-b2-timeline] [data-task-id="x"]'), 'the timeline copy')
    expect(inGroups(h, 'x')).toBe(0)
    expect(section(h)!.querySelector('[data-testid="pick-today"]')).not.toBeNull()
  })

  it('a_member_gets_the_section_with_no_plan_button', async () => {
    stubHub([task('x', { assignee: 'lianne', planned_for: DAY, plan_slot: 'strip', plan_rank: 1 }), task('y', { assignee: 'lianne' })])
    const h = await mount(page(member), { ready: loaded('x'), label: 'today' })
    await waitFor(() => inSection(h, 'x'), 'the planned task')
    expect(section(h)!.querySelector('[data-testid="plan-button"]')).toBeNull()
    expect(inGroups(h, 'x')).toBe(0)
  })

  it('x_clears_today_and_returns_a_non_pick_to_its_section', async () => {
    const rows = [plan('p', AT1, ['a']), task('a', { planned_for: DAY, plan_slot: 'strip', plan_rank: 1 }), task('x', { planned_for: DAY, plan_slot: 'strip', plan_rank: 2 })]
    const calls = stubHub(rows)
    const h = await mount(page(), { ready: loaded('x'), label: 'today' })
    await waitFor(() => inSection(h, 'x') && inSection(h, 'a'), 'both cards')

    const x = section(h)!.querySelector('[data-task-id="x"] button[aria-label="Remove from plan"]') as HTMLElement
    expect(x.getBoundingClientRect().width).toBeGreaterThanOrEqual(24) // the icon-button floor (Rule 29)
    x.click()
    await waitFor(() => inGroups(h, 'x') === 1, 'the non-pick back in its section')
    expect(inSection(h, 'x')).toBe(false)
    expect(calls.writes.find((w) => w.url.includes('/x'))?.body).toMatchObject({ planned_for: null, plan_slot: null, plan_rank: null })

    // A pick loses only its Today tag and stays: leaving the plan is the next Plan's job.
    const pick = () => section(h)!.querySelector('[data-task-id="a"]') as HTMLElement
    expect(pick().querySelector('[data-testid="pick-today"]')).not.toBeNull()
    ;(pick().querySelector('button[aria-label="Remove from today"]') as HTMLElement).click()
    await waitFor(() => pick().querySelector('[data-testid="pick-today"]') === null, 'the Today tag gone')
    expect(inGroups(h, 'a')).toBe(0)
    expect(pick().querySelector('button[aria-label="Remove from today"]')).toBeNull()
  })

  it('a_drag_onto_the_section_plans_the_task', async () => {
    const calls = stubHub([task('a')])
    const h = await mount(page(), { ready: loaded('a'), label: 'today' })
    const card = await waitFor(() => h.querySelector('[data-group] [data-task-id="a"]') as HTMLElement | null, 'the card')
    const from = card.getBoundingClientRect()
    const to = section(h)!.getBoundingClientRect()
    const sx = from.left + 40, sy = from.top + 12
    const tx = to.left + to.width / 2, ty = to.top + to.height / 2
    const fire = (el: EventTarget, type: string, x: number, y: number) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, isPrimary: true, pointerId: 1, pointerType: 'mouse',
    }))
    fire(card.querySelector('.tk-tch')!, 'pointerdown', sx, sy)
    fire(document, 'pointermove', sx + 8, sy + 8)
    await new Promise((r) => setTimeout(r, 30))
    fire(document, 'pointermove', tx, ty)
    await new Promise((r) => setTimeout(r, 60))
    fire(document, 'pointerup', tx, ty)
    await waitFor(() => calls.writes.some((w) => w.body.plan_slot === 'strip'), 'the plan write')
    expect(calls.writes.find((w) => w.body.plan_slot === 'strip')?.body.planned_for).toBe(DAY)
    await waitFor(() => inSection(h, 'a'), 'the card in the section')
    expect(inGroups(h, 'a')).toBe(0)
    // dnd-kit swallows the next click on the document for 50ms after a drag.
    await new Promise((r) => setTimeout(r, 80))
  })

  it('no empty line while the tasks are still loading', async () => {
    const waiting: ((r: Response) => void)[] = []
    let answered = false
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      // A task read that starts after the answer below must not wait forever: under load one did, and the section never left loading.
      if (String(url).includes('/api/tasks') && answered) return Promise.resolve(respond(200, { data: [], count: 0 }))
      if (String(url).includes('/api/tasks')) return new Promise<Response>((r) => { waiting.push(r) })
      return Promise.resolve(respond(404, { error: 'not stubbed' }))
    }))
    const h = await mount(page(), { ready: (host) => section(host), label: 'the section' })
    expect(section(h)!.querySelector('[data-testid="plan-empty"]')).toBeNull()
    answered = true
    for (const answer of waiting) answer(respond(200, { data: [], count: 0 }))
    await waitFor(() => section(h)!.querySelector('[data-testid="plan-empty"]'), 'the empty line after the read')
  })

  it('the empty section has one line, and the screen one Plan button: the gold row\'s', async () => {
    stubHub([task('other')])
    const h = await mount(page(), { ready: loaded('other'), label: 'today' })
    await waitFor(() => h.querySelector('[data-testid="q-week-plan"] [data-testid="plan-button"]'), 'the Plan button')
    expect(h.querySelectorAll('[data-testid="plan-button"]')).toHaveLength(1)
    expect(section(h)!.querySelector('[data-testid="plan-empty"]')?.textContent).toBe('Nothing planned. Drag a task here to plan it for today.')
    expect(section(h)!.querySelector('.tk-tc')).toBeNull()
  })
})

describe('Who does the step, on the Plan card', () => {
  // Prep & start needs the launcher and a PI, and a task id that is a real ULID (buildPrepStartUri).
  const ID = 'task_01M6CZS7KZGSA0663NBB3H4HMG'
  const card = (h: ParentNode) => section(h)!.querySelector(`[data-task-id="${ID}"]`) as HTMLElement
  const text = (h: ParentNode) => card(h).textContent ?? ''
  const hasBtn = (h: ParentNode, label: string) => [...card(h).querySelectorAll('button')].some((b) => b.textContent?.trim() === label)
  const open = async (owners: Record<string, string>, row: Row = {}, extra: Row[] = []) => {
    localStorage.setItem(LAUNCHER_STORAGE_KEY, 'yes')
    stubHub([plan('p', AT1, [ID], owners), task(ID, row), ...extra])
    const h = await mount(page(), { ready: loaded(ID), label: 'today' })
    await waitFor(() => inSection(h, ID), 'the pick')
    return h
  }

  it('a step that is yours says Yours and offers neither Prep nor Prep & start', async () => {
    const h = await open({ [ID]: 'nick' })
    expect(text(h)).toContain('Yours')
    expect(hasBtn(h, 'Prep')).toBe(false)
    expect(hasBtn(h, 'Prep & start')).toBe(false)
  })

  it('a step with Claude and no packet says With Claude and keeps Prep and Prep & start', async () => {
    const h = await open({ [ID]: 'claude' })
    expect(text(h)).toContain('With Claude')
    expect(hasBtn(h, 'Prep')).toBe(true)
    expect(hasBtn(h, 'Prep & start')).toBe(true)
  })

  it('a ready packet beats the owner tag', async () => {
    const h = await open({ [ID]: 'claude' }, { packet_state: 'ready' })
    expect(text(h)).toContain('Ready')
    expect(text(h)).not.toContain('With Claude')
  })

  it('a plan with no owner shows Saved, as before', async () => {
    const h = await open({})
    expect(text(h)).toContain('Saved')
    expect(text(h)).not.toMatch(/Yours|With Claude/)
  })

  it('a carried pick (kept, started) with an owner shows its tag', async () => {
    localStorage.setItem(LAUNCHER_STORAGE_KEY, 'yes')
    const p = plan('p', AT1, [ID], { [ID]: 'claude' })
    const ans = JSON.parse(String(p.question_answer_json))
    ans.kept = [ID]
    ans.picks[0].start = true
    p.question_answer_json = JSON.stringify(ans)
    stubHub([p, task(ID)])
    const h = await mount(page(), { ready: loaded(ID), label: 'today' })
    await waitFor(() => inSection(h, ID), 'the pick')
    expect(text(h)).toContain('With Claude')
  })

  it('a task on an old and a newer plan follows the newest', async () => {
    localStorage.setItem(LAUNCHER_STORAGE_KEY, 'yes')
    stubHub([plan('p1', AT1, [ID], { [ID]: 'claude' }), plan('p2', AT2, [ID], { [ID]: 'nick' }), task(ID)])
    const h = await mount(page(), { ready: loaded(ID), label: 'today' })
    await waitFor(() => inSection(h, ID), 'the pick')
    expect(text(h)).toContain('Yours')
    expect(text(h)).not.toContain('With Claude')
    expect(hasBtn(h, 'Prep & start')).toBe(false)
  })
})

describe('In Agenda mode', () => {
  it('the_strip_shows_once', async () => {
    stubHub([task('x', { planned_for: DAY, plan_slot: 'strip', plan_rank: 1 }), task('other')])
    const h = await mount(page(), { ready: loaded('x'), label: 'today' })
    const toAgenda = await waitFor(() => [...h.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Agenda'), 'the Agenda toggle')
    toAgenda.click()
    await waitFor(() => h.querySelector('[data-b2-agenda]'), 'the agenda')
    expect(h.querySelectorAll('[data-task-id="x"]')).toHaveLength(1)
    expect(inSection(h, 'x')).toBe(true)
    expect(h.querySelector('[data-b2-agenda] [data-task-id="x"]')).toBeNull()
  })
})

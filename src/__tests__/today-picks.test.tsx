// The 2026-10-30 Today picks, rendered in real Chromium with the app
// stylesheet: faces only for others, the Walk-in card, the Decision desk, the
// Gap Stack (phone) and What is slipping (Silence Map + Backward Shadows).
// Each test drives the component the way Today mounts it and checks what the
// pick promises, including what it must NOT claim (no invented size, no face
// on the viewer's own rows, nothing written on silence).
//
// Set VITE_PICKS_SHOTS=<dir> to also write laptop + phone PNGs of each piece.
// Run: npx vitest run --config vitest.config.ts src/__tests__/today-picks.test.tsx

import '../index.css'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { useEffect, useState, type ReactElement } from 'react'
import { page } from 'vitest/browser'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import { CardRow } from '../components/tasks/TaskCardRow'
import { HideViewerFaceContext } from '../components/today/hideViewerFace'
import { WalkInCard } from '../components/today/WalkInCard'
import { DecisionDesk } from '../components/today/DecisionDesk'
import { QuestionsCard } from '../components/tasks/QuestionsCard'
import { GapStack } from '../components/today/GapStack'
import { SlippingCard } from '../components/today/rail/SlippingCard'
import { civilDatePlusDays, todayKey } from '../lib/taskGrouping'
import { nowInstant } from '../lib/time'
import type { TaskRow } from '../lib/api'
import type { MeetingRow } from '../hooks/useApiData'
import type { TodayEvent } from '../components/today/constants'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
// Laptop width by default; the phone tests set 390 themselves.
beforeEach(async () => {
  await page.viewport(1280, 900)
  if (SHOTS) document.documentElement.classList.add('dark')
})
afterEach(async () => {
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 900)
})

const SHOTS = (import.meta.env.VITE_PICKS_SHOTS as string | undefined) ?? ''
const VIEWER = 'nick-ingraham'
const today = todayKey()
const day = (n: number) => civilDatePlusDays(today, n)
const user = {
  email: 'ingra107@umn.edu', slug: VIEWER, isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}

const task = (over: Partial<TaskRow>): TaskRow => ({
  id: 't', title: 'Task', short_title: null, description: '', assignee: VIEWER, assigned_by: null,
  watchers: null, due_date: null, priority: 'medium', status: 'todo', completed: 0, completed_at: null,
  project_id: null, group_override: null, acknowledged_at: '2026-01-01', kind: 'task',
  created_at: `${day(-3)} 15:00:00`, updated_at: `${day(-1)} 15:00:00`, ...over,
} as unknown as TaskRow)

function wrap(node: ReactElement, width: string): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider>
          <MemoryRouter>
            <HideViewerFaceContext.Provider value={VIEWER}>
              <div className="tk" data-shot-root style={{ width, padding: 16, background: 'var(--sk-page, var(--surface-0))' }}>{node}</div>
            </HideViewerFaceContext.Provider>
          </MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

/** Stub fetch by URL fragment; records every URL and every POST body. */
function stubFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; body?: string }> = []
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: typeof init?.body === 'string' ? init.body : undefined })
    const hit = Object.keys(routes).find((k) => String(url).includes(k))
    return { ok: true, status: 200, json: async () => (hit ? routes[hit] : { data: [] }) } as Response
  }))
  return calls
}

async function shoot(name: string, host: HTMLElement) {
  if (!SHOTS) return
  document.documentElement.classList.add('dark')
  await new Promise((r) => setTimeout(r, 120))
  const el = host.querySelector<HTMLElement>('[data-shot-root]') ?? host
  await page.screenshot({ path: `${SHOTS}/${name}.png`, element: el })
}

// ── faces only for others ───────────────────────────────────────────────────

describe('Faces only for others', () => {
  it('hides the owner face on the viewer\'s own rows and keeps the slot; shows it for someone else', async () => {
    const mine = task({ id: 'mine', title: 'Revise Discussion paragraph 4' })
    const theirs = task({ id: 'theirs', title: 'IRB amendment, site 3', assignee: 'casey-eddington' })
    const host = await mount(wrap(
      <div className="tk-stack">
        <CardRow card task={mine} project={null} isDone={false} onToggleDone={() => {}} isExpanded={false} onToggleExpand={() => {}} />
        <CardRow card task={theirs} project={null} isDone={false} onToggleDone={() => {}} isExpanded={false} onToggleExpand={() => {}} />
      </div>, '640px'), { ready: (h) => h.querySelectorAll('.tk-tc').length === 2, label: 'cards' })
    const [a, b] = [...host.querySelectorAll<HTMLElement>('.tk-tc')]
    expect(a.querySelector('.tk-av')).not.toBeNull()
    expect(a.querySelector('.tk-av .tk-face')).toBeNull()
    expect(a.querySelector<HTMLElement>('.tk-av')!.getBoundingClientRect().width).toBeGreaterThan(20)
    expect(b.querySelector('.tk-av .tk-face')).not.toBeNull()
    await shoot('faces-laptop', host)
  })
})

// ── Walk-in card ────────────────────────────────────────────────────────────

const SERIES = 'Weekly Meeting with Casey/Nick'
const meetingsFixture = [
  { id: 'm-prev', date: day(-14), title: SERIES, attendees: JSON.stringify([VIEWER, 'casey-eddington']), notes: null,
    decisions: '- Rerun the sedation model without the transfer patients\n- Keep site as a random effect', owner_slug: VIEWER },
  { id: 'm-now', date: today, title: SERIES, attendees: JSON.stringify([VIEWER, 'casey-eddington']), notes: null, decisions: null, owner_slug: VIEWER },
] as unknown as MeetingRow[]
const nextEvent: TodayEvent = {
  id: 'cal-x', title: SERIES, time: '10:30 AM', end: '11:00 AM', startMin: 630, endMin: 660,
  meetingId: 'm-now', dayKey: today, people: [VIEWER, 'casey-eddington'], meetingUrl: 'https://umn.zoom.us/j/1',
}
const prepFixture = {
  data: {
    previousMeeting: { id: 'm-prev', date: day(-14), title: SERIES },
    previousActionItems: [
      { id: 'a1', title: 'Rerun model without transfers', assignee: 'casey-eddington', completed: 1, due_date: null },
      { id: 'a2', title: 'Send sensitivity table', assignee: 'casey-eddington', completed: 0, due_date: day(-2) },
      { id: 'a3', title: 'Read the Methods draft', assignee: VIEWER, completed: 0, due_date: null },
    ],
  },
}

describe('WalkInCard', () => {
  it('shows last time and the action items from the previous meeting of the series', async () => {
    const calls = stubFetch({ '/prep': prepFixture })
    const host = await mount(wrap(
      <WalkInCard events={[nextEvent]} meetings={meetingsFixture} nowMin={600} viewerSlug={VIEWER} />, '760px'),
    { ready: (h) => h.querySelector('[data-pick="walk-in"] .pk-items'), label: 'walk-in' })
    const text = host.textContent ?? ''
    expect(text).toContain('In 30 min')
    expect(text).toContain('Rerun the sedation model without the transfer patients')
    expect(text).toContain('1 of 3 done')
    expect(calls.some((c) => c.url.includes('/api/meetings/m-now/prep'))).toBe(true)
    // Faces only for others: Casey's items carry her face, the viewer's does not.
    const items = [...host.querySelectorAll('.pk-items li')]
    expect(items.find((li) => li.textContent?.includes('Methods'))!.querySelector('.tk-face')).toBeNull()
    expect(items.find((li) => li.textContent?.includes('sensitivity'))!.querySelector('.tk-face')).not.toBeNull()
    await shoot('walkin-laptop', host)
  })

  it('stays away when the meeting is far off or has nothing from last time', async () => {
    stubFetch({ '/prep': { data: { previousMeeting: null, previousActionItems: [] } } })
    const far = await mount(wrap(<WalkInCard events={[nextEvent]} meetings={meetingsFixture} nowMin={300} viewerSlug={VIEWER} />, '760px'),
      { ready: (h) => h.querySelector('.tk'), label: 'host' })
    const empty = await mount(wrap(<WalkInCard events={[{ ...nextEvent, title: 'One-off visit', meetingId: 'm-x' }]} meetings={[]} nowMin={600} viewerSlug={VIEWER} />, '760px'),
      { ready: (h) => h.querySelector('.tk'), label: 'host' })
    await new Promise((r) => setTimeout(r, 150))
    expect(far.querySelector('[data-pick="walk-in"]')).toBeNull()
    expect(empty.querySelector('[data-pick="walk-in"]')).toBeNull()
  })

  it('renders at phone width', async () => {
    await page.viewport(390, 844)
    stubFetch({ '/prep': prepFixture })
    const host = await mount(wrap(<WalkInCard events={[nextEvent]} meetings={meetingsFixture} nowMin={628} viewerSlug={VIEWER} />, '358px'),
      { ready: (h) => h.querySelector('[data-pick="walk-in"] .pk-items'), label: 'walk-in phone' })
    expect(host.textContent).toContain('In 2 min')
    await shoot('walkin-phone', host)
  })
})

// ── Decision desk ───────────────────────────────────────────────────────────

const question = (id: string, prompt: string, ageDays: number, over: Partial<TaskRow> = {}) => task({
  id, kind: 'question' as TaskRow['kind'], title: prompt, created_at: `${day(-ageDays)} 15:00:00`, source: 'fix_approval',
  question_spec_json: JSON.stringify({
    v: 1, kind: 'approval', prompt,
    choices: [{ key: 'yes', label: 'Build it' }, { key: 'no', label: 'Not this one' }, { key: 'other', label: 'Other' }],
    rec: 'yes', allow_text: true,
  }),
  question_answer_json: null, ...over,
})

describe('DecisionDesk', () => {
  const qs = [
    question('q-new', 'R01 budget: keep the data manager at 50%?', 0),
    question('q-mid', 'Send the CLIF abstract to Kaveri first?', 2),
    question('q-old', 'Soften the site claim in Discussion paragraph 4?', 4, {
      project_id: 'sedation-variation', description: 'Six sites examined; two have under 200 ventilated stays.',
      key_link_1: 'https://docs.google.com/document/d/x', key_link_1_desc: 'Discussion draft',
    }),
  ]
  const projects = new Map([['sedation-variation', { name: 'Sedation variation', slug: 'sedation-variation' }]])
  const answered = question('q-ans', 'Move the CLIF call to Thursdays?', 2, {
    question_answer_json: JSON.stringify({ v: 1, choice: 'yes', via: 'hub', at: nowInstant() }),
  })
  // As Today mounts it: the desk is the waiting section INSIDE Needs you.
  // `setRows` lets a test play the cache refresh that follows a write.
  let setRows: (r: TaskRow[]) => void = () => {}
  const expose = (set: (r: TaskRow[]) => void) => { setRows = set }
  function NeedsYou({ onSetter }: { onSetter: typeof expose }) {
    const [rows, set] = useState<TaskRow[]>([...qs, answered])
    useEffect(() => { onSetter(set) }, [onSetter])
    return (
      <QuestionsCard tasks={rows} band={false} onCollapse={() => {}}
        renderWaiting={(waiting, hold) => <DecisionDesk waiting={waiting} projectsByPid={projects} onHold={hold} />} />
    )
  }
  const mountDesk = (width = '760px') => mount(wrap(<NeedsYou onSetter={expose} />, width),
    { ready: (h) => h.querySelector('[data-testid="desk-use-suggested"]'), label: 'desk' })
  const click = (host: HTMLElement, id: string) => host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click()
  const posts = (calls: Array<{ body?: string }>) => calls.filter((c) => c.body).map((c) => c.body!)

  it('is one gold card: the desk sits inside Needs you and no question shows twice', async () => {
    stubFetch({})
    const host = await mountDesk()
    expect(host.querySelectorAll('.tk-attn')).toHaveLength(1)
    expect(host.querySelector('.tk-attn [data-pick="decision-desk"]')).not.toBeNull()
    for (const p of ['R01 budget: keep the data manager', 'Send the CLIF abstract', 'Soften the site claim']) {
      expect(host.textContent!.split(p).length - 1).toBe(1)
    }
    expect(host.querySelector('[data-testid="q-answered"]')!.textContent).toContain('Move the CLIF call')
  })

  it('opens the oldest ask with its suggested answer and context; the rest are one line', async () => {
    stubFetch({})
    const host = await mountDesk()
    const lead = host.querySelector('[data-testid="desk-lead-q-old"]')!
    expect(lead.textContent).toContain('Soften the site claim')
    expect(lead.textContent).toContain('Build it')
    expect(lead.textContent).toContain('asked 4 days ago')
    expect(host.querySelector('[data-testid="desk-row-q-mid"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="desk-row-q-new"]')).not.toBeNull()
    expect(host.textContent).toContain('If you do not answer, nothing happens')
    ;[...host.querySelectorAll('button')].find((b) => b.textContent === 'See context')!.click()
    await expect.poll(() => host.textContent).toContain('Six sites examined')
    expect(host.querySelectorAll('[data-testid^="desk-done-"]')).toHaveLength(0)
  })

  it('answering folds the row to its answer and opens the next in place, focus on its first button', async () => {
    const calls = stubFetch({})
    const host = await mountDesk()
    click(host, 'desk-use-suggested')
    await waitFor(() => host.querySelector('[data-testid="desk-lead-q-mid"]'), 'next opens')
    expect(host.querySelector('[data-testid="desk-done-q-old"]')!.textContent).toContain('You chose “Build it”')
    expect(host.querySelector('[data-testid="desk-lead-q-old"]')).toBeNull()
    await expect.poll(() => document.activeElement?.closest('[data-testid="desk-lead-q-mid"]') ?? null).not.toBeNull()
    const body = await waitFor(() => posts(calls).find((b) => b.includes('question_answer_json')), 'answer POST')
    expect(body).toContain('"choice":"yes"')
    expect(body).not.toContain('"status"')
    // A plain choice answers the same way.
    click(host, 'desk-choice-no')
    await waitFor(() => host.querySelector('[data-testid="desk-lead-q-new"]'), 'third opens')
    expect(host.querySelector('[data-testid="desk-done-q-mid"]')!.textContent).toContain('Not this one')
  })

  it('Later folds the row and opens the next', async () => {
    const calls = stubFetch({})
    const host = await mountDesk()
    click(host, 'desk-later')
    await waitFor(() => host.querySelector('[data-testid="desk-lead-q-mid"]'), 'next opens')
    expect(host.querySelector('[data-testid="desk-done-q-old"]')!.textContent).toContain('Back tomorrow')
    const body = await waitFor(() => posts(calls).find((b) => b.includes('due_date')), 'snooze POST')
    expect(body).toContain(day(1))
  })

  it('Undo writes the old value back and reopens that question', async () => {
    const calls = stubFetch({})
    const host = await mountDesk()
    click(host, 'desk-use-suggested')
    await waitFor(() => host.querySelector('[data-testid="desk-undo-q-old"]'), 'undo shows')
    click(host, 'desk-undo-q-old')
    await waitFor(() => host.querySelector('[data-testid="desk-lead-q-old"]'), 'reopened')
    expect(host.querySelector('[data-testid="desk-done-q-old"]')).toBeNull()
    await waitFor(() => posts(calls).find((b) => b.includes('"question_answer_json":null')), 'undo POST')
  })

  it('a click on a folded line opens it and closes the open one', async () => {
    stubFetch({})
    const host = await mountDesk()
    click(host, 'desk-row-q-new')
    await waitFor(() => host.querySelector('[data-testid="desk-lead-q-new"]'), 'opened')
    expect(host.querySelector('[data-testid="desk-lead-q-old"]')).toBeNull()
    expect(host.querySelector('[data-testid="desk-row-q-old"]')).not.toBeNull()
    expect(host.querySelectorAll('[data-desk-open]')).toHaveLength(1)
  })

  it('after the last: All caught up, and answered rows are not listed twice once the cache catches up', async () => {
    stubFetch({})
    const host = await mountDesk()
    for (const id of ['q-old', 'q-mid', 'q-new']) {
      await waitFor(() => host.querySelector(`[data-testid="desk-lead-${id}"] [data-testid="desk-use-suggested"]`), `open ${id}`)
      click(host, 'desk-use-suggested')
    }
    await waitFor(() => host.querySelector('[data-testid="desk-caught-up"]'), 'caught up')
    expect(host.textContent).toContain('If you do not answer, nothing happens')
    // The cache refresh moves them to "answered": they stay folded on the desk only.
    const at = nowInstant()
    setRows([...qs.map((q) => ({ ...q, question_answer_json: JSON.stringify({ v: 1, choice: 'yes', via: 'hub', at }) })), answered])
    await waitFor(() => host.querySelector('[data-testid="q-answered-q-old"]') === null && host.querySelector('[data-testid="desk-done-q-old"]'), 'held')
    expect(host.textContent!.split('Soften the site claim').length - 1).toBe(1)
    expect(host.querySelector('[data-testid="q-answered-q-ans"]')).not.toBeNull()
  })

  it('renders after one answer, the second question open (laptop and phone)', async () => {
    stubFetch({})
    const host = await mountDesk()
    click(host, 'desk-use-suggested')
    await waitFor(() => host.querySelector('[data-testid="desk-lead-q-mid"]'), 'next opens')
    await shoot('decision-desk-laptop', host)
    await page.viewport(390, 844)
    const phone = await mountDesk('358px')
    click(phone, 'desk-use-suggested')
    await waitFor(() => phone.querySelector('[data-testid="desk-lead-q-mid"]'), 'next opens phone')
    await shoot('decision-desk-phone', phone)
  })
})


// ── Gap Stack ───────────────────────────────────────────────────────────────

describe('GapStack', () => {
  const events: TodayEvent[] = [
    { id: 'e1', title: 'ICU rounds', time: '7:00 AM', end: '10:00 AM', startMin: 420, endMin: 600 },
    { id: 'e2', title: 'Lab meeting', time: '3:00 PM', end: '4:00 PM', startMin: 900, endMin: 960, meetingUrl: 'https://umn.zoom.us/j/2', loc: 'Zoom' },
  ]
  const tasks = [
    task({ id: 'g1', title: 'Approve IRB amendment', estimated_minutes: 5, due_date: today, project_id: 'extubation' }),
    task({ id: 'g2', title: 'Reply to Priya on Figure 2', effort: 'quick', due_date: day(1), assignee: 'casey-eddington' }),
    task({ id: 'g3', title: 'Read K23 report, section 3', due_date: day(-2) }),
    task({ id: 'g4', title: 'Budget justification', estimated_minutes: 90, due_date: today }),
    task({ id: 'g5', title: 'Someday', due_date: null }),
  ]
  const state = { planned: {}, done: {}, markDone: () => {}, uncheck: () => {} }
  const projects = new Map([['extubation', { name: 'Extubation study' }]])

  it('counts the gap from the calendar and only calls sized tasks fitting', async () => {
    await page.viewport(390, 844)
    const host = await mount(wrap(
      <GapStack events={events} tasks={tasks} state={state} projectsByPid={projects} nowMin={886} viewerSlug={VIEWER} />, '358px'),
    { ready: (h) => h.querySelector('[data-pick="gap-stack"]'), label: 'gap stack' })
    const text = host.textContent ?? ''
    expect(text).toContain('14 min until Lab meeting')
    expect(text).toContain('Fits in 14 min')
    const rows = [...host.querySelectorAll('[data-testid^="gap-row-"]')].map((r) => r.getAttribute('data-testid'))
    expect(rows).toEqual(['gap-row-g1', 'gap-row-g2', 'gap-row-g3'])
    expect(host.querySelector('[data-testid="gap-row-g3"]')!.textContent).toContain('no estimate')
    expect(host.querySelector('[data-testid="gap-row-g1"] .tk-face')).toBeNull()
    expect(host.querySelector('[data-testid="gap-row-g2"] .tk-face')).not.toBeNull()
    expect(text).toContain('1 more due')
    expect(host.querySelector('a[href="https://umn.zoom.us/j/2"]')).not.toBeNull()
    await shoot('gap-stack-phone', host)
  })

  it('keeps its own minute clock when the page passes none', async () => {
    await page.viewport(390, 844)
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    const soon: TodayEvent[] = [{ id: 'e9', title: 'Soon meeting', time: '', startMin: nowMin + 20, endMin: nowMin + 50 }]
    const host = await mount(wrap(
      <GapStack events={soon} tasks={tasks} state={state} projectsByPid={projects} viewerSlug={VIEWER} />, '358px'),
    { ready: (h) => h.querySelector('[data-pick="gap-stack"]'), label: 'gap own clock' })
    expect(host.textContent).toMatch(/(19|20) min until Soon meeting/)
  })
})

// ── What is slipping ────────────────────────────────────────────────────────

describe('SlippingCard', () => {
  const series = (n: number, title: string, gap: number, lastAgo: number, who: string) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${title}-${i}`, date: day(-(lastAgo + gap * (n - 1 - i))), title,
      attendees: JSON.stringify([VIEWER, who]), notes: null, decisions: null, owner_slug: VIEWER,
    })) as unknown as MeetingRow[]
  const meetings = [...series(5, '1:1 with Casey', 14, 35, 'casey-eddington'), ...series(4, 'CLIF call', 7, 3, 'nate-mesfin')]
  const at = (n: number, h: number, mi = 0) => {
    const [y, m, d] = day(n).split('-').map(Number)
    return new Date(y, m - 1, d, h, mi).toISOString()
  }
  const cal = { events: [0, 1, 2, 3, 4, 5, 6].flatMap((n) => [
    { id: `c${n}a`, uid: `u${n}a`, title: 'Clinic', location: null, startAt: at(n, 8), endAt: at(n, 12), isAllDay: false },
    { id: `c${n}b`, uid: `u${n}b`, title: 'Lab', location: null, startAt: at(n, 13), endAt: at(n, 15), isAllDay: false },
  ]) }
  const tasks = [
    task({ id: 'w1', title: 'R01 path after R34', waiting_on: 'Grandon', waiting_since: `${day(-20)} 12:00:00` }),
    task({ id: 's1', title: 'ATS abstract', kind: 'milestone' as TaskRow['kind'], due_date: day(6) }),
    task({ id: 's2', title: 'AID-H workshop talk', effort: 'multi', due_date: day(9), estimated_minutes: 600 }),
    task({ id: 's3', title: 'Data Core synthesis', deadline: day(12), due_date: day(12), estimated_minutes: 120 }),
    task({ id: 'plain', title: 'Plain task', due_date: day(3) }),
  ]

  it('lists what went quiet and how far back each deadline reaches, without sizing the unsized', async () => {
    stubFetch({ '/calendar/events': cal })
    const host = await mount(wrap(<SlippingCard meetings={meetings} tasks={tasks} viewerSlug={VIEWER} />, '320px'),
      { ready: (h) => h.querySelector('[data-pick="slipping"] .pk-cal'), label: 'slipping' })
    await waitFor(() => host.querySelector('.pk-cal .pk-busy[style*="--pk-b: 0.6"]') || host.textContent?.includes('needs'), 'calendar applied')
    const text = host.textContent ?? ''
    const quiet = [...host.querySelectorAll('[data-testid^="quiet-series-"]')].map((r) => r.textContent ?? '')
    expect(quiet).toHaveLength(1)
    expect(quiet[0]).toContain('1:1 with Casey')
    expect(quiet[0]).toContain('usually every 2 weeks')
    expect(text).not.toContain('CLIF call') // on pace
    expect(host.querySelector('[data-testid="quiet-wait-w1"]')!.textContent).toContain('Grandon')
    expect(host.querySelector('[data-testid="shadow-s1"]')!.textContent).toContain('no size set')
    expect(host.querySelector('[data-testid="shadow-s2"]')!.textContent).toContain('needs 10 h')
    expect(host.querySelector('[data-testid="shadow-plain"]')).toBeNull()
    await shoot('slipping-rail-laptop', host)
  })

  it('counts in the header exactly the rows it draws, names the rest, and counts series by series key', async () => {
    localStorage.removeItem('hub-today-quiet-fine')
    stubFetch({ '/calendar/events': cal })
    const manyWaits = Array.from({ length: 6 }, (_, i) =>
      task({ id: `mw${i}`, title: `Wait ${i}`, waiting_on: 'Grandon', waiting_since: `${day(-20 - i)} 12:00:00` }))
    // Two spellings of one series: one series, not two.
    const respelled = [...meetings, { ...meetings[meetings.length - 1], id: 'clif-x', title: 'clif call', date: day(-10) } as MeetingRow]
    const host = await mount(wrap(<SlippingCard meetings={respelled} tasks={[...manyWaits, ...tasks]} viewerSlug={VIEWER} nowMin={600} />, '320px'),
      { ready: (h) => h.querySelector('[data-pick="slipping"] .pk-cal'), label: 'slipping count' })
    const drawn = host.querySelectorAll('[data-testid^="quiet-series-"], [data-testid^="quiet-wait-"], [data-testid^="shadow-"]').length
    expect(Number(host.querySelector('.tk-ph .tk-cnt')!.textContent)).toBe(drawn)
    expect(host.querySelector('[data-testid="quiet-more"]')!.textContent).toContain('3 more quiet')
    expect(host.textContent).toContain('checked 2 meeting series')
  })

  it('Fine hides a quiet row', async () => {
    localStorage.removeItem('hub-today-quiet-fine')
    stubFetch({ '/calendar/events': cal })
    const host = await mount(wrap(<SlippingCard meetings={meetings} tasks={tasks} viewerSlug={VIEWER} />, '320px'),
      { ready: (h) => h.querySelector('[data-testid="quiet-wait-w1"]'), label: 'slipping fine' })
    host.querySelector<HTMLButtonElement>('[data-testid="quiet-wait-w1"] .pk-fine')!.click()
    await expect.poll(() => host.querySelector('[data-testid="quiet-wait-w1"]')).toBeNull()
    localStorage.removeItem('hub-today-quiet-fine')
  })

  it('renders at phone width', async () => {
    await page.viewport(390, 844)
    stubFetch({ '/calendar/events': cal })
    const host = await mount(wrap(<SlippingCard meetings={meetings} tasks={tasks} viewerSlug={VIEWER} />, '358px'),
      { ready: (h) => h.querySelector('[data-pick="slipping"] .pk-cal'), label: 'slipping phone' })
    await new Promise((r) => setTimeout(r, 200))
    await shoot('slipping-phone', host)
  })
})

// ── Public home: current opening, short lists ───────────────────────────────

describe('Public home short lists', () => {
  const pubs = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`, title: `Paper number ${i}`, year: 2026 - i, journal: 'Chest', authors: 'Ingraham N',
    status: 'published', featured: i < 4 ? 1 : 0, doi: null, pmid: null, url: null,
  }))

  async function mountHome(width: string) {
    stubFetch({ '/api/publications': { data: pubs }, '/api/projects': { data: [] }, '/api/grants': { data: [] } })
    const { default: Home } = await import('../pages/Home')
    return mount(wrap(<Home />, width), { ready: (h) => h.querySelector('.pub-band') && h.querySelectorAll('.pub-faces .pub-person').length > 0, label: 'home' })
  }

  it('keeps the opening and band, shows three papers and five faces with links to the rest', async () => {
    await page.viewport(1280, 2200)
    const host = await mountHome('1180px')
    expect(host.querySelector('.pub-band')).not.toBeNull()
    expect(host.textContent).not.toContain('newest of')
    const faces = host.querySelectorAll('.pub-faces .pub-person')
    expect(faces.length).toBeLessThanOrEqual(6)
    expect([...faces].some((f) => /more on the team page/.test(f.textContent ?? ''))).toBe(true)
    await shoot('public-home-laptop', host)
  })

  it('renders at phone width', async () => {
    await page.viewport(390, 3600)
    const host = await mountHome('358px')
    await shoot('public-home-phone', host)
  })
})

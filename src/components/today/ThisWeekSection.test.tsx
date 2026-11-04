// This week on Today, and the gold "Plan your week" row in Needs you. The This
// week and earlier-plan tests moved here unchanged from PlanConversation.test.tsx
// when the pick page retired (2026-11-04).
//
// Runs in real Chromium (vitest.config.ts browser mode), mounted with
// react-dom directly like QuestionsCard.test.tsx. fetch is stubbed, so the
// test reads the exact request body the Worker would receive.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DndContext } from '@dnd-kit/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UndoToastProvider } from '../UndoToast'
import { AuthContext, type AuthUser } from '../../hooks/useAuth'
import { QuestionsCard } from '../tasks/QuestionsCard'
import { ThisWeekSection } from './ThisWeekSection'
import { PlannedTodaySection } from './PlannedTodaySection'
import { currentWeekPlan, pickTag } from '../../lib/weekPlan'
import { cardQuestionCount, isQuestionOnCard } from '../../lib/taskGrouping'
import { useNeedsYouCollapsed } from '../../hooks/useNeedsYouCollapsed'
import type { TaskRow } from '../../lib/api'
import type { TodayStateApi } from '../../hooks/useTodayState'

let mounted: { host: HTMLElement; root: Root }[] = []
// The clock is pinned inside the fixture plan's week. Only Date is faked:
// `until` still needs real timers.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-01T18:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  for (const { host, root } of mounted) { root.unmount(); host.remove() }
  mounted = []
  vi.unstubAllGlobals()
})

async function until(pred: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`timed out waiting for ${what}`)
}

const opt = (key: string, recommended = false) => ({
  key, label: `Option ${key}`, direction: `Direction ${key}`, deliverable_kind: 'gmail_draft', recommended,
})
const SPEC = {
  v: 1, kind: 'week_plan', week_start: '2026-10-26', tz: 'America/Chicago',
  prompt: 'What do you want to take the next step on this week?', expires_at: '2026-11-02T06:00:00Z',
  candidates: [
    { task_id: 'task_a', title: 'Answer Jane', why: 'sat 6 days', evidence: [], options: [opt('a1', true), opt('a2')] },
    { task_id: 'task_b', title: 'Review abstract', why: 'due Friday', evidence: [], options: [opt('b1'), opt('b2', true), opt('b3')] },
    { task_id: 'task_c', title: 'K23 report', why: '', evidence: [], options: [opt('c1', true), opt('c2')] },
  ],
}

function row(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task_plan', title: 'Plan your week', description: '', assignee: 'nick-ingraham', priority: 'medium',
    status: 'todo', source: 'week_plan', completed: 0, completed_at: null, project_id: null, due_date: null,
    created_at: '2026-10-25T21:00:00Z', kind: 'question', question_spec_json: JSON.stringify(SPEC),
    question_answer_json: null, question_consumed_json: null, ...overrides,
  } as TaskRow
}
const answered = (picks: unknown[], at = '2026-10-26T14:00:00Z', id = 'task_plan') => row({
  id, question_answer_json: JSON.stringify({ v: 1, choice: 'start', via: 'hub', at, picks }),
})
const task = (id: string, extra: Partial<TaskRow> = {}): TaskRow =>
  ({ id, title: `Task ${id}`, status: 'todo', completed: 0, kind: 'task', project_id: null, ...extra } as TaskRow)

type Call = { url: string; method: string; body: unknown }
function stubFetch(
  count: { used: number; cap: number } | 'fail',
  answer: (body: unknown) => Response = () => new Response('{}', { status: 200 }),
) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method: init?.method ?? 'GET', body })
    if (url.startsWith('/api/packets/daily-count')) {
      return count === 'fail' ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ date: '2026-10-28', ...count }), { status: 200 })
    }
    if (url.startsWith('/api/launch-log')) return new Response(JSON.stringify({ data: [] }), { status: 200 })
    if (url.startsWith('/api/tasks/')) return answer(body)
    return new Response('[]', { status: 200 })
  }))
  return calls
}

type Viewer = 'pi' | 'member' | 'unresolved'
const viewerUser = (v: Viewer): AuthUser => ({
  email: 'pi@umn.edu', slug: 'pi', name: 'X', isAuthenticated: true, isPi: v === 'pi', isMember: true,
  canShowAllProjects: v === 'pi', piResolved: v !== 'unresolved',
})

async function mount(node: React.ReactNode, viewer: Viewer = 'pi') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
      <AuthContext.Provider value={{ user: viewerUser(viewer), isAuthenticated: true, isLoading: false }}>
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <UndoToastProvider>
              <DndContext>{node}</DndContext>
            </UndoToastProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>,
  )
  mounted.push({ host, root })
  await tick()
  return host
}

const tick = () => new Promise((r) => setTimeout(r, 30))
async function click(el: Element | null | undefined) {
  if (!el) throw new Error('missing element')
  ;(el as HTMLElement).click()
  await tick()
}

// 2026-11-08 is a Sunday: 22:00Z is 16:00 CST. The fixture SPEC plans week 2026-10-26.
const planFor = (week_start: string, id = `p_${week_start}`) => row({
  id, question_spec_json: JSON.stringify({ ...SPEC, week_start }),
  question_answer_json: JSON.stringify({ v: 1, choice: 'save', via: 'hub', at: '2026-11-02T14:00:00Z', picks: [{ task_id: 'task_a', option_key: 'a1', text: null, start: false }] }),
})
const question = (id: string) => ({
  id, title: 'q', assignee: 'nick-ingraham', status: 'todo', source: 'meeting_match', completed: 0, kind: 'question',
  question_spec_json: JSON.stringify({ v: 1, kind: 'meeting_match', prompt: `Prompt ${id}`, rec: 'c1', allow_text: false, choices: [{ key: 'c1', label: 'One' }, { key: 'c2', label: 'Two' }] }),
  question_answer_json: null, created_at: '2026-11-01T17:04:06Z',
} as unknown as TaskRow)
const nudgeRow = (h: ParentNode) => h.querySelector('[data-testid="q-week-plan"]')

describe('Needs you: the Plan your week row', () => {
  it('a week with no plan is one gold row with the Plan button, and adds to no count', async () => {
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z')) // Tuesday
    const calls = stubFetch({ used: 0, cap: 3 })
    const host = await mount(<QuestionsCard tasks={[]} band={false} />)
    await until(() => host.querySelector('[data-testid="plan-button"]')?.getAttribute('data-state') === 'ready', 'Plan ready')
    expect(nudgeRow(host)?.textContent).toContain('Plan your week')
    expect(nudgeRow(host)?.querySelector('[data-testid="plan-button"]')?.textContent).toBe('Plan')
    expect(host.querySelectorAll('.tk-attn')).toHaveLength(1)
    expect(host.querySelector('.tk-cnt')).toBeNull()
    expect(cardQuestionCount([])).toBe(0)
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]) // showing it writes nothing
  })

  it('this week planned: no row and no card', async () => {
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    stubFetch({ used: 0, cap: 3 })
    const host = await mount(<QuestionsCard tasks={[planFor('2026-11-02')]} band={false} />)
    await tick()
    expect(nudgeRow(host)).toBeNull()
    expect(host.querySelector('.tk-attn')).toBeNull()
  })

  it('Sunday evening with this week planned asks about next week, and a plan for next week ends it', async () => {
    vi.setSystemTime(new Date('2026-11-08T22:00:00Z'))
    stubFetch({ used: 0, cap: 3 })
    const host = await mount(<QuestionsCard tasks={[planFor('2026-11-02')]} band={false} />)
    await until(() => !!nudgeRow(host), 'the row')
    const label = new Date(2026, 10, 9).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    expect(nudgeRow(host)?.textContent).toContain(label)
    const host2 = await mount(<QuestionsCard tasks={[planFor('2026-11-02'), planFor('2026-11-09')]} band={false} />)
    await tick()
    expect(nudgeRow(host2)).toBeNull()
  })

  it('a member gets no row, no gold card and no launch request', async () => {
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    const calls = stubFetch({ used: 0, cap: 3 })
    const host = await mount(<QuestionsCard tasks={[]} band={false} />, 'member')
    await tick()
    expect(nudgeRow(host)).toBeNull()
    expect(host.querySelector('.tk-attn')).toBeNull()
    expect(calls.some((c) => c.url.startsWith('/api/launch-log'))).toBe(false)
  })

  it('a stray waiting offer is no row of its own and no count: the nudge stands alone', async () => {
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    stubFetch({ used: 0, cap: 3 })
    const stray = row({ id: 'w1', question_spec_json: JSON.stringify({ ...SPEC, week_start: '2026-11-02', expires_at: '2026-11-09T06:00:00Z' }) })
    const host = await mount(<QuestionsCard tasks={[stray]} band={false} />)
    await until(() => !!nudgeRow(host), 'the row')
    expect(host.querySelectorAll('.tk-qrow')).toHaveLength(1)
    expect(host.querySelector('.tk-cnt')).toBeNull()
    expect(cardQuestionCount([stray])).toBe(0)
  })

  it('an answered plan leaves the card and the count', () => {
    const done = answered([{ task_id: 'task_a', option_key: 'a1', text: null, start: false }])
    expect(cardQuestionCount([done])).toBe(0)
  })

  it('the header count is the waiting questions, with the nudge beside them', async () => {
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    stubFetch({ used: 0, cap: 3 })
    const tasks = [question('q1'), question('q2')]
    const host = await mount(<QuestionsCard tasks={tasks} band={false} />)
    await until(() => !!nudgeRow(host), 'the row')
    expect(host.querySelector('.tk-cnt')?.textContent).toBe('2')
    expect(cardQuestionCount(tasks)).toBe(2)
  })

  it('the fold control shows only when there is a count to fold into', async () => {
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    stubFetch({ used: 0, cap: 3 })
    const alone = await mount(<QuestionsCard tasks={[]} band={false} onCollapse={() => {}} />)
    await until(() => !!nudgeRow(alone), 'the row')
    expect(alone.querySelector('[data-testid="q-collapse"]')).toBeNull()
    const withQuestion = await mount(<QuestionsCard tasks={[question('q1')]} band={false} onCollapse={() => {}} />)
    expect(withQuestion.querySelector('[data-testid="q-collapse"]')).not.toBeNull()
  })
})

describe('The nudge on the clock (usePlanNudgeWeek)', () => {
  // A tab left open across Sunday 16:00 Chicago: no refetch, no data change.
  function Bits({ tasks }: { tasks: TaskRow[] }) {
    const { count } = useNeedsYouCollapsed(tasks)
    return (
      <>
        <span data-testid="count">{count}</span>
        <QuestionsCard tasks={tasks} band={false} />
      </>
    )
  }
  // React's scheduler posts through MessageChannel, which is not faked.
  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(null); c.port2.postMessage(0) })
    }
  }

  it('the row appears at Sunday 16:00 with no data change, and never touches the count', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-11-08T21:59:30Z')) // 15:59:30 CST
    stubFetch({ used: 0, cap: 3 })
    const tasks = [planFor('2026-11-02')]
    const host = await mount(<Bits tasks={tasks} />)
    await until(() => host.querySelector('[data-testid="count"]') !== null, 'mounted')
    expect(nudgeRow(host)).toBeNull()

    await vi.advanceTimersByTimeAsync(60_000) // 16:00:30
    await flush()
    await until(() => !!nudgeRow(host), 'the row after the line')
    expect(host.querySelector('[data-testid="count"]')!.textContent).toBe('0')
  })
})

describe('isQuestionOnCard keeps every live week_plan row, for the nudge', () => {
  const older = row({ id: 'w1', created_at: '2026-10-25T21:00:00Z' })
  const today = '2026-11-01'

  it('hands over every live week_plan row, whatever its state', () => {
    const snoozed = row({ id: 'w2', created_at: '2026-10-28T15:00:00Z', due_date: '2026-11-05' })
    const acted = row({
      id: 'w3', status: 'done',
      question_answer_json: JSON.stringify({ v: 1, choice: 'save', via: 'hub', at: '2026-10-26T14:00:00Z', picks: [] }),
      question_consumed_json: JSON.stringify({ v: 1, at: '2026-10-26T15:00:00Z', answer_at: '2026-10-26T14:00:00Z', by: 'pb' }),
    })
    expect(isQuestionOnCard(snoozed, today)).toBe(true)
    expect(isQuestionOnCard(acted, today)).toBe(true)
    expect(isQuestionOnCard({ ...older, status: 'deleted' }, today)).toBe(false)
    expect(isQuestionOnCard({ ...older, deleted_at: '2026-10-30T00:00:00Z' } as TaskRow, today)).toBe(false)
  })
})

describe('This week', () => {
  const state = (planned: Record<string, { slot: string }>): TodayStateApi => ({
    planned, done: {}, plannedIds: () => Object.keys(planned),
    markDone: () => {}, uncheck: () => {}, planAt: () => {}, unplan: () => {},
  } as unknown as TodayStateApi)

  it('currentWeekPlan: the newest answered plan whose week holds today', () => {
    const older = answered([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }], '2026-10-26T14:00:00Z', 'p1')
    const newer = answered([{ task_id: 'task_b', option_key: 'b2', text: null, start: true }], '2026-10-27T14:00:00Z', 'p2')
    expect(currentWeekPlan([older, newer, row({ id: 'waiting' })], '2026-10-28')?.task.id).toBe('p2')
    expect(currentWeekPlan([older], '2026-11-01')?.task.id).toBe('p1') // Sunday is the week's last day
    expect(currentWeekPlan([older], '2026-11-02')).toBeNull()
    // The offer lands Sunday evening for the week starting Monday: an answer
    // given that evening shows the same evening.
    expect(currentWeekPlan([older], '2026-10-25')?.task.id).toBe('p1')
    expect(currentWeekPlan([older], '2026-10-24')).toBeNull()
  })

  it('a Saved pick has Start: it posts the stored answer with that pick flipped, nothing else changed', async () => {
    const calls = stubFetch({ used: 0, cap: 3 })
    const stored = answered([
      { task_id: 'task_a', option_key: 'a2', text: null, start: true },
      { task_id: 'task_b', option_key: null, text: 'Ask Casey first', start: false },
    ])
    const plan = currentWeekPlan([stored], '2026-10-28')!
    const host = await mount(
      <ThisWeekSection plan={plan} allTasks={[task('task_a'), task('task_b')]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />,
    )
    const buttons = host.querySelectorAll('[data-testid="pick-start"]')
    expect(buttons).toHaveLength(1) // only the saved pick
    await click(buttons[0])
    await until(() => calls.some((c) => c.url === '/api/tasks/task_plan'), 'the flip POST')
    const sent = (calls.find((c) => c.url === '/api/tasks/task_plan')!.body as { question_answer_json: Record<string, unknown> }).question_answer_json
    const before = JSON.parse(stored.question_answer_json!)
    expect(sent).toEqual({ ...before, choice: 'start', picks: [before.picks[0], { ...before.picks[1], start: true }] })
  })

  it('a pick not planned today opens its task drawer from the title and from the Ready tag, and the tag explains itself', async () => {
    stubFetch({ used: 0, cap: 10 })
    const plan = currentWeekPlan([answered([{ task_id: 'task_a', option_key: 'a2', text: null, start: true }])], '2026-10-28')!
    const host = await mount(
      <ThisWeekSection plan={plan} allTasks={[task('task_a', { packet_state: 'ready' })]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />,
    )
    const tag = host.querySelector('[data-testid="pick-packet-tag"]') as HTMLButtonElement
    expect(tag.textContent).toBe('Ready')
    expect(tag.title).toBe('A first step is prepared: open the task to see it')
    const rowKids = () => host.querySelector('[data-testid="this-week-pick"]')!.children.length
    expect(rowKids()).toBe(1) // the pick line (check, title, direction, links): no drawer yet
    const title = host.querySelector('[data-testid="pick-open"]') as HTMLButtonElement
    expect(title.getAttribute('aria-expanded')).toBe('false')
    await click(title)
    expect(title.getAttribute('aria-expanded')).toBe('true')
    expect(rowKids()).toBe(2) // the drawer mounted
    await click(title)
    expect(title.getAttribute('aria-expanded')).toBe('false')
    await click(tag) // the Ready tag opens it too
    expect(title.getAttribute('aria-expanded')).toBe('true')
  })

  it('a pick not planned today carries a check and its key links, labelled by their descriptions', async () => {
    stubFetch({ used: 0, cap: 10 })
    const marked: string[] = []
    const st = { ...state({}), markDone: (id: string) => { marked.push(id) } } as unknown as TodayStateApi
    const plan = currentWeekPlan([answered([{ task_id: 'task_a', option_key: 'a2', text: null, start: true }])], '2026-10-28')!
    const host = await mount(
      <ThisWeekSection
        plan={plan}
        allTasks={[task('task_a', {
          key_link_1: 'https://mail.google.com/mail/u/1/#drafts/abc', key_link_1_desc: 'Gmail Draft',
          key_link_2: 'https://docs.google.com/document/d/xyz/edit', key_link_2_desc: 'Draft interview questions',
        })]}
        stripTasks={[]} state={st} projectsByPid={new Map()}
      />,
    )
    const pick = host.querySelector('[data-testid="this-week-pick"]')!
    const links = [...pick.querySelectorAll('[data-testid="pick-links"] a')]
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['Gmail Draft', 'Draft interview questions'])
    // Even the Gmail icon (no custom tip) says which draft it opens.
    expect((links[0] as HTMLElement).title).toBe('Gmail Draft')
    await click(pick.querySelector('button[aria-label="Mark done"]'))
    expect(marked).toEqual(['task_a'])
  })

  it('a done pick not planned today shows checked and struck through, and the check reopens it', async () => {
    stubFetch({ used: 0, cap: 10 })
    const reopened: string[] = []
    const st = { ...state({}), done: { task_a: true }, uncheck: (id: string) => { reopened.push(id) } } as unknown as TodayStateApi
    const plan = currentWeekPlan([answered([{ task_id: 'task_a', option_key: 'a2', text: null, start: true }])], '2026-10-28')!
    const host = await mount(
      <ThisWeekSection plan={plan} allTasks={[task('task_a')]} stripTasks={[]} state={st} projectsByPid={new Map()} />,
    )
    const pick = host.querySelector('[data-testid="this-week-pick"]')!
    expect((pick.querySelector('.tk-plan-t') as HTMLElement).style.textDecoration).toBe('line-through')
    await click(pick.querySelector('button[aria-label="Mark not done"]'))
    expect(reopened).toEqual(['task_a'])
  })

  it('the Start button names the shared daily cap', async () => {
    stubFetch({ used: 0, cap: 10 })
    const plan = currentWeekPlan([answered([{ task_id: 'task_b', option_key: null, text: 'Ask Casey first', start: false }])], '2026-10-28')!
    const host = await mount(
      <ThisWeekSection plan={plan} allTasks={[task('task_b')]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />,
    )
    expect((host.querySelector('[data-testid="pick-start"]') as HTMLButtonElement).title).toContain("today's 10")
  })

  it('a pick planned today is a full planned row (finish and unplan) carrying its tag and direction', async () => {
    stubFetch({ used: 0, cap: 3 })
    const plan = currentWeekPlan([answered([{ task_id: 'task_a', option_key: 'a2', text: null, start: true }])], '2026-10-28')!
    const host = await mount(
      <ThisWeekSection plan={plan} allTasks={[task('task_a', { packet_state: 'ready' })]} stripTasks={[]} state={state({ task_a: { slot: 'strip' } })} projectsByPid={new Map()} />,
    )
    const pick = host.querySelector('[data-testid="this-week-pick"]')!
    expect(pick.querySelector('.tk-prow')).not.toBeNull()
    expect(pick.querySelector('[aria-label="Remove from plan"]')).not.toBeNull()
    expect(pick.textContent).toContain('Ready')
    expect(pick.textContent).toContain('Direction a2')
  })

  it('lists picks with direction, packet state and a Today mark, then the strip tasks that are not picks', async () => {
    stubFetch({ used: 0, cap: 3 })
    const plan = currentWeekPlan([answered([
      { task_id: 'task_a', option_key: 'a2', text: null, start: true },
      { task_id: 'task_b', option_key: null, text: 'Ask Casey first', start: false },
      { task_id: 'task_c', option_key: 'c1', text: null, start: true },
    ])], '2026-10-28')!
    const all = [task('task_a', { packet_state: 'ready' }), task('task_b'), task('task_c', { packet_state: 'changed' }), task('task_x')]
    const host = await mount(
      <ThisWeekSection plan={plan} allTasks={all} stripTasks={[all[0], all[3]]} state={state({ task_a: { slot: 'strip' }, task_x: { slot: 'strip' } })} projectsByPid={new Map()} />,
    )
    const picks = [...host.querySelectorAll('[data-testid="this-week-pick"]')]
    expect(picks.map((p) => p.textContent)).toEqual([
      expect.stringContaining('Ready'),
      expect.stringContaining('Saved'),
      expect.stringContaining('Changed'),
    ])
    expect(picks[0].textContent).toContain('Direction a2')
    expect(picks[1].textContent).toContain('Ask Casey first')
    expect(picks[0].querySelector('[data-testid="pick-today"]')).not.toBeNull()
    expect(picks[2].querySelector('[data-testid="pick-today"]')).toBeNull()
    // task_a is a pick, so it is not repeated; task_x is planned and stays.
    const extra = host.querySelector('[data-testid="this-week-planned"]')!
    expect(extra.textContent).toContain('Task task_x')
    expect(extra.textContent).not.toContain('Task task_a')
  })

  it('pickTag: Preparing for a started pick with no packet yet; Done wins', () => {
    expect(pickTag(task('a'), true)?.label).toBe('Preparing')
    expect(pickTag(undefined, false)?.label).toBe('Saved')
    expect(pickTag(task('a', { status: 'done', completed: 1, packet_state: 'ready' }), true)?.label).toBe('Done')
  })
})

describe('The Plan button, and earlier plans', () => {
  const state = (planned: Record<string, { slot: string }>): TodayStateApi => ({
    planned, done: {}, plannedIds: () => Object.keys(planned),
    markDone: () => {}, uncheck: () => {}, planAt: () => {}, unplan: () => {},
  } as unknown as TodayStateApi)
  const stored = () => currentWeekPlan([answered([{ task_id: 'task_a', option_key: 'a2', text: null, start: true }])], '2026-10-28')!

  it('This week and Planned today carry the Plan button for the PI, and no Re-plan control or request', async () => {
    const calls = stubFetch({ used: 0, cap: 3 })
    const week = await mount(<ThisWeekSection plan={stored()} allTasks={[task('task_a')]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    const planned = await mount(<PlannedTodaySection stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    for (const host of [week, planned]) {
      await until(() => host.querySelector('[data-testid="plan-button"]')?.getAttribute('data-state') === 'ready', 'Plan ready')
      const btn = host.querySelector('[data-testid="plan-button"]') as HTMLButtonElement
      expect(btn.textContent).toBe('Plan')
      expect(btn.className).toContain('tk-btn tk-sm')
      expect(btn.disabled).toBe(false)
      expect(host.querySelector('[data-testid="replan"]')).toBeNull()
    }
    expect(calls.some((c) => c.url.startsWith('/api/week-plan/replan'))).toBe(false)
  })

  it('a member sees no Plan button in either section, and nothing is requested', async () => {
    const calls = stubFetch({ used: 0, cap: 3 })
    const week = await mount(<ThisWeekSection plan={stored()} allTasks={[task('task_a')]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />, 'member')
    const planned = await mount(<PlannedTodaySection stripTasks={[]} state={state({})} projectsByPid={new Map()} />, 'member')
    await tick(); await tick()
    for (const host of [week, planned]) {
      expect(host.querySelector('[data-testid="plan-button"]')).toBeNull()
      expect(host.querySelector('[data-testid="plan-note"]')).toBeNull()
    }
    expect(calls.some((c) => c.url.startsWith('/api/launch-log'))).toBe(false)
  })

  it('an answer that withdraws every pick shows one empty line, not "This week 0" over a blank list', async () => {
    stubFetch({ used: 0, cap: 3 })
    const withdrawnAll = row({
      question_answer_json: JSON.stringify({ v: 1, choice: 'start', via: 'hub', at: '2026-10-26T14:00:00Z', picks: [], withdrawn: ['task_a'] }),
    })
    const plan = currentWeekPlan([withdrawnAll], '2026-10-28')!
    expect(plan.picks).toEqual([])
    expect(plan.earlier).toEqual([])
    const host = await mount(<ThisWeekSection plan={plan} allTasks={[task('task_a')]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    expect(host.querySelector('[data-testid="this-week-empty"]')?.textContent).toBe('Nothing planned this week.')
    expect(host.querySelector('.tk-cnt')?.textContent).toBe('0')
    // With a pick the line is gone.
    const host2 = await mount(<ThisWeekSection plan={stored()} allTasks={[task('task_a')]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    expect(host2.querySelector('[data-testid="this-week-empty"]')).toBeNull()
  })

  it('currentWeekPlan carries earlier started picks still open, read-only, tagged; done ones drop off (#167)', async () => {
    const SPEC2 = { ...SPEC, candidates: [...SPEC.candidates, { task_id: 'task_d', title: 'Old done', why: '', evidence: [], options: [opt('d1', true), opt('d2')] }] }
    const older = row({
      id: 'p_old', question_spec_json: JSON.stringify(SPEC2),
      question_answer_json: JSON.stringify({ v: 1, choice: 'start', via: 'hub', at: '2026-10-26T14:00:00Z', picks: [
        { task_id: 'task_a', option_key: 'a1', text: null, start: true }, // started: carried
        { task_id: 'task_c', option_key: 'c1', text: null, start: false }, // saved, not done: re-offered, not carried
        { task_id: 'task_d', option_key: 'd1', text: null, start: true }, // started and done: dropped off
        { task_id: 'task_b', option_key: 'b1', text: null, start: true }, // the newer plan picks it: not carried
      ] }),
    })
    const otherWeek = row({
      id: 'p_prev', question_spec_json: JSON.stringify({ ...SPEC, week_start: '2026-10-19' }),
      question_answer_json: JSON.stringify({ v: 1, choice: 'start', via: 'hub', at: '2026-10-20T14:00:00Z', picks: [{ task_id: 'task_c', option_key: 'c2', text: null, start: true }] }),
    })
    const newer = answered([{ task_id: 'task_b', option_key: 'b2', text: null, start: false }], '2026-10-28T15:00:00Z', 'p_new')
    const all = [older, otherWeek, newer, task('task_a'), task('task_b'), task('task_c'), task('task_d', { status: 'done', completed: 1 })]
    const plan = currentWeekPlan(all, '2026-10-28')!
    expect(plan.task.id).toBe('p_new')
    expect(plan.earlier.map((e) => [e.pick.task_id, e.task.id])).toEqual([['task_a', 'p_old']]) // task_d is done, so it dropped off (#167)

    stubFetch({ used: 0, cap: 3 })
    const host = await mount(<ThisWeekSection plan={plan} allTasks={all} stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    const rows = [...host.querySelectorAll('[data-testid="this-week-earlier"]')]
    expect(rows).toHaveLength(1)
    expect(rows.every((r) => r.querySelector('[data-testid="earlier-tag"]')?.textContent === 'earlier plan')).toBe(true)
    expect(rows.every((r) => r.querySelector('[data-testid="pick-start"]') === null)).toBe(true)
    expect(rows[0].textContent).toContain('Direction a1') // its own plan's direction
    // The newer plan's saved pick still has Start, against the NEWER plan.
    expect(host.querySelectorAll('[data-testid="pick-start"]')).toHaveLength(1)
    expect(host.querySelector('.tk-cnt')?.textContent).toBe('2')
  })
})

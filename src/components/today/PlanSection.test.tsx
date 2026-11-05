// The Plan section's cards, and the gold "Plan your week" row in Needs you. This
// week's tests moved here when it became the Plan section (#169 round 2): what
// still holds holds on the new cards. The real-page tests (each task once) are
// src/__tests__/today-plan-section.test.tsx.
//
// Runs in real Chromium (vitest.config.ts browser mode), mounted with
// react-dom directly like QuestionsCard.test.tsx. fetch is stubbed, so the
// test reads the exact request body the Worker would receive.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DndContext } from '@dnd-kit/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UndoToastProvider } from '../UndoToast'
import { AuthContext, type AuthUser } from '../../hooks/useAuth'
import { QuestionsCard } from '../tasks/QuestionsCard'
import { PlanSection } from './PlanSection'
import { currentWeekPlan, pickTag, type AcceptedWeekPlan } from '../../lib/weekPlan'
import { planSectionModel } from '../../lib/planSection'
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

// 'pi' is the owner: the server sets canShowAllProjects for the site admin alone
// (api/index.ts, isSiteAdmin). 'other-pi' is a PI who is not.
type Viewer = 'pi' | 'other-pi' | 'member' | 'unresolved'
const viewerUser = (v: Viewer): AuthUser => ({
  email: 'pi@umn.edu', slug: 'pi', name: 'X', isAuthenticated: true, isPi: v === 'pi' || v === 'other-pi', isMember: true,
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
    const host = await mount(<QuestionsCard tasks={[]} band={false} planNudge />)
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
    const host = await mount(<QuestionsCard tasks={[planFor('2026-11-02')]} band={false} planNudge />)
    await tick()
    expect(nudgeRow(host)).toBeNull()
    expect(host.querySelector('.tk-attn')).toBeNull()
  })

  it('Sunday evening with this week planned asks about next week, and a plan for next week ends it', async () => {
    vi.setSystemTime(new Date('2026-11-08T22:00:00Z'))
    stubFetch({ used: 0, cap: 3 })
    const host = await mount(<QuestionsCard tasks={[planFor('2026-11-02')]} band={false} planNudge />)
    await until(() => !!nudgeRow(host), 'the row')
    const label = new Date(2026, 10, 9).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    expect(nudgeRow(host)?.textContent).toContain(label)
    const host2 = await mount(<QuestionsCard tasks={[planFor('2026-11-02'), planFor('2026-11-09')]} band={false} planNudge />)
    await tick()
    expect(nudgeRow(host2)).toBeNull()
  })

  it('a member gets no row, no gold card and no launch request', async () => {
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    const calls = stubFetch({ used: 0, cap: 3 })
    const host = await mount(<QuestionsCard tasks={[]} band={false} planNudge />, 'member')
    await tick()
    expect(nudgeRow(host)).toBeNull()
    expect(host.querySelector('.tk-attn')).toBeNull()
    expect(calls.some((c) => c.url.startsWith('/api/launch-log'))).toBe(false)
  })

  it('opt-in: a page that has not said it read the owner\'s own list gets no row', async () => {
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    stubFetch({ used: 0, cap: 3 })
    const host = await mount(<QuestionsCard tasks={[]} band={false} />)
    await tick()
    expect(nudgeRow(host)).toBeNull()
    expect(host.querySelector('.tk-attn')).toBeNull()
  })

  it('a PI who is not the owner gets no row and no gold card: planning stays Nick-only', async () => {
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    stubFetch({ used: 0, cap: 3 })
    const host = await mount(<QuestionsCard tasks={[]} band={false} planNudge />, 'other-pi')
    await tick()
    expect(nudgeRow(host)).toBeNull()
    expect(host.querySelector('.tk-attn')).toBeNull()
  })

  it('a stray waiting offer is no row of its own and no count: the nudge stands alone', async () => {
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    stubFetch({ used: 0, cap: 3 })
    const stray = row({ id: 'w1', question_spec_json: JSON.stringify({ ...SPEC, week_start: '2026-11-02', expires_at: '2026-11-09T06:00:00Z' }) })
    const host = await mount(<QuestionsCard tasks={[stray]} band={false} planNudge />)
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
    const host = await mount(<QuestionsCard tasks={tasks} band={false} planNudge />)
    await until(() => !!nudgeRow(host), 'the row')
    expect(host.querySelector('.tk-cnt')?.textContent).toBe('2')
    expect(cardQuestionCount(tasks)).toBe(2)
  })

  it('the fold control shows only when there is a count to fold into', async () => {
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    stubFetch({ used: 0, cap: 3 })
    const alone = await mount(<QuestionsCard tasks={[]} band={false} planNudge onCollapse={() => {}} />)
    await until(() => !!nudgeRow(alone), 'the row')
    expect(alone.querySelector('[data-testid="q-collapse"]')).toBeNull()
    const withQuestion = await mount(<QuestionsCard tasks={[question('q1')]} band={false} planNudge onCollapse={() => {}} />)
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
        <QuestionsCard tasks={tasks} band={false} planNudge />
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

const DAY = '2026-10-28'
const state = (planned: Record<string, { slot: string }>, extra: Partial<TodayStateApi> = {}): TodayStateApi => ({
  planned, done: {}, plannedIds: () => Object.keys(planned),
  markDone: () => {}, uncheck: () => {}, planAt: () => {}, unplan: () => {}, ...extra,
} as unknown as TodayStateApi)
const section = (plan: AcceptedWeekPlan | null, rows: TaskRow[], st: TodayStateApi = state({})) => (
  <PlanSection plan={plan} model={planSectionModel(plan, rows, st.planned, DAY, st.done)} state={st} projectsByPid={new Map()} viewerSlug="" />
)
const cards = (h: ParentNode) => [...h.querySelectorAll('[data-testid="plan-card"]')]
const stored = () => currentWeekPlan([answered([{ task_id: 'task_a', option_key: 'a2', text: null, start: true }])], DAY)!

describe('The Plan section cards', () => {
  it('currentWeekPlan: the newest answered plan whose week holds today', () => {
    const older = answered([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }], '2026-10-26T14:00:00Z', 'p1')
    const newer = answered([{ task_id: 'task_b', option_key: 'b2', text: null, start: true }], '2026-10-27T14:00:00Z', 'p2')
    expect(currentWeekPlan([older, newer, row({ id: 'waiting' })], DAY)?.task.id).toBe('p2')
    expect(currentWeekPlan([older], '2026-11-01')?.task.id).toBe('p1') // Sunday is the week's last day
    expect(currentWeekPlan([older], '2026-11-02')).toBeNull()
    // The offer lands Sunday evening for the week starting Monday: an answer
    // given that evening shows the same evening.
    expect(currentWeekPlan([older], '2026-10-25')?.task.id).toBe('p1')
    expect(currentWeekPlan([older], '2026-10-24')).toBeNull()
  })

  it('a card is the same card as the sections below: the shared .tk-card, not a thinner row', async () => {
    stubFetch({ used: 0, cap: 10 })
    const host = await mount(section(stored(), [task('task_a')]))
    expect(cards(host)[0].querySelector('.tk-card.tk-tc')).not.toBeNull()
  })

  it('a Saved pick has Prep: it posts the stored answer with that pick flipped, nothing else changed', async () => {
    const calls = stubFetch({ used: 0, cap: 3 })
    const answer = answered([
      { task_id: 'task_a', option_key: 'a2', text: null, start: true },
      { task_id: 'task_b', option_key: null, text: 'Ask Casey first', start: false },
    ])
    const host = await mount(section(currentWeekPlan([answer], DAY), [task('task_a'), task('task_b')]))
    const buttons = host.querySelectorAll('[data-testid="pick-start"]')
    expect(buttons).toHaveLength(1) // only the saved pick
    await click(buttons[0])
    await until(() => calls.some((c) => c.url === '/api/tasks/task_plan'), 'the flip POST')
    const sent = (calls.find((c) => c.url === '/api/tasks/task_plan')!.body as { question_answer_json: Record<string, unknown> }).question_answer_json
    const before = JSON.parse(answer.question_answer_json!)
    expect(sent).toEqual({ ...before, choice: 'start', picks: [before.picks[0], { ...before.picks[1], start: true }] })
  })

  it('a kept pick not started shows Prep, and its flip is a real start', async () => {
    const calls = stubFetch({ used: 0, cap: 3 })
    const answer = row({ question_answer_json: JSON.stringify({
      v: 1, choice: 'save', via: 'hub', at: '2026-10-26T14:00:00Z', kept: ['task_b'],
      picks: [{ task_id: 'task_b', option_key: 'b1', text: null, start: false }],
    }) })
    const host = await mount(section(currentWeekPlan([answer], DAY), [task('task_b')]))
    await click(host.querySelector('[data-testid="pick-start"]'))
    await until(() => calls.some((c) => c.url === '/api/tasks/task_plan'), 'the flip POST')
  })

  const keptStarted = (over: Partial<TaskRow> = {}) => row({ question_answer_json: JSON.stringify({
    v: 1, choice: 'start', via: 'hub', at: '2026-10-26T14:00:00Z', kept: ['task_b'],
    picks: [{ task_id: 'task_b', option_key: 'b1', text: null, start: true }],
  }), ...over })
  const tags = (h: ParentNode) => [...h.querySelectorAll('.tk-tag')].map((t) => t.textContent)

  it('a kept started pick with no live packet claims nothing: no Preparing, no Prep', async () => {
    stubFetch({ used: 0, cap: 3 })
    const host = await mount(section(currentWeekPlan([keptStarted()], DAY), [task('task_b')]))
    expect(cards(host)).toHaveLength(1)
    expect(tags(host)).not.toContain('Preparing')
    expect(host.querySelector('[data-testid="pick-start"]')).toBeNull()
  })

  it('a kept started pick with a live packet still shows it', async () => {
    stubFetch({ used: 0, cap: 3 })
    const host = await mount(section(currentWeekPlan([keptStarted()], DAY), [task('task_b', { packet_state: 'ready' })]))
    expect(host.querySelector('[data-testid="pick-packet-tag"]')?.textContent).toBe('Ready')
  })

  it('a started pick that was not kept still reads Preparing', async () => {
    stubFetch({ used: 0, cap: 3 })
    const answer = answered([{ task_id: 'task_b', option_key: 'b1', text: null, start: true }])
    const host = await mount(section(currentWeekPlan([answer], DAY), [task('task_b')]))
    expect(tags(host)).toContain('Preparing')
  })

  it('a kept saved pick flipped by Prep reads Preparing: the press is a real start', async () => {
    stubFetch({ used: 0, cap: 3 })
    const saved = row({ question_answer_json: JSON.stringify({
      v: 1, choice: 'save', via: 'hub', at: '2026-10-26T14:00:00Z', kept: ['task_b'],
      picks: [{ task_id: 'task_b', option_key: 'b1', text: null, start: false }],
    }) })
    // The page re-reads the plan after the flip, and this mount of the section lives on.
    function Refetches() {
      const [answer, setAnswer] = useState(saved)
      return (
        <>
          <button type="button" data-testid="refetch" onClick={() => setAnswer(keptStarted())}>refetch</button>
          {section(currentWeekPlan([answer], DAY), [task('task_b')])}
        </>
      )
    }
    const host = await mount(<Refetches />)
    await click(host.querySelector('[data-testid="pick-start"]'))
    await click(host.querySelector('[data-testid="refetch"]'))
    expect(tags(host)).toContain('Preparing')
  })

  it('a refused Prep says the daily cap, in the section', async () => {
    stubFetch({ used: 0, cap: 3 }, () => new Response(JSON.stringify({ code: 'daily_cap', used: 3, cap: 3, error: 'cap' }), { status: 429 }))
    const answer = answered([{ task_id: 'task_b', option_key: 'b1', text: null, start: false }])
    const host = await mount(section(currentWeekPlan([answer], DAY), [task('task_b')]))
    await click(host.querySelector('[data-testid="pick-start"]'))
    await until(() => !!host.querySelector('.tk-plan-err'), 'the refusal')
    expect(host.querySelector('.tk-plan-err')?.textContent).toContain("Today's 3 prepared first steps")
  })

  it('a card opens its drawer from the body and from the Ready tag, and the tag explains itself', async () => {
    stubFetch({ used: 0, cap: 10 })
    const host = await mount(section(stored(), [task('task_a', { packet_state: 'ready' })]))
    const tag = host.querySelector('[data-testid="pick-packet-tag"]') as HTMLButtonElement
    expect(tag.textContent).toBe('Ready')
    expect(tag.title).toBe('A first step is prepared: open the task to see it')
    // The one packet tag: the card's own Ready does not repeat it.
    expect([...cards(host)[0].querySelectorAll('.tk-tag')].filter((t) => t.textContent === 'Ready')).toHaveLength(1)
    const body = host.querySelector('.tk-tch') as HTMLElement
    expect(body.getAttribute('aria-expanded')).toBe('false')
    await click(body)
    expect(body.getAttribute('aria-expanded')).toBe('true')
    await click(body)
    expect(body.getAttribute('aria-expanded')).toBe('false')
    await click(tag) // the Ready tag opens it too
    expect(body.getAttribute('aria-expanded')).toBe('true')
  })

  it('a card carries a check and its key links, labelled by their descriptions', async () => {
    stubFetch({ used: 0, cap: 10 })
    const marked: string[] = []
    const st = state({}, { markDone: (id: string) => { marked.push(id) } })
    const host = await mount(section(stored(), [task('task_a', {
      key_link_1: 'https://mail.google.com/mail/u/1/#drafts/abc', key_link_1_desc: 'Gmail Draft',
      key_link_2: 'https://docs.google.com/document/d/xyz/edit', key_link_2_desc: 'Draft interview questions',
    })], st))
    const links = [...cards(host)[0].querySelectorAll('.tk-lks a')]
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['Gmail Draft', 'Draft interview questions'])
    // Even the Gmail icon (no custom tip) says which draft it opens.
    expect((links[0] as HTMLElement).title).toBe('Gmail Draft')
    await click(cards(host)[0].querySelector('button[aria-label="Mark done"]'))
    expect(marked).toEqual(['task_a'])
  })

  it('a done pick sinks to Done, checked, with no step or Prep, and the check reopens it', async () => {
    stubFetch({ used: 0, cap: 10 })
    const reopened: string[] = []
    const st = state({}, { done: { task_a: true }, uncheck: (id: string) => { reopened.push(id) } })
    const host = await mount(section(stored(), [task('task_a')], st))
    const done = host.querySelector('[data-testid="plan-done"]')!
    expect(done.querySelector('.tk-card.tk-done')).not.toBeNull()
    expect(done.querySelector('[data-testid="pick-step"]')).toBeNull()
    expect(done.querySelector('[data-testid="pick-packet-tag"]')).toBeNull()
    expect(host.querySelector('.tk-cnt')?.textContent).toBe('1 of 1')
    await click(done.querySelector('button[aria-label="Mark not done"]'))
    expect(reopened).toEqual(['task_a'])
  })

  it('the Prep button names the shared daily cap', async () => {
    stubFetch({ used: 0, cap: 10 })
    const plan = currentWeekPlan([answered([{ task_id: 'task_b', option_key: null, text: 'Ask Casey first', start: false }])], DAY)!
    const host = await mount(section(plan, [task('task_b')]))
    expect((host.querySelector('[data-testid="pick-start"]') as HTMLButtonElement).title).toContain("today's 10")
  })

  it('a pick planned today carries the Today tag, an x that takes it off today, its packet tag and step', async () => {
    stubFetch({ used: 0, cap: 3 })
    const unplanned: string[] = []
    const st = state({ task_a: { slot: 'strip' } }, { unplan: (id: string) => { unplanned.push(id) } })
    const host = await mount(section(stored(), [task('task_a', { packet_state: 'ready', planned_for: DAY })], st))
    const card = cards(host)[0]
    expect(card.querySelector('[data-testid="pick-today"]')?.textContent).toBe('Today')
    expect(card.querySelector('[aria-label="Unplan task"]')).toBeNull() // no planned pill beside the tag
    expect(card.textContent).not.toContain('Planned')
    expect(card.textContent).toContain('Ready')
    expect(card.textContent).toContain('Direction a2')
    await click(card.querySelector('button[aria-label="Remove from today"]'))
    expect(unplanned).toEqual(['task_a'])
  })

  it('lists today first, then the plan order, with the non-pick tagged Today and its x saying plan', async () => {
    stubFetch({ used: 0, cap: 3 })
    const plan = currentWeekPlan([answered([
      { task_id: 'task_a', option_key: 'a2', text: null, start: true },
      { task_id: 'task_b', option_key: null, text: 'Ask Casey first', start: false },
      { task_id: 'task_c', option_key: 'c1', text: null, start: true },
    ])], DAY)!
    const all = [task('task_a', { packet_state: 'ready', planned_for: DAY, plan_rank: 2 }), task('task_b'), task('task_c', { packet_state: 'changed' }), task('task_x', { planned_for: DAY, plan_rank: 1 })]
    const host = await mount(section(plan, all, state({ task_a: { slot: 'strip' }, task_x: { slot: 'strip' } })))
    const list = cards(host)
    expect(list.map((c) => c.querySelector('[data-task-id]')?.getAttribute('data-task-id'))).toEqual(['task_x', 'task_a', 'task_b', 'task_c'])
    expect(list[1].textContent).toContain('Ready')
    expect(list[1].textContent).toContain('Direction a2')
    expect(list[2].textContent).toContain('Saved')
    expect(list[2].textContent).toContain('Ask Casey first')
    expect(list[3].textContent).toContain('Changed')
    expect(list[1].querySelector('[data-testid="pick-today"]')).not.toBeNull()
    expect(list[3].querySelector('[data-testid="pick-today"]')).toBeNull()
    expect(list[0].querySelector('[data-testid="pick-today"]')).not.toBeNull()
    expect(list[0].querySelector('button[aria-label="Remove from plan"]')).not.toBeNull()
    expect(list[0].querySelector('[data-testid="pick-step"]')).toBeNull() // no pick, no step
    expect(list[3].querySelector('[aria-label^="Remove from"]')).toBeNull() // leaving the plan is the next Plan's job
  })

  it('pickTag: Preparing for a started pick with no packet yet; Done wins', () => {
    expect(pickTag(task('a'), true)?.label).toBe('Preparing')
    expect(pickTag(undefined, false)?.label).toBe('Saved')
    expect(pickTag(task('a', { status: 'done', completed: 1, packet_state: 'ready' }), true)?.label).toBe('Done')
  })

  it('a task absent from the list renders nothing', async () => {
    stubFetch({ used: 0, cap: 3 })
    const host = await mount(section(stored(), []))
    expect(cards(host)).toEqual([])
    expect(host.querySelector('[data-testid="plan-empty"]')).not.toBeNull()
  })
})

describe('The Plan button and the empty line', () => {
  it('the section carries the Plan button for the PI, with or without a plan, and no Re-plan control or request', async () => {
    const calls = stubFetch({ used: 0, cap: 3 })
    const week = await mount(section(stored(), [task('task_a')]))
    const none = await mount(section(null, []))
    for (const host of [week, none]) {
      await until(() => host.querySelector('[data-testid="plan-button"]')?.getAttribute('data-state') === 'ready', 'Plan ready')
      const btn = host.querySelector('[data-testid="plan-button"]') as HTMLButtonElement
      expect(btn.textContent).toBe('Plan')
      expect(btn.className).toContain('tk-btn tk-sm')
      expect(btn.disabled).toBe(false)
      expect(host.querySelector('[data-testid="replan"]')).toBeNull()
    }
    expect(calls.some((c) => c.url.startsWith('/api/week-plan/replan'))).toBe(false)
  })

  it('a member sees no Plan button, with or without a plan, and nothing is requested', async () => {
    const calls = stubFetch({ used: 0, cap: 3 })
    const week = await mount(section(stored(), [task('task_a')]), 'member')
    const none = await mount(section(null, []), 'member')
    await tick(); await tick()
    for (const host of [week, none]) {
      expect(host.querySelector('[data-testid="plan-button"]')).toBeNull()
      expect(host.querySelector('[data-testid="plan-note"]')).toBeNull()
    }
    expect(none.querySelector('[data-testid="plan-empty"]')?.textContent).not.toContain('Press Plan')
    expect(calls.some((c) => c.url.startsWith('/api/launch-log'))).toBe(false)
  })

  it('an answer that withdraws every pick shows one empty line, and no count', async () => {
    stubFetch({ used: 0, cap: 3 })
    const withdrawnAll = row({
      question_answer_json: JSON.stringify({ v: 1, choice: 'start', via: 'hub', at: '2026-10-26T14:00:00Z', picks: [], withdrawn: ['task_a'] }),
    })
    const plan = currentWeekPlan([withdrawnAll], DAY)!
    expect(plan.picks).toEqual([])
    const host = await mount(section(plan, [task('task_a')]))
    expect(host.querySelector('[data-testid="plan-empty"]')?.textContent).toBe('Nothing planned this week.')
    expect(host.querySelector('.tk-cnt')).toBeNull()
    // With a pick the line is gone.
    const host2 = await mount(section(stored(), [task('task_a')]))
    expect(host2.querySelector('[data-testid="plan-empty"]')).toBeNull()
  })

  it('a pick done before the newest plan is not in that plan: it drops off (#167), and an older started pick is not carried', async () => {
    const older = answered([
      { task_id: 'task_a', option_key: 'a1', text: null, start: true }, // started, still open: its section has it
      { task_id: 'task_c', option_key: 'c1', text: null, start: true }, // started and done: dropped off
    ], '2026-10-26T14:00:00Z', 'p_old')
    const newer = answered([{ task_id: 'task_b', option_key: 'b2', text: null, start: false }], '2026-10-28T15:00:00Z', 'p_new')
    const rows = [older, newer, task('task_a'), task('task_b'), task('task_c', { status: 'done', completed: 1 })]
    const plan = currentWeekPlan(rows, DAY)!
    expect(plan.task.id).toBe('p_new')
    stubFetch({ used: 0, cap: 3 })
    const host = await mount(section(plan, rows))
    expect(cards(host).map((c) => c.querySelector('[data-task-id]')?.getAttribute('data-task-id'))).toEqual(['task_b'])
    // The newer plan's saved pick has Prep, against the NEWER plan.
    expect(host.querySelectorAll('[data-testid="pick-start"]')).toHaveLength(1)
    expect(host.querySelector('.tk-cnt')?.textContent).toBe('0 of 1')
  })
})

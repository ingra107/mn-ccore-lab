// The planning conversation, browser side (PB decision
// 2026-10-30-planning-conversation.md): the gold "Plan your week" row, the
// three-step conversation, the answer it posts, the cap, and This week.
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
import { QuestionsCard } from '../tasks/QuestionsCard'
import { ThisWeekSection } from './ThisWeekSection'
import { PlannedTodaySection } from './PlannedTodaySection'
import { currentWeekPlan, pickTag, replanButtonState, REPLAN_RESULT_SHOWN_S, REPLAN_UNCLAIMED_WARN_S } from '../../lib/weekPlan'
import { cardQuestionCount, isQuestionOnCard, newestWaitingWeekPlan, nextWeekPlanExpiry } from '../../lib/taskGrouping'
import { useNeedsYouCollapsed } from '../../hooks/useNeedsYouCollapsed'
import type { ReplanState } from '../../../shared/weekPlan'
import type { TaskRow } from '../../lib/api'
import type { TodayStateApi } from '../../hooks/useTodayState'

let mounted: { host: HTMLElement; root: Root }[] = []
// The fixture offer expires 2026-11-02T06:00Z (Monday 00:00 CST, after DST
// ends 11-01) and an expired offer never asks
// (newestWaitingWeekPlan), so the clock is pinned inside that week. Only Date
// is faked: `until` still needs real timers.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-01T18:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  for (const { host, root } of mounted) { root.unmount(); host.remove() }
  mounted = []
  document.querySelectorAll('[data-testid="plan-panel"]').forEach((n) => n.parentElement?.remove())
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
/** The Re-plan route's stub: `get` answers GET /api/week-plan/replan (a
 *  function so a test can change the state after a press), `post` the press. */
type ReplanStub = { get: () => Response; post?: () => Response }
const replanNone: ReplanStub = { get: () => new Response(JSON.stringify({ data: null }), { status: 200 }) }
function stubFetch(
  count: { used: number; cap: number } | 'fail',
  answer: (body: unknown) => Response = () => new Response('{}', { status: 200 }),
  replan: ReplanStub = replanNone,
) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method: init?.method ?? 'GET', body })
    if (url.startsWith('/api/packets/daily-count')) {
      return count === 'fail' ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ date: '2026-10-28', ...count }), { status: 200 })
    }
    if (url.startsWith('/api/week-plan/replan')) {
      return init?.method === 'POST' ? (replan.post ?? (() => new Response('{}', { status: 201 })))() : replan.get()
    }
    if (url.startsWith('/api/tasks/')) return answer(body)
    return new Response('[]', { status: 200 })
  }))
  return calls
}

async function mount(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <UndoToastProvider>
            <DndContext>{node}</DndContext>
          </UndoToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
  )
  mounted.push({ host, root })
  await tick()
  return host
}

const panel = () => document.querySelector('[data-testid="plan-panel"]') as HTMLElement | null
const buttonNamed = (scope: ParentNode, re: RegExp) =>
  [...scope.querySelectorAll('button')].find((b) => re.test(b.textContent ?? '')) as HTMLButtonElement | undefined
const tick = () => new Promise((r) => setTimeout(r, 30))
async function click(el: Element | null | undefined) {
  if (!el) throw new Error('missing element')
  ;(el as HTMLElement).click()
  await tick()
}

async function walkToConfirm(picks: string[]) {
  await click(document.querySelector('[data-testid="q-week-plan"] button'))
  await until(() => !!panel(), 'the panel')
  const p = panel()!
  for (const t of picks) {
    const label = [...p.querySelectorAll('label')].find((l) => l.textContent?.includes(t))
    await click(label?.querySelector('input'))
  }
  await click(buttonNamed(p, /^Next/))
  return p
}

describe('Needs you: the Plan your week row', () => {
  it('a waiting week plan is one gold row; an answered one leaves the card and the count', async () => {
    stubFetch({ used: 0, cap: 3 })
    const host = await mount(<QuestionsCard tasks={[row()]} band={false} />)
    expect(host.querySelector('[data-testid="q-week-plan"]')?.textContent).toContain('Plan your week')
    expect(host.querySelector('[data-testid="q-week-plan"]')?.textContent).toContain('3 to choose from')
    expect(host.querySelectorAll('.tk-attn')).toHaveLength(1)
    expect(cardQuestionCount([row()])).toBe(1)

    const done = answered([{ task_id: 'task_a', option_key: 'a1', text: null, start: false }])
    const host2 = await mount(<QuestionsCard tasks={[done]} band={false} />)
    expect(host2.querySelector('.tk-attn')).toBeNull()
    expect(cardQuestionCount([done])).toBe(0)
  })
})

describe('PlanConversation', () => {
  it('pick, choose (recommended preselected, one typed), Start: posts the typed answer, nothing else', async () => {
    const calls = stubFetch({ used: 0, cap: 3 })
    await mount(<QuestionsCard tasks={[row()]} band={false} />)
    const p = await walkToConfirm(['Answer Jane', 'Review abstract'])

    // Step 2: recommended options are chosen; switch task_b to its own text.
    const radios = [...p.querySelectorAll('input[type="radio"]')] as HTMLInputElement[]
    expect(radios.filter((r) => r.checked)).toHaveLength(2)
    expect(p.textContent).toContain('Recommended')
    const other = [...p.querySelectorAll('fieldset')][1].querySelectorAll('input[type="radio"]')
    await click(other[other.length - 1])
    expect(buttonNamed(p, /^Next/)!.disabled).toBe(true) // empty text blocks Next
    const box = p.querySelector('textarea') as HTMLTextAreaElement
    {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      set.call(box, 'Ask Casey which cut he used')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await tick()
    await click(buttonNamed(p, /^Next/))

    await until(() => /3 left today/.test(p.querySelector('[data-testid="plan-cap"]')?.textContent ?? ''), 'the cap line')
    const start = buttonNamed(p, /^Start these 2/)!
    expect(start.disabled).toBe(false)
    await click(start)
    await until(() => calls.some((c) => c.url === '/api/tasks/task_plan'), 'the answer POST')
    const post = calls.find((c) => c.url === '/api/tasks/task_plan')!
    expect(post.method).toBe('POST')
    const body = post.body as { question_answer_json: Record<string, unknown> }
    expect(Object.keys(body)).toEqual(['question_answer_json'])
    expect(body.question_answer_json).toMatchObject({
      v: 1, choice: 'start', via: 'hub',
      picks: [
        { task_id: 'task_a', option_key: 'a1', text: null, start: true },
        { task_id: 'task_b', option_key: null, text: 'Ask Casey which cut he used', start: true },
      ],
    })
    await until(() => !panel(), 'the panel to close')
  })

  it('Start is off when the picks pass what is left; Save still posts start:false', async () => {
    const calls = stubFetch({ used: 2, cap: 3 })
    await mount(<QuestionsCard tasks={[row()]} band={false} />)
    const p = await walkToConfirm(['Answer Jane', 'K23 report'])
    await click(buttonNamed(p, /^Next/))
    await until(() => /1 left today/.test(p.textContent ?? ''), 'the cap line')
    expect(p.textContent).toContain('pick fewer')
    expect(buttonNamed(p, /^Start these 2/)!.disabled).toBe(true)
    await click(buttonNamed(p, /Save without starting/))
    await until(() => calls.some((c) => c.url === '/api/tasks/task_plan'), 'the save POST')
    const a = (calls.find((c) => c.url === '/api/tasks/task_plan')!.body as { question_answer_json: { choice: string; picks: { start: boolean }[] } }).question_answer_json
    expect(a.choice).toBe('save')
    expect(a.picks.every((x) => x.start === false)).toBe(true)
  })

  it('a daily_cap 409 is shown, and the panel stays open with the draft', async () => {
    stubFetch({ used: 0, cap: 3 }, () => new Response(JSON.stringify({ error: 'cap', code: 'daily_cap', used: 3, cap: 3 }), { status: 409 }))
    await mount(<QuestionsCard tasks={[row()]} band={false} />)
    const p = await walkToConfirm(['Answer Jane'])
    await click(buttonNamed(p, /^Next/))
    await until(() => !buttonNamed(p, /^Start this one/)!.disabled, 'Start enabled')
    await click(buttonNamed(p, /^Start this one/))
    await until(() => !!p.querySelector('[role="alert"]'), 'the cap message')
    expect(p.querySelector('[role="alert"]')!.textContent).toMatch(/Today's 3 are already used or queued \(3\)/)
    expect(panel()).not.toBeNull()
  })

  it('a week_plan_superseded refusal says a newer plan was offered', async () => {
    stubFetch({ used: 0, cap: 3 }, () => new Response(JSON.stringify({
      error: 'week_plan_superseded: a newer week plan was offered; answer that one', code: 'question_rule',
    }), { status: 409 }))
    await mount(<QuestionsCard tasks={[row()]} band={false} />)
    const p = await walkToConfirm(['Answer Jane'])
    await click(buttonNamed(p, /^Next/))
    await click(buttonNamed(p, /Save without starting/))
    await until(() => !!p.querySelector('[role="alert"]'), 'the refusal')
    expect(p.querySelector('[role="alert"]')!.textContent).toBe('A newer plan was offered. Answer that one in Needs you.')
  })

  // The Worker's words for each refusal (api/routes/tasks.ts handleUpdateTask:
  // a mutation refusal is a 409 whose error carries the reason; a deleted row
  // is a 404 at guardTaskProject). Plain words, never the raw reason.
  const refusals: Array<[string, () => Response, string]> = [
    ['an expired offer', () => new Response(JSON.stringify({
      error: 'mutation rejected: error — apply error: question_expired: this week plan expired at 2026-11-02T06:00:00Z; press Re-plan or wait for Sunday\'s',
    }), { status: 409 }), 'This plan was for a week that is over. Press Re-plan or wait for Sunday\'s.'],
    ['a deleted offer', () => new Response(JSON.stringify({ error: 'Task not found' }), { status: 404 }),
      'This plan was replaced. Answer the current one in Needs you.'],
  ]
  for (const [what, reply, words] of refusals) {
    it(`${what} is refused in plain words`, async () => {
      stubFetch({ used: 0, cap: 3 }, reply)
      await mount(<QuestionsCard tasks={[row()]} band={false} />)
      const p = await walkToConfirm(['Answer Jane'])
      await click(buttonNamed(p, /^Next/))
      await click(buttonNamed(p, /Save without starting/))
      await until(() => !!p.querySelector('[role="alert"]'), 'the refusal')
      expect(p.querySelector('[role="alert"]')!.textContent).toBe(words)
    })
  }

  it('closing writes nothing', async () => {
    const calls = stubFetch({ used: 0, cap: 3 })
    await mount(<QuestionsCard tasks={[row()]} band={false} />)
    await walkToConfirm(['Answer Jane'])
    await click(document.querySelector('[data-testid="plan-backdrop"]'))
    expect(panel()).toBeNull()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
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

  it('Needs you counts at most one waiting week plan', () => {
    expect(cardQuestionCount([row({ id: 'w1' }), row({ id: 'w2', created_at: '2026-10-26T21:00:00Z' })])).toBe(1)
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

describe('Re-plan', () => {
  const state = (planned: Record<string, { slot: string }>): TodayStateApi => ({
    planned, done: {}, plannedIds: () => Object.keys(planned),
    markDone: () => {}, uncheck: () => {}, planAt: () => {}, unplan: () => {},
  } as unknown as TodayStateApi)
  const rs = (o: Partial<ReplanState>): ReplanState => ({ id: 'r1', status: 'pending', claimed: false, response: null, age_s: 5, ...o })
  const stored = () => currentWeekPlan([answered([{ task_id: 'task_a', option_key: 'a2', text: null, start: true }])], '2026-10-28')!

  it('replanButtonState: every state is pressable or disabled with its reason', () => {
    expect(replanButtonState(undefined, false)).toMatchObject({ kind: 'unknown', enabled: false })
    expect(replanButtonState(undefined, false, true).note).toMatch(/Could not read/)
    expect(replanButtonState(null, false)).toMatchObject({ kind: 'ready', enabled: true, note: null })
    expect(replanButtonState(rs({}), false)).toMatchObject({ kind: 'queued', enabled: false, stuck: false })
    // Never claimed past the Worker's limit: pressable again (the press
    // replaces the stale row), so an old listener cannot trap the button.
    expect(replanButtonState(rs({ age_s: REPLAN_UNCLAIMED_WARN_S }), false)).toMatchObject({ kind: 'queued', enabled: true, label: 'Try again', stuck: true, note: expect.stringMatching(/not picked this up/) })
    expect(replanButtonState(rs({ age_s: REPLAN_UNCLAIMED_WARN_S - 1 }), false)).toMatchObject({ kind: 'queued', enabled: false })
    expect(replanButtonState(rs({ claimed: true }), true)).toMatchObject({ kind: 'preparing', enabled: false })
    // A waiting offer does not lock the button: a new run supersedes it.
    expect(replanButtonState(rs({ status: 'completed', response: 'Offered a new plan ...' }), true)).toMatchObject({ kind: 'ready', enabled: true, note: expect.stringMatching(/waiting in Needs you/) })
    expect(replanButtonState(rs({ status: 'failed', response: 'lease expired' }), false)).toMatchObject({ kind: 'ready', enabled: true, failed: true, note: 'Not re-planned: lease expired' })
    expect(replanButtonState(rs({ status: 'completed', response: 'Nothing open to re-plan for the week of 2026-10-26.' }), false).note).toMatch(/Nothing open/)
    expect(replanButtonState(rs({ status: 'completed', response: 'Offered a new plan (3 tasks): q1' }), false).note).toBeNull()
    expect(replanButtonState(rs({ status: 'failed', response: 'x', age_s: REPLAN_RESULT_SHOWN_S + 1 }), false).note).toBeNull()
  })

  it('press: POSTs the route, then the re-read state shows Queued and disabled', async () => {
    let latest: ReplanState | null = null
    const calls = stubFetch({ used: 0, cap: 3 }, undefined, {
      get: () => new Response(JSON.stringify({ data: latest }), { status: 200 }),
      post: () => { latest = rs({}); return new Response(JSON.stringify({ data: latest }), { status: 201 }) },
    })
    const host = await mount(<ThisWeekSection plan={stored()} allTasks={[task('task_a')]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    const btn = () => host.querySelector('[data-testid="replan"]') as HTMLButtonElement
    await until(() => btn()?.dataset.state === 'ready', 'Re-plan ready')
    expect(btn().disabled).toBe(false)
    await click(btn())
    await until(() => calls.some((c) => c.url === '/api/week-plan/replan' && c.method === 'POST'), 'the press')
    await until(() => btn().dataset.state === 'queued', 'Queued')
    expect(btn().disabled).toBe(true)
    expect(btn().textContent).toBe('Queued')
  })

  it('a 409 replan_pending shows no error; the state re-read says Queued', async () => {
    let latest: ReplanState | null = null
    stubFetch({ used: 0, cap: 3 }, undefined, {
      get: () => new Response(JSON.stringify({ data: latest }), { status: 200 }),
      post: () => { latest = rs({ claimed: true }); return new Response(JSON.stringify({ error: 'queued', code: 'replan_pending', id: 'r1' }), { status: 409 }) },
    })
    const host = await mount(<ThisWeekSection plan={stored()} allTasks={[task('task_a')]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    const btn = () => host.querySelector('[data-testid="replan"]') as HTMLButtonElement
    await until(() => btn()?.dataset.state === 'ready', 'ready')
    await click(btn())
    await until(() => btn().dataset.state === 'preparing', 'Preparing')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('a refused press never leaves the button pressable: disabled, with the reason, until the row changes', async () => {
    // The refuter's dead button: the state reads Try again, but the press is
    // refused and the row does not change. Before, the 409 was swallowed and
    // the button stayed enabled.
    const latest = rs({ age_s: REPLAN_UNCLAIMED_WARN_S + 5 })
    let status = 409
    stubFetch({ used: 0, cap: 3 }, undefined, {
      get: () => new Response(JSON.stringify({ data: latest }), { status: 200 }),
      post: () => new Response(JSON.stringify(status === 409 ? { error: 'queued', code: 'replan_pending', id: 'r1' } : { error: 'boom' }), { status }),
    })
    const host = await mount(<ThisWeekSection plan={stored()} allTasks={[task('task_a')]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    const btn = () => host.querySelector('[data-testid="replan"]') as HTMLButtonElement
    await until(() => btn()?.textContent === 'Try again' && !btn().disabled, 'Try again')
    await click(btn())
    await until(() => btn().dataset.state === 'refused', 'refused')
    expect(btn().disabled).toBe(true)
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/already queued or running/)

    status = 500
    const host2 = await mount(<ThisWeekSection plan={stored()} allTasks={[task('task_a')]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    const btn2 = () => host2.querySelector('[data-testid="replan"]') as HTMLButtonElement
    await until(() => btn2()?.textContent === 'Try again' && !btn2().disabled, 'Try again (2)')
    await click(btn2())
    await until(() => btn2().dataset.state === 'refused', 'refused (2)')
    expect(btn2().disabled).toBe(true)
    expect(host2.querySelector('[role="alert"]')?.textContent).toMatch(/^Not re-planned: /)
  })

  it('Planned today (no answered plan) carries the same Re-plan button for Nick, and none for a member', async () => {
    const calls = stubFetch({ used: 0, cap: 3 })
    const nick = await mount(<PlannedTodaySection stripTasks={[]} state={state({})} projectsByPid={new Map()} replanTasks={[task('task_a')]} />)
    const btn = () => nick.querySelector('[data-testid="replan"]') as HTMLButtonElement
    await until(() => btn()?.dataset.state === 'ready', 'Re-plan ready in Planned today')
    expect(btn().disabled).toBe(false)
    expect(btn().textContent).toBe(replanButtonState(null, false).label)
    const before = calls.filter((c) => c.url.startsWith('/api/week-plan/replan')).length
    const member = await mount(<PlannedTodaySection stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    await tick(); await tick()
    expect(member.querySelector('[data-testid="replan"]')).toBeNull()
    expect(calls.filter((c) => c.url.startsWith('/api/week-plan/replan')).length).toBe(before)
  })

  it('a member (403) sees no Re-plan button', async () => {
    stubFetch({ used: 0, cap: 3 }, undefined, { get: () => new Response('{}', { status: 403 }) })
    const host = await mount(<ThisWeekSection plan={stored()} allTasks={[task('task_a')]} stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    await tick(); await tick()
    expect(host.querySelector('[data-testid="replan"]')).toBeNull()
  })

  it('currentWeekPlan carries earlier started or done picks of the same week, read-only, tagged', async () => {
    const SPEC2 = { ...SPEC, candidates: [...SPEC.candidates, { task_id: 'task_d', title: 'Old done', why: '', evidence: [], options: [opt('d1', true), opt('d2')] }] }
    const older = row({
      id: 'p_old', question_spec_json: JSON.stringify(SPEC2),
      question_answer_json: JSON.stringify({ v: 1, choice: 'start', via: 'hub', at: '2026-10-26T14:00:00Z', picks: [
        { task_id: 'task_a', option_key: 'a1', text: null, start: true }, // started: carried
        { task_id: 'task_c', option_key: 'c1', text: null, start: false }, // saved, not done: re-offered, not carried
        { task_id: 'task_d', option_key: 'd1', text: null, start: false }, // saved but done: carried
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
    expect(plan.earlier.map((e) => [e.pick.task_id, e.task.id])).toEqual([['task_a', 'p_old'], ['task_d', 'p_old']])

    stubFetch({ used: 0, cap: 3 })
    const host = await mount(<ThisWeekSection plan={plan} allTasks={all} stripTasks={[]} state={state({})} projectsByPid={new Map()} />)
    const rows = [...host.querySelectorAll('[data-testid="this-week-earlier"]')]
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.querySelector('[data-testid="earlier-tag"]')?.textContent === 'earlier plan')).toBe(true)
    expect(rows.every((r) => r.querySelector('[data-testid="pick-start"]') === null)).toBe(true)
    expect(rows[0].textContent).toContain('Direction a1') // its own plan's direction
    expect(rows[1].textContent).toContain('Done')
    // The newer plan's saved pick still has Start, against the NEWER plan.
    expect(host.querySelectorAll('[data-testid="pick-start"]')).toHaveLength(1)
    expect(host.querySelector('.tk-cnt')?.textContent).toBe('3')
  })

  it('newestWaitingWeekPlan: only the newest offer counts, and only while it waits', () => {
    const w1 = row({ id: 'w1', created_at: '2026-10-25T21:00:00Z' })
    const w2 = row({ id: 'w2', created_at: '2026-10-28T15:00:00Z' })
    expect(newestWaitingWeekPlan([w1, w2])?.id).toBe('w2')
    // The older still waits but a newer one is answered: nothing asks.
    const a2 = { ...answered([{ task_id: 'task_a', option_key: 'a1', text: null, start: false }]), id: 'w2', created_at: '2026-10-28T15:00:00Z' }
    expect(newestWaitingWeekPlan([w1, a2])).toBeNull()
    expect(cardQuestionCount([w1, a2])).toBe(0)
    // Same created_at: the id breaks the tie, as PB's offer_order does.
    const t1 = row({ id: 'task_x1', created_at: '2026-10-28T15:00:00Z' })
    const t2 = row({ id: 'task_x2', created_at: '2026-10-28T15:00:00Z' })
    expect(newestWaitingWeekPlan([t2, t1])?.id).toBe('task_x2')
    // A deleted offer never counts.
    expect(newestWaitingWeekPlan([w1, { ...w2, status: 'deleted' }])?.id).toBe('w1')
  })

  it('newestWaitingWeekPlan is per week: an older week\'s later offer neither hides nor joins the newest week\'s', () => {
    const wk = (id: string, week: string, created_at: string) =>
      row({ id, created_at, question_spec_json: JSON.stringify({ ...SPEC, week_start: week }) })
    const next = wk('n1', '2026-11-02', '2026-11-01T22:03:11Z')
    // A Saturday press claimed late mints an offer for the ending week AFTER
    // next week's Sunday offer: it must not hide next week's.
    const late = wk('o9', '2026-10-26', '2026-11-01T23:00:00Z')
    expect(newestWaitingWeekPlan([next, late])?.id).toBe('n1')
    expect(cardQuestionCount([next, late])).toBe(1)
    // Next week's offer answered: the ending week's still waits, and shows.
    const nextDone = { ...next, question_answer_json: JSON.stringify({ v: 1, choice: 'save', via: 'hub', at: '2026-11-01T23:10:00Z', picks: [] }) }
    expect(newestWaitingWeekPlan([nextDone, late])?.id).toBe('o9')
  })

  it('an expired offer never asks: an ignored offer for last week does not come back once this week is answered', () => {
    // Second refuter (2026-11-01). Sunday 11-01 mints B (week 11-02), Nick
    // ignores it; Sunday 11-08 mints C (week 11-09); Nick answers C.
    const wk = (id: string, week: string, expires_at: string, created_at: string) =>
      row({ id, created_at, question_spec_json: JSON.stringify({ ...SPEC, week_start: week, expires_at }) })
    const B = wk('task_B', '2026-11-02', '2026-11-09T06:00:00Z', '2026-11-01T22:03:11Z')
    const C = wk('task_C', '2026-11-09', '2026-11-16T06:00:00Z', '2026-11-08T22:03:11Z')
    // Tuesday of C's week: B's week ended Monday 00:00 Central.
    const now = '2026-11-10T15:00:00Z'
    expect(newestWaitingWeekPlan([B, C], now)?.id).toBe('task_C')
    const Cans = { ...C, question_answer_json: JSON.stringify({ v: 1, choice: 'save', via: 'hub', at: '2026-11-08T23:00:00Z', picks: [] }) }
    expect(newestWaitingWeekPlan([B, Cans], now)).toBeNull()
    expect(cardQuestionCount([B, Cans], now)).toBe(0)
    // Before its expiry B still asks (the instant the Worker judges by).
    expect(newestWaitingWeekPlan([B, Cans], '2026-11-09T05:59:59Z')?.id).toBe('task_B')
    // Through the default clock too: QuestionsCard and ReplanControl pass none.
    vi.setSystemTime(new Date(now))
    expect(newestWaitingWeekPlan([B, Cans])).toBeNull()
    expect(cardQuestionCount([B, Cans])).toBe(0)
  })
})

describe('The week plan at its expiry instant (useWeekPlanNow)', () => {
  // A tab left open across Monday 00:00 Central: no refetch, no data change.
  // The row and the count must drop when the Worker starts refusing the offer.
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

  it('the gold row and the count drop just past expires_at, with no data change', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-02T05:59:00Z')) // Sunday 23:59 CST
    stubFetch({ used: 0, cap: 3 })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    mounted.push({ host, root })
    const tasks = [row()]
    root.render(
      <QueryClientProvider client={qc}><MemoryRouter><UndoToastProvider><Bits tasks={tasks} /></UndoToastProvider></MemoryRouter></QueryClientProvider>,
    )
    await flush()
    expect(host.querySelector('[data-testid="q-week-plan"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="count"]')!.textContent).toBe('1')

    await vi.advanceTimersByTimeAsync(60_000) // exactly 06:00:00Z: the Worker still takes it
    await flush()
    expect(host.querySelector('[data-testid="q-week-plan"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="count"]')!.textContent).toBe('1')

    await vi.advanceTimersByTimeAsync(5)
    await flush()
    expect(host.querySelector('[data-testid="q-week-plan"]')).toBeNull()
    expect(host.querySelector('[data-testid="count"]')!.textContent).toBe('0')
  })

  it('nextWeekPlanExpiry: the earliest live expiry still ahead, +1 ms', () => {
    const at = (id: string, expires_at: string, extra: Partial<TaskRow> = {}) =>
      row({ id, question_spec_json: JSON.stringify({ ...SPEC, expires_at }), ...extra })
    const now = '2026-11-01T18:00:00Z'
    const a = at('a', '2026-11-02T06:00:00Z')
    const b = at('b', '2026-11-09T06:00:00Z')
    expect(nextWeekPlanExpiry([b, a], now)).toBe(Date.parse('2026-11-02T06:00:00Z') + 1)
    expect(nextWeekPlanExpiry([at('old', '2026-10-26T05:00:00Z'), b], now)).toBe(Date.parse('2026-11-09T06:00:00Z') + 1)
    expect(nextWeekPlanExpiry([{ ...a, status: 'deleted' }], now)).toBeNull()
    expect(nextWeekPlanExpiry([task('t')], now)).toBeNull()
  })
})

describe('Newest per week reads every live offer', () => {
  // The Worker's NEWER_OFFER_EXISTS_SQL counts every live offer of the week,
  // so the card must too: a snoozed or acted-on newest must never let an
  // older offer of its week through (it would be refused as superseded).
  const older = row({ id: 'w1', created_at: '2026-10-25T21:00:00Z' })
  const today = '2026-11-01'

  it('isQuestionOnCard hands over every live week_plan offer, whatever its state', () => {
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

  it('a snoozed newest asks nothing and does not let the older offer through', () => {
    const spec = JSON.stringify({ ...SPEC, expires_at: '2026-11-09T06:00:00Z' })
    const old = { ...older, question_spec_json: spec }
    const snoozed = row({ id: 'w2', created_at: '2026-10-28T15:00:00Z', due_date: '2026-11-05', question_spec_json: spec })
    expect(newestWaitingWeekPlan([old, snoozed])).toBeNull()
    expect(cardQuestionCount([old, snoozed])).toBe(0)
    // Back on its day: the newest asks again.
    expect(newestWaitingWeekPlan([old, snoozed], '2026-11-05T15:00:00Z')?.id).toBe('w2')
  })
})

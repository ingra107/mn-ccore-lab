// The planning conversation, browser side (PB decision
// 2026-10-30-planning-conversation.md): the gold "Plan your week" row, the
// three-step conversation, the answer it posts, the cap, and This week.
//
// Runs in real Chromium (vitest.config.ts browser mode), mounted with
// react-dom directly like QuestionsCard.test.tsx. fetch is stubbed, so the
// test reads the exact request body the Worker would receive.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DndContext } from '@dnd-kit/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UndoToastProvider } from '../UndoToast'
import { QuestionsCard } from '../tasks/QuestionsCard'
import { ThisWeekSection } from './ThisWeekSection'
import { currentWeekPlan, pickTag } from '../../lib/weekPlan'
import { cardQuestionCount } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'
import type { TodayStateApi } from '../../hooks/useTodayState'

let mounted: { host: HTMLElement; root: Root }[] = []
afterEach(() => {
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
  prompt: 'What do you want to take the next step on this week?', expires_at: '2026-11-02T05:00:00Z',
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
function stubFetch(count: { used: number; cap: number } | 'fail', answer: (body: unknown) => Response = () => new Response('{}', { status: 200 })) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method: init?.method ?? 'GET', body })
    if (url.startsWith('/api/packets/daily-count')) {
      return count === 'fail' ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ date: '2026-10-28', ...count }), { status: 200 })
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
    const replan = buttonNamed(host, /Re-plan/)!
    expect(replan.disabled).toBe(true)
    expect(replan.title).toMatch(/Sunday/)
  })

  it('pickTag: Preparing for a started pick with no packet yet; Done wins', () => {
    expect(pickTag(task('a'), true)?.label).toBe('Preparing')
    expect(pickTag(undefined, false)?.label).toBe('Saved')
    expect(pickTag(task('a', { status: 'done', completed: 1, packet_state: 'ready' }), true)?.label).toBe('Done')
  })
})

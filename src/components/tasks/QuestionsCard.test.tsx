// QuestionsCard — renders choices, gates Submit until a choice is picked
// (and text, for "other"), and posts the answer with NO status field.
//
// Runs in real Chromium (vitest.config.ts browser mode). Mounts with
// react-dom directly — the repo carries no testing-library (same pattern as
// src/__tests__/project-update-error-surfaces.test.tsx).

import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UndoToastProvider } from '../UndoToast'
import { QuestionsCard } from './QuestionsCard'
import { nowInstant } from '../../lib/time'
import { civilDatePlusDays, todayKey } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'

let mounted: { host: HTMLElement; root: Root }[] = []

afterEach(() => {
  for (const { host, root } of mounted) {
    root.unmount()
    host.remove()
  }
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

const SPEC = {
  v: 1,
  kind: 'meeting_match',
  prompt: 'Which meeting was this?',
  choices: [
    { key: 'c1', label: 'Pulmonary HSR Group Meeting' },
    { key: 'other', label: 'Other' },
  ],
  rec: 'c1',
  allow_text: true,
}

function makeQuestionTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 't1',
    meeting_id: null,
    project_id: null,
    title: '[needs calendar match -- action items not extracted]',
    description: '',
    assignee: 'nick-ingraham',
    assigned_by: null,
    due_date: null,
    priority: 'medium',
    status: 'todo',
    source: 'meeting_match',
    completed: 0,
    completed_at: null,
    completed_by: null,
    blocked_by: null,
    acknowledged_at: null,
    acknowledged_by: null,
    watchers: null,
    reminder_days: null,
    instructions: null,
    recurrence: null,
    recurrence_parent_id: null,
    description_json: null,
    key_link_1: null,
    key_link_1_desc: null,
    key_link_2: null,
    key_link_2_desc: null,
    key_link_3: null,
    key_link_3_desc: null,
    created_at: '2026-09-17T17:04:06Z',
    kind: 'question',
    question_spec_json: JSON.stringify(SPEC),
    question_answer_json: null,
    question_telegram_json: null,
    ...overrides,
  } as TaskRow
}

function mountCard(tasks: TaskRow[], snoozed: TaskRow[] = []): { host: HTMLElement; queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData<TaskRow[]>(['tasks'], tasks)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    <QueryClientProvider client={queryClient}>
      <UndoToastProvider>
        <QuestionsCard tasks={tasks} snoozed={snoozed} />
      </UndoToastProvider>
    </QueryClientProvider>,
  )
  mounted.push({ host, root })
  return { host, queryClient }
}

describe('QuestionsCard', () => {
  it('renders null for an empty task list', () => {
    const { host } = mountCard([])
    expect(host.textContent).toBe('')
  })

  it('renders the prompt and one button per choice, recommendation marked', async () => {
    const { host } = mountCard([makeQuestionTask()])
    await until(() => host.querySelector('[data-testid="q-choice-c1"]') != null, 'choice buttons')
    expect(host.textContent).toContain('Which meeting was this?')
    expect(host.querySelector('[data-testid="q-choice-c1"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="q-choice-other"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="q-choice-c1"]')!.textContent).toContain('rec')
  })

  it('shows a fallback row instead of crashing on a malformed spec', async () => {
    const { host } = mountCard([makeQuestionTask({ question_spec_json: '{not json' })])
    await until(() => host.textContent !== '', 'fallback row')
    expect(host.textContent).toContain('Malformed question')
  })

  it('disables Submit until a choice is picked', async () => {
    const { host } = mountCard([makeQuestionTask()])
    await until(() => host.querySelector('[data-testid="q-submit"]') != null, 'submit button')
    const submit = host.querySelector('[data-testid="q-submit"]') as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    ;(host.querySelector('[data-testid="q-choice-c1"]') as HTMLButtonElement).click()
    await until(() => !(host.querySelector('[data-testid="q-submit"]') as HTMLButtonElement).disabled, 'submit enabled')
  })

  it('requires text for the "other" choice before Submit enables', async () => {
    const { host } = mountCard([makeQuestionTask()])
    await until(() => host.querySelector('[data-testid="q-choice-other"]') != null, 'other button')
    ;(host.querySelector('[data-testid="q-choice-other"]') as HTMLButtonElement).click()
    await until(() => host.querySelector('[data-testid="q-note"]') != null, 'note textarea')

    const submit = host.querySelector('[data-testid="q-submit"]') as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    const textarea = host.querySelector('[data-testid="q-note"]') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(textarea, 'It was the Pulmonary HSR Group Meeting')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await until(() => !(host.querySelector('[data-testid="q-submit"]') as HTMLButtonElement).disabled, 'submit enabled after text')
  })

  it('keeps an answered, unacted question on the card with its answer and age, and no way to clear it', async () => {
    const at = new Date(Date.now() - 10 * 86400000).toISOString()
    const { host } = mountCard([
      makeQuestionTask({ id: 'q-wait' }),
      makeQuestionTask({ id: 'q-ans', question_answer_json: JSON.stringify({ v: 1, choice: 'c1', via: 'hub', at }) }),
    ])
    await until(() => host.querySelector('[data-testid="q-answered-q-ans"]') != null, 'answered row')
    const row = host.querySelector('[data-testid="q-answered-q-ans"]')!
    expect(host.textContent).toContain('Answered, not acted on yet')
    expect(row.textContent).toContain('You answered “Pulmonary HSR Group Meeting”')
    expect(row.querySelector('[data-testid="q-answered-age"]')!.textContent).toBe('10 days ago')
    // Clearing an answer a consumer may already be acting on reopens the
    // question and invites a second effect, so the answered row has no button
    // that touches the answer: its only buttons are the three snoozes.
    expect([...row.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['For today', '3 days', 'Next week'])
    // The count is the waiting rows only: the answered one is not his turn.
    expect(host.querySelector('.tk-cnt')!.textContent).toBe('1')
  })

  it('lists a row acted on today as one dim line beside a live question', async () => {
    const answer = { v: 1, choice: 'c1', via: 'hub', at: '2026-10-22T10:00:00Z' }
    const { host } = mountCard([
      makeQuestionTask({ id: 'q-wait' }),
      makeQuestionTask({
        id: 'q-done',
        status: 'done',
        question_answer_json: JSON.stringify(answer),
        question_consumed_json: JSON.stringify({ v: 1, consumer: 'meeting_match', at: nowInstant(), answer_at: answer.at, evidence: 'linked' }),
      }),
    ])
    await until(() => host.querySelector('[data-testid="q-acted"]') != null, 'acted line')
    expect(host.querySelector('[data-testid="q-acted"]')!.textContent).toBe('Acted on today · Which meeting was this?')
    expect(host.querySelectorAll('[data-testid="q-submit"]').length).toBe(1)
  })

  it('renders nothing when the only rows were acted on', async () => {
    const answer = { v: 1, choice: 'c1', via: 'hub', at: '2026-10-22T10:00:00Z' }
    const { host } = mountCard([makeQuestionTask({
      status: 'done',
      question_answer_json: JSON.stringify(answer),
      question_consumed_json: JSON.stringify({ v: 1, consumer: 'meeting_match', at: nowInstant(), answer_at: answer.at, evidence: 'linked' }),
    })])
    await new Promise((r) => setTimeout(r, 30))
    expect(host.querySelector('[aria-label="Needs you"]')).toBeNull()
    expect(host.textContent).not.toContain('Acted on today')
  })

  it('submits the answer object with no status field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ...makeQuestionTask(), question_answer_json: '{}' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { host } = mountCard([makeQuestionTask()])
    await until(() => host.querySelector('[data-testid="q-choice-c1"]') != null, 'choice button')
    ;(host.querySelector('[data-testid="q-choice-c1"]') as HTMLButtonElement).click()
    await until(() => !(host.querySelector('[data-testid="q-submit"]') as HTMLButtonElement).disabled, 'submit enabled')
    ;(host.querySelector('[data-testid="q-submit"]') as HTMLButtonElement).click()

    await until(() => fetchMock.mock.calls.length > 0, 'POST')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/tasks/t1')
    const body = JSON.parse(init.body as string)
    expect(body).toHaveProperty('question_answer_json')
    expect(body.question_answer_json.choice).toBe('c1')
    expect(body.question_answer_json.via).toBe('hub')
    expect(body).not.toHaveProperty('status')
  })
})

describe('QuestionsCard snooze', () => {
  const okFetch = () => vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: makeQuestionTask() }),
  })
  const bodies = (f: ReturnType<typeof vi.fn>) =>
    f.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string))

  it('a snooze writes due_date only (never an answer or a status), and Undo restores the old date', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { host } = mountCard([makeQuestionTask({ due_date: '2026-10-01' })])
    await until(() => host.querySelector('[data-testid="q-snooze-3"]') != null, 'snooze links')
    ;(host.querySelector('[data-testid="q-snooze-3"]') as HTMLButtonElement).click()
    await until(() => fetchMock.mock.calls.length > 0, 'snooze POST')
    expect(bodies(fetchMock)[0]).toEqual({ due_date: civilDatePlusDays(todayKey(), 3) })

    const undo = await (async () => {
      for (let i = 0; i < 200; i++) {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Undo')
        if (b) return b as HTMLButtonElement
        await new Promise((r) => setTimeout(r, 10))
      }
      throw new Error('no Undo button')
    })()
    undo.click()
    await until(() => fetchMock.mock.calls.length > 1, 'undo POST')
    expect(bodies(fetchMock)[1]).toEqual({ due_date: '2026-10-01' })
  })

  it('a declared "Not yet" choice snoozes for its days instead of answering', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    const spec = {
      ...SPEC,
      choices: [
        { key: 'o1', label: 'I ran it' },
        { key: 'o2', label: 'Not yet', payload: { snooze_days: 3 } },
        { key: 'other', label: 'Other' },
      ],
      rec: 'o1',
    }
    const { host } = mountCard([makeQuestionTask({ question_spec_json: JSON.stringify(spec) })])
    await until(() => host.querySelector('[data-testid="q-choice-o2"]') != null, 'choice')
    ;(host.querySelector('[data-testid="q-choice-o2"]') as HTMLButtonElement).click()
    await until(() => host.querySelector('[data-testid="q-submit"]')!.textContent === 'Snooze 3 days', 'snooze label')
    ;(host.querySelector('[data-testid="q-submit"]') as HTMLButtonElement).click()
    await until(() => fetchMock.mock.calls.length > 0, 'POST')
    const body = bodies(fetchMock)[0]
    expect(body).toEqual({ due_date: civilDatePlusDays(todayKey(), 3) })
    expect(body).not.toHaveProperty('question_answer_json')
  })

  it('says how many are snoozed and when the next comes back', async () => {
    const tomorrow = civilDatePlusDays(todayKey(), 1)
    const { host } = mountCard(
      [makeQuestionTask({ id: 'q-wait' })],
      [makeQuestionTask({ id: 'q-s1', due_date: civilDatePlusDays(todayKey(), 5) }), makeQuestionTask({ id: 'q-s2', due_date: tomorrow })],
    )
    await until(() => host.querySelector('[data-testid="q-snoozed"]') != null, 'snoozed line')
    expect(host.querySelector('[data-testid="q-snoozed"]')!.textContent).toBe('2 snoozed · next back tomorrow')
    // Snoozed rows stay folded until the line is opened.
    expect(host.querySelectorAll('[data-testid="q-submit"]').length).toBe(1)
  })

  it('#149: opening the snoozed line lists them, soonest first, answerable', async () => {
    const tomorrow = civilDatePlusDays(todayKey(), 1)
    const { host } = mountCard(
      [makeQuestionTask({ id: 'q-wait' })],
      [makeQuestionTask({ id: 'q-s1', due_date: civilDatePlusDays(todayKey(), 5) }), makeQuestionTask({ id: 'q-s2', due_date: tomorrow })],
    )
    await until(() => host.querySelector('[data-testid="q-snoozed"]') != null, 'snoozed line')
    ;(host.querySelector('[data-testid="q-snoozed"]') as HTMLButtonElement).click()
    await until(() => host.querySelector('[data-testid="q-snoozed-list"]') != null, 'snoozed list')
    const ids = [...host.querySelectorAll('[data-testid^="q-snoozed-q-"]')].map((el) => el.getAttribute('data-testid'))
    expect(ids).toEqual(['q-snoozed-q-s2', 'q-snoozed-q-s1'])
    expect(host.querySelectorAll('[data-testid="q-submit"]').length).toBe(3)
  })

  it('#149: Bring back now writes due_date = today and nothing else', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { host } = mountCard(
      [makeQuestionTask({ id: 'q-wait' })],
      [makeQuestionTask({ id: 'q-s1', due_date: civilDatePlusDays(todayKey(), 5) })],
    )
    await until(() => host.querySelector('[data-testid="q-snoozed"]') != null, 'snoozed line')
    ;(host.querySelector('[data-testid="q-snoozed"]') as HTMLButtonElement).click()
    await until(() => host.querySelector('[data-testid="q-unsnooze-q-s1"]') != null, 'bring back')
    ;(host.querySelector('[data-testid="q-unsnooze-q-s1"]') as HTMLButtonElement).click()
    await until(() => fetchMock.mock.calls.length > 0, 'POST')
    expect(bodies(fetchMock)[0]).toEqual({ due_date: todayKey() })
  })

  it('snoozed rows alone do not show the card', async () => {
    const { host } = mountCard([], [makeQuestionTask({ due_date: civilDatePlusDays(todayKey(), 2) })])
    await new Promise((r) => setTimeout(r, 30))
    expect(host.querySelector('[aria-label="Needs you"]')).toBeNull()
  })
})

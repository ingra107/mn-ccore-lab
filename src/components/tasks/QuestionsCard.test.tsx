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

function mountCard(tasks: TaskRow[]): { host: HTMLElement; queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData<TaskRow[]>(['tasks'], tasks)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    <QueryClientProvider client={queryClient}>
      <UndoToastProvider>
        <QuestionsCard tasks={tasks} />
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

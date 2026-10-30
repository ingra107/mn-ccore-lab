// Steps on Today (Nick's pick 2026-10-30, "B: next step only"). Runs in real
// Chromium (vitest browser mode). A parent is ONE card: the next open step with
// its own tick box, "n of N", "See all N steps"; all steps done -> a gold
// prompt that completes the parent. Steps are not rows of their own while their
// parent is on the page.
import { describe, it, expect, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TaskGroup } from './TaskGroup'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'
import { bumpParentStepDone, hideStepsOfPresentParents, openStepsByParent } from '../../lib/taskSteps'
import { waitFor } from '../../__tests__/testMount'

let mounted: { host: HTMLElement; root: Root }[] = []
afterEach(() => {
  mounted.forEach(({ host, root }) => { root.unmount(); host.remove() })
  mounted = []
})

const row = (id: string, over: Partial<TaskRow> = {}): TaskRow => ({
  id, name: id, title: id, status: 'todo', completed: 0, priority: 'medium', kind: 'task', ...over,
} as unknown as TaskRow)

// The real shape: CLIF 3.0 upgrade with four steps, three late, one due today.
const parent = (over: Partial<TaskRow> = {}) => row('p', { title: 'CLIF 3.0 upgrade', step_total: 4, step_done: 0, ...over })
const steps = (): TaskRow[] => [
  row('s4', { title: 'Review the 3.0 med CSV', parent_id: 'p', due_date: '2099-01-02', created_at: '2026-10-04' }),
  row('s2', { title: 'Shelter stable-vs-stable', parent_id: 'p', due_date: '2020-01-01', created_at: '2026-10-02' }),
  row('s1', { title: 'Upgrade to CLIFpy 3.0', parent_id: 'p', due_date: '2020-01-01', created_at: '2026-10-01' }),
  row('s3', { title: 'Backbone Git phase 2', parent_id: 'p', created_at: '2026-10-03' }),
]

function stateWith(calls: string[]): TodayStateApi {
  return {
    planned: {}, done: {}, plannedIds: () => [],
    markDone: (id: string) => { calls.push(id) },
    uncheck: () => {}, planAt: () => {}, unplan: () => {},
  } as unknown as TodayStateApi
}

async function mountUi(ui: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><div className="tk">{ui}</div></MemoryRouter>
    </QueryClientProvider>,
  )
  mounted.push({ host, root })
  await waitFor(() => host.querySelector('[data-task-id]'), 'task card')
  return host
}

const group = (p: TaskRow, all: TaskRow[], calls: string[] = []) =>
  <TaskGroup gkey="etl" tasks={[p]} projectsByPid={new Map()} state={stateWith(calls)} stepsByParent={openStepsByParent(all)} />

describe('step ordering', () => {
  it('picks earliest due date first, undated last, then oldest', () => {
    const list = openStepsByParent([parent(), ...steps()]).get('p')!
    expect(list.map((s) => s.id)).toEqual(['s1', 's2', 's4', 's3'])
  })

  it('leaves done and deleted steps out', () => {
    const all = [...steps(), row('d1', { parent_id: 'p', status: 'done', completed: 1 }), row('d2', { parent_id: 'p', status: 'deleted' })]
    expect(openStepsByParent(all).get('p')!.map((s) => s.id)).toEqual(['s1', 's2', 's4', 's3'])
  })
})

describe('steps stay off Today as rows when their parent is listed', () => {
  it('hides steps whose parent is in the list', () => {
    const out = hideStepsOfPresentParents([parent(), ...steps(), row('other')])
    expect(out.map((t) => t.id)).toEqual(['p', 'other'])
  })

  it('keeps a step whose parent is not in the list', () => {
    const out = hideStepsOfPresentParents([...steps(), row('other')])
    expect(out.map((t) => t.id)).toEqual(['s4', 's2', 's1', 's3', 'other'])
  })
})

describe('parent card', () => {
  it('shows the next step, "0 of 4", and a locked parent box', async () => {
    const p = parent()
    const h = await mountUi(group(p, [p, ...steps()]))
    const next = h.querySelector('[data-testid="steps-next"]')!
    expect(next.querySelector('.tk-next-t')!.textContent).toBe('Next: Upgrade to CLIFpy 3.0')
    expect(next.textContent).toContain('0 of 4')
    expect(next.textContent).toContain('See all 4 steps')
    expect(next.querySelectorAll('.tk-dots i.f').length).toBe(0)
    expect(next.querySelectorAll('.tk-dots i').length).toBe(4)
    // one card, steps are not their own rows
    expect(h.querySelectorAll('[data-task-id]').length).toBe(1)
    // the parent's own box is not offered while a step is open
    expect(h.querySelector('.tk-tch > button.tk-lock')).not.toBeNull()
  })

  it('rolls the next step up and counts it at "1 of 4"', async () => {
    const p = parent({ step_done: 1 })
    const all = [p, ...steps().filter((s) => s.id !== 's1')]
    const h = await mountUi(group(p, all))
    const next = h.querySelector('[data-testid="steps-next"]')!
    expect(next.querySelector('.tk-next-t')!.textContent).toBe('Next: Shelter stable-vs-stable')
    expect(next.textContent).toContain('1 of 4')
    expect(next.querySelectorAll('.tk-dots i.f').length).toBe(1)
  })

  it('ticking the next step completes that step through markDone', async () => {
    const calls: string[] = []
    const p = parent()
    const h = await mountUi(group(p, [p, ...steps()], calls))
    ;(h.querySelector('.tk-nxck') as HTMLButtonElement).click()
    expect(calls).toEqual(['s1'])
  })

  it('does not tick the parent when its locked box is clicked', async () => {
    const calls: string[] = []
    const p = parent()
    const h = await mountUi(group(p, [p, ...steps()], calls))
    ;(h.querySelector('.tk-tch > button.tk-lock') as HTMLButtonElement).click()
    expect(calls).toEqual([])
  })

  it('"See all 4 steps" opens the parent drawer (expands the card)', async () => {
    const p = parent()
    const h = await mountUi(group(p, [p, ...steps()]))
    const hdr = h.querySelector('.tk-tch')!
    expect(hdr.getAttribute('aria-expanded')).toBe('false')
    ;(h.querySelector('.tk-more') as HTMLButtonElement).click()
    await expect.poll(() => h.querySelector('.tk-tch')!.getAttribute('aria-expanded')).toBe('true')
  })

  it('every step done: the gold prompt completes the parent', async () => {
    const calls: string[] = []
    const p = parent({ step_done: 4 })
    const h = await mountUi(group(p, [p], calls))
    const ask = h.querySelector('[data-testid="steps-all-done"]')!
    expect(ask.querySelector('.tk-ask-t')!.textContent).toBe('All 4 steps done -- complete CLIF 3.0 upgrade')
    expect(h.querySelector('[data-testid="steps-next"]')).toBeNull()
    // the parent's own box is offered again
    expect(h.querySelector('.tk-tch > button.tk-lock')).toBeNull()
    ;(ask.querySelector('.tk-ask-go') as HTMLButtonElement).click()
    expect(calls).toEqual(['p'])
  })

  it('a task with no steps renders as before', async () => {
    const h = await mountUi(group(row('solo', { title: 'Solo task' }), [row('solo')]))
    expect(h.querySelector('[data-testid="steps-next"]')).toBeNull()
    expect(h.querySelector('.tk-lock')).toBeNull()
  })
})

describe('optimistic parent count', () => {
  it('completing a step moves its parent up by one, and reopening moves it back', () => {
    const all = [parent({ step_done: 1 }), ...steps()]
    const up = bumpParentStepDone(all, 's1', true)
    expect(up.find((t) => t.id === 'p')!.step_done).toBe(2)
    const back = bumpParentStepDone(up.map((t) => (t.id === 's1' ? { ...t, status: 'done', completed: 1 } : t)) as TaskRow[], 's1', false)
    expect(back.find((t) => t.id === 'p')!.step_done).toBe(1)
  })

  it('leaves a non-step, and a step already in that state, alone', () => {
    const all = [parent(), ...steps()]
    expect(bumpParentStepDone(all, 'p', true)).toBe(all)
    expect(bumpParentStepDone(all, 's1', false)).toBe(all)
  })

  it('never counts past the total', () => {
    const all = [parent({ step_done: 4 }), ...steps()]
    expect(bumpParentStepDone(all, 's1', true).find((t) => t.id === 'p')!.step_done).toBe(4)
  })
})

// #157: on the planned rows the duration floated with however many link icons a
// row had, so the column of "30m"s zigzagged. Rows with 0, 1 and 3 links, and a
// done row with no caret, must put the duration at the same x.

import '../index.css'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DndContext } from '@dnd-kit/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UndoToastProvider } from '../components/UndoToast'
import { PlannedTaskRow } from '../components/today/PlannedTaskRow'
import type { TaskRow } from '../lib/api'
import type { TodayStateApi } from '../hooks/useTodayState'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const row = (id: string, extra: Partial<TaskRow>): TaskRow => ({
  id, title: `Task ${id}`, status: 'todo', completed: 0, kind: 'task', project_id: null, ...extra,
} as TaskRow)
const url = (n: number) => `https://example.com/${n}`
const state = { done: {}, planned: {}, markDone: () => {}, uncheck: () => {}, unplan: () => {} } as unknown as TodayStateApi

describe('planned row duration column (#157)', () => {
  it('lines up across rows whatever the links, duration or done state', async () => {
    const rows = [
      row('none', {}),
      row('one', { key_link_1: url(1) }),
      row('three', { key_link_1: url(1), key_link_2: url(2), key_link_3: url(3) }),
      row('long', { key_link_1: url(1), estimated_minutes: 150 }),
      row('done', { key_link_1: url(1), status: 'done', completed: 1 }),
    ]
    const host = await mount(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><UndoToastProvider><DndContext>
          <div className="tk" style={{ width: 700 }}>
            {rows.map((t) => <PlannedTaskRow key={t.id} task={t} project={null} state={state} onExpand={() => {}} expandedId={null} projectsByPid={new Map()} />)}
          </div>
        </DndContext></UndoToastProvider></MemoryRouter>
      </QueryClientProvider>,
      { ready: (h) => h.querySelectorAll('[data-testid="planned-duration"]').length === rows.length, label: 'planned rows' },
    )
    const rights = [...host.querySelectorAll<HTMLElement>('[data-testid="planned-duration"]')].map((d) => Math.round(d.getBoundingClientRect().right))
    expect(new Set(rights).size).toBe(1)
  })
})

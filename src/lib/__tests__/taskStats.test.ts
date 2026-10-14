// One lab-wide overdue figure (G8-08, 2026-10-14): Overview's status line and
// the Pipeline tab's "This week" both count with taskStats, so an approval or a
// question row past its date counts on neither.
import { describe, it, expect } from 'vitest'
import { countOverdueBefore } from '../taskStats'
import type { TaskRow } from '../api'

const row = (id: string, due: string | null, extra: Partial<TaskRow> = {}) =>
  ({ id, due_date: due, completed: 0, status: 'todo', approval_status: null, kind: 'task', ...extra }) as unknown as TaskRow

describe('countOverdueBefore', () => {
  it('counts open work due before the day, and nothing else', () => {
    const tasks = [
      row('late', '2026-10-01'),
      row('due-that-day', '2026-10-14'),
      row('done', '2026-10-01', { completed: 1, status: 'done' }),
      row('approval', '2026-10-01', { approval_status: 'pending' }),
      row('question', '2026-10-01', { kind: 'question' }),
      row('no-date', null),
    ]
    expect(countOverdueBefore(tasks, '2026-10-14')).toBe(1)
  })
})

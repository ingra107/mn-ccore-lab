// R04: a display dedup keyed on title + assignee made distinct tasks disappear.
// The carried-forward consolidation of Critical Rule 8 stays, by its prefix.
import { describe, it, expect } from 'vitest'
import { dedupTasks } from '../taskDedup'

const task = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, description: '', assignee: 'bob', project_id: 'proj_a', kind: 'task', recurrence_parent_id: null,
  created_at: '2026-10-01 12:00:00', ...extra,
})
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

describe('dedupTasks: distinct tasks stay', () => {
  it('same title and assignee on two projects', () => {
    const rows = [task('a', 'Review manuscript'), task('b', 'Review manuscript', { project_id: 'proj_b' })]
    expect(ids(dedupTasks(rows))).toEqual(['a', 'b'])
  })

  it('same title, assignee and project: still two tasks with no provenance saying otherwise', () => {
    const rows = [task('a', 'Review manuscript'), task('b', 'Review manuscript', { created_at: '2026-10-02 12:00:00' })]
    expect(ids(dedupTasks(rows))).toEqual(['a', 'b'])
  })

  it('two week_plan questions with the same title', () => {
    const plan = { kind: 'question', source: 'week_plan', project_id: null }
    const rows = [
      task('w1', 'Plan your week', { ...plan, created_at: '2026-10-25 12:00:00' }),
      task('w2', 'Plan your week', { ...plan, created_at: '2026-11-01 12:00:00' }),
    ]
    expect(ids(dedupTasks(rows))).toEqual(['w1', 'w2'])
  })

  it('an open task is not hidden by a newer completed one of the same title', () => {
    const rows = [task('open', 'Weekly planning'), task('done', 'Weekly planning', { completed: 1, created_at: '2026-10-08 12:00:00' })]
    expect(ids(dedupTasks(rows))).toEqual(['open', 'done'])
  })

  it('rows with no title and no description do not all become one', () => {
    const rows = [task('a', '', { description: null }), task('b', '', { description: null })]
    expect(ids(dedupTasks(rows))).toEqual(['a', 'b'])
  })
})

describe('dedupTasks: carried-forward consolidation stays', () => {
  it('a carried copy stands for its origin', () => {
    const rows = [
      task('origin', 'Send the IRB form'),
      task('copy', '[Carried forward] Send the IRB form', { created_at: '2026-10-08 12:00:00' }),
    ]
    expect(ids(dedupTasks(rows))).toEqual(['copy'])
  })

  it('the newest of several copies wins, the day-count form included, and case does not matter', () => {
    const rows = [
      task('origin', 'send the irb form'),
      task('c1', '[Carried forward] Send the IRB form', { created_at: '2026-10-08 12:00:00' }),
      task('c2', '[Carried forward 14d] SEND THE IRB FORM', { created_at: '2026-10-15 12:00:00' }),
    ]
    expect(ids(dedupTasks(rows))).toEqual(['c2'])
  })

  it('a copy does not swallow the same title on another project, kind or recurrence', () => {
    const rows = [
      task('other-project', 'Send the IRB form', { project_id: 'proj_b' }),
      task('other-kind', 'Send the IRB form', { kind: 'milestone' }),
      task('other-series', 'Send the IRB form', { recurrence_parent_id: 'task_parent' }),
      task('copy', '[Carried forward] Send the IRB form', { created_at: '2026-10-08 12:00:00' }),
    ]
    expect(ids(dedupTasks(rows))).toEqual(['other-project', 'other-kind', 'other-series', 'copy'])
  })

  it('it absorbs one origin, not every older row of that title', () => {
    const rows = [
      task('older', 'Send the IRB form', { created_at: '2026-09-01 12:00:00' }),
      task('origin', 'Send the IRB form', { created_at: '2026-10-01 12:00:00' }),
      task('copy', '[Carried forward] Send the IRB form', { created_at: '2026-10-08 12:00:00' }),
    ]
    expect(ids(dedupTasks(rows))).toEqual(['older', 'copy'])
  })

  it('a task made after the copy is new work', () => {
    const rows = [
      task('copy', '[Carried forward] Send the IRB form', { created_at: '2026-10-08 12:00:00' }),
      task('fresh', 'Send the IRB form', { created_at: '2026-10-20 12:00:00' }),
    ]
    expect(ids(dedupTasks(rows))).toEqual(['copy', 'fresh'])
  })

  it('the same id twice shows once, in its first place', () => {
    expect(ids(dedupTasks([task('a', 'A'), task('b', 'B'), task('a', 'A')]))).toEqual(['a', 'b'])
  })
})

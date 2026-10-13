import { describe, it, expect } from 'vitest'
import type { TaskRow } from '../api'
import { dedupeActionItems, sortActionItems, prepareActionItems, isActionHandled, countHandled } from '../meetingActionItems'

function task(over: Partial<TaskRow>): TaskRow {
  return {
    id: 't', title: 'x', description: 'x', assignee: 'nick-ingraham', due_date: null, project_id: null,
    status: 'todo', completed: 0, created_at: '2026-10-12T10:00:00Z', ...over,
  } as TaskRow
}

describe('dedupeActionItems', () => {
  it('keeps the newest of two rows with the same title, owner and date', () => {
    const out = dedupeActionItems([
      task({ id: 'old', title: 'Send IRB', updated_at: '2026-10-12T09:00:00Z' }),
      task({ id: 'new', title: 'send irb', updated_at: '2026-10-12T11:00:00Z' }),
    ])
    expect(out.map((t) => t.id)).toEqual(['new'])
  })
  it('keeps rows that differ by owner', () => {
    const out = dedupeActionItems([task({ id: 'a', title: 'Same' }), task({ id: 'b', title: 'Same', assignee: 'casey-eddington' })])
    expect(out).toHaveLength(2)
  })
  it('accepts null', () => { expect(dedupeActionItems(null)).toEqual([]) })
})

describe('sortActionItems', () => {
  it('puts open before done, then by due date with undated last', () => {
    const out = sortActionItems([
      task({ id: 'done', status: 'done', completed: 1, due_date: '2026-10-01' }),
      task({ id: 'undated', title: 'u' }),
      task({ id: 'late', title: 'l', due_date: '2026-10-20' }),
      task({ id: 'soon', title: 's', due_date: '2026-10-13' }),
    ])
    expect(out.map((t) => t.id)).toEqual(['soon', 'late', 'undated', 'done'])
  })
})

describe('isActionHandled', () => {
  it('is true for a done row', () => { expect(isActionHandled(task({ status: 'done' }))).toBe(true) })
  it('needs both a date and a project when open', () => {
    expect(isActionHandled(task({ due_date: '2026-10-14' }))).toBe(false)
    expect(isActionHandled(task({ project_id: 'clif' }))).toBe(false)
    expect(isActionHandled(task({ due_date: '2026-10-14', project_id: 'clif' }))).toBe(true)
  })
  it('counts handled rows', () => {
    const items = prepareActionItems([
      task({ id: 'a', title: 'a', status: 'done' }),
      task({ id: 'b', title: 'b', due_date: '2026-10-14', project_id: 'clif' }),
      task({ id: 'c', title: 'c' }),
    ])
    expect(countHandled(items)).toBe(2)
  })
})

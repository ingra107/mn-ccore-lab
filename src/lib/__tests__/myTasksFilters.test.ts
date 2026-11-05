import { describe, it, expect } from 'vitest'
import { QUICK_VIEW_KEYS, parseQuickView, parseStatusParam, matchesStatusFilter } from '../../pages/MyTasks/constants'
import { taskMatchesSearch } from '../displayNames'

describe('parseQuickView (shaped like parseViewMode)', () => {
  it('accepts every quick view', () => {
    for (const k of QUICK_VIEW_KEYS) expect(parseQuickView(k)).toBe(k)
  })
  it('falls back to All for an absent or unknown value', () => {
    expect(parseQuickView(null)).toBe('all')
    expect(parseQuickView(undefined)).toBe('all')
    expect(parseQuickView('')).toBe('all')
    expect(parseQuickView('foo')).toBe('all')
    expect(parseQuickView('status')).toBe('all')
  })
})

describe('?status= on My Tasks', () => {
  it('reads the five task statuses and nothing else', () => {
    for (const s of ['todo', 'in_progress', 'waiting_external', 'blocked', 'done']) expect(parseStatusParam(s)).toBe(s)
    expect(parseStatusParam('active')).toBeNull()
    expect(parseStatusParam(null)).toBeNull()
  })
  it('matches a task on its status; done also means completed', () => {
    expect(matchesStatusFilter({ status: 'blocked', completed: 0 }, 'blocked')).toBe(true)
    expect(matchesStatusFilter({ status: 'todo', completed: 0 }, 'blocked')).toBe(false)
    expect(matchesStatusFilter({ status: 'in_progress', completed: 1 }, 'done')).toBe(true)
    expect(matchesStatusFilter({ status: 'todo', completed: 0 }, null)).toBe(true)
  })
})

describe('task search matches what the row shows', () => {
  const t = { title: 'Draft the long methods section for the CQODE ETL manuscript', short_title: 'Methods draft', description: 'x' }
  it('finds a task by its short title as well as its long one', () => {
    expect(taskMatchesSearch(t, 'methods draft')).toBe(true)
    expect(taskMatchesSearch(t, 'cqode')).toBe(true)
    expect(taskMatchesSearch(t, 'nothing here')).toBe(false)
    expect(taskMatchesSearch(t, '')).toBe(true)
  })
})

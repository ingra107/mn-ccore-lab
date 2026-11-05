import { describe, it, expect } from 'vitest'
import { taskQuickFilters } from '../taskQuickFilters'
import { parseQuickView, parseStatusParam } from '../../pages/MyTasks/constants'

const T = '2026-11-05'
const t = (o: Record<string, unknown>) => ({ id: String(Math.random()), status: 'todo', priority: 'medium', assignee: 'me', due_date: null, planned_for: null, completed: 0, ...o }) as never

describe('palette quick filters', () => {
  const tasks = [
    t({ status: 'in_progress' }),
    t({ status: 'blocked' }),
    t({ priority: 'high' }),
    t({ priority: 'urgent' }),
    t({ due_date: '2026-11-05' }),
    t({ due_date: '2026-11-01' }),
    t({ status: 'done', completed: 1 }),
    t({ status: 'in_progress', assignee: 'someone-else' }),
    t({ status: 'blocked', assignee: 'someone-else', due_date: '2026-11-01', priority: 'high' }),
  ]
  const cmds = taskQuickFilters(tasks, 'me', T)
  const byId = Object.fromEntries(cmds.map((c) => [c.id, c]))

  it('every link carries only params My Tasks reads', () => {
    for (const c of cmds) {
      const q = new URL(c.href, 'https://x').searchParams
      if (q.has('filter')) expect(parseQuickView(q.get('filter')), c.id).toBe(q.get('filter'))
      if (q.has('status')) expect(parseStatusParam(q.get('status')), c.id).toBe(q.get('status'))
      expect([...q.keys()].every((k) => ['filter', 'status', 'priority', 'hideCompleted'].includes(k)), c.id).toBe(true)
    }
  })

  it('counts the viewer\'s tasks, the list the link opens, not the lab', () => {
    expect(byId['filter-in-progress'].sublabel).toBe('1 active')
    expect(byId['ctx-tasks-blocked'].sublabel).toBe('1 blocked')
    expect(byId['filter-overdue'].sublabel).toBe('1 past due')
    expect(byId['filter-due-today'].sublabel).toBe('1 planned or due today')
    expect(byId['filter-completed'].sublabel).toBe('1 done')
  })

  it('counts exactly the priority its link filters on', () => {
    expect(byId['filter-high-priority'].sublabel).toBe('1 high')
    expect(byId['filter-high-priority'].href).toContain('priority=high')
    expect(byId['filter-urgent'].sublabel).toBe('1 urgent')
  })

  it('Due Today opens the Today view; Completed shows completed rows', () => {
    expect(byId['filter-due-today'].href).toBe('/portal/my-tasks?filter=today')
    expect(byId['filter-overdue'].href).toBe('/portal/my-tasks?filter=overdue')
    expect(byId['filter-completed'].href).toContain('hideCompleted=0')
  })
})

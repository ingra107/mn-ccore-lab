// withdrawn on a week_plan answer (2026-11-04): Nick takes a task off This
// week, even one prep already started on. Twin of PB scripts/questions/state.py.
import { describe, it, expect } from 'vitest'
import { currentWeekPlan } from '../weekPlan'
import { weekPlanPicksError, parseWeekPlanPicks, weekPlanWithdrawn, weekPlanWithdrawnError } from '../../../shared/weekPlan'
import type { TaskRow } from '../api'

const opt = (key: string, recommended = false) =>
  ({ key, label: key, direction: `do ${key}`, deliverable_kind: 'answer', recommended })
const SPEC = {
  v: 1, kind: 'week_plan', week_start: '2026-10-26', tz: 'America/Chicago', prompt: 'Plan', expires_at: null,
  candidates: [
    { task_id: 'task_a', title: 'A', why: '', evidence: [], options: [opt('a1', true), opt('a2')] },
    { task_id: 'task_b', title: 'B', why: '', evidence: [], options: [opt('b1', true), opt('b2')] },
  ],
}
const plan = (id: string, at: string, answer: Record<string, unknown>): TaskRow => ({
  id, title: 'Plan', assignee: 'nick-ingraham', priority: 'medium', status: 'todo', source: 'week_plan',
  completed: 0, completed_at: null, project_id: null, kind: 'question', created_at: '2026-10-25T21:00:00Z',
  question_spec_json: JSON.stringify(SPEC),
  question_answer_json: JSON.stringify({ v: 1, choice: 'start', via: 'hub', at, ...answer }),
  question_consumed_json: null,
} as unknown as TaskRow)
const open = (id: string) => ({ id, title: id, status: 'todo', completed: 0, kind: 'task', project_id: null } as unknown as TaskRow)
const startA = [{ task_id: 'task_a', option_key: 'a1', text: null, start: true }]

describe('withdrawn on the answer', () => {
  it('currentWeekPlan_drops_a_withdrawn_started_pick', () => {
    const old = plan('p1', '2026-10-26T14:00:00Z', { picks: startA })
    const newest = plan('p2', '2026-10-27T14:00:00Z', { choice: 'save', picks: [], withdrawn: ['task_a'] })
    const without = currentWeekPlan([old, plan('p2b', '2026-10-27T14:00:00Z', { picks: [{ task_id: 'task_b', option_key: 'b1', text: null, start: false }] }), open('task_a'), open('task_b')], '2026-10-28')!
    expect(without.earlier.map((e) => e.pick.task_id)).toEqual(['task_a']) // control: without withdrawn it is kept
    const p = currentWeekPlan([old, newest, open('task_a')], '2026-10-28')!
    expect(p.task.id).toBe('p2')
    expect(p.picks).toEqual([])
    expect(p.withdrawn).toEqual(['task_a'])
    expect(p.earlier.map((e) => e.pick.task_id)).not.toContain('task_a')
  })

  it('a withdrawal in a middle plan hides the pick from the oldest, and a later pick of it wins', () => {
    const p1 = plan('p1', '2026-10-26T10:00:00Z', { picks: startA })
    const p2 = plan('p2', '2026-10-27T10:00:00Z', { choice: 'save', picks: [], withdrawn: ['task_a'] })
    const p3 = plan('p3', '2026-10-28T10:00:00Z', { picks: [{ task_id: 'task_b', option_key: 'b1', text: null, start: true }] })
    const tasks = [p1, p2, p3, open('task_a'), open('task_b')]
    expect(currentWeekPlan(tasks, '2026-10-28')!.earlier).toEqual([])
    const p4 = plan('p4', '2026-10-29T10:00:00Z', { picks: startA })
    expect(currentWeekPlan([...tasks, p4], '2026-10-29')!.picks.map((x) => x.task_id)).toEqual(['task_a'])
  })

  it('picks_may_be_empty_only_with_withdrawn', () => {
    expect(weekPlanPicksError([], null, { allowEmpty: true })).toBeNull()
    expect(weekPlanPicksError([], null)).toBe('a week_plan answer needs a non-empty picks array')
    expect(weekPlanPicksError([], null, { allowEmpty: false })).toBe('a week_plan answer needs a non-empty picks array')
    expect(weekPlanPicksError(undefined, null, { allowEmpty: true })).toBeNull() // absent picks with withdrawn
    expect(parseWeekPlanPicks({ picks: [], withdrawn: ['t'] }, null)).toEqual([])
    expect(parseWeekPlanPicks({ picks: [] }, null)).toBeNull()
    expect(parseWeekPlanPicks({ withdrawn: ['t'] }, null)).toEqual([])
    expect(parseWeekPlanPicks({ picks: [], withdrawn: [] }, null)).toBeNull()
  })

  it('withdrawn_must_name_candidates_or_started', () => {
    expect(weekPlanWithdrawn({ withdrawn: ['t', 'u'] })).toEqual(['t', 'u'])
    expect(weekPlanWithdrawn({})).toEqual([])
    expect(weekPlanWithdrawn('not an answer')).toEqual([])
    for (const bad of [[1], [''], ['t', 't'], 't']) {
      expect(weekPlanWithdrawnError({ withdrawn: bad })).toMatch(/withdrawn/)
      expect(weekPlanWithdrawn({ withdrawn: bad })).toEqual([])
    }
    expect(weekPlanWithdrawnError({ withdrawn: ['t'] })).toBeNull()
    // an answer with a bad withdrawn parses to no picks at all
    expect(parseWeekPlanPicks({ picks: startA, withdrawn: [1] }, null)).toBeNull()
  })
})

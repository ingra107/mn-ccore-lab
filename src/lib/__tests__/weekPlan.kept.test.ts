// kept on a week_plan answer (2026-11-04, round 2): picks the session carried
// from the plan before, not new ones. Twin of PB scripts/questions/state.py.
import { describe, it, expect } from 'vitest'
import { currentWeekPlan, startFlipAnswer } from '../weekPlan'
import {
  WEEK_PLAN_MIN_OPTIONS, parseWeekPlanPicks, parseWeekPlanSpec, weekPlanFlipError, weekPlanKept, weekPlanKeptError, weekPlanNewlyStarted,
} from '../../../shared/weekPlan'
import type { TaskRow } from '../api'

const opt = (key: string, recommended = false) =>
  ({ key, label: key, direction: `do ${key}`, deliverable_kind: 'answer', recommended })
const SPEC = {
  v: 1, kind: 'week_plan', week_start: '2026-10-26', tz: 'America/Chicago', prompt: 'Plan', expires_at: null,
  candidates: [
    { task_id: 'task_a', title: 'A', why: '', evidence: [], options: [opt('keep', true)] },
    { task_id: 'task_b', title: 'B', why: '', evidence: [], options: [opt('b1', true), opt('b2')] },
  ],
}
const spec = parseWeekPlanSpec(SPEC)!
const pickA = { task_id: 'task_a', option_key: 'keep', text: null, start: true }
const pickB = { task_id: 'task_b', option_key: 'b1', text: null, start: true }
const plan = (answer: Record<string, unknown>): TaskRow => ({
  id: 'p1', title: 'Plan', assignee: 'nick-ingraham', priority: 'medium', status: 'todo', source: 'week_plan',
  completed: 0, completed_at: null, project_id: null, kind: 'question', created_at: '2026-10-25T21:00:00Z',
  question_spec_json: JSON.stringify(SPEC),
  question_answer_json: JSON.stringify({ v: 1, choice: 'start', via: 'hub', at: '2026-10-26T14:00:00Z', ...answer }),
  question_consumed_json: null,
} as unknown as TaskRow)

describe('kept on the answer', () => {
  it('a candidate may hold one option', () => {
    expect(WEEK_PLAN_MIN_OPTIONS).toBe(1)
    expect(spec.candidates[0].options.map((o) => o.key)).toEqual(['keep'])
  })

  it('weekPlanKept reads the ids, and [] when absent or malformed', () => {
    expect(weekPlanKept({ picks: [pickA, pickB], kept: ['task_a'] })).toEqual(['task_a'])
    expect(weekPlanKept(JSON.stringify({ picks: [pickA], kept: ['task_a'] }))).toEqual(['task_a'])
    expect(weekPlanKept({ picks: [pickA] })).toEqual([])
    expect(weekPlanKept({ picks: [pickA], kept: ['task_b'] })).toEqual([])
    expect(weekPlanKept('not an answer')).toEqual([])
  })

  it('weekPlanKeptError judges the shape and that each id is a pick', () => {
    const picks = [pickA, pickB]
    expect(weekPlanKeptError({}, picks)).toBeNull()
    expect(weekPlanKeptError({ kept: [] }, picks)).toBeNull()
    expect(weekPlanKeptError({ kept: ['task_a', 'task_b'] }, picks)).toBeNull()
    expect(weekPlanKeptError({ kept: ['task_a', 'task_a'] }, picks)).toBe('kept names a task twice')
    expect(weekPlanKeptError({ kept: ['task_z'] }, picks)).toBe('kept names task_z, which is not a pick of this answer')
    expect(weekPlanKeptError({ kept: ['task_a'] }, undefined)).toBe('kept names task_a, which is not a pick of this answer')
    for (const bad of [[1], [''], 'task_a', null]) {
      expect(weekPlanKeptError({ kept: bad }, picks)).toMatch(/^kept must be an array/)
    }
  })

  it('an answer with a bad kept parses to no picks at all', () => {
    expect(parseWeekPlanPicks({ picks: [pickA], kept: ['task_b'] }, spec)).toBeNull()
    expect(parseWeekPlanPicks({ picks: [pickA], kept: [7] }, spec)).toBeNull()
    expect(parseWeekPlanPicks({ picks: [pickA], kept: ['task_a'] }, spec)).toEqual([pickA])
  })

  it('weekPlanNewlyStarted skips a kept pick on a first answer and on a flip', () => {
    expect(weekPlanNewlyStarted(null, { picks: [pickA, pickB], kept: ['task_a'] }, spec)).toEqual([pickB])
    expect(weekPlanNewlyStarted(null, { picks: [pickA], kept: ['task_a'] }, spec)).toBeNull()
    expect(weekPlanNewlyStarted(null, { picks: [pickA, pickB] }, spec)).toEqual([pickA, pickB])
    const base = { v: 1, via: 'hub', at: 'x', kept: ['task_a'] }
    const stored = { ...base, choice: 'save', picks: [{ ...pickA, start: false }, { ...pickB, start: false }] }
    expect(weekPlanNewlyStarted(stored, { ...base, choice: 'start', picks: [pickA, pickB] }, spec)).toEqual([pickB])
  })

  it('weekPlanFlipError freezes kept', () => {
    const base = { v: 1, via: 'hub', at: 'x' }
    const picksBefore = [pickA, { ...pickB, start: false }]
    const stored = { ...base, choice: 'save', kept: ['task_a'], picks: picksBefore }
    const next = { ...base, choice: 'start', kept: ['task_a'], picks: [pickA, pickB] }
    expect(weekPlanFlipError(stored, next, spec)).toBeNull()
    expect(weekPlanFlipError(stored, { ...next, kept: [] }, spec)).toBe('only picks[].start may change, not kept')
    expect(weekPlanFlipError(stored, { ...next, kept: ['task_a', 'task_b'] }, spec)).toBe('only picks[].start may change, not kept')
    expect(weekPlanFlipError(stored, { ...base, choice: 'start', picks: [pickA, pickB] }, spec)).toBe('only picks[].start may change, not kept')
    expect(weekPlanFlipError({ ...base, choice: 'save', picks: picksBefore }, next, spec)).toBe('only picks[].start may change, not kept')
  })

  it('currentWeekPlan reports the plan\'s kept ids, and [] for an old answer', () => {
    const open = { id: 'task_a', title: 'A', status: 'todo', completed: 0, kind: 'task', project_id: null } as unknown as TaskRow
    expect(currentWeekPlan([plan({ picks: [pickA], kept: ['task_a'] }), open], '2026-10-28')!.kept).toEqual(['task_a'])
    expect(currentWeekPlan([plan({ picks: [pickA] }), open], '2026-10-28')!.kept).toEqual([])
  })

  it('startFlipAnswer sends kept back unchanged', () => {
    const t = plan({ choice: 'save', kept: ['task_a'], picks: [pickA, { ...pickB, start: false }] })
    expect(startFlipAnswer(t, 'task_b')).toMatchObject({ choice: 'start', kept: ['task_a'] })
  })
})

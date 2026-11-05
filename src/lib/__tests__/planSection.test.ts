// The Plan section on Today (#169 round 2): which tasks it holds and in what
// order. Spec: docs/superpowers/specs/2026-11-04-plan-section-design.md,
// "The Plan section".
import { describe, it, expect } from 'vitest'
import { planSectionModel } from '../planSection'
import { currentWeekPlan } from '../weekPlan'
import type { TaskRow } from '../api'

const opt = (key: string, recommended = false) =>
  ({ key, label: key, direction: `do ${key}`, deliverable_kind: 'answer', recommended })
const spec = (week_start: string, ids: string[]) => ({
  v: 1, kind: 'week_plan', week_start, tz: 'America/Chicago', prompt: 'Plan', expires_at: null,
  candidates: ids.map((id) => ({ task_id: id, title: id, why: '', evidence: [], options: [opt(`${id}-1`, true)] })),
})
const answer = (id: string, week_start: string, at: string, ids: string[]): TaskRow => ({
  id, title: 'Plan', assignee: 'nick-ingraham', priority: 'medium', status: 'todo', source: 'week_plan',
  completed: 0, completed_at: null, project_id: null, kind: 'question', created_at: '2026-11-01T21:00:00Z',
  question_spec_json: JSON.stringify(spec(week_start, ids)),
  question_answer_json: JSON.stringify({ v: 1, choice: 'start', via: 'hub', at, picks: ids.map((t) => ({ task_id: t, option_key: `${t}-1`, text: null, start: true })) }),
  question_consumed_json: null,
} as unknown as TaskRow)
const open = (id: string, extra: Partial<TaskRow> = {}) =>
  ({ id, title: id, status: 'todo', completed: 0, kind: 'task', project_id: null, ...extra } as unknown as TaskRow)
const finished = (id: string, extra: Partial<TaskRow> = {}) =>
  open(id, { status: 'done', completed: 1, completed_at: '2026-11-04 15:00:00', ...extra })

const WEEK = '2026-11-02'
const DAY = '2026-11-04'
const ids = (rows: TaskRow[]) => rows.map((t) => t.id)
/** What the page does: the plan as read back from the rows, then the model. */
function model(rows: TaskRow[], planned: Record<string, unknown> = {}, today = DAY, done?: Record<string, boolean>) {
  return planSectionModel(currentWeekPlan(rows, today), rows, planned, today, done)
}

describe('planSectionModel', () => {
  it('a_pick_is_in_the_section_once', () => {
    const rows = [answer('p', WEEK, '2026-11-04T14:00:00Z', ['a', 'b']), open('a', { planned_for: DAY, plan_rank: 1 }), open('b')]
    const m = model(rows, { a: { slot: 'strip' } })
    expect(ids(m.today)).toEqual(['a'])
    expect(ids(m.picks)).toEqual(['b'])
    expect(ids(m.done)).toEqual([])
    expect([...m.ids].sort()).toEqual(['a', 'b'])
  })

  it('orders today by plan rank, then the other picks by the plan, then done', () => {
    const rows = [
      answer('p', WEEK, '2026-11-04T14:00:00Z', ['a', 'b', 'c', 'd']),
      open('d'), open('c', { planned_for: DAY, plan_rank: 5 }), finished('b'), open('a'),
      open('x', { planned_for: DAY, plan_rank: 2 }), open('y', { planned_for: DAY, plan_rank: null }),
    ]
    const m = model(rows, { c: {}, x: {}, y: {} })
    expect(ids(m.today)).toEqual(['x', 'c', 'y']) // no rank goes last
    expect(ids(m.picks)).toEqual(['a', 'd']) // plan order, not row order
    expect(ids(m.done)).toEqual(['b'])
  })

  it('a_planned_non_pick_is_tagged_today', () => {
    const rows = [answer('p', WEEK, '2026-11-04T14:00:00Z', ['a']), open('a'), open('x', { planned_for: DAY })]
    const m = model(rows, { x: {} })
    expect(ids(m.today)).toEqual(['x'])
    expect(m.ids.has('x')).toBe(true)
  })

  it('a_done_pick_stays_until_a_newer_plan', () => {
    const first = answer('p1', WEEK, '2026-11-03T14:00:00Z', ['a', 'b'])
    const rows = [first, finished('a'), open('b')]
    expect(ids(model(rows).done)).toEqual(['a'])
    // The newer plan does not carry it: it leaves, and Completed today may have it.
    const m = model([...rows, answer('p2', WEEK, '2026-11-04T14:00:00Z', ['b'])])
    expect(ids(m.done)).toEqual([])
    expect(m.ids.has('a')).toBe(false)
  })

  it('a_done_pick_stays_over_a_day_with_no_replan', () => {
    const rows = [answer('p', WEEK, '2026-11-03T14:00:00Z', ['a']), finished('a', { completed_at: '2026-11-03 18:00:00' })]
    expect(ids(model(rows, {}, '2026-11-05').done)).toEqual(['a'])
  })

  it('a_done_non_pick_leaves_when_its_day_ends', () => {
    const rows = [finished('x', { planned_for: DAY })]
    expect(ids(model(rows, {}, DAY).done)).toEqual(['x'])
    expect(model(rows, {}, '2026-11-05').ids.has('x')).toBe(false)
    // A finished task nobody planned today was never the section's.
    expect(model([finished('y')], {}, DAY).ids.has('y')).toBe(false)
  })

  it('a_reopened_done_pick_returns_to_its_place', () => {
    const plan = answer('p', WEEK, '2026-11-04T14:00:00Z', ['a', 'b', 'c'])
    expect(ids(model([plan, open('a'), finished('b'), open('c')]).done)).toEqual(['b'])
    expect(ids(model([plan, open('a'), open('b'), open('c')]).picks)).toEqual(['a', 'b', 'c'])
    // Planned for today when it was checked: it comes back with its Today tag.
    const m = model([plan, open('a'), open('b', { planned_for: DAY, plan_rank: 1 }), open('c')], { b: {} })
    expect(ids(m.today)).toEqual(['b'])
    expect(ids(m.done)).toEqual([])
  })

  it('a_new_week_is_empty', () => {
    const rows = [answer('p', '2026-10-26', '2026-10-27T14:00:00Z', ['a', 'b']), open('a'), finished('b')]
    const m = model(rows, {}, WEEK) // the Monday after
    expect(ids(m.today)).toEqual([])
    expect(ids(m.picks)).toEqual([])
    expect(ids(m.done)).toEqual([])
    expect(m.ids.size).toBe(0)
  })

  it('no_plan_holds_only_todays_planned', () => {
    const rows = [open('a', { planned_for: DAY }), open('b'), open('c', { planned_for: '2026-11-03' })]
    const m = model(rows, { a: {} })
    expect(ids(m.today)).toEqual(['a'])
    expect(ids(m.picks)).toEqual([])
    expect([...m.ids]).toEqual(['a'])
  })

  it('sunday_evening_with_next_weeks_plan', () => {
    const sunday = '2026-11-08'
    const rows = [
      answer('this', WEEK, '2026-11-03T14:00:00Z', ['a']),
      answer('next', '2026-11-09', '2026-11-08T23:00:00Z', ['b']),
      open('a'), open('b'),
    ]
    const m = model(rows, {}, sunday)
    expect(ids(m.picks)).toEqual(['b']) // the newest answer the window holds
    expect(m.ids.has('a')).toBe(false)
  })

  it('a pick with no row renders nothing and is not claimed', () => {
    const m = model([answer('p', WEEK, '2026-11-04T14:00:00Z', ['gone', 'a']), open('a')], { ghost: {} })
    expect(ids(m.picks)).toEqual(['a'])
    expect([...m.ids]).toEqual(['a'])
  })

  it('a pick checked a moment ago is done before the cache says so', () => {
    const rows = [answer('p', WEEK, '2026-11-04T14:00:00Z', ['a', 'b']), open('a', { planned_for: DAY }), open('b')]
    const m = model(rows, { a: {} }, DAY, { a: true })
    expect(ids(m.today)).toEqual([])
    expect(ids(m.done)).toEqual(['a'])
  })

  it('a stray planned milestone stays a rule in its section', () => {
    const m = model([open('m', { kind: 'milestone', planned_for: DAY })], { m: {} })
    expect(m.ids.has('m')).toBe(false)
  })

  it('an answered question planned today is not work done', () => {
    const q = finished('q', { kind: 'question', planned_for: DAY })
    expect(model([q]).ids.has('q')).toBe(false)
  })
})

describe('currentWeekPlan after earlier', () => {
  it('has no earlier list, and an older plan started pick is not carried', () => {
    const rows = [answer('p1', WEEK, '2026-11-03T14:00:00Z', ['a']), answer('p2', WEEK, '2026-11-04T14:00:00Z', ['b']), open('a'), open('b')]
    const p = currentWeekPlan(rows, DAY)!
    expect(p.task.id).toBe('p2')
    expect('earlier' in p).toBe(false)
    expect(ids(model(rows).picks)).toEqual(['b'])
    expect(model(rows).ids.has('a')).toBe(false) // back in its section
  })
})

describe('a new plan clears Done', () => {
  const clearing = (id: string, at: string, cleared: string[]): TaskRow => ({
    ...answer(id, WEEK, at, cleared),
    question_answer_json: JSON.stringify({ v: 1, choice: 'save', via: 'hub', at, picks: [], cleared }),
  } as TaskRow)

  it('an answer holding no picks and naming the finished ones is read, and empties Done', () => {
    const rows = [answer('p1', WEEK, '2026-11-03T14:00:00Z', ['a', 'b']), finished('a'), finished('b')]
    expect(ids(model(rows).done)).toEqual(['a', 'b'])
    const m = model([...rows, clearing('p2', '2026-11-04T16:00:00Z', ['a', 'b'])])
    expect(m.done).toEqual([])
    expect(m.picks).toEqual([])
  })

  it('a pick planned for today and finished before the replan goes too', () => {
    const a = finished('a', { planned_for: DAY })
    const rows = [answer('p1', WEEK, '2026-11-03T14:00:00Z', ['a']), a]
    expect(ids(model(rows).done)).toEqual(['a'])
    expect(model([...rows, clearing('p2', '2026-11-04T16:00:00Z', ['a'])]).done).toEqual([])
  })

  it('work finished after the replan still shows', () => {
    const later = finished('x', { planned_for: DAY, completed_at: '2026-11-04 17:00:00' })
    const rows = [answer('p1', WEEK, '2026-11-03T14:00:00Z', ['a']), finished('a'), clearing('p2', '2026-11-04T16:00:00Z', ['a']), later]
    expect(ids(model(rows).done)).toEqual(['x'])
  })

  it('with no plan at all, today\'s finished work still shows', () => {
    const a = finished('a', { planned_for: DAY })
    expect(ids(model([a]).done)).toEqual(['a'])
  })
})


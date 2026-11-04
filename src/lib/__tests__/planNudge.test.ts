// planNudgeWeek: the gold "Plan your week" row, computed on read. The week it
// names is the week a session started then would plan (PB week_plan.week_start_for:
// a Sunday plans next week, any other day this one), so a plan for the WRONG
// week never silences it. currentWeekPlan overlaps two weeks on a Sunday and is
// deliberately not the reader. Instants below are Chicago wall clock:
// 2026-11-08 is a Sunday, CST (UTC-6); 2026-07-05 is a Sunday, CDT (UTC-5).
// Run: npx vitest run --config vitest.config.lib.ts src/lib/__tests__/planNudge.test.ts
import { describe, it, expect } from 'vitest'
import { planNudgeTargetWeek, planNudgeWeek } from '../weekPlan'
import type { TaskRow } from '../api'

const A_PICK = [{ task_id: 'task_a', option_key: 'a1', text: null, start: false }]
const plan = (week_start: string, over: Partial<TaskRow> = {}, answer: Record<string, unknown> = { picks: A_PICK }): TaskRow => ({
  id: `plan_${week_start}`, title: 'Plan your week', status: 'todo', source: 'week_plan', kind: 'question', completed: 0,
  question_spec_json: JSON.stringify({
    v: 1, kind: 'week_plan', week_start, tz: 'America/Chicago', prompt: 'p', expires_at: null,
    candidates: [{ task_id: 'task_a', title: 'A', why: '', evidence: [], options: [
      { key: 'a1', label: 'One', direction: 'd', deliverable_kind: 'gmail_draft', recommended: true },
      { key: 'a2', label: 'Two', direction: 'd', deliverable_kind: 'gmail_draft', recommended: false },
    ] }],
  }),
  question_answer_json: JSON.stringify({ v: 1, choice: 'save', via: 'hub', at: '2026-11-02T14:00:00Z', ...answer }),
  question_consumed_json: null, ...over,
} as unknown as TaskRow)

const THIS_WEEK = '2026-11-02'
const NEXT_WEEK = '2026-11-09'
const SUNDAY_EVENING = '2026-11-08T22:00:00Z' // 16:00 CST
const MONDAY = '2026-11-02T15:00:00Z'

describe('planNudgeWeek', () => {
  it('sunday_with_this_weeks_plan_still_nudges_for_next_week', () => {
    expect(planNudgeWeek([plan(THIS_WEEK)], SUNDAY_EVENING)).toBe(NEXT_WEEK)
  })

  it('monday_with_a_plan_is_null', () => {
    expect(planNudgeWeek([plan(THIS_WEEK)], MONDAY)).toBeNull()
  })

  it('sunday_with_next_weeks_plan_is_null', () => {
    expect(planNudgeWeek([plan(THIS_WEEK), plan(NEXT_WEEK)], SUNDAY_EVENING)).toBeNull()
    expect(planNudgeWeek([plan(NEXT_WEEK)], SUNDAY_EVENING)).toBeNull()
  })

  it('no_nudge_before_sunday_evening', () => {
    const justBefore = '2026-11-08T21:59:59Z' // 15:59:59 CST
    expect(planNudgeWeek([plan(THIS_WEEK)], justBefore)).toBeNull()
    expect(planNudgeWeek([], justBefore)).toBeNull() // a week with a day left does not ask either
    expect(planNudgeWeek([], '2026-11-08T06:00:00Z')).toBeNull() // Sunday 00:00 CST
    expect(planNudgeWeek([plan(THIS_WEEK)], SUNDAY_EVENING)).toBe(NEXT_WEEK)
  })

  it('reads the 16:00 line in Chicago on both sides of daylight time', () => {
    expect(planNudgeTargetWeek('2026-07-05T20:59:59Z')).toBeNull() // 15:59 CDT
    expect(planNudgeTargetWeek('2026-07-05T21:00:00Z')).toBe('2026-07-06') // 16:00 CDT
    expect(planNudgeTargetWeek('2026-11-08T21:00:00Z')).toBeNull() // 15:00 CST: the same UTC hour is not evening in November
    expect(planNudgeTargetWeek('2026-11-01T21:59:59Z')).toBeNull() // the Sunday clocks change: 15:59 CST
    expect(planNudgeTargetWeek('2026-11-01T22:00:00Z')).toBe('2026-11-02')
  })

  it('reads the day in Chicago, not UTC, across midnight', () => {
    // Monday 00:30 UTC is still Sunday evening in Chicago.
    expect(planNudgeTargetWeek('2026-11-09T00:30:00Z')).toBe(NEXT_WEEK)
    // Sunday 23:59 CST and Monday 00:00 CST name the same week.
    expect(planNudgeTargetWeek('2026-11-09T05:59:00Z')).toBe(NEXT_WEEK)
    expect(planNudgeTargetWeek('2026-11-09T06:00:00Z')).toBe(NEXT_WEEK)
    // Saturday 23:59 CST still names the week it is in.
    expect(planNudgeTargetWeek('2026-11-08T05:59:00Z')).toBe(THIS_WEEK)
  })

  it('a week with no plan nudges through Saturday, for that week', () => {
    expect(planNudgeWeek([], MONDAY)).toBe(THIS_WEEK)
    expect(planNudgeWeek([], '2026-11-07T18:00:00Z')).toBe(THIS_WEEK)
    expect(planNudgeWeek([plan('2026-10-26')], MONDAY)).toBe(THIS_WEEK) // last week's plan is not this week's
  })

  it('only an answered plan of that week silences it', () => {
    const waiting = plan(THIS_WEEK, { question_answer_json: null })
    expect(planNudgeWeek([waiting], MONDAY)).toBe(THIS_WEEK)
    expect(planNudgeWeek([plan(THIS_WEEK, { status: 'deleted' })], MONDAY)).toBe(THIS_WEEK)
    expect(planNudgeWeek([plan(THIS_WEEK, { source: 'meeting_match' })], MONDAY)).toBe(THIS_WEEK)
    // The same parse currentWeekPlan uses: a row it would skip is no plan here.
    expect(planNudgeWeek([plan(THIS_WEEK, { question_spec_json: '{not json' })], MONDAY)).toBe(THIS_WEEK)
    expect(planNudgeWeek([plan(THIS_WEEK, { question_answer_json: '{not json' })], MONDAY)).toBe(THIS_WEEK)
  })

  it('an answer that withdraws every pick and an acted-on plan both count: he planned', () => {
    expect(planNudgeWeek([plan(THIS_WEEK, {}, { picks: [], withdrawn: ['task_a'] })], MONDAY)).toBeNull()
    const acted = plan(THIS_WEEK, {
      status: 'done',
      question_consumed_json: JSON.stringify({ v: 1, consumer: 'week_plan', at: '2026-11-02T15:00:00Z', answer_at: '2026-11-02T14:00:00Z', evidence: 'test' }),
    })
    expect(planNudgeWeek([acted], MONDAY)).toBeNull()
  })

  it('an unreadable clock asks nothing', () => {
    expect(planNudgeTargetWeek('not a date')).toBeNull()
  })
})

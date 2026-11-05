// sessionWeekPlanned: does the week a press of the Plan button would plan already
// have a plan? It decides between "Plan week" and "Replan". On a Sunday a session
// plans the week ahead (PB week_plan.week_start_for), while the plan on show is
// still the week that is ending.
import { describe, it, expect } from 'vitest'
import { sessionWeekPlanned, sessionWeekStart } from '../weekPlan'
import type { TaskRow } from '../api'

const plan = (week: string, picks: unknown[] = [{ task_id: 'task_a', option_key: 'a', text: null, start: true }]): TaskRow => ({
  id: `p-${week}`, title: 'Plan', assignee: 'nick-ingraham', priority: 'medium', status: 'todo', source: 'week_plan',
  completed: 0, completed_at: null, project_id: null, kind: 'question', created_at: '2026-10-25T21:00:00Z',
  question_spec_json: JSON.stringify({
    v: 1, kind: 'week_plan', week_start: week, tz: 'America/Chicago', prompt: 'Plan', expires_at: null,
    candidates: [{ task_id: 'task_a', title: 'A', why: '', evidence: [], options: [{ key: 'a', label: 'a', direction: 'do a', deliverable_kind: 'answer', recommended: true }] }],
  }),
  question_answer_json: JSON.stringify({ v: 1, choice: 'start', via: 'hub', at: '2026-10-26T14:00:00Z', picks }),
  question_consumed_json: null,
} as unknown as TaskRow)

const TUESDAY = '2026-11-03T15:00:00Z'
const SATURDAY = '2026-11-07T15:00:00Z'
const SUNDAY_MORNING = '2026-11-08T15:00:00Z' // 09:00 Chicago

describe('sessionWeekStart', () => {
  it('names this Monday through Saturday, and the next Monday on any Sunday', () => {
    expect(sessionWeekStart(TUESDAY)).toBe('2026-11-02')
    expect(sessionWeekStart(SATURDAY)).toBe('2026-11-02')
    expect(sessionWeekStart(SUNDAY_MORNING)).toBe('2026-11-09')
  })
})

describe('sessionWeekPlanned', () => {
  it('false with no plan, true once the week has an answered one', () => {
    expect(sessionWeekPlanned([], TUESDAY)).toBe(false)
    expect(sessionWeekPlanned([plan('2026-11-02')], TUESDAY)).toBe(true)
  })

  it("last week's plan does not count", () => {
    expect(sessionWeekPlanned([plan('2026-10-26')], TUESDAY)).toBe(false)
  })

  it("a Sunday asks about the week ahead, though this week's plan is still on show", () => {
    expect(sessionWeekPlanned([plan('2026-11-02')], SUNDAY_MORNING)).toBe(false)
    expect(sessionWeekPlanned([plan('2026-11-02'), plan('2026-11-09')], SUNDAY_MORNING)).toBe(true)
  })
})

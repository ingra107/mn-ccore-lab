// owner on a week_plan option and pick: who does the step. Twin of PB
// scripts/questions/state.py.
import { describe, it, expect } from 'vitest'
import {
  parseWeekPlanPicks, parseWeekPlanSpec, pickOwner, weekPlanFlipError, weekPlanPicksError, weekPlanSpecError,
} from '../../../shared/weekPlan'
import { pickTag } from '../weekPlan'

const opt = (key: string, extra: Record<string, unknown> = {}) =>
  ({ key, label: key, direction: `do ${key}`, deliverable_kind: 'answer', recommended: true, ...extra })
const specOf = (options: unknown[]) => ({
  v: 1, kind: 'week_plan', week_start: '2026-11-02', tz: 'America/Chicago', prompt: 'Plan', expires_at: null,
  candidates: [{ task_id: 'task_a', title: 'A', why: '', evidence: [], options }],
})
const spec = parseWeekPlanSpec(specOf([opt('mine', { owner: 'nick' }), { ...opt('plain'), recommended: false }]))!
const pick = (extra: Record<string, unknown> = {}) =>
  ({ task_id: 'task_a', option_key: 'mine', text: null, start: false, ...extra })

describe('pickOwner', () => {
  it("the option's owner wins over the pick's", () => {
    expect(pickOwner(pick({ owner: 'claude' }) as never, spec)).toBe('nick')
  })
  it("a typed pick takes the pick's owner", () => {
    expect(pickOwner(pick({ option_key: null, text: 'mine', owner: 'claude' }) as never, spec)).toBe('claude')
  })
  it('is null when neither has one', () => {
    expect(pickOwner(pick({ option_key: 'plain' }) as never, spec)).toBeNull()
    expect(pickOwner(pick({ option_key: null, text: 'x' }) as never, spec)).toBeNull()
  })
})

describe('owner validation and parsing', () => {
  it('the spec refuses a bad option owner and accepts it absent', () => {
    expect(weekPlanSpecError(specOf([opt('a', { owner: 'bob' })]))).toBe('candidates[0].options[0].owner must be one of claude/nick')
    expect(weekPlanSpecError(specOf([opt('a')]))).toBeNull()
    expect(weekPlanSpecError(specOf([opt('a', { owner: 'claude' })]))).toBeNull()
  })
  it('the picks refuse a bad pick owner', () => {
    expect(weekPlanPicksError([pick({ owner: 'bob' })], spec)).toBe('picks[0].owner must be one of claude/nick')
    expect(weekPlanPicksError([pick({ owner: 'nick' })], spec)).toBeNull()
  })
  it('the parsers keep owner', () => {
    expect(spec.candidates[0].options[0].owner).toBe('nick')
    expect(spec.candidates[0].options[1]).not.toHaveProperty('owner')
    const picks = parseWeekPlanPicks({ picks: [pick({ owner: 'claude' })] }, spec)!
    expect(picks[0].owner).toBe('claude')
    expect(parseWeekPlanPicks({ picks: [pick()] }, spec)![0]).not.toHaveProperty('owner')
  })
  it('a flip that changes a pick owner is refused', () => {
    const stored = { v: 1, choice: 'save', picks: [pick({ owner: 'claude' })] }
    const same = { ...stored, choice: 'start', picks: [pick({ owner: 'claude', start: true })] }
    const changed = { ...stored, choice: 'start', picks: [pick({ owner: 'nick', start: true })] }
    expect(weekPlanFlipError(stored, same, spec)).toBeNull()
    expect(weekPlanFlipError(stored, changed, spec)).toBe('picks[0] may only change start')
  })
})

describe('pickTag with an owner', () => {
  it('Yours and With Claude come after Done and the packet tags', () => {
    expect(pickTag(undefined, false, false, 'nick')).toEqual({ label: 'Yours', cls: 'tk-ac' })
    expect(pickTag(undefined, false, false, 'claude')).toEqual({ label: 'With Claude', cls: 'tk-n' })
    expect(pickTag({ packet_state: 'ready' } as never, false, false, 'claude')?.label).toBe('Ready')
    expect(pickTag(undefined, false, false, null)?.label).toBe('Saved')
  })
})

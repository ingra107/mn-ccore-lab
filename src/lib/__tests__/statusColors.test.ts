/**
 * statusColors: the shared status map follows the color jobs (rules-ui-design
 * principle 21, Nick 2026-10-11). Red means overdue and nothing else; orange is
 * going stale; gold is a date or ask that wants you now; the rest is neutral.
 *
 * Run: npx vitest run --config vitest.config.lib.ts
 */
import { describe, it, expect } from 'vitest'
import { getStatusColor, getStatusBg } from '../statusColors'

describe('status colors keep each color in its one job', () => {
  it('red is spent only on overdue', () => {
    expect(getStatusColor('overdue')).toBe('var(--maroon)')
    for (const s of ['rejected', 'wont_fix', 'revision_due', 'withdrawn', 'blocked', 'at-risk']) {
      expect(getStatusColor(s), s).not.toBe('var(--maroon)')
      expect(getStatusBg(s), s).not.toContain('122, 0, 25')
    }
  })

  it("rejected and won't fix are neutral words", () => {
    expect(getStatusColor('rejected')).toBe('var(--slate)')
    expect(getStatusColor('wont_fix')).toBe('var(--slate)')
    expect(getStatusBg('rejected')).toBe(getStatusBg('withdrawn'))
    expect(getStatusBg('wont_fix')).toBe(getStatusBg('withdrawn'))
  })

  it('at-risk is going stale: orange', () => {
    expect(getStatusColor('at-risk')).toBe('var(--orange)')
    expect(getStatusBg('at-risk')).toContain('var(--orange)')
  })

  it('a revision due date wants you: gold (its overdue case is red in SubmissionTimeline)', () => {
    expect(getStatusColor('revision_due')).toBe('var(--gold)')
    expect(getStatusBg('revision_due')).toBe(getStatusBg('review'))
  })
})

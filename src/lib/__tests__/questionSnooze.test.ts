import { describe, it, expect } from 'vitest'
import { isQuestionOnCard, isQuestionSnoozed, questionSnoozedUntil, snoozeChoiceDays } from '../taskGrouping'
import table from './fixtures/question-snooze-cases.json'

// Snooze for "Needs you" questions (2026-10-22): due_date after today keeps a
// waiting or answered question off the card until the morning of that date.
// The table is shared with PB's is_snoozed (tests/questions/test_snooze_hub_parity.py).

type Row = Record<string, string | null | undefined>

function expand(row: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    out[k] = v === '$answer' ? table.answer : v === '$receipt' ? table.receipt : v
  }
  return out
}

describe('isQuestionSnoozed (shared parity table)', () => {
  for (const c of table.cases) {
    it(c.name, () => {
      const row = expand(c.row as Row)
      expect(isQuestionSnoozed(row, c.today)).toBe(c.snoozed)
      // A snoozed row is off the card; an unsnoozed waiting/answered row is on it.
      if (c.snoozed) expect(isQuestionOnCard(row, c.today)).toBe(false)
    })
  }
})

describe('questionSnoozedUntil', () => {
  it('returns the civil date only when it is after today', () => {
    expect(questionSnoozedUntil({ due_date: '2026-10-25' }, '2026-10-22')).toBe('2026-10-25')
    expect(questionSnoozedUntil({ due_date: '2026-10-22' }, '2026-10-22')).toBeNull()
    expect(questionSnoozedUntil({ due_date: null }, '2026-10-22')).toBeNull()
  })

  it('comes back on its own date with no write (pure function of row + today)', () => {
    const row = { kind: 'question', status: 'todo', question_answer_json: null, due_date: '2026-10-25' }
    expect(isQuestionOnCard(row, '2026-10-24')).toBe(false)
    expect(isQuestionOnCard(row, '2026-10-25')).toBe(true)
  })
})

describe('snoozeChoiceDays', () => {
  it('reads an integer 1..14 from payload.snooze_days', () => {
    expect(snoozeChoiceDays({ payload: { snooze_days: 3 } })).toBe(3)
    expect(snoozeChoiceDays({ payload: { snooze_days: 14, rr_key: 'Q01' } })).toBe(14)
  })

  it('is null for an answer choice or a bad value', () => {
    expect(snoozeChoiceDays({})).toBeNull()
    expect(snoozeChoiceDays({ payload: null })).toBeNull()
    expect(snoozeChoiceDays({ payload: { rr_key: 'Q01' } })).toBeNull()
    expect(snoozeChoiceDays({ payload: { snooze_days: 0 } })).toBeNull()
    expect(snoozeChoiceDays({ payload: { snooze_days: 15 } })).toBeNull()
    expect(snoozeChoiceDays({ payload: { snooze_days: 2.5 } })).toBeNull()
    expect(snoozeChoiceDays({ payload: { snooze_days: '3' } })).toBeNull()
    expect(snoozeChoiceDays(null)).toBeNull()
  })
})

// When Claude acts on an answered question (src/lib/answerEta.ts, 2026-11-02),
// and the count that answered rows left: Nick, "i technically answered these
// things... so what happens now. it still says these things need me."
// Times are built in local time, the same clock the rules read.

import { describe, it, expect } from 'vitest'
import { answerActsBy, answeredLine, UPSTREAM_ANSWER_EVERY_MIN } from '../answerEta'
import { cardQuestionCount } from '../taskGrouping'

const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi)
const row = (source: string, choice: string, at: Date) => ({
  source,
  kind: 'question',
  status: 'todo',
  question_answer_json: JSON.stringify({ v: 1, choice, via: 'hub', at: at.toISOString() }),
})

describe('answerActsBy', () => {
  const noon = local(2026, 11, 2, 12, 0)

  it('upstream skip: the listener tick, minutes away, around the clock', () => {
    expect(answerActsBy(row('upstream_brief', 'skip', noon))).toEqual(local(2026, 11, 2, 12, UPSTREAM_ANSWER_EVERY_MIN + 2))
    expect(answerActsBy(row('upstream_brief', 'byhand', local(2026, 11, 2, 23, 58)))).toEqual(local(2026, 11, 3, 0, 5))
  })

  it('upstream adopt: the next morning build, not minutes', () => {
    expect(answerActsBy(row('upstream_brief', 'adopt', noon))).toEqual(local(2026, 11, 3, 5, 25))
    expect(answerActsBy(row('upstream_brief', 'adopt', local(2026, 11, 2, 3, 0)))).toEqual(local(2026, 11, 2, 5, 25))
  })

  it('fix_approval: Build it waits for the 05:30 sweep; Not now the 15-minute poll inside 06:00-22:00; Other has no time', () => {
    expect(answerActsBy(row('fix_approval', 'yes', noon))).toEqual(local(2026, 11, 3, 6, 30))
    expect(answerActsBy(row('fix_approval', 'no', noon))).toEqual(local(2026, 11, 2, 12, 20))
    expect(answerActsBy(row('fix_approval', 'no', local(2026, 11, 2, 22, 30)))).toEqual(local(2026, 11, 3, 6, 20))
    expect(answerActsBy(row('fix_approval', 'other', noon))).toBeNull()
  })

  it('nightly_work_product needs the 02:00 pull before its 02:15 run', () => {
    expect(answerActsBy(row('nightly_work_product', 'linked', local(2026, 11, 2, 1, 0)))).toEqual(local(2026, 11, 2, 2, 55))
    expect(answerActsBy(row('nightly_work_product', 'linked', local(2026, 11, 2, 2, 5)))).toEqual(local(2026, 11, 3, 2, 55))
  })

  it('no known consumer, or an unreadable answer: null', () => {
    expect(answerActsBy(row('response_required', 'c1', noon))).toBeNull()
    expect(answerActsBy({ source: 'upstream_brief', question_answer_json: '{bad' })).toBeNull()
  })
})

describe('answeredLine', () => {
  const at = local(2026, 11, 2, 12, 0)
  const now = local(2026, 11, 2, 12, 1).toISOString()

  it('says the latest time across rows', () => {
    const line = answeredLine([row('upstream_brief', 'skip', at), row('meeting_match', 'c1', at)], now)
    expect(line.late).toBe(false)
    expect(line.text).toMatch(/^2 answers: Claude acts by /)
    expect(line.text).toContain(local(2026, 11, 2, 12, 40).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))
  })

  it('one row with no schedule turns the whole line into "is acting"', () => {
    expect(answeredLine([row('upstream_brief', 'skip', at), row('response_required', 'c1', at)], now).text)
      .toBe('Claude is acting on 2 answers')
  })

  it('a passed time reads late, never silent', () => {
    const line = answeredLine([row('upstream_brief', 'skip', at)], local(2026, 11, 2, 13, 0).toISOString())
    expect(line).toMatchObject({ late: true })
    expect(line.text).toMatch(/^1 answer: Claude is late, was due /)
  })
})

describe('cardQuestionCount', () => {
  it('counts waiting questions only, never answered ones', () => {
    const waiting = { source: 'meeting_match', kind: 'question', status: 'todo', question_answer_json: null }
    const answered = row('upstream_brief', 'skip', local(2026, 11, 2, 12, 0))
    expect(cardQuestionCount([waiting, answered, answered])).toBe(1)
    expect(cardQuestionCount([answered])).toBe(0)
  })
})

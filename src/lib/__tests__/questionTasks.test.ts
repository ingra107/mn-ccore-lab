import { describe, it, expect } from 'vitest'
import { isQuestionTask, isQuestionWaiting, isQuestionOnCard, questionCardState, parseQuestionSpec, parseQuestionAnswer } from '../taskGrouping'

// schema v111 / PB mig 130 (2026-09-17): kind='question' rows waiting on
// Nick's answer. See taskGrouping.ts and PB Scratch/plans/sequential-petting-sky.md.

const SPEC = JSON.stringify({
  v: 1,
  kind: 'meeting_match',
  prompt: 'Which meeting was this?',
  choices: [
    { key: 'c1', label: 'Pulmonary HSR Group Meeting', payload: { event_id: 'e1' } },
    { key: 'other', label: 'Other' },
  ],
  rec: 'c1',
  allow_text: true,
})

describe('isQuestionTask', () => {
  it('is true only for kind=question', () => {
    expect(isQuestionTask({ kind: 'question' })).toBe(true)
    expect(isQuestionTask({ kind: 'task' })).toBe(false)
    expect(isQuestionTask({ kind: 'milestone' })).toBe(false)
    expect(isQuestionTask({ kind: null })).toBe(false)
    expect(isQuestionTask({})).toBe(false)
  })
})

describe('isQuestionWaiting', () => {
  it('is true for an unanswered, open question', () => {
    expect(isQuestionWaiting({ kind: 'question', question_answer_json: null, status: 'todo' })).toBe(true)
  })

  it('is false once answered', () => {
    expect(isQuestionWaiting({
      kind: 'question',
      question_answer_json: '{"v":1,"choice":"c1","via":"hub","at":"2026-09-17T12:00:00Z"}',
      status: 'todo',
    })).toBe(false)
  })

  it('is false when the row is closed, answer or not', () => {
    expect(isQuestionWaiting({ kind: 'question', question_answer_json: null, status: 'done' })).toBe(false)
    expect(isQuestionWaiting({ kind: 'question', question_answer_json: null, status: 'deleted' })).toBe(false)
  })

  it('is false for a non-question task', () => {
    expect(isQuestionWaiting({ kind: 'task', question_answer_json: null, status: 'todo' })).toBe(false)
  })
})

// 2026-10-22: an answered question nothing had acted on showed on no surface.
const ANSWER = '{"v":1,"choice":"c1","via":"hub","at":"2026-10-12T11:46:51.313Z"}'
const receipt = (at: string) => JSON.stringify({ v: 1, consumer: 'fix_approval', at, answer_at: '2026-10-12T11:46:51.313Z', evidence: 'x' })

describe('questionCardState', () => {
  it('reads the three states off the row', () => {
    expect(questionCardState({ kind: 'question', question_answer_json: null, status: 'todo' })).toBe('waiting')
    expect(questionCardState({ kind: 'question', question_answer_json: ANSWER, status: 'todo' })).toBe('answered')
    expect(questionCardState({ kind: 'question', question_answer_json: ANSWER, status: 'in_progress' })).toBe('answered')
    expect(questionCardState({
      kind: 'question', question_answer_json: ANSWER, question_consumed_json: receipt('2026-10-12T12:00:00Z'), status: 'done',
    })).toBe('acted')
  })

  it('keeps deleted rows, receipt-less closes and non-questions off the card', () => {
    expect(questionCardState({ kind: 'question', question_answer_json: ANSWER, status: 'deleted' })).toBeNull()
    expect(questionCardState({ kind: 'question', question_answer_json: ANSWER, status: 'done' })).toBeNull()
    expect(questionCardState({ kind: 'question', question_answer_json: null, status: 'done' })).toBeNull()
    expect(questionCardState({ kind: 'task', question_answer_json: null, status: 'todo' })).toBeNull()
  })

  it('reads the answer the way PB does: JSON null is unanswered, junk is neither', () => {
    expect(questionCardState({ kind: 'question', question_answer_json: 'null', status: 'todo' })).toBe('waiting')
    for (const junk of ['{bad', '{}', '', '[]', '{"v":1,"choice":"other","via":"hub","at":"x"}', '{"v":1,"choice":"c1","via":"email","at":"x"}']) {
      expect(questionCardState({ kind: 'question', question_answer_json: junk, status: 'todo' }), junk).toBeNull()
    }
  })

  it('counts acted only for a known consumer whose answer_at matches the answer', () => {
    const row = (consumed: string) => ({ kind: 'question', question_answer_json: ANSWER, question_consumed_json: consumed, status: 'done' })
    expect(questionCardState(row(receipt('2026-10-12T12:00:00Z')))).toBe('acted')
    expect(questionCardState(row(JSON.stringify({ v: 1, consumer: 'fix_approval', at: 'x', answer_at: '2026-10-01T00:00:00Z', evidence: 'x' })))).toBeNull()
    expect(questionCardState(row(JSON.stringify({ v: 1, consumer: 'a_person', at: 'x', answer_at: '2026-10-12T11:46:51.313Z', evidence: 'x' })))).toBeNull()
    expect(questionCardState(row(JSON.stringify({ v: 1, consumer: 'fix_approval', at: 'x', answer_at: '2026-10-12T11:46:51.313Z' })))).toBeNull()
    expect(questionCardState(row('null'))).toBeNull()
  })
})

describe('isQuestionOnCard', () => {
  it('holds waiting and answered rows however old the answer', () => {
    expect(isQuestionOnCard({ kind: 'question', question_answer_json: null, status: 'todo' }, '2026-10-22')).toBe(true)
    expect(isQuestionOnCard({ kind: 'question', question_answer_json: ANSWER, status: 'todo' }, '2026-10-22')).toBe(true)
  })

  it('holds an acted-on row only on the local day its receipt landed', () => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const acted = { kind: 'question', question_answer_json: ANSWER, question_consumed_json: receipt(now.toISOString()), status: 'done' }
    expect(isQuestionOnCard(acted, today)).toBe(true)
    expect(isQuestionOnCard(acted, '1999-01-01')).toBe(false)
  })

  it('drops deleted rows', () => {
    expect(isQuestionOnCard({ kind: 'question', question_answer_json: ANSWER, status: 'deleted' }, '2026-10-22')).toBe(false)
  })
})

describe('parseQuestionSpec', () => {
  it('parses a well-formed spec', () => {
    const spec = parseQuestionSpec({ question_spec_json: SPEC })
    expect(spec).not.toBeNull()
    expect(spec!.prompt).toBe('Which meeting was this?')
    expect(spec!.choices).toHaveLength(2)
    expect(spec!.rec).toBe('c1')
  })

  it('returns null for missing spec', () => {
    expect(parseQuestionSpec({ question_spec_json: null })).toBeNull()
    expect(parseQuestionSpec({})).toBeNull()
  })

  it('returns null for malformed JSON rather than throwing', () => {
    expect(() => parseQuestionSpec({ question_spec_json: '{not json' })).not.toThrow()
    expect(parseQuestionSpec({ question_spec_json: '{not json' })).toBeNull()
  })

  it('returns null for a shape missing prompt/choices', () => {
    expect(parseQuestionSpec({ question_spec_json: JSON.stringify({ v: 1 }) })).toBeNull()
  })
})

describe('parseQuestionAnswer', () => {
  it('parses a well-formed answer', () => {
    const answer = parseQuestionAnswer({
      question_answer_json: JSON.stringify({ v: 1, choice: 'c1', via: 'hub', at: '2026-09-17T12:00:00Z' }),
    })
    expect(answer).not.toBeNull()
    expect(answer!.choice).toBe('c1')
  })

  it('returns null for null/malformed answer', () => {
    expect(parseQuestionAnswer({ question_answer_json: null })).toBeNull()
    expect(parseQuestionAnswer({ question_answer_json: '{bad' })).toBeNull()
  })
})

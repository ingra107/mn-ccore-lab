import { describe, it, expect } from 'vitest'
import { isQuestionTask, isQuestionWaiting, parseQuestionSpec, parseQuestionAnswer } from '../taskGrouping'

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

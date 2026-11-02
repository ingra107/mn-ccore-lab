// The one-off fold of tasks.description_json into tasks.description.
// Pure planner: scripts/description-json-fold-plan.ts. REMOVE WITH THE COLUMN DROP.
// Run: npx vitest run --config vitest.config.api.ts api/lib/description-json-fold-plan.test.ts

import { describe, it, expect } from 'vitest'
import { planDescriptionJsonFold } from '../../scripts/description-json-fold-plan'
import { descriptionJsonFold } from '../../src/lib/tiptapToMarkdown'

const json = (text: string) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const setOf = (apply: string) => apply.match(/SET description = '([\s\S]*?)', description_json = NULL/)![1]

describe('planDescriptionJsonFold', () => {
  it('fills an empty description, clears the JSON, guards on both columns, and rolls both back', () => {
    const j = json("Amy's budget")
    const plan = planDescriptionJsonFold([{ id: 't1', title: 'T', description: null, description_json: j }])
    expect(plan.count).toBe(1)
    expect(plan.descriptionChanges).toBe(1)
    expect(plan.apply).toContain("SET description = 'Amy''s budget', description_json = NULL")
    expect(plan.apply).toContain("WHERE id = 't1' AND description IS NULL AND description_json IS '")
    expect(plan.rollback).toContain('SET description = NULL, description_json = \'{"type":"doc"')
    expect(plan.rollback).toContain("AND description IS 'Amy''s budget' AND description_json IS NULL;")
  })

  it('appends to a description that says something else; the meeting marker stays last', () => {
    const plan = planDescriptionJsonFold([{ id: 't2', description: 'PB later write [meeting:cal-1:abc]', description_json: json('panel edit') }])
    expect(setOf(plan.apply)).toBe('PB later write\n\n---\n\npanel edit [meeting:cal-1:abc]')
    expect(plan.detail[0]).toContain('[append]')
  })

  it('supersedes when the JSON is the loaded description plus an addition (the one prod row)', () => {
    const stored = 'From the meeting.\n\nSource: [[x.md]]\n\n[meeting:cal-1:abc]'
    const edited = JSON.stringify({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Send Shurui the list!!' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'From the meeting.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Source: [[x.md]]' }] },
    ] })
    // Default: suggested, never automatic -- every stored word is kept.
    const auto = planDescriptionJsonFold([{ id: 't5', description: stored, description_json: edited }])
    expect(auto.detail[0]).toContain('supersede SUGGESTED')
    expect(auto.detail[0]).toContain('--replace t5')
    expect(setOf(auto.apply)).toBe('From the meeting.\n\nSource: [[x.md]]\n\n---\n\nSend Shurui the list!!\n\nFrom the meeting.\n\nSource: [[x.md]]\n\n[meeting:cal-1:abc]')
    // Named by the operator after reading the dry run: typed line, PB text, marker last.
    const named = planDescriptionJsonFold([{ id: 't5', description: stored, description_json: edited }], { replace: ['t5'] })
    expect(setOf(named.apply)).toBe('Send Shurui the list!!\n\nFrom the meeting.\n\nSource: [[x.md]]\n\n[meeting:cal-1:abc]')
  })

  it('a later trim is never reverted by default (refuter revert repro)', () => {
    const plan = planDescriptionJsonFold([{ id: 'x', description: 'Alpha beta gamma.', description_json: json('Alpha beta gamma. Remove this wrong sentence.') }])
    // The trimmed description is kept whole; the JSON only rides below a rule.
    expect(setOf(plan.apply).startsWith('Alpha beta gamma.\n\n---\n\n')).toBe(true)
  })

  it('a --replace id takes the JSON text alone and keeps the meeting marker', () => {
    const plan = planDescriptionJsonFold(
      [{ id: 't3', description: 'old. [meeting:cal-1:abc]', description_json: json('new text') }],
      { replace: ['t3'] },
    )
    expect(setOf(plan.apply)).toBe('new text [meeting:cal-1:abc]')
  })

  it('clears the JSON on EVERY row, leaving description as is where nothing is missing or the JSON is unreadable', () => {
    const plan = planDescriptionJsonFold([
      { id: 'a', description: 'same words here', description_json: json('Same words, here.') },
      { id: 'b', description: null, description_json: json('x'), deleted_at: '2026-10-01' },
      { id: 'c', description: 'kept', description_json: '{bad' },
      { id: 'd', description: 'x', description_json: null },
    ])
    expect(plan.count).toBe(3) // d has no JSON: untouched
    expect(plan.descriptionChanges).toBe(1) // only b (fill)
    const lines = plan.apply.split('\n')
    expect(lines[0]).toContain("SET description = 'same words here', description_json = NULL")
    expect(lines[1]).toContain("SET description = 'x', description_json = NULL")
    expect(lines[2]).toContain("SET description = 'kept', description_json = NULL")
    expect(plan.detail[1]).toContain('deleted 2026-10-01')
    expect(plan.detail[2]).toContain('[unparseable]')
    expect(plan.detail[2]).toContain('{bad')
  })

  it('after the fold no row holds JSON, so a later trim cannot bring the old text back (refuter post-fold repro)', () => {
    const text = 'We need to send Shurui the list.\n\nFrom the meeting.'
    const j = json(text)
    const stored = 'From the meeting. [meeting:cal-1:abc]'
    const plan = planDescriptionJsonFold([{ id: 't6', description: stored, description_json: j }])
    expect(plan.apply).toContain('description_json = NULL')
    // The post-fold row: description_json is NULL, so the fallback sees nothing for ANY later description.
    expect(descriptionJsonFold('From the meeting. [meeting:cal-1:abc]', null)).toEqual({ kind: 'none' })
    expect(descriptionJsonFold('[meeting:cal-1:abc]', null)).toEqual({ kind: 'none' })
    // And re-planning the folded row writes nothing (it no longer has JSON).
    expect(planDescriptionJsonFold([{ id: 't6', description: setOf(plan.apply), description_json: null }]).count).toBe(0)
  })
})

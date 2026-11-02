// The one-off fold of tasks.description_json into tasks.description.
// Pure planner: scripts/description-json-fold-plan.ts. REMOVE WITH THE COLUMN DROP.
// Run: npx vitest run --config vitest.config.api.ts api/lib/description-json-fold-plan.test.ts

import { describe, it, expect } from 'vitest'
import { planDescriptionJsonFold } from '../../scripts/description-json-fold-plan'

const json = (text: string) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

describe('planDescriptionJsonFold', () => {
  it('fills an empty description, guarded on NULL, with a matching rollback', () => {
    const plan = planDescriptionJsonFold([{ id: 't1', title: 'T', description: null, description_json: json("Amy's budget") }])
    expect(plan.count).toBe(1)
    expect(plan.apply).toContain("SET description = 'Amy''s budget'")
    expect(plan.apply).toContain("WHERE id = 't1' AND description IS NULL;")
    expect(plan.rollback).toContain("SET description = NULL")
    expect(plan.rollback).toContain("AND description IS 'Amy''s budget';")
    expect(plan.apply).not.toContain('description_json')
  })

  it('appends to a description that says something else, so neither text is lost', () => {
    const plan = planDescriptionJsonFold([{ id: 't2', description: 'PB later write', description_json: json('panel edit') }])
    expect(plan.apply).toContain("SET description = 'PB later write\n\n---\n\npanel edit'")
    expect(plan.apply).toContain("AND description IS 'PB later write';")
    expect(plan.detail[0]).toContain('[append]')
  })

  it('a --replace id takes the JSON text alone and keeps the meeting marker', () => {
    const plan = planDescriptionJsonFold(
      [{ id: 't3', description: 'old. [meeting:cal-1:abc]', description_json: json('new text') }],
      { replace: ['t3'] },
    )
    expect(plan.apply).toContain("SET description = 'new text [meeting:cal-1:abc]'")
  })

  it('skips rows already folded, deleted, unparseable or without JSON', () => {
    const plan = planDescriptionJsonFold([
      { id: 'a', description: 'same words here', description_json: json('Same words, here.') },
      { id: 'b', description: null, description_json: json('x'), deleted_at: '2026-10-01' },
      { id: 'c', description: null, description_json: '{bad' },
      { id: 'd', description: 'x', description_json: null },
    ])
    expect(plan.count).toBe(0)
    expect(plan.apply).toBe('')
    expect(plan.skipped).toEqual([
      'a  nothing to fold: description already holds its text',
      'b  deleted (2026-10-01)',
      'c  description_json is not a parseable document',
    ])
  })

  it('a folded row plans nothing on a re-run (the apply is idempotent by construction)', () => {
    const first = planDescriptionJsonFold([{ id: 't4', description: 'PB', description_json: json('panel') }])
    const after = first.apply.match(/SET description = '([\s\S]*?)', updated_at/)![1]
    expect(planDescriptionJsonFold([{ id: 't4', description: after, description_json: json('panel') }]).count).toBe(0)
  })
})

// mnccore://run/<task id> (the teal Run button, 2026-11-02). The URI carries the task id
// only; the builder refuses anything mnccore_handler.py's TASK_ID_RE would refuse.
import { describe, it, expect } from 'vitest'
import { buildRunSkillUri, SKILL_NAME_RE } from '../urlClassify'

const TASK = 'task_01M6CZS7KZGSA0663NBB3H4HMG'

describe('buildRunSkillUri', () => {
  it('builds the run verb from a task id and nothing else', () => {
    expect(buildRunSkillUri(TASK)).toBe(`mnccore://run/${TASK}`)
  })

  for (const bad of [
    '', 'weekly-review', `${TASK}/weekly-review`, `${TASK}\n`, `${TASK}&calc`,
    'task_01M6CZS7KZGSA0663NBB3H4HM', 'task_01M6CZS7KZGSA0663NBB3H4HMI',
    'task_01m6czs7kzgsa0663nbb3h4hmg', 'proj_01M6CZS7KZGSA0663NBB3H4HMG', 'rec123',
  ]) {
    it(`refuses ${JSON.stringify(bad)}`, () => {
      expect(buildRunSkillUri(bad)).toBeNull()
    })
  }
})

describe('SKILL_NAME_RE', () => {
  it('accepts skill directory names and nothing that could build a path', () => {
    expect(SKILL_NAME_RE.test('mnccore-agenda')).toBe(true)
    for (const bad of ['', '../x', 'a/b', 'A', 'x.md', 'x y', '-x']) expect(SKILL_NAME_RE.test(bad)).toBe(false)
  })
})

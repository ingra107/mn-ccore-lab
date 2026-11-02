// mnccore://prep/<task id> (Prep & start, 2026-11-02). The URI carries the task id
// only; the builder refuses anything mnccore_handler.py's TASK_ID_RE would refuse.
import { describe, it, expect } from 'vitest'
import { buildPrepStartUri } from '../urlClassify'

const TASK = 'task_01M6CZS7KZGSA0663NBB3H4HMG'

describe('buildPrepStartUri', () => {
  it('builds the prep verb from a task id and nothing else', () => {
    expect(buildPrepStartUri(TASK)).toBe(`mnccore://prep/${TASK}`)
  })

  for (const bad of [
    '', `${TASK}/x`, `${TASK}\n`, `${TASK}&calc`, 'task_01M6CZS7KZGSA0663NBB3H4HM',
    'task_01M6CZS7KZGSA0663NBB3H4HMI', 'task_01m6czs7kzgsa0663nbb3h4hmg', 'proj_01M6CZS7KZGSA0663NBB3H4HMG',
  ]) {
    it(`refuses ${JSON.stringify(bad)}`, () => {
      expect(buildPrepStartUri(bad)).toBeNull()
    })
  }
})

// Milestone placement golden vectors.
//
// Loads ./milestone_vectors.json and asserts the Today page's pipeline —
// getGroupForTask, then interleaveMilestones per group — produces the expected
// ordered rows. The cases began as a PB<->Hub parity contract with PB's
// TODAY.md renderer; that renderer and its generator retired on 2026-10-11
// (archived in PB), so the JSON is now a Hub-owned fixture: edit it by hand.
//
// Run: npx vitest run --config vitest.config.lib.ts src/lib/__tests__/milestoneVectors.test.ts
import { describe, it, expect } from 'vitest'
import { interleaveMilestones, type MilestoneEntry } from '../taskGrouping'
import { getGroupForTask, type GroupKey } from '../../components/today/constants'
import type { TaskRow } from '../api'
import vectors from './milestone_vectors.json'

interface VectorTask {
  id: string
  kind: string
  due_date: string | null
  deadline: string | null
  group_override: GroupKey | null
}
interface Row { id: string; role: string | null; date: string | null }
interface VectorCase { name: string; today: string; tasks: VectorTask[]; expected: Record<string, Row[]> }

const civil = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)

function run(c: VectorCase): Record<string, Row[]> {
  const groups = new Map<GroupKey, TaskRow[]>()
  for (const v of c.tasks) {
    const t = { id: v.id, title: v.id, kind: v.kind, due_date: v.due_date, deadline: v.deadline, group_override: v.group_override } as unknown as TaskRow
    const g = getGroupForTask(t, new Map())
    groups.set(g, [...(groups.get(g) ?? []), t])
  }
  const out: Record<string, Row[]> = {}
  for (const [g, list] of groups) {
    out[g] = (interleaveMilestones(list, c.today) as MilestoneEntry[]).map((e) => ({
      id: e.id,
      role: e.milestoneRole ?? null,
      date: e.milestoneRole ? civil(e.milestoneDate) : civil(e.due_date),
    }))
  }
  return out
}

describe('milestone placement golden vectors (PB parity)', () => {
  it('carries contract_version 1', () => {
    expect(vectors.contract_version).toBe(1)
  })

  for (const c of vectors.cases as VectorCase[]) {
    it(c.name, () => {
      expect(run(c)).toEqual(c.expected)
    })
  }
})

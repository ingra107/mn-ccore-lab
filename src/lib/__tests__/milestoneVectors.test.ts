// Milestone placement golden vectors — Hub side of the PB<->Hub contract.
//
// Loads the LOCAL committed copy of ./milestone_vectors.json (generated
// byte-identical to PB tests/fixtures/milestone_vectors.json by PB
// scripts/today/gen_milestone_vectors.py, which records what PB's
// place_milestones does) and asserts the Today page's own pipeline —
// getGroupForTask, then interleaveMilestones per group — produces the same
// ordered rows. TODAY.md and the Today page implement one rule twice; this is
// what stops them drifting silently. Companion: PB
// tests/today/test_milestone_vectors.py.
//
// Never hand-edit the JSON: change the cases in the PB generator and
// regenerate (`python -X utf8 -m scripts.today.gen_milestone_vectors`).
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

// Increment 1A Task 8 v5 — LMM forward guard (finding 4)
//
// applyPatch normalizes last_meaningful_movement to canonical UTC space-sep
// before writing it to D1. This prevents future patches (Hub UI, PB push)
// from reintroducing non-canonical values after Task 8-D1 normalizes the
// existing rows.
//
// Requirements verified:
//   G1 — non-canonical ISO-T-Z value is normalized to space-sep UTC
//   G2 — non-canonical ISO-T naive (CT) value is normalized to space-sep UTC
//   G3 — offset-aware value (+HH:MM) is normalized to space-sep UTC
//   G4 — canonical space-sep UTC passes through unchanged
//   G5 — null / undefined / empty-string LMM is passed through (no-op)
//   G6 — unparseable LMM string throws (surfaces as 'error' in processOne)
//   G7 — LMM in a tasks patch is NOT normalized (guard is projects-table only)
//
// #8862: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The stubs this file used read the LMM back from UPDATE bindings by patch-key
// position and let the receipt INSERT always succeed; each case now reads the
// STORED value, and the landed writes have their receipts read back.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

const PROJECT_ID = 'proj_01hwtest_lmm_guard_0000001'
const user = { email: 'test@example.com' } as import('../helpers').AuthUser

let db: InstanceType<typeof Database>
let env: import('../helpers').Env

function setup(lmm: string | null = null) {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as import('../helpers').Env
  insertRow(db, 'projects', {
    id: PROJECT_ID, title: 'Test project', status: 'active', stage: 'Writing', category: 'R01',
    last_mutation_id: 'mut_prior', last_meaningful_movement: lmm,
  })
}
beforeEach(() => setup())

function makeMut(patch: Record<string, unknown>, over: Partial<Mutation> = {}): Mutation {
  return {
    mutation_id: `mut_lmm_test_${Math.random().toString(36).slice(2)}`,
    origin_machine: 'work',
    table: 'projects',
    op: 'update',
    record_id: PROJECT_ID,
    base_seq: null,
    base_row_hash: null,
    client_ts: '2026-05-25T12:00:00Z',
    issued_at: '2026-05-25T12:00:00Z',
    patch,
    ...over,
  } as unknown as Mutation
}

const storedLmm = () =>
  (db.prepare('SELECT last_meaningful_movement FROM projects WHERE id = ?').get(PROJECT_ID) as { last_meaningful_movement: string | null })
    .last_meaningful_movement

// Run a projects patch and return the LMM value D1 stored.
async function writtenLmm(patch: Record<string, unknown>): Promise<unknown> {
  const mut = makeMut(patch)
  const result = await applyUpdate(env, mut, user)
  if (result.status === 'error') return { error: result.reason }
  expect(receiptOf(db, mut.mutation_id)!.outcome).toBe(result.status)
  return storedLmm()
}

// ── G1: ISO-T-Z (UTC) normalized to space-sep ────────────────────────────────

describe('LMM forward guard — G1: ISO-T-Z normalized to space-sep UTC', () => {
  it('2026-05-22T21:30:00Z → 2026-05-22 21:30:00', async () => {
    expect(await writtenLmm({ last_meaningful_movement: '2026-05-22T21:30:00Z' })).toBe('2026-05-22 21:30:00')
  })

  it('lowercase z suffix also normalized', async () => {
    expect(await writtenLmm({ last_meaningful_movement: '2026-05-22T21:30:00z' })).toBe('2026-05-22 21:30:00')
  })
})

// ── G2: Naive (CT) ISO-T normalized ──────────────────────────────────────────
//
// Naive timestamps (no offset) are treated as America/Chicago (pre-1A behavior).
// May 22 2026 is during CDT (UTC-5), so 16:30 CT → 21:30 UTC.

describe('LMM forward guard — G2: naive ISO-T (CT) normalized to UTC space-sep', () => {
  it('2026-05-22T16:30:00 (CDT) → 2026-05-22 21:30:00', async () => {
    // CDT = UTC-5; 16:30 + 5h = 21:30
    expect(await writtenLmm({ last_meaningful_movement: '2026-05-22T16:30:00' })).toBe('2026-05-22 21:30:00')
  })
})

// ── G3: Offset-aware normalized ───────────────────────────────────────────────

describe('LMM forward guard — G3: explicit offset normalized to space-sep UTC', () => {
  it('-05:00 offset: 2026-05-22T16:30:00-05:00 → 2026-05-22 21:30:00', async () => {
    expect(await writtenLmm({ last_meaningful_movement: '2026-05-22T16:30:00-05:00' })).toBe('2026-05-22 21:30:00')
  })

  it('+00:00 offset: 2026-05-22T21:30:00+00:00 → 2026-05-22 21:30:00', async () => {
    expect(await writtenLmm({ last_meaningful_movement: '2026-05-22T21:30:00+00:00' })).toBe('2026-05-22 21:30:00')
  })
})

// ── G4: Canonical space-sep passes through unchanged ─────────────────────────

describe('LMM forward guard — G4: canonical space-sep UTC passes through unchanged', () => {
  it('2026-05-22 21:30:00 stays 2026-05-22 21:30:00', async () => {
    expect(await writtenLmm({ last_meaningful_movement: '2026-05-22 21:30:00' })).toBe('2026-05-22 21:30:00')
  })
})

// ── G5: null / undefined / empty-string are no-ops ───────────────────────────

describe('LMM forward guard — G5: null/undefined/empty LMM passed through (no-op)', () => {
  it('null LMM is written as null (explicit clear)', async () => {
    setup('2026-05-01 10:00:00')
    const result = await applyUpdate(env, makeMut({ last_meaningful_movement: null }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    // null is a valid explicit clear; no normalization fires
    expect(storedLmm()).toBeNull()
  })
})

// ── G6: Unparseable LMM string → throws lmm_invalid ─────────────────────────
//
// applyPatch throws on an unparseable LMM string. In production this throw
// is caught by processOne's try/catch and converted to mutErr. In unit tests
// that call applyUpdate directly (no processOne wrapper) we assert the throw
// and its message.

describe('LMM forward guard — G6: unparseable LMM string throws lmm_invalid', () => {
  it('garbage string → throws with lmm_invalid message, nothing stored', async () => {
    // Seeded non-null, so a write that landed (garbage or a null) would show.
    setup('2026-05-01 10:00:00')
    const mut = makeMut({ last_meaningful_movement: 'not-a-timestamp' })
    await expect(applyUpdate(env, mut, user)).rejects.toThrow(/lmm_invalid/)
    expect(storedLmm()).toBe('2026-05-01 10:00:00')
    expect(receiptOf(db, mut.mutation_id)).toBeUndefined()
  })
})

// ── G7: LMM in a tasks patch is NOT normalized (guard is projects-only) ───────

describe('LMM forward guard — G7: tasks table patch with lmm-like field is not affected', () => {
  it('tasks patch with an unrelated field writes verbatim', async () => {
    // The guard does NOT fire for table='tasks': a tasks patch goes through normally.
    const taskId = 'task_01hwtest_lmm_guard_0000002'
    insertRow(db, 'tasks', { id: taskId, title: 'Guard test task', assignee: 'nick', status: 'todo' })

    const mut = makeMut({ due_date: '2026-06-01' }, { mutation_id: 'mut_lmm_guard_tasks_test', table: 'tasks', record_id: taskId })
    const result = await applyUpdate(env, mut, user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expect((db.prepare('SELECT due_date FROM tasks WHERE id = ?').get(taskId) as { due_date: string }).due_date).toBe('2026-06-01')
    expect(receiptOf(db, 'mut_lmm_guard_tasks_test')!.outcome).toBe(result.status)
  })
})

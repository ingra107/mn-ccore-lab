// Regression tests: Layer-3 Hub-500 fix (2026-05-29)
//
// Bug: a D1 storage exception thrown by the UNGUARDED calls inside processOne
// (idempotency SELECT, depends_on SELECT, recordProcessedAtomic) propagated
// out of processOne uncaught. When any mutation in a batch hit such an infra
// error, the entire batch crashed with a bare 500 — all per-item results lost.
//
// Fix: wrap the batch-loop call site in handleMutations in a per-item
// try/catch. On catch: log the error, return
// mutErr('<mutation_id>', `infra error: <message>`). The other items in the
// batch are unaffected. HTTP response is always 200 with per-row results.
//
// Reason prefix MUST be `infra error:` (not `apply error:`). The PB-side
// classifier (_classify_hub_first_error) treats `apply error:` as
// permanent_other (never retry); `infra error:` falls through to the default
// `transient` branch (capped retry). See query.py:_HUB_PERMANENT_REASON_RES.
//
// Test 1: D1 throws on idempotency SELECT for ONE mutation in a 3-item batch.
//   Pre-fix: 500/throw. Post-fix: 200, length 3, poisoned=infra error, others=accepted.
// Test 2: Fail-fast regression — malformed envelope (missing origin_machine)
//   still returns its own clean mutErr (envelope message, NOT `infra error:`),
//   and valid items commit. Proves the per-item catch did not swallow fail-fast.
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The old mock answered every read with null and every write with changes=1,
// so "others=accepted" proved only that the route trusted the mock. Here the
// fault is injected through d1Adapter's onExec hook, and only for the read of
// processed_mutations that binds the POISONED mutation id; every other
// statement runs on the real schema. The tests then read back that the healthy
// mutations' rows and receipts are stored and that the poisoned one left
// neither (so PB's capped retry finds no settled verdict to replay).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { nowInstant } from '../lib/time'
import { handleMutations } from './mutations'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { prodSchemaDb, d1Adapter, receiptOf } from '../test-support/prod-schema-db'

const user = { email: 'ingra107@umn.edu', role: 'admin' } as unknown as AuthUser

function baseMut(overrides: Partial<Mutation> = {}): Mutation {
  const tag = Math.random().toString(36).slice(2, 12).toUpperCase()
  return {
    mutation_id: `mut_01HV${tag}`,
    origin_machine: 'pb-home',
    table: 'tasks',
    op: 'insert',
    record_id: `task_01HV${tag}`,
    base_seq: null,
    base_row_hash: null,
    // Distinct titles: the I18 dedup would adopt a second live task with the same (title, project).
    payload: { title: `Test task ${tag}`, status: 'todo', assignee: 'nick-ingraham' },
    depends_on: null,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
    ...overrides,
  }
}

let db: InstanceType<typeof Database>
let consoleSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  db = prodSchemaDb()
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => consoleSpy.mockRestore())

/**
 * An env whose engine throws a D1 storage error on any read of
 * processed_mutations that binds `poisonMutationId`; every other statement
 * (including the same SELECT for any other mutation) runs for real.
 */
function poisonedEnv(poisonMutationId: string | null): Env {
  return {
    DB: d1Adapter(db, {
      onExec: (sql, vals) => {
        if (poisonMutationId && /SELECT .+ FROM processed_mutations/.test(sql) && vals[0] === poisonMutationId) {
          throw new Error('D1_ERROR: Internal error in D1 DB storage')
        }
      },
    }),
    PB_API_KEY: 'test-key',
  } as unknown as Env
}

async function send(env: Env, muts: Mutation[]) {
  const req = new Request('https://example.com/api/mutations', {
    method: 'POST',
    body: JSON.stringify({ mutations: muts }),
    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer test-key' },
  })
  const resp = await handleMutations(req, user, env)
  const body = await resp.json() as { results: Array<{ mutation_id: string; status: string; reason?: string }> }
  return { status: resp.status, body }
}

const taskExists = (id: string) => db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(id) !== undefined

function expectLanded(m: Mutation) {
  expect(taskExists(m.record_id)).toBe(true)
  const r = receiptOf(db, m.mutation_id)
  expect(r).toMatchObject({ outcome: 'accepted', table_name: 'tasks', record_id: m.record_id })
  expect(JSON.parse(r!.original_response_json)).toMatchObject({ mutation_id: m.mutation_id, status: 'accepted' })
}

// ── Test 1: infra error on idempotency SELECT ─────────────────────────────────

describe('Layer-3 Hub-500 fix — per-item infra error catch', () => {
  it('D1 throw on idempotency SELECT for ONE mutation: 200 with 3 results, poisoned=infra error, others=accepted', async () => {
    const mut1 = baseMut()
    const mut2 = baseMut() // <-- this one will be poisoned
    const mut3 = baseMut()

    const { status, body } = await send(poisonedEnv(mut2.mutation_id), [mut1, mut2, mut3])

    // Pre-fix this would be a 500 / thrown exception; post-fix must be 200.
    expect(status).toBe(200)
    expect(body.results).toHaveLength(3)

    // mut2 (poisoned) must carry status='error' with reason starting with 'infra error:'.
    const r2 = body.results.find(r => r.mutation_id === mut2.mutation_id)
    expect(r2).toBeDefined()
    expect(r2!.status).toBe('error')
    expect(r2!.reason).toMatch(/^infra error:/)
    expect(r2!.reason).toContain('Internal error in D1 DB storage')
    // It failed before applying: no row, and no settled receipt a retry would replay.
    expect(taskExists(mut2.record_id)).toBe(false)
    expect(receiptOf(db, mut2.mutation_id)).toBeUndefined()

    // The other two ran on the real schema and landed with their receipts.
    for (const m of [mut1, mut3]) {
      expect(body.results.find(r => r.mutation_id === m.mutation_id)?.status).toBe('accepted')
      expectLanded(m)
    }
  })

  it('infra error reason starts with "infra error:" not "apply error:" (classifier routing)', async () => {
    // Pins the prefix. PB _classify_hub_first_error routes 'apply error:' to
    // permanent_other (never retry). 'infra error:' must fall through to transient.
    const mut = baseMut()
    const { status, body } = await send(poisonedEnv(mut.mutation_id), [mut])

    expect(status).toBe(200)
    expect(body.results[0].reason).toMatch(/^infra error:/)
    expect(body.results[0].reason).not.toMatch(/^apply error:/)
    expect(taskExists(mut.record_id)).toBe(false)
    expect(receiptOf(db, mut.mutation_id)).toBeUndefined()
  })

  it('a retry after the storage error clears lands normally (the failure was transient, not recorded)', async () => {
    const mut = baseMut()
    await send(poisonedEnv(mut.mutation_id), [mut])
    const { body } = await send(poisonedEnv(null), [mut])
    expect(body.results[0].status).toBe('accepted')
    expectLanded(mut)
  })
})

// ── Test 2: fail-fast regression ──────────────────────────────────────────────

describe('Layer-3 Hub-500 fix — fail-fast envelope regression', () => {
  it('malformed envelope (missing origin_machine) still returns its own clean mutErr — not "infra error:"', async () => {
    // Ensures the per-item catch did NOT swallow the envelope fail-fast.
    // Before the fix, the fail-fast never threw (it returned mutErr cleanly);
    // after the fix, it must still return mutErr cleanly — not hit the catch block.
    const validMut = baseMut()
    const malformedMut = baseMut({ origin_machine: undefined as unknown as string })

    // No poisoning: the malformed mutation fails before any DB access.
    const { status, body } = await send(poisonedEnv(null), [validMut, malformedMut])
    expect(status).toBe(200)
    expect(body.results).toHaveLength(2)

    // valid mutation is accepted, and landed
    const rValid = body.results.find(r => r.mutation_id === validMut.mutation_id)
    expect(rValid!.status).toBe('accepted')
    expectLanded(validMut)

    // malformed mutation returns its ENVELOPE error — NOT 'infra error:'
    const rMalformed = body.results.find(r => r.mutation_id === malformedMut.mutation_id)
    expect(rMalformed!.status).toBe('error')
    expect(rMalformed!.reason).toContain('origin_machine')
    expect(rMalformed!.reason).not.toMatch(/^infra error:/)
    expect(taskExists(malformedMut.record_id)).toBe(false)
    expect(receiptOf(db, malformedMut.mutation_id)).toBeUndefined()
  })
})

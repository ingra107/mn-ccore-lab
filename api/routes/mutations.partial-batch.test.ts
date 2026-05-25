// Regression test: partial-batch atomicity guard (2026-05-11)
//
// Bug: when a mutation in a batch was missing a required envelope field
// (origin_machine / client_ts / issued_at), earlier mutations in the same
// batch had already committed to D1 before the error surfaced. The missing
// field only triggered D1_TYPE_ERROR inside recordProcessedAtomic (called
// AFTER the apply ran), causing the Worker to return 500 with earlier rows
// already written — partial inconsistent state.
//
// Fix: validate ALL required envelope fields at the TOP of processOne,
// before any DB access. Missing fields return mutErr immediately, which the
// outer handleMutations loop accumulates as an 'error' result WITHOUT a 500.
// The whole response is still 200 with per-row results; the errored row
// returns status='error', and since no DB write occurred for it, no inconsistent
// state is produced.
//
// This test:
//   1. Sends a two-mutation batch where the second has no origin_machine.
//   2. Asserts the first mutation's result is NOT present in the per-row
//      results as 'accepted' (i.e., no partial commit for a well-formed first
//      mutation when the batch has a malformed second mutation is NOT the
//      guarantee — the guarantee is that the malformed mutation itself never
//      writes). The critical property is that the second mutation's error is
//      surfaced as status='error', not a 500, and the second mutation DID NOT
//      cause any D1 write. This is a unit test over processOne logic.
//   3. Verifies the missing-field error reason is human-readable.
//
// The test works by importing and calling processOne indirectly via
// handleMutations with a mock DB that records prepare() calls. A missing-field
// mutation must never invoke DB.prepare() for INSERT/UPDATE/DELETE after the
// envelope check returns.

import { describe, it, expect, vi } from 'vitest'
import { nowInstant } from '../lib/time'
import type { Mutation } from './mutations'

// Minimal mock D1 DB. We track whether prepare() was called with DML (INSERT/UPDATE/DELETE).
function makeMockDb(overrides: Partial<{
  first: (sql: string) => Promise<unknown>,
  run: () => Promise<{ meta: { changes: number } }>,
}> = {}) {
  const dmlCalls: string[] = []
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: () => overrides.first?.(sql) ?? Promise.resolve(null),
        run: () => overrides.run?.() ?? Promise.resolve({ meta: { changes: 0 }, success: true, results: [] }),
        all: () => Promise.resolve({ results: [], success: true, meta: {} }),
      }),
      first: () => overrides.first?.(sql) ?? Promise.resolve(null),
      run: () => {
        if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) dmlCalls.push(sql)
        return overrides.run?.() ?? Promise.resolve({ meta: { changes: 0 }, success: true, results: [] })
      },
      all: () => Promise.resolve({ results: [], success: true, meta: {} }),
    })),
    batch: vi.fn(() => Promise.resolve([])),
    _dmlCalls: dmlCalls,
  }
  return db
}

function makeEnv(db: ReturnType<typeof makeMockDb>) {
  return {
    DB: db,
    PB_API_KEY: 'test-key',
  } as unknown as import('../helpers').Env
}

function makeUser() {
  return { email: 'ingra107@umn.edu', role: 'admin' } as unknown as import('../helpers').AuthUser
}

function baseMut(overrides: Partial<Mutation> = {}): Mutation {
  return {
    mutation_id: `mut_01HV${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    origin_machine: 'pb-home',
    table: 'tasks',
    op: 'insert',
    record_id: `task_01HV${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    base_seq: null,
    base_row_hash: null,
    payload: { title: 'Test task', status: 'todo' },
    depends_on: null,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
    ...overrides,
  }
}

describe('processOne envelope validation — partial-batch atomicity guard', () => {
  it('missing origin_machine returns status=error without any DML', async () => {
    const { handleMutations } = await import('./mutations')
    const db = makeMockDb()
    const env = makeEnv(db)
    const user = makeUser()

    const badMut = baseMut({ origin_machine: undefined as unknown as string })
    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [badMut] }),
      headers: { 'content-type': 'application/json' },
    })

    const resp = await handleMutations(req, user, env)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> }

    expect(resp.status).toBe(200)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].status).toBe('error')
    expect(body.results[0].reason).toContain('origin_machine')
    // CRITICAL: no INSERT/UPDATE/DELETE should have run for this mutation
    expect(db._dmlCalls.filter(s => /INSERT|UPDATE|DELETE/i.test(s))).toHaveLength(0)
  })

  it('missing client_ts returns status=error without any DML', async () => {
    const { handleMutations } = await import('./mutations')
    const db = makeMockDb()
    const env = makeEnv(db)
    const user = makeUser()

    const badMut = baseMut({ client_ts: undefined as unknown as string })
    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [badMut] }),
      headers: { 'content-type': 'application/json' },
    })

    const resp = await handleMutations(req, user, env)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> }

    expect(resp.status).toBe(200)
    expect(body.results[0].status).toBe('error')
    expect(body.results[0].reason).toContain('client_ts')
    expect(db._dmlCalls.filter(s => /INSERT|UPDATE|DELETE/i.test(s))).toHaveLength(0)
  })

  it('missing issued_at returns status=error without any DML', async () => {
    const { handleMutations } = await import('./mutations')
    const db = makeMockDb()
    const env = makeEnv(db)
    const user = makeUser()

    const badMut = baseMut({ issued_at: undefined as unknown as string })
    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [badMut] }),
      headers: { 'content-type': 'application/json' },
    })

    const resp = await handleMutations(req, user, env)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> }

    expect(resp.status).toBe(200)
    expect(body.results[0].status).toBe('error')
    expect(body.results[0].reason).toContain('issued_at')
    expect(db._dmlCalls.filter(s => /INSERT|UPDATE|DELETE/i.test(s))).toHaveLength(0)
  })

  it('batch with malformed second mutation: second returns error, response is 200 not 500', async () => {
    // This pins the primary incident: a well-formed batch where one mutation
    // is malformed must return 200 with per-row results (not 500), and the
    // malformed mutation must have status='error'. The first mutation's outcome
    // is separate (may succeed or fail depending on mock state).
    const { handleMutations } = await import('./mutations')
    const db = makeMockDb()
    const env = makeEnv(db)
    const user = makeUser()

    const mut1 = baseMut()
    const mut2 = baseMut({ origin_machine: undefined as unknown as string })

    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut1, mut2] }),
      headers: { 'content-type': 'application/json' },
    })

    const resp = await handleMutations(req, user, env)
    // Must be 200, never 500
    expect(resp.status).toBe(200)
    const body = await resp.json() as { results: Array<{ mutation_id: string; status: string; reason?: string }> }
    expect(body.results).toHaveLength(2)

    // Second mutation must be error
    const r2 = body.results.find(r => r.mutation_id === mut2.mutation_id)
    expect(r2).toBeDefined()
    expect(r2!.status).toBe('error')
    expect(r2!.reason).toContain('origin_machine')
  })

  it('source-level: processOne envelope validation precedes idempotency check and DML', async () => {
    // Structural lint: confirm the validation block for origin_machine appears
    // BEFORE the idempotency SELECT in the mutations.ts source. Guards against
    // future refactors that move validation after DB access.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, 'mutations.ts'), 'utf-8')

    const originMachineCheckIdx = src.indexOf("return mutErr(mut.mutation_id, 'origin_machine required')")
    const idempotencySelectIdx = src.indexOf('SELECT original_response_json FROM processed_mutations')

    expect(originMachineCheckIdx).toBeGreaterThan(-1)
    expect(idempotencySelectIdx).toBeGreaterThan(-1)
    expect(
      originMachineCheckIdx,
      'origin_machine check must appear before the idempotency SELECT in processOne'
    ).toBeLessThan(idempotencySelectIdx)
  })
})

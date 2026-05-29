// Regression tests: Layer-3 Hub-500 fix (2026-05-29)
//
// Bug: a D1 storage exception thrown by the UNGUARDED calls inside processOne
// (idempotency SELECT, depends_on SELECT, recordProcessedAtomic) propagated
// out of processOne uncaught. When any mutation in a batch hit such an infra
// error, the entire batch crashed with a bare 500 — all per-item results lost.
//
// Fix: wrap the batch-loop call site (api/routes/mutations.ts:408-412) in a
// per-item try/catch. On catch: log the error, return
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

import { describe, it, expect, vi } from 'vitest'
import { nowInstant } from '../lib/time'
import type { Mutation } from './mutations'

// ── mock helpers ─────────────────────────────────────────────────────────────

function makeEnv(db: ReturnType<typeof makeMockDb>) {
  return {
    DB: db,
    PB_API_KEY: 'test-key',
    // KV not needed for these tests
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

/**
 * Build a mock D1 DB where prepare() throws for queries matching
 * `throwOnSqlPattern` on the specified `poisonMutationId`.
 *
 * - For the poisoned mutation: the very first bind().first() throws.
 * - For all other mutations: normal null returns (treated as "not seen before"
 *   → processOne proceeds through to apply dispatch → INSERT is tracked).
 */
function makeMockDb(opts: {
  poisonMutationId: string;
  poisonSqlPattern: RegExp;
}) {
  const { poisonMutationId, poisonSqlPattern } = opts
  const dmlCalls: string[] = []

  const db = {
    prepare: vi.fn((sql: string) => {
      return {
        bind: (...bindArgs: unknown[]) => {
          // Detect if the first bind arg is the poison mutation_id and the SQL
          // matches the pattern we want to poison (idempotency SELECT).
          const isPoisonQuery =
            typeof bindArgs[0] === 'string' &&
            bindArgs[0] === poisonMutationId &&
            poisonSqlPattern.test(sql)

          return {
            first: () => {
              if (isPoisonQuery) {
                return Promise.reject(
                  new Error('D1_ERROR: Internal error in D1 DB storage')
                )
              }
              return Promise.resolve(null)
            },
            run: () => {
              if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) {
                dmlCalls.push(sql)
              }
              return Promise.resolve({ meta: { changes: 1 }, success: true, results: [] })
            },
            all: () => Promise.resolve({ results: [], success: true, meta: {} }),
          }
        },
        first: () => Promise.resolve(null),
        run: () => {
          if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) dmlCalls.push(sql)
          return Promise.resolve({ meta: { changes: 0 }, success: true, results: [] })
        },
        all: () => Promise.resolve({ results: [], success: true, meta: {} }),
      }
    }),
    batch: vi.fn(() => Promise.resolve([])),
    _dmlCalls: dmlCalls,
  }
  return db
}

// ── Test 1: infra error on idempotency SELECT ─────────────────────────────────

describe('Layer-3 Hub-500 fix — per-item infra error catch', () => {
  it('D1 throw on idempotency SELECT for ONE mutation: 200 with 3 results, poisoned=infra error, others=accepted', async () => {
    const { handleMutations } = await import('./mutations')

    const mut1 = baseMut()
    const mut2 = baseMut() // <-- this one will be poisoned
    const mut3 = baseMut()

    const db = makeMockDb({
      poisonMutationId: mut2.mutation_id,
      poisonSqlPattern: /SELECT original_response_json FROM processed_mutations/,
    })
    const env = makeEnv(db)
    const user = makeUser()

    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut1, mut2, mut3] }),
      headers: { 'content-type': 'application/json', 'Authorization': 'Bearer test-key' },
    })

    const resp = await handleMutations(req, user, env)

    // Pre-fix this would be a 500 / thrown exception; post-fix must be 200.
    expect(resp.status).toBe(200)

    const body = await resp.json() as { results: Array<{ mutation_id: string; status: string; reason?: string }> }

    // All 3 results must be present.
    expect(body.results).toHaveLength(3)

    // mut2 (poisoned) must carry status='error' with reason starting with 'infra error:'.
    const r2 = body.results.find(r => r.mutation_id === mut2.mutation_id)
    expect(r2).toBeDefined()
    expect(r2!.status).toBe('error')
    expect(r2!.reason).toMatch(/^infra error:/)

    // The other two must be 'accepted' (mock returns changes=1 → INSERT succeeded).
    const r1 = body.results.find(r => r.mutation_id === mut1.mutation_id)
    const r3 = body.results.find(r => r.mutation_id === mut3.mutation_id)
    expect(r1).toBeDefined()
    expect(r1!.status).toBe('accepted')
    expect(r3).toBeDefined()
    expect(r3!.status).toBe('accepted')
  })

  it('infra error reason starts with "infra error:" not "apply error:" (classifier routing)', async () => {
    // Pins the prefix. PB _classify_hub_first_error routes 'apply error:' to
    // permanent_other (never retry). 'infra error:' must fall through to transient.
    const { handleMutations } = await import('./mutations')

    const mut = baseMut()
    const db = makeMockDb({
      poisonMutationId: mut.mutation_id,
      poisonSqlPattern: /SELECT original_response_json FROM processed_mutations/,
    })
    const env = makeEnv(db)
    const user = makeUser()

    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut] }),
      headers: { 'content-type': 'application/json', 'Authorization': 'Bearer test-key' },
    })

    const resp = await handleMutations(req, user, env)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> }

    expect(body.results[0].reason).toMatch(/^infra error:/)
    expect(body.results[0].reason).not.toMatch(/^apply error:/)
  })
})

// ── Test 2: fail-fast regression ──────────────────────────────────────────────

describe('Layer-3 Hub-500 fix — fail-fast envelope regression', () => {
  it('malformed envelope (missing origin_machine) still returns its own clean mutErr — not "infra error:"', async () => {
    // Ensures the per-item catch did NOT swallow the envelope fail-fast.
    // Before the fix, the fail-fast never threw (it returned mutErr cleanly);
    // after the fix, it must still return mutErr cleanly — not hit the catch block.
    const { handleMutations } = await import('./mutations')

    const validMut = baseMut()
    const malformedMut = baseMut({ origin_machine: undefined as unknown as string })

    // Use a clean mock (no poisoning needed — the malformed mut fails before DB access).
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: () => Promise.resolve(null),
          run: () => Promise.resolve({ meta: { changes: 1 }, success: true, results: [] }),
          all: () => Promise.resolve({ results: [], success: true, meta: {} }),
        }),
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ meta: { changes: 1 }, success: true, results: [] }),
        all: () => Promise.resolve({ results: [], success: true, meta: {} }),
      })),
      batch: vi.fn(() => Promise.resolve([])),
    }
    const env = {
      DB: db,
      PB_API_KEY: 'test-key',
    } as unknown as import('../helpers').Env
    const user = makeUser()

    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [validMut, malformedMut] }),
      headers: { 'content-type': 'application/json', 'Authorization': 'Bearer test-key' },
    })

    const resp = await handleMutations(req, user, env)
    expect(resp.status).toBe(200)

    const body = await resp.json() as { results: Array<{ mutation_id: string; status: string; reason?: string }> }
    expect(body.results).toHaveLength(2)

    // valid mutation is accepted
    const rValid = body.results.find(r => r.mutation_id === validMut.mutation_id)
    expect(rValid!.status).toBe('accepted')

    // malformed mutation returns its ENVELOPE error — NOT 'infra error:'
    const rMalformed = body.results.find(r => r.mutation_id === malformedMut.mutation_id)
    expect(rMalformed!.status).toBe('error')
    expect(rMalformed!.reason).toContain('origin_machine')
    expect(rMalformed!.reason).not.toMatch(/^infra error:/)
  })
})

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
//   2. The guarantee is NOT that the batch rolls back as a whole: the
//      well-formed first mutation lands with its receipt. The guarantee is
//      that the malformed mutation itself never writes: its error surfaces as
//      status='error', not a 500, and it leaves no row and no receipt.
//   3. Verifies the missing-field error reason is human-readable.
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The old mock answered every read with null and recorded DML only from an
// un-bound .run(), so its "no DML" assertions could not see a bound INSERT and
// passed whatever the route wrote. Here every statement the engine executes is
// logged through d1Adapter's onExec, the malformed mutation must reach the
// engine with NO statement at all (not even the idempotency read), and the
// stored tasks rows and processed_mutations receipts are read back. d1Adapter
// refuses an undefined bind with D1_TYPE_ERROR, as D1 does, so the original
// failure mode (the undefined field reaching the receipt INSERT) is reproducible
// on this fixture.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { nowInstant } from '../lib/time'
import { handleMutations } from './mutations'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { prodSchemaDb, d1Adapter, receiptOf } from '../test-support/prod-schema-db'

let db: InstanceType<typeof Database>
let env: Env
let execLog: Array<{ sql: string; vals: unknown[] }>
// Every SQL text the route PREPARED. onExec alone cannot prove "no DB access":
// d1Adapter refuses an undefined bind at bind() time, before onExec runs.
let prepared: string[]
beforeEach(() => {
  db = prodSchemaDb()
  execLog = []
  prepared = []
  const adapter = d1Adapter(db, { onExec: (sql, vals) => { execLog.push({ sql, vals }) } })
  env = {
    DB: { ...adapter, prepare: (sql: string) => { prepared.push(sql); return adapter.prepare(sql) } },
    PB_API_KEY: 'test-key',
  } as unknown as Env
})

const user = { email: 'ingra107@umn.edu', role: 'admin' } as unknown as AuthUser

function baseMut(overrides: Partial<Mutation> = {}): Mutation {
  return {
    mutation_id: `mut_01HV${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    origin_machine: 'pb-home',
    table: 'tasks',
    op: 'insert',
    record_id: `task_01HV${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    base_seq: null,
    base_row_hash: null,
    payload: { title: `Test task ${Math.random().toString(36).slice(2, 8)}`, status: 'todo', assignee: 'nick-ingraham' },
    depends_on: null,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
    ...overrides,
  }
}

async function send(muts: Mutation[]) {
  const req = new Request('https://example.com/api/mutations', {
    method: 'POST',
    body: JSON.stringify({ mutations: muts }),
    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer test-key' },
  })
  const resp = await handleMutations(req, user, env)
  const body = await resp.json() as { results: Array<{ mutation_id: string; status: string; reason?: string }> }
  return { status: resp.status, body }
}

const taskRow = (id: string) => db.prepare('SELECT id, title FROM tasks WHERE id = ?').get(id)
/** Statements whose SQL or binds mention this mutation or record id. */
const touching = (m: Mutation) =>
  execLog.filter((e) => e.vals.includes(m.mutation_id) || e.vals.includes(m.record_id))

describe('processOne envelope validation — partial-batch atomicity guard', () => {
  for (const field of ['origin_machine', 'client_ts', 'issued_at'] as const) {
    it(`missing ${field} returns status=error without touching the database`, async () => {
      const badMut = baseMut({ [field]: undefined } as Partial<Mutation>)
      const { status, body } = await send([badMut])

      expect(status).toBe(200)
      expect(body.results).toHaveLength(1)
      expect(body.results[0].status).toBe('error')
      expect(body.results[0].reason).toContain(field)
      // CRITICAL: the envelope check runs before any per-mutation DB access:
      // no statement names this mutation (no idempotency read, no row write,
      // no receipt) and nothing but a read ran. (The one read handleMutations
      // may issue is the request-level lab_settings flag load, cached per
      // module, so it shows up only on the first request of the file.)
      expect(touching(badMut)).toEqual([])
      expect(execLog.filter((e) => !/^\s*SELECT\b/i.test(e.sql))).toEqual([])
      expect(prepared.filter((sql) => !/FROM lab_settings/.test(sql))).toEqual([])
      expect(taskRow(badMut.record_id)).toBeUndefined()
      expect(receiptOf(db, badMut.mutation_id)).toBeUndefined()
    })
  }

  it('batch with malformed second mutation: first lands with its receipt, second writes nothing, response is 200 not 500', async () => {
    // Pins the primary incident: one malformed mutation in a batch must return
    // 200 with per-row results (not 500), its own result is status='error',
    // and it leaves no row and no receipt. The well-formed first mutation is
    // independent of it and lands normally.
    const mut1 = baseMut()
    const mut2 = baseMut({ origin_machine: undefined as unknown as string })

    const { status, body } = await send([mut1, mut2])
    expect(status).toBe(200)
    expect(body.results).toHaveLength(2)

    const r1 = body.results.find(r => r.mutation_id === mut1.mutation_id)
    expect(r1?.status).toBe('accepted')
    expect(taskRow(mut1.record_id)).toEqual({ id: mut1.record_id, title: (mut1.payload as { title: string }).title })
    const receipt1 = receiptOf(db, mut1.mutation_id)
    expect(receipt1).toMatchObject({ outcome: 'accepted', table_name: 'tasks', record_id: mut1.record_id })
    expect(JSON.parse(receipt1!.original_response_json)).toMatchObject({ mutation_id: mut1.mutation_id, status: 'accepted' })

    const r2 = body.results.find(r => r.mutation_id === mut2.mutation_id)
    expect(r2).toBeDefined()
    expect(r2!.status).toBe('error')
    expect(r2!.reason).toContain('origin_machine')
    expect(touching(mut2)).toEqual([])
    expect(taskRow(mut2.record_id)).toBeUndefined()
    expect(receiptOf(db, mut2.mutation_id)).toBeUndefined()
  })

  it('the fixture can see the original failure: an undefined receipt field is refused as D1 refuses it', async () => {
    // What the envelope check prevents: an undefined origin_machine reaching the
    // receipt INSERT. D1 throws D1_TYPE_ERROR at bind; so does this fixture.
    expect(() =>
      env.DB.prepare('INSERT INTO processed_mutations (mutation_id, origin_machine, processed_at, outcome, original_response_json) VALUES (?, ?, datetime(\'now\'), ?, ?)')
        .bind('mut_x', undefined, 'accepted', '{}'),
    ).toThrow(/D1_TYPE_ERROR/)
    expect(receiptOf(db, 'mut_x')).toBeUndefined()
  })

  it('source-level: processOne envelope validation precedes idempotency check and DML', async () => {
    // Structural lint: confirm the validation block for origin_machine appears
    // BEFORE the idempotency SELECT in the mutations.ts source. Guards against
    // future refactors that move validation after DB access.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, 'mutations.ts'), 'utf-8')

    // L-Q23 (2026-10-08): mutErr takes a refusal code before the reason.
    const originMachineCheckIdx = src.indexOf("return mutErr(mut.mutation_id, 'envelope_invalid', 'origin_machine required')")
    // M48 (2026-06-18): SELECT now fetches both outcome + JSON (null-safe compaction).
    // Match the idempotency check at processOne entry, not the race-lost read-back.
    const idempotencySelectIdx = src.indexOf('SELECT outcome, original_response_json FROM processed_mutations WHERE mutation_id = ?')

    expect(originMachineCheckIdx).toBeGreaterThan(-1)
    expect(idempotencySelectIdx).toBeGreaterThan(-1)
    expect(
      originMachineCheckIdx,
      'origin_machine check must appear before the idempotency SELECT in processOne'
    ).toBeLessThan(idempotencySelectIdx)
  })
})

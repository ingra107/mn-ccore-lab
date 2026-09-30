// Tests for advanceProjectOwnMovement in mutations.ts.
//
// A project worked exclusively through PB field writes (description, citation,
// due_date, ... -- no stage/status transition, no task activity underneath it)
// never touched last_meaningful_movement or activity_entries, so the Projects
// list's "activity" sort (GET /api/projects rollup + last_meaningful_movement
// fallback, src/pages/Projects.tsx) read it as stale and buried it (LPV R01,
// 2026-07-23 diagnosis: 40 activity_entries all backfill, sort rank 74/84,
// worked through July). advanceProjectOwnMovement closes that by advancing a
// project's OWN last_meaningful_movement whenever a PATCH touches a real
// content field -- symmetric to the existing advanceProjectMovement, which
// only advances it from a CHILD task's completion.
//
// Requirements verified here:
//   R1 -- a meaningful field change (e.g. description) advances LMM using the
//         mutation's client_ts, normalized to canonical UTC space-sep.
//   R2 -- MAX gate: never moves LMM backward.
//   R3 -- a patch touching ONLY excluded/bookkeeping fields does not advance LMM.
//   R4 -- a patch that explicitly sets last_meaningful_movement itself is left
//         alone (no competing CASE-gate write from this side-effect).
//   R5 -- a no-op patch (new value === old value) does not advance LMM.
//
// #8862: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The stub this file used re-implemented the CASE MAX-gate in JavaScript, so R2
// tested the stub's copy, not the SQL; here the SQL runs, and the CASE-write
// count comes from the statements the engine actually executed.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

const PROJ = 'proj_01test00000000000000000001'
const user = { email: 'test@example.com' } as import('../helpers').AuthUser

let db: InstanceType<typeof Database>
let env: import('../helpers').Env
let executed: string[]

function setup(lmm: string | null = null) {
  db = prodSchemaDb()
  executed = []
  env = { DB: d1Adapter(db, { onExec: (sql) => executed.push(sql) }) } as unknown as import('../helpers').Env
  insertRow(db, 'projects', {
    id: PROJ, title: 'LPV R01', status: 'active', description: 'old description',
    stale_active_since: '2026-05-01 00:00:00', last_meaningful_movement: lmm,
  })
}
beforeEach(() => setup())

// The MAX-gate statement advanceProjectOwnMovement issues, as the engine ran it.
const lmmCaseWrites = () => executed.filter((s) => /SET\s+last_meaningful_movement\s*=\s*CASE/i.test(s))
const proj = () => db.prepare('SELECT * FROM projects WHERE id = ?').get(PROJ) as Record<string, unknown>

function makeMut(overrides: Partial<Mutation> = {}): Mutation {
  return {
    mutation_id: 'mut_01test000000000000000000002',
    origin_machine: 'home',
    table: 'projects',
    op: 'update',
    record_id: PROJ,
    base_seq: null,
    base_row_hash: null,
    patch: {},
    client_ts: '2026-07-23T14:00:00.000Z',
    issued_at: '2026-07-23T14:00:00.000Z',
    ...overrides,
  }
}

describe('advanceProjectOwnMovement -- via applyUpdate', () => {
  it('R1: a meaningful field change (description) advances LMM from client_ts', async () => {
    const result = await applyUpdate(env, makeMut({ patch: { description: 'new description' } }), user)
    expect(result.status).toBe('accepted')
    expect(receiptOf(db, 'mut_01test000000000000000000002')!.outcome).toBe('accepted')

    expect(lmmCaseWrites().length).toBe(1)
    // '2026-07-23T14:00:00.000Z' -> canonical UTC space-sep.
    expect(proj().last_meaningful_movement).toBe('2026-07-23 14:00:00')
    expect(proj().description).toBe('new description')
  })

  it('R2: MAX gate -- does not move LMM backward against a newer existing value', async () => {
    setup('2026-07-29 21:00:00')
    // client_ts (2026-07-23) predates the existing LMM (2026-07-29).
    const result = await applyUpdate(env, makeMut({ patch: { description: 'late-arriving edit' } }), user)
    expect(result.status).toBe('accepted')
    expect(proj().description).toBe('late-arriving edit')
    expect(proj().last_meaningful_movement).toBe('2026-07-29 21:00:00')
  })

  it('R3: a patch touching ONLY bookkeeping fields does not advance LMM', async () => {
    await applyUpdate(env, makeMut({ patch: { stale_active_since: null } }), user)
    expect(lmmCaseWrites().length).toBe(0)
    expect(proj().last_meaningful_movement).toBeNull()
  })

  it('R4: an explicit last_meaningful_movement in the patch is left alone (no competing write)', async () => {
    await applyUpdate(
      env,
      makeMut({ patch: { description: 'explicit-lmm edit', last_meaningful_movement: '2026-07-23 14:00:00' } }),
      user,
    )
    // advanceProjectOwnMovement must not have fired its own CASE-gate write --
    // applyPatch's own SET clause already carries the explicit value.
    expect(lmmCaseWrites().length).toBe(0)
    expect(proj().last_meaningful_movement).toBe('2026-07-23 14:00:00')
  })

  it('R5: a no-op patch (same value) does not advance LMM', async () => {
    await applyUpdate(env, makeMut({ patch: { description: 'old description' } }), user)
    expect(lmmCaseWrites().length).toBe(0)
    expect(proj().last_meaningful_movement).toBeNull()
  })
})

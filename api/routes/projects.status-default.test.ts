// projects.status-default.test.ts -- #8939, schema-v142.
//
// projects.status still DEFAULTs to the legacy 'Active' (bootstrap-schema.sql;
// SQLite cannot ALTER a default). Nothing refused a project insert that left
// status out, so such a row would land 'Active', outside the canonical set.
// Two refusals now, the v130 pairing:
//   - schema-v142 trg_projects_status_named_ins, BEFORE INSERT: NEW.status is
//     NULL or 'Active' -> RAISE project_status_missing. A BEFORE trigger sees
//     the applied column DEFAULT, so an omitted status reads 'Active' there;
//     the raw-omit case below is what proves that on the migrated schema.
//   - /api/mutations refuses a project insert with no status, in words
//     (envelope_invalid), before D1 would.
// An explicit 'Active' through /api/mutations is rewritten to 'active' by the
// enum gate when hub_validate_enums is ON (the dead-letter-wave guard), and
// that stays accepted.

import { describe, it, expect, beforeEach } from 'vitest'
import { nowInstant } from '../lib/time'
import { handleMutations } from './mutations'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { _resetValidationFlagsCache } from '../helpers'
import { prodSchemaDb, d1Adapter, seedProjectHome, receiptOf } from '../test-support/prod-schema-db'

type Db = ReturnType<typeof prodSchemaDb>

const fakeUser = { email: 'test@example.com', role: 'admin' } as AuthUser
const TEST_API_KEY = 'test-projects-status-default-key'

function makeDb(flags: Record<string, string> = {}): Db {
  const db = prodSchemaDb()
  for (const [key, value] of Object.entries(flags)) {
    db.prepare('INSERT OR REPLACE INTO lab_settings (key, value) VALUES (?, ?)').run(key, value)
  }
  return db
}

const projectOf = (db: Db, id: string) =>
  db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined

/** A raw insert with the home seed written first, as schema-v130 requires. */
function rawInsert(db: Db, id: string, cols: Record<string, unknown>) {
  const row = { id, title: id, slug: id.replace('proj_', ''), category: 'MNCCORE', ...cols }
  seedProjectHome(db, row)
  const keys = Object.keys(row)
  db.prepare(`INSERT INTO projects (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map((k) => (row as Record<string, unknown>)[k]))
}

async function runMutation(db: Db, mut: Mutation) {
  const env = { DB: d1Adapter(db), PB_API_KEY: TEST_API_KEY } as unknown as Env
  const req = new Request('https://example.com/api/mutations', {
    method: 'POST',
    body: JSON.stringify({ mutations: [mut] }),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_API_KEY}` },
  })
  const resp = await handleMutations(req, fakeUser, env)
  return ((await resp.json()) as { results: Array<Record<string, unknown>> }).results[0]
}

const insertMut = (id: string, payload: Record<string, unknown>): Mutation => ({
  mutation_id: `mut_${id}`, origin_machine: 'home', table: 'projects', op: 'insert',
  record_id: id, base_seq: null, base_row_hash: null,
  payload: { title: id, slug: id.replace('proj_', ''), category: 'MNCCORE', ...payload },
  client_ts: nowInstant(), issued_at: nowInstant(),
  home_product: { kind: 'manuscript', stage: 'idea' },
})

beforeEach(() => _resetValidationFlagsCache())

describe('schema-v142: D1 refuses a project born without a canonical status', () => {
  it('a raw insert that leaves status out is refused (the trigger sees the DEFAULT)', () => {
    const db = makeDb()
    expect(() => rawInsert(db, 'proj_raw_omit', {})).toThrow(/project_status_missing/)
    expect(projectOf(db, 'proj_raw_omit')).toBeUndefined()
  })

  it("a raw insert of the legacy 'Active' is refused", () => {
    const db = makeDb()
    expect(() => rawInsert(db, 'proj_raw_legacy', { status: 'Active' })).toThrow(/project_status_missing/)
    expect(projectOf(db, 'proj_raw_legacy')).toBeUndefined()
  })

  it('a raw insert of NULL is refused', () => {
    const db = makeDb()
    expect(() => rawInsert(db, 'proj_raw_null', { status: null })).toThrow(/project_status_missing|NOT NULL/)
    expect(projectOf(db, 'proj_raw_null')).toBeUndefined()
  })

  it("a raw insert of 'active' lands", () => {
    const db = makeDb()
    rawInsert(db, 'proj_raw_ok', { status: 'active' })
    expect(projectOf(db, 'proj_raw_ok')?.status).toBe('active')
  })

  it('the trigger fires on insert only: an existing row can still be updated', () => {
    const db = makeDb()
    rawInsert(db, 'proj_raw_upd', { status: 'active' })
    db.prepare("UPDATE projects SET status = 'blocked' WHERE id = 'proj_raw_upd'").run()
    expect(projectOf(db, 'proj_raw_upd')?.status).toBe('blocked')
  })
})

describe('/api/mutations: a project insert names its status', () => {
  it('a payload with no status is envelope_invalid, in words, and writes nothing', async () => {
    const db = makeDb({ hub_validate_enums: '1' })
    const r = await runMutation(db, insertMut('proj_mut_omit', {}))
    expect(r.status).toBe('error')
    expect(r.code).toBe('envelope_invalid')
    expect(String(r.reason)).toMatch(/names its status/)
    expect(projectOf(db, 'proj_mut_omit')).toBeUndefined()
    expect(receiptOf(db, 'mut_proj_mut_omit')?.outcome).toBe('error')
  })

  it("an explicit 'Active' with hub_validate_enums ON is rewritten to 'active' and accepted", async () => {
    const db = makeDb({ hub_validate_enums: '1' })
    const r = await runMutation(db, insertMut('proj_mut_legacy', { status: 'Active' }))
    expect(r.status, String(r.reason)).toBe('accepted')
    expect(projectOf(db, 'proj_mut_legacy')?.status).toBe('active')
  })

  it("an explicit 'Active' with the enum flag OFF reaches D1, which refuses it", async () => {
    const db = makeDb({ hub_validate_enums: '0' })
    const r = await runMutation(db, insertMut('proj_mut_legacy_off', { status: 'Active' }))
    expect(r.status).toBe('error')
    expect(String(r.reason)).toMatch(/project_status_missing/)
    expect(projectOf(db, 'proj_mut_legacy_off')).toBeUndefined()
  })

  it("'active' is accepted", async () => {
    const db = makeDb({ hub_validate_enums: '1' })
    const r = await runMutation(db, insertMut('proj_mut_ok', { status: 'active' }))
    expect(r.status, String(r.reason)).toBe('accepted')
    expect(projectOf(db, 'proj_mut_ok')?.status).toBe('active')
  })
})

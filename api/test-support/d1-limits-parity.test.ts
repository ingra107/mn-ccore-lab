// The fixture refuses what real D1 refuses: one statement, two engines.
//
// api/test-support/prod-schema-db.ts emulates two D1 limits better-sqlite3
// does not have: 100 bound parameters per statement and 50-byte LIKE/GLOB
// patterns (https://developers.cloudflare.com/d1/platform/limits/). Each
// emulation is a claim about workerd's behaviour; this file checks the claim
// against workerd itself (Miniflare's local D1, the engine `wrangler dev`
// runs), so a fixture that drifts from it, or a workerd that changes, fails
// here instead of a route test going green on the wrong database.
//
// Every case runs on both engines over the same one-row table; the outcome
// (rows, or the exact error message) must match. Error offsets are part of the
// message and are compared too.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import { d1Adapter, prodSchemaDb } from './prod-schema-db'

type Outcome = { ok: true; rows: number } | { ok: false; message: string }
type D1Like = {
  prepare(sql: string): { bind(...v: unknown[]): { all(): Promise<{ results: unknown[] }> } }
  batch(stmts: unknown[]): Promise<unknown>
}

const SETUP = ['CREATE TABLE parity_t (id TEXT)', "INSERT INTO parity_t VALUES ('a')"]

const qs = (n: number, s = '?') => Array.from({ length: n }, () => s).join(', ')
const vals = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`)

const CASES: { name: string; sql: string; vals: unknown[] }[] = [
  { name: '100 plain parameters', sql: `SELECT id FROM parity_t WHERE id IN (${qs(100)})`, vals: vals(100) },
  { name: '101 plain parameters', sql: `SELECT id FROM parity_t WHERE id IN (${qs(101)})`, vals: vals(101) },
  { name: '101 parameters in a multi-row INSERT',
    sql: `INSERT INTO parity_t (id) VALUES ${qs(101, '(?)')}`, vals: vals(101) },
  { name: '?100 ordered', sql: 'SELECT id FROM parity_t WHERE id = ?100', vals: vals(100) },
  { name: '?101 ordered', sql: 'SELECT id FROM parity_t WHERE id = ?101', vals: vals(101) },
  { name: "a '?' inside a string literal does not count",
    sql: `SELECT id FROM parity_t WHERE id IN (${qs(100)}) OR id = '?'`, vals: vals(100) },
  { name: '50-byte LIKE pattern', sql: 'SELECT id FROM parity_t WHERE id LIKE ?', vals: ['x'.repeat(50)] },
  { name: '51-byte LIKE pattern', sql: 'SELECT id FROM parity_t WHERE id LIKE ?', vals: ['x'.repeat(51)] },
]

async function outcome(run: () => Promise<{ results: unknown[] }>): Promise<Outcome> {
  try {
    return { ok: true, rows: (await run()).results.length }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

let mf: Miniflare
let real: D1Like
let fixture: D1Like

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: ['DB'],
  })
  real = (await mf.getD1Database('DB')) as unknown as D1Like
  const db = prodSchemaDb()
  for (const s of SETUP) {
    await real.prepare(s).bind().all()
    db.exec(s)
  }
  fixture = d1Adapter(db) as unknown as D1Like
}, 60_000)

afterAll(async () => { await mf?.dispose() })

describe('d1Adapter refuses what workerd D1 refuses', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const want = await outcome(() => real.prepare(c.sql).bind(...c.vals).all())
      const got = await outcome(() => fixture.prepare(c.sql).bind(...c.vals).all())
      expect(got).toEqual(want)
    })
  }

  it('the limits are live on workerd (the parity above is not two engines that both allow everything)', async () => {
    const tooMany = CASES.find((c) => c.name === '101 plain parameters')!
    const tooLong = CASES.find((c) => c.name === '51-byte LIKE pattern')!
    expect(await outcome(() => real.prepare(tooMany.sql).bind(...tooMany.vals).all()))
      .toEqual({ ok: false, message: 'D1_ERROR: too many SQL variables at offset 337: SQLITE_ERROR' })
    expect(await outcome(() => real.prepare(tooLong.sql).bind(...tooLong.vals).all()))
      .toEqual({ ok: false, message: 'D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR' })
  })

  it('a batch with one over-limit statement is refused on both', async () => {
    const c = CASES.find((x) => x.name === '101 plain parameters')!
    const run = (d: D1Like) => outcome(async () => {
      await d.batch([d.prepare(c.sql).bind(...c.vals)])
      return { results: [] }
    })
    expect(await run(fixture)).toEqual(await run(real))
    expect((await run(real)).ok).toBe(false)
  })
})

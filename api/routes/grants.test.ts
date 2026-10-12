/**
 * The Grants page's reads (GET /api/grants, /api/grants/timeline) and its
 * writes (POST /api/projects/:slug/products: 'terms', 'milestone'), driven end
 * to end through the REAL worker on the migration-chain database (v124-v128).
 *
 * Decision: PB Context/Decisions/2026-10-12-product-award-terms.md.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { termsRefusal } from './products'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const KEY = 'local-test-key-do-not-use-in-prod'
const PI = 'ingra107@umn.edu'
const MEMBER = 'nate@umn.edu'
const K23P = 'proj_01KXH4E23G0DTFGFBYS2C8RK23'
const R01P = 'proj_01KXH4E23G0DTFGFBYS2C8RR01'
const AWARD = 'prd_01KXH4E23G0DTFGFBYS2C8RAWD'
const APP = 'prd_01KXH4E23G0DTFGFBYS2C8RAPP'

let db: InstanceType<typeof Database>
let env: Env
const rows = (sql: string, ...v: unknown[]) => db.prepare(sql).all(...v) as Record<string, unknown>[]

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate Mesfin', slug: 'nate-mesfin', role: 'Fellow', member_type: 'member', email: MEMBER })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: KEY, REQUIRE_AUTH: '1' } as unknown as Env
  insertRow(db, 'projects', { id: K23P, slug: 'k23', title: 'K23: Provider Variation', short_name: 'K23', category: 'MNCCORE', status: 'active', stage: 'idea', pi: 'nick-ingraham' })
  insertRow(db, 'projects', { id: R01P, slug: 'r01', title: 'R01: LPV', category: 'MNCCORE', status: 'active', stage: 'idea', pi: 'nick-ingraham' })
  insertRow(db, 'project_members', { project_id: R01P, member_slug: 'nate-mesfin', added_by: 'test' })
  insertRow(db, 'products', {
    id: AWARD, project_id: K23P, kind: 'award', stage: 'active', venue: 'NHLBI K23', is_home: 0,
    period_start: '2022-12-15', period_end: '2027-11-30', amount_usd: 644588,
  })
  insertRow(db, 'products', {
    id: APP, project_id: R01P, kind: 'grant_application', stage: 'preparing', venue: 'NHLBI R01', is_home: 0,
    period_start: '2027-07-01',
  })
})

async function call(path: string, email = PI, body?: unknown) {
  const res = await worker.fetch(new Request(`https://hub.test${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': KEY, 'X-Test-User': email },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env, CTX)
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

describe('GET /api/grants and /api/grants/timeline read grant products', () => {
  it('rows are the grant kinds only, with project, PI, terms and a data-derived bucket', async () => {
    const { status, body } = await call('/api/grants')
    expect(status).toBe(200)
    const ids = body.data.map((r: any) => r.id)
    expect(ids).toEqual([AWARD, APP])                                  // active first, then proposed
    expect(body.data.every((r: any) => ['grant_application', 'award', 'honor'].includes(r.kind))).toBe(true)
    expect(body.data[0]).toMatchObject({
      bucket: 'active', project_slug: 'k23', project_short_name: 'K23', pi: 'nick-ingraham',
      venue: 'NHLBI K23', period_start: '2022-12-15', period_end: '2027-11-30', amount_usd: 644588,
    })
    expect(body.data[1]).toMatchObject({ bucket: 'proposed', period_start: '2027-07-01', period_end: null })
    expect(body.kinds.map((k: any) => k.kind).sort()).toEqual(['award', 'grant_application', 'honor'])
  })

  it('a terminal stage is "ended"', async () => {
    db.prepare("UPDATE products SET stage = 'not_funded' WHERE id = ?").run(APP)
    const { body } = await call('/api/grants')
    expect(body.data.find((r: any) => r.id === APP).bucket).toBe('ended')
  })

  it('a member sees only the grants of projects they are on', async () => {
    const { body } = await call('/api/grants', MEMBER)
    expect(body.data.map((r: any) => r.id)).toEqual([APP])
  })

  it('the timeline carries each product\'s milestone tasks', async () => {
    const created = await call('/api/projects/k23/products', PI, {
      action: 'milestone', product_id: AWARD, title: 'RPPR', due_date: '2026-09-15', deadline: '2026-10-15',
    })
    expect(created.status).toBe(200)
    const [t] = rows("SELECT kind, product_id, project_id, due_date, deadline FROM tasks WHERE id = ?", created.body.milestone.id)
    expect(t).toEqual({ kind: 'milestone', product_id: AWARD, project_id: K23P, due_date: '2026-09-15', deadline: '2026-10-15' })
    const { body } = await call('/api/grants/timeline')
    const award = body.data.find((r: any) => r.id === AWARD)
    expect(award.milestones.map((m: any) => m.title)).toEqual(['RPPR'])
    expect(body.data.find((r: any) => r.id === APP).milestones).toEqual([])
  })
})

describe("POST /api/projects/:slug/products action 'terms'", () => {
  const term = (slug: string, product_id: string, fields: Record<string, unknown>, extra: Record<string, unknown> = {}, who = PI) =>
    call(`/api/projects/${slug}/products`, who, { action: 'terms', product_id, fields, ...extra })

  it('an award moves both ends (a Gantt drag) and the row comes back with its seq', async () => {
    const seq = rows('SELECT seq FROM products WHERE id = ?', AWARD)[0].seq as number
    const r = await term('k23', AWARD, { period_start: '2023-01-15', period_end: '2027-12-31' },
      { base_seq: seq, from: { period_start: '2022-12-15', period_end: '2027-11-30' } })
    expect(r.status).toBe(200)
    expect(r.body.product).toMatchObject({ period_start: '2023-01-15', period_end: '2027-12-31', seq: rows('SELECT seq FROM products WHERE id = ?', AWARD)[0].seq })
  })

  it('a stale drag is a 409 and writes nothing', async () => {
    const seq = rows('SELECT seq FROM products WHERE id = ?', APP)[0].seq as number
    await term('r01', APP, { period_start: '2027-09-01' }, { base_seq: seq, from: { period_start: '2027-07-01' } })
    const r = await term('r01', APP, { period_start: '2028-01-01' }, { base_seq: seq, from: { period_start: '2027-07-01' } })
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/Someone changed this/)
    expect(rows('SELECT period_start FROM products WHERE id = ?', APP)[0].period_start).toBe('2027-09-01')
  })

  it('an application refuses an end date and an amount, in words', async () => {
    const end = await term('r01', APP, { period_end: '2032-06-30' })
    expect(end).toMatchObject({ status: 400, body: { error: 'Only an award has an end date; an application has a proposed start.' } })
    const amt = await term('r01', APP, { amount_usd: 100 })
    expect(amt).toMatchObject({ status: 400, body: { error: 'Only an award carries an amount.' } })
  })

  it('venue, amount with $ and commas, and clearing a date', async () => {
    const r = await term('k23', AWARD, { venue: ' NHLBI  K23 ', amount_usd: '$644,588', deadline: '' })
    expect(r.status).toBe(200)
    expect(rows('SELECT venue, amount_usd, deadline FROM products WHERE id = ?', AWARD)[0])
      .toEqual({ venue: 'NHLBI  K23', amount_usd: 644588, deadline: null })
  })

  it('bad input: an unknown field, a bad date, a fractional amount, an end before the start', async () => {
    expect((await term('k23', AWARD, { stage: 'closed' })).status).toBe(400)
    expect((await term('k23', AWARD, { period_start: '12/15/2022' })).status).toBe(400)
    expect((await term('k23', AWARD, { amount_usd: 1.5 })).status).toBe(400)
    expect((await term('k23', AWARD, { period_end: '2020-01-01' })).body.error).toBe('The end date comes after the start.')
  })

  it('a member writes their project\'s grant; a non-member gets 404', async () => {
    expect((await term('r01', APP, { period_start: '2027-08-01' }, {}, MEMBER)).status).toBe(200)
    expect((await term('k23', AWARD, { venue: 'x' }, {}, MEMBER)).status).toBe(404)
  })
})

describe('dates on the calendar, milestones on grant kinds (cold review minors 2 and 4)', () => {
  const post = (body: Record<string, unknown>) => call('/api/projects/k23/products', PI, body)

  it('a date that is not on the calendar is a 400 in words, nothing written', async () => {
    const r = await post({ action: 'terms', product_id: AWARD, fields: { period_end: '2026-02-30' } })
    expect(r).toMatchObject({ status: 400, body: { error: '2026-02-30 is not a date on the calendar.' } })
    expect(rows('SELECT period_end FROM products WHERE id = ?', AWARD)[0].period_end).toBe('2027-11-30')
    expect((await post({ action: 'milestone', product_id: AWARD, title: 'x', due_date: '2026-13-01' })).status).toBe(400)
  })

  it('a post-award milestone goes on a grant kind only', async () => {
    const home = rows("SELECT id FROM products WHERE project_id = ? AND kind = 'manuscript'", K23P)[0].id as string
    const r = await post({ action: 'milestone', product_id: home, title: 'x', due_date: '2026-09-15' })
    expect(r).toMatchObject({ status: 400, body: { error: 'A post-award milestone goes on a grant application, award or honor.' } })
  })
})

describe('termsRefusal says what the v128 CHECKs refuse, and nothing stricter', () => {
  it.each([
    ['manuscript', { period_start: '2027-01-01' }, 'Only a grant application or an award has a start date.'],
    ['honor', { period_start: '2027-01-01' }, 'Only a grant application or an award has a start date.'],
    ['grant_application', { period_start: '2027-01-01' }, null],
    ['award', { period_start: '2027-01-01', period_end: '2028-01-01', amount_usd: 0 }, null],
    ['award', { period_end: '2028-01-01' }, 'Set the start date first.'],
  ] as const)('%s %j', (kind, row, expected) => {
    expect(termsRefusal(kind, row)).toBe(expected)
  })
})

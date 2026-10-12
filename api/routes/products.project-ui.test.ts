/**
 * api/routes/products.project-ui.test.ts -- the project page's product reads
 * and writes (plan step 8), driven end to end.
 *
 * The client functions in src/lib/products.ts run unchanged; their fetch is
 * routed into the REAL worker (worker.fetch) on the migration-chain database
 * (prodSchemaDb: v124 + v125, FKs and triggers on) as a signed-in user. So the
 * envelope the browser sends is the envelope the Worker judges.
 *
 * Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { addProduct, setProductHome, setProductStage } from '../../src/lib/products'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const PI_EMAIL = 'ingra107@umn.edu'
const MEMBER_EMAIL = 'nate@umn.edu'
const PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTH'
const HOME = 'prd_01KXH4E23G0DTFGFBYS2C8RGTH'

let db: InstanceType<typeof Database>
let env: Env
let as = PI_EMAIL
const realFetch = global.fetch

const rows = (sql: string, ...v: unknown[]) => db.prepare(sql).all(...v) as Record<string, unknown>[]

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate Mesfin', slug: 'nate-mesfin', role: 'Fellow', member_type: 'member', email: MEMBER_EMAIL })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1' } as unknown as Env
  as = PI_EMAIL
  // The project, born with its home product by schema-v125.
  insertRow(db, 'projects', { id: PROJECT, slug: 'r03', title: 'R03', category: 'MNCCORE', status: 'active', stage: 'writing' })
  insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'nate-mesfin', added_by: 'nick-ingraham' })
  // The browser's relative fetch goes to the worker as the signed-in user.
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    worker.fetch(new Request(`https://hub.test${String(input)}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': as },
    }), env, CTX)) as unknown as typeof fetch
})

afterEach(() => { global.fetch = realFetch })

async function read(email = PI_EMAIL) {
  const res = await worker.fetch(new Request('https://hub.test/api/projects/r03/products', {
    headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': email },
  }), env, CTX)
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

describe('GET /api/projects/:slug/products', () => {
  it('sends the product with its lineage rank, and every live kind with its ladder', async () => {
    const { status, body } = await read()
    expect(status).toBe(200)
    expect(body.products).toHaveLength(1)
    expect(body.products[0]).toMatchObject({ id: HOME, kind: 'manuscript', stage: 'writing', is_home: 1, lineage_rank: 0 })
    const kinds = body.kinds as { kind: string; stages: { stage: string; ordinal: number }[] }[]
    expect(kinds.map((k) => k.kind)).toEqual(
      ['manuscript', 'abstract', 'grant_application', 'award', 'honor', 'trial_ops', 'infrastructure'],
    )
    const ordinals = kinds.find((k) => k.kind === 'award')!.stages
    expect(ordinals.map((s) => s.stage)).toEqual(['active', 'no_cost_extension', 'closeout', 'closed'])
  })

  it('answers a project member, and refuses someone who is not on the project', async () => {
    expect((await read(MEMBER_EMAIL)).status).toBe(200)
    db.prepare("DELETE FROM project_members WHERE member_slug = 'nate-mesfin'").run()
    expect((await read(MEMBER_EMAIL)).status).not.toBe(200)
  })
})

describe('the writes the page sends', () => {
  it('setProductStage: a stage on the product\'s own ladder lands, and the Worker stamps the clock', async () => {
    await setProductStage(HOME, 'revisions')
    const [p] = rows('SELECT stage, stage_entered_at FROM products WHERE id = ?', HOME)
    expect(p.stage).toBe('revisions')
    expect(p.stage_entered_at).not.toBeNull()
  })

  it('setProductStage: a stage that is not on the kind\'s ladder is refused with the Worker\'s reason', async () => {
    await expect(setProductStage(HOME, 'enrolling')).rejects.toThrow()
    expect(rows('SELECT stage FROM products WHERE id = ?', HOME)[0].stage).toBe('writing')
  })

  it('addProduct: a grant application that grew from the manuscript, same project, rank one above', async () => {
    await addProduct({ projectId: PROJECT, kind: 'grant_application', stage: 'preparing', name: 'A1', growsFrom: { id: HOME, lineage_rank: 0 } })
    const [p] = rows("SELECT * FROM products WHERE kind = 'grant_application'")
    expect(p).toMatchObject({ project_id: PROJECT, stage: 'preparing', short_name: 'A1', is_home: 0, grew_from_id: HOME, grew_from_rank: 0, lineage_rank: 1 })
    expect(String(p.id)).toMatch(/^prd_[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('addProduct: a stage from another kind\'s ladder is refused, nothing written', async () => {
    await expect(addProduct({ projectId: PROJECT, kind: 'grant_application', stage: 'writing', name: 'X' })).rejects.toThrow()
    expect(rows("SELECT id FROM products WHERE project_id = ?", PROJECT)).toHaveLength(1)
  })

  it('addProduct: grew-from cannot cross projects (the lineage FK is composite on project_id)', async () => {
    insertRow(db, 'projects', { id: 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ', slug: 'other', title: 'Other', category: 'MNCCORE', status: 'active', stage: 'idea' })
    const otherHome = rows("SELECT id FROM products WHERE project_id = 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ'")[0].id as string
    await expect(
      addProduct({ projectId: PROJECT, kind: 'manuscript', stage: 'idea', name: 'Cross', growsFrom: { id: otherHome, lineage_rank: 0 } }),
    ).rejects.toThrow()
  })

  it('setProductHome: is_home=1 on the new home demotes the old one in the same write', async () => {
    await addProduct({ projectId: PROJECT, kind: 'trial_ops', stage: 'start_up', name: 'Ops' })
    const added = rows("SELECT id FROM products WHERE kind = 'trial_ops'")[0].id as string
    await setProductHome(added)
    const homes = rows('SELECT id FROM products WHERE project_id = ? AND is_home = 1 AND deleted_at IS NULL', PROJECT)
    expect(homes.map((h) => h.id)).toEqual([added])
  })

  it('a team member who is not the PI cannot write (the mutations endpoint is PI-only)', async () => {
    as = MEMBER_EMAIL
    await expect(setProductStage(HOME, 'idea')).rejects.toThrow(/PI/)
    expect(rows('SELECT stage FROM products WHERE id = ?', HOME)[0].stage).toBe('writing')
  })
})

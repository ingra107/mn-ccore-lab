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
import { PROJECT_STAGE_VALUES } from './projects'

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
    expect(typeof body.products[0].seq).toBe('number')
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

describe('the writes the page sends (POST /api/projects/:slug/products)', () => {
  const projectStage = () => rows('SELECT stage FROM projects WHERE id = ?', PROJECT)[0].stage

  it('setProductStage: a stage on the product\'s own ladder lands, the clock is stamped, seq comes back', async () => {
    const out = await setProductStage('r03', HOME, 'revisions')
    const [p] = rows('SELECT stage, stage_entered_at, seq FROM products WHERE id = ?', HOME)
    expect(p.stage).toBe('revisions')
    expect(p.stage_entered_at).not.toBeNull()
    expect(out.seq).toBe(p.seq)
  })

  it('B1: a ladder write on a single-product project moves projects.stage with it (schema-v126)', async () => {
    await setProductStage('r03', HOME, 'revisions')
    expect(projectStage()).toBe('revisions')
    // and back: re-picking the old stage on the project list (forward rule) agrees
    await setProductStage('r03', HOME, 'writing')
    expect(projectStage()).toBe('writing')
  })

  it('B1: with 2+ products the project stage does not follow any product, the home included', async () => {
    await addProduct('r03', { kind: 'trial_ops', stage: 'start_up', name: 'Ops' })
    await setProductStage('r03', HOME, 'submitted')
    expect(projectStage()).toBe('writing')
  })

  it('B1: a stage that is not a project stage is not copied onto the project', async () => {
    db.prepare("UPDATE products SET kind = 'infrastructure', stage = 'planning' WHERE id = ?").run(HOME)
    await setProductStage('r03', HOME, 'running')
    expect(projectStage()).not.toBe('running')
  })

  it('the project stage set is the manuscript ladder (the v126 mirror reads the ladder)', () => {
    const ladder = rows("SELECT stage FROM product_stages WHERE kind = 'manuscript' AND deleted_at IS NULL").map((r) => r.stage)
    expect(new Set(ladder)).toEqual(PROJECT_STAGE_VALUES)
  })

  it('a stale tab cannot overwrite a newer stage (compare-and-swap on seq + stage)', async () => {
    const before = rows('SELECT seq FROM products WHERE id = ?', HOME)[0].seq as number
    await setProductStage('r03', HOME, 'submitted', { seq: before, stage: 'writing' })
    await expect(setProductStage('r03', HOME, 'idea', { seq: before, stage: 'writing' })).rejects.toThrow()
    expect(rows('SELECT stage FROM products WHERE id = ?', HOME)[0].stage).toBe('submitted')
  })

  it('setProductStage: a stage that is not on the kind\'s ladder is refused with the Worker\'s reason', async () => {
    await expect(setProductStage('r03', HOME, 'enrolling')).rejects.toThrow()
    expect(rows('SELECT stage FROM products WHERE id = ?', HOME)[0].stage).toBe('writing')
  })

  it('addProduct: a grant application that grew from the manuscript; the Worker derives the ranks', async () => {
    await addProduct('r03', { kind: 'grant_application', stage: 'preparing', name: 'A1', growsFromId: HOME })
    const [p] = rows("SELECT * FROM products WHERE kind = 'grant_application'")
    expect(p).toMatchObject({ project_id: PROJECT, stage: 'preparing', short_name: 'A1', is_home: 0, grew_from_id: HOME, grew_from_rank: 0, lineage_rank: 1 })
    expect(String(p.id)).toMatch(/^prd_[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('addProduct: a stage from another kind\'s ladder is refused, nothing written', async () => {
    await expect(addProduct('r03', { kind: 'grant_application', stage: 'writing', name: 'X' })).rejects.toThrow()
    expect(rows('SELECT id FROM products WHERE project_id = ?', PROJECT)).toHaveLength(1)
  })

  it('addProduct: grew-from must be a product of this project', async () => {
    insertRow(db, 'projects', { id: 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ', slug: 'other', title: 'Other', category: 'MNCCORE', status: 'active', stage: 'idea' })
    const otherHome = rows("SELECT id FROM products WHERE project_id = 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ'")[0].id as string
    await expect(addProduct('r03', { kind: 'manuscript', stage: 'idea', name: 'Cross', growsFromId: otherHome })).rejects.toThrow()
  })

  it('setProductHome: the home action demotes the old home in the same write', async () => {
    await addProduct('r03', { kind: 'trial_ops', stage: 'start_up', name: 'Ops' })
    const added = rows("SELECT id FROM products WHERE kind = 'trial_ops'")[0].id as string
    await setProductHome('r03', added)
    const homes = rows('SELECT id FROM products WHERE project_id = ? AND is_home = 1 AND deleted_at IS NULL', PROJECT)
    expect(homes.map((h) => h.id)).toEqual([added])
  })

  it('B2: a member of the project may change stage, add, and move home (Nick 2026-10-12)', async () => {
    as = MEMBER_EMAIL
    await setProductStage('r03', HOME, 'idea')
    await addProduct('r03', { kind: 'abstract', stage: 'planning', name: 'Poster' })
    const added = rows("SELECT id FROM products WHERE kind = 'abstract'")[0].id as string
    await setProductHome('r03', added)
    expect(rows('SELECT stage FROM products WHERE id = ?', HOME)[0].stage).toBe('idea')
    expect(rows('SELECT is_home FROM products WHERE id = ?', added)[0].is_home).toBe(1)
    const [r] = rows("SELECT origin_machine FROM processed_mutations WHERE record_id = ? ORDER BY processed_at DESC LIMIT 1", added)
    expect(String(r.origin_machine)).toMatch(/^hub_ui:/)
  })

  it('B2: someone who is not on the project cannot write, and cannot reach another project\'s product through this one', async () => {
    db.prepare("DELETE FROM project_members WHERE member_slug = 'nate-mesfin'").run()
    as = MEMBER_EMAIL
    await expect(setProductStage('r03', HOME, 'idea')).rejects.toThrow()
    as = PI_EMAIL
    insertRow(db, 'projects', { id: 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ', slug: 'other', title: 'Other', category: 'MNCCORE', status: 'active', stage: 'idea' })
    const otherHome = rows("SELECT id FROM products WHERE project_id = 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ'")[0].id as string
    await expect(setProductStage('r03', otherHome, 'writing')).rejects.toThrow(/not found in this project/)
    expect(rows('SELECT stage FROM products WHERE id = ?', HOME)[0].stage).toBe('writing')
  })

  it('/api/mutations stays PI-only: a member posting there is refused', async () => {
    const res = await worker.fetch(new Request('https://hub.test/api/mutations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': MEMBER_EMAIL },
      body: JSON.stringify({ mutations: [] }),
    }), env, CTX)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/projects/products (the list views\' bulk read)', () => {
  async function bulk(email: string) {
    const res = await worker.fetch(new Request('https://hub.test/api/projects/products', {
      headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': email },
    }), env, CTX)
    return { status: res.status, body: (await res.json()) as { byProject: Record<string, Record<string, unknown>[]>; kinds: unknown[] } }
  }

  it('groups each visible project\'s live products, with seq and kinds', async () => {
    const { status, body } = await bulk(PI_EMAIL)
    expect(status).toBe(200)
    expect(body.byProject[PROJECT].map((p) => p.id)).toEqual([HOME])
    expect(typeof body.byProject[PROJECT][0].seq).toBe('number')
    expect(body.kinds.length).toBeGreaterThanOrEqual(7)
  })

  it('a member gets only the projects they are on', async () => {
    insertRow(db, 'projects', { id: 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ', slug: 'other', title: 'Other', category: 'MNCCORE', status: 'active', stage: 'idea' })
    insertRow(db, 'project_members', { project_id: 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ', member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
    const { body } = await bulk(MEMBER_EMAIL)
    expect(Object.keys(body.byProject)).toEqual([PROJECT])
  })
})

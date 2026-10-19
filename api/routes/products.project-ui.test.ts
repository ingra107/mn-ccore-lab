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
import { plainRefusal } from './products'

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
  insertRow(db, 'projects', { id: PROJECT, slug: 'r03', title: 'R03', category: 'MNCCORE', status: 'active' }, { stage: 'writing' })
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
      ['manuscript', 'abstract', 'talk', 'session_moderator', 'grant_application', 'award', 'honor', 'trial_ops', 'infrastructure'],
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
  it('setProductStage: a stage on the product\'s own ladder lands, the clock is stamped, seq comes back', async () => {
    const out = await setProductStage('r03', HOME, 'revisions')
    const [p] = rows('SELECT stage, stage_entered_at, seq FROM products WHERE id = ?', HOME)
    expect(p.stage).toBe('revisions')
    expect(p.stage_entered_at).not.toBeNull()
    expect(out.seq).toBe(p.seq)
  })

  it('a project has no stage of its own to drift from its products (schema-v133 dropped the columns)', () => {
    const cols = rows("SELECT name FROM pragma_table_info('projects')").map((c) => c.name)
    expect(cols).not.toContain('stage')
    expect(cols).not.toContain('stage_entered_at')
  })

  it('the write answers with the kind and whether the stage is its ladder\'s last rung (the paper nag reads it)', async () => {
    const mid = await setProductStage('r03', HOME, 'accepted')
    expect(mid).toMatchObject({ kind: 'manuscript', stage: 'accepted', stage_is_terminal: 0 })
    const done = await setProductStage('r03', HOME, 'published')
    expect(done).toMatchObject({ kind: 'manuscript', stage: 'published', stage_is_terminal: 1 })
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
    insertRow(db, 'projects', { id: 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ', slug: 'other', title: 'Other', category: 'MNCCORE', status: 'active' })
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
    insertRow(db, 'projects', { id: 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ', slug: 'other', title: 'Other', category: 'MNCCORE', status: 'active' })
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
    insertRow(db, 'projects', { id: 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ', slug: 'other', title: 'Other', category: 'MNCCORE', status: 'active' })
    insertRow(db, 'project_members', { project_id: 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ', member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
    const { body } = await bulk(MEMBER_EMAIL)
    expect(Object.keys(body.byProject)).toEqual([PROJECT])
  })
})

describe('a product write leaves a line on its project\'s timeline (cold review s61 B1)', () => {
  const lines = () => rows(
    "SELECT body FROM activity_entries WHERE entity_type = 'project' AND entity_id = ? AND source_table = 'lifecycle' ORDER BY rowid",
    PROJECT,
  ).map((r) => r.body)

  it('the project\'s own home product (made with the project) writes no "Product added"', () => {
    expect(lines().filter((b) => String(b).startsWith('Product added'))).toEqual([])
  })

  it('a stage move: "Stage (<product>): A → B", in ladder words', async () => {
    db.prepare("UPDATE products SET short_name = 'R03 paper' WHERE id = ?").run(HOME)
    await setProductStage('r03', HOME, 'data_analysis')
    expect(lines()).toContain('Stage (R03 paper): Writing → Data analysis')
  })

  it('an added product, and a home hand-off', async () => {
    await addProduct('r03', { kind: 'grant_application', stage: 'preparing', name: 'A1' })
    const added = rows("SELECT id FROM products WHERE kind = 'grant_application'")[0].id as string
    await setProductHome('r03', added)
    // Exactly one line each: the home product's own birth wrote none, and the
    // hand-off's demotion of the old home is not a second "Home" line.
    expect(lines()).toEqual(['Product added: A1', 'Home → A1'])
  })

  it('a product with no name is named by its kind', async () => {
    await setProductStage('r03', HOME, 'submitted')
    expect(lines()).toContain('Stage (Manuscript): Writing → Submitted')
  })
})

describe('refusals answer in plain words (cold review s61 M5) and the seq comes from the write (M6)', () => {
  async function post(body: Record<string, unknown>) {
    const res = await worker.fetch(new Request('https://hub.test/api/projects/r03/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': PI_EMAIL },
      body: JSON.stringify(body),
    }), env, CTX)
    return { status: res.status, body: (await res.json()) as Record<string, any> }
  }

  it('a stage off the product\'s ladder is a 400 with a sentence', async () => {
    const r = await post({ action: 'stage', product_id: HOME, stage: 'enrolling' })
    expect(r.status).toBe(400)
    expect(r.body.error).toBe("That stage is not on this product's ladder.")
  })

  it('a kind/stage pair that does not go together is a 400', async () => {
    const r = await post({ action: 'add', kind: 'grant_application', stage: 'writing' })
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('That kind and stage do not go together.')
  })

  it('a stale tab gets a 409 that names no seq, hash or constraint', async () => {
    const seq = rows('SELECT seq FROM products WHERE id = ?', HOME)[0].seq as number
    await post({ action: 'stage', product_id: HOME, stage: 'submitted', base_seq: seq, from_stage: 'writing' })
    const r = await post({ action: 'stage', product_id: HOME, stage: 'idea', base_seq: seq, from_stage: 'writing' })
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/Someone changed this a moment ago/)
    expect(r.body.error).not.toMatch(/seq|hash|constraint|FOREIGN/i)
  })

  it('a trigger refusal (home or last live product) becomes a sentence, never the trigger text', () => {
    const home = plainRefusal({ status: 'error', code: 'constraint', reason: 'product_home_live: mark another product home before tombstoning this one' }, 'stage')
    expect(home).toEqual({ status: 409, message: 'Mark another product home first.' })
    const last = plainRefusal({ status: 'error', code: 'apply_error', reason: 'product_last_live: a live project keeps at least one live product' }, 'stage')
    expect(last).toEqual({ status: 409, message: 'A project keeps at least one product.' })
    expect(plainRefusal({ status: 'error', code: 'infra', reason: 'D1_ERROR: seq 41' }, 'stage').message).not.toMatch(/seq|D1/)
  })

  it('the written product, seq included, is the row the write produced', async () => {
    const r = await post({ action: 'stage', product_id: HOME, stage: 'revisions' })
    const [p] = rows('SELECT seq, stage FROM products WHERE id = ?', HOME)
    expect(r.body.product).toMatchObject({ id: HOME, stage: 'revisions', stage_label: 'Revisions', seq: p.seq, project_id: PROJECT })
  })
})

/**
 * api/routes/mutations.product-home.test.ts -- schema-v125: a product exists
 * wherever the design says it does, on every create path.
 *
 * Drives the REAL worker (worker.fetch) on the migration-chain database
 * (prodSchemaDb: v124 + v125, FKs and triggers on). Each create path is the
 * real route: the Hub UI (POST /api/projects, POST /api/tasks) as the PI, and
 * POST /api/mutations with the PB key as PB's outbox sends it. The last block
 * writes raw SQL, the path a wrangler --file repair takes, to show the rule
 * belongs to the arbiter and not to a route.
 *
 * Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow, seedProjectHome } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { nowInstant } from '../lib/time'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'product-home-test-api-key'
const PI_EMAIL = 'ingra107@umn.edu'
const ULID = '01KXH4E23G0DTFGFBYS2C8RGTH'

let db: InstanceType<typeof Database>
let env: Env
let n = 0

const row = (sql: string, ...v: unknown[]) => db.prepare(sql).get(...v) as Record<string, unknown> | undefined
const rows = (sql: string, ...v: unknown[]) => db.prepare(sql).all(...v) as Record<string, unknown>[]
const productOf = (taskId: string) => row('SELECT product_id FROM tasks WHERE id = ?', taskId)?.product_id ?? null
const liveProducts = (projectId: string) =>
  rows('SELECT id, kind, stage, is_home, stage_entered_at FROM products WHERE project_id = ? AND deleted_at IS NULL ORDER BY id', projectId)

beforeEach(() => {
  db = prodSchemaDb()
  n = 0
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI_EMAIL })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
})

/** A Hub UI request, as the PI. */
async function ui(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
  const res = await worker.fetch(new Request(`https://hub.test${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': PI_EMAIL },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env, CTX)
  return { status: res.status, text: await res.text() }
}

type Result = { status: string; code?: string; reason?: string; canonical_payload?: Record<string, unknown> }

/** One PB outbox mutation through /api/mutations with the PB key. */
async function pb(table: string, record_id: string, op: 'insert' | 'update' | 'delete', fields?: Record<string, unknown>): Promise<Result> {
  n += 1
  const now = nowInstant()
  const seq = op === 'update' ? (row(`SELECT seq FROM ${table} WHERE id = ?`, record_id)?.seq as number) : null
  // A project insert names its first product (contract phase step 3): a
  // `stage` here is that product's, sent as home_product, never a column.
  let home: Record<string, unknown> = {}
  if (table === 'projects' && op === 'insert' && fields) {
    const { stage, ...payload } = fields
    fields = payload
    home = { home_product: { kind: 'manuscript', stage: stage ?? 'idea' } }
  }
  const mutation = {
    mutation_id: `mut_home_${n}`, origin_machine: 'home', table, record_id, op,
    base_seq: seq, base_row_hash: null, depends_on: null, client_ts: now, issued_at: now,
    ...(op === 'insert' ? { payload: fields } : fields ? { patch: fields } : {}),
    ...home,
  }
  const res = await worker.fetch(new Request('https://hub.test/api/mutations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ mutations: [mutation] }),
  }), env, CTX)
  expect(res.status).toBe(200)
  return ((await res.json()) as { results: Result[] }).results[0]
}

async function pbGet(path: string) {
  const res = await worker.fetch(new Request(`https://hub.test${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  }), env, CTX)
  return { status: res.status, body: (await res.json()) as { data: Record<string, unknown>[] } }
}

/** A project row from before v125: no home product (every prod project until Backfill A). */
function legacyProject(id: string, stage = 'writing') {
  const trigger = row("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_projects_home_product_ins'")!.sql as string
  db.exec('DROP TRIGGER trg_projects_home_product_ins')
  insertRow(db, 'projects', { id, slug: id.replace('proj_', ''), title: id, category: 'MNCCORE', status: 'active', stage, stage_entered_at: '2026-01-02 03:04:05' })
  insertRow(db, 'project_members', { project_id: id, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  db.prepare('DELETE FROM project_home_seed WHERE project_id = ?').run(id)
  db.exec(trigger)
}

describe('a new project is born with its home product', () => {
  it('PB insert through /api/mutations: prd_<the project ULID>, the home_product it names, home, clock started', async () => {
    const r = await pb('projects', `proj_${ULID}`, 'insert', {
      title: 'New paper', slug: 'new-paper', category: 'MNCCORE', status: 'active', stage: 'data_analysis',
    })
    expect(r.status, r.reason).toBe('accepted')
    const [p, ...rest] = liveProducts(`proj_${ULID}`)
    expect(rest).toHaveLength(0)
    expect(p).toMatchObject({ id: `prd_${ULID}`, kind: 'manuscript', stage: 'data_analysis', is_home: 1 })
    expect(p.stage_entered_at).not.toBeNull()
  })

  it('Hub UI create (POST /api/projects): the same, and a stage off the manuscript ladder falls back to idea', async () => {
    const r = await ui('POST', '/api/projects', { title: 'Hub made project' })
    expect(r.status, r.text).toBeLessThan(300)
    const id = row("SELECT id FROM projects WHERE title = 'Hub made project'")!.id as string
    const [p] = liveProducts(id)
    expect(p).toMatchObject({ id: `prd_${id.slice(5)}`, kind: 'manuscript', stage: 'idea', is_home: 1 })
  })

  it('a project inserted already deleted gets none', () => {
    insertRow(db, 'projects', { id: 'proj_dead', slug: 'dead', title: 'x', category: 'MNCCORE', status: 'deleted', stage: 'idea', deleted_at: '2026-01-01 00:00:00' })
    expect(liveProducts('proj_dead')).toHaveLength(0)
  })

  it('its last live product cannot then be deleted (v124 keep_one_live), through the mutations door', async () => {
    await pb('projects', `proj_${ULID}`, 'insert', { title: 'P', slug: 'p', category: 'MNCCORE', status: 'active', stage: 'idea' })
    const r = await pb('products', `prd_${ULID}`, 'delete')
    expect(r.status).toBe('error')
    expect(r.reason).toContain('product_last_live')
    expect(liveProducts(`proj_${ULID}`)).toHaveLength(1)
  })
})

describe('a new task on a project carries its home product', () => {
  beforeEach(async () => {
    await pb('projects', `proj_${ULID}`, 'insert', { title: 'P', slug: 'p', category: 'MNCCORE', status: 'active', stage: 'idea' })
  })

  it('PB task insert', async () => {
    const r = await pb('tasks', 'task_pb1', 'insert', { title: 'Draft', project_id: `proj_${ULID}`, assignee: 'nick-ingraham', status: 'todo', priority: 'medium' })
    expect(r.status, r.reason).toBe('accepted')
    expect(productOf('task_pb1')).toBe(`prd_${ULID}`)
    // The ack carries it, so PB's cache mirrors the product with the row.
    expect(r.canonical_payload?.product_id).toBe(`prd_${ULID}`)
  })

  it('Hub UI task create (POST /api/tasks), by slug', async () => {
    const r = await ui('POST', '/api/tasks', { title: 'From the Hub', description: 'From the Hub', assignee: 'nick-ingraham', project_id: 'p' })
    expect(r.status, r.text).toBeLessThan(300)
    const id = row("SELECT id FROM tasks WHERE title = 'From the Hub'")!.id as string
    expect(productOf(id)).toBe(`prd_${ULID}`)
  })

  it('a task with no project stays product-less (Nick: "Leave them blank")', async () => {
    await pb('tasks', 'task_loose', 'insert', { title: 'Loose', assignee: 'nick-ingraham', status: 'todo', priority: 'medium' })
    expect(productOf('task_loose')).toBeNull()
  })

  it('a writer that names another product of the project keeps it', async () => {
    insertRow(db, 'products', { id: 'prd_second', project_id: `proj_${ULID}`, kind: 'abstract', stage: 'planning', title: 'Abstract' })
    await pb('tasks', 'task_named', 'insert', { title: 'Named', project_id: `proj_${ULID}`, product_id: 'prd_second', assignee: 'nick-ingraham', status: 'todo', priority: 'medium' })
    expect(productOf('task_named')).toBe('prd_second')
  })

  it('clearing the product of a task on a project with a home puts it back on the home', async () => {
    await pb('tasks', 'task_pb2', 'insert', { title: 'T2', project_id: `proj_${ULID}`, assignee: 'nick-ingraham', status: 'todo', priority: 'medium' })
    const r = await pb('tasks', 'task_pb2', 'update', { product_id: null })
    expect(r.status, r.reason).toBe('accepted')
    expect(productOf('task_pb2')).toBe(`prd_${ULID}`)
  })

  it('a restored tombstoned task picks up the home', () => {
    legacyProject('proj_old')
    insertRow(db, 'tasks', { id: 'task_tomb', project_id: 'proj_old', title: 'Old', assignee: 'nick-ingraham', status: 'deleted', deleted_at: '2026-01-01 00:00:00' })
    insertRow(db, 'products', { id: 'prd_old', project_id: 'proj_old', kind: 'manuscript', stage: 'writing', is_home: 1 })
    expect(productOf('task_tomb')).toBeNull()
    db.prepare("UPDATE tasks SET deleted_at = NULL, status = 'todo' WHERE id = 'task_tomb'").run()
    expect(productOf('task_tomb')).toBe('prd_old')
  })
})

describe('a project from before v125 that gains its home attaches its tasks (Backfill A)', () => {
  beforeEach(() => {
    legacyProject('proj_old')
    insertRow(db, 'tasks', { id: 'task_live', project_id: 'proj_old', title: 'Live', assignee: 'nick-ingraham', status: 'todo' })
    insertRow(db, 'tasks', { id: 'task_done', project_id: 'proj_old', title: 'Done', assignee: 'nick-ingraham', status: 'done', completed: 1, completed_at: '2026-01-01 00:00:00' })
    insertRow(db, 'tasks', { id: 'task_tomb', project_id: 'proj_old', title: 'Gone', assignee: 'nick-ingraham', status: 'deleted', deleted_at: '2026-01-01 00:00:00' })
  })

  it('one home product insert through /api/mutations attaches every live task, not the tombstone, and starts its own clock', async () => {
    const r = await pb('products', 'prd_old_home', 'insert', { project_id: 'proj_old', kind: 'award', stage: 'active', is_home: 1, venue: 'NHLBI' })
    expect(r.status, r.reason).toBe('accepted')
    expect(productOf('task_live')).toBe('prd_old_home')
    expect(productOf('task_done')).toBe('prd_old_home')
    expect(productOf('task_tomb')).toBeNull()
    // projects.stage_entered_at retired with projects.stage (contract phase
    // step 3): a new product's clock starts now, home or not.
    expect(row("SELECT stage_entered_at FROM products WHERE id = 'prd_old_home'")!.stage_entered_at).not.toBe('2026-01-02 03:04:05')
  })

  it('a slug project ref resolves to the typed id', async () => {
    const r = await pb('products', 'prd_old_home', 'insert', { project_id: 'old', kind: 'manuscript', stage: 'writing', is_home: 1 })
    expect(r.status, r.reason).toBe('accepted')
    expect(row("SELECT project_id FROM products WHERE id = 'prd_old_home'")!.project_id).toBe('proj_old')
  })

  it('a second, non-home product does not take the tasks; moving tasks onto it is a plain task patch', async () => {
    await pb('products', 'prd_a0', 'insert', { project_id: 'proj_old', kind: 'grant_application', stage: 'not_funded', is_home: 1 })
    const r = await pb('products', 'prd_a1', 'insert', { project_id: 'proj_old', kind: 'grant_application', stage: 'preparing' })
    expect(r.status, r.reason).toBe('accepted')
    expect(productOf('task_live')).toBe('prd_a0')
    const m = await pb('tasks', 'task_live', 'update', { product_id: 'prd_a1' })
    expect(m.status, m.reason).toBe('accepted')
    expect(productOf('task_live')).toBe('prd_a1')
    // A non-home product starts its own clock.
    expect(row("SELECT stage_entered_at FROM products WHERE id = 'prd_a1'")!.stage_entered_at).not.toBe('2026-01-02 03:04:05')
  })

  it('an off-ladder kind/stage pair is refused by the schema, with a code', async () => {
    const r = await pb('products', 'prd_bad', 'insert', { project_id: 'proj_old', kind: 'award', stage: 'writing', is_home: 1 })
    expect(r.status).toBe('error')
    expect(r.code).toBe('constraint')
    expect(productOf('task_live')).toBeNull()
  })
})

describe('product updates and deletes through /api/mutations', () => {
  beforeEach(async () => {
    await pb('projects', `proj_${ULID}`, 'insert', { title: 'P', slug: 'p', category: 'MNCCORE', status: 'active', stage: 'idea' })
    await pb('tasks', 'task_1', 'insert', { title: 'T', project_id: `proj_${ULID}`, assignee: 'nick-ingraham', status: 'todo', priority: 'medium' })
  })

  it('kind and stage change together; the clock restarts', async () => {
    db.prepare("UPDATE products SET stage_entered_at = '2020-01-01 00:00:00' WHERE id = ?").run(`prd_${ULID}`)
    const r = await pb('products', `prd_${ULID}`, 'update', { kind: 'honor', stage: 'preparing' })
    expect(r.status, r.reason).toBe('accepted')
    const p = row('SELECT kind, stage, stage_entered_at FROM products WHERE id = ?', `prd_${ULID}`)!
    expect(p).toMatchObject({ kind: 'honor', stage: 'preparing' })
    expect(p.stage_entered_at).not.toBe('2020-01-01 00:00:00')
  })

  it('tombstoning a non-last product moves its tasks to the home', async () => {
    await pb('products', 'prd_side', 'insert', { project_id: `proj_${ULID}`, kind: 'abstract', stage: 'planning' })
    await pb('tasks', 'task_1', 'update', { product_id: 'prd_side' })
    expect(productOf('task_1')).toBe('prd_side')
    const r = await pb('products', 'prd_side', 'delete')
    expect(r.status, r.reason).toBe('accepted')
    expect(productOf('task_1')).toBe(`prd_${ULID}`)
  })

  it('an unknown field is refused by the pb-schema whitelist', async () => {
    const r = await pb('products', `prd_${ULID}`, 'update', { stage_entered_at: '2020-01-01' })
    expect(r.code).toBe('unknown_field')
  })
})

describe('the honor kind (Nick, 2026-10-11)', () => {
  it('has its ladder, and cannot fund', () => {
    expect(row("SELECT can_fund FROM product_kinds WHERE kind = 'honor'")!.can_fund).toBe(0)
    expect(rows("SELECT stage, is_terminal FROM product_stages WHERE kind = 'honor' ORDER BY ordinal")).toEqual([
      { stage: 'preparing', is_terminal: 0 }, { stage: 'submitted', is_terminal: 0 },
      { stage: 'received', is_terminal: 1 }, { stage: 'not_received', is_terminal: 1 },
    ])
  })
})

describe('the talk kind (Nick, 2026-10-12)', () => {
  it('has its ladder (Invited > Preparing > Delivered, Declined), and cannot fund', () => {
    expect(row("SELECT label, plural_label, can_fund FROM product_kinds WHERE kind = 'talk'")).toEqual({ label: 'Talk', plural_label: 'Talks', can_fund: 0 })
    expect(rows("SELECT stage, label, is_terminal FROM product_stages WHERE kind = 'talk' ORDER BY ordinal")).toEqual([
      { stage: 'invited', label: 'Invited', is_terminal: 0 }, { stage: 'preparing', label: 'Preparing', is_terminal: 0 },
      { stage: 'delivered', label: 'Delivered', is_terminal: 1 }, { stage: 'declined', label: 'Declined', is_terminal: 1 },
    ])
  })

  it('lists beside abstracts, before grant applications', () => {
    expect(rows('SELECT kind FROM product_kinds ORDER BY sort_order').map((r) => r.kind).slice(0, 4))
      .toEqual(['manuscript', 'abstract', 'talk', 'grant_application'])
  })

  it('an abstract re-files as a delivered talk in place: kind and stage in one update, tasks stay on it', async () => {
    await pb('projects', `proj_${ULID}`, 'insert', { title: 'Grand Rounds', slug: 'gr', category: 'MNCCORE', status: 'active', stage: 'idea' })
    await pb('tasks', 'task_1', 'insert', { title: 'T', project_id: `proj_${ULID}`, assignee: 'nick-ingraham', status: 'todo', priority: 'medium' })
    expect((await pb('products', `prd_${ULID}`, 'update', { kind: 'abstract', stage: 'presented' })).status).toBe('accepted')
    const r = await pb('products', `prd_${ULID}`, 'update', { kind: 'talk', stage: 'delivered' })
    expect(r.status, r.reason).toBe('accepted')
    expect(row('SELECT kind, stage, is_home, deleted_at FROM products WHERE id = ?', `prd_${ULID}`))
      .toEqual({ kind: 'talk', stage: 'delivered', is_home: 1, deleted_at: null })
    expect(productOf('task_1')).toBe(`prd_${ULID}`)
    // A talk has no "presented" rung: the composite FK refuses the off-ladder pair.
    const bad = await pb('products', `prd_${ULID}`, 'update', { stage: 'presented' })
    expect(bad.status).not.toBe('accepted')
  })
})

describe('read routes', () => {
  beforeEach(async () => {
    // The PB-key create makes its author the first member (#145 Lane B).
    await pb('projects', `proj_${ULID}`, 'insert', { title: 'P', slug: 'p', category: 'MNCCORE', status: 'active', stage: 'writing' })
  })

  it('GET /api/products: the PB pull lane, by seq, tombstones on request', async () => {
    await pb('products', 'prd_x', 'insert', { project_id: `proj_${ULID}`, kind: 'abstract', stage: 'planning' })
    await pb('products', 'prd_x', 'delete')
    const all = await pbGet('/api/products?include_deleted=1')
    expect(all.status).toBe(200)
    expect(all.body.data.map((r) => r.id)).toEqual([`prd_${ULID}`, 'prd_x'])
    const live = await pbGet('/api/products')
    expect(live.body.data.map((r) => r.id)).toEqual([`prd_${ULID}`])
    const after = await pbGet(`/api/products?include_deleted=1&seq_after=${all.body.data[0].seq}`)
    expect(after.body.data.map((r) => r.id)).toEqual(['prd_x'])
    expect((await pbGet('/api/product-funding')).status).toBe(200)
  })

  it('GET /api/products is the sync lane only: a team member is refused', async () => {
    insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey', slug: 'casey', role: 'Analyst', member_type: 'staff', email: 'casey@umn.edu' })
    const res = await worker.fetch(new Request('https://hub.test/api/products', {
      headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': 'casey@umn.edu' },
    }), env, CTX)
    expect(res.status).toBe(403)
  })

  it('GET /api/projects/:slug/products: the visible project\'s live products with labels', async () => {
    const r = await ui('GET', '/api/projects/p/products')
    expect(r.status, r.text).toBe(200)
    const { products } = JSON.parse(r.text) as { products: Record<string, unknown>[] }
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ id: `prd_${ULID}`, kind_label: 'Manuscript', stage_label: 'Writing', is_home: 1 })
  })
})

describe('the rule is the arbiter\'s, not a route\'s', () => {
  it('raw SQL (a wrangler --file repair) that writes its seed gets the same home product and task attach', () => {
    db.prepare(`INSERT INTO project_home_seed (project_id, kind, stage) VALUES ('proj_${ULID}', 'manuscript', 'submitted')`).run()
    db.prepare(`INSERT INTO projects (id, slug, title, category, status, stage) VALUES ('proj_${ULID}', 'raw', 'Raw', 'MNCCORE', 'active', 'submitted')`).run()
    db.prepare(`INSERT INTO tasks (id, title, project_id, assignee, status) VALUES ('task_raw', 'Raw', 'proj_${ULID}', 'nick-ingraham', 'todo')`).run()
    expect(liveProducts(`proj_${ULID}`)).toMatchObject([{ id: `prd_${ULID}`, stage: 'submitted', is_home: 1 }])
    expect(productOf('task_raw')).toBe(`prd_${ULID}`)
  })

  it('a project id that is not proj_<ULID> (the PUT upsert keeps a legacy 32-char id) gets prd_<32 hex>, never a non-canonical id', () => {
    const legacy = 'a'.repeat(31) + 'b'
    seedProjectHome(db, { id: legacy })
    db.prepare(`INSERT INTO projects (id, slug, title, category, status, stage) VALUES ('${legacy}', 'leg', 'Leg', 'MNCCORE', 'active', 'idea')`).run()
    const [p] = liveProducts(legacy)
    expect(String(p.id)).toMatch(/^prd_[0-9a-f]{32}$/)
  })

  it('a restored project gets its home back: the tombstoned home returns and the restored tasks attach', () => {
    seedProjectHome(db, { id: `proj_${ULID}` })
    db.prepare(`INSERT INTO projects (id, slug, title, category, status, stage) VALUES ('proj_${ULID}', 'r', 'R', 'MNCCORE', 'active', 'idea')`).run()
    db.prepare(`UPDATE projects SET deleted_at = datetime('now'), status = 'deleted' WHERE id = 'proj_${ULID}'`).run()
    db.prepare(`UPDATE products SET deleted_at = datetime('now') WHERE project_id = 'proj_${ULID}'`).run()
    expect(liveProducts(`proj_${ULID}`)).toHaveLength(0)
    db.prepare(`UPDATE projects SET deleted_at = NULL, status = 'active' WHERE id = 'proj_${ULID}'`).run()
    expect(liveProducts(`proj_${ULID}`)).toMatchObject([{ id: `prd_${ULID}`, is_home: 1 }])
  })

  it('a restored project whose products were removed outright gets a new home: a manuscript at the first rung (nothing to seed from)', () => {
    seedProjectHome(db, { id: `proj_${ULID}`, stage: 'writing' })
    db.prepare(`INSERT INTO projects (id, slug, title, category, status, stage) VALUES ('proj_${ULID}', 'r', 'R', 'MNCCORE', 'active', 'writing')`).run()
    db.prepare(`UPDATE projects SET deleted_at = datetime('now'), status = 'deleted' WHERE id = 'proj_${ULID}'`).run()
    db.prepare(`DELETE FROM products WHERE project_id = 'proj_${ULID}'`).run()
    db.prepare(`UPDATE projects SET deleted_at = NULL, status = 'active' WHERE id = 'proj_${ULID}'`).run()
    expect(liveProducts(`proj_${ULID}`)).toMatchObject([{ id: `prd_${ULID}`, kind: 'manuscript', stage: 'idea', is_home: 1 }])
  })

  it('a live home cannot be tombstoned while other products are live; handing the home over first works, and its tasks follow', async () => {
    await pb('projects', `proj_${ULID}`, 'insert', { title: 'P', slug: 'p', category: 'MNCCORE', status: 'active', stage: 'idea' })
    await pb('tasks', 'task_h', 'insert', { title: 'T', project_id: `proj_${ULID}`, assignee: 'nick-ingraham', status: 'todo', priority: 'medium' })
    await pb('products', 'prd_next', 'insert', { project_id: `proj_${ULID}`, kind: 'trial_ops', stage: 'start_up' })
    const refused = await pb('products', `prd_${ULID}`, 'delete')
    expect(refused.status).toBe('error')
    expect(refused.reason).toContain('product_home_live')
    const hand = await pb('products', 'prd_next', 'update', { is_home: 1 })
    expect(hand.status, hand.reason).toBe('accepted')
    expect(row(`SELECT is_home FROM products WHERE id = 'prd_${ULID}'`)!.is_home).toBe(0)
    const gone = await pb('products', `prd_${ULID}`, 'delete')
    expect(gone.status, gone.reason).toBe('accepted')
    expect(productOf('task_h')).toBe('prd_next')
  })

  it('every copy of the home rule in schema-v125 is the same text', () => {
    const sql = readFileSync(new URL('../schema-v125-product-home-paths.sql', import.meta.url), 'utf8')
    const copies = sql.match(/COALESCE\(\(SELECT h\.id FROM products h[^\n]*?HAVING COUNT\(\*\) = 1\)\)/g) ?? []
    expect(copies.length).toBe(11)
    expect(new Set(copies).size).toBe(1)
  })
})

// Cases from the 2026-10-12 cold review (its probe_v125.py), as tests.
describe('v125 edge cases (cold review)', () => {
  const P = `proj_${ULID}`
  const H = `prd_${ULID}`
  const proj = (id: string, extra: Record<string, unknown> = {}) =>
    (seedProjectHome(db, { id, deleted_at: extra.deleted_at ?? null }), db).prepare('INSERT INTO projects (id, slug, title, category, status, stage, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, id.slice(-8).toLowerCase(), id, 'MNCCORE', extra.deleted_at ? 'deleted' : 'active', 'idea', extra.deleted_at ?? null)
  const homes = (pid: string) => (row('SELECT COUNT(*) n FROM products WHERE project_id = ? AND is_home = 1 AND deleted_at IS NULL', pid)!.n as number)

  it('restore: when the derived id belongs to another project, the project still gets a home (fresh hex id)', () => {
    const Q = 'proj_01J9YYYYYYYYYYYYYYYYYYYYYY'
    proj(Q)
    insertRow(db, 'products', { id: H, project_id: Q, kind: 'trial_ops', stage: 'start_up' })
    proj(P, { deleted_at: '2026-10-11 00:00:00' })
    db.prepare("UPDATE projects SET deleted_at = NULL, status = 'active' WHERE id = ?").run(P)
    const [p, ...rest] = liveProducts(P)
    expect(rest).toHaveLength(0)
    expect(String(p.id)).toMatch(/^prd_[0-9a-f]{32}$/)
    expect(p.is_home).toBe(1)
  })

  it('insert: when the derived id belongs to another project, the new project still lands with a hex-id home', () => {
    const Q = 'proj_01J9YYYYYYYYYYYYYYYYYYYYYY'
    proj(Q)
    insertRow(db, 'products', { id: H, project_id: Q, kind: 'trial_ops', stage: 'start_up' })
    proj(P)
    expect(String(liveProducts(P)[0].id)).toMatch(/^prd_[0-9a-f]{32}$/)
  })

  it('restore: the newest tombstoned home wins even when deleted_at formats differ', () => {
    proj(P)
    insertRow(db, 'products', { id: 'prd_B', project_id: P, kind: 'trial_ops', stage: 'start_up' })
    db.prepare("UPDATE projects SET deleted_at = datetime('now'), status = 'deleted' WHERE id = ?").run(P)
    db.prepare("UPDATE products SET is_home = 1, deleted_at = '2026-10-11 23:00:00' WHERE id = 'prd_B'").run()
    db.prepare("UPDATE products SET is_home = 1, deleted_at = '2026-10-11T08:00:00Z' WHERE id = ?").run(H)
    db.prepare("UPDATE projects SET deleted_at = NULL, status = 'active' WHERE id = ?").run(P)
    expect(liveProducts(P).map((x) => x.id)).toEqual(['prd_B'])
  })

  it('a hard DELETE of a live home while others are live is refused', () => {
    proj(P)
    insertRow(db, 'products', { id: 'prd_B', project_id: P, kind: 'trial_ops', stage: 'start_up' })
    expect(() => db.prepare('DELETE FROM products WHERE id = ?').run(H)).toThrow(/product_home_live/)
    expect(homes(P)).toBe(1)
  })

  it('a task tombstoned on X, X tombstoned, task restored -> the task leaves X for the home', () => {
    proj(P)
    insertRow(db, 'products', { id: 'prd_B', project_id: P, kind: 'trial_ops', stage: 'start_up' })
    insertRow(db, 'tasks', { id: 't1', title: 't', project_id: P, product_id: 'prd_B', assignee: 'nick-ingraham', status: 'todo' })
    db.prepare("UPDATE tasks SET deleted_at = datetime('now'), status = 'deleted' WHERE id = 't1'").run()
    db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_B'").run()
    expect(productOf('t1')).toBe('prd_B')
    db.prepare("UPDATE tasks SET deleted_at = NULL, status = 'todo' WHERE id = 't1'").run()
    expect(productOf('t1')).toBe(H)
  })

  it('a task inserted naming a tombstoned product lands on the home instead', () => {
    proj(P)
    insertRow(db, 'products', { id: 'prd_B', project_id: P, kind: 'trial_ops', stage: 'start_up' })
    db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_B'").run()
    insertRow(db, 'tasks', { id: 't2', title: 't', project_id: P, product_id: 'prd_B', assignee: 'nick-ingraham', status: 'todo' })
    expect(productOf('t2')).toBe(H)
  })

  it('a batch that hands the home over first, then tombstones the old home, lands; the reverse order refuses', async () => {
    await pb('projects', P, 'insert', { title: 'P', slug: 'pp', category: 'MNCCORE', status: 'active', stage: 'idea' })
    await pb('products', 'prd_next', 'insert', { project_id: P, kind: 'trial_ops', stage: 'start_up' })
    expect((await pb('products', H, 'delete')).status).toBe('error')
    expect((await pb('products', 'prd_next', 'update', { is_home: 1 })).status).toBe('accepted')
    expect((await pb('products', H, 'delete')).status).toBe('accepted')
    expect(homes(P)).toBe(1)
  })
})

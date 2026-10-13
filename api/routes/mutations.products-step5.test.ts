/**
 * api/routes/mutations.products-step5.test.ts -- schema-v124 plan step 5, the
 * writes that must keep a task's product inside its project. (Its projects.stage
 * forwarding cases became the contract phase step 3 refusal cases below.)
 *
 * Drives the REAL worker (worker.fetch: auth, routing, viewer handle) on the
 * migration-chain database (prodSchemaDb, v124 included, FKs and triggers on).
 * Products and the tasks that sit on them are seeded, because no route writes
 * products yet; every write under test goes through a real route:
 *   - the Hub UI routes (POST /api/projects/:slug/delete, POST /api/tasks/:id,
 *     POST /api/projects/:slug) as the PI;
 *   - POST /api/mutations with the PB key, as PB's outbox sends them.
 *
 * Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.
 * Plan: PB Scratch/plans/2026-10-11-projects-products-reconciled.md step 5.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { PENDING_REFUSAL_CODES } from './mutations'
import { nowInstant } from '../lib/time'
import { REFUSAL_CODES } from '../../pb-schema/pb_schema/generated/refusal-codes.generated.ts'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'products-step5-test-api-key'
const PI_EMAIL = 'ingra107@umn.edu'

let db: InstanceType<typeof Database>
let env: Env
let n = 0

const row = (sql: string, ...v: unknown[]) => db.prepare(sql).get(...v) as Record<string, unknown>
const task = (id: string) => row('SELECT project_id, product_id, deleted_at FROM tasks WHERE id = ?', id)
const product = (id: string) => row('SELECT stage, stage_entered_at, last_mutation_id FROM products WHERE id = ?', id)
const seq = (table: string, id: string) => (row(`SELECT seq FROM ${table} WHERE id = ?`, id)).seq as number

function project(id: string) {
  insertRow(db, 'projects', { id, slug: id.replace('proj_', ''), title: id, category: 'MNCCORE', status: 'active' }, { stage: 'writing' })
  // Visibility is membership (api/lib/viewer-db.ts), the PI's included.
  insertRow(db, 'project_members', { project_id: id, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  // A short test id is not a ULID, so v125 gave the home a random prd_<hex>;
  // name it after the project so the cases below read plainly.
  db.prepare('UPDATE products SET id = ? WHERE project_id = ?').run(id.replace('proj_', 'prd_'), id)
}

/** A project inserted before schema-v125 existed: no home product. */
function legacyProject(id: string) {
  const trigger = row("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_projects_home_product_ins'").sql as string
  db.exec('DROP TRIGGER trg_projects_home_product_ins')
  project(id)
  db.prepare('DELETE FROM project_home_seed WHERE project_id = ?').run(id)
  db.exec(trigger)
}

beforeEach(() => {
  db = prodSchemaDb()
  n = 0
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI_EMAIL })
  // schema-v125: every project is born with its home product, prd_<suffix>
  // (manuscript, the project's stage, is_home = 1). The seeds below reshape
  // those homes rather than insert a first product.
  // proj_one: one product (a manuscript). proj_two: two products, no home;
  // one is untitled, which is NOT a home (Nick 2026-10-11: the home is an
  // explicit marker, never guessed). proj_umb: an umbrella whose titled
  // trial-ops product is the home. proj_none: no products (a project from
  // before v125, which every prod project is until Backfill A).
  for (const id of ['proj_one', 'proj_two', 'proj_umb', 'proj_ops']) project(id)
  legacyProject('proj_none')
  db.prepare("UPDATE products SET is_home = 0 WHERE id = 'prd_two'").run()
  insertRow(db, 'products', { id: 'prd_two_b', project_id: 'proj_two', kind: 'abstract', stage: 'planning', title: 'Abstract B' })
  db.prepare("UPDATE products SET kind = 'trial_ops', stage = 'enrolling', title = 'Trial ops' WHERE id = 'prd_umb'").run()
  insertRow(db, 'products', { id: 'prd_umb_paper', project_id: 'proj_umb', kind: 'manuscript', stage: 'idea', title: 'Primary paper' })
  db.prepare("UPDATE products SET kind = 'trial_ops', stage = 'start_up' WHERE id = 'prd_ops'").run()
  insertRow(db, 'tasks', { id: 'task_on_one', project_id: 'proj_one', product_id: 'prd_one', title: 'Draft methods', assignee: 'nick-ingraham' })
  insertRow(db, 'tasks', { id: 'task_on_paper', project_id: 'proj_umb', product_id: 'prd_umb_paper', title: 'Figure 1', assignee: 'nick-ingraham' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
})

/** A Hub UI write, as the PI. */
async function ui(path: string, body: Record<string, unknown>) {
  const res = await worker.fetch(new Request(`https://hub.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': PI_EMAIL },
    body: JSON.stringify(body),
  }), env, CTX)
  return { status: res.status, text: await res.text() }
}

type Result = { status: string; code?: string; reason?: string }

/** A PB outbox write through /api/mutations with the PB key. */
async function pb(table: string, record_id: string, op: 'update' | 'delete', patch?: Record<string, unknown>): Promise<Result> {
  n += 1
  const now = nowInstant()
  const mutation = {
    mutation_id: `mut_step5_${n}`, origin_machine: 'home', table, record_id, op,
    base_seq: op === 'update' ? seq(table, record_id) : null, base_row_hash: null, depends_on: null,
    client_ts: now, issued_at: now, ...(patch ? { patch } : {}),
  }
  const res = await worker.fetch(new Request('https://hub.test/api/mutations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ mutations: [mutation] }),
  }), env, CTX)
  expect(res.status).toBe(200)
  return ((await res.json()) as { results: Result[] }).results[0]
}

describe('step 5.1: a project soft-delete clears product_id with project_id', () => {
  it('Hub UI delete: the task keeps its work and loses both, the project is deleted', async () => {
    const r = await ui('/api/projects/proj_one/delete', {})
    expect(r.status, r.text).toBe(200)
    expect(task('task_on_one')).toEqual({ project_id: null, product_id: null, deleted_at: null })
    expect(row('SELECT deleted_at FROM projects WHERE id = ?', 'proj_one').deleted_at).not.toBeNull()
  })

  it('PB delete through /api/mutations does the same', async () => {
    const r = await pb('projects', 'proj_umb', 'delete')
    expect(r.status, r.reason).toBe('accepted')
    expect(task('task_on_paper')).toEqual({ project_id: null, product_id: null, deleted_at: null })
  })

  it('the old statement (project_id only) is what the v124 trigger refuses', () => {
    expect(() => db.prepare("UPDATE tasks SET project_id = NULL WHERE project_id = 'proj_one'").run())
      .toThrow(/task_product_project_mismatch/)
  })
})

describe('step 5.2: moving a task to another project moves or clears its product in the same write', () => {
  it('Hub UI: into a one-product project, the task takes that product', async () => {
    const r = await ui('/api/tasks/task_on_paper', { project_id: 'proj_one' })
    expect(r.status, r.text).toBe(200)
    expect(task('task_on_paper')).toMatchObject({ project_id: 'proj_one', product_id: 'prd_one' })
  })

  it('Hub UI: into an umbrella, the task takes the product marked is_home', async () => {
    const r = await ui('/api/tasks/task_on_one', { project_id: 'proj_umb' })
    expect(r.status, r.text).toBe(200)
    expect(task('task_on_one')).toMatchObject({ project_id: 'proj_umb', product_id: 'prd_umb' })
  })

  it('PB: into an umbrella, the same home product', async () => {
    const r = await pb('tasks', 'task_on_one', 'update', { project_id: 'proj_umb' })
    expect(r.status, r.reason).toBe('accepted')
    expect(task('task_on_one')).toMatchObject({ project_id: 'proj_umb', product_id: 'prd_umb' })
  })

  it('Hub UI: into a 2-product project with no home, the product clears even though one is untitled', async () => {
    const r = await ui('/api/tasks/task_on_one', { project_id: 'proj_two' })
    expect(r.status, r.text).toBe(200)
    expect(task('task_on_one')).toMatchObject({ project_id: 'proj_two', product_id: null })
  })

  it('PB: a home handed over and then tombstoned does not count; the task takes the new home', async () => {
    // v125: a live home cannot be tombstoned while other products are live;
    // marking another home first demotes it, then it can go.
    expect(() => db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_umb'").run())
      .toThrow(/product_home_live/)
    db.prepare("UPDATE products SET is_home = 1 WHERE id = 'prd_umb_paper'").run()
    db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_umb'").run()
    const r = await pb('tasks', 'task_on_one', 'update', { project_id: 'proj_umb' })
    expect(r.status, r.reason).toBe('accepted')
    expect(task('task_on_one')).toMatchObject({ project_id: 'proj_umb', product_id: 'prd_umb_paper' })
  })

  it('PB: home marked on one of two products in proj_two -> the task takes it', async () => {
    db.prepare("UPDATE products SET is_home = 1 WHERE id = 'prd_two_b'").run()
    const r = await pb('tasks', 'task_on_one', 'update', { project_id: 'proj_two' })
    expect(r.status, r.reason).toBe('accepted')
    expect(task('task_on_one')).toMatchObject({ project_id: 'proj_two', product_id: 'prd_two_b' })
  })

  it('Hub UI: a slug reference resolves first, then the product follows the resolved project', async () => {
    const r = await ui('/api/tasks/task_on_paper', { project_id: 'one' })
    expect(r.status, r.text).toBe(200)
    expect(task('task_on_paper')).toMatchObject({ project_id: 'proj_one', product_id: 'prd_one' })
  })

  it('PB: a move into a project with no products clears the product', async () => {
    const r = await pb('tasks', 'task_on_one', 'update', { project_id: 'proj_none' })
    expect(r.status, r.reason).toBe('accepted')
    expect(task('task_on_one')).toMatchObject({ project_id: 'proj_none', product_id: null })
  })

  it('PB: a move out of every project clears the product', async () => {
    const r = await pb('tasks', 'task_on_one', 'update', { project_id: null })
    expect(r.status, r.reason).toBe('accepted')
    expect(task('task_on_one')).toMatchObject({ project_id: null, product_id: null })
  })

  it('PB: a patch that names the same project leaves the product alone', async () => {
    const r = await pb('tasks', 'task_on_paper', 'update', { project_id: 'proj_umb', title: 'Figure 1 v2' })
    expect(r.status, r.reason).toBe('accepted')
    expect(task('task_on_paper')).toMatchObject({ project_id: 'proj_umb', product_id: 'prd_umb_paper' })
  })
})

describe('contract phase step 3: projects.stage is refused, loud, on every write path', () => {
  it('PB: a projects.stage patch is unknown_field, names where the stage went, and writes nothing', async () => {
    const before = seq('projects', 'proj_one')
    const r = await pb('projects', 'proj_one', 'update', { stage: 'submitted' })
    expect(r.status).toBe('error')
    expect(r.code).toBe('unknown_field')
    expect(r.reason).toContain("projects.stage is retired: a project's stage is its home product's")
    expect(seq('projects', 'proj_one')).toBe(before)
    expect(product('prd_one').stage).toBe('writing')
  })

  it('PB: a whole-row re-send that still carries stage is refused too, never half-applied', async () => {
    const r = await pb('projects', 'proj_two', 'update', { stage: 'writing', description: 'edited' })
    expect(r.code).toBe('unknown_field')
    expect(row('SELECT description FROM projects WHERE id = ?', 'proj_two').description).not.toBe('edited')
  })

  it('PB: projects.stage_entered_at is refused the same way', async () => {
    const r = await pb('projects', 'proj_one', 'update', { stage_entered_at: '2020-01-01 00:00:00' })
    expect(r.code).toBe('unknown_field')
    expect(r.reason).toContain('products.stage_entered_at')
  })

  it('Hub UI: POST /api/projects/:slug with stage is a 400 in words, nothing written', async () => {
    const before = seq('projects', 'proj_one')
    const r = await ui('/api/projects/proj_one', { stage: 'submitted', title: 'renamed' })
    expect(r.status).toBe(400)
    expect(r.text).toContain('projects.stage is retired')
    expect(seq('projects', 'proj_one')).toBe(before)
    expect(product('prd_one').stage).toBe('writing')
  })

  it('PB: a project insert with no home_product is envelope_invalid; with one it lands with that home', async () => {
    const insert = async (record_id: string, extra: Record<string, unknown>) => {
      n += 1
      const now = nowInstant()
      const mutation = {
        mutation_id: `mut_step5_ins_${n}`, origin_machine: 'home', table: 'projects', record_id, op: 'insert',
        base_seq: null, base_row_hash: null, depends_on: null, client_ts: now, issued_at: now,
        payload: { title: record_id, slug: record_id.replace('proj_', ''), status: 'active', category: 'MNCCORE' },
        ...extra,
      }
      const res = await worker.fetch(new Request('https://hub.test/api/mutations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ mutations: [mutation] }),
      }), env, CTX)
      return ((await res.json()) as { results: Result[] }).results[0]
    }
    const bare = await insert('proj_bare', {})
    expect(bare.status).toBe('error')
    expect(bare.code).toBe('envelope_invalid')
    expect(row('SELECT COUNT(*) AS n FROM projects WHERE id = ?', 'proj_bare').n).toBe(0)
    const named = await insert('proj_named', { home_product: { kind: 'abstract', stage: 'planning' } })
    expect(named.status, named.reason).toBe('accepted')
    expect(row('SELECT kind, stage, is_home FROM products WHERE project_id = ?', 'proj_named'))
      .toEqual({ kind: 'abstract', stage: 'planning', is_home: 1 })
  })
})

describe('the pending refusal code', () => {
  it('is not in pb-schema yet; when it is, delete it from PENDING_REFUSAL_CODES', () => {
    for (const code of PENDING_REFUSAL_CODES) {
      expect(REFUSAL_CODES as readonly string[], `pb-schema now lists ${code}: remove it from PENDING_REFUSAL_CODES`).not.toContain(code)
    }
  })
})

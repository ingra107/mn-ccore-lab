/**
 * api/routes/mutations.products-step5.test.ts -- schema-v124 plan step 5, the
 * writes that must keep a task's product inside its project and keep
 * projects.stage from drifting away from the product stage during the
 * expand phase.
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
const projectStage = (id: string) => (row('SELECT stage FROM projects WHERE id = ?', id)).stage
const seq = (table: string, id: string) => (row(`SELECT seq FROM ${table} WHERE id = ?`, id)).seq as number

function project(id: string) {
  insertRow(db, 'projects', { id, slug: id.replace('proj_', ''), title: id, category: 'MNCCORE', status: 'active', stage: 'writing' })
  // Visibility is membership (api/lib/viewer-db.ts), the PI's included.
  insertRow(db, 'project_members', { project_id: id, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
}

beforeEach(() => {
  db = prodSchemaDb()
  n = 0
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI_EMAIL })
  // proj_one: one product (a manuscript), not marked home. proj_two: two
  // products, no home; one is untitled, which is NOT a home (Nick 2026-10-11:
  // the home is an explicit marker, never guessed). proj_umb: an umbrella
  // whose titled trial-ops product is marked is_home = 1.
  // proj_none: no products yet (every project before Backfill A).
  for (const id of ['proj_one', 'proj_two', 'proj_umb', 'proj_none', 'proj_ops']) project(id)
  insertRow(db, 'products', { id: 'prd_one', project_id: 'proj_one', kind: 'manuscript', stage: 'writing' })
  insertRow(db, 'products', { id: 'prd_two_a', project_id: 'proj_two', kind: 'manuscript', stage: 'writing' })
  insertRow(db, 'products', { id: 'prd_two_b', project_id: 'proj_two', kind: 'abstract', stage: 'planning', title: 'Abstract B' })
  insertRow(db, 'products', { id: 'prd_umb_admin', project_id: 'proj_umb', kind: 'trial_ops', stage: 'enrolling', title: 'Trial ops', is_home: 1 })
  insertRow(db, 'products', { id: 'prd_umb_paper', project_id: 'proj_umb', kind: 'manuscript', stage: 'idea', title: 'Primary paper' })
  insertRow(db, 'products', { id: 'prd_ops', project_id: 'proj_ops', kind: 'trial_ops', stage: 'start_up' })
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
    expect(task('task_on_one')).toMatchObject({ project_id: 'proj_umb', product_id: 'prd_umb_admin' })
  })

  it('PB: into an umbrella, the same home product', async () => {
    const r = await pb('tasks', 'task_on_one', 'update', { project_id: 'proj_umb' })
    expect(r.status, r.reason).toBe('accepted')
    expect(task('task_on_one')).toMatchObject({ project_id: 'proj_umb', product_id: 'prd_umb_admin' })
  })

  it('Hub UI: into a 2-product project with no home, the product clears even though one is untitled', async () => {
    const r = await ui('/api/tasks/task_on_one', { project_id: 'proj_two' })
    expect(r.status, r.text).toBe(200)
    expect(task('task_on_one')).toMatchObject({ project_id: 'proj_two', product_id: null })
  })

  it('PB: a tombstoned home does not count; with one live product left, the task takes it', async () => {
    db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_umb_admin'").run()
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

describe('step 5.3: a projects.stage write is forwarded to a single product, refused on several', () => {
  it('Hub UI: one product -> its stage moves in the same write, stage_entered_at stamped', async () => {
    const r = await ui('/api/projects/proj_one', { stage: 'submitted' })
    expect(r.status, r.text).toBe(200)
    expect(projectStage('proj_one')).toBe('submitted')
    const p = product('prd_one')
    expect(p.stage).toBe('submitted')
    expect(p.stage_entered_at).not.toBeNull()
    expect(String(p.last_mutation_id)).toBe(String(row('SELECT last_mutation_id FROM projects WHERE id = ?', 'proj_one').last_mutation_id))
  })

  it('PB: one product -> forwarded the same way', async () => {
    const r = await pb('projects', 'proj_one', 'update', { stage: 'revisions' })
    expect(r.status, r.reason).toBe('accepted')
    expect(product('prd_one').stage).toBe('revisions')
  })

  it('PB: two products -> project_stage_unforwardable, nothing written', async () => {
    const before = seq('projects', 'proj_two')
    const r = await pb('projects', 'proj_two', 'update', { stage: 'submitted' })
    expect(r.status).toBe('error')
    expect(r.code).toBe('project_stage_unforwardable')
    expect(r.reason).toContain('holds 2 products')
    expect(projectStage('proj_two')).toBe('writing')
    expect(seq('projects', 'proj_two')).toBe(before)
    expect(product('prd_two_a').stage).toBe('writing')
  })

  it('Hub UI: two products, one of them home -> still 409 (the home is not a stage tiebreak), project stage unchanged', async () => {
    const r = await ui('/api/projects/proj_umb', { stage: 'submitted' })
    expect(r.status).toBe(409)
    expect(r.text).toContain('project_stage_unforwardable')
    expect(projectStage('proj_umb')).toBe('writing')
  })

  it('PB: one product whose kind has no such stage -> refused, not a raw FK failure', async () => {
    const r = await pb('projects', 'proj_ops', 'update', { stage: 'submitted' })
    expect(r.status).toBe('error')
    expect(r.code).toBe('project_stage_unforwardable')
    expect(r.reason).toContain('not on the trial_ops ladder')
    expect(product('prd_ops').stage).toBe('start_up')
  })

  it('PB: no products yet -> the project stage writes as it always did', async () => {
    const r = await pb('projects', 'proj_none', 'update', { stage: 'submitted' })
    expect(r.status, r.reason).toBe('accepted')
    expect(projectStage('proj_none')).toBe('submitted')
  })

  it('PB: an echo of the current stage on a multi-product project is accepted (whole-row re-sends keep working)', async () => {
    const r = await pb('projects', 'proj_two', 'update', { stage: 'writing', description: 'edited' })
    expect(r.status, r.reason).toBe('accepted')
  })
})

describe('the pending refusal code', () => {
  it('is not in pb-schema yet; when it is, delete it from PENDING_REFUSAL_CODES', () => {
    for (const code of PENDING_REFUSAL_CODES) {
      expect(REFUSAL_CODES as readonly string[], `pb-schema now lists ${code}: remove it from PENDING_REFUSAL_CODES`).not.toContain(code)
    }
  })
})

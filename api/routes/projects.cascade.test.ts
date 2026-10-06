/**
 * projects.cascade.test.ts — B-CRIT-05 + B7 (SEC-T0-7) regression guard
 *
 * handleDeleteProject's cascade-clean runs every child-table statement in ONE
 * env.DB.batch(), so a failure on any statement rolls back the whole cascade.
 * Pre-fix (projects.ts:609-611) it was separate prepare().run() calls, and a
 * failure mid-cascade left orphaned rows pointing at a deleted project.
 *
 * B7 (SEC-T0-7, 2026-05-22) expanded the cascade; schema-v78 (2026-06-10)
 * dropped comments + project_updates. R3 (Slice D, 2026-06-09): a cascade
 * failure FAILS LOUD (500) and the soft-delete does not run.
 *
 * #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts)
 * with the REAL applyMutation. The first cut mocked applyMutation, counted the
 * statements handed to a vi.fn batch, and said in its header that rollback
 * "cannot be exercised in a unit stub". d1Adapter's batch() is one real
 * transaction, so rollback IS exercised here: a statement is made to fail with
 * failSql and the children that ran earlier in the batch are read back intact.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { AuthUser, Env } from '../helpers'
import { _resetValidationFlagsCache } from '../helpers'
import { handleDeleteProject } from './projects'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const PID = 'proj_01hwtestcascade000000000a'
const SLUG = 'cascade-test-project'
const OTHER = 'proj_01hwtestcascade000000000b'
const TASK = 'task_01hwtestcascade000000000'

let db: InstanceType<typeof Database>
beforeEach(() => {
  _resetValidationFlagsCache()
  db = prodSchemaDb()
  insertRow(db, 'projects', { id: PID, slug: SLUG, title: 'Test Project', category: 'MNCCORE' })
  insertRow(db, 'projects', { id: OTHER, slug: 'cascade-other', title: 'Other Project', category: 'MNCCORE' })
  insertRow(db, 'project_documents', { id: 'doc_c1', project_id: PID, title: 'Protocol', url: 'https://x/doc' })
  insertRow(db, 'milestones', { id: 'ms_c1', project_id: PID, title: 'IRB' })
  insertRow(db, 'regulatory_items', { id: 'reg_c1', project_id: PID, item_type: 'irb', title: 'IRB approval' })
  insertRow(db, 'project_dependencies', { from_project_id: OTHER, to_project_id: PID })
  insertRow(db, 'activity_entries', { id: 'ae_c1', entity_type: 'project', entity_id: PID, kind: 'note', actor_slug: 'nick-ingraham', body: 'kickoff' })
  insertRow(db, 'tasks', { id: TASK, title: 'Draft aims', status: 'todo', priority: 'medium', assignee: 'nick-ingraham', project_id: PID })
})

const user = { email: 'ingra107@umn.edu', name: 'Nick' } as AuthUser
function makeRequest(): Request {
  return new Request('https://x/api/test', {
    method: 'POST',
    headers: { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': 'ingra107@umn.edu' },
  })
}
const count = (sql: string, ...v: unknown[]) => (db.prepare(sql).get(...v) as { n: number }).n
function children() {
  return {
    docs: count('SELECT COUNT(*) AS n FROM project_documents WHERE project_id = ?', PID),
    milestones: count('SELECT COUNT(*) AS n FROM milestones WHERE project_id = ?', PID),
    regulatory: count('SELECT COUNT(*) AS n FROM regulatory_items WHERE project_id = ?', PID),
    deps: count('SELECT COUNT(*) AS n FROM project_dependencies WHERE to_project_id = ?', PID),
    activity: count("SELECT COUNT(*) AS n FROM activity_entries WHERE entity_type = 'project' AND entity_id = ?", PID),
    linkedTasks: count('SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?', PID),
  }
}
const ALL_PRESENT = { docs: 1, milestones: 1, regulatory: 1, deps: 1, activity: 1, linkedTasks: 1 }
const deletedAt = (id: string) => (db.prepare('SELECT deleted_at FROM projects WHERE id = ?').get(id) as { deleted_at: string | null }).deleted_at
const receipts = () => count("SELECT COUNT(*) AS n FROM processed_mutations WHERE table_name = 'projects' AND record_id = ?", PID)

describe('handleDeleteProject — cascade-clean is one atomic batch (B-CRIT-05)', () => {
  it('clears every child, soft-orphans the task, soft-deletes the project with a receipt', async () => {
    expect(children()).toEqual(ALL_PRESENT)
    let batches = 0
    const env = { DB: d1Adapter(db, { beforeBatch: () => { batches++ } }) } as unknown as Env

    const response = await handleDeleteProject(PID, user, env, makeRequest())
    const body = await response.json() as { data: { deleted: string } }

    expect(response.status).toBe(200)
    expect(body.data.deleted).toBe(PID)
    expect(children()).toEqual({ docs: 0, milestones: 0, regulatory: 0, deps: 0, activity: 0, linkedTasks: 0 })
    // The task survives, unlinked (soft-orphan, not a delete).
    expect(db.prepare('SELECT project_id, deleted_at FROM tasks WHERE id = ?').get(TASK)).toEqual({ project_id: null, deleted_at: null })
    expect(deletedAt(PID)).not.toBeNull()
    expect(deletedAt(OTHER)).toBeNull()
    expect(receipts()).toBe(1)
    expect(batches).toBeGreaterThanOrEqual(1)
  })

  it('returns 404 and touches nothing when the project is not found', async () => {
    const env = { DB: d1Adapter(db) } as unknown as Env
    const response = await handleDeleteProject('proj_MISSING', user, env, makeRequest())
    expect(response.status).toBe(404)
    expect(children()).toEqual(ALL_PRESENT)
  })

  it('FAILS LOUD on a cascade statement error: 500, the whole cascade rolls back, no soft-delete (R3, Slice D 2026-06-09)', async () => {
    // R3 re-judgment (2026-06-09): the prior contract SWALLOWED a batch() failure
    // and continued the soft-delete. batch() is ATOMIC, so one broken statement
    // (e.g. the pre-Slice-D from_slug reference) rolls back the WHOLE cascade;
    // stamping the project deleted anyway leaves dangling children. Here the
    // regulatory_items statement fails AFTER project_documents and milestones
    // already ran inside the same batch: both must be back.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const env = { DB: d1Adapter(db, { failSql: /DELETE FROM regulatory_items/, failTimes: 1 }) } as unknown as Env

    const response = await handleDeleteProject(PID, user, env, makeRequest())

    expect(response.status).toBe(500)
    expect(consoleSpy).toHaveBeenCalledWith('project cascade-clean failed:', expect.any(Error))
    expect(children()).toEqual(ALL_PRESENT)
    expect(deletedAt(PID)).toBeNull()
    expect(receipts()).toBe(0)
    consoleSpy.mockRestore()
  })

  it('returns idempotent:true when the project is already soft-deleted, and runs no cascade', async () => {
    db.prepare("UPDATE projects SET deleted_at = '2026-05-09T10:00:00Z' WHERE id = ?").run(PID)
    let batches = 0
    const env = { DB: d1Adapter(db, { beforeBatch: () => { batches++ } }) } as unknown as Env

    const response = await handleDeleteProject(PID, user, env, makeRequest())
    const body = await response.json() as { data: { idempotent: boolean } }

    expect(response.status).toBe(200)
    expect(body.data.idempotent).toBe(true)
    expect(batches).toBe(0)
    expect(children()).toEqual(ALL_PRESENT)
    expect(receipts()).toBe(0)
  })
})

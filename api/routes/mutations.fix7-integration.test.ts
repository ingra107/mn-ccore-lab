/**
 * mutations.fix7-integration.test.ts — Integration coverage for Fix 7
 *
 * Audit finding (2026-05-28 full-system audit, F11):
 *   phase4-correctness.test.ts declares vi.mock('./mutations') at module scope,
 *   so its "Fix 7" test calls projectRefToCanonical directly instead of the real
 *   applyInsert. If applyInsert were ever refactored to skip the slug-resolution
 *   path (e.g. for PB-origin inserts), the mocked test would still pass while the
 *   production path silently wrote a raw slug as project_id to D1.
 *
 * This file has NO vi.mock('./mutations') hoisting, so it calls the real applyInsert
 * end-to-end.
 *
 * #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
 * The old stub answered every `FROM projects` SELECT with one canned row
 * whatever its WHERE said, and the tests searched the INSERT's bind list for
 * the resolved id. Here the project is a real row, resolution runs the real
 * `id = ? OR slug = ?` lookup, and each test reads the stored task back.
 * tasks.project_id carries no foreign key in the chain, so nothing below the
 * route would refuse a raw slug: the stored-row assertions are the guard.
 * (The stub also accepted a task with no assignee; tasks.assignee is
 * NOT NULL, so the payloads now carry one, as PB's do.)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { applyInsert } from './mutations'
import type { AuthUser, Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const NICK: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' }

let db: InstanceType<typeof Database>
let env: Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
  insertRow(db, 'projects', { id: 'proj_canonical_uuid', slug: 'my-project-slug', title: 'Fix 7 project', category: 'MNCCORE' })
  // A second project: resolution must return the row the ref names, not
  // whichever project row comes first.
  insertRow(db, 'projects', { id: 'proj_other', slug: 'other-slug', title: 'Other', category: 'MNCCORE' })
})

const storedTask = (id: string) =>
  db.prepare('SELECT id, title, project_id FROM tasks WHERE id = ?').get(id) as
    | { id: string; title: string; project_id: string | null }
    | undefined

function insertTask(taskId: string, mutationId: string, projectRef: string) {
  return applyInsert(env, {
    table: 'tasks',
    op: 'insert',
    origin_machine: 'home',
    record_id: taskId,
    mutation_id: mutationId,
    base_seq: null,
    base_row_hash: null,
    payload: { title: `Fix 7 ${taskId}`, status: 'todo', assignee: 'nick-ingraham', project_id: projectRef },
  } as Parameters<typeof applyInsert>[1], NICK)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Fix 7 integration — applyInsert slug resolution (real applyInsert, no mock)', () => {
  it('resolves a slug-form project_id to canonical typed PK before INSERT (P2)', async () => {
    // P2: canonical = proj.id (typed PK), not slug. Caller passes slug; stored value must be the PK.
    const taskId = 'task_01integration_fix7_slug_0001'
    const result = await insertTask(taskId, 'mut_test_fix7_slug_0001', 'my-project-slug')
    expect(result.status).toBe('accepted')
    expect(storedTask(taskId)).toEqual({ id: taskId, title: `Fix 7 ${taskId}`, project_id: 'proj_canonical_uuid' })
  })

  it('keeps a UUID-form project_id as the canonical typed PK (P2)', async () => {
    const taskId = 'task_01integration_fix7_uuid_0002'
    const result = await insertTask(taskId, 'mut_test_fix7_uuid_0002', 'proj_canonical_uuid')
    expect(result.status).toBe('accepted')
    expect(storedTask(taskId)?.project_id).toBe('proj_canonical_uuid')
  })

  it('resolves to the project the ref names, not to an arbitrary project row', async () => {
    const taskId = 'task_01integration_fix7_other_0004'
    expect((await insertTask(taskId, 'mut_test_fix7_other_0004', 'other-slug')).status).toBe('accepted')
    expect(storedTask(taskId)?.project_id).toBe('proj_other')
  })

  it('sets project_id to null when project ref does not resolve', async () => {
    // Unresolvable refs become null (no reject — PB may push before project arrives)
    const taskId = 'task_01integration_fix7_null_0003'
    const result = await insertTask(taskId, 'mut_test_fix7_null_0003', 'nonexistent-slug')
    expect(result.status).toBe('accepted')
    expect(storedTask(taskId)).toEqual({ id: taskId, title: `Fix 7 ${taskId}`, project_id: null })
  })
})

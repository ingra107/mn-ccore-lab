/**
 * mutations.apply-patch-fk.test.ts — A1 (Slice C, 2026-06-08)
 *
 * Verifies that applyUpdate/applyPatch canonicalizes FK slug fields (project_id)
 * on the UPDATE path — closing the gap where applyInsert resolved slugs but
 * applyPatch stored them raw (root-cause of the 2 prod slug-stored rows).
 *
 * Mirrors mutations.fix7-integration.test.ts (INSERT path) — no vi.mock so the
 * real applyUpdate is exercised end-to-end.
 *
 * Cases:
 *   1. applyUpdate with slug project_id on existing row → stored as typed proj_*
 *   2. applyUpdate with already-typed project_id → stored unchanged (idempotent)
 *   3. applyUpdate with unresolvable project_id → stored as NULL (no reject)
 *
 * #8862: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
 * The stub this file used answered every `FROM projects` lookup with one canned
 * row and asserted on UPDATE bindings; the project lookup SQL itself never ran
 * and the receipt INSERT always succeeded. Now the projects are real rows, the
 * assertion is the STORED project_id, and the receipt is read back.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'
import type { AuthUser, Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

const TASK_ID = 'task_01update_test_000000000001'
const NICK: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' }

let db: InstanceType<typeof Database>
let env: Env
let baseSeq: number
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
  insertRow(db, 'projects', { id: 'proj_original_00000000000000001', slug: 'original', title: 'Original' })
  insertRow(db, 'projects', { id: 'proj_canonical_00000000000000001', slug: 'my-project-slug', title: 'Canonical' })
  baseSeq = insertRow(db, 'tasks', {
    id: TASK_ID, title: 'Existing task', assignee: 'nick', status: 'todo',
    project_id: 'proj_original_00000000000000001', last_mutation_id: 'mut_prior',
  }).seq as number
})

const stored = () => db.prepare('SELECT project_id, title FROM tasks WHERE id = ?').get(TASK_ID) as { project_id: string | null; title: string }

// origin_machine is part of every real envelope (processOne refuses one without
// it). The old stub let this file omit it; the receipt column is NOT NULL.
async function update(mutationId: string, patch: Record<string, unknown>) {
  return applyUpdate(env, {
    op: 'update', table: 'tasks', record_id: TASK_ID, mutation_id: mutationId, origin_machine: 'home',
    base_seq: baseSeq, base_row_hash: null, patch,
    client_ts: '2026-06-08T12:00:00Z', issued_at: '2026-06-08T12:00:00Z',
  } as Mutation, NICK)
}

describe('A1 — applyPatch FK slug canonicalization on UPDATE path (Slice C)', () => {
  it('resolves slug project_id to typed proj_* PK before UPDATE', async () => {
    // Caller sends a slug — applyPatch must resolve to typed PK before UPDATE
    const result = await update('mut_test_patch_slug_0001', { project_id: 'my-project-slug', title: 'Updated title' })
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expect(stored()).toEqual({ project_id: 'proj_canonical_00000000000000001', title: 'Updated title' })
    expect(receiptOf(db, 'mut_test_patch_slug_0001')!.outcome).toBe(result.status)
  })

  it('leaves already-typed project_id unchanged (idempotent)', async () => {
    const result = await update('mut_test_patch_typed_0002', {
      project_id: 'proj_canonical_00000000000000001', title: 'Title update with typed PK',
    })
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expect(stored().project_id).toBe('proj_canonical_00000000000000001')
  })

  it('stores NULL when project_id ref is unresolvable (no reject)', async () => {
    // Must not reject — unresolvable FK becomes NULL (mirrors applyInsert behavior)
    const result = await update('mut_test_patch_unresolvable_0003', {
      project_id: 'nonexistent-slug', title: 'Title with unresolvable project',
    })
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expect(stored()).toEqual({ project_id: null, title: 'Title with unresolvable project' })
  })
})

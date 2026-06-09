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
 */

import { describe, it, expect } from 'vitest'
import { applyUpdate } from './mutations'
import type { AuthUser, Env } from '../helpers'

// ── Stub DB ──────────────────────────────────────────────────────────────────

interface StubUpdateOpts {
  /** Existing task row returned for SELECT FROM tasks WHERE id=? */
  existingRow?: Record<string, unknown> | null
  /** Project row returned for SELECT FROM projects WHERE id=? OR slug=? */
  projectRow?: { id: string } | null
}

function makeUpdateStubDB(opts: StubUpdateOpts = {}) {
  const {
    existingRow = {
      id: 'task_01update_test_000000000001',
      title: 'Existing task',
      status: 'todo',
      project_id: 'proj_original_00000000000000001',
      seq: 1,
      last_mutation_id: 'mut_prior',
      deleted_at: null,
      completed_at: null,
    },
    projectRow = { id: 'proj_canonical_00000000000000001' },
  } = opts

  // Track UPDATE SQL and bindings for assertion
  const updateCalls: { sql: string; bindings: unknown[] }[] = []

  function makeStmt(sql: string, boundVals: unknown[]): ReturnType<typeof makeStmt> {
    const upper = sql.trim().toUpperCase()
    const self = {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T>() => {
        // processed_mutations idempotency check → no prior entry
        if (upper.includes('PROCESSED_MUTATIONS')) return null as T
        // Task lookup (readCanonical or initial SELECT)
        if (upper.includes('FROM TASKS')) return existingRow as T
        // Project FK resolution (projectRefToCanonical in FK_SLUG_FIELDS loop)
        if (upper.includes('FROM PROJECTS')) return projectRow as T
        return null as T
      },
      all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
      run: async () => {
        if (upper.startsWith('UPDATE TASKS')) {
          updateCalls.push({ sql, bindings: [...boundVals] })
        }
        if (upper.startsWith('INSERT INTO PROCESSED_MUTATIONS')) {
          return { meta: { changes: 1 } }
        }
        return { meta: { changes: 1 } }
      },
    }
    return self
  }

  return {
    _updateCalls: updateCalls,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async () => [],
  }
}

const NICK: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick' }

// ── Tests ────────────────────────────────────────────────────────────────────

describe('A1 — applyPatch FK slug canonicalization on UPDATE path (Slice C)', () => {
  it('resolves slug project_id to typed proj_* PK before UPDATE', async () => {
    const db = makeUpdateStubDB({
      projectRow: { id: 'proj_canonical_00000000000000001' },
    })
    const env = { DB: db } as unknown as Env

    const result = await applyUpdate(env, {
      op: 'update',
      table: 'tasks',
      record_id: 'task_01update_test_000000000001',
      mutation_id: 'mut_test_patch_slug_0001',
      base_seq: 1,
      patch: {
        // Caller sends a slug — applyPatch must resolve to typed PK before UPDATE
        project_id: 'my-project-slug',
        title: 'Updated title',
      },
    }, NICK)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    // Must have fired an UPDATE tasks call
    expect(db._updateCalls.length).toBeGreaterThan(0)
    const { bindings } = db._updateCalls[0]

    // Typed PK must appear in the UPDATE bindings
    const typedIdx = bindings.indexOf('proj_canonical_00000000000000001')
    expect(typedIdx, 'typed PK must be in UPDATE bindings').toBeGreaterThanOrEqual(0)

    // Raw slug must NOT appear in the UPDATE bindings
    const slugIdx = bindings.indexOf('my-project-slug')
    expect(slugIdx, 'raw slug must NOT be in UPDATE bindings').toBe(-1)
  })

  it('leaves already-typed project_id unchanged (idempotent)', async () => {
    const db = makeUpdateStubDB({
      // projectRefToCanonical resolves typed PK to itself via `WHERE id = ?`
      projectRow: { id: 'proj_canonical_00000000000000001' },
    })
    const env = { DB: db } as unknown as Env

    const result = await applyUpdate(env, {
      op: 'update',
      table: 'tasks',
      record_id: 'task_01update_test_000000000001',
      mutation_id: 'mut_test_patch_typed_0002',
      base_seq: 1,
      patch: {
        // Already-typed PK — must pass through unchanged
        project_id: 'proj_canonical_00000000000000001',
        title: 'Title update with typed PK',
      },
    }, NICK)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    expect(db._updateCalls.length).toBeGreaterThan(0)
    const { bindings } = db._updateCalls[0]

    // Typed PK must appear
    const typedIdx = bindings.indexOf('proj_canonical_00000000000000001')
    expect(typedIdx, 'typed PK must be in UPDATE bindings').toBeGreaterThanOrEqual(0)
  })

  it('stores NULL when project_id ref is unresolvable (no reject)', async () => {
    const db = makeUpdateStubDB({
      // No project found — projectRefToCanonical returns null
      projectRow: null,
    })
    const env = { DB: db } as unknown as Env

    const result = await applyUpdate(env, {
      op: 'update',
      table: 'tasks',
      record_id: 'task_01update_test_000000000001',
      mutation_id: 'mut_test_patch_unresolvable_0003',
      base_seq: 1,
      patch: {
        project_id: 'nonexistent-slug',
        title: 'Title with unresolvable project',
      },
    }, NICK)

    // Must not reject — unresolvable FK becomes NULL (mirrors applyInsert behavior)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    expect(db._updateCalls.length).toBeGreaterThan(0)
    const { bindings } = db._updateCalls[0]

    // Raw slug must NOT appear (was replaced by null)
    const slugIdx = bindings.indexOf('nonexistent-slug')
    expect(slugIdx, 'raw unresolvable slug must NOT be in UPDATE bindings').toBe(-1)

    // null must appear (the canonical resolved value)
    const nullIdx = bindings.indexOf(null)
    expect(nullIdx, 'null must appear in UPDATE bindings for unresolvable ref').toBeGreaterThanOrEqual(0)
  })
})

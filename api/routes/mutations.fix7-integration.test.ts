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
 * end-to-end. The DB stub resolves a slug-form project_id to a canonical row;
 * the test asserts that the INSERT SQL receives the resolved value, not the raw slug.
 */

import { describe, it, expect } from 'vitest'
import { applyInsert } from './mutations'
import type { AuthUser, Env } from '../helpers'

// ── Stub DB that tracks INSERT bindings ──────────────────────────────────────

interface StubDBOpts {
  /** The project row returned for any SELECT FROM projects query */
  projectRow?: { id: string; slug: string | null; category?: string | null } | null
}

function makeStubDB(opts: StubDBOpts = {}) {
  const {
    projectRow = { id: 'proj_canonical_uuid', slug: 'my-project-slug', category: 'MNCCORE' },
  } = opts

  // Capture INSERT bindings so we can assert what value landed in project_id
  const insertBindings: unknown[][] = []

  function makeStmt(sql: string, boundVals: unknown[]): ReturnType<typeof makeStmt> {
    const self = {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T>() => {
        const upper = sql.trim().toUpperCase()
        // processed_mutations idempotency check — no prior entry
        if (upper.includes('PROCESSED_MUTATIONS')) return null as T
        // project lookup (projectRefToCanonical inside FK_SLUG_FIELDS loop)
        if (upper.includes('FROM PROJECTS')) return projectRow as T
        // task SELECT (applyInsert reads tasks WHERE id = ? after INSERT)
        if (upper.includes('FROM TASKS')) return null as T
        return null as T
      },
      all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
      run: async () => {
        const upper = sql.trim().toUpperCase()
        if (upper.startsWith('INSERT INTO TASKS')) {
          // Capture bound values for assertion
          insertBindings.push([...boundVals])
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
    _insertBindings: insertBindings,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async () => [],
  }
}

const NICK: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick' }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Fix 7 integration — applyInsert slug resolution (real applyInsert, no mock)', () => {
  it('resolves a slug-form project_id to canonical typed PK before INSERT (P2)', async () => {
    // P2: canonical = proj.id (typed PK), not slug. Caller passes slug; stored value must be the PK.
    const db = makeStubDB({
      projectRow: { id: 'proj_canonical_uuid', slug: 'my-project-slug', category: 'MNCCORE' },
    })
    const env = { DB: db } as unknown as Env

    const taskId = 'task_01integration_fix7_slug_0001'
    const result = await applyInsert(env, {
      table: 'tasks',
      record_id: taskId,
      mutation_id: 'mut_test_fix7_slug_0001',
      payload: {
        title: 'Fix 7 slug resolution test',
        status: 'todo',
        // Caller passes the raw slug — applyInsert must resolve to proj.id
        project_id: 'my-project-slug',
      },
    }, NICK)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    // P2: canonical = proj.id ('proj_canonical_uuid'), not slug.
    const insertArgs = db._insertBindings[0]
    expect(insertArgs).toBeDefined()
    const projectIdIdx = (insertArgs as unknown[]).indexOf('proj_canonical_uuid')
    expect(projectIdIdx).toBeGreaterThanOrEqual(0)
    // Slug must NOT appear in INSERT bindings (it was replaced by the typed PK)
    const slugIdx = (insertArgs as unknown[]).indexOf('my-project-slug')
    expect(slugIdx).toBe(-1)
  })

  it('resolves a UUID-form project_id to canonical typed PK before INSERT (P2)', async () => {
    // Caller passes the UUID directly; proj.id = 'proj_canonical_uuid' is already canonical.
    const db = makeStubDB({
      projectRow: { id: 'proj_canonical_uuid', slug: 'my-project-slug', category: 'MNCCORE' },
    })
    const env = { DB: db } as unknown as Env

    const taskId = 'task_01integration_fix7_uuid_0002'
    const result = await applyInsert(env, {
      table: 'tasks',
      record_id: taskId,
      mutation_id: 'mut_test_fix7_uuid_0002',
      payload: {
        title: 'Fix 7 UUID resolution test',
        status: 'todo',
        // Caller passes the typed PK directly — stored value is also the typed PK.
        project_id: 'proj_canonical_uuid',
      },
    }, NICK)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    // P2: canonical = proj.id ('proj_canonical_uuid') — UUID IS the canonical form.
    const insertArgs = db._insertBindings[0]
    expect(insertArgs).toBeDefined()
    const resolvedIdx = (insertArgs as unknown[]).indexOf('proj_canonical_uuid')
    expect(resolvedIdx).toBeGreaterThanOrEqual(0)
    // Slug must NOT appear in INSERT bindings (proj.id was used, not slug)
    const slugIdx = (insertArgs as unknown[]).indexOf('my-project-slug')
    expect(slugIdx).toBe(-1)
  })

  it('sets project_id to null when project ref does not resolve', async () => {
    // Unresolvable ref — projectRow = null means no row found
    const db = makeStubDB({ projectRow: null })
    const env = { DB: db } as unknown as Env

    const taskId = 'task_01integration_fix7_null_0003'
    const result = await applyInsert(env, {
      table: 'tasks',
      record_id: taskId,
      mutation_id: 'mut_test_fix7_null_0003',
      payload: {
        title: 'Fix 7 unresolvable ref test',
        status: 'todo',
        project_id: 'nonexistent-slug',
      },
    }, NICK)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    // Unresolvable refs become null (no reject — PB may push before project arrives)
    const insertArgs = db._insertBindings[0]
    expect(insertArgs).toBeDefined()
    // 'nonexistent-slug' must NOT appear (was replaced by null)
    const rawIdx = (insertArgs as unknown[]).indexOf('nonexistent-slug')
    expect(rawIdx).toBe(-1)
    // null must appear (the resolved value)
    const nullIdx = (insertArgs as unknown[]).indexOf(null)
    expect(nullIdx).toBeGreaterThanOrEqual(0)
  })
})

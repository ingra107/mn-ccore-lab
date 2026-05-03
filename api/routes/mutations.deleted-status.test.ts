// I7 regression test (2026-05-03): op='update' with patch.status='deleted'
// must co-apply deleted_at so Hub D1 rows don't stay visible with I7 invariant
// "deleted brain.db task still active on Hub".
//
// We exercise applyPatch indirectly through applyUpdate which is the exported
// path reached by processOne when op='update'. Because we need a real D1 binding
// we use the miniflare in-process D1 stub that vitest provides via the wrangler
// vitest pool.

import { describe, it, expect, beforeAll } from 'vitest'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'

// Minimal D1 stub that stores rows in-memory. Sufficient for unit-testing
// applyUpdate without a real Cloudflare binding.
function makeStubDB() {
  const store: Map<string, Record<string, unknown>> = new Map()

  function makeStmt(sql: string, boundVals: unknown[]) {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T>() => {
        // SELECT * FROM tasks WHERE id = ?
        const id = boundVals[0] as string
        return (store.get(id) ?? null) as T | null
      },
      run: async () => {
        const upper = sql.trim().toUpperCase()
        if (upper.startsWith('UPDATE')) {
          // Parse SET clauses to apply patch. Very minimal — handles our test cases.
          const setMatch = sql.match(/SET (.+) WHERE/s)
          if (setMatch) {
            const pairs = setMatch[1].split(',').map(s => s.trim())
            const id = boundVals[boundVals.length - 1] as string
            const row = store.get(id)
            if (row) {
              let paramIdx = 0
              for (const pair of pairs) {
                const [col, placeholder] = pair.split('=').map(s => s.trim())
                if (placeholder.includes('datetime')) {
                  row[col] = new Date().toISOString().replace('T', ' ').slice(0, 19)
                } else {
                  row[col] = boundVals[paramIdx++]
                }
              }
              store.set(id, row)
            }
          }
        } else if (upper.startsWith('INSERT INTO processed_mutations')) {
          // No-op for unit test
        }
        return { meta: { changes: 1 } }
      },
    }
  }

  return {
    _store: store,
    prepare: (sql: string) => makeStmt(sql, []),
  }
}

describe('I7 fix — op=update with status=deleted sets deleted_at', () => {
  const taskId = 'task_01hwtest000000000000000001'

  it('sets deleted_at when status=deleted and deleted_at was NULL', async () => {
    const db = makeStubDB()
    // Seed an active task (deleted_at = null)
    db._store.set(taskId, {
      id: taskId,
      title: 'Test task',
      status: 'todo',
      deleted_at: null,
      seq: 1,
      last_mutation_id: null,
    })

    const mut: Mutation = {
      mutation_id: 'mut_01hwtest000000000000000001',
      origin_machine: 'home',
      table: 'tasks',
      op: 'update',
      record_id: taskId,
      base_seq: 1,
      base_row_hash: null,
      patch: { status: 'deleted' },
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }

    const fakeEnv = { DB: db } as unknown as import('../helpers').Env
    const fakeUser = { email: 'test@example.com', role: 'admin' } as import('../helpers').AuthUser

    const result = await applyUpdate(fakeEnv, mut, fakeUser)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    const row = db._store.get(taskId)!
    expect(row.status).toBe('deleted')
    expect(typeof row.deleted_at).toBe('string')
    expect((row.deleted_at as string).length).toBeGreaterThan(0)
  })

  it('does not overwrite deleted_at when already set (idempotent)', async () => {
    const db = makeStubDB()
    const existingDeletedAt = '2026-05-01 12:00:00'
    db._store.set(taskId, {
      id: taskId,
      title: 'Already deleted',
      status: 'deleted',
      deleted_at: existingDeletedAt,
      seq: 5,
      last_mutation_id: 'mut_prev',
    })

    const mut: Mutation = {
      mutation_id: 'mut_01hwtest000000000000000002',
      origin_machine: 'home',
      table: 'tasks',
      op: 'update',
      record_id: taskId,
      base_seq: 5,
      base_row_hash: null,
      patch: { status: 'deleted' },
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }

    const fakeEnv = { DB: db } as unknown as import('../helpers').Env
    const fakeUser = { email: 'test@example.com', role: 'admin' } as import('../helpers').AuthUser

    const result = await applyUpdate(fakeEnv, mut, fakeUser)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    // deleted_at must not have been overwritten
    const row = db._store.get(taskId)!
    expect(row.deleted_at).toBe(existingDeletedAt)
  })

  it('does NOT set deleted_at for non-deleted status updates', async () => {
    const db = makeStubDB()
    db._store.set(taskId, {
      id: taskId,
      title: 'Active task',
      status: 'todo',
      deleted_at: null,
      seq: 2,
      last_mutation_id: null,
    })

    const mut: Mutation = {
      mutation_id: 'mut_01hwtest000000000000000003',
      origin_machine: 'home',
      table: 'tasks',
      op: 'update',
      record_id: taskId,
      base_seq: 2,
      base_row_hash: null,
      patch: { status: 'done' },
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }

    const fakeEnv = { DB: db } as unknown as import('../helpers').Env
    const fakeUser = { email: 'test@example.com', role: 'admin' } as import('../helpers').AuthUser

    const result = await applyUpdate(fakeEnv, mut, fakeUser)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    const row = db._store.get(taskId)!
    expect(row.deleted_at).toBeNull()
  })
})

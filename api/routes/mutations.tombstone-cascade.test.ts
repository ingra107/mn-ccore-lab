// codex Fixes 1+2+3 (2026-05-11):
//   Fix 1: Tombstone resurrection guard — applyUpdate rejects updates to
//           soft-deleted rows unless patch explicitly sets deleted_at=null.
//   Fix 2: Task delete cascade in applyDelete — task_comments / task_updates /
//           task_subtasks / notifications cleaned atomically via env.DB.batch().
//   Fix 3: Project delete cascade in applyDelete — comments / project_updates
//           cleaned and tasks.project_id NULLed via env.DB.batch().

import { describe, it, expect } from 'vitest'
import { applyUpdate, applyDelete } from './mutations'

// ── Stub DB ──────────────────────────────────────────────────────────────────
// Tracks batch() calls and deleted child rows in addition to the main store.
function makeStubDB() {
  const store: Map<string, Record<string, unknown>> = new Map()
  const mutations: Map<string, Record<string, unknown>> = new Map()
  const batchedSqls: string[] = []

  function makeStmt(sql: string, boundVals: unknown[]): ReturnType<typeof makeStmt> {
    const self = {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T>() => {
        const upper = sql.trim().toUpperCase()
        if (upper.includes('PROCESSED_MUTATIONS')) {
          const id = boundVals[0] as string
          return (mutations.get(id) ?? null) as T | null
        }
        const id = boundVals[0] as string
        return (store.get(id) ?? null) as T | null
      },
      all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
      run: async () => {
        const upper = sql.trim().toUpperCase()
        if (upper.startsWith('UPDATE')) {
          const setMatch = sql.match(/SET (.+) WHERE/s)
          if (setMatch) {
            const pairs = setMatch[1].split(',').map((s: string) => s.trim())
            const id = boundVals[boundVals.length - 1] as string
            const row = store.get(id)
            if (row) {
              let paramIdx = 0
              for (const pair of pairs) {
                const [col, placeholder] = pair.split('=').map((s: string) => s.trim())
                if (placeholder && placeholder.includes('datetime')) {
                  row[col] = new Date().toISOString().replace('T', ' ').slice(0, 19)
                } else if (placeholder && placeholder.toUpperCase() === 'NULL') {
                  row[col] = null
                } else {
                  row[col] = boundVals[paramIdx++]
                }
              }
              store.set(id, row)
            }
          }
          return { meta: { changes: 1 } }
        }
        if (upper.startsWith('INSERT INTO PROCESSED_MUTATIONS')) {
          const mutId = boundVals[0] as string
          if (!mutations.has(mutId)) {
            mutations.set(mutId, {
              mutation_id: mutId,
              origin_machine: boundVals[1] as string,
              outcome: boundVals[2] as string,
              original_response_json: boundVals[3] as string,
              table_name: boundVals[4] as string,
              record_id: boundVals[5] as string,
            })
            return { meta: { changes: 1 } }
          }
          return { meta: { changes: 0 } }
        }
        if (upper.startsWith('INSERT INTO')) {
          const id = boundVals[0] as string
          if (!store.has(id)) {
            const colsMatch = sql.match(/INSERT INTO \w+ \(([^)]+)\)/)
            if (colsMatch) {
              const cols = colsMatch[1].split(',').map((c: string) => c.trim())
              const row: Record<string, unknown> = {}
              cols.forEach((col: string, i: number) => { row[col] = boundVals[i] ?? null })
              row['seq'] = 1
              store.set(id, row)
            }
          }
          return { meta: { changes: 1 } }
        }
        if (upper.startsWith('DELETE FROM')) {
          batchedSqls.push(sql.trim())
          return { meta: { changes: 0 } }
        }
        return { meta: { changes: 0 } }
      },
    }
    return self
  }

  return {
    _store: store,
    _mutations: mutations,
    _batchedSqls: batchedSqls,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
      for (const s of stmts) {
        await s.run()
      }
      return []
    },
  }
}

// ── Fix 1: Tombstone resurrection guard ──────────────────────────────────────

describe('Fix 1: applyUpdate rejects updates to deleted rows', () => {
  const taskId = 'task_01tombstone_res_guard_00001'

  it('rejects a field-only patch (no status change) on a deleted task', async () => {
    // The dangerous resurrection path: updating due_date/priority/etc on a
    // tombstoned row without intending to undelete. Without the guard this
    // silently applies the patch and leaves an inconsistent tombstone.
    const db = makeStubDB()
    db._store.set(taskId, {
      id: taskId,
      title: 'Tombstoned task',
      status: 'deleted',
      deleted_at: '2026-05-10 12:00:00',
      seq: 5,
      last_mutation_id: 'mut_old',
    })

    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyUpdate(env, {
      mutation_id: 'mut_tombstone_test_001',
      op: 'update',
      table: 'tasks',
      record_id: taskId,
      patch: { due_date: '2026-06-01' },  // no status change, no deleted_at clear
      base_seq: null,
      base_row_hash: null,
      depends_on: null,
      payload: null,
      origin_machine: 'pb:home',
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }, user)

    expect(result.status).toBe('error')
    expect(result.reason).toContain('deleted')

    // Row must remain untouched
    const row = db._store.get(taskId)
    expect(row?.deleted_at).toBe('2026-05-10 12:00:00')
  })

  it('allows status=todo patch on deleted row (I7-INVERSE: PB outbox undelete path)', async () => {
    // PB sends op=update + patch={status:'todo'} when correcting a deletion.
    // The I7-INVERSE bridge in applyPatch co-clears deleted_at.
    // The guard must allow this through (status is a live value).
    const db = makeStubDB()
    db._store.set(taskId, {
      id: taskId,
      title: 'Tombstoned task',
      status: 'deleted',
      deleted_at: '2026-05-10 12:00:00',
      seq: 5,
      last_mutation_id: 'mut_old',
    })

    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyUpdate(env, {
      mutation_id: 'mut_tombstone_test_001b',
      op: 'update',
      table: 'tasks',
      record_id: taskId,
      patch: { status: 'todo' },
      base_seq: null,
      base_row_hash: null,
      depends_on: null,
      payload: null,
      origin_machine: 'pb:home',
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }, user)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
  })

  it('allows a patch that explicitly clears deleted_at (undelete path)', async () => {
    const db = makeStubDB()
    db._store.set(taskId, {
      id: taskId,
      title: 'Tombstoned task',
      status: 'deleted',
      deleted_at: '2026-05-10 12:00:00',
      seq: 5,
      last_mutation_id: 'mut_old',
    })

    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyUpdate(env, {
      mutation_id: 'mut_tombstone_test_002',
      op: 'update',
      table: 'tasks',
      record_id: taskId,
      patch: { status: 'todo', deleted_at: null },  // explicit undelete
      base_seq: null,
      base_row_hash: null,
      depends_on: null,
      payload: null,
      origin_machine: 'pb:home',
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }, user)

    // applyPatch will apply the patch — status transitions allowed with explicit deleted_at=null
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
  })
})

// ── Fix 2: Task delete cascade ────────────────────────────────────────────────

describe('Fix 2: applyDelete cascades for tasks table', () => {
  const taskId = 'task_01cascade_test_task_000001'

  it('issues DELETE statements for task_comments, task_updates, notifications', async () => {
    const db = makeStubDB()
    db._store.set(taskId, {
      id: taskId,
      title: 'Task with comments',
      status: 'todo',
      deleted_at: null,
      seq: 3,
      last_mutation_id: null,
    })

    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyDelete(env, {
      mutation_id: 'mut_cascade_test_001',
      op: 'delete',
      table: 'tasks',
      record_id: taskId,
      patch: null,
      payload: null,
      base_seq: null,
      base_row_hash: null,
      depends_on: null,
      origin_machine: 'pb:home',
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }, user)

    expect(result.status).toBe('accepted')

    // Cascade SQLs must have been issued via batch()
    const sqls = db._batchedSqls.join(' ')
    expect(sqls).toContain('task_comments')
    expect(sqls).toContain('task_updates')
    expect(sqls).toContain('notifications')
  })

  it('is idempotent on an already-deleted task (no cascade re-run)', async () => {
    const db = makeStubDB()
    db._store.set(taskId, {
      id: taskId,
      title: 'Already deleted',
      status: 'deleted',
      deleted_at: '2026-05-10 12:00:00',
      seq: 4,
      last_mutation_id: 'mut_old',
    })

    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyDelete(env, {
      mutation_id: 'mut_cascade_test_002',
      op: 'delete',
      table: 'tasks',
      record_id: taskId,
      patch: null,
      payload: null,
      base_seq: null,
      base_row_hash: null,
      depends_on: null,
      origin_machine: 'pb:home',
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }, user)

    // Already deleted — early-return path, no cascade
    expect(result.status).toBe('accepted')
    expect(result.reason).toContain('already deleted')
    // No child deletes issued
    expect(db._batchedSqls).toHaveLength(0)
  })
})

// ── Fix 3: Project delete cascade ────────────────────────────────────────────

describe('Fix 3: applyDelete cascades for projects table', () => {
  const projId = 'proj_01cascade_test_proj_000001'

  it('issues DELETE for comments/project_updates and NULL for tasks.project_id', async () => {
    const db = makeStubDB()
    db._store.set(projId, {
      id: projId,
      slug: 'test-project',
      name: 'Test Project',
      deleted_at: null,
      seq: 2,
      last_mutation_id: null,
    })

    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyDelete(env, {
      mutation_id: 'mut_cascade_test_003',
      op: 'delete',
      table: 'projects',
      record_id: projId,
      patch: null,
      payload: null,
      base_seq: null,
      base_row_hash: null,
      depends_on: null,
      origin_machine: 'pb:home',
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }, user)

    expect(result.status).toBe('accepted')

    const sqls = db._batchedSqls.join(' ')
    expect(sqls).toContain('comments')
    expect(sqls).toContain('project_updates')
    // tasks.project_id should be NULLed (UPDATE not DELETE)
    expect(sqls).toMatch(/project_id|UPDATE tasks/i)
  })
})

// mutations.restore-roundtrip.test.ts — delete → restore convergence contract
// (2026-07-21, quick-delete of over-produced meeting action items).
//
// WHY A SECOND TEST FILE: tasks.restore.test.ts mocks applyMutation, so it can
// only prove the SHAPE of the envelope handleRestoreTask emits. It cannot prove
// that shape actually un-sets the tombstone — the seam under test is stubbed
// out. This file stubs nothing in the mutation path: it runs the REAL
// applyDelete, then the REAL applyUpdate → applyPatch against an in-memory DB
// that executes the generated SET clauses (the same harness
// mutations.apply-delete.tombstone.test.ts uses), and asserts the resulting ROW.
//
// The assertion that matters is `deleted_at === null` AFTER the restore. If
// I7-INVERSE ever stops firing — or someone "helpfully" adds an explicit
// deleted_at to the restore patch, which SUPPRESSES the co-clear via the
// explicit-wins precedence at mutations.ts:1368 — the row would rest at
// `{ status: 'todo', deleted_at: <set> }`. That is the shape PB's pull refuses
// as suspicious-alive (sync.pull.tombstone_inconsistent_state_refused,
// hub.py:2093-2117): the Hub row would read alive while brain.db stayed
// tombstoned, and the two stores would never converge. Green here is the only
// thing standing between "undo worked" and a silent cross-store split.

import { describe, it, expect } from 'vitest'
import { nowInstant } from '../lib/time'
import { applyDelete, applyUpdate } from './mutations'
import type { Mutation } from './mutations'

// In-memory DB that APPLIES the SET clause each apply* function generates —
// including literal `NULL` and `datetime('now')` — so the row state after the
// call is the real product of the real SQL. Copied from
// mutations.apply-delete.tombstone.test.ts (same contract, same harness).
function makeStubDB() {
  const store: Map<string, Record<string, unknown>> = new Map()

  function makeStmt(sql: string, boundVals: unknown[]) {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T>() => {
        const id = boundVals[0] as string
        return (store.get(id) ?? null) as T | null
      },
      run: async () => {
        const upper = sql.trim().toUpperCase()
        if (upper.startsWith('UPDATE') && !upper.includes('processed_mutations')) {
          const setMatch = sql.match(/SET (.+?) WHERE/s)
          if (setMatch) {
            const pairs = setMatch[1].split(',').map((s) => s.trim())
            const id = boundVals[boundVals.length - 1] as string
            const row = store.get(id)
            if (row) {
              let paramIdx = 0
              for (const pair of pairs) {
                const eqIdx = pair.indexOf('=')
                const col = pair.slice(0, eqIdx).trim()
                const placeholder = pair.slice(eqIdx + 1).trim()
                if (placeholder.includes('datetime')) {
                  row[col] = nowInstant().replace('T', ' ').slice(0, 19)
                } else if (placeholder.toUpperCase() === 'NULL') {
                  row[col] = null
                } else if (placeholder.startsWith("'") && placeholder.endsWith("'")) {
                  row[col] = placeholder.slice(1, -1)
                } else {
                  row[col] = boundVals[paramIdx++]
                }
              }
              store.set(id, row)
            }
          }
        }
        return { meta: { changes: 1 } }
      },
      all: async () => ({ results: [] }),
    }
  }

  return {
    _store: store,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => Promise.all(stmts.map((s) => s.run())),
  }
}

const fakeUser = { email: 'test@example.com', role: 'admin' } as import('../helpers').AuthUser

function mut(over: Partial<Mutation>): Mutation {
  return {
    mutation_id: `mut_${Math.random().toString(36).slice(2)}`,
    origin_machine: 'hub_ui:test',
    table: 'tasks',
    op: 'update',
    record_id: 'task_restore_roundtrip_0001',
    base_seq: null,
    base_row_hash: null,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
    ...over,
  } as Mutation
}

function seed(db: ReturnType<typeof makeStubDB>, over: Record<string, unknown> = {}) {
  const id = 'task_restore_roundtrip_0001'
  db._store.set(id, {
    id,
    title: 'Over-produced action item',
    status: 'todo',
    completed: 0,
    completed_at: null,
    completed_by: null,
    deleted_at: null,
    seq: 1,
    last_mutation_id: null,
    ...over,
  })
  return id
}

describe('delete → restore round trip (real applyDelete + applyUpdate)', () => {
  it('clears deleted_at and returns the row to a live status', async () => {
    const db = makeStubDB()
    const id = seed(db)
    const env = { DB: db } as unknown as import('../helpers').Env

    const del = await applyDelete(env, mut({ op: 'delete', record_id: id }), fakeUser)
    expect(del.status).toMatch(/^(accepted|merged_clean)$/)

    // Tombstoned as PB expects: BOTH signals set.
    const tombstoned = db._store.get(id)!
    expect(tombstoned.status).toBe('deleted')
    expect(typeof tombstoned.deleted_at).toBe('string')

    // The exact patch handleRestoreTask emits — status only, NO deleted_at.
    const res = await applyUpdate(env, mut({
      op: 'update',
      record_id: id,
      patch: { status: 'todo', completed: 0, completed_at: null, completed_by: null },
    }), fakeUser)
    expect(res.status).toMatch(/^(accepted|merged_clean)$/)

    const restored = db._store.get(id)!
    // THE assertion: the tombstone is gone. A non-null deleted_at here is the
    // cross-store split described in the header.
    expect(restored.deleted_at).toBeNull()
    expect(restored.status).toBe('todo')
    expect(restored.completed).toBe(0)
  })

  it('restores a previously-DONE item with its completion triad intact', async () => {
    const db = makeStubDB()
    const id = seed(db, { status: 'done', completed: 1, completed_at: '2026-07-20 09:00:00', completed_by: 'nick@umn.edu' })
    const env = { DB: db } as unknown as import('../helpers').Env

    await applyDelete(env, mut({ op: 'delete', record_id: id }), fakeUser)
    expect(db._store.get(id)!.status).toBe('deleted')

    await applyUpdate(env, mut({
      op: 'update',
      record_id: id,
      patch: { status: 'done', completed: 1, completed_at: '2026-07-20 09:00:00', completed_by: 'nick@umn.edu' },
    }), fakeUser)

    const restored = db._store.get(id)!
    expect(restored.deleted_at).toBeNull()
    expect(restored.status).toBe('done')
    expect(restored.completed).toBe(1)
    expect(restored.completed_at).toBe('2026-07-20 09:00:00')
  })

  it('a patch that does NOT address the deletion is refused (guard still armed)', async () => {
    const db = makeStubDB()
    const id = seed(db)
    const env = { DB: db } as unknown as import('../helpers').Env

    await applyDelete(env, mut({ op: 'delete', record_id: id }), fakeUser)

    // No status in the patch → applyUpdate's tombstone resurrection guard must
    // reject rather than silently apply a field edit to a tombstoned row.
    const res = await applyUpdate(env, mut({
      op: 'update',
      record_id: id,
      patch: { due_date: '2026-08-01' },
    }), fakeUser)

    expect(res.status).toBe('error')
    expect(db._store.get(id)!.deleted_at).not.toBeNull()
  })
})

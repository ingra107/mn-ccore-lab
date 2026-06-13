// mutations.i40-email-link.test.ts — I40 class-close: A3 applyPatch path (2026-06-13)
//
// PB outbox patches that carry source_thread_id route through applyPatch
// (the A3 /api/mutations handler). The earlier I40 fix (2026-06-10/11) only
// covered handleCreateTask, handleMobileTasksToHub, and handleUpdateTask.
// The A3 applyPatch path was the gap: a PB push with
//   op='update', patch={ source_thread_id: '...' }
// was written verbatim — no email_link derived. Caught live by PB invariant
// I40 on 2026-06-13 (task_01KTV6W01V3CA7HCVWZAKTCSKX, mut_01KTZZC9E2K2ZJZ6F3NZW8T5RV).
//
// These tests pin the derived-pair rule for the applyPatch code path.

import { describe, it, expect } from 'vitest'
import { nowInstant } from '../lib/time'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'

function makeStubDB() {
  const store: Map<string, Record<string, unknown>> = new Map()

  function makeStmt(sql: string, boundVals: unknown[]) {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T>() => {
        const upper = sql.trim().toUpperCase()
        if (upper.includes('PROJECTS') && upper.includes('WHERE')) {
          return null as T | null
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
                  row[col] = nowInstant().replace('T', ' ').slice(0, 19)
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
          return { meta: { changes: 1 } }
        }
        return { meta: { changes: 0 } }
      },
    }
  }

  return {
    _store: store,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) =>
      Promise.all(stmts.map(s => s.run())),
  }
}

function seedTask(db: ReturnType<typeof makeStubDB>, id: string, extra: Record<string, unknown> = {}) {
  db._store.set(id, {
    id,
    title: 'Probe',
    status: 'todo',
    priority: 'medium',
    assignee: 'nick-ingraham',
    seq: 1,
    deleted_at: null,
    project_id: null,
    email_link: null,
    source_thread_id: null,
    last_mutation_id: null,
    ...extra,
  })
}

const fakeUser = { email: 'ingra107@umn.edu', name: 'Nick' } as import('../helpers').AuthUser

describe('I40 fix — applyPatch (A3 path) derives email_link with source_thread_id', () => {
  it('A3 update patch with source_thread_id derives the paired Gmail link', async () => {
    const db = makeStubDB()
    const id = 'task_01i40test_a3_emaillink_0001'
    seedTask(db, id)
    const env = { DB: db } as unknown as import('../helpers').Env

    const mut: Mutation = {
      mutation_id: 'mut_01i40testA3elink000000001A',
      origin_machine: 'home',
      table: 'tasks',
      op: 'update',
      record_id: id,
      base_seq: 1,
      base_row_hash: null,
      patch: { source_thread_id: '19e83df442d6ce09' },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const result = await applyUpdate(env, mut, fakeUser)
    expect(result.status).toBe('accepted')

    const row = db._store.get(id)
    expect(row?.source_thread_id).toBe('19e83df442d6ce09')
    expect(row?.email_link).toBe('https://mail.google.com/mail/u/1/#inbox/19e83df442d6ce09')
  })

  it('A3 update patch clearing source_thread_id clears email_link', async () => {
    const db = makeStubDB()
    const id = 'task_01i40test_a3_emaillink_0002'
    seedTask(db, id, {
      source_thread_id: 'OLDTHREAD',
      email_link: 'https://mail.google.com/mail/u/1/#inbox/OLDTHREAD',
    })
    const env = { DB: db } as unknown as import('../helpers').Env

    const mut: Mutation = {
      mutation_id: 'mut_01i40testA3elink000000002A',
      origin_machine: 'home',
      table: 'tasks',
      op: 'update',
      record_id: id,
      base_seq: 1,
      base_row_hash: null,
      patch: { source_thread_id: null },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const result = await applyUpdate(env, mut, fakeUser)
    expect(result.status).toBe('accepted')

    const row = db._store.get(id)
    expect(row?.source_thread_id).toBeNull()
    expect(row?.email_link).toBeNull()
  })

  it('A3 update patch without source_thread_id does not touch email_link', async () => {
    const db = makeStubDB()
    const id = 'task_01i40test_a3_emaillink_0003'
    seedTask(db, id, {
      source_thread_id: 'SOMETHREAD',
      email_link: 'https://mail.google.com/mail/u/1/#inbox/SOMETHREAD',
    })
    const env = { DB: db } as unknown as import('../helpers').Env

    const mut: Mutation = {
      mutation_id: 'mut_01i40testA3elink000000003A',
      origin_machine: 'home',
      table: 'tasks',
      op: 'update',
      record_id: id,
      base_seq: 1,
      base_row_hash: null,
      patch: { due_date: '2026-06-15' },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const result = await applyUpdate(env, mut, fakeUser)
    expect(result.status).toBe('accepted')

    const row = db._store.get(id)
    // email_link stays as seeded — unrelated update must not clear it
    expect(row?.email_link).toBe('https://mail.google.com/mail/u/1/#inbox/SOMETHREAD')
    expect(row?.source_thread_id).toBe('SOMETHREAD')
  })

  it('explicit email_link in A3 patch wins over the derived value', async () => {
    const db = makeStubDB()
    const id = 'task_01i40test_a3_emaillink_0004'
    seedTask(db, id)
    const env = { DB: db } as unknown as import('../helpers').Env

    const customLink = 'https://mail.google.com/mail/u/0/#all/CUSTOMTHREAD'
    const mut: Mutation = {
      mutation_id: 'mut_01i40testA3elink000000004A',
      origin_machine: 'home',
      table: 'tasks',
      op: 'update',
      record_id: id,
      base_seq: 1,
      base_row_hash: null,
      patch: { source_thread_id: 'SOMETHREAD', email_link: customLink },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const result = await applyUpdate(env, mut, fakeUser)
    expect(result.status).toBe('accepted')

    const row = db._store.get(id)
    // explicit email_link in the patch wins — derivation must not override it
    expect(row?.email_link).toBe(customLink)
  })
})

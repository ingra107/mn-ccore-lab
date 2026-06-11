// tasks.update-emaillink.test.ts — I40 class-close regression guard (2026-06-11)
//
// The Gmail Apps Script morning run stamps source_thread_id onto matched
// EXISTING tasks through handleUpdateTask. Both CREATE paths derive
// email_link from source_thread_id (PB §2D, 2026-06-10) but the UPDATE path
// did not — caught live by PB invariant I40 on the first real Apps Script
// morning (6 tasks with a thread id and no Gmail link). These tests pin the
// derived-pair rule on UPDATE: writing source_thread_id carries the derived
// email_link with it; clearing it clears the link.

import { describe, it, expect } from 'vitest'
import { nowInstant } from '../lib/time'
import { handleUpdateTask } from './tasks'

function makeStubDB() {
  const store: Map<string, Record<string, unknown>> = new Map()
  const mutations: Map<string, Record<string, unknown>> = new Map()

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
          const mutId = boundVals[0] as string
          if (!mutations.has(mutId)) {
            mutations.set(mutId, { mutation_id: mutId })
            return { meta: { changes: 1 } }
          }
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
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async () => [],
  }
}

function apiKeyPost(body: unknown): Request {
  return new Request('https://x/api/tasks/test', {
    method: 'POST',
    headers: {
      'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const user = { email: 'ingra107@umn.edu', name: 'Nick' } as import('../helpers').AuthUser

function seedTask(db: ReturnType<typeof makeStubDB>, id: string, extra: Record<string, unknown> = {}) {
  db._store.set(id, {
    id, title: 'Probe', status: 'todo', priority: 'medium', assignee: 'nick-ingraham',
    seq: 1, deleted_at: null, project_id: null, email_link: null, source_thread_id: null,
    ...extra,
  })
}

describe('handleUpdateTask derives email_link with source_thread_id (I40 class-close)', () => {
  it('writing source_thread_id on update derives the paired Gmail link', async () => {
    const db = makeStubDB()
    const id = 'task_01hwtest_emaillink_000001'
    seedTask(db, id)
    const env = { DB: db } as unknown as import('../helpers').Env

    const res = await handleUpdateTask(id, apiKeyPost({ source_thread_id: '19ebTESTthread01' }), user, env)
    expect(res.status).toBe(200)

    const row = db._store.get(id)
    expect(row?.source_thread_id).toBe('19ebTESTthread01')
    expect(row?.email_link).toBe('https://mail.google.com/mail/u/1/#inbox/19ebTESTthread01')
  })

  it('clearing source_thread_id clears the derived link (pair moves together)', async () => {
    const db = makeStubDB()
    const id = 'task_01hwtest_emaillink_000002'
    seedTask(db, id, {
      source_thread_id: 'OLDTHREAD',
      email_link: 'https://mail.google.com/mail/u/1/#inbox/OLDTHREAD',
    })
    const env = { DB: db } as unknown as import('../helpers').Env

    const res = await handleUpdateTask(id, apiKeyPost({ source_thread_id: null }), user, env)
    expect(res.status).toBe(200)

    const row = db._store.get(id)
    expect(row?.source_thread_id).toBe(null)
    expect(row?.email_link).toBe(null)
  })

  it('an unrelated update does not touch email_link', async () => {
    const db = makeStubDB()
    const id = 'task_01hwtest_emaillink_000003'
    seedTask(db, id)
    const env = { DB: db } as unknown as import('../helpers').Env

    const res = await handleUpdateTask(id, apiKeyPost({ due_date: '2026-06-12' }), user, env)
    expect(res.status).toBe(200)

    const row = db._store.get(id)
    expect(row?.email_link).toBe(null)
    expect('email_link' in (row ?? {})).toBe(true)
  })
})

// tasks.kind.test.ts — schema-v109 tasks.kind guard (2026-09-16, GH #131/#132)
//
// A milestone is a task row with kind='milestone'. The column is NOT NULL
// DEFAULT 'task' on both stores, so the UPDATE path must 400 on any value
// outside shared/taskKinds.ts AND on a null/'' clear (there is no "reset to
// default" through a patch — a milestone must not silently become a task).
// Stub DB copied from tasks.update-emaillink.test.ts.

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

describe('handleUpdateTask guards tasks.kind (schema-v109)', () => {
  it('kind=milestone lands on the row', async () => {
    const db = makeStubDB()
    const id = 'task_01hwtest_kind_000001'
    seedTask(db, id, { kind: 'task' })
    const env = { DB: db } as unknown as import('../helpers').Env

    const res = await handleUpdateTask(id, apiKeyPost({ kind: 'milestone' }), user, env)
    expect(res.status).toBe(200)
    expect(db._store.get(id)?.kind).toBe('milestone')
  })

  it('an unlisted kind is a 400 that names the vocabulary', async () => {
    const db = makeStubDB()
    const id = 'task_01hwtest_kind_000002'
    seedTask(db, id, { kind: 'task' })
    const env = { DB: db } as unknown as import('../helpers').Env

    const res = await handleUpdateTask(id, apiKeyPost({ kind: 'deadline' }), user, env)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/Invalid kind "deadline"\. Must be one of task\/milestone/)
    expect(db._store.get(id)?.kind).toBe('task')
  })

  it('a null or empty kind is refused (NOT NULL, no clear branch)', async () => {
    for (const bad of [null, '']) {
      const db = makeStubDB()
      const id = 'task_01hwtest_kind_000003'
      seedTask(db, id, { kind: 'milestone' })
      const env = { DB: db } as unknown as import('../helpers').Env

      const res = await handleUpdateTask(id, apiKeyPost({ kind: bad }), user, env)
      expect(res.status).toBe(400)
      expect(db._store.get(id)?.kind).toBe('milestone')
    }
  })

  it('an unrelated patch leaves kind alone', async () => {
    const db = makeStubDB()
    const id = 'task_01hwtest_kind_000004'
    seedTask(db, id, { kind: 'milestone' })
    const env = { DB: db } as unknown as import('../helpers').Env

    const res = await handleUpdateTask(id, apiKeyPost({ due_date: '2026-10-01' }), user, env)
    expect(res.status).toBe(200)
    expect(db._store.get(id)?.kind).toBe('milestone')
  })
})

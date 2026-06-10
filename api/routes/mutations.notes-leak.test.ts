// Phase 2 — notes privacy leak guard (/api/mutations canonical_payload)
//
// SEC-P2-03: task mutation results (applyInsert, applyUpdate, applyDelete)
//            must NOT echo `notes` in canonical_payload.
//
// readCanonical() does SELECT * on tasks — the `notes` field is a private
// brain.db column that must be stripped before it reaches the wire.
//
// TDD: write these tests first, run → FAIL, then fix readCanonical().

import { describe, it, expect } from 'vitest'
import { nowInstant } from '../lib/time'
import { handleMutations } from './mutations'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'

// ── Shared stub DB ────────────────────────────────────────────────────────────
//
// Pattern mirrors mutations.apply-mutation.test.ts. Critically, the stored
// row includes `notes` so that IF readCanonical does SELECT * and returns
// notes in canonical_payload, the test will catch it.

function makeStubDB(seedRows: Record<string, Record<string, unknown>> = {}) {
  const store: Map<string, Record<string, unknown>> = new Map(
    Object.entries(seedRows)
  )
  const mutations: Map<string, Record<string, unknown>> = new Map()

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),

      first: async <T>() => {
        const upper = sql.trim().toUpperCase()

        // processed_mutations idempotency check
        if (upper.includes('PROCESSED_MUTATIONS')) {
          const id = boundVals[0] as string
          return (mutations.get(id) ?? null) as T | null
        }

        // Dedup SELECT (tasks title+project_id query)
        if (upper.includes('TITLE =') && upper.includes('PROJECT_ID IS')) {
          return null as T | null
        }

        // Validation flags
        if (upper.includes('VALIDATION_FLAGS')) {
          return null as T | null
        }

        // SELECT * FROM tasks WHERE id = ? (readCanonical + initial fetch)
        const id = boundVals[0] as string
        return (store.get(id) ?? null) as T | null
      },

      all: async <T>() => {
        return { results: [] as T[], success: true, meta: {} }
      },

      run: async () => {
        const upper = sql.trim().toUpperCase()
        if (upper.startsWith('UPDATE')) {
          const setMatch = sql.match(/SET (.+) WHERE/s)
          if (setMatch) {
            const pairs = setMatch[1].split(',').map((s: string) => s.trim())
            // Last bound val is the WHERE id value
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
            mutations.set(mutId, { mutation_id: mutId, origin_machine: boundVals[1] })
            return { meta: { changes: 1 } }
          }
          return { meta: { changes: 0 } }
        }
        if (upper.startsWith('INSERT INTO TASKS') || upper.startsWith('INSERT INTO ')) {
          const id = boundVals[0] as string
          if (id && !store.has(id)) {
            // Build a row from bound values. Column order from applyInsert:
            // id, meeting_id, project_id, title, description, assignee,
            // assigned_by, due_date, deadline, priority, status, source,
            // completed, completed_at, completed_by, created_at, ...
            const colsMatch = sql.match(/INSERT INTO \w+ \(([^)]+)\)/)
            if (colsMatch) {
              const cols = colsMatch[1].split(',').map((c: string) => c.trim())
              const row: Record<string, unknown> = {}
              cols.forEach((col: string, i: number) => { row[col] = boundVals[i] ?? null })
              row['seq'] = 1
              row['deleted_at'] = null
              // Preserve notes in the stored row — this is the leak we're testing
              store.set(id, row)
            }
          }
          return { meta: { changes: 1 } }
        }
        return { meta: { changes: 0 } }
      },
    }
  }

  return {
    _store: store,
    _mutations: mutations,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: any[]) => {
      for (const s of stmts) await s.run()
      return []
    },
  }
}

const fakeUser: AuthUser = {
  email: 'nate@umn.edu',
  name: 'Nate Mesfin',
  isNick: false,
} as unknown as AuthUser

// M07: handleMutations now requires PI/API-key auth. Use a stable test key so
// validateApiKey(request, env) returns true, bypassing the getPiEmails DB call.
const TEST_API_KEY = 'test-mutations-api-key'

function makeRequest(mutations: Mutation[]): Request {
  return new Request('https://example.com/api/mutations', {
    method: 'POST',
    body: JSON.stringify({ mutations }),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_API_KEY}`,
    },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('mutations canonical_payload — SEC-P2-03 notes not in response', () => {
  const taskId = 'task_01hwtest_mut_notes_0001'

  it('task UPDATE canonical_payload does not contain notes', async () => {
    const db = makeStubDB({
      [taskId]: {
        id: taskId,
        title: 'Confidential task',
        description: 'Team-visible description',
        assignee: 'nate-mesfin',
        status: 'todo',
        completed: 0,
        priority: 'medium',
        notes: 'PRIVATE brain.db note — must not reach team via mutations',
        deleted_at: null,
        seq: 3,
        last_mutation_id: null,
      },
    })

    const env = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env
    const mut: Mutation = {
      mutation_id: 'mut_notes_test_update_0001',
      origin_machine: 'home',
      table: 'tasks',
      op: 'update',
      record_id: taskId,
      base_seq: 3,
      base_row_hash: null,
      patch: { status: 'in_progress' },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const res = await handleMutations(makeRequest([mut]), fakeUser, env)
    const body = await res.json() as {
      results: Array<{ status: string; canonical_payload?: Record<string, unknown> }>
    }

    expect(body.results[0].status).toMatch(/^(accepted|merged_clean)$/)
    const payload = body.results[0].canonical_payload
    expect(payload).toBeDefined()
    expect(payload).not.toHaveProperty('notes')
  })

  it('task UPDATE canonical_payload still has non-private fields', async () => {
    const db = makeStubDB({
      [taskId]: {
        id: taskId,
        title: 'Confidential task',
        description: 'Team-visible description',
        assignee: 'nate-mesfin',
        status: 'todo',
        completed: 0,
        priority: 'medium',
        notes: 'PRIVATE note',
        deleted_at: null,
        seq: 3,
        last_mutation_id: null,
      },
    })

    const env = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env
    const mut: Mutation = {
      mutation_id: 'mut_notes_test_update_0002',
      origin_machine: 'home',
      table: 'tasks',
      op: 'update',
      record_id: taskId,
      base_seq: 3,
      base_row_hash: null,
      patch: { status: 'in_progress' },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const res = await handleMutations(makeRequest([mut]), fakeUser, env)
    const body = await res.json() as {
      results: Array<{ status: string; canonical_payload?: Record<string, unknown> }>
    }

    const payload = body.results[0].canonical_payload
    expect(payload).toHaveProperty('id', taskId)
    expect(payload).toHaveProperty('description', 'Team-visible description')
    expect(payload).toHaveProperty('assignee', 'nate-mesfin')
  })

  it('task INSERT carrying notes is REJECTED outright (pb-schema 0.4.0 wire contract)', async () => {
    // pb-schema 0.4.0 (2026-06-10) retired the vestigial `notes` wire alias from
    // TABLE_FIELDS.tasks. The old SEC-P2-03 behavior (accept + strip from the
    // canonical_payload echo) is superseded: an unknown field now ERRORS, which
    // makes the leak structurally impossible AND keeps schema drift visible.
    const newTaskId = 'task_01hwtest_mut_notes_insert_0001'
    const db = makeStubDB()  // empty store — insert creates the row

    const env = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env
    const mut: Mutation = {
      mutation_id: 'mut_notes_test_insert_0001',
      origin_machine: 'home',
      table: 'tasks',
      op: 'insert',
      record_id: newTaskId,
      base_seq: null,
      base_row_hash: null,
      payload: {
        title: 'New task with private note',
        description: 'Team-visible description',
        assignee: 'nate-mesfin',
        status: 'todo',
        priority: 'medium',
        notes: 'PRIVATE note that must not be echoed',
        created_at: nowInstant(),
      },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const res = await handleMutations(makeRequest([mut]), fakeUser, env)
    const body = await res.json() as {
      results: Array<{ status: string; canonical_payload?: Record<string, unknown> }>
    }

    expect(body.results[0].status).toBe('error')
    // And the error echo must not leak the note text back either.
    expect(JSON.stringify(body.results[0])).not.toContain('PRIVATE note')
  })

  it('non-task table mutations are unaffected by task-specific stripping', async () => {
    // Projects don't have a notes column — verify no regression on project mutations.
    const projectId = 'proj_01hwtest_mut_notes_proj_0001'
    const db = makeStubDB({
      [projectId]: {
        id: projectId,
        slug: 'test-project',
        title: 'Test Project',
        status: 'active',
        stage: 'analysis',
        category: 'MNCCORE',
        deleted_at: null,
        seq: 2,
        last_mutation_id: null,
      },
    })

    const env = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env
    const mut: Mutation = {
      mutation_id: 'mut_notes_test_proj_0001',
      origin_machine: 'home',
      table: 'projects',
      op: 'update',
      record_id: projectId,
      base_seq: 2,
      base_row_hash: null,
      patch: { status: 'waiting_external' },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const res = await handleMutations(makeRequest([mut]), fakeUser, env)
    const body = await res.json() as {
      results: Array<{ status: string; canonical_payload?: Record<string, unknown> }>
    }

    expect(body.results[0].status).toMatch(/^(accepted|merged_clean)$/)
    const payload = body.results[0].canonical_payload
    if (payload) {
      // Project row should still be returned intact
      expect(payload).toHaveProperty('id', projectId)
      expect(payload).toHaveProperty('slug', 'test-project')
    }
  })
})

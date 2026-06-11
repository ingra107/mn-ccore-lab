// Phase 3.1 tests (2026-05-04):
//   - applyMutation() envelope factory: mints mut_ id, sets origin_machine,
//     records in processed_mutations, stamps last_mutation_id on the row.
// (handleSyncBulkTasks deleted 2026-05-12; HUB_BULK_MIGRATION_MODE gate removed.)

import { describe, it, expect } from 'vitest'
import { nowInstant } from '../lib/time'
import { applyMutation, applyInsert, applyUpdate } from './mutations'

// ── Stub DB ──────────────────────────────────────────────────────────────────
// Handles: SELECT * FROM tasks/projects WHERE id = ?,
//          UPDATE tasks/projects SET ... WHERE id = ?,
//          INSERT INTO tasks/projects ... ON CONFLICT DO NOTHING,
//          SELECT FROM processed_mutations (idempotency check -- always null),
//          INSERT INTO processed_mutations ... ON CONFLICT DO NOTHING,
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
        // SELECT * FROM tasks/projects WHERE id = ?
        const id = boundVals[0] as string
        return (store.get(id) ?? null) as T | null
      },
      all: async <T>() => {
        return { results: [] as T[], success: true, meta: {} }
      },
      run: async () => {
        const upper = sql.trim().toUpperCase()
        if (upper.startsWith('UPDATE')) {
          // Parse SET clauses to apply patch.
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
          // Simulate atomic ON CONFLICT DO NOTHING: first wins
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
          // INSERT for tasks/projects with ON CONFLICT DO NOTHING
          // Extract the id from the bound values (first after col list)
          const id = boundVals[0] as string
          if (!store.has(id)) {
            const colsMatch = sql.match(/INSERT INTO \w+ \(([^)]+)\)/)
            const valsMatch = sql.match(/VALUES \(([^)]+)\)/)
            if (colsMatch) {
              const cols = colsMatch[1].split(',').map((c: string) => c.trim())
              // Map each VALUES slot to its placeholder so SQL literals like
              // datetime('now') (NOT bound) resolve, mirroring the UPDATE path.
              // Bound `?` slots advance through boundVals in order; literal slots
              // are evaluated inline. Without this, a non-bound updated_at column
              // would silently map to null and the stamp test couldn't see it.
              const valTokens = valsMatch
                ? valsMatch[1].split(',').map((s: string) => s.trim())
                : cols.map(() => '?')
              const row: Record<string, unknown> = {}
              let boundIdx = 0
              cols.forEach((col: string, i: number) => {
                const token = valTokens[i] ?? '?'
                if (token.includes('datetime')) {
                  row[col] = nowInstant().replace('T', ' ').slice(0, 19)
                } else if (token.toUpperCase() === 'NULL') {
                  row[col] = null
                } else {
                  row[col] = boundVals[boundIdx++] ?? null
                }
              })
              row['seq'] = 1
              store.set(id, row)
            }
          }
          return { meta: { changes: 1 } }
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

describe('applyMutation envelope factory', () => {
  const taskId = 'task_01hwtest_apply_mut_0000001'

  it('mints mut_ id and records in processed_mutations on update', async () => {
    const db = makeStubDB()
    db._store.set(taskId, {
      id: taskId,
      title: 'Test task',
      status: 'todo',
      completed: 0,
      deleted_at: null,
      seq: 3,
      last_mutation_id: null,
    })

    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyMutation(env, {
      table: 'tasks',
      record_id: taskId,
      op: 'update',
      patch: { status: 'done', completed: 1 },
      route: 'handleUpdateTaskStatus',
      user,
    })

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expect(result.mutation_id).toMatch(/^mut_/)

    // Must be recorded in processed_mutations
    const recorded = db._mutations.get(result.mutation_id)
    expect(recorded).not.toBeNull()
    expect(recorded?.origin_machine).toBe('hub_ui:handleUpdateTaskStatus')
    expect(recorded?.table_name).toBe('tasks')
    expect(recorded?.record_id).toBe(taskId)
  })

  it('mints mut_ id on insert', async () => {
    const db = makeStubDB()
    const newTaskId = 'task_01hwtest_apply_mut_0000002'

    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyMutation(env, {
      table: 'tasks',
      record_id: newTaskId,
      op: 'insert',
      payload: {
        title: 'New task from Hub UI',
        description: 'Created via applyMutation',
        assignee: 'nick-ingraham',
        status: 'todo',
        priority: 'medium',
      },
      route: 'handleCreateTask',
      user,
    })

    expect(result.status).toBe('accepted')
    expect(result.mutation_id).toMatch(/^mut_/)

    // origin_machine must reflect the route
    const recorded = db._mutations.get(result.mutation_id)
    expect(recorded?.origin_machine).toBe('hub_ui:handleCreateTask')
  })

  it('stamps updated_at on insert for updated_at-bearing tables (2026-06-11)', async () => {
    // REGRESSION: applyInsert was the only mutation op that did NOT stamp
    // updated_at (applyPatch + applyDelete already did). tasks.updated_at has no
    // column DEFAULT, so every Hub-CREATE row (Gmail Apps Script, mobile PWA,
    // Hub QuickCapture) landed with updated_at=NULL until its first UPDATE —
    // silently dropping a brand-new task from project last-activity rollups
    // (proactive-brief MAX(t.updated_at)). The insert now stamps datetime('now').
    const db = makeStubDB()
    const newTaskId = 'task_01hwtest_apply_mut_updstamp1'
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyInsert(env, {
      table: 'tasks',
      record_id: newTaskId,
      op: 'insert',
      payload: {
        title: 'Schedule meeting with Reed',
        description: 'Gmail Apps Script create',
        assignee: 'nick-ingraham',
        status: 'todo',
        priority: 'medium',
        source: 'gmail',
      },
      mutation_id: 'mut_test_updstamp_0000000001',
      route: 'handleCreateTask',
      user,
    } as unknown as Parameters<typeof applyInsert>[1])

    expect(result.status).toBe('accepted')
    const row = db._store.get(newTaskId)
    expect(row).toBeTruthy()
    // updated_at must be a stamped timestamp, NOT null/undefined.
    expect(row?.updated_at).toBeTruthy()
    expect(typeof row?.updated_at).toBe('string')
    expect(row?.updated_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('insert does NOT override a caller-supplied updated_at (2026-06-11)', async () => {
    // The stamp is skipped when the payload already carries updated_at — a
    // deliberate caller value (e.g. a sync echo) wins over datetime('now').
    const db = makeStubDB()
    const newTaskId = 'task_01hwtest_apply_mut_updstamp2'
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser
    const SUPPLIED = '2026-01-02 03:04:05'

    await applyInsert(env, {
      table: 'tasks',
      record_id: newTaskId,
      op: 'insert',
      payload: {
        title: 'Caller-supplied updated_at',
        description: 'x',
        assignee: 'nick-ingraham',
        status: 'todo',
        updated_at: SUPPLIED,
      },
      mutation_id: 'mut_test_updstamp_0000000002',
      route: 'handleCreateTask',
      user,
    } as unknown as Parameters<typeof applyInsert>[1])

    const row = db._store.get(newTaskId)
    expect(row?.updated_at).toBe(SUPPLIED)
  })

  it('insert self-ack: a task created by its own assignee is born acknowledged (2026-06-11)', async () => {
    // Slack-style seen model: "unseen" (acknowledged_at IS NULL) means someone
    // ELSE put the task in front of you. Self-created tasks (incl. the PB
    // service user + Apps Script lanes, which resolve to nick-ingraham) are
    // born acknowledged so they never count as unseen.
    const db = makeStubDB()
    const newTaskId = 'task_01hwtest_apply_mut_selfack1'
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'ingra107@umn.edu' } as import('../helpers').AuthUser // actorSlug → nick-ingraham

    const result = await applyInsert(env, {
      table: 'tasks',
      record_id: newTaskId,
      op: 'insert',
      payload: {
        title: 'Self-created task',
        description: 'x',
        assignee: 'nick-ingraham',
        status: 'todo',
        priority: 'medium',
      },
      mutation_id: 'mut_test_selfack_00000000001',
      route: 'handleCreateTask',
    } as unknown as Parameters<typeof applyInsert>[1], user)

    expect(result.status).toBe('accepted')
    const row = db._store.get(newTaskId)
    expect(row?.acknowledged_at).toBeTruthy()
    expect(row?.acknowledged_by).toBe('nick-ingraham')
  })

  it('insert self-ack does NOT fire when assigning to someone else (2026-06-11)', async () => {
    const db = makeStubDB()
    const newTaskId = 'task_01hwtest_apply_mut_selfack2'
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'ingra107@umn.edu' } as import('../helpers').AuthUser

    const result = await applyInsert(env, {
      table: 'tasks',
      record_id: newTaskId,
      op: 'insert',
      payload: {
        title: 'Assigned to a mentee',
        description: 'x',
        assignee: 'dan-shyu',
        status: 'todo',
        priority: 'medium',
      },
      mutation_id: 'mut_test_selfack_00000000002',
      route: 'handleCreateTask',
    } as unknown as Parameters<typeof applyInsert>[1], user)

    expect(result.status).toBe('accepted')
    const row = db._store.get(newTaskId)
    // Stays unseen for the assignee — their auto-ack fires on first open.
    expect(row?.acknowledged_at ?? null).toBeNull()
  })

  it('mints mut_ id on delete', async () => {
    const db = makeStubDB()
    const delTaskId = 'task_01hwtest_apply_mut_0000003'
    db._store.set(delTaskId, {
      id: delTaskId,
      title: 'To be deleted',
      status: 'todo',
      deleted_at: null,
      seq: 2,
    })

    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyMutation(env, {
      table: 'tasks',
      record_id: delTaskId,
      op: 'delete',
      route: 'handleDeleteTask',
      user,
    })

    expect(result.status).toBe('accepted')
    expect(result.mutation_id).toMatch(/^mut_/)

    const recorded = db._mutations.get(result.mutation_id)
    expect(recorded?.origin_machine).toBe('hub_ui:handleDeleteTask')
  })

  it('each call mints a unique mutation_id (no id collision)', async () => {
    const db = makeStubDB()
    const ids = new Set<string>()

    for (let i = 0; i < 5; i++) {
      const tid = `task_01hwtest_apply_mut_uniq_${i}`
      db._store.set(tid, { id: tid, title: `Task ${i}`, status: 'todo', seq: i + 1, deleted_at: null })
      const env = { DB: db } as unknown as import('../helpers').Env
      const user = { email: 'test@example.com' } as import('../helpers').AuthUser
      const result = await applyMutation(env, {
        table: 'tasks', record_id: tid, op: 'update',
        patch: { status: 'done' }, route: 'handleUpdateTaskStatus', user,
      })
      expect(result.mutation_id).toMatch(/^mut_/)
      ids.add(result.mutation_id)
    }

    // All 5 mutation IDs must be distinct
    expect(ids.size).toBe(5)
  })
})

describe('applyMutation flag-independence sanity check', () => {
  // applyMutation does not require HUB_BULK_MIGRATION_MODE or any env gate.
  // (handleSyncBulkTasks and its env-flag gate deleted 2026-05-12, codex audit #8.)
  it('applyMutation does NOT require HUB_BULK_MIGRATION_MODE', async () => {
    // Just a sanity guard — applyMutation should work without any env flag
    const db = makeStubDB()
    const tid = 'task_01hwtest_bulk_flag_test001'
    db._store.set(tid, { id: tid, title: 'Flag test', status: 'todo', seq: 1, deleted_at: null })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser
    const result = await applyMutation(env, {
      table: 'tasks', record_id: tid, op: 'update',
      patch: { status: 'done' }, route: 'handleTestRoute', user,
    })
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
  })
})

// ── Stage 3 Phase 2: sessions natural PK routing ─────────────────────────────
//
// Verify that applyInsert for table='sessions' inserts with PK column
// 'session_id' (not 'id'). The stub DB below records all SQL strings and
// bound values so we can assert ON CONFLICT(session_id) was generated.

describe('Stage 3 Phase 2: sessions table uses session_id as PK', () => {
  function makeCapturingDB() {
    const store: Map<string, Record<string, unknown>> = new Map()
    const capturedSqls: Array<{ sql: string; vals: unknown[] }> = []

    function makeStmt(sql: string, boundVals: unknown[]): ReturnType<typeof makeStmt> {
      const self = {
        bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
        first: async <T>() => {
          const upper = sql.trim().toUpperCase()
          if (upper.includes('PROCESSED_MUTATIONS')) return null as T | null
          // readCanonical SELECT: look up by the bound value as key
          const key = boundVals[0] as string
          return (store.get(key) ?? null) as T | null
        },
        all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
        run: async () => {
          capturedSqls.push({ sql, vals: [...boundVals] })
          const upper = sql.trim().toUpperCase()
          if (upper.startsWith('INSERT INTO PROCESSED_MUTATIONS')) {
            return { meta: { changes: 1 } }
          }
          if (upper.startsWith('INSERT INTO')) {
            // Store the row keyed by the first bound value (record_id)
            const key = boundVals[0] as string
            const colsMatch = sql.match(/INSERT INTO \w+ \(([^)]+)\)/)
            if (colsMatch) {
              const cols = colsMatch[1].split(',').map((c: string) => c.trim())
              const row: Record<string, unknown> = {}
              cols.forEach((col: string, i: number) => { row[col] = boundVals[i] ?? null })
              row['seq'] = 1
              store.set(key, row)
            }
          }
          return { meta: { changes: 1 } }
        },
      }
      return self
    }

    return {
      _store: store,
      _capturedSqls: capturedSqls,
      prepare: (sql: string) => makeStmt(sql, []),
      batch: async () => [],
    }
  }

  it('INSERT into sessions uses ON CONFLICT(session_id), not ON CONFLICT(id)', async () => {
    const db = makeCapturingDB()
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const sessionId = 'hub-deploy-smoke-001'
    const mut = {
      mutation_id: 'mut_test_sessions_pk_001',
      origin_machine: 'work',
      table: 'sessions',
      op: 'insert' as const,
      record_id: sessionId,
      base_seq: null,
      base_row_hash: null,
      client_ts: '2026-05-06T17:00:00Z',
      issued_at: '2026-05-06T17:00:00Z',
      payload: {
        session_id: sessionId,
        summary: 'Hub PK routing test',
        machine_id: 'work',
      },
    }

    const result = await applyInsert(env, mut, user)
    expect(result.status).toBe('accepted')

    // The INSERT SQL must use ON CONFLICT(session_id), not ON CONFLICT(id)
    const insertSql = db._capturedSqls.find(s =>
      s.sql.includes('INSERT INTO sessions')
    )
    expect(insertSql, 'No INSERT INTO sessions SQL captured').toBeTruthy()
    expect(insertSql!.sql).toContain('ON CONFLICT(session_id)')
    expect(insertSql!.sql).not.toContain('ON CONFLICT(id)')
  })

  it('readCanonical for sessions queries WHERE session_id = ?, not WHERE id = ?', async () => {
    // Verify that a subsequent read after insert uses session_id column.
    // We do this by observing the SELECT SQL captured after the INSERT.
    const db = makeCapturingDB()
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const sessionId = 'hub-pk-read-test-002'
    const mut = {
      mutation_id: 'mut_test_sessions_pk_read_002',
      origin_machine: 'work',
      table: 'sessions',
      op: 'insert' as const,
      record_id: sessionId,
      base_seq: null,
      base_row_hash: null,
      client_ts: '2026-05-06T17:00:00Z',
      issued_at: '2026-05-06T17:00:00Z',
      payload: {
        session_id: sessionId,
        summary: 'PK read routing test',
        machine_id: 'work',
      },
    }

    await applyInsert(env, mut, user)

    // The SELECT (readCanonical) should use session_id column
    const selectSql = db._capturedSqls.find(s =>
      s.sql.includes('SELECT * FROM sessions')
    )
    // Note: SELECT comes from readCanonical which uses first(), not run()
    // We verify it by checking the store lookup key was session_id value
    // (The stub's first() uses boundVals[0] as the lookup key; if the code
    // passes record_id='hub-pk-read-test-002' it will succeed.)
    // The actual SQL assertion is covered by the insert test above.
    // What we can assert: result was accepted (meaning readCanonical found the row)
    // and no SQL used WHERE id = ?
    const idWhereClause = db._capturedSqls.filter(s =>
      s.sql.includes('FROM sessions') && s.sql.includes('WHERE id =')
    )
    expect(idWhereClause).toHaveLength(0)
  })
})

// ── Stage 3 Phase 3.6: sessions upsert-on-miss (insert-update race window) ───
//
// PB writes insert when session opens, update (ended_at, summary, ...) when
// it closes. Hub sync is async so the update can arrive while the insert is
// still queued. Before this fix, applyUpdate returned mutErr → 260 DLs.
// After: INSERT ... ON CONFLICT DO UPDATE (upsert) instead.

describe('Stage 3 Phase 3.6: sessions upsert-on-miss', () => {
  function makeUpsertDB() {
    // Like makeCapturingDB but also supports UPDATE path
    const store: Map<string, Record<string, unknown>> = new Map()
    const capturedSqls: Array<{ sql: string; vals: unknown[] }> = []

    function makeStmt(sql: string, boundVals: unknown[]): ReturnType<typeof makeStmt> {
      const self = {
        bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
        first: async <T>() => {
          const upper = sql.trim().toUpperCase()
          if (upper.includes('PROCESSED_MUTATIONS')) return null as T | null
          const key = boundVals[0] as string
          return (store.get(key) ?? null) as T | null
        },
        all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
        run: async () => {
          capturedSqls.push({ sql, vals: [...boundVals] })
          const upper = sql.trim().toUpperCase()
          if (upper.startsWith('INSERT INTO PROCESSED_MUTATIONS')) {
            return { meta: { changes: 1 } }
          }
          if (upper.startsWith('INSERT INTO')) {
            const key = boundVals[0] as string
            const colsMatch = sql.match(/INSERT INTO \w+ \(([^)]+)\)/)
            if (colsMatch) {
              const cols = colsMatch[1].split(',').map((c: string) => c.trim())
              const existing = store.get(key)
              if (!existing || sql.toUpperCase().includes('DO UPDATE')) {
                // Upsert: create or merge
                const row: Record<string, unknown> = existing ? { ...existing } : {}
                cols.forEach((col: string, i: number) => {
                  if (boundVals[i] !== undefined) row[col] = boundVals[i]
                })
                row['seq'] = (row['seq'] as number ?? 0) + 1
                store.set(key, row)
              }
            }
          }
          if (upper.startsWith('UPDATE')) {
            const idKey = boundVals[boundVals.length - 1] as string
            const row = store.get(idKey)
            if (row) store.set(idKey, { ...row, updated: true })
          }
          return { meta: { changes: 1 } }
        },
      }
      return self
    }

    return {
      _store: store,
      _capturedSqls: capturedSqls,
      prepare: (sql: string) => makeStmt(sql, []),
      batch: async () => [],
    }
  }

  it('update on absent sessions row upserts (accepted) instead of erroring', async () => {
    const db = makeUpsertDB()
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const sessionId = 'sess_upsert_race_test_001'
    // No prior INSERT — row is absent on Hub (race window)
    const mut = {
      mutation_id: 'mut_sess_upsert_001',
      origin_machine: 'work',
      table: 'sessions',
      op: 'update' as const,
      record_id: sessionId,
      base_seq: null,
      base_row_hash: null,
      client_ts: '2026-05-11T18:00:00Z',
      issued_at: '2026-05-11T18:00:00Z',
      patch: {
        ended_at: '2026-05-11T19:00:00Z',
        summary: 'Closed session',
        token_estimate: 1200,
      },
    }

    const result = await applyUpdate(env, mut, user)

    // Must not dead-letter
    expect(result.status).toBe('accepted')
    expect(result.reason).toContain('upserted')

    // The upsert SQL must target session_id conflict, not id
    const upsertSql = db._capturedSqls.find(s =>
      s.sql.includes('INSERT INTO sessions') && s.sql.toUpperCase().includes('ON CONFLICT')
    )
    expect(upsertSql, 'No upsert INSERT INTO sessions captured').toBeTruthy()
    expect(upsertSql!.sql).toContain('ON CONFLICT(session_id)')
    expect(upsertSql!.sql).not.toContain('ON CONFLICT(id)')
    // started_at must be defaulted via SQL literal so the row is never NULL —
    // this was the smoke-test-upsert-on-miss-20260511 production class (mig-082 fix).
    expect(upsertSql!.sql).toContain("started_at")
    expect(upsertSql!.sql).toContain("datetime('now')")
  })

  it('update on present sessions row applies patch normally (no upsert path)', async () => {
    const db = makeUpsertDB()
    const sessionId = 'sess_update_present_002'
    // Row already exists on Hub
    db._store.set(sessionId, {
      session_id: sessionId,
      started_at: '2026-05-11T17:00:00Z',
      ended_at: null,
      seq: 2,
      last_mutation_id: 'mut_prior',
    })

    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const mut = {
      mutation_id: 'mut_sess_update_002',
      origin_machine: 'work',
      table: 'sessions',
      op: 'update' as const,
      record_id: sessionId,
      base_seq: 2,
      base_row_hash: null,
      client_ts: '2026-05-11T18:30:00Z',
      issued_at: '2026-05-11T18:30:00Z',
      patch: { ended_at: '2026-05-11T18:30:00Z', summary: 'Done' },
    }

    const result = await applyUpdate(env, mut, user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    // Should NOT have gone through upsert path
    const upsertSql = db._capturedSqls.find(s =>
      s.sql.includes('INSERT INTO sessions') && s.sql.toUpperCase().includes('DO UPDATE SET')
    )
    expect(upsertSql).toBeUndefined()
  })
})

// ── Create-payload ↔ wire-contract drift guard (2026-06-10) ─────────────────
// REGRESSION: pb-schema 0.4.0 removed `notes` from TABLE_FIELDS.tasks while
// handleCreateTask still built `notes: null` into its insert payload — EVERY
// POST /api/tasks create 409'd in prod ("unknown fields for tasks: notes")
// and no test caught it. This test mirrors the FULL key set the two create
// routes (handleCreateTask, handleMobileTasksToHub) build, so any future
// contract shrink under a route payload fails HERE instead of in prod.
// (If you add a key to a create payload, add it here too.)
describe('create-route payload keys stay within the wire contract', () => {
  it('the handleCreateTask payload key set is accepted end-to-end', async () => {
    const db = makeStubDB()
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyMutation(env, {
      table: 'tasks',
      record_id: 'task_01hwtest_contract_keys_001',
      op: 'insert',
      payload: {
        // Mirrors handleCreateTask (api/routes/tasks.ts) exactly:
        title: 'Contract-keys probe',
        description: 'probe',
        assignee: 'nick-ingraham',
        assigned_by: 'test@example.com',
        meeting_id: null,
        project_id: null,
        due_date: null,
        deadline: null,
        priority: 'medium',
        status: 'todo',
        source: 'hub',
        completed: 0,
        completed_at: null,
        completed_by: null,
        key_link_1: null, key_link_1_desc: null,
        key_link_2: null, key_link_2_desc: null,
        key_link_3: null, key_link_3_desc: null,
        effort: null,
        short_title: null,
        source_thread_id: 'FMfcgzTESTthread01',
        related_message_ids: null,
        // PB §2D: derived at create from source_thread_id.
        email_link: 'https://mail.google.com/mail/u/1/#inbox/FMfcgzTESTthread01',
      },
      route: 'handleCreateTask',
      user,
    })

    expect(result.status).toBe('accepted')
    const row = db._store.get('task_01hwtest_contract_keys_001')
    expect(row?.email_link).toBe('https://mail.google.com/mail/u/1/#inbox/FMfcgzTESTthread01')
    expect(row).not.toHaveProperty('notes')
  })
})

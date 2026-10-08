// Phase 3.1 tests (2026-05-04):
//   - applyMutation() envelope factory: mints mut_ id, sets origin_machine,
//     records in processed_mutations, stamps last_mutation_id on the row.
// (handleSyncBulkTasks deleted 2026-05-12; HUB_BULK_MIGRATION_MODE gate removed.)
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// This file used to run on three hand-written stubs that parsed SET clauses,
// stamped seq=1 on every insert and treated the processed_mutations INSERT as
// a Map.set with no NOT NULL column, so a receipt written with a NULL
// original_response_json passed here. Every case now reads the STORED row and,
// where the case goes through applyMutation (processOne), the stored receipt.
// The completion-triad trigger (schema-v98) and the v53 seq triggers are live.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { applyMutation, applyInsert, applyUpdate } from './mutations'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

type Env = import('../helpers').Env
type AuthUser = import('../helpers').AuthUser

let db: InstanceType<typeof Database>
let env: Env
/** Every statement the engine ran, in order (observation only). */
let execLog: Array<{ sql: string; vals: unknown[] }>
beforeEach(() => {
  db = prodSchemaDb()
  execLog = []
  env = { DB: d1Adapter(db, { onExec: (sql, vals) => execLog.push({ sql, vals: [...vals] }) }) } as unknown as Env
})

const rowOf = (table: string, id: string, pk = 'id') =>
  db.prepare(`SELECT * FROM ${table} WHERE ${pk} = ?`).get(id) as Record<string, unknown> | undefined

/** A receipt that is really there, with a parseable (non-NULL) response body. */
function expectReceipt(mutationId: string, outcome: string | RegExp, table: string, recordId: string) {
  const r = receiptOf(db, mutationId)
  expect(r, `no processed_mutations receipt for ${mutationId}`).toBeTruthy()
  if (typeof outcome === 'string') expect(r!.outcome).toBe(outcome)
  else expect(r!.outcome).toMatch(outcome)
  expect(r!.table_name).toBe(table)
  expect(r!.record_id).toBe(recordId)
  expect(typeof r!.original_response_json).toBe('string')
  expect(() => JSON.parse(r!.original_response_json)).not.toThrow()
  return db.prepare('SELECT * FROM processed_mutations WHERE mutation_id = ?').get(mutationId) as Record<string, unknown>
}

describe('applyMutation envelope factory', () => {
  const taskId = 'task_01hwtest_apply_mut_0000001'

  it('mints mut_ id and records in processed_mutations on update', async () => {
    const seeded = insertRow(db, 'tasks', {
      id: taskId, title: 'Test task', status: 'todo', completed: 0, assignee: 'nick-ingraham', priority: 'medium',
    })
    const user = { email: 'test@example.com', slug: 'test' } as AuthUser

    // A full completion triad: prod's v98 trigger refuses status=done without
    // completed=1 AND completed_at (the old stub accepted the two-field patch).
    const result = await applyMutation(env, {
      table: 'tasks',
      record_id: taskId,
      op: 'update',
      patch: { status: 'done', completed: 1, completed_at: '2026-05-04 09:00:00' },
      route: 'handleUpdateTaskStatus',
      user,
    })

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expect(result.mutation_id).toMatch(/^mut_/)

    // Must be recorded in processed_mutations
    const recorded = expectReceipt(result.mutation_id, result.status, 'tasks', taskId)
    expect(recorded.origin_machine).toBe('hub_ui:handleUpdateTaskStatus')

    // The row write really landed and is stamped with this mutation.
    const row = rowOf('tasks', taskId)!
    expect(row.status).toBe('done')
    expect(row.completed).toBe(1)
    expect(row.last_mutation_id).toBe(result.mutation_id)
    expect(row.seq as number).toBeGreaterThan(seeded.seq as number)
  })

  it('a status-only `done` patch meets the prod completion-triad guard: no write, no accepted receipt', async () => {
    // Premise the old stub hid: it accepted {status:'done', completed:1} and
    // {status:'done'} alike. Prod (schema-v98) refuses a done row without
    // completed=1 + completed_at. processOne records the refusal as an error;
    // the row stays as it was.
    insertRow(db, 'tasks', { id: taskId, title: 'Test task', status: 'todo', completed: 0, assignee: 'nick-ingraham' })
    const user = { email: 'test@example.com', slug: 'test' } as AuthUser

    const result = await applyMutation(env, {
      table: 'tasks', record_id: taskId, op: 'update',
      patch: { status: 'done' }, route: 'handleUpdateTaskStatus', user,
    }).catch((e: Error) => ({ status: 'threw', mutation_id: '', reason: e.message }))

    expect(result.status).not.toMatch(/^(accepted|merged_clean)$/)
    expect(String(result.reason)).toMatch(/completion triad guard/)
    expect(rowOf('tasks', taskId)!.status).toBe('todo')
    const accepted = db.prepare(
      "SELECT COUNT(*) AS n FROM processed_mutations WHERE record_id = ? AND outcome IN ('accepted','merged_clean')",
    ).get(taskId) as { n: number }
    expect(accepted.n).toBe(0)
  })

  it('mints mut_ id on insert', async () => {
    const newTaskId = 'task_01hwtest_apply_mut_0000002'
    const user = { email: 'test@example.com', slug: 'test' } as AuthUser

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
    const recorded = expectReceipt(result.mutation_id, 'accepted', 'tasks', newTaskId)
    expect(recorded.origin_machine).toBe('hub_ui:handleCreateTask')

    const row = rowOf('tasks', newTaskId)!
    expect(row.title).toBe('New task from Hub UI')
    expect(row.last_mutation_id).toBe(result.mutation_id)
    expect(row.seq as number).toBeGreaterThan(0)
  })

  it('stamps updated_at on insert for updated_at-bearing tables (2026-06-11)', async () => {
    // REGRESSION: applyInsert was the only mutation op that did NOT stamp
    // updated_at (applyPatch + applyDelete already did). tasks.updated_at has no
    // column DEFAULT, so every Hub-CREATE row (Gmail Apps Script, mobile PWA,
    // Hub QuickCapture) landed with updated_at=NULL until its first UPDATE —
    // silently dropping a brand-new task from project last-activity rollups
    // (proactive-brief MAX(t.updated_at)). The insert now stamps datetime('now').
    const newTaskId = 'task_01hwtest_apply_mut_updstamp1'
    const user = { email: 'test@example.com', slug: 'test' } as AuthUser

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
    const row = rowOf('tasks', newTaskId)
    expect(row).toBeTruthy()
    // updated_at must be a stamped timestamp, NOT null/undefined.
    expect(row?.updated_at).toBeTruthy()
    expect(typeof row?.updated_at).toBe('string')
    expect(row?.updated_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    // The stamp is the engine's datetime('now'), not a column default: the
    // insert SQL itself must carry it (tasks.updated_at has no DEFAULT).
    const ins = execLog.find((s) => /^\s*INSERT INTO tasks\b/i.test(s.sql))
    expect(ins?.sql).toMatch(/updated_at/)
  })

  it('insert does NOT override a caller-supplied updated_at (2026-06-11)', async () => {
    // The stamp is skipped when the payload already carries updated_at — a
    // deliberate caller value (e.g. a sync echo) wins over datetime('now').
    const newTaskId = 'task_01hwtest_apply_mut_updstamp2'
    const user = { email: 'test@example.com', slug: 'test' } as AuthUser
    const SUPPLIED = '2026-01-02 03:04:05'

    const result = await applyInsert(env, {
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

    expect(result.status).toBe('accepted')
    expect(rowOf('tasks', newTaskId)?.updated_at).toBe(SUPPLIED)
  })

  it('insert self-ack: a task created by its own assignee is born acknowledged (2026-06-11)', async () => {
    // Slack-style seen model: "unseen" (acknowledged_at IS NULL) means someone
    // ELSE put the task in front of you. Self-created tasks (incl. the PB
    // service user + Apps Script lanes, which resolve to nick-ingraham) are
    // born acknowledged so they never count as unseen.
    const newTaskId = 'task_01hwtest_apply_mut_selfack1'
    const user = { email: 'ingra107@umn.edu', slug: 'nick-ingraham' } as AuthUser // actorSlug → nick-ingraham

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
    const row = rowOf('tasks', newTaskId)
    expect(row?.acknowledged_at).toBeTruthy()
    expect(row?.acknowledged_by).toBe('nick-ingraham')
  })

  it('insert self-ack does NOT fire when assigning to someone else (2026-06-11)', async () => {
    const newTaskId = 'task_01hwtest_apply_mut_selfack2'
    const user = { email: 'ingra107@umn.edu', slug: 'nick-ingraham' } as AuthUser

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
    const row = rowOf('tasks', newTaskId)
    expect(row).toBeTruthy()
    // Stays unseen for the assignee — their auto-ack fires on first open.
    expect(row?.assignee).toBe('dan-shyu')
    expect(row?.acknowledged_at).toBeNull()
    expect(row?.acknowledged_by).toBeNull()
  })

  it('reassignment clears acknowledged_at — the task is NEW for its new owner (2026-06-11)', async () => {
    const tid = 'task_01hwtest_apply_mut_reassign'
    insertRow(db, 'tasks', {
      id: tid, title: 'Handed off', status: 'todo',
      assignee: 'nick-ingraham', acknowledged_at: '2026-06-10 12:00:00', acknowledged_by: 'nick-ingraham',
    })
    const user = { email: 'ingra107@umn.edu', slug: 'nick-ingraham' } as AuthUser

    const result = await applyMutation(env, {
      table: 'tasks', record_id: tid, op: 'update',
      patch: { assignee: 'dan-shyu' }, route: 'handleUpdateTask', user,
    })

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    const row = rowOf('tasks', tid)!
    expect(row.assignee).toBe('dan-shyu')
    expect(row.acknowledged_at).toBeNull()
    expect(row.acknowledged_by).toBeNull()
    expectReceipt(result.mutation_id, result.status, 'tasks', tid)
  })

  it('a non-assignee patch leaves acknowledged_at untouched (2026-06-11)', async () => {
    const tid = 'task_01hwtest_apply_mut_keepack1'
    insertRow(db, 'tasks', {
      id: tid, title: 'Same owner', status: 'todo',
      assignee: 'nick-ingraham', acknowledged_at: '2026-06-10 12:00:00', acknowledged_by: 'nick-ingraham',
    })
    const user = { email: 'ingra107@umn.edu', slug: 'nick-ingraham' } as AuthUser

    const result = await applyMutation(env, {
      table: 'tasks', record_id: tid, op: 'update',
      patch: { priority: 'high' }, route: 'handleUpdateTask', user,
    })

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    const row = rowOf('tasks', tid)!
    // The write landed (so "untouched" is not a no-op passing vacuously).
    expect(row.priority).toBe('high')
    expect(row.acknowledged_at).toBe('2026-06-10 12:00:00')
    expect(row.acknowledged_by).toBe('nick-ingraham')
    expectReceipt(result.mutation_id, result.status, 'tasks', tid)
  })

  it('mints mut_ id on delete', async () => {
    const delTaskId = 'task_01hwtest_apply_mut_0000003'
    insertRow(db, 'tasks', { id: delTaskId, title: 'To be deleted', status: 'todo', assignee: 'nick-ingraham' })
    const user = { email: 'test@example.com', slug: 'test' } as AuthUser

    const result = await applyMutation(env, {
      table: 'tasks',
      record_id: delTaskId,
      op: 'delete',
      route: 'handleDeleteTask',
      user,
    })

    expect(result.status).toBe('accepted')
    expect(result.mutation_id).toMatch(/^mut_/)

    const recorded = expectReceipt(result.mutation_id, 'accepted', 'tasks', delTaskId)
    expect(recorded.origin_machine).toBe('hub_ui:handleDeleteTask')
    // Soft delete: the row survives with deleted_at stamped.
    const row = rowOf('tasks', delTaskId)!
    expect(row.deleted_at).toBeTruthy()
  })

  it('each call mints a unique mutation_id (no id collision)', async () => {
    const ids = new Set<string>()
    const user = { email: 'test@example.com', slug: 'test' } as AuthUser

    for (let i = 0; i < 5; i++) {
      const tid = `task_01hwtest_apply_mut_uniq_${i}`
      insertRow(db, 'tasks', { id: tid, title: `Task ${i}`, status: 'todo', assignee: 'nick-ingraham' })
      // in_progress, not done: a status-only `done` patch is refused by prod's
      // completion-triad trigger (pinned above); this case is about ids.
      const result = await applyMutation(env, {
        table: 'tasks', record_id: tid, op: 'update',
        patch: { status: 'in_progress' }, route: 'handleUpdateTaskStatus', user,
      })
      expect(result.mutation_id).toMatch(/^mut_/)
      expectReceipt(result.mutation_id, /^(accepted|merged_clean)$/, 'tasks', tid)
      ids.add(result.mutation_id)
    }

    // All 5 mutation IDs must be distinct, and each owns its own receipt row.
    expect(ids.size).toBe(5)
    const n = db.prepare("SELECT COUNT(*) AS n FROM processed_mutations WHERE record_id LIKE 'task_01hwtest_apply_mut_uniq_%'").get() as { n: number }
    expect(n.n).toBe(5)
  })
})

describe('applyMutation flag-independence sanity check', () => {
  // applyMutation does not require HUB_BULK_MIGRATION_MODE or any env gate.
  // (handleSyncBulkTasks and its env-flag gate deleted 2026-05-12, codex audit #8.)
  it('applyMutation does NOT require HUB_BULK_MIGRATION_MODE', async () => {
    // Just a sanity guard — applyMutation should work without any env flag
    const tid = 'task_01hwtest_bulk_flag_test001'
    insertRow(db, 'tasks', { id: tid, title: 'Flag test', status: 'todo', assignee: 'nick-ingraham' })
    const user = { email: 'test@example.com', slug: 'test' } as AuthUser
    const result = await applyMutation(env, {
      table: 'tasks', record_id: tid, op: 'update',
      patch: { status: 'done', completed: 1, completed_at: '2026-05-12 10:00:00' }, route: 'handleTestRoute', user,
    })
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expect(rowOf('tasks', tid)!.status).toBe('done')
    expectReceipt(result.mutation_id, result.status, 'tasks', tid)
  })
})

// ── Stage 3 Phase 2: sessions natural PK routing ─────────────────────────────
//
// Verify that applyInsert for table='sessions' inserts with PK column
// 'session_id' (not 'id'). The real sessions table has NO `id` column, so a
// statement keyed on `id` is refused by the engine; the SQL is also read off
// d1Adapter's onExec log.

describe('Stage 3 Phase 2: sessions table uses session_id as PK', () => {
  const user = { email: 'test@example.com', slug: 'test' } as AuthUser

  it('INSERT into sessions uses ON CONFLICT(session_id), not ON CONFLICT(id)', async () => {
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
    const insertSql = execLog.find(s => s.sql.includes('INSERT INTO sessions'))
    expect(insertSql, 'No INSERT INTO sessions SQL captured').toBeTruthy()
    expect(insertSql!.sql).toContain('ON CONFLICT(session_id)')
    expect(insertSql!.sql).not.toContain('ON CONFLICT(id)')

    // And the row is really stored under its natural key.
    const row = rowOf('sessions', sessionId, 'session_id')!
    expect(row.summary).toBe('Hub PK routing test')
    expect(row.machine_id).toBe('work')
    expect(row.last_mutation_id).toBe('mut_test_sessions_pk_001')
  })

  it('readCanonical for sessions queries WHERE session_id = ?, not WHERE id = ?', async () => {
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

    const result = await applyInsert(env, mut, user)

    // readCanonical's SELECT is now actually executed (the old capturing stub
    // only logged run(), so this assertion could never see a SELECT at all).
    const selects = execLog.filter(s => /SELECT[\s\S]*FROM sessions/i.test(s.sql))
    expect(selects.length).toBeGreaterThan(0)
    expect(selects.some(s => /WHERE\s+session_id\s*=\s*\?/i.test(s.sql))).toBe(true)
    const idWhereClause = execLog.filter(s =>
      s.sql.includes('FROM sessions') && /WHERE\s+id\s*=/i.test(s.sql)
    )
    expect(idWhereClause).toHaveLength(0)
    // The canonical read found the stored row.
    expect(result.status).toBe('accepted')
    expect(result.canonical_payload?.session_id).toBe(sessionId)
  })
})

// ── Stage 3 Phase 3.6: sessions upsert-on-miss (insert-update race window) ───
//
// PB writes insert when session opens, update (ended_at, summary, ...) when
// it closes. Hub sync is async so the update can arrive while the insert is
// still queued. Before this fix, applyUpdate returned mutErr → 260 DLs.
// After: INSERT ... ON CONFLICT DO UPDATE (upsert) instead.

describe('Stage 3 Phase 3.6: sessions upsert-on-miss', () => {
  const user = { email: 'test@example.com', slug: 'test' } as AuthUser

  it('update on absent sessions row upserts (accepted) instead of erroring', async () => {
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
    const upsertSql = execLog.find(s =>
      s.sql.includes('INSERT INTO sessions') && s.sql.toUpperCase().includes('ON CONFLICT')
    )
    expect(upsertSql, 'No upsert INSERT INTO sessions captured').toBeTruthy()
    expect(upsertSql!.sql).toContain('ON CONFLICT(session_id)')
    expect(upsertSql!.sql).not.toContain('ON CONFLICT(id)')
    // started_at must be defaulted via SQL literal so the row is never NULL —
    // this was the smoke-test-upsert-on-miss-20260511 production class (mig-082 fix).
    expect(upsertSql!.sql).toContain("started_at")
    expect(upsertSql!.sql).toContain("datetime('now')")

    // The stored row: patch applied, started_at really non-NULL.
    const row = rowOf('sessions', sessionId, 'session_id')!
    expect(row.ended_at).toBe('2026-05-11T19:00:00Z')
    expect(row.summary).toBe('Closed session')
    expect(row.token_estimate).toBe(1200)
    expect(row.started_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(row.last_mutation_id).toBe('mut_sess_upsert_001')
  })

  it('update on present sessions row applies patch normally (no upsert path)', async () => {
    const sessionId = 'sess_update_present_002'
    // Row already exists on Hub
    const seeded = insertRow(db, 'sessions', {
      session_id: sessionId,
      started_at: '2026-05-11T17:00:00Z',
      ended_at: null,
      last_mutation_id: 'mut_prior',
    })

    const mut = {
      mutation_id: 'mut_sess_update_002',
      origin_machine: 'work',
      table: 'sessions',
      op: 'update' as const,
      record_id: sessionId,
      base_seq: seeded.seq as number,
      base_row_hash: null,
      client_ts: '2026-05-11T18:30:00Z',
      issued_at: '2026-05-11T18:30:00Z',
      patch: { ended_at: '2026-05-11T18:30:00Z', summary: 'Done' },
    }

    const result = await applyUpdate(env, mut, user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    // Should NOT have gone through upsert path
    const upsertSql = execLog.find(s =>
      s.sql.includes('INSERT INTO sessions') && s.sql.toUpperCase().includes('DO UPDATE SET')
    )
    expect(upsertSql).toBeUndefined()

    const row = rowOf('sessions', sessionId, 'session_id')!
    expect(row.ended_at).toBe('2026-05-11T18:30:00Z')
    expect(row.summary).toBe('Done')
    expect(row.started_at).toBe('2026-05-11T17:00:00Z')
    expect(row.last_mutation_id).toBe('mut_sess_update_002')
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
    const user = { email: 'test@example.com', slug: 'test' } as AuthUser

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
    const row = rowOf('tasks', 'task_01hwtest_contract_keys_001')
    expect(row?.email_link).toBe('https://mail.google.com/mail/u/1/#inbox/FMfcgzTESTthread01')
    expect(row?.source_thread_id).toBe('FMfcgzTESTthread01')
    // The D1 tasks table still HAS a notes column; the contract is that the
    // create path never writes it (the insert SQL names no notes column).
    expect(row?.notes ?? null).toBeNull()
    const ins = execLog.find((s) => /^\s*INSERT INTO tasks\b/i.test(s.sql))
    expect(ins?.sql).not.toMatch(/\bnotes\b/)
    expectReceipt(result.mutation_id, 'accepted', 'tasks', 'task_01hwtest_contract_keys_001')
  })
})

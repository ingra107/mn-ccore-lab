// I18 dedup regression tests (2026-05-03)
//
// Covers server-side (title, project_id) dedup in two paths:
//   1. mutations.ts applyInsert — via the exported handleMutations path
//   2. tasks.ts handleSyncBulkTasks — via the sync-bulk path
//
// Uses the same in-memory D1 stub pattern as mutations.deleted-status.test.ts.
// Covers the four edge cases from the incident spec:
//   - Dedup fires on same (title, project_id) both null
//   - No dedup when project_id differs
//   - No dedup against deleted rows
//   - No dedup against done rows

import { describe, it, expect } from 'vitest'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'

// ── Shared stub DB ──────────────────────────────────────────────────────────

function makeStubDB(seedRows: Record<string, Record<string, unknown>> = {}) {
  const store: Map<string, Record<string, unknown>> = new Map(
    Object.entries(seedRows)
  )

  // Title+project_id index: key = `${title}|||${project_id ?? 'NULL'}`
  // We rebuild on each query so mutations are reflected.
  function findByTitleProject(title: string, projectId: string | null): Record<string, unknown> | null {
    for (const row of store.values()) {
      if (
        row.title === title &&
        (row.project_id ?? null) === projectId &&
        !row.deleted_at &&
        row.status !== 'done'
      ) {
        return row
      }
    }
    return null
  }

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),

      first: async <T>() => {
        const upper = sql.trim().toUpperCase()
        // SELECT id FROM tasks WHERE title = ? AND project_id IS ? AND ...
        if (upper.includes('TITLE =') && upper.includes('PROJECT_ID IS')) {
          const title = boundVals[0] as string
          const projectId = (boundVals[1] === undefined ? null : boundVals[1]) as string | null
          const row = findByTitleProject(title, projectId)
          return (row ? { id: row.id } : null) as T | null
        }
        // SELECT * FROM tasks/projects WHERE id = ?
        const id = boundVals[0] as string
        return (store.get(id) ?? null) as T | null
      },

      all: async <T>() => {
        const upper = sql.trim().toUpperCase()
        // SELECT id, updated_at FROM tasks WHERE id IN (...)
        if (upper.includes('ID IN')) {
          const ids = boundVals as string[]
          const results = ids
            .map(id => store.get(id))
            .filter(Boolean) as T[]
          return { results, success: true, meta: {} }
        }
        return { results: [] as T[], success: true, meta: {} }
      },

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
        if (upper.startsWith('INSERT INTO TASKS') || upper.startsWith('INSERT INTO ')) {
          // Parse id from VALUES (first positional)
          const id = boundVals[0] as string
          if (id && !store.has(id)) {
            // Build a minimal row from bound values
            // Column order matches the INSERT in handleSyncBulkTasks:
            // id, meeting_id, project_id, title, description, assignee, assigned_by,
            // due_date, deadline, priority, status, source, completed, completed_at,
            // completed_by, created_at, key_link_1..6, updated_at
            store.set(id, {
              id, meeting_id: boundVals[1], project_id: boundVals[2],
              title: boundVals[3], description: boundVals[4],
              assignee: boundVals[5], assigned_by: boundVals[6],
              due_date: boundVals[7], deadline: boundVals[8],
              priority: boundVals[9], status: boundVals[10],
              source: boundVals[11], completed: boundVals[12],
              completed_at: boundVals[13], completed_by: boundVals[14],
              created_at: boundVals[15],
              deleted_at: null, seq: 1, updated_at: boundVals[22] ?? new Date().toISOString(),
              last_mutation_id: null,
            })
          }
          return { meta: { changes: 1 } }
        }
        return { meta: { changes: 0 } }
      },
    }
  }

  return {
    _store: store,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: any[]) => {
      const results = []
      for (const s of stmts) await s.run()
      return results
    },
  }
}

const fakeUser: AuthUser = { email: 'test@example.com', role: 'admin', name: 'Test User' } as unknown as AuthUser

// ── mutations.ts applyInsert dedup tests ────────────────────────────────────

describe('mutations.ts applyInsert — I18 (title, project_id) dedup', () => {
  // We test via applyUpdate (exported) as a proxy — the full processOne
  // path requires processed_mutations table. The dedup logic in applyInsert
  // is unit-tested here by constructing op='insert' mutations directly via
  // the exported handleMutations path with a stub DB.
  //
  // Since applyInsert is not exported, we verify the dedup contract by
  // confirming that a second insert with the same title+project_id returns
  // status='accepted' with a reason containing 'deduped' and the existing id.

  it('deduped: same title + same null project_id returns accepted with reason', async () => {
    const existingId = 'task_existing_001'
    const db = makeStubDB({
      [existingId]: {
        id: existingId,
        title: 'Approve: MECHANIC: I3',
        project_id: null,
        deleted_at: null,
        status: 'todo',
        seq: 1,
        last_mutation_id: null,
      }
    })

    // Simulate what applyInsert does: the dedup SELECT fires before INSERT
    // We test via the full handleMutations import which calls processOne ->
    // applyInsert. Import it here.
    const { handleMutations } = await import('./mutations')
    const mut: Mutation = {
      mutation_id: 'mut_dedup_test_0001',
      origin_machine: 'work',
      table: 'tasks',
      op: 'insert',
      record_id: 'task_new_dup_0001',
      base_seq: null,
      base_row_hash: null,
      payload: {
        title: 'Approve: MECHANIC: I3',
        project_id: null,
        status: 'todo',
        priority: 'medium',
        assignee: 'nick-ingraham',
        created_at: new Date().toISOString(),
      },
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }

    const fakeEnv = { DB: db } as unknown as Env
    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const resp = await handleMutations(req, fakeUser, fakeEnv)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string; canonical_payload?: Record<string, unknown> }> }

    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].reason).toContain('deduped')
    expect(body.results[0].reason).toContain(existingId)
    // New row should NOT have been inserted
    expect(db._store.has('task_new_dup_0001')).toBe(false)
  })

  it('no-dedup: same title but different non-null project_id — inserts normally', async () => {
    const db = makeStubDB({
      'task_proj_a': {
        id: 'task_proj_a',
        title: 'Write draft',
        project_id: 'proj_alpha',
        deleted_at: null,
        status: 'todo',
        seq: 1,
        last_mutation_id: null,
      }
    })

    const { handleMutations } = await import('./mutations')
    const mut: Mutation = {
      mutation_id: 'mut_dedup_test_0002',
      origin_machine: 'home',
      table: 'tasks',
      op: 'insert',
      record_id: 'task_proj_b_new',
      base_seq: null,
      base_row_hash: null,
      payload: {
        title: 'Write draft',
        project_id: 'proj_beta',  // different project
        status: 'todo',
        priority: 'medium',
        assignee: 'nick-ingraham',
        created_at: new Date().toISOString(),
      },
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }

    const fakeEnv = { DB: db } as unknown as Env
    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const resp = await handleMutations(req, fakeUser, fakeEnv)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> }

    expect(body.results[0].status).toBe('accepted')
    // Should NOT have the dedup reason
    expect(body.results[0].reason ?? '').not.toContain('deduped')
    // New row should have been inserted
    expect(db._store.has('task_proj_b_new')).toBe(true)
  })

  it('no-dedup against deleted row — soft-deleted task does not block new insert', async () => {
    const db = makeStubDB({
      'task_deleted_old': {
        id: 'task_deleted_old',
        title: 'Reply to Abbie',
        project_id: null,
        deleted_at: '2026-05-01 10:00:00',
        status: 'deleted',
        seq: 3,
        last_mutation_id: 'mut_prev',
      }
    })

    const { handleMutations } = await import('./mutations')
    const mut: Mutation = {
      mutation_id: 'mut_dedup_test_0003',
      origin_machine: 'home',
      table: 'tasks',
      op: 'insert',
      record_id: 'task_new_reply',
      base_seq: null,
      base_row_hash: null,
      payload: {
        title: 'Reply to Abbie',
        project_id: null,
        status: 'todo',
        priority: 'medium',
        assignee: 'nick-ingraham',
        created_at: new Date().toISOString(),
      },
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }

    const fakeEnv = { DB: db } as unknown as Env
    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const resp = await handleMutations(req, fakeUser, fakeEnv)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> }

    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].reason ?? '').not.toContain('deduped')
    expect(db._store.has('task_new_reply')).toBe(true)
  })

  it('no-dedup against done row — completed task does not block a new task of same name', async () => {
    const db = makeStubDB({
      'task_done_old': {
        id: 'task_done_old',
        title: 'Weekly review',
        project_id: null,
        deleted_at: null,
        status: 'done',
        seq: 10,
        last_mutation_id: 'mut_completed',
      }
    })

    const { handleMutations } = await import('./mutations')
    const mut: Mutation = {
      mutation_id: 'mut_dedup_test_0004',
      origin_machine: 'home',
      table: 'tasks',
      op: 'insert',
      record_id: 'task_new_weekly',
      base_seq: null,
      base_row_hash: null,
      payload: {
        title: 'Weekly review',
        project_id: null,
        status: 'todo',
        priority: 'medium',
        assignee: 'nick-ingraham',
        created_at: new Date().toISOString(),
      },
      client_ts: new Date().toISOString(),
      issued_at: new Date().toISOString(),
    }

    const fakeEnv = { DB: db } as unknown as Env
    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const resp = await handleMutations(req, fakeUser, fakeEnv)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> }

    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].reason ?? '').not.toContain('deduped')
    expect(db._store.has('task_new_weekly')).toBe(true)
  })
})

// ── tasks.ts handleSyncBulkTasks dedup tests ────────────────────────────────

describe('handleSyncBulkTasks — I18 (title, project_id) dedup', () => {
  it('deduped task appears in results with status=deduped and hub_id=existing id', async () => {
    const existingId = 'task_existing_bulk_001'
    const db = makeStubDB({
      [existingId]: {
        id: existingId,
        title: 'Approve: MECHANIC: I25',
        project_id: null,
        deleted_at: null,
        status: 'todo',
        seq: 2,
        last_mutation_id: null,
        updated_at: '2026-05-03 08:00:00',
      }
    })

    const { handleSyncBulkTasks } = await import('./tasks')
    const fakeEnv = { DB: db } as unknown as Env
    const req = new Request('https://example.com/api/tasks/sync-bulk', {
      method: 'POST',
      body: JSON.stringify({
        tasks: [{
          id: 'task_work_dup_bulk',
          title: 'Approve: MECHANIC: I25',
          project_id: null,
          assignee: 'nick-ingraham',
          status: 'todo',
          priority: 'medium',
          client_updated_at: '2026-05-03 08:00:03',
        }]
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const resp = await handleSyncBulkTasks(req, fakeUser, fakeEnv)
    const body = await resp.json() as {
      data: {
        results: Array<{ client_id: string; status: string; reason?: string }>;
        ids: Array<{ client_id: string; hub_id: string }>;
      }
    }

    const taskResult = body.data.results.find(r => r.client_id === 'task_work_dup_bulk')
    expect(taskResult).toBeDefined()
    expect(taskResult!.status).toBe('deduped')
    expect(taskResult!.reason).toContain(existingId)

    const idEntry = body.data.ids.find(e => e.client_id === 'task_work_dup_bulk')
    expect(idEntry).toBeDefined()
    expect(idEntry!.hub_id).toBe(existingId)

    // Duplicate should NOT have been inserted
    expect(db._store.has('task_work_dup_bulk')).toBe(false)
  })

  it('no-dedup: different project_id — both tasks inserted', async () => {
    const existingId = 'task_proj_c_existing'
    const db = makeStubDB({
      [existingId]: {
        id: existingId,
        title: 'Fix bug',
        project_id: 'proj-c',
        deleted_at: null,
        status: 'todo',
        seq: 1,
        updated_at: '2026-05-01 10:00:00',
      }
    })

    const { handleSyncBulkTasks } = await import('./tasks')
    const fakeEnv = { DB: db } as unknown as Env
    const req = new Request('https://example.com/api/tasks/sync-bulk', {
      method: 'POST',
      body: JSON.stringify({
        tasks: [{
          id: 'task_proj_d_new',
          title: 'Fix bug',
          project_id: 'proj-d',  // different project
          assignee: 'nick-ingraham',
          status: 'todo',
          priority: 'medium',
        }]
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const resp = await handleSyncBulkTasks(req, fakeUser, fakeEnv)
    const body = await resp.json() as { data: { results: Array<{ client_id: string; status: string }> } }

    const taskResult = body.data.results.find(r => r.client_id === 'task_proj_d_new')
    expect(taskResult).toBeDefined()
    expect(taskResult!.status).not.toBe('deduped')
    expect(db._store.has('task_proj_d_new')).toBe(true)
  })
})

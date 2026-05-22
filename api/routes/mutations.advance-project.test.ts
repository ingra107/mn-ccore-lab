// Tests for advanceProjectMovement side-effect in mutations.ts
//
// Verifies the Hub-side counterpart to brain.db::_advance_project_movement
// (PB commit 83946bc2): task completion mutations via applyUpdate must advance
// the parent project's last_meaningful_movement and clear stale_active_since
// on D1.
//
// Requirements verified here:
//   R1 — fires only on genuine transition TO done (not idempotent re-stamps)
//   R2 — MAX semantics: never moves last_meaningful_movement backward
//   R3 — fires for both PB-origin (origin_machine='home') and Hub-UI mutations
//   R4 — no project_id → no D1 update (orphaned tasks are safe)
//   R5 — non-done status transitions are left alone

import { describe, it, expect } from 'vitest'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'

// ── Stub DB ──────────────────────────────────────────────────────────────────
// Tracks the task row AND the parent project row so we can assert project
// updates. Records every UPDATE sql + vals in updateCalls for inspection.

function makeStubDB(opts: {
  task: Record<string, unknown>;
  project?: Record<string, unknown>;
}) {
  const taskStore = new Map<string, Record<string, unknown>>()
  const projectStore = new Map<string, Record<string, unknown>>()
  const mutations = new Map<string, Record<string, unknown>>()
  const updateCalls: Array<{ sql: string; vals: unknown[] }> = []

  if (opts.task) taskStore.set(opts.task.id as string, { ...opts.task })
  if (opts.project) projectStore.set(opts.project.id as string, { ...opts.project })

  function makeStmt(sql: string, boundVals: unknown[]): ReturnType<typeof makeStmt> {
    const self = {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T>() => {
        const upper = sql.trim().toUpperCase()
        if (upper.includes('PROCESSED_MUTATIONS')) {
          const id = boundVals[0] as string
          return (mutations.get(id) ?? null) as T | null
        }
        // SELECT * FROM tasks WHERE id = ?  OR  projects WHERE id = ?
        if (upper.includes('FROM PROJECTS')) {
          const id = boundVals[0] as string
          const row = projectStore.get(id)
          // Return a SHALLOW COPY so in-place mutations to the store row
          // don't retroactively change what the caller received.
          return (row ? { ...row } : null) as T | null
        }
        const id = boundVals[0] as string
        const row = taskStore.get(id)
        // Return a shallow copy to avoid aliasing: applyPatch mutates the
        // store row in-place (updating status/completed), which would also
        // mutate the `current` reference passed to advanceProjectMovement,
        // making alreadyDone=true and skipping the project update.
        return (row ? { ...row } : null) as T | null
      },
      all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
      run: async () => {
        const upper = sql.trim().toUpperCase()
        updateCalls.push({ sql, vals: boundVals })
        if (upper.includes('UPDATE PROJECTS') || (upper.startsWith('UPDATE') && upper.includes('PROJECTS'))) {
          // Apply the CASE WHEN update to the project store.
          // bind(ts, ts, projectId) — projectId is the last bound val.
          const id = boundVals[boundVals.length - 1] as string
          const row = projectStore.get(id)
          if (row) {
            const ts = boundVals[0] as string
            const existing = row.last_meaningful_movement as string | null | undefined
            // Simulate CASE WHEN: only update if ts is later than existing
            if (!existing || ts > existing) {
              row.last_meaningful_movement = ts
            }
            row.stale_active_since = null
            projectStore.set(id, row)
          }
          return { meta: { changes: 1 } }
        }
        if (upper.startsWith('UPDATE TASKS') || upper.startsWith('UPDATE')) {
          const setMatch = sql.match(/SET (.+) WHERE/s)
          if (setMatch) {
            const pairs = setMatch[1].split(',').map((s: string) => s.trim())
            const id = boundVals[boundVals.length - 1] as string
            const row = taskStore.get(id)
            if (row) {
              let paramIdx = 0
              for (const pair of pairs) {
                const [col, placeholder] = pair.split('=').map((s: string) => s.trim())
                if (placeholder && placeholder.includes('datetime')) {
                  row[col] = new Date().toISOString().replace('T', ' ').slice(0, 19)
                } else if (placeholder && placeholder.toUpperCase() === 'NULL') {
                  row[col] = null
                } else if (placeholder && placeholder.includes('CASE')) {
                  // Skip CASE WHEN in task updates (shouldn't happen, but safe)
                } else {
                  row[col] = boundVals[paramIdx++]
                }
              }
              taskStore.set(id, row)
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
        return { meta: { changes: 0 } }
      },
    }
    return self
  }

  return {
    _tasks: taskStore,
    _projects: projectStore,
    _updateCalls: updateCalls,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async () => [],
  }
}

function makeMut(overrides: Partial<Mutation> = {}): Mutation {
  return {
    mutation_id: 'mut_01test000000000000000000001',
    origin_machine: 'home',
    table: 'tasks',
    op: 'update',
    record_id: 'task_01test00000000000000000001',
    base_seq: null,
    base_row_hash: null,
    patch: { status: 'done', completed: 1 },
    client_ts: '2026-05-22T14:00:00.000Z',
    issued_at: '2026-05-22T14:00:00.000Z',
    ...overrides,
  }
}

const baseTask = {
  id: 'task_01test00000000000000000001',
  title: 'Test task',
  status: 'todo',
  completed: 0,
  project_id: 'r01-provider-variation',
  deleted_at: null,
  seq: 1,
  last_mutation_id: null,
}

const baseProject = {
  id: 'r01-provider-variation',
  title: 'R01: Provider Variation',
  status: 'active',
  last_meaningful_movement: null,
  stale_active_since: '2026-05-01T00:00:00.000Z',
}

// Helper to find UPDATE PROJECTS calls in the stub
function projectUpdateCalls(db: ReturnType<typeof makeStubDB>) {
  return db._updateCalls.filter(c => c.sql.trim().toUpperCase().startsWith('UPDATE PROJECTS'))
}

describe('advanceProjectMovement — via applyUpdate', () => {
  it('R1: advances project on todo→done transition (PB-origin mutation)', async () => {
    const db = makeStubDB({ task: { ...baseTask }, project: { ...baseProject } })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyUpdate(env, makeMut(), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    const projCalls = projectUpdateCalls(db)
    expect(projCalls.length).toBe(1)
    expect(projCalls[0].sql).toMatch(/UPDATE projects/i)
    expect(projCalls[0].sql).toMatch(/last_meaningful_movement/i)
    expect(projCalls[0].sql).toMatch(/stale_active_since\s*=\s*NULL/i)

    // Project row in store should reflect the advancement
    const proj = db._projects.get('r01-provider-variation')
    expect(proj?.last_meaningful_movement).toBe('2026-05-22T14:00:00.000Z')
    expect(proj?.stale_active_since).toBeNull()
  })

  it('R1 idempotent: does NOT advance if task already done', async () => {
    const db = makeStubDB({
      task: { ...baseTask, status: 'done', completed: 1 },
      project: { ...baseProject, last_meaningful_movement: '2026-05-20T10:00:00.000Z' },
    })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    // Re-send a done patch on an already-done task
    const result = await applyUpdate(env, makeMut({ patch: { status: 'done', completed: 1 } }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    // Should NOT have issued a project UPDATE
    expect(projectUpdateCalls(db).length).toBe(0)

    // Project unchanged
    const proj = db._projects.get('r01-provider-variation')
    expect(proj?.last_meaningful_movement).toBe('2026-05-20T10:00:00.000Z')
  })

  it('R2 MAX: does not move last_meaningful_movement backward', async () => {
    // Project has a LATER movement than the mutation timestamp
    const db = makeStubDB({
      task: { ...baseTask },
      project: { ...baseProject, last_meaningful_movement: '2026-05-22T16:00:00.000Z' },
    })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    // Mutation client_ts is 14:00 but project already has 16:00
    const result = await applyUpdate(env, makeMut({ client_ts: '2026-05-22T14:00:00.000Z' }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    // Project UPDATE was issued (for stale_active_since clearing)
    expect(projectUpdateCalls(db).length).toBe(1)

    // But the movement timestamp must NOT have moved backward
    const proj = db._projects.get('r01-provider-variation')
    expect(proj?.last_meaningful_movement).toBe('2026-05-22T16:00:00.000Z')
    // stale_active_since is still cleared (unconditional)
    expect(proj?.stale_active_since).toBeNull()
  })

  it('R3: fires for Hub-UI origin mutation (origin_machine=hub_ui:...)', async () => {
    const db = makeStubDB({ task: { ...baseTask }, project: { ...baseProject } })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'nick@example.com' } as import('../helpers').AuthUser

    const result = await applyUpdate(env, makeMut({
      mutation_id: 'mut_01test000000000000000000002',
      origin_machine: 'hub_ui:handleUpdateTaskStatus',
    }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    // Project must be advanced regardless of origin
    expect(projectUpdateCalls(db).length).toBe(1)
    const proj = db._projects.get('r01-provider-variation')
    expect(proj?.last_meaningful_movement).toBe('2026-05-22T14:00:00.000Z')
  })

  it('R4: no project_id → no project UPDATE (orphaned task is safe)', async () => {
    const db = makeStubDB({
      task: { ...baseTask, project_id: null },
    })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyUpdate(env, makeMut(), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    expect(projectUpdateCalls(db).length).toBe(0)
  })

  it('R5: non-done status transition does not advance project', async () => {
    const db = makeStubDB({ task: { ...baseTask }, project: { ...baseProject } })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    // Status change to in_progress (not done)
    const result = await applyUpdate(env, makeMut({
      mutation_id: 'mut_01test000000000000000000003',
      patch: { status: 'in_progress' },
    }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    expect(projectUpdateCalls(db).length).toBe(0)
    const proj = db._projects.get('r01-provider-variation')
    expect(proj?.last_meaningful_movement).toBeNull()
  })

  it('R1: completed=1 flag alone (without status) also triggers advancement', async () => {
    const db = makeStubDB({ task: { ...baseTask }, project: { ...baseProject } })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    // Some callers (e.g. toggle) may send completed=1 without status
    const result = await applyUpdate(env, makeMut({
      mutation_id: 'mut_01test000000000000000000004',
      patch: { completed: 1 },
    }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)

    expect(projectUpdateCalls(db).length).toBe(1)
    const proj = db._projects.get('r01-provider-variation')
    expect(proj?.last_meaningful_movement).toBe('2026-05-22T14:00:00.000Z')
  })
})

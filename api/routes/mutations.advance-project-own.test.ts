// Tests for advanceProjectOwnMovement in mutations.ts.
//
// A project worked exclusively through PB field writes (description, citation,
// due_date, ... -- no stage/status transition, no task activity underneath it)
// never touched last_meaningful_movement or activity_entries, so the Projects
// list's "activity" sort (GET /api/projects rollup + last_meaningful_movement
// fallback, src/pages/Projects.tsx) read it as stale and buried it (LPV R01,
// 2026-07-23 diagnosis: 40 activity_entries all backfill, sort rank 74/84,
// worked through July). advanceProjectOwnMovement closes that by advancing a
// project's OWN last_meaningful_movement whenever a PATCH touches a real
// content field -- symmetric to the existing advanceProjectMovement, which
// only advances it from a CHILD task's completion.
//
// Requirements verified here:
//   R1 -- a meaningful field change (e.g. description) advances LMM using the
//         mutation's client_ts, normalized to canonical UTC space-sep.
//   R2 -- MAX gate: never moves LMM backward.
//   R3 -- a patch touching ONLY excluded/bookkeeping fields does not advance LMM.
//   R4 -- a patch that explicitly sets last_meaningful_movement itself is left
//         alone (no competing CASE-gate write from this side-effect).
//   R5 -- a no-op patch (new value === old value) does not advance LMM.

import { describe, it, expect } from 'vitest'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'

// ── Stub DB -- projects only (this side-effect never touches tasks) ────────

function makeStubDB(project: Record<string, unknown>) {
  const store = new Map<string, Record<string, unknown>>()
  store.set(project.id as string, { ...project })
  const updateCalls: Array<{ sql: string; vals: unknown[] }> = []

  function makeStmt(sql: string, boundVals: unknown[]): ReturnType<typeof makeStmt> {
    const self = {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T>() => {
        const id = boundVals[0] as string
        const row = store.get(id)
        // Shallow copy: applyPatch's re-read after its own UPDATE must not
        // alias the stored row (mirrors mutations.advance-project.test.ts).
        return (row ? { ...row } : null) as T | null
      },
      all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
      run: async () => {
        updateCalls.push({ sql, vals: boundVals })
        const upper = sql.trim().toUpperCase()
        const id = boundVals[boundVals.length - 1] as string
        const row = store.get(id)
        if (!row) return { meta: { changes: 0 } }
        if (upper.includes('CASE')) {
          // advanceProjectOwnMovement's MAX-gate: bind(tsUtc, tsUtc, id).
          const ts = boundVals[0] as string
          const existing = row.last_meaningful_movement as string | null | undefined
          if (!existing || ts > existing) row.last_meaningful_movement = ts
        } else if (upper.startsWith('UPDATE PROJECTS')) {
          // applyPatch's generic SET clause: col = ?, ..., updated_at =
          // datetime('now'), last_mutation_id = ? WHERE id = ?
          const setMatch = sql.match(/SET (.+) WHERE/is)
          if (setMatch) {
            const pairs = setMatch[1].split(',').map((s: string) => s.trim())
            let paramIdx = 0
            for (const pair of pairs) {
              const eq = pair.indexOf('=')
              const col = pair.slice(0, eq).trim()
              const placeholder = pair.slice(eq + 1).trim()
              if (/datetime\(/i.test(placeholder)) {
                row[col] = '2026-07-30 00:00:00'
              } else {
                row[col] = boundVals[paramIdx++]
              }
            }
          }
        }
        store.set(id, row)
        return { meta: { changes: 1 } }
      },
    }
    return self
  }

  return {
    _store: store,
    _updateCalls: updateCalls,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async () => [],
  }
}

function lmmUpdateCalls(db: ReturnType<typeof makeStubDB>) {
  return db._updateCalls.filter((c) => c.sql.toUpperCase().includes('CASE'))
}

function makeMut(overrides: Partial<Mutation> = {}): Mutation {
  return {
    mutation_id: 'mut_01test000000000000000000002',
    origin_machine: 'home',
    table: 'projects',
    op: 'update',
    record_id: 'proj_01test00000000000000000001',
    base_seq: null,
    base_row_hash: null,
    patch: {},
    client_ts: '2026-07-23T14:00:00.000Z',
    issued_at: '2026-07-23T14:00:00.000Z',
    ...overrides,
  }
}

const baseProject = {
  id: 'proj_01test00000000000000000001',
  title: 'LPV R01',
  status: 'active',
  description: 'old description',
  stale_active_since: '2026-05-01 00:00:00',
  last_meaningful_movement: null as string | null,
  deleted_at: null,
  seq: 1,
  last_mutation_id: null,
}

describe('advanceProjectOwnMovement -- via applyUpdate', () => {
  it('R1: a meaningful field change (description) advances LMM from client_ts', async () => {
    const db = makeStubDB({ ...baseProject })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    const result = await applyUpdate(
      env,
      makeMut({ patch: { description: 'new description' } }),
      user,
    )
    expect(result.status).toBe('accepted')

    const calls = lmmUpdateCalls(db)
    expect(calls.length).toBe(1)
    expect(calls[0].sql).toMatch(/last_meaningful_movement/i)

    const proj = db._store.get(baseProject.id)
    // '2026-07-23T14:00:00.000Z' -> canonical UTC space-sep.
    expect(proj?.last_meaningful_movement).toBe('2026-07-23 14:00:00')
    expect(proj?.description).toBe('new description')
  })

  it('R2: MAX gate -- does not move LMM backward against a newer existing value', async () => {
    const db = makeStubDB({ ...baseProject, last_meaningful_movement: '2026-07-29 21:00:00' })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    // client_ts (2026-07-23) predates the existing LMM (2026-07-29).
    await applyUpdate(env, makeMut({ patch: { description: 'late-arriving edit' } }), user)

    const proj = db._store.get(baseProject.id)
    expect(proj?.last_meaningful_movement).toBe('2026-07-29 21:00:00')
  })

  it('R3: a patch touching ONLY bookkeeping fields does not advance LMM', async () => {
    const db = makeStubDB({ ...baseProject })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    await applyUpdate(env, makeMut({ patch: { stale_active_since: null } }), user)

    expect(lmmUpdateCalls(db).length).toBe(0)
    const proj = db._store.get(baseProject.id)
    expect(proj?.last_meaningful_movement).toBeNull()
  })

  it('R4: an explicit last_meaningful_movement in the patch is left alone (no competing write)', async () => {
    const db = makeStubDB({ ...baseProject })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    await applyUpdate(
      env,
      makeMut({
        patch: { description: 'explicit-lmm edit', last_meaningful_movement: '2026-07-23 14:00:00' },
      }),
      user,
    )

    // advanceProjectOwnMovement must not have fired its own CASE-gate write --
    // applyPatch's own SET clause already carries the explicit value.
    expect(lmmUpdateCalls(db).length).toBe(0)
    const proj = db._store.get(baseProject.id)
    expect(proj?.last_meaningful_movement).toBe('2026-07-23 14:00:00')
  })

  it('R5: a no-op patch (same value) does not advance LMM', async () => {
    const db = makeStubDB({ ...baseProject })
    const env = { DB: db } as unknown as import('../helpers').Env
    const user = { email: 'test@example.com' } as import('../helpers').AuthUser

    await applyUpdate(env, makeMut({ patch: { description: 'old description' } }), user)

    expect(lmmUpdateCalls(db).length).toBe(0)
    const proj = db._store.get(baseProject.id)
    expect(proj?.last_meaningful_movement).toBeNull()
  })
})

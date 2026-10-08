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
//
// #8862/#8875: runs on the migration-chain database
// (api/test-support/prod-schema-db.ts). The stub this file used re-implemented
// the CASE MAX-gate in JavaScript (so R2 tested the stub's copy, not the SQL),
// parsed task SET clauses by hand, had no completion-triad trigger (v98),
// and kept its own receipt map. Here the SQL runs; the
// project-UPDATE count comes from the statements the engine actually executed,
// and every write claim is checked on the STORED row plus the
// processed_mutations receipt.
//
// Premises the stub hid:
//   - the parent project id was a bare slug ('r01-provider-variation'); tasks
//     store the typed proj_* PK (P2-REKEY) and advanceProjectMovement matches
//     only `id = ?`, so the seed now uses a typed id.
//   - an "already done" task seeded as status=done, completed=1 with no
//     completed_at is refused by the v98 triad guard; it now carries the triad.
//   - a done patch of `{ status: 'done', completed: 1 }` (no completed_at) and
//     `{ completed: 1 }` alone are both refused by the v98 triad guard; done
//     patches now carry the full triad, and the completed-only case pins the
//     refusal (task untouched, no receipt, project not advanced).

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

const TASK = 'task_01test00000000000000000001'
const PROJ = 'proj_01r01providervariation0001'
const user = { email: 'test@example.com', slug: 'test' } as import('../helpers').AuthUser

let db: InstanceType<typeof Database>
let env: import('../helpers').Env
let executed: string[]

beforeEach(() => {
  db = prodSchemaDb()
  executed = []
  env = { DB: d1Adapter(db, { onExec: (sql) => executed.push(sql) }) } as unknown as import('../helpers').Env
})

function seedProject(id: string, row: Record<string, unknown> = {}) {
  return insertRow(db, 'projects', {
    id, title: 'R01: Provider Variation', status: 'active',
    last_meaningful_movement: null, stale_active_since: '2026-05-01 00:00:00',
    ...row,
  })
}

/** Seed a task; returns the seq the v53 trigger assigned (the base a writer holds). */
function seedTask(id: string, row: Record<string, unknown> = {}): number {
  const stored = insertRow(db, 'tasks', {
    id, title: 'Test task', status: 'todo', completed: 0, assignee: 'nick', project_id: PROJ,
    ...row,
  })
  return stored.seq as number
}

const projRow = (id = PROJ) => db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown>
const taskRow = (id = TASK) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>
// The MAX-gate statement advanceProjectMovement issues, as the engine ran it.
const projectUpdates = () => executed.filter((s) => /^\s*UPDATE\s+projects\b/i.test(s))

// The full completion triad, as every real done-writer sends it
// (api/routes/tasks.ts toggle, PB complete_task). The stub accepted
// `{ status: 'done', completed: 1 }`; the v98 trigger refuses it (no completed_at).
const DONE = { status: 'done', completed: 1, completed_at: '2026-05-22 14:00:00' }

function makeMut(overrides: Partial<Mutation> = {}): Mutation {
  return {
    mutation_id: 'mut_01test000000000000000000001',
    origin_machine: 'home',
    table: 'tasks',
    op: 'update',
    record_id: TASK,
    base_seq: null,
    base_row_hash: null,
    patch: DONE,
    client_ts: '2026-05-22T14:00:00.000Z',
    issued_at: '2026-05-22T14:00:00.000Z',
    ...overrides,
  }
}

/** The completion must have really landed: stored triad + receipt matching the result. */
function expectCompleted(mutationId: string, status: string, taskId = TASK) {
  const t = taskRow(taskId)
  expect(t.status).toBe('done')
  expect(t.completed).toBe(1)
  expect(t.completed_at).toBeTruthy()
  expect(t.last_mutation_id).toBe(mutationId)
  const r = receiptOf(db, mutationId)!
  expect(r.outcome).toBe(status)
  expect(r.original_response_json).toBeTruthy()
  expect(r.record_id).toBe(taskId)
}

describe('advanceProjectMovement — via applyUpdate', () => {
  it('R1: advances project on todo→done transition (PB-origin mutation)', async () => {
    seedProject(PROJ)
    const base = seedTask(TASK)

    const result = await applyUpdate(env, makeMut({ base_seq: base }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expectCompleted('mut_01test000000000000000000001', result.status)

    const projCalls = projectUpdates()
    expect(projCalls.length).toBe(1)
    expect(projCalls[0]).toMatch(/last_meaningful_movement/i)
    expect(projCalls[0]).toMatch(/stale_active_since\s*=\s*NULL/i)

    // Stored value is canonical UTC space-sep (Task-4 normalization):
    // '2026-05-22T14:00:00.000Z' → '2026-05-22 14:00:00'.
    const proj = projRow()
    expect(proj.last_meaningful_movement).toBe('2026-05-22 14:00:00')
    expect(proj.stale_active_since).toBeNull()
  })

  it('R1 idempotent: does NOT advance if task already done', async () => {
    // The v98 triad guard refuses status=done without completed=1 AND completed_at;
    // the stub accepted a done row with no completed_at.
    seedProject(PROJ, { last_meaningful_movement: '2026-05-20 10:00:00' })
    const base = seedTask(TASK, { status: 'done', completed: 1, completed_at: '2026-05-20 10:00:00' })

    // Re-send a done patch on an already-done task
    const result = await applyUpdate(env, makeMut({ base_seq: base, patch: DONE }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expect(receiptOf(db, 'mut_01test000000000000000000001')!.outcome).toBe(result.status)

    // Should NOT have issued a project UPDATE
    expect(projectUpdates().length).toBe(0)

    // Project unchanged, stale marker untouched
    const proj = projRow()
    expect(proj.last_meaningful_movement).toBe('2026-05-20 10:00:00')
    expect(proj.stale_active_since).toBe('2026-05-01 00:00:00')
  })

  it('R2 MAX: does not move last_meaningful_movement backward', async () => {
    // Project has a LATER movement than the mutation timestamp
    seedProject(PROJ, { last_meaningful_movement: '2026-05-22 16:00:00' })
    const base = seedTask(TASK)

    // Mutation client_ts is 14:00 but project already has 16:00
    const result = await applyUpdate(env, makeMut({ base_seq: base, client_ts: '2026-05-22T14:00:00.000Z' }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expectCompleted('mut_01test000000000000000000001', result.status)

    // Project UPDATE was issued (for stale_active_since clearing)
    expect(projectUpdates().length).toBe(1)

    // But the movement timestamp must NOT have moved backward — the SQL CASE ran.
    const proj = projRow()
    expect(proj.last_meaningful_movement).toBe('2026-05-22 16:00:00')
    // stale_active_since is still cleared (unconditional)
    expect(proj.stale_active_since).toBeNull()
  })

  it('R3: fires for Hub-UI origin mutation (origin_machine=hub_ui:...)', async () => {
    seedProject(PROJ)
    const base = seedTask(TASK)
    const nick = { email: 'nick@example.com', slug: 'nick-ingraham' } as import('../helpers').AuthUser

    const result = await applyUpdate(env, makeMut({
      mutation_id: 'mut_01test000000000000000000002',
      origin_machine: 'hub_ui:handleUpdateTaskStatus',
      base_seq: base,
    }), nick)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expectCompleted('mut_01test000000000000000000002', result.status)

    // Project must be advanced regardless of origin.
    expect(projectUpdates().length).toBe(1)
    expect(projRow().last_meaningful_movement).toBe('2026-05-22 14:00:00')
  })

  it('R4: no project_id → no project UPDATE (orphaned task is safe)', async () => {
    seedProject(PROJ)
    const base = seedTask(TASK, { project_id: null })

    const result = await applyUpdate(env, makeMut({ base_seq: base }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expectCompleted('mut_01test000000000000000000001', result.status)

    expect(projectUpdates().length).toBe(0)
    // An unrelated project is untouched.
    expect(projRow().last_meaningful_movement).toBeNull()
    expect(projRow().stale_active_since).toBe('2026-05-01 00:00:00')
  })

  it('R5: non-done status transition does not advance project', async () => {
    seedProject(PROJ)
    const base = seedTask(TASK)

    // Status change to in_progress (not done)
    const result = await applyUpdate(env, makeMut({
      mutation_id: 'mut_01test000000000000000000003',
      base_seq: base,
      patch: { status: 'in_progress' },
    }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expect(taskRow().status).toBe('in_progress')
    expect(receiptOf(db, 'mut_01test000000000000000000003')!.outcome).toBe(result.status)

    expect(projectUpdates().length).toBe(0)
    expect(projRow().last_meaningful_movement).toBeNull()
    expect(projRow().stale_active_since).toBe('2026-05-01 00:00:00')
  })

  it('R1: completed=1 flag alone (without status) is refused by the prod triad guard; project NOT advanced', async () => {
    // PREMISE CHANGED (#8875). The stub accepted `{ completed: 1 }` alone and
    // the test asserted the project advanced. In prod the v98 completion-triad
    // trigger refuses any non-deleted row with completed=1 and status!='done',
    // so this patch can never land, and advanceProjectMovement (which runs only
    // after the commit) never sees it. Real toggles send the full triad (DONE).
    seedProject(PROJ)
    const base = seedTask(TASK)

    await expect(applyUpdate(env, makeMut({
      mutation_id: 'mut_01test000000000000000000004',
      base_seq: base,
      patch: { completed: 1 },
    }), user)).rejects.toThrow(/completion triad guard/)

    expect(taskRow().status).toBe('todo')
    expect(taskRow().completed).toBe(0)
    expect(receiptOf(db, 'mut_01test000000000000000000004')).toBeUndefined()
    expect(projectUpdates().length).toBe(0)
    expect(projRow().last_meaningful_movement).toBeNull()
    expect(projRow().stale_active_since).toBe('2026-05-01 00:00:00')
  })

  it('dangling project_id: completion lands, the project UPDATE matches no row, nothing else moves', async () => {
    // tasks.project_id carries no FK in the migrated schema, so a dangling id is
    // representable. advanceProjectMovement's UPDATE is `WHERE id = ?` and
    // non-fatal: the task mutation must still commit and no project changes.
    seedProject(PROJ)
    const base = seedTask(TASK, { project_id: 'proj_does_not_exist' })

    const result = await applyUpdate(env, makeMut({ base_seq: base }), user)
    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expectCompleted('mut_01test000000000000000000001', result.status)

    expect(projectUpdates().length).toBe(1)
    expect(projRow().last_meaningful_movement).toBeNull()
    expect(projRow().stale_active_since).toBe('2026-05-01 00:00:00')
  })
})

// ── Task-4 UTC normalization tests ───────────────────────────────────────────
// Verifies advanceProjectMovement correctly normalizes naive-CT client_ts to
// UTC before the MAX compare so lexical `<` on two UTC space-sep values gives
// the right winner. (Increment 1A Task 4 — kills the live LMM churn bug.)
// Each test uses a distinct project + task id.

describe('advanceProjectMovement — Task-4 UTC normalization', () => {
  // Shared UTC offset for test: 2026-05-22 is CDT (-05:00 / -300 min).
  // 16:30 CT = 21:30 UTC; 15:00 CT = 20:00 UTC.

  it('naive-CT client_ts that is the LATER real instant beats an earlier stored UTC LMM', async () => {
    // Stored LMM (UTC space-sep): 2026-05-22 21:00:00 == 16:00 CT.
    // Incoming naive-CT client_ts: 2026-05-22T16:30:00 == 21:30 UTC (LATER).
    // Pre-fix raw lexical compare: '2026-05-22 21:00:00' < '2026-05-22T16:30:00'
    //   is FALSE ('2' < 'T' at separator pos) → the genuinely-later CT instant
    //   WRONGLY loses. After Task-4 fix, tsUtc = '2026-05-22 21:30:00' > stored
    //   '2026-05-22 21:00:00' → LMM correctly advances to '2026-05-22 21:30:00'.
    const taskId = 'task_01utcnorm0000000000000001'
    const projId = 'proj_utc_norm_x'
    seedProject(projId, { title: 'UTC norm project X', last_meaningful_movement: '2026-05-22 21:00:00', stale_active_since: null })
    const base = seedTask(taskId, { title: 'UTC norm task', project_id: projId })

    const result = await applyUpdate(env, makeMut({
      mutation_id: 'mut_01utcnorm0000000000000001',
      record_id: taskId,
      base_seq: base,
      // Naive CT: 16:30 on 2026-05-22. CDT = UTC-5, so 16:30 CT = 21:30 UTC.
      client_ts: '2026-05-22T16:30:00',
    }), user)
    expectCompleted('mut_01utcnorm0000000000000001', result.status, taskId)

    // The later real instant (21:30 UTC) must win, stored as UTC space-sep.
    expect(projRow(projId).last_meaningful_movement).toBe('2026-05-22 21:30:00')
  })

  it('explicit-UTC (Z) client_ts is honored verbatim as UTC', async () => {
    const taskId = 'task_01utcnorm0000000000000002'
    const projId = 'proj_utc_norm_y'
    seedProject(projId, { title: 'UTC norm project Y', last_meaningful_movement: '2026-05-22 21:00:00', stale_active_since: null })
    const base = seedTask(taskId, { title: 'UTC norm task Y', project_id: projId })

    const result = await applyUpdate(env, makeMut({
      mutation_id: 'mut_01utcnorm0000000000000002',
      record_id: taskId,
      base_seq: base,
      client_ts: '2026-05-22T21:30:00Z',
    }), user)
    expectCompleted('mut_01utcnorm0000000000000002', result.status, taskId)

    // Z-suffix is UTC; 21:30:00Z → stored as '2026-05-22 21:30:00'.
    expect(projRow(projId).last_meaningful_movement).toBe('2026-05-22 21:30:00')
  })

  it('an earlier incoming instant does NOT overwrite a later stored LMM', async () => {
    // Stored LMM: 2026-05-22 22:00:00 UTC (later).
    // Incoming naive-CT: 2026-05-22T16:30:00 == 21:30 UTC (earlier).
    const taskId = 'task_01utcnorm0000000000000003'
    const projId = 'proj_utc_norm_z'
    seedProject(projId, { title: 'UTC norm project Z', last_meaningful_movement: '2026-05-22 22:00:00', stale_active_since: null })
    const base = seedTask(taskId, { title: 'UTC norm task Z', project_id: projId })

    const result = await applyUpdate(env, makeMut({
      mutation_id: 'mut_01utcnorm0000000000000003',
      record_id: taskId,
      base_seq: base,
      client_ts: '2026-05-22T16:30:00', // 21:30 UTC — earlier than 22:00
    }), user)
    expectCompleted('mut_01utcnorm0000000000000003', result.status, taskId)

    // The UPDATE ran (the SQL CASE decided), and LMM must remain unchanged.
    expect(projectUpdates().length).toBe(1)
    expect(projRow(projId).last_meaningful_movement).toBe('2026-05-22 22:00:00')
  })

  it('concurrent completions never move LMM backward — atomic single-UPDATE CASE guard (Codex finding 2)', async () => {
    // Two completions race: an EARLIER instant (CT 15:00 = 20:00 UTC) and a
    // LATER instant (CT 16:30 = 21:30 UTC), fired concurrently from Promise.all.
    // The atomic single-UPDATE CASE compare ensures the LATER value wins
    // regardless of arrival order. better-sqlite3 serializes statements; the
    // test documents the invariant and catches any future refactor that
    // introduces a read-modify-write.
    const taskEarlier = 'task_01utcnorm0000000000000004'
    const taskLater   = 'task_01utcnorm0000000000000005'
    const projId = 'proj_utc_norm_cas'
    seedProject(projId, { title: 'CAS project', last_meaningful_movement: '2026-05-22 20:00:00', stale_active_since: null })
    const baseEarlier = seedTask(taskEarlier, { title: 'CAS task earlier', project_id: projId })
    const baseLater = seedTask(taskLater, { title: 'CAS task later', project_id: projId })

    const [rEarlier, rLater] = await Promise.all([
      applyUpdate(env, makeMut({
        mutation_id: 'mut_01utcnorm0000000000000004',
        record_id: taskEarlier,
        base_seq: baseEarlier,
        client_ts: '2026-05-22T15:00:00', // 20:00 UTC — EARLIER
      }), user),
      applyUpdate(env, makeMut({
        mutation_id: 'mut_01utcnorm0000000000000005',
        record_id: taskLater,
        base_seq: baseLater,
        client_ts: '2026-05-22T16:30:00', // 21:30 UTC — LATER
      }), user),
    ])
    expectCompleted('mut_01utcnorm0000000000000004', rEarlier.status, taskEarlier)
    expectCompleted('mut_01utcnorm0000000000000005', rLater.status, taskLater)

    expect(projectUpdates().length).toBe(2)
    // The LATER instant (21:30 UTC) must have won; LMM must never be moved backward.
    expect(projRow(projId).last_meaningful_movement).toBe('2026-05-22 21:30:00')
  })
})

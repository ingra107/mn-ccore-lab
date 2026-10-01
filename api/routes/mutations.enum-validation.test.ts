// Phase A1 — Hub /api/mutations validating-authority tests.
//
// Covers the four flag-gated validators wired into the mutation write path:
//   V1 enum         (hub_validate_enums)              — canonicalize-forward
//   V2 conflict-hash(hub_validate_conflict_hash)      — broad LWW closure + hub_ui exempt
//   V3 dedup        (hub_dedup_adoptable)             — adoptable canonical_id
//   V4 triad        (hub_validate_completion_tombstone)
// plus the well-formedness backstop on the generated enum-domains JSON.
//
// SSOT plan: Peripheral-Brain/Scratch/plans/2026-05-26-phaseA1-hub-validation-CONSOLIDATED.md.
// Acceptance tests (a)-(g) map to the describe blocks below.

import { describe, it, expect, beforeEach } from 'vitest'
import { nowInstant } from '../lib/time'
import { handleMutations, applyInsert } from './mutations'
import type { Mutation } from './mutations'
import type { Env, AuthUser, ValidationFlags } from '../helpers'
import { _resetValidationFlagsCache } from '../helpers'
import { enumFieldsFor, canonicalizeValue, assertEnumDomain, assertCompletionTriad } from '../lib/enum-domains'
import { classifyTaskDedupSelect } from '../lib/task-dedup-sql'
import enumDomains from '../enum-domains.generated.json'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

const fakeUser = { email: 'test@example.com', role: 'admin' } as AuthUser
// M07: handleMutations now requires PI/API-key auth.
const TEST_API_KEY = 'test-enum-validation-api-key'

// ── Fixture ──────────────────────────────────────────────────────────────────
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The old stub parsed INSERT column lists and SET clauses by regex, served
// lab_settings from a Map, treated the processed_mutations receipt INSERT as a
// bookkeeping Set, and simulated the race-loser UNIQUE by throwing on any
// tasks INSERT. Here the validation flags are real lab_settings rows, seq comes
// from the v53 triggers, the dedup race trips the real partial unique index,
// and every write claim is checked against the stored row AND the receipt.

type Db = ReturnType<typeof prodSchemaDb>

function makeDb(opts: {
  flags?: Partial<Record<string, string>>      // lab_settings key -> '1'|'0'
  rows?: Array<[string, Record<string, unknown>]>
} = {}): Db {
  const db = prodSchemaDb()
  for (const [key, value] of Object.entries(opts.flags ?? {})) {
    db.prepare('INSERT OR REPLACE INTO lab_settings (key, value) VALUES (?, ?)').run(key, value)
  }
  for (const [table, row] of opts.rows ?? []) insertRow(db, table, row)
  return db
}

const rowOf = (db: Db, table: string, id: string) =>
  db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined

function envWith(db: Db, hooks: Parameters<typeof d1Adapter>[1] = {}): Env {
  return { DB: d1Adapter(db, hooks), PB_API_KEY: TEST_API_KEY } as unknown as Env
}

async function runMutation(env: Env, mut: Mutation) {
  const req = new Request('https://example.com/api/mutations', {
    method: 'POST',
    body: JSON.stringify({ mutations: [mut] }),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_API_KEY}`,
    },
  })
  const resp = await handleMutations(req, fakeUser, env)
  const body = (await resp.json()) as { results: Array<Record<string, unknown>> }
  return body.results[0]
}

const ALL_ON = {
  hub_validate_enums: '1',
  hub_validate_conflict_hash: '1',
  hub_validate_completion_tombstone: '1',
  hub_dedup_adoptable: '1',
}

beforeEach(() => _resetValidationFlagsCache())

// ── well-formedness backstop (independent of the PB no-diff gate) ───────────

describe('enum-domains.generated.json well-formedness', () => {
  const file = enumDomains as { tables: Record<string, Record<string, { canonical: string[]; legacy_aliases: Record<string, string>; nullable: boolean }>> }

  it('every TABLE_FIELDS enum column for tasks/projects has a domain', () => {
    // The enum columns the validator must cover (Hub wire field names). These
    // are exactly the enum columns in mutations.ts TABLE_FIELDS. schema-v71
    // (2026-05-29) promoted projects.tier + projects.domain PB-only -> Hub-
    // canonical, so they now DO cross the wire and the validator covers them.
    const required: Record<string, string[]> = {
      tasks: ['status', 'priority', 'effort', 'deadline_type', 'next_artifact'],
      projects: ['status', 'stage', 'state', 'category', 'tier', 'domain'],
    }
    for (const [table, fields] of Object.entries(required)) {
      const domains = file.tables[table]
      expect(domains, `${table} has no domains`).toBeTruthy()
      for (const f of fields) {
        expect(domains[f], `${table}.${f} missing a domain`).toBeTruthy()
        expect(Array.isArray(domains[f].canonical)).toBe(true)
        expect(domains[f].canonical.length).toBeGreaterThan(0)
      }
    }
  })

  it('projects.category domain is the bucket VALUES, not the PB type enum', () => {
    const cat = file.tables.projects.category
    expect(new Set(cat.canonical)).toEqual(new Set(['CLIF', 'MNCCORE', 'Peripheral Brain']))
    // must NOT be the PB type names
    expect(cat.canonical).not.toContain('R01')
    expect(cat.canonical).not.toContain('Nick_Lab')
    expect(cat.legacy_aliases).toEqual({})
  })

  it('status (both tables) is non-nullable; others nullable', () => {
    expect(file.tables.tasks.status.nullable).toBe(false)
    expect(file.tables.projects.status.nullable).toBe(false)
    expect(file.tables.tasks.priority.nullable).toBe(true)
  })

  it('promoted enums (projects.tier/domain) ARE in the wire mirror (schema-v71)', () => {
    // schema-v71 (2026-05-29) promoted projects.tier + projects.domain
    // PB-only -> Hub-canonical. They now round-trip /api/mutations, so the
    // validator MUST cover them (the inverse of the pre-v71 assertion).
    expect(file.tables.projects.tier).toBeDefined()
    expect(new Set(file.tables.projects.tier.canonical)).toEqual(
      new Set(['1-Weekly', '2-Biweekly', '3-Monthly'])
    )
    expect(file.tables.projects.domain).toBeDefined()
    expect(new Set(file.tables.projects.domain.canonical)).toEqual(
      new Set(['Research', 'Grants', 'Teaching', 'Personal', 'Professional Development'])
    )
  })
})

// ── unit: canonicalize-forward semantics (mirror enums.py:_canonicalize) ────

describe('canonicalizeValue — mirrors enums.py _canonicalize', () => {
  const status = enumFieldsFor('tasks')!.status

  it('exact canonical passes through', () => {
    expect(canonicalizeValue('todo', status)).toBe('todo')
  })
  it('exact legacy alias maps forward', () => {
    expect(canonicalizeValue('Active', status)).toBe('todo')
    expect(canonicalizeValue('Completed', status)).toBe('done')
  })
  it('case-insensitive canonical match', () => {
    expect(canonicalizeValue('TODO', status)).toBe('todo')
  })
  it('unmappable junk returns null', () => {
    expect(canonicalizeValue('Banana', status)).toBeNull()
  })

  it('assertEnumDomain rewrites the payload in place to canonical', () => {
    const fields: Record<string, unknown> = { status: 'Active', priority: 'High' }
    const err = assertEnumDomain('tasks', fields)
    expect(err).toBeNull()
    expect(fields.status).toBe('todo')
    expect(fields.priority).toBe('high')
  })
  it('assertEnumDomain rejects non-nullable null status', () => {
    expect(assertEnumDomain('tasks', { status: null })).toMatch(/non-nullable/)
  })
  it('assertEnumDomain allows nullable enum cleared to null', () => {
    expect(assertEnumDomain('tasks', { priority: null })).toBeNull()
  })
})

// ── (a)/(b) V1 enum ──────────────────────────────────────────────────────────

describe('(a)(b) V1 enum validation', () => {
  it('(a) invalid enum -> error, row unchanged', async () => {
    const db = makeDb({ flags: ALL_ON })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_a1', origin_machine: 'home', table: 'tasks', op: 'insert',
      record_id: 'task_aaa1', base_seq: null, base_row_hash: null,
      payload: { title: 'X', status: 'Banana', priority: 'medium', assignee: 'nick-ingraham' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('error')
    expect(rowOf(db, 'tasks', 'task_aaa1')).toBeUndefined()
    // The rejection is recorded (replayable), not silently dropped.
    const receipt = receiptOf(db, 'mut_a1')
    expect(receipt?.outcome).toBe('error')
    expect(JSON.parse(receipt!.original_response_json).status).toBe('error')
  })

  it('(b) legacy value canonicalizes and is ACCEPTED (risk-#1 guard)', async () => {
    const db = makeDb({ flags: ALL_ON })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_b1', origin_machine: 'home', table: 'tasks', op: 'insert',
      record_id: 'task_bbb1', base_seq: null, base_row_hash: null,
      payload: { title: 'Legacy', status: 'Active', priority: 'High', assignee: 'nick-ingraham' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')
    const row = rowOf(db, 'tasks', 'task_bbb1')!
    expect(row.status).toBe('todo')   // canonicalized forward
    expect(row.priority).toBe('high')
    expect(row.last_mutation_id).toBe('mut_b1')
    expect(receiptOf(db, 'mut_b1')?.outcome).toBe('accepted')
  })

  it('flags OFF -> invalid enum applies (validator dormant)', async () => {
    // No hub_validate_* rows seeded: the migrated lab_settings carries none of
    // the four flags, so getValidationFlags reads them OFF. tasks.status has no
    // CHECK in prod, so the junk value really lands — that is what "dormant"
    // means, and why the flag being ON in prod matters.
    const db = makeDb({ flags: {} })  // all OFF
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_off1', origin_machine: 'home', table: 'tasks', op: 'insert',
      record_id: 'task_off1', base_seq: null, base_row_hash: null,
      payload: { title: 'X', status: 'Banana', priority: 'medium', assignee: 'nick-ingraham' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')   // dormant — no rejection
    expect(rowOf(db, 'tasks', 'task_off1')!.status).toBe('Banana')
    expect(receiptOf(db, 'mut_off1')?.outcome).toBe('accepted')
  })
})

// ── (e) V1 category bucket-domain ──────────────────────────────────────────

describe('(e) projects.category bucket domain', () => {
  it('category=MNCCORE accepted', async () => {
    const db = makeDb({ flags: ALL_ON })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_e1', origin_machine: 'home', table: 'projects', op: 'insert',
      record_id: 'proj_e1', base_seq: null, base_row_hash: null,
      payload: { title: 'P', status: 'active', stage: 'idea', category: 'MNCCORE' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')
    expect(rowOf(db, 'projects', 'proj_e1')!.category).toBe('MNCCORE')
    expect(receiptOf(db, 'mut_e1')?.outcome).toBe('accepted')
  })

  it('category=R01 rejected (proves bucket-domain, not type-domain)', async () => {
    const db = makeDb({ flags: ALL_ON })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_e2', origin_machine: 'home', table: 'projects', op: 'insert',
      record_id: 'proj_e2', base_seq: null, base_row_hash: null,
      payload: { title: 'P', status: 'active', stage: 'idea', category: 'R01' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('error')
    expect(rowOf(db, 'projects', 'proj_e2')).toBeUndefined()
    expect(receiptOf(db, 'mut_e2')?.outcome).toBe('error')
  })
})

// ── (c)(d) V2 conflict-hash ──────────────────────────────────────────────────

describe('(c)(d) V2 conflict-hash closure', () => {
  const taskId = 'task_conf1'
  /** Seed the task, then edit it twice so seq advances past the base an older
   *  writer held. Returns the CURRENT seq (what the v53 triggers made of it). */
  function seed(db: Db): number {
    insertRow(db, 'tasks', { id: taskId, title: 'C', status: 'todo', priority: 'medium', assignee: 'nick-ingraham' })
    db.prepare("UPDATE tasks SET description = 'edit 1' WHERE id = ?").run(taskId)
    db.prepare("UPDATE tasks SET description = 'edit 2' WHERE id = ?").run(taskId)
    const seq = rowOf(db, 'tasks', taskId)!.seq as number
    expect(seq).toBeGreaterThanOrEqual(2)
    return seq
  }

  it('(c) stale-seq + no base_row_hash -> conflict, row unchanged', async () => {
    const db = makeDb({ flags: ALL_ON })
    const seq = seed(db)
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_c1', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: taskId, base_seq: seq - 1, base_row_hash: null,
      patch: { priority: 'high' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('conflict')
    const row = rowOf(db, 'tasks', taskId)!
    expect(row.priority).toBe('medium')  // unchanged
    expect(row.seq).toBe(seq)
    expect(receiptOf(db, 'mut_c1')?.outcome).toBe('conflict')
  })

  it('base_seq=null update against existing row -> conflict (blind overwrite refused)', async () => {
    const db = makeDb({ flags: ALL_ON })
    const seq = seed(db)
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_c2', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: taskId, base_seq: null, base_row_hash: null,
      patch: { priority: 'high' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('conflict')
    const row = rowOf(db, 'tasks', taskId)!
    expect(row.priority).toBe('medium')
    expect(row.seq).toBe(seq)
    expect(receiptOf(db, 'mut_c2')?.outcome).toBe('conflict')
  })

  it('(d) hub_ui exemption: base_seq=null + hub_ui origin -> applies', async () => {
    const db = makeDb({ flags: ALL_ON })
    const seq = seed(db)
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_d1', origin_machine: 'hub_ui:test', table: 'tasks', op: 'update',
      record_id: taskId, base_seq: null, base_row_hash: null,
      patch: { priority: 'high' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')
    const row = rowOf(db, 'tasks', taskId)!
    expect(row.priority).toBe('high')
    expect(row.seq as number).toBeGreaterThan(seq)
    expect(row.last_mutation_id).toBe('mut_d1')
    expect(receiptOf(db, 'mut_d1')?.outcome).toBe('accepted')
  })

  it('non-stale hashless update still accepts (no over-rejection)', async () => {
    const db = makeDb({ flags: ALL_ON })
    const seq = seed(db)
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_c3', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: taskId, base_seq: seq, base_row_hash: null,   // base_seq == current_seq
      patch: { priority: 'high' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')
    expect(rowOf(db, 'tasks', taskId)!.priority).toBe('high')
    expect(receiptOf(db, 'mut_c3')?.outcome).toBe('accepted')
  })
})

// ── (f) V3 adoptable dedup ───────────────────────────────────────────────────

describe('(f) V3 adoptable dedup', () => {
  const taskCount = (db: Db) => (db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number }).n

  it('serial dedup returns accepted + canonical_id, no new row', async () => {
    const winner = 'task_win1'
    const db = makeDb({
      flags: ALL_ON,
      rows: [['tasks', { id: winner, title: 'Dup', project_id: null, status: 'todo', assignee: 'nick-ingraham' }]],
    })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_f1', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: 'task_loser1', base_seq: null, base_row_hash: null,
      payload: { title: 'Dup', project_id: null, status: 'todo', priority: 'medium', assignee: 'nick-ingraham' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')
    expect(r.canonical_id).toBe(winner)
    expect(rowOf(db, 'tasks', 'task_loser1')).toBeUndefined()
    expect(taskCount(db)).toBe(1)
    expect(receiptOf(db, 'mut_f1')?.outcome).toBe('accepted')
  })

  it('race-loser UNIQUE -> adoptable accepted + canonical_id (not error)', async () => {
    // The old stub threw UNIQUE on every tasks INSERT; as its own comment said,
    // the serial dedup SELECT finds the winner first, so this case exercises the
    // serial path end-to-end through handleMutations (the true race path is the
    // next case). Here the loser's title differs from the winner's only in case
    // and edge whitespace, so adoption also proves the folded key (#530b).
    const winner = 'task_win2'
    const db = makeDb({
      flags: ALL_ON,
      rows: [['tasks', { id: winner, title: 'Race', project_id: null, status: 'todo', assignee: 'nick-ingraham' }]],
    })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_f2', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: 'task_loser2', base_seq: null, base_row_hash: null,
      payload: { title: '  RACE ', project_id: null, status: 'todo', priority: 'medium', assignee: 'nick-ingraham' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')
    expect(r.canonical_id).toBe(winner)
    expect(rowOf(db, 'tasks', 'task_loser2')).toBeUndefined()
    expect(taskCount(db)).toBe(1)
    expect(receiptOf(db, 'mut_f2')?.outcome).toBe('accepted')
  })

  it('race-loser path via applyInsert: dedup SELECT misses, INSERT throws UNIQUE, re-lookup adopts', async () => {
    // The race is made real: the winner commits in the window between the
    // loser's serial dedup SELECT (which therefore misses) and the loser's
    // INSERT, which then trips the real partial unique index
    // idx_tasks_title_norm_nonrecurring_active. The old stub faked all three.
    const winner = 'task_win3'
    const db = makeDb()
    let dedupSelects = 0
    let winnerCommitted = false
    const env = envWith(db, {
      onExec: (sql) => {
        if (/^\s*SELECT id FROM tasks/i.test(sql) && classifyTaskDedupSelect(sql) === 'title') dedupSelects++
        if (!winnerCommitted && /^\s*INSERT INTO tasks\b/i.test(sql)) {
          winnerCommitted = true
          insertRow(db, 'tasks', { id: winner, title: 'R3', project_id: null, status: 'todo', assignee: 'nick-ingraham' })
        }
      },
    })
    const flags: ValidationFlags = { enums: false, conflict_hash: false, completion_tombstone: false, dedup: true, question_consumed: false }
    const mut: Mutation = {
      mutation_id: 'mut_f3', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: 'task_loser3', base_seq: null, base_row_hash: null,
      // assignee is TEXT NOT NULL in prod. The old stub's payload omitted it and
      // still reached the UNIQUE throw; on the real schema NOT NULL fires first
      // (pinned by the next case), so the payload carries one.
      payload: { title: 'R3', project_id: null, status: 'todo', assignee: 'nick-ingraham' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await applyInsert(env, mut, fakeUser, flags)
    expect(r.status).toBe('accepted')
    expect(r.canonical_id).toBe(winner)
    expect(r.reason).toMatch(/race-loser/)
    expect(winnerCommitted).toBe(true)
    expect(dedupSelects).toBe(2)   // serial miss + post-throw re-lookup
    expect(rowOf(db, 'tasks', 'task_loser3')).toBeUndefined()
    expect(taskCount(db)).toBe(1)
  })

  it('a NOT NULL refusal during the race window is NOT adopted as a race-loser', async () => {
    // Premise the old stub hid: it threw UNIQUE for any tasks INSERT, so an
    // assignee-less payload looked like a race-loser. Prod refuses the row on
    // tasks.assignee NOT NULL before any index is consulted; the catch adopts
    // only on UNIQUE, so the error propagates even though a same-title winner
    // committed in the window. Nothing is written for the loser.
    const db = makeDb()
    let winnerCommitted = false
    const env = envWith(db, {
      onExec: (sql) => {
        if (!winnerCommitted && /^\s*INSERT INTO tasks\b/i.test(sql)) {
          winnerCommitted = true
          insertRow(db, 'tasks', { id: 'task_win4', title: 'R4', project_id: null, status: 'todo', assignee: 'nick-ingraham' })
        }
      },
    })
    const flags: ValidationFlags = { enums: false, conflict_hash: false, completion_tombstone: false, dedup: true, question_consumed: false }
    const mut: Mutation = {
      mutation_id: 'mut_f4', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: 'task_loser4', base_seq: null, base_row_hash: null,
      payload: { title: 'R4', project_id: null, status: 'todo' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    await expect(applyInsert(env, mut, fakeUser, flags)).rejects.toThrow(/NOT NULL constraint failed: tasks\.assignee/)
    expect(rowOf(db, 'tasks', 'task_loser4')).toBeUndefined()
    expect(taskCount(db)).toBe(1)
  })
})

// ── V4 completion-triad ──────────────────────────────────────────────────────

describe('V4 completion-triad', () => {
  it('status=done without completed=1 rejected (insert)', () => {
    const err = assertCompletionTriad('tasks', null, { status: 'done' })
    expect(err).toMatch(/completed=1/)
  })
  it('consistent done triad passes', () => {
    const err = assertCompletionTriad('tasks', null, { status: 'done', completed: 1, completed_at: '2026-05-26 12:00:00' })
    expect(err).toBeNull()
  })
  it('completed=1 without status=done rejected', () => {
    const err = assertCompletionTriad('tasks', null, { status: 'todo', completed: 1, completed_at: '2026-05-26 12:00:00' })
    expect(err).toMatch(/status='done'/)
  })
  it('status=deleted skips triad', () => {
    expect(assertCompletionTriad('tasks', null, { status: 'deleted' })).toBeNull()
  })
  it('patch touching no completion signal on legacy-inconsistent row does not false-fire', () => {
    const current = { status: 'done', completed: 0, completed_at: null }  // legacy-inconsistent stored state
    expect(assertCompletionTriad('tasks', current, { due_date: '2026-06-01' })).toBeNull()
  })
  // schema-v98 D1 trigger parity — 4th clause (completed_at set requires completed=1).
  it('completed_at set without completed=1 rejected', () => {
    const err = assertCompletionTriad('tasks', null, { status: 'todo', completed: 0, completed_at: '2026-07-10 12:00:00' })
    expect(err).toMatch(/completed_at set requires completed=1/)
  })
  it('completed_at-only patch on an already-completed row still passes', () => {
    const current = { status: 'done', completed: 1, completed_at: '2026-07-09 10:00:00' }
    expect(assertCompletionTriad('tasks', current, { completed_at: '2026-07-10 12:00:00' })).toBeNull()
  })
})

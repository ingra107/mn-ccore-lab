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
import { handleMutations, applyUpdate, applyInsert } from './mutations'
import type { Mutation } from './mutations'
import type { Env, AuthUser, ValidationFlags } from '../helpers'
import { _resetValidationFlagsCache } from '../helpers'
import { enumFieldsFor, canonicalizeValue, assertEnumDomain, assertCompletionTriad } from '../lib/enum-domains'
import enumDomains from '../enum-domains.generated.json'

const fakeUser = { email: 'test@example.com', role: 'admin' } as AuthUser
// M07: handleMutations now requires PI/API-key auth.
const TEST_API_KEY = 'test-enum-validation-api-key'

// ── Stub DB with lab_settings flags + tasks/projects store ──────────────────

function makeStubDB(opts: {
  flags?: Partial<Record<string, string>>      // lab_settings key -> '1'|'0'
  rows?: Record<string, Record<string, unknown>>
  raceUnique?: boolean                          // simulate partial-index UNIQUE on tasks insert
} = {}) {
  const store = new Map<string, Record<string, unknown>>(Object.entries(opts.rows ?? {}))
  const labSettings = new Map<string, string>(Object.entries(opts.flags ?? {}))
  const processed = new Set<string>()

  function findByTitleProject(title: string, projectId: string | null): Record<string, unknown> | null {
    for (const row of store.values()) {
      if (row.title === title && (row.project_id ?? null) === projectId && !row.deleted_at && row.status !== 'done') {
        return row
      }
    }
    return null
  }

  function makeStmt(sql: string, boundVals: unknown[]): any {
    const upper = sql.trim().toUpperCase()
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),

      first: async <T>() => {
        if (upper.startsWith('SELECT VALUE FROM LAB_SETTINGS') || upper.includes('FROM LAB_SETTINGS WHERE KEY =')) {
          const k = boundVals[0] as string
          const v = labSettings.get(k)
          return (v !== undefined ? { value: v } : null) as T | null
        }
        if (upper.includes('FROM PROCESSED_MUTATIONS')) {
          return null as T | null
        }
        if (upper.includes('TITLE =') && upper.includes('PROJECT_ID IS')) {
          const title = boundVals[0] as string
          const projectId = (boundVals[1] === undefined ? null : boundVals[1]) as string | null
          const row = findByTitleProject(title, projectId)
          return (row ? { id: row.id } : null) as T | null
        }
        // readCanonical / select slug etc.: SELECT * FROM <t> WHERE id = ?
        const id = boundVals[0] as string
        return (store.get(id) ?? null) as T | null
      },

      all: async <T>() => {
        // getValidationFlags: SELECT key, value FROM lab_settings WHERE key IN (...)
        if (upper.includes('FROM LAB_SETTINGS') && upper.includes('KEY IN')) {
          const results = (boundVals as string[])
            .filter(k => labSettings.has(k))
            .map(k => ({ key: k, value: labSettings.get(k)! }))
          return { results: results as T[], success: true, meta: {} }
        }
        return { results: [] as T[], success: true, meta: {} }
      },

      run: async () => {
        if (upper.startsWith('INSERT INTO PROCESSED_MUTATIONS')) {
          const mid = boundVals[0] as string
          if (processed.has(mid)) return { meta: { changes: 0 } }
          processed.add(mid)
          return { meta: { changes: 1 } }
        }
        if (upper.startsWith('INSERT INTO TASKS')) {
          if (opts.raceUnique) {
            throw new Error('D1_ERROR: UNIQUE constraint failed: tasks.title, tasks.project_id')
          }
          // crude col=val capture: INSERT INTO tasks (a, b, ...) VALUES (?, ?, ...)
          const m = sql.match(/INSERT INTO \w+ \(([^)]+)\)/i)
          if (m) {
            const cols = m[1].split(',').map(s => s.trim())
            const row: Record<string, unknown> = {}
            cols.forEach((c, i) => { row[c] = boundVals[i] })
            row.seq = (store.size + 1)
            store.set(row.id as string, row)
          }
          return { meta: { changes: 1 } }
        }
        if (upper.startsWith('INSERT INTO PROJECTS')) {
          const m = sql.match(/INSERT INTO \w+ \(([^)]+)\)/i)
          if (m) {
            const cols = m[1].split(',').map(s => s.trim())
            const row: Record<string, unknown> = {}
            cols.forEach((c, i) => { row[c] = boundVals[i] })
            row.seq = (store.size + 1)
            store.set(row.id as string, row)
          }
          return { meta: { changes: 1 } }
        }
        if (upper.startsWith('UPDATE')) {
          const setMatch = sql.match(/SET (.+) WHERE/s)
          if (setMatch) {
            const pairs = setMatch[1].split(',').map(s => s.trim())
            const id = boundVals[boundVals.length - 1] as string
            const row = store.get(id)
            if (row) {
              let paramIdx = 0
              for (const pair of pairs) {
                const [col, placeholder] = pair.split('=').map(s => s.trim())
                if (placeholder && placeholder.includes('datetime')) {
                  row[col] = nowInstant().replace('T', ' ').slice(0, 19)
                } else if (placeholder && placeholder.toUpperCase() === 'NULL') {
                  row[col] = null
                } else if (placeholder && placeholder.toUpperCase().includes('CASE')) {
                  // advanceProjectMovement CASE — skip param accounting (no-op for tests)
                } else {
                  row[col] = boundVals[paramIdx++]
                }
              }
              row.seq = ((row.seq as number) ?? 0) + 1
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
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => Promise.all(stmts.map(s => s.run())),
  } as unknown as Env['DB']
}

function envWith(db: Env['DB']): Env {
  return { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env
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
    const db = makeStubDB({ flags: ALL_ON })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_a1', origin_machine: 'home', table: 'tasks', op: 'insert',
      record_id: 'task_aaa1', base_seq: null, base_row_hash: null,
      payload: { title: 'X', status: 'Banana', priority: 'medium', assignee: 'nick-ingraham' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('error')
    expect((db as any)._store.has('task_aaa1')).toBe(false)
  })

  it('(b) legacy value canonicalizes and is ACCEPTED (risk-#1 guard)', async () => {
    const db = makeStubDB({ flags: ALL_ON })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_b1', origin_machine: 'home', table: 'tasks', op: 'insert',
      record_id: 'task_bbb1', base_seq: null, base_row_hash: null,
      payload: { title: 'Legacy', status: 'Active', priority: 'High', assignee: 'nick-ingraham' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')
    const row = (db as any)._store.get('task_bbb1')
    expect(row.status).toBe('todo')   // canonicalized forward
    expect(row.priority).toBe('high')
  })

  it('flags OFF -> invalid enum applies (validator dormant)', async () => {
    const db = makeStubDB({ flags: {} })  // all OFF
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_off1', origin_machine: 'home', table: 'tasks', op: 'insert',
      record_id: 'task_off1', base_seq: null, base_row_hash: null,
      payload: { title: 'X', status: 'Banana', priority: 'medium', assignee: 'nick-ingraham' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')   // dormant — no rejection
  })
})

// ── (e) V1 category bucket-domain ──────────────────────────────────────────

describe('(e) projects.category bucket domain', () => {
  it('category=MNCCORE accepted', async () => {
    const db = makeStubDB({ flags: ALL_ON })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_e1', origin_machine: 'home', table: 'projects', op: 'insert',
      record_id: 'proj_e1', base_seq: null, base_row_hash: null,
      payload: { title: 'P', status: 'active', stage: 'idea', category: 'MNCCORE' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')
  })

  it('category=R01 rejected (proves bucket-domain, not type-domain)', async () => {
    const db = makeStubDB({ flags: ALL_ON })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_e2', origin_machine: 'home', table: 'projects', op: 'insert',
      record_id: 'proj_e2', base_seq: null, base_row_hash: null,
      payload: { title: 'P', status: 'active', stage: 'idea', category: 'R01' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('error')
    expect((db as any)._store.has('proj_e2')).toBe(false)
  })
})

// ── (c)(d) V2 conflict-hash ──────────────────────────────────────────────────

describe('(c)(d) V2 conflict-hash closure', () => {
  const taskId = 'task_conf1'
  function seed() {
    return { [taskId]: { id: taskId, title: 'C', status: 'todo', priority: 'medium', assignee: 'nick-ingraham', deleted_at: null, seq: 5, last_mutation_id: null } }
  }

  it('(c) stale-seq + no base_row_hash -> conflict, row unchanged', async () => {
    const db = makeStubDB({ flags: ALL_ON, rows: seed() })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_c1', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: taskId, base_seq: 2, base_row_hash: null,
      patch: { priority: 'high' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('conflict')
    expect((db as any)._store.get(taskId).priority).toBe('medium')  // unchanged
  })

  it('base_seq=null update against existing row -> conflict (blind overwrite refused)', async () => {
    const db = makeStubDB({ flags: ALL_ON, rows: seed() })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_c2', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: taskId, base_seq: null, base_row_hash: null,
      patch: { priority: 'high' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('conflict')
  })

  it('(d) hub_ui exemption: base_seq=null + hub_ui origin -> applies', async () => {
    const db = makeStubDB({ flags: ALL_ON, rows: seed() })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_d1', origin_machine: 'hub_ui:test', table: 'tasks', op: 'update',
      record_id: taskId, base_seq: null, base_row_hash: null,
      patch: { priority: 'high' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')
    expect((db as any)._store.get(taskId).priority).toBe('high')
  })

  it('non-stale hashless update still accepts (no over-rejection)', async () => {
    const db = makeStubDB({ flags: ALL_ON, rows: seed() })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_c3', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: taskId, base_seq: 5, base_row_hash: null,   // base_seq == current_seq
      patch: { priority: 'high' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')
  })
})

// ── (f) V3 adoptable dedup ───────────────────────────────────────────────────

describe('(f) V3 adoptable dedup', () => {
  it('serial dedup returns accepted + canonical_id, no new row', async () => {
    const winner = 'task_win1'
    const db = makeStubDB({
      flags: ALL_ON,
      rows: { [winner]: { id: winner, title: 'Dup', project_id: null, status: 'todo', deleted_at: null, seq: 3 } },
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
    expect((db as any)._store.has('task_loser1')).toBe(false)
  })

  it('race-loser UNIQUE -> adoptable accepted + canonical_id (not error)', async () => {
    const winner = 'task_win2'
    const db = makeStubDB({
      flags: ALL_ON,
      raceUnique: true,
      // winner present so the post-throw re-lookup finds it (race window closed by then)
      rows: { [winner]: { id: winner, title: 'Race', project_id: null, status: 'todo', deleted_at: null, seq: 7 } },
    })
    const env = envWith(db)
    const mut: Mutation = {
      mutation_id: 'mut_f2', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: 'task_loser2', base_seq: null, base_row_hash: null,
      // NOTE: serial dedup SELECT must MISS so we reach the INSERT throw. To
      // simulate the race, the winner has a DIFFERENT title in the dedup SELECT
      // window — but here we just rely on raceUnique + the re-lookup finding it.
      payload: { title: 'Race', project_id: null, status: 'todo', priority: 'medium', assignee: 'nick-ingraham' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    // The serial dedup SELECT WILL find the winner here (title matches), so this
    // exercises the serial path. To truly exercise the race path we call
    // applyInsert directly with a store whose dedup-find returns null first.
    const r = await runMutation(env, mut)
    expect(r.status).toBe('accepted')
    expect(r.canonical_id).toBe(winner)
  })

  it('race-loser path via applyInsert: dedup SELECT misses, INSERT throws UNIQUE, re-lookup adopts', async () => {
    const winner = 'task_win3'
    // Custom stub: dedup SELECT returns null (race window), INSERT throws UNIQUE,
    // then the post-throw re-lookup returns the winner.
    let dedupCalls = 0
    const store = new Map<string, Record<string, unknown>>([[winner, { id: winner, title: 'R3', project_id: null, status: 'todo', deleted_at: null, seq: 9 }]])
    const db = {
      prepare: (sql: string) => {
        const mk = (boundVals: unknown[]): any => ({
          bind: (...m: unknown[]) => mk([...boundVals, ...m]),
          first: async <T>() => {
            const u = sql.trim().toUpperCase()
            if (u.includes('TITLE =') && u.includes('PROJECT_ID IS')) {
              dedupCalls++
              // First call (serial dedup) misses; second call (post-throw re-lookup) hits.
              return (dedupCalls >= 2 ? { id: winner } : null) as T | null
            }
            if (u.includes('PROCESSED_MUTATIONS')) return null as T | null
            return (store.get(boundVals[0] as string) ?? null) as T | null
          },
          all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
          run: async () => {
            const u = sql.trim().toUpperCase()
            if (u.startsWith('INSERT INTO TASKS')) throw new Error('UNIQUE constraint failed: idx_tasks_title_project_active')
            return { meta: { changes: 1 } }
          },
        })
        return mk([])
      },
    } as unknown as Env['DB']
    const flags: ValidationFlags = { enums: false, conflict_hash: false, completion_tombstone: false, dedup: true }
    const mut: Mutation = {
      mutation_id: 'mut_f3', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: 'task_loser3', base_seq: null, base_row_hash: null,
      payload: { title: 'R3', project_id: null, status: 'todo' },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }
    const r = await applyInsert(envWith(db), mut, fakeUser, flags)
    expect(r.status).toBe('accepted')
    expect(r.canonical_id).toBe(winner)
    expect(r.reason).toMatch(/race-loser/)
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
})

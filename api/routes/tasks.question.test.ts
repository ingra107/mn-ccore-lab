// tasks.question.test.ts — schema-v111 tasks.kind='question' contract at the
// write chokepoint (2026-09-17; PB decision 2026-09-17-question-task-kind).
//
// A question is a task row. Three JSON columns carry the ask, the answer and
// the Telegram handle. Every task write passes applyInsert / applyPatch in
// mutations.ts, and both call questionRowError() on the EFFECTIVE row
// (api/lib/task-question.ts). This file exercises the REAL functions with a
// store-backed D1 stub (copied from tasks.kind.test.ts), no vi.mock:
//
//   1. done / deleted with a NULL answer is refused (question_unanswered) —
//      through the FULL applyMutation path (a status-only patch carries no new
//      column, so processOne's TABLE_FIELDS whitelist is not in the way).
//   2. an answer patch lands, as text; an OBJECT answer is serialized.
//   3. a malformed answer is refused (question_answer_invalid).
//   4. an insert with kind='question' and no spec is refused
//      (question_spec_missing) — through the FULL applyMutation path too.
//   5. GET /api/tasks?kind=question filters; an unlisted kind is a 400.
//
// The answer/telegram tests call applyUpdate directly: until the pb-schema
// regen lands the three columns in TABLE_FIELDS.tasks, processOne rejects
// them one gate earlier as `unknown fields for tasks`. applyUpdate IS the
// chokepoint under test; the whitelist is a different gate with its own
// contract test (field-authority.contract.test.ts).

import { describe, it, expect } from 'vitest'
import { nowInstant } from '../lib/time'
import { applyInsert, applyUpdate, applyMutation } from './mutations'
import { handleGetTasks } from './tasks'
import { normalizeQuestionJsonFields, questionRowError } from '../lib/task-question'
import type { AuthUser, Env } from '../helpers'

// ── store-backed D1 stub (tasks.kind.test.ts shape) ─────────────────────────

function makeStubDB() {
  const store: Map<string, Record<string, unknown>> = new Map()
  const mutations: Map<string, Record<string, unknown>> = new Map()
  const updateCalls: { sql: string; bindings: unknown[] }[] = []

  function makeStmt(sql: string, boundVals: unknown[]): ReturnType<typeof makeStmt> {
    const self = {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T>() => {
        const upper = sql.trim().toUpperCase()
        if (upper.includes('PROCESSED_MUTATIONS')) {
          return (mutations.get(boundVals[0] as string) ?? null) as T | null
        }
        // Dedup pre-checks bind a title / meeting id, never a task id → miss.
        if (/^SELECT\s+ID\s+FROM\s+TASKS/.test(upper)) return null as T | null
        return (store.get(boundVals[0] as string) ?? null) as T | null
      },
      all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
      run: async () => {
        const upper = sql.trim().toUpperCase()
        if (upper.startsWith('UPDATE TASKS')) {
          updateCalls.push({ sql, bindings: [...boundVals] })
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
        if (upper.startsWith('INSERT INTO TASKS')) {
          // cols list is in the SQL; values are the bindings in the same order
          // (extra datetime('now') literals sit AFTER the placeholders).
          const colsMatch = sql.match(/INSERT INTO tasks \(([^)]+)\)/)
          if (colsMatch) {
            const cols = colsMatch[1].split(',').map((s) => s.trim())
            const row: Record<string, unknown> = {}
            cols.forEach((c, i) => { if (i < boundVals.length) row[c] = boundVals[i] })
            store.set(row.id as string, { seq: 1, deleted_at: null, ...row })
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
    _updateCalls: updateCalls,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async () => [],
  }
}

const NICK: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick' }

const SPEC = JSON.stringify({
  v: 1, kind: 'meeting_match', prompt: 'Which meeting was this?',
  choices: [{ key: 'c1', label: 'Pulmonary HSR Group Meeting' }, { key: 'other', label: 'Other' }],
  allow_text: true, rec: 'c1',
})

function seedQuestion(db: ReturnType<typeof makeStubDB>, id: string, extra: Record<string, unknown> = {}) {
  db._store.set(id, {
    id, title: 'Which meeting was this? -- 2026-09-17 12:00 (45 min)',
    kind: 'question', status: 'todo', priority: 'medium', assignee: 'nick-ingraham',
    source: 'meeting_match', meeting_id: 'mtg_20260917T170406-zoom',
    question_spec_json: SPEC, question_answer_json: null, question_telegram_json: null,
    seq: 1, deleted_at: null, project_id: null, completed: 0, completed_at: null,
    ...extra,
  })
}

const ANSWER = { v: 1, choice: 'c1', via: 'hub', at: '2026-09-17T18:00:00Z' }

// ── 1. answered is not done ─────────────────────────────────────────────────

describe('a question cannot close unanswered (question_unanswered)', () => {
  it('status=done with a NULL answer is refused through the full applyMutation path', async () => {
    const db = makeStubDB()
    const id = 'task_01question_unanswered_0001'
    seedQuestion(db, id)
    const env = { DB: db } as unknown as Env

    const r = await applyMutation(env, {
      table: 'tasks', record_id: id, op: 'update',
      patch: { status: 'done', completed: 1, completed_at: nowInstant() },
      route: 'test', user: NICK,
    })
    expect(r.status).toBe('error')
    expect(r.reason).toMatch(/^apply error: question_unanswered:/)
    // The row did not move.
    expect(db._store.get(id)?.status).toBe('todo')
    expect(db._updateCalls).toHaveLength(0)
  })

  it('status=deleted by patch with a NULL answer is refused too', async () => {
    const db = makeStubDB()
    const id = 'task_01question_unanswered_0002'
    seedQuestion(db, id)
    const env = { DB: db } as unknown as Env

    await expect(applyUpdate(env, {
      mutation_id: 'mut_q_del_0002', origin_machine: 'test', table: 'tasks', op: 'update',
      record_id: id, base_seq: 1, base_row_hash: null,
      patch: { status: 'deleted' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)).rejects.toThrow(/^question_unanswered:/)
    expect(db._store.get(id)?.status).toBe('todo')
  })

  it('status=done WITH an answer already stored is accepted (the consumer closes it)', async () => {
    const db = makeStubDB()
    const id = 'task_01question_answered_done_03'
    seedQuestion(db, id, { question_answer_json: JSON.stringify(ANSWER) })
    const env = { DB: db } as unknown as Env

    const r = await applyMutation(env, {
      table: 'tasks', record_id: id, op: 'update',
      patch: { status: 'done', completed: 1, completed_at: nowInstant() },
      route: 'test', user: NICK,
    })
    expect(r.status).toBe('accepted')
    expect(db._store.get(id)?.status).toBe('done')
  })

  it('an ordinary task still closes with no answer column set (guard is kind-scoped)', async () => {
    const db = makeStubDB()
    const id = 'task_01ordinary_done_0004'
    seedQuestion(db, id, { kind: 'task', source: 'manual', question_spec_json: null })
    const env = { DB: db } as unknown as Env

    const r = await applyMutation(env, {
      table: 'tasks', record_id: id, op: 'update',
      patch: { status: 'done', completed: 1, completed_at: nowInstant() },
      route: 'test', user: NICK,
    })
    expect(r.status).toBe('accepted')
    expect(db._store.get(id)?.status).toBe('done')
  })
})

// ── 2. the answer lands ─────────────────────────────────────────────────────

describe('an answer patch lands (the only answer store)', () => {
  it('a JSON-text answer is stored byte-for-byte', async () => {
    const db = makeStubDB()
    const id = 'task_01question_answer_0005'
    seedQuestion(db, id)
    const env = { DB: db } as unknown as Env
    const text = JSON.stringify(ANSWER)

    const r = await applyUpdate(env, {
      mutation_id: 'mut_q_ans_0005', origin_machine: 'work', table: 'tasks', op: 'update',
      record_id: id, base_seq: 1, base_row_hash: null,
      patch: { question_answer_json: text }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    expect(db._store.get(id)?.question_answer_json).toBe(text)
    // status untouched: answered != done
    expect(db._store.get(id)?.status).toBe('todo')
  })

  it('an OBJECT answer (Hub-UI shape) is serialized to text before binding', async () => {
    const db = makeStubDB()
    const id = 'task_01question_answer_obj_006'
    seedQuestion(db, id)
    const env = { DB: db } as unknown as Env

    const r = await applyUpdate(env, {
      mutation_id: 'mut_q_ans_0006', origin_machine: 'hub_ui:test', table: 'tasks', op: 'update',
      record_id: id, base_seq: null, base_row_hash: null,
      patch: { question_answer_json: ANSWER }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    const stored = db._store.get(id)?.question_answer_json
    expect(typeof stored).toBe('string')
    expect(JSON.parse(stored as string)).toEqual(ANSWER)
    // No object reached D1.
    for (const call of db._updateCalls) {
      for (const b of call.bindings) expect(typeof b === 'object' && b !== null).toBe(false)
    }
  })

  it('undo (answer -> NULL) on an open question is accepted', async () => {
    const db = makeStubDB()
    const id = 'task_01question_undo_0007'
    seedQuestion(db, id, { question_answer_json: JSON.stringify(ANSWER) })
    const env = { DB: db } as unknown as Env

    const r = await applyUpdate(env, {
      mutation_id: 'mut_q_undo_0007', origin_machine: 'work', table: 'tasks', op: 'update',
      record_id: id, base_seq: 1, base_row_hash: null,
      patch: { question_answer_json: null }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    expect(db._store.get(id)?.question_answer_json).toBeNull()
  })

  it('a telegram handle lands and a non-object handle is refused', async () => {
    const db = makeStubDB()
    const id = 'task_01question_tg_0008'
    seedQuestion(db, id)
    const env = { DB: db } as unknown as Env
    const handle = JSON.stringify({ chat_id: 1, message_id: 2, rendered_at: '2026-09-17T18:00:00Z' })

    const ok = await applyUpdate(env, {
      mutation_id: 'mut_q_tg_0008a', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: id, base_seq: 1, base_row_hash: null,
      patch: { question_telegram_json: handle }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(ok.status).toBe('accepted')
    expect(db._store.get(id)?.question_telegram_json).toBe(handle)

    await expect(applyUpdate(env, {
      mutation_id: 'mut_q_tg_0008b', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: id, base_seq: 1, base_row_hash: null,
      patch: { question_telegram_json: '[1,2]' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)).rejects.toThrow(/^question_telegram_invalid:/)
  })
})

// ── 3. a bad answer is refused ──────────────────────────────────────────────

describe('a malformed answer is refused (question_answer_invalid)', () => {
  const bad: Array<[string, unknown]> = [
    ['not JSON', '{nope'],
    ['a JSON array', '[1]'],
    ['no choice', JSON.stringify({ v: 1, via: 'hub' })],
    ['empty choice', JSON.stringify({ choice: '  ' })],
    ['other with no text', JSON.stringify({ choice: 'other', via: 'telegram' })],
    ['other with blank text', JSON.stringify({ choice: 'other', text: '' })],
  ]
  for (const [label, value] of bad) {
    it(`refuses ${label}`, async () => {
      const db = makeStubDB()
      const id = 'task_01question_badans_0009'
      seedQuestion(db, id)
      const env = { DB: db } as unknown as Env

      await expect(applyUpdate(env, {
        mutation_id: 'mut_q_bad_0009', origin_machine: 'work', table: 'tasks', op: 'update',
        record_id: id, base_seq: 1, base_row_hash: null,
        patch: { question_answer_json: value }, client_ts: nowInstant(), issued_at: nowInstant(),
      }, NICK)).rejects.toThrow(/^question_answer_invalid:/)
      expect(db._store.get(id)?.question_answer_json).toBeNull()
    })
  }

  it("accepts choice='other' with text", async () => {
    const db = makeStubDB()
    const id = 'task_01question_other_0010'
    seedQuestion(db, id)
    const env = { DB: db } as unknown as Env
    const text = JSON.stringify({ v: 1, choice: 'other', text: 'It was the HSR meeting', via: 'telegram', at: nowInstant() })

    const r = await applyUpdate(env, {
      mutation_id: 'mut_q_other_0010', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: id, base_seq: 1, base_row_hash: null,
      patch: { question_answer_json: text }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    expect(db._store.get(id)?.question_answer_json).toBe(text)
  })
})

// ── 4. an insert needs its spec ─────────────────────────────────────────────

describe('a kind=question insert requires question_spec_json (question_spec_missing)', () => {
  const basePayload = {
    title: 'Which meeting was this? -- 2026-09-17 12:00 (45 min)',
    description: 'Which meeting was this?', assignee: 'nick-ingraham', assigned_by: 'pb',
    priority: 'medium', status: 'todo', source: 'meeting_match', meeting_id: 'mtg_x',
    completed: 0, completed_at: null, project_id: null,
  }

  it('is refused through the full applyMutation path when the spec is absent', async () => {
    const db = makeStubDB()
    const env = { DB: db } as unknown as Env
    const r = await applyMutation(env, {
      table: 'tasks', record_id: 'task_01question_nospec_0011', op: 'insert',
      payload: { ...basePayload, kind: 'question' },
      route: 'test', user: NICK,
    })
    expect(r.status).toBe('error')
    expect(r.reason).toMatch(/^question_spec_missing:/)
    expect(db._store.has('task_01question_nospec_0011')).toBe(false)
  })

  it('is refused when the spec is explicitly null', async () => {
    const db = makeStubDB()
    const env = { DB: db } as unknown as Env
    const r = await applyInsert(env, {
      mutation_id: 'mut_q_ins_0012', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: 'task_01question_nullspec_0012', base_seq: null, base_row_hash: null,
      payload: { ...basePayload, kind: 'question', question_spec_json: null },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('error')
    expect(r.reason).toMatch(/^question_spec_missing:/)
  })

  it('inserts with a spec; an OBJECT spec is serialized', async () => {
    const db = makeStubDB()
    const env = { DB: db } as unknown as Env
    const id = 'task_01question_withspec_0013'
    const r = await applyInsert(env, {
      mutation_id: 'mut_q_ins_0013', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: id, base_seq: null, base_row_hash: null,
      payload: { ...basePayload, kind: 'question', question_spec_json: JSON.parse(SPEC) },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    const stored = db._store.get(id)
    expect(stored?.kind).toBe('question')
    expect(typeof stored?.question_spec_json).toBe('string')
    expect(JSON.parse(stored?.question_spec_json as string)).toEqual(JSON.parse(SPEC))
  })

  it('a question cannot be born done with no answer', async () => {
    const db = makeStubDB()
    const env = { DB: db } as unknown as Env
    const r = await applyInsert(env, {
      mutation_id: 'mut_q_ins_0014', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: 'task_01question_borndone_0014', base_seq: null, base_row_hash: null,
      payload: { ...basePayload, kind: 'question', question_spec_json: SPEC, status: 'done', completed: 1, completed_at: nowInstant() },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('error')
    expect(r.reason).toMatch(/^question_unanswered:/)
  })

  it('an update that turns a task INTO a question needs the spec in the same patch', async () => {
    const db = makeStubDB()
    const id = 'task_01task_to_question_0015'
    seedQuestion(db, id, { kind: 'task', source: 'manual', question_spec_json: null })
    const env = { DB: db } as unknown as Env

    await expect(applyUpdate(env, {
      mutation_id: 'mut_q_kind_0015', origin_machine: 'work', table: 'tasks', op: 'update',
      record_id: id, base_seq: 1, base_row_hash: null,
      patch: { kind: 'question' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)).rejects.toThrow(/^question_spec_missing:/)
    expect(db._store.get(id)?.kind).toBe('task')
  })
})

// ── 5. GET /api/tasks?kind= ─────────────────────────────────────────────────

describe('GET /api/tasks?kind=question', () => {
  function makeQueryCaptureDB() {
    const calls: { sql: string; params: unknown[] }[] = []
    const stmt = (sql: string, params: unknown[]) => ({
      bind: (...p: unknown[]) => stmt(sql, [...params, ...p]),
      first: async () => null,
      all: async () => { calls.push({ sql, params }); return { results: [], success: true, meta: {} } },
      run: async () => ({ meta: { changes: 0 } }),
    })
    return { _calls: calls, prepare: (sql: string) => stmt(sql, []), batch: async () => [] }
  }

  it('adds AND t.kind = ? bound to the requested kind', async () => {
    const db = makeQueryCaptureDB()
    const env = { DB: db } as unknown as Env
    const res = await handleGetTasks(new URL('https://x/api/tasks?kind=question&assignee=nick-ingraham'), env, true)
    expect(res.status).toBe(200)
    expect(db._calls).toHaveLength(1)
    expect(db._calls[0].sql).toContain(' AND t.kind = ?')
    expect(db._calls[0].params).toContain('question')
    expect(db._calls[0].params).toContain('nick-ingraham')
  })

  it('omits the kind clause when the param is absent', async () => {
    const db = makeQueryCaptureDB()
    const env = { DB: db } as unknown as Env
    await handleGetTasks(new URL('https://x/api/tasks'), env, true)
    // t.kind is in the SELECT projection either way; the FILTER must be absent.
    expect(db._calls[0].sql).not.toContain(' AND t.kind = ?')
  })

  it('an unlisted kind is a 400 naming the vocabulary, not an empty list', async () => {
    const db = makeQueryCaptureDB()
    const env = { DB: db } as unknown as Env
    const res = await handleGetTasks(new URL('https://x/api/tasks?kind=decision'), env, true)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/Invalid kind "decision"\. Must be one of task\/milestone\/question/)
    expect(db._calls).toHaveLength(0)
  })
})

// ── the pure contract, for completeness ─────────────────────────────────────

describe('task-question pure helpers', () => {
  it('normalizeQuestionJsonFields leaves strings and nulls untouched, returns the same object when nothing changed', () => {
    const f = { question_answer_json: '{"choice":"c1"}', question_spec_json: null, title: 'x' }
    expect(normalizeQuestionJsonFields(f)).toBe(f)
    const g = normalizeQuestionJsonFields({ question_answer_json: { choice: 'c1' } })
    expect(g.question_answer_json).toBe('{"choice":"c1"}')
  })

  it('questionRowError treats a missing kind as task', () => {
    expect(questionRowError({ status: 'done' })).toBeNull()
    expect(questionRowError({ kind: 'question', question_spec_json: SPEC, status: 'todo' })).toBeNull()
    expect(questionRowError({ kind: 'question', question_spec_json: '{"a":1', status: 'todo' })).toMatch(/^question_spec_invalid:/)
  })
})

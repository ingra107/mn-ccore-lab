// tasks.question.test.ts — schema-v111 tasks.kind='question' contract at the
// write chokepoint (2026-09-17; PB decision 2026-09-17-question-task-kind).
//
// A question is a task row. Three JSON columns carry the ask, the answer and
// the Telegram handle. Every task write passes applyInsert / applyPatch in
// mutations.ts, and both call questionRowError() on the EFFECTIVE row
// (api/lib/task-question.ts). This file exercises the REAL functions on the
// migration-chain database (prodSchemaDb + d1Adapter, #8875), no vi.mock:
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
import { normalizeQuestionJsonFields, questionRowError, questionConsumerCloseError } from '../lib/task-question'
import type { AuthUser, Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

// ── fixture: the migration-chain database (#8875) ──────────────────────────
//
// Runs on api/test-support/prod-schema-db.ts: the real tasks table with its
// v53 seq triggers, the completion-triad guard triggers and the
// processed_mutations receipt (original_response_json TEXT NOT NULL). The old
// stub parsed SET clauses and treated the receipt INSERT as a no-op; every
// write assertion below reads the STORED row and the receipt back.

type Db = ReturnType<typeof prodSchemaDb>

function makeDB() {
  const db = prodSchemaDb()
  const writes: { sql: string; vals: unknown[] }[] = []
  const adapter = d1Adapter(db, {
    onExec: (sql, vals) => { if (/^\s*(UPDATE|INSERT)\s+(INTO\s+)?tasks\b/i.test(sql)) writes.push({ sql, vals: [...vals] }) },
  })
  return { db, writes, env: { DB: adapter } as unknown as Env }
}

const rowOf = (db: Db, id: string) =>
  db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined

/** The seq the v53 trigger gave a seeded row: the base a PB writer holds. */
const seqOf = (db: Db, id: string) => rowOf(db, id)!.seq as number

/**
 * The processed_mutations receipt a landed (or recorded-refused) mutation
 * leaves: a real row whose original_response_json is non-NULL text naming the
 * same outcome. The old stub never stored this column at all.
 */
function expectReceipt(db: Db, mutationId: string, outcome: string, recordId: string) {
  const rc = receiptOf(db, mutationId)
  expect(rc).toBeDefined()
  expect(rc!.outcome).toBe(outcome)
  expect(rc!.table_name).toBe('tasks')
  expect(rc!.record_id).toBe(recordId)
  expect(typeof rc!.original_response_json).toBe('string')
  expect((JSON.parse(rc!.original_response_json) as { status: string }).status).toBe(outcome)
}

const NICK: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' }

const SPEC = JSON.stringify({
  v: 1, kind: 'meeting_match', prompt: 'Which meeting was this?',
  choices: [{ key: 'c1', label: 'Pulmonary HSR Group Meeting' }, { key: 'other', label: 'Other' }],
  allow_text: true, rec: 'c1',
})

function seedQuestion(db: Db, id: string, extra: Record<string, unknown> = {}) {
  insertRow(db, 'tasks', {
    id, title: 'Which meeting was this? -- 2026-09-17 12:00 (45 min)',
    kind: 'question', status: 'todo', priority: 'medium', assignee: 'nick-ingraham',
    source: 'meeting_match', meeting_id: 'mtg_20260917T170406-zoom',
    question_spec_json: SPEC, question_answer_json: null, question_telegram_json: null,
    deleted_at: null, project_id: null, completed: 0, completed_at: null,
    ...extra,
  })
}

const ANSWER = { v: 1, choice: 'c1', via: 'hub', at: '2026-09-17T18:00:00Z' }

// ── 1. answered is not done ─────────────────────────────────────────────────

describe('a question cannot close unanswered (question_unanswered)', () => {
  it('status=done with a NULL answer is refused through the full applyMutation path', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_unanswered_0001'
    seedQuestion(db, id)

    const r = await applyMutation(env, {
      table: 'tasks', record_id: id, op: 'update',
      patch: { status: 'done', completed: 1, completed_at: nowInstant() },
      route: 'test', user: NICK,
    })
    expect(r.status).toBe('error')
    expectReceipt(db, r.mutation_id, 'error', id)
    expect(r.reason).toMatch(/^apply error: question_unanswered:/)
    // The row did not move.
    expect(rowOf(db, id)?.status).toBe('todo')
    expect(writes).toHaveLength(0)
    // A refused mutation leaves no task write and no landed receipt row.
    expect(rowOf(db, id)?.completed).toBe(0)
  })

  it('status=deleted by patch with a NULL answer is refused too', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_unanswered_0002'
    seedQuestion(db, id)

    await expect(applyUpdate(env, {
      mutation_id: 'mut_q_del_0002', origin_machine: 'test', table: 'tasks', op: 'update',
      record_id: id, base_seq: seqOf(db, id), base_row_hash: null,
      patch: { status: 'deleted' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)).rejects.toThrow(/^question_unanswered:/)
    expect(rowOf(db, id)?.status).toBe('todo')
    expect(rowOf(db, id)?.deleted_at).toBeNull()
    expect(receiptOf(db, 'mut_q_del_0002')).toBeUndefined()
  })

  // #8842 R4 (2026-09-23): this case USED to assert that a Hub-UI close of an
  // answered question is accepted. That encoded the old design, in which the
  // Hub could close a question and PB's question_state then read it as
  // `consumed`, so the approved build never ran. Changed deliberately: a
  // Hub-UI (hub_ui:) close is now refused; the PB consumer closes it.
  it('status=done from the Hub UI on an ANSWERED question is refused (the PB consumer closes it)', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_answered_done_03'
    seedQuestion(db, id, { question_answer_json: JSON.stringify(ANSWER) })

    const r = await applyMutation(env, {
      table: 'tasks', record_id: id, op: 'update',
      patch: { status: 'done', completed: 1, completed_at: nowInstant() },
      route: 'test', user: NICK,
    })
    expect(r.status).toBe('error')
    expectReceipt(db, r.mutation_id, 'error', id)
    expect(r.reason).toMatch(/^apply error: question_consumer_close_only:/)
    expect(rowOf(db, id)?.status).toBe('todo')
  })

  it('status=done from PB (the consumer) on an answered question is accepted', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_answered_done_pb'
    seedQuestion(db, id, { question_answer_json: JSON.stringify(ANSWER) })

    const r = await applyUpdate(env, {
      mutation_id: 'mut_q_pbclose_0001', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: id, base_seq: seqOf(db, id), base_row_hash: null,
      patch: { status: 'done', completed: 1, completed_at: nowInstant() }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    expectReceipt(db, r.mutation_id, 'accepted', id)
    expect(rowOf(db, id)?.status).toBe('done')
    expect(rowOf(db, id)?.completed).toBe(1)
  })

  it('the Hub UI may still retire a question (status=deleted on an answered question)', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_hub_retire_01'
    seedQuestion(db, id, { question_answer_json: JSON.stringify(ANSWER) })

    const r = await applyMutation(env, {
      table: 'tasks', record_id: id, op: 'update',
      patch: { status: 'deleted' },
      route: 'test', user: NICK,
    })
    expect(r.status).toBe('accepted')
    expectReceipt(db, r.mutation_id, 'accepted', id)
    expect(rowOf(db, id)?.status).toBe('deleted')
  })

  it('an ordinary task still closes with no answer column set (guard is kind-scoped)', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01ordinary_done_0004'
    seedQuestion(db, id, { kind: 'task', source: 'manual', question_spec_json: null })

    const r = await applyMutation(env, {
      table: 'tasks', record_id: id, op: 'update',
      patch: { status: 'done', completed: 1, completed_at: nowInstant() },
      route: 'test', user: NICK,
    })
    expect(r.status).toBe('accepted')
    expectReceipt(db, r.mutation_id, 'accepted', id)
    expect(rowOf(db, id)?.status).toBe('done')
  })
})

// ── 2. the answer lands ─────────────────────────────────────────────────────

describe('an answer patch lands (the only answer store)', () => {
  it('a JSON-text answer is stored byte-for-byte', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_answer_0005'
    seedQuestion(db, id)
    const text = JSON.stringify(ANSWER)

    const r = await applyUpdate(env, {
      mutation_id: 'mut_q_ans_0005', origin_machine: 'work', table: 'tasks', op: 'update',
      record_id: id, base_seq: seqOf(db, id), base_row_hash: null,
      patch: { question_answer_json: text }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    expectReceipt(db, r.mutation_id, 'accepted', id)
    expect(rowOf(db, id)?.question_answer_json).toBe(text)
    // status untouched: answered != done
    expect(rowOf(db, id)?.status).toBe('todo')
  })

  it('an OBJECT answer (Hub-UI shape) is serialized to text before binding', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_answer_obj_006'
    seedQuestion(db, id)

    const r = await applyUpdate(env, {
      mutation_id: 'mut_q_ans_0006', origin_machine: 'hub_ui:test', table: 'tasks', op: 'update',
      record_id: id, base_seq: null, base_row_hash: null,
      patch: { question_answer_json: ANSWER }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    expectReceipt(db, r.mutation_id, 'accepted', id)
    const stored = rowOf(db, id)?.question_answer_json
    expect(typeof stored).toBe('string')
    expect(JSON.parse(stored as string)).toEqual(ANSWER)
    // No object reached D1.
    expect(writes.length).toBeGreaterThan(0)
    for (const call of writes) {
      for (const b of call.vals) expect(typeof b === 'object' && b !== null).toBe(false)
    }
  })

  it('undo (answer -> NULL) on an open question is accepted', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_undo_0007'
    seedQuestion(db, id, { question_answer_json: JSON.stringify(ANSWER) })

    const r = await applyUpdate(env, {
      mutation_id: 'mut_q_undo_0007', origin_machine: 'work', table: 'tasks', op: 'update',
      record_id: id, base_seq: seqOf(db, id), base_row_hash: null,
      patch: { question_answer_json: null }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    expectReceipt(db, r.mutation_id, 'accepted', id)
    expect(rowOf(db, id)?.question_answer_json).toBeNull()
  })

  it('a telegram handle lands and a non-object handle is refused', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_tg_0008'
    seedQuestion(db, id)
    const handle = JSON.stringify({ chat_id: 1, message_id: 2, rendered_at: '2026-09-17T18:00:00Z' })

    const ok = await applyUpdate(env, {
      mutation_id: 'mut_q_tg_0008a', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: id, base_seq: seqOf(db, id), base_row_hash: null,
      patch: { question_telegram_json: handle }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(ok.status).toBe('accepted')
    expectReceipt(db, ok.mutation_id, 'accepted', id)
    expect(rowOf(db, id)?.question_telegram_json).toBe(handle)

    await expect(applyUpdate(env, {
      mutation_id: 'mut_q_tg_0008b', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: id, base_seq: seqOf(db, id), base_row_hash: null,
      patch: { question_telegram_json: '[1,2]' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)).rejects.toThrow(/^question_telegram_invalid:/)
    expect(rowOf(db, id)?.question_telegram_json).toBe(handle)
    expect(receiptOf(db, 'mut_q_tg_0008b')).toBeUndefined()
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
      const { db, writes, env } = makeDB()
      const id = 'task_01question_badans_0009'
      seedQuestion(db, id)
  
      await expect(applyUpdate(env, {
        mutation_id: 'mut_q_bad_0009', origin_machine: 'work', table: 'tasks', op: 'update',
        record_id: id, base_seq: seqOf(db, id), base_row_hash: null,
        patch: { question_answer_json: value }, client_ts: nowInstant(), issued_at: nowInstant(),
      }, NICK)).rejects.toThrow(/^question_answer_invalid:/)
      expect(rowOf(db, id)?.question_answer_json).toBeNull()
      expect(receiptOf(db, 'mut_q_bad_0009')).toBeUndefined()
    })
  }

  it("accepts choice='other' with text", async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_other_0010'
    seedQuestion(db, id)
    const text = JSON.stringify({ v: 1, choice: 'other', text: 'It was the HSR meeting', via: 'telegram', at: nowInstant() })

    const r = await applyUpdate(env, {
      mutation_id: 'mut_q_other_0010', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: id, base_seq: seqOf(db, id), base_row_hash: null,
      patch: { question_answer_json: text }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    expectReceipt(db, r.mutation_id, 'accepted', id)
    expect(rowOf(db, id)?.question_answer_json).toBe(text)
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
    const { db, writes, env } = makeDB()
    const r = await applyMutation(env, {
      table: 'tasks', record_id: 'task_01question_nospec_0011', op: 'insert',
      payload: { ...basePayload, kind: 'question' },
      route: 'test', user: NICK,
    })
    expect(r.status).toBe('error')
    expectReceipt(db, r.mutation_id, 'error', 'task_01question_nospec_0011')
    expect(r.reason).toMatch(/^question_spec_missing:/)
    expect(rowOf(db, 'task_01question_nospec_0011')).toBeUndefined()
    expect(writes).toHaveLength(0)
  })

  it('is refused when the spec is explicitly null', async () => {
    const { db, writes, env } = makeDB()
    const r = await applyInsert(env, {
      mutation_id: 'mut_q_ins_0012', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: 'task_01question_nullspec_0012', base_seq: null, base_row_hash: null,
      payload: { ...basePayload, kind: 'question', question_spec_json: null },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('error')
    // applyInsert alone records no receipt (processOne does); a refusal writes no row either.
    expect(receiptOf(db, r.mutation_id)).toBeUndefined()
    expect(rowOf(db, 'task_01question_nullspec_0012')).toBeUndefined()
    expect(r.reason).toMatch(/^question_spec_missing:/)
  })

  it('inserts with a spec; an OBJECT spec is serialized', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_withspec_0013'
    const r = await applyInsert(env, {
      mutation_id: 'mut_q_ins_0013', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: id, base_seq: null, base_row_hash: null,
      payload: { ...basePayload, kind: 'question', question_spec_json: JSON.parse(SPEC) },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    const stored = rowOf(db, id)
    expect(stored?.kind).toBe('question')
    expect(typeof stored?.question_spec_json).toBe('string')
    expect(JSON.parse(stored?.question_spec_json as string)).toEqual(JSON.parse(SPEC))
  })

  it('a question cannot be born done with no answer', async () => {
    const { db, writes, env } = makeDB()
    const r = await applyInsert(env, {
      mutation_id: 'mut_q_ins_0014', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: 'task_01question_borndone_0014', base_seq: null, base_row_hash: null,
      payload: { ...basePayload, kind: 'question', question_spec_json: SPEC, status: 'done', completed: 1, completed_at: nowInstant() },
      client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('error')
    expect(receiptOf(db, r.mutation_id)).toBeUndefined()
    expect(rowOf(db, 'task_01question_borndone_0014')).toBeUndefined()
    expect(r.reason).toMatch(/^question_unanswered:/)
  })

  it('an update that turns a task INTO a question needs the spec in the same patch', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01task_to_question_0015'
    seedQuestion(db, id, { kind: 'task', source: 'manual', question_spec_json: null })

    await expect(applyUpdate(env, {
      mutation_id: 'mut_q_kind_0015', origin_machine: 'work', table: 'tasks', op: 'update',
      record_id: id, base_seq: seqOf(db, id), base_row_hash: null,
      patch: { kind: 'question' }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)).rejects.toThrow(/^question_spec_missing:/)
    expect(rowOf(db, id)?.kind).toBe('task')
    expect(receiptOf(db, 'mut_q_kind_0015')).toBeUndefined()
  })
})

// ── 5. GET /api/tasks?kind= ─────────────────────────────────────────────────

describe('GET /api/tasks?kind=question', () => {
  // The read runs on the real tasks table; onExec observes the SQL the
  // handler sends, and the seeded rows prove the filter's EFFECT too.
  function makeQueryCaptureDB() {
    const db = prodSchemaDb()
    const calls: { sql: string; params: unknown[] }[] = []
    const adapter = d1Adapter(db, {
      onExec: (sql, params) => { if (/\bFROM\s+tasks\s+t\b/i.test(sql)) calls.push({ sql, params: [...params] }) },
    })
    seedQuestion(db, 'task_01get_question_0001')
    // A distinct title: the real idx_tasks_title_norm_nonrecurring_active
    // unique index refuses two active rows with one normalized title.
    seedQuestion(db, 'task_01get_ordinary_0001', { kind: 'task', title: 'Ordinary task', source: 'manual', question_spec_json: null })
    return { _calls: calls, db, env: { DB: adapter } as unknown as Env }
  }

  it('adds AND t.kind = ? bound to the requested kind', async () => {
    const db = makeQueryCaptureDB()
    const env = db.env
    const res = await handleGetTasks(new URL('https://x/api/tasks?kind=question&assignee=nick-ingraham'), env, true)
    expect(res.status).toBe(200)
    expect(db._calls).toHaveLength(1)
    expect(db._calls[0].sql).toContain(' AND t.kind = ?')
    expect(db._calls[0].params).toContain('question')
    expect(db._calls[0].params).toContain('nick-ingraham')
    // The filter's effect on real rows: only the question comes back.
    const body = await res.json() as { data: Array<{ id: string; kind: string }> }
    expect(body.data.map((t) => t.id)).toEqual(['task_01get_question_0001'])
  })

  it('omits the kind clause when the param is absent', async () => {
    const db = makeQueryCaptureDB()
    const env = db.env
    const res = await handleGetTasks(new URL('https://x/api/tasks'), env, true)
    // t.kind is in the SELECT projection either way; the FILTER must be absent.
    expect(db._calls[0].sql).not.toContain(' AND t.kind = ?')
    const body = await res.json() as { data: Array<{ id: string }> }
    expect(body.data.map((t) => t.id).sort()).toEqual(['task_01get_ordinary_0001', 'task_01get_question_0001'])
  })

  it('an unlisted kind is a 400 naming the vocabulary, not an empty list', async () => {
    const db = makeQueryCaptureDB()
    const env = db.env
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

describe('#8842 R4: the refusal names the retire path that works', () => {
  it('op=delete retires an UNANSWERED question from the Hub UI, as the refusal message says', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01question_hub_opdelete_1'
    seedQuestion(db, id)
    const r = await applyMutation(env, { table: 'tasks', record_id: id, op: 'delete', route: 'test', user: NICK })
    expect(r.status).toBe('accepted')
    expectReceipt(db, r.mutation_id, 'accepted', id)
    expect(questionConsumerCloseError({ kind: 'question', status: 'todo' }, { kind: 'question', status: 'done' }, 'hub_ui:x'))
      .toMatch(/delete the task \(op=delete\)/)
  })
})

// ── PB #2219: an Approve: approval is a question, so a Hub tap cannot close it ──
//
// PB stopped minting task-shaped `Approve:` rows (2026-10-05): every approval,
// plan or runbook ("Approve: MECHANIC ..."), is a kind='question' row, and PB's
// evidence gate (scripts/db/approve_completion.py) runs only on PB's own close.
// The ONLY thing that keeps a Hub Done tap from closing an approval with no
// evidence and no build is questionConsumerCloseError. This pins that contract
// for the approval shape PB depends on; loosening the close rule for questions
// breaks #2219 on the PB side, not only #8842.
describe('PB #2219: a Hub tap cannot close an Approve: question', () => {
  const APPROVAL_SPEC = JSON.stringify({
    v: 1, kind: 'fix_approval', prompt: 'sync-push failure -- 401 since 06:00',
    choices: [{ key: 'yes', label: 'Build it' }, { key: 'no', label: 'Not now' }, { key: 'other', label: 'Other' }],
    allow_text: true, rec: 'yes',
  })
  const seedApproval = (db: Db, id: string, extra: Record<string, unknown> = {}) =>
    seedQuestion(db, id, {
      title: 'Approve: MECHANIC sync-push failure -- 401 since 06:00',
      source: 'failure-triage', meeting_id: null, question_spec_json: APPROVAL_SPEC,
      ...extra,
    })
  const YES_ANSWER = { v: 1, choice: 'yes', via: 'hub', at: '2026-10-05T18:00:00Z' }

  it('a Hub-UI done on an ANSWERED runbook approval is refused (question_consumer_close_only)', async () => {
    const { db, writes, env } = makeDB()
    const id = 'task_01approve_runbook_hubtap1'
    seedApproval(db, id, { question_answer_json: JSON.stringify(YES_ANSWER) })
    const r = await applyMutation(env, {
      table: 'tasks', record_id: id, op: 'update',
      patch: { status: 'done', completed: 1, completed_at: nowInstant() },
      route: 'test', user: NICK,
    })
    expect(r.status).toBe('error')
    expect(r.reason).toMatch(/^apply error: question_consumer_close_only:/)
    expect(rowOf(db, id)?.status).toBe('todo')
    expect(writes).toHaveLength(0)
  })

  it('a Hub-UI done on an UNANSWERED approval is refused too', async () => {
    const { db, env } = makeDB()
    const id = 'task_01approve_runbook_hubtap2'
    seedApproval(db, id)
    const r = await applyMutation(env, {
      table: 'tasks', record_id: id, op: 'update',
      patch: { status: 'done', completed: 1, completed_at: nowInstant() },
      route: 'test', user: NICK,
    })
    expect(r.status).toBe('error')
    expect(r.reason).toMatch(/^apply error: question_(unanswered|consumer_close_only):/)
    expect(rowOf(db, id)?.status).toBe('todo')
  })

  it('the PB consumer close of an answered approval is accepted', async () => {
    const { db, env } = makeDB()
    const id = 'task_01approve_runbook_pbclose'
    seedApproval(db, id, { question_answer_json: JSON.stringify(YES_ANSWER) })
    const r = await applyUpdate(env, {
      mutation_id: 'mut_approve_pbclose_0001', origin_machine: 'home', table: 'tasks', op: 'update',
      record_id: id, base_seq: seqOf(db, id), base_row_hash: null,
      patch: { status: 'done', completed: 1, completed_at: nowInstant() }, client_ts: nowInstant(), issued_at: nowInstant(),
    }, NICK)
    expect(r.status).toBe('accepted')
    expect(rowOf(db, id)?.status).toBe('done')
  })
})

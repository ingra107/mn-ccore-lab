// PB backlog #8842 R4 (2026-09-24) -- the consumer receipt, on the REAL
// migrated schema (api/test-support/prod-schema-db.ts replays bootstrap +
// every api/schema-v*.sql, schema-v114 and v142 included: the column comes
// from the migration, not from this file).
//
// PB reads a question as `consumed` only from tasks.question_consumed_json,
// written by the PB consumer in the same patch as the close. These cases pin
// the Hub half: who may write the receipt, what it must bind, and that a
// question cannot enter 'done' without one. Until schema-v142 that last rule
// sat behind lab_settings hub_validate_question_consumed, and a flag-read
// failure (getValidationFlags falls back to all-OFF) turned it off. It is
// unconditional now: no case below passes flags, and the v142 migration
// deletes the flag row.

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { applyUpdate, applyInsert, applyMutation } from './mutations';
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db';
import { _resetValidationFlagsCache } from '../helpers';
import { questionConsumedError } from '../lib/task-question';

const USER = { email: 'nick@example.com', slug: 'nick-ingraham', isPi: true } as any;

const SPEC = JSON.stringify({ v: 1, kind: 'fix_approval', prompt: 'Build it?', choices: [{ key: 'yes', label: 'Build it' }, { key: 'no', label: 'Not now' }] });
const ANSWER_AT = '2026-09-24T03:00:00Z';
const ANSWER = JSON.stringify({ v: 1, choice: 'yes', via: 'hub', at: ANSWER_AT });
const receipt = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, consumer: 'fix_approval', at: '2026-09-24T04:00:00Z', answer_at: ANSWER_AT, evidence: 'Built and verified', ...over });
const CLOSE = { status: 'done', completed: 1, completed_at: '2026-09-24T04:00:00Z', completed_by: 'nick-ingraham' };

let db: InstanceType<typeof Database>;
let n = 0;
beforeEach(() => {
  db = prodSchemaDb();
  n = 0;
  _resetValidationFlagsCache();
  db.prepare(
    "INSERT INTO tasks (id, title, assignee, seq, kind, status, question_spec_json, question_answer_json) " +
    "VALUES ('task_Q', 'Approve: x', 'nick-ingraham', 1, 'question', 'todo', ?, ?)",
  ).run(SPEC, ANSWER);
});

const env = () => ({ DB: d1Adapter(db) } as any);
const row = () => db.prepare("SELECT status, question_consumed_json FROM tasks WHERE id='task_Q'").get() as { status: string; question_consumed_json: string | null };

function upd(patch: Record<string, unknown>, origin = 'home', record = 'task_Q') {
  n += 1;
  return {
    mutation_id: `mut_R4_${n}`, origin_machine: origin, table: 'tasks', record_id: record, op: 'update',
    base_seq: null, base_row_hash: null, patch, depends_on: null,
    client_ts: '2026-09-24T04:00:00Z', issued_at: '2026-09-24T04:00:00Z',
  } as any;
}

describe('the migrations land the column and retire the flag', () => {
  it('tasks.question_consumed_json exists; schema-v142 deleted hub_validate_question_consumed', () => {
    const cols = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('question_consumed_json');
    expect(db.prepare("SELECT value FROM lab_settings WHERE key='hub_validate_question_consumed'").get()).toBeUndefined();
  });
});

describe('a question enters done only with the consumer receipt (no flag)', () => {
  it('PB-origin close with NO receipt is refused (accepted before #8842 R4)', async () => {
    await expect(applyUpdate(env(), upd({ ...CLOSE }), USER)).rejects.toThrow(/^question_unconsumed:/);
    expect(row().status).toBe('todo');
  });

  it('PB-origin close WITH a receipt bound to the answer is accepted and stored byte-for-byte', async () => {
    const r = await applyUpdate(env(), upd({ ...CLOSE, question_consumed_json: receipt() }), USER);
    expect(r.status).toBe('accepted');
    expect(row()).toEqual({ status: 'done', question_consumed_json: receipt() });
  });

  it('a receipt for a DIFFERENT answer is refused (answer_at must match)', async () => {
    await expect(applyUpdate(env(), upd({ ...CLOSE, question_consumed_json: receipt({ answer_at: '2026-01-01T00:00:00Z' }) }), USER))
      .rejects.toThrow(/^question_consumed_invalid: .*answer_at/);
  });

  it('a Hub-UI close is refused (through applyMutation, which reads lab_settings for the other flags)', async () => {
    const r = await applyMutation(env(), { table: 'tasks', record_id: 'task_Q', op: 'update', patch: { ...CLOSE }, route: 'test', user: USER });
    expect(r.status).toBe('error');
    expect(r.reason).toMatch(/question_unconsumed:/);
    expect(row().status).toBe('todo');
  });

  it('a Hub-UI close is refused even when the flags read FAILS (the all-OFF fallback)', async () => {
    // getValidationFlags catches a read error and returns all-OFF; dropping the
    // table makes that happen. The old flag-gated rule went quiet here.
    db.prepare('DROP TABLE lab_settings').run();
    _resetValidationFlagsCache();
    const r = await applyMutation(env(), { table: 'tasks', record_id: 'task_Q', op: 'update', patch: { ...CLOSE }, route: 'test', user: USER });
    expect(r.status).toBe('error');
    expect(r.reason).toMatch(/question_unconsumed:/);
    expect(row().status).toBe('todo');
  });

  it('retiring stays allowed: a Hub-UI status=deleted on an answered question lands', async () => {
    const r = await applyMutation(env(), { table: 'tasks', record_id: 'task_Q', op: 'update', patch: { status: 'deleted' }, route: 'test', user: USER });
    expect(r.status).toBe('accepted');
    expect(row().status).toBe('deleted');
  });

  it('a question born done needs the receipt too (insert arm)', async () => {
    const ins = {
      mutation_id: 'mut_R4_ins', origin_machine: 'home', table: 'tasks', record_id: 'task_Q2', op: 'insert',
      payload: { title: 'Q2', assignee: 'nick-ingraham', kind: 'question', question_spec_json: SPEC, question_answer_json: ANSWER, ...CLOSE },
      depends_on: null, client_ts: '2026-09-24T04:00:00Z', issued_at: '2026-09-24T04:00:00Z',
    } as any;
    const r = await applyInsert(env(), ins, USER);
    expect(r.status).toBe('error');
    expect(r.reason).toMatch(/question_unconsumed:/);
  });
});

describe('the receipt rules', () => {
  it('the backfill shape: a receipt added to an ALREADY-done question from PB is accepted', async () => {
    // A row PB closed before the column existed (raw seed; no write path can
    // make one now).
    db.prepare("UPDATE tasks SET status='done', completed=1, completed_at='2026-09-24T04:00:00Z' WHERE id='task_Q'").run();
    const r = await applyUpdate(env(), upd({ question_consumed_json: receipt({ consumer: 'fix_approval', evidence: 'backfill' }) }), USER);
    expect(r.status).toBe('accepted');
    expect(JSON.parse(row().question_consumed_json!).evidence).toBe('backfill');
  });

  it('a Hub-UI write may not carry the receipt at all', async () => {
    const r = await applyMutation(env(), { table: 'tasks', record_id: 'task_Q', op: 'update', patch: { question_consumed_json: receipt() }, route: 'test', user: USER });
    expect(r.status).toBe('error');
    expect(r.reason).toMatch(/question_consumed_hub_ui:/);
    expect(row().question_consumed_json).toBeNull();
  });

  it('a receipt without the close is refused', async () => {
    await expect(applyUpdate(env(), upd({ question_consumed_json: receipt() }), USER))
      .rejects.toThrow(/^question_consumed_invalid: .*status='done'/);
  });
});

describe('questionConsumedError, pure', () => {
  const q = { kind: 'question', status: 'done', question_answer_json: ANSWER };
  it('refuses a receipt on a non-question row', () => {
    expect(questionConsumedError({}, { ...q, kind: 'task' }, { question_consumed_json: receipt() }, 'home'))
      .toMatch(/^question_consumed_invalid: .*kind=question/);
  });
  it('refuses a malformed receipt (missing consumer)', () => {
    expect(questionConsumedError({}, q, { question_consumed_json: receipt({ consumer: '' }) }, 'home'))
      .toMatch(/^question_consumed_invalid: .*consumer/);
  });
  it('a no-op re-close of a done row is not a transition (no receipt)', () => {
    expect(questionConsumedError({ status: 'done' }, q, { status: 'done' }, 'home')).toBeNull();
  });
  it('ordinary tasks are untouched', () => {
    expect(questionConsumedError({ status: 'todo' }, { kind: 'task', status: 'done' }, { status: 'done' }, 'hub_ui:x')).toBeNull();
  });
});

// L-Q23 (2026-10-08) -- every /api/mutations refusal carries a `code` from the
// pb-schema REFUSAL_CODES vocabulary, on the REAL migrated schema
// (api/test-support/prod-schema-db.ts) through the real handleMutations.
//
// PB decides retry / converge / adopt / alert / stay quiet from `code` alone.
// These cases pin three things:
//   1. the code each refusal class carries, and that `reason` is byte-for-byte
//      the text it was before codes (an older PB still classifies by it);
//   2. links: a constraint failure is decided by re-reading the live row for
//      the natural key -- a holder -> link_natural_key (with that row), none
//      -> constraint (a NOT NULL failure is not the natural key);
//   3. the question rules ported from PB (spec immutable, choice unknown, a
//      spec/answer on a non-question row), judged on the Hub's row, and the
//      writes that must stay legal.
//
// Peripheral-Brain plan: Scratch/plans/2026-10-08-hub-refusal-codes-reconciled.md

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { nowInstant } from '../lib/time';
import { handleMutations } from './mutations';
import type { Mutation } from './mutations';
import type { Env, AuthUser } from '../helpers';
import { _resetValidationFlagsCache } from '../helpers';
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db';
import { REFUSAL_CODES } from '../../pb-schema/pb_schema/generated/refusal-codes.generated.ts';

const USER: AuthUser = { email: 'ingra107@umn.edu', slug: 'nick-ingraham', isPi: true };
const KEY = 'test-api-key';
type DB = ReturnType<typeof prodSchemaDb>;
type Result = {
  mutation_id: string; status: string; code?: string; reason?: string;
  current_payload?: Record<string, unknown>;
};

let db: DB;
let n = 0;
beforeEach(() => {
  db = prodSchemaDb();
  n = 0;
  _resetValidationFlagsCache();
});

type Hooks = Parameters<typeof d1Adapter>[1];
const env = (hooks: Hooks = {}) => ({ DB: d1Adapter(db, hooks), KV: null, BUCKET: null, PB_API_KEY: KEY } as unknown as Env);

/** Every error result any case in this file produced (the suite-level check). */
const ERRORS: Result[] = [];

function mut(over: Partial<Mutation> & { table: string; record_id: string }): Mutation {
  n += 1;
  return {
    mutation_id: `mut_LQ23_${n}`, origin_machine: 'home', op: 'insert',
    base_seq: null, base_row_hash: null, depends_on: null,
    client_ts: nowInstant(), issued_at: nowInstant(), ...over,
  } as Mutation;
}

async function send(m: Mutation, hooks: Hooks = {}): Promise<Result> {
  const req = new Request('https://h/api/mutations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ mutations: [m] }),
  });
  const resp = await handleMutations(req, USER, env(hooks));
  const body = (await resp.json()) as { results: Result[] };
  for (const r of body.results) if (r.status === 'error') ERRORS.push(r);
  return body.results[0];
}

/** A refusal: status 'error' and a code from the shared vocabulary. */
function refused(r: Result, code: string): Result {
  expect(r.status).toBe('error');
  expect(REFUSAL_CODES as readonly string[]).toContain(r.code);
  expect(r.code).toBe(code);
  return r;
}

const LINK = {
  owner_table: 'tasks', owner_id: 'task_01LQ23000000000000000001', role: 'key',
  type: 'google_doc', canonical_url: 'https://docs.google.com/document/d/lq23', short_title: 'Doc',
  sort_order: 0,
};

function seedLink(id: string, extra: Record<string, unknown> = {}) {
  return insertRow(db, 'links', { id, ...LINK, ...extra });
}

describe('envelope and field refusals carry codes; reason text is unchanged', () => {
  it('unknown table -> envelope_invalid', async () => {
    const r = refused(await send(mut({ table: 'bogus', record_id: 'x' })), 'envelope_invalid');
    expect(r.reason).toBe('unknown table bogus');
  });

  it('missing origin_machine -> envelope_invalid', async () => {
    const r = refused(await send(mut({ table: 'links', record_id: 'link_x', origin_machine: '' })), 'envelope_invalid');
    expect(r.reason).toBe('origin_machine required');
  });

  it('unknown field -> unknown_field', async () => {
    const r = refused(await send(mut({ table: 'links', record_id: 'link_x', payload: { ...LINK, bogus: 1 } })), 'unknown_field');
    expect(r.reason).toBe('unknown fields for links: bogus');
  });

  it('update of an id the Hub never had -> record_not_found', async () => {
    const r = refused(await send(mut({ table: 'links', record_id: 'link_absent', op: 'update', patch: { short_title: 'x' } })), 'record_not_found');
    expect(r.reason).toBe('links record link_absent not found');
  });

  it('update of a soft-deleted row -> record_deleted', async () => {
    seedLink('link_dead', { deleted_at: '2026-10-01 00:00:00' });
    const r = refused(await send(mut({ table: 'links', record_id: 'link_dead', op: 'update', patch: { short_title: 'x' } })), 'record_deleted');
    expect(r.reason).toBe('links record link_dead is deleted — cannot update; send deleted_at=null to undelete');
  });

  it('delete on a table with no deleted_at -> envelope_invalid (deterministic, not transient)', async () => {
    const r = refused(await send(mut({ table: 'project_state_log', record_id: 'psl_1', op: 'delete' })), 'envelope_invalid');
    expect(r.reason).toBe('op=delete not supported on project_state_log (no deleted_at column)');
  });
});

describe('links: a constraint failure is decided by the live row, not the engine text', () => {
  it('a second id for a live natural key -> link_natural_key, carrying the holder row', async () => {
    seedLink('link_holder');
    const r = refused(await send(mut({ table: 'links', record_id: 'link_second', payload: { ...LINK } })), 'link_natural_key');
    // The exact text PB's _LINK_NATURAL_KEY_UNIQUE_RE matches today.
    expect(r.reason).toMatch(/^apply error: /);
    expect(r.reason).toContain('UNIQUE constraint failed: links.owner_table, links.owner_id, links.role, links.canonical_url');
    expect(r.current_payload?.id).toBe('link_holder');
    expect(db.prepare("SELECT COUNT(*) AS c FROM links WHERE id = 'link_second'").get()).toEqual({ c: 0 });
  });

  it('the same key on a soft-deleted holder does not collide (the index is partial)', async () => {
    seedLink('link_old', { deleted_at: '2026-10-01 00:00:00' });
    const r = await send(mut({ table: 'links', record_id: 'link_new', payload: { ...LINK } }));
    expect(r.status).toBe('accepted');
  });

  it('a NOT NULL failure on links -> constraint, not link_natural_key', async () => {
    seedLink('link_holder');
    const { short_title: _omit, ...noTitle } = LINK;
    const r = refused(await send(mut({ table: 'links', record_id: 'link_untitled', payload: { ...noTitle, canonical_url: 'https://x/other' } })), 'constraint');
    expect(r.reason).toMatch(/^apply error: .*NOT NULL constraint failed: links\.short_title/);
  });

  it('a NOT NULL failure that ALSO shares a live row\'s key -> constraint, never adopt', async () => {
    seedLink('link_holder');
    const { short_title: _omit, ...noTitle } = LINK;
    const r = refused(await send(mut({ table: 'links', record_id: 'link_bad', payload: { ...noTitle } })), 'constraint');
    expect(r.reason).toMatch(/^apply error: .*NOT NULL constraint failed: links\.short_title/);
    expect(r.current_payload).toBeUndefined();
  });

  it('an update that moves a row onto a taken key -> link_natural_key', async () => {
    seedLink('link_a');
    seedLink('link_b', { role: 'archive' });
    const seq = (db.prepare("SELECT seq FROM links WHERE id='link_b'").get() as { seq: number }).seq;
    const r = refused(await send(mut({ table: 'links', record_id: 'link_b', op: 'update', base_seq: seq, patch: { role: 'key' } })), 'link_natural_key');
    expect(r.current_payload?.id).toBe('link_a');
  });

  it('a replayed refusal returns the same code (the receipt stores it)', async () => {
    seedLink('link_holder');
    const m = mut({ table: 'links', record_id: 'link_second', payload: { ...LINK } });
    const first = refused(await send(m), 'link_natural_key');
    const again = await send(m);
    expect(again).toEqual(first);
    expect(JSON.parse(receiptOf(db, m.mutation_id)!.original_response_json).code).toBe('link_natural_key');
  });

  it('a stored receipt from before codes replays with NO code (PB reads that as UNCODED)', async () => {
    const legacy = { mutation_id: 'mut_LQ23_legacy', status: 'error', reason: 'apply error: old' };
    db.prepare(
      "INSERT INTO processed_mutations (mutation_id, origin_machine, processed_at, outcome, original_response_json, table_name, record_id) " +
      "VALUES (?, 'home', datetime('now'), 'error', ?, 'links', 'link_x')",
    ).run(legacy.mutation_id, JSON.stringify(legacy));
    const r = await send({ ...mut({ table: 'links', record_id: 'link_x', payload: { ...LINK } }), mutation_id: legacy.mutation_id });
    expect(r).toEqual(legacy);
    expect(r.code).toBeUndefined();
  });
});

// ── failures PB retries, and the corrupt receipt it must not ────────────────

describe('engine and batch failures carry the codes PB retries on', () => {
  it('a throw outside any apply (the idempotency read) -> infra, nothing recorded', async () => {
    const m = mut({ table: 'links', record_id: 'link_x', payload: { ...LINK } });
    const r = refused(await send(m, { failSql: /^SELECT outcome, original_response_json FROM processed_mutations/, failTimes: 1 }), 'infra');
    expect(r.reason).toBe('infra error: D1_ERROR: simulated D1 failure: SQLITE_ERROR');
    expect(receiptOf(db, m.mutation_id)).toBeUndefined();
  });

  it('a commit batch that rolls back -> commit_not_landed, nothing recorded', async () => {
    seedLink('link_c');
    const seq = (db.prepare("SELECT seq FROM links WHERE id='link_c'").get() as { seq: number }).seq;
    const m = mut({ table: 'links', record_id: 'link_c', op: 'update', base_seq: seq, patch: { short_title: 'new' } });
    const r = refused(await send(m, { failSql: /^UPDATE links SET/, failTimes: 1 }), 'commit_not_landed');
    expect(r.reason).toBe('infra error: D1_ERROR: simulated D1 failure: SQLITE_ERROR');
    expect(receiptOf(db, m.mutation_id)).toBeUndefined();
    expect((db.prepare("SELECT short_title FROM links WHERE id='link_c'").get() as { short_title: string }).short_title).toBe('Doc');
  });

  it('a non-constraint throw inside an apply -> apply_error', async () => {
    const r = refused(await send(mut({ table: 'links', record_id: 'link_y', payload: { ...LINK } }), { failSql: /^INSERT INTO links/, failTimes: 1 }), 'apply_error');
    expect(r.reason).toBe('apply error: D1_ERROR: simulated D1 failure: SQLITE_ERROR');
  });

  it('a stored receipt that will not parse -> idempotency_unparseable', async () => {
    db.prepare(
      "INSERT INTO processed_mutations (mutation_id, origin_machine, processed_at, outcome, original_response_json, table_name, record_id) " +
      "VALUES ('mut_LQ23_corrupt', 'home', datetime('now'), 'accepted', '{not json', 'links', 'link_x')",
    ).run();
    const r = refused(await send({ ...mut({ table: 'links', record_id: 'link_x', payload: { ...LINK } }), mutation_id: 'mut_LQ23_corrupt' }), 'idempotency_unparseable');
    expect(r.reason).toBe('idempotency record unparseable');
  });
});

afterAll(() => {
  // Suite-level: every error result any case above produced carries a code
  // from the shared vocabulary. The legacy-receipt replay is the one
  // deliberate exception: it predates codes and replays verbatim.
  const coded = ERRORS.filter((r) => r.mutation_id !== 'mut_LQ23_legacy');
  expect(coded.length).toBeGreaterThanOrEqual(20);
  for (const r of coded) expect(REFUSAL_CODES as readonly string[]).toContain(r.code);
});

// ── question rules ──────────────────────────────────────────────────────────

const SPEC = JSON.stringify({
  v: 1, kind: 'fix_approval', prompt: 'Build it?',
  choices: [{ key: 'yes', label: 'Build it' }, { key: 'no', label: 'Not now' }, { key: 'other', label: 'Other' }],
  allow_text: true, rec: 'yes',
});
const answer = (choice: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, choice, via: 'hub', at: '2026-10-08T12:00:00Z', ...extra });

function seedTask(id: string, extra: Record<string, unknown>) {
  return insertRow(db, 'tasks', { id, title: `T ${id}`, assignee: 'nick-ingraham', status: 'todo', ...extra });
}
const seqOf = (id: string) => (db.prepare('SELECT seq FROM tasks WHERE id = ?').get(id) as { seq: number }).seq;
const taskRow = (id: string) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>;
const upd = (id: string, patch: Record<string, unknown>) =>
  mut({ table: 'tasks', record_id: id, op: 'update', base_seq: seqOf(id), patch });

describe('question refusals: three codes, judged on the Hub row', () => {
  beforeEach(() => {
    seedTask('task_Q', { kind: 'question', question_spec_json: SPEC });
    seedTask('task_T', { kind: 'task' });
  });

  it('a different spec on a question that has one -> question_spec_immutable', async () => {
    const other = SPEC.replace('Build it?', 'Ship it?');
    const r = refused(await send(upd('task_Q', { question_spec_json: other })), 'question_rule');
    expect(r.reason).toMatch(/^apply error: question_spec_immutable:/);
    expect(taskRow('task_Q').question_spec_json).toBe(SPEC);
  });

  it('an answer naming no choice in the spec -> question_choice_unknown', async () => {
    const r = refused(await send(upd('task_Q', { question_answer_json: answer('maybe') })), 'question_rule');
    expect(r.reason).toMatch(/^apply error: question_choice_unknown: answer choice 'maybe'/);
    expect(taskRow('task_Q').question_answer_json).toBeNull();
  });

  it('an answer on a non-question row -> question_field_on_non_question', async () => {
    const r = refused(await send(upd('task_T', { question_answer_json: answer('yes') })), 'question_rule');
    expect(r.reason).toMatch(/^apply error: question_field_on_non_question: question_answer_json on a kind=task task/);
  });

  it('a spec on an insert with no kind (defaults to task) -> question_field_on_non_question', async () => {
    const r = refused(await send(mut({ table: 'tasks', record_id: 'task_new', payload: { title: 'x', assignee: 'nick-ingraham', status: 'todo', question_spec_json: SPEC } })), 'question_rule');
    expect(r.reason).toMatch(/^question_field_on_non_question:/);
  });

  it('demoting a question while it keeps its spec -> refused', async () => {
    const r = refused(await send(upd('task_Q', { kind: 'task' })), 'question_rule');
    expect(r.reason).toMatch(/^apply error: question_field_on_non_question:/);
  });

  it('closing an unanswered question -> question_consumer (loud, as today)', async () => {
    const r = refused(await send(upd('task_Q', { status: 'deleted' })), 'question_consumer');
    expect(r.reason).toMatch(/^apply error: question_unanswered:/);
  });

  it('a malformed answer -> question_shape (loud: a writer bug)', async () => {
    const r = refused(await send(upd('task_Q', { question_answer_json: '{not json' })), 'question_shape');
    expect(r.reason).toMatch(/^apply error: question_answer_invalid:/);
  });
});

describe('question writes that stay legal', () => {
  beforeEach(() => {
    seedTask('task_Q', { kind: 'question', question_spec_json: SPEC });
    seedTask('task_T', { kind: 'task', source: 'meeting_approval', meeting_id: 'mtg_1' });
  });

  it('a known choice is accepted', async () => {
    expect((await send(upd('task_Q', { question_answer_json: answer('yes') }))).status).toBe('accepted');
  });

  it("'other' with text is accepted (every question carries it)", async () => {
    expect((await send(upd('task_Q', { question_answer_json: answer('other', { text: 'Do it Monday' }) }))).status).toBe('accepted');
  });

  it('Undo (answer back to NULL) is accepted', async () => {
    await send(upd('task_Q', { question_answer_json: answer('yes') }));
    expect((await send(upd('task_Q', { question_answer_json: null }))).status).toBe('accepted');
  });

  it('re-sending the identical spec is not a change', async () => {
    expect((await send(upd('task_Q', { question_spec_json: SPEC }))).status).toBe('accepted');
  });

  it("making a task a question with a valid spec is accepted", async () => {
    const r = await send(upd('task_T', { kind: 'question', question_spec_json: SPEC }));
    expect(r.status).toBe('accepted');
  });

  it('a Telegram handle on an ordinary (meeting_approval) task is accepted', async () => {
    expect((await send(upd('task_T', { question_telegram_json: JSON.stringify({ chat_id: 1, message_id: 2 }) }))).status).toBe('accepted');
  });

  it('demoting a question while clearing its spec is accepted', async () => {
    const r = await send(upd('task_Q', { kind: 'task', question_spec_json: null }));
    expect(r.status).toBe('accepted');
  });
});

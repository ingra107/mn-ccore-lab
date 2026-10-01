// mutations.composite-pk.test.ts — vitest unit tests for composite PK support
//
// Stage 3 Phase 3 v3 — codex pass-2 N3 + M5 fix (2026-05-07).
//
// Tests:
//   1. Insert + read agent_knowledge with topic = "contains | pipe" (N3 literal pipe safety)
//   2. Insert + read trajectories with task = "task with \\ char" (N3 backslash safety)
//   3. Insert + read agent_knowledge with topic = "unicode_τοπικ" (N3 unicode / ensure_ascii=False)
//   4. Insert + patch + read agent_knowledge via composite recordId (patch WHERE clause correctness)
//   5. Delete via composite recordId; row reads back with deleted_at IS NOT NULL
//   6. Sessions applyDelete sets deleted_at (schema-v65 M5 fix)

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { nowInstant } from '../lib/time';
import { applyInsert, applyUpdate, applyDelete } from './mutations';
import type { Mutation } from './mutations';
import type { Env, AuthUser } from '../helpers';
import { prodSchemaDb, d1Adapter, receiptOf } from '../test-support/prod-schema-db';

// ── Fixture ──────────────────────────────────────────────────────────────────
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The old stub parsed SET/WHERE text, kept every table as a JS Map keyed by a
// hand-copied PK list, and treated the processed_mutations receipt INSERT as a
// no-op. Here the composite PRIMARY KEYs, the v53 seq triggers and the
// TEXT NOT NULL receipt column are the real ones, and every test reads the
// stored row and its receipt back.

let db: InstanceType<typeof Database>;
let env: Env;
beforeEach(() => {
  db = prodSchemaDb();
  env = { DB: d1Adapter(db) } as unknown as Env;
});

// ── Workers-runtime gap guard ─────────────────────────────────────────────────
//
// vitest runs in Node, which has Buffer. Cloudflare Pages Functions do NOT
// have Buffer (Pages and Workers are separate runtimes; nodejs_compat in
// wrangler.toml only covers the Worker deploy). Every mutations.ts call in
// this file runs with Buffer undefined, so any use of Buffer inside those
// functions throws synchronously, the same error production returns.
//
// Regression class: 4790715d shipped Buffer.from in decodeCompositeRecordId;
// vitest passed (Node env had Buffer) but Pages smoke failed with
// "Buffer is not defined". This guard prevents recurrence.
//
// The guard is scoped to the code under test, not file-wide: the fixture is a
// Node-built better-sqlite3 image (its constructor takes a Buffer), so it is
// built in beforeEach with Buffer present, and only the mutations.ts call is
// made Buffer-less. The SQLite engine below the adapter is test scaffolding,
// not Pages code; the subject of the guard is mutations.ts.
async function noBuffer<T>(fn: () => Promise<T>): Promise<T> {
  const saved = globalThis.Buffer;
  // @ts-expect-error intentionally poison Buffer to catch Workers-runtime gap
  globalThis.Buffer = undefined;
  try {
    expect(globalThis.Buffer).toBeUndefined();
    return await fn();
  } finally {
    globalThis.Buffer = saved;
  }
}

// ── base64url(JSON array) encoder (mirrors Python _composite_record_id) ──────
// Uses Web APIs (btoa + TextEncoder) — no Buffer dependency.
function compositeRecordId(...parts: string[]): string {
  const json = JSON.stringify(parts);
  const bytes = new TextEncoder().encode(json);
  let binStr = '';
  bytes.forEach(b => { binStr += String.fromCharCode(b); });
  return btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const FAKE_USER = { id: 'user_test', email: 'test@test.com' } as unknown as AuthUser;

const rowsOf = (table: string) => db.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;

function mut(overrides: Partial<Mutation>): Mutation {
  return {
    mutation_id: 'mut_' + Math.random().toString(36).slice(2),
    origin_machine: 'test',
    table: 'agent_knowledge',
    op: 'insert',
    record_id: '',
    base_seq: null,
    base_row_hash: null,
    patch: undefined,
    payload: undefined,
    depends_on: null,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
    ...overrides,
  };
}

describe('Workers-runtime gap guard', () => {
  it('noBuffer really removes Buffer, and restores it for the Node-built fixture', async () => {
    await expect(noBuffer(async () => Buffer.from('x'))).rejects.toThrow();
    expect(typeof globalThis.Buffer).toBe('function');
    // decodeCompositeRecordId ran Buffer-less and reached the database.
    const m = mut({
      record_id: compositeRecordId('guard_cat', 'guard_topic', '2026-05-07T05:00:00'),
      payload: { category: 'guard_cat', topic: 'guard_topic', valid_from: '2026-05-07T05:00:00', knowledge: 'k' },
    });
    expect((await noBuffer(() => applyInsert(env, m, FAKE_USER))).status).toBe('accepted');
    expect(rowsOf('agent_knowledge').map(r => r.topic)).toEqual(['guard_topic']);
  });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('composite PK — N3 escape-safety', () => {

  it('Test 1: agent_knowledge insert with topic containing literal | pipe', async () => {
    const topicWithPipe = 'contains | pipe';
    const recordId = compositeRecordId('test_cat', topicWithPipe, '2026-05-07T00:00:00');

    const m = mut({
      table: 'agent_knowledge',
      op: 'insert',
      record_id: recordId,
      payload: {
        category: 'test_cat',
        topic: topicWithPipe,
        valid_from: '2026-05-07T00:00:00',
        knowledge: 'pipe test',
        confidence: 'medium',
      },
    });

    const result = await noBuffer(() => applyInsert(env, m, FAKE_USER));

    expect(result.status).toBe('accepted');
    // Verify the stored row has the literal pipe preserved — NOT split on |
    const rows = rowsOf('agent_knowledge');
    expect(rows).toHaveLength(1);
    expect(rows[0].topic).toBe(topicWithPipe);
    expect(rows[0].category).toBe('test_cat');
    expect(rows[0].valid_from).toBe('2026-05-07T00:00:00');
    expect(rows[0].knowledge).toBe('pipe test');
    expect(rows[0].last_mutation_id).toBe(m.mutation_id);
    // The real PK finds it by all three parts (the old stub's PK list was a hand copy).
    expect(db.prepare('SELECT knowledge FROM agent_knowledge WHERE category = ? AND topic = ? AND valid_from = ?')
      .get('test_cat', topicWithPipe, '2026-05-07T00:00:00')).toEqual({ knowledge: 'pipe test' });
  });

  it('Test 2: trajectories insert with task containing literal backslash', async () => {
    const taskWithBackslash = 'task with \\ char';
    const recordId = compositeRecordId(taskWithBackslash, '2026-05-07T01:00:00');

    const m = mut({
      table: 'trajectories',
      op: 'insert',
      record_id: recordId,
      payload: {
        task: taskWithBackslash,
        created_at: '2026-05-07T01:00:00',
        steps: 'step1',
        outcome: 'success',
      },
    });

    const result = await noBuffer(() => applyInsert(env, m, FAKE_USER));

    expect(result.status).toBe('accepted');
    const rows = rowsOf('trajectories');
    expect(rows).toHaveLength(1);
    expect(rows[0].task).toBe(taskWithBackslash); // literal backslash preserved
    expect(rows[0].created_at).toBe('2026-05-07T01:00:00');
    expect(rows[0].outcome).toBe('success');
  });

  it('Test 3: agent_knowledge insert with unicode topic (ensure_ascii=False)', async () => {
    const unicodeTopic = 'unicode_τοπικ';
    const recordId = compositeRecordId('unicode_cat', unicodeTopic, '2026-05-07T02:00:00');

    const m = mut({
      table: 'agent_knowledge',
      op: 'insert',
      record_id: recordId,
      payload: {
        category: 'unicode_cat',
        topic: unicodeTopic,
        valid_from: '2026-05-07T02:00:00',
        knowledge: 'unicode test',
        confidence: 'high',
      },
    });

    const result = await noBuffer(() => applyInsert(env, m, FAKE_USER));

    expect(result.status).toBe('accepted');
    const rows = rowsOf('agent_knowledge');
    expect(rows).toHaveLength(1);
    expect(rows[0].topic).toBe(unicodeTopic); // unicode preserved byte-for-byte
    expect(rows[0].category).toBe('unicode_cat');
  });

  it('Test 4: agent_knowledge insert + patch via composite recordId', async () => {
    const recordId = compositeRecordId('patch_cat', 'patch_topic', '2026-05-07T03:00:00');

    // Insert first
    const insertMut = mut({
      table: 'agent_knowledge',
      op: 'insert',
      record_id: recordId,
      payload: {
        category: 'patch_cat',
        topic: 'patch_topic',
        valid_from: '2026-05-07T03:00:00',
        knowledge: 'original knowledge',
        confidence: 'low',
      },
    });
    const insertResult = await noBuffer(() => applyInsert(env, insertMut, FAKE_USER));
    expect(insertResult.status).toBe('accepted');

    // A sibling row sharing two of the three PK parts: the composite WHERE must
    // leave it alone (the old stub matched the first row and broke).
    db.prepare("INSERT INTO agent_knowledge (category, topic, valid_from, knowledge) VALUES ('patch_cat', 'patch_topic', '2026-05-08T03:00:00', 'sibling')").run();
    const seqBefore = (db.prepare("SELECT seq FROM agent_knowledge WHERE valid_from = '2026-05-07T03:00:00'").get() as { seq: number }).seq;

    // Patch it
    const patchMut = mut({
      table: 'agent_knowledge',
      op: 'update',
      record_id: recordId,
      base_seq: null,
      patch: {
        knowledge: 'updated knowledge',
        confidence: 'high',
      },
    });
    const patchResult = await noBuffer(() => applyUpdate(env, patchMut, FAKE_USER));
    expect(patchResult.status).toBe('accepted');

    // Verify row was updated using composite WHERE
    const row = db.prepare("SELECT * FROM agent_knowledge WHERE valid_from = '2026-05-07T03:00:00'").get() as Record<string, unknown>;
    expect(row.knowledge).toBe('updated knowledge');
    expect(row.confidence).toBe('high');
    // PK fields preserved
    expect(row.category).toBe('patch_cat');
    expect(row.topic).toBe('patch_topic');
    expect(row.valid_from).toBe('2026-05-07T03:00:00');
    expect(row.last_mutation_id).toBe(patchMut.mutation_id);
    expect(row.seq as number).toBeGreaterThan(seqBefore);
    // The sibling row is untouched.
    expect(db.prepare("SELECT knowledge FROM agent_knowledge WHERE valid_from = '2026-05-08T03:00:00'").get())
      .toEqual({ knowledge: 'sibling' });
    expect(rowsOf('agent_knowledge')).toHaveLength(2);
    // The update landed with its receipt (TEXT NOT NULL response body).
    const receipt = receiptOf(db, patchMut.mutation_id)!;
    expect(receipt.outcome).toBe('accepted');
    expect(receipt.table_name).toBe('agent_knowledge');
    expect(receipt.record_id).toBe(recordId);
    expect(typeof receipt.original_response_json).toBe('string');
    expect(JSON.parse(receipt.original_response_json).status).toBe('accepted');
  });

  it('Test 5: delete via composite recordId sets deleted_at on agent_knowledge', async () => {
    const recordId = compositeRecordId('del_cat', 'del_topic', '2026-05-07T04:00:00');

    // Insert first (without deleted_at so applyDelete can set it)
    const insertMut = mut({
      table: 'agent_knowledge',
      op: 'insert',
      record_id: recordId,
      payload: {
        category: 'del_cat',
        topic: 'del_topic',
        valid_from: '2026-05-07T04:00:00',
        knowledge: 'to be deleted',
        confidence: 'low',
      },
    });
    const insertResult = await noBuffer(() => applyInsert(env, insertMut, FAKE_USER));
    expect(insertResult.status).toBe('accepted');

    // Confirm no deleted_at yet
    expect(rowsOf('agent_knowledge')[0].deleted_at).toBeNull();

    // Delete via composite record_id
    const deleteMut = mut({
      table: 'agent_knowledge',
      op: 'delete',
      record_id: recordId,
    });
    const deleteResult = await noBuffer(() => applyDelete(env, deleteMut, FAKE_USER));
    expect(deleteResult.status).toBe('accepted');

    // Verify deleted_at was set (soft delete: the row stays)
    const rows = rowsOf('agent_knowledge');
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].deleted_at).toBe('string');
    expect((rows[0].deleted_at as string).length).toBeGreaterThan(0);
    expect(rows[0].last_mutation_id).toBe(deleteMut.mutation_id);
    const receipt = receiptOf(db, deleteMut.mutation_id)!;
    expect(receipt.outcome).toBe('accepted');
    expect(receipt.record_id).toBe(recordId);
    expect(JSON.parse(receipt.original_response_json).status).toBe('accepted');
  });

});

describe('sessions applyDelete — schema-v65 M5 fix', () => {

  it('Test 6: sessions delete sets deleted_at (schema-v65 column required)', async () => {
    const sessionId = 'session_2026-05-07T14-00-00';

    // Insert a sessions row (sessions PK = session_id, scalar)
    const insertMut = mut({
      table: 'sessions',
      op: 'insert',
      record_id: sessionId,
      payload: {
        session_id: sessionId,
        started_at: '2026-05-07T14:00:00',
        machine_id: 'work',
      },
    });
    const insertResult = await noBuffer(() => applyInsert(env, insertMut, FAKE_USER));
    expect(insertResult.status).toBe('accepted');

    // Delete it — this requires schema-v65 deleted_at column on sessions D1
    const deleteMut = mut({
      table: 'sessions',
      op: 'delete',
      record_id: sessionId,
    });
    const deleteResult = await noBuffer(() => applyDelete(env, deleteMut, FAKE_USER));
    expect(deleteResult.status).toBe('accepted');

    // Verify deleted_at IS NOT NULL — this is what schema-v65 enables
    const rows = rowsOf('sessions');
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].deleted_at).toBe('string');
    expect((rows[0].deleted_at as string).length).toBeGreaterThan(0);
    expect(rows[0].session_id).toBe(sessionId);
    expect(rows[0].machine_id).toBe('work');
    expect(receiptOf(db, deleteMut.mutation_id)!.outcome).toBe('accepted');
  });

});

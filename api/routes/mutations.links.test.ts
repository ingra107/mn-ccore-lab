// mutations.links.test.ts -- Phase 2 typed-links admission tests (2026-06-20)
//
// Covers:
//   - links INSERT mutation is accepted (TABLE_FIELDS whitelist, scalar PK)
//   - links UPDATE mutation (base_seq conflict path) returns conflict on mismatch
//   - links DELETE soft-delete (deleted_at + updated_at stamped; no status co-flip)
//   - unknown field in links payload is rejected with status='error'
//   - GET /links?seq_after / include_deleted / limit filtering (links.ts handler)
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The old stub stored a synthetic {id, seq, last_mutation_id} on INSERT, treated
// the processed_mutations receipt INSERT as a no-op, and answered every GET
// /links with a canned row list whatever the WHERE clause said. Every write
// claim below is now read back from the stored row and the receipt, and the
// GET cases run the handler's real SQL against real rows (schema-v88 links,
// its CHECK on owner_table, its NOT NULLs and its seq triggers).
//
// Decision doc: Peripheral-Brain/Context/Decisions/2026-06-20-links-table.md

import { describe, it, expect, beforeEach } from 'vitest';
import { nowInstant } from '../lib/time';
import { handleMutations } from './mutations';
import type { Mutation } from './mutations';
import type { Env, AuthUser } from '../helpers';
import { handleGetLinks } from './links';
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db';

// ── Shared helpers ─────────────────────────────────────────────────────────────

const MOCK_USER: AuthUser = {
  email: 'ingra107@umn.edu',
  slug: 'nick-ingraham',
  isPi: true,
};

const TEST_API_KEY = 'test-api-key';

type DB = ReturnType<typeof prodSchemaDb>;

// Build a minimal Mutation envelope.
function makeMut(overrides: Partial<Mutation> & { table: string }): Mutation {
  return {
    mutation_id: `mut_TEST_${Math.random().toString(36).slice(2, 9)}`,
    origin_machine: 'home',
    op: 'insert',
    record_id: `link_TEST_${Math.random().toString(36).slice(2, 9)}`,
    base_seq: null,
    base_row_hash: null,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
    ...overrides,
  };
}

function makeEnv(db: DB, onExec?: (sql: string, vals: unknown[]) => void): Env {
  return {
    DB: d1Adapter(db, { onExec }),
    KV: null as any,
    BUCKET: null as any,
    PB_API_KEY: TEST_API_KEY,
  } as unknown as Env;
}

type Body = { results: Array<{ status: string; reason?: string }> };

async function send(env: Env, mut: Mutation): Promise<{ status: number; body: Body }> {
  const req = new Request('https://mn-ccore-lab.pages.dev/api/mutations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_API_KEY}`,
    },
    body: JSON.stringify({ mutations: [mut] }),
  });
  const resp = await handleMutations(req, MOCK_USER, env);
  return { status: resp.status, body: (await resp.json()) as Body };
}

const linkRow = (db: DB, id: string) =>
  db.prepare('SELECT * FROM links WHERE id = ?').get(id) as Record<string, unknown> | undefined;

/** Seed a live links row (real columns, valid values); returns the stored row. */
function seedLink(db: DB, id: string, extra: Record<string, unknown> = {}) {
  return insertRow(db, 'links', {
    id,
    owner_table: 'tasks',
    owner_id: 'task_01TEST000000000000000001',
    role: 'key',
    type: 'google_doc',
    canonical_url: `https://docs.google.com/document/d/${id}`,
    short_title: 'Protocol draft',
    sort_order: 0,
    created_at: '2026-06-20 10:00:00',
    updated_at: '2026-06-20 10:00:00',
    ...extra,
  });
}

// ── Admission tests ────────────────────────────────────────────────────────────

describe('mutations.ts — links table admission', () => {
  let db: DB;
  beforeEach(() => { db = prodSchemaDb(); });

  it('accepts a valid links INSERT mutation', async () => {
    const linkId = 'link_01TEST00000000000000000001';

    const mut: Mutation = makeMut({
      table: 'links',
      op: 'insert',
      record_id: linkId,
      payload: {
        owner_table: 'tasks',
        owner_id: 'task_01TEST000000000000000001',
        role: 'key',
        type: 'google_doc',
        canonical_url: 'https://docs.google.com/document/d/abc123',
        short_title: 'Protocol draft',
        sort_order: 0,
        created_at: '2026-06-20 10:00:00',
        // NOTE: updated_at is Hub-managed (TABLES_WITH_UPDATED_AT); NOT in
        // TABLE_FIELDS['links'] and must NOT be sent in the payload.
        // source_raw is optional (nullable); omitting is fine here.
      },
    });

    const { status, body } = await send(makeEnv(db), mut);
    expect(status).toBe(200);
    expect(body.results).toHaveLength(1);
    // Must be accepted (not 'unknown table' or field rejection)
    expect(body.results[0].status).toBe('accepted');
    expect(body.results[0].reason).toBeUndefined();

    // The row really landed, with the payload's values and a trigger-assigned seq.
    const row = linkRow(db, linkId)!;
    expect(row).toBeDefined();
    expect(row.owner_table).toBe('tasks');
    expect(row.owner_id).toBe('task_01TEST000000000000000001');
    expect(row.type).toBe('google_doc');
    expect(row.canonical_url).toBe('https://docs.google.com/document/d/abc123');
    expect(row.short_title).toBe('Protocol draft');
    expect(row.source_raw).toBeNull();
    expect(row.deleted_at).toBeNull();
    expect(row.seq as number).toBeGreaterThan(0);
    expect(row.last_mutation_id).toBe(mut.mutation_id);
    expect(typeof row.updated_at).toBe('string');

    // And the receipt (processed_mutations.original_response_json is TEXT NOT NULL).
    const receipt = receiptOf(db, mut.mutation_id)!;
    expect(receipt.outcome).toBe('accepted');
    expect(receipt.table_name).toBe('links');
    expect(receipt.record_id).toBe(linkId);
    expect(typeof receipt.original_response_json).toBe('string');
  });

  it('rejects an unknown field in a links payload', async () => {
    const linkId = 'link_01TEST00000000000000000002';
    const mut: Mutation = makeMut({
      table: 'links',
      op: 'insert',
      record_id: linkId,
      payload: {
        owner_table: 'tasks',
        owner_id: 'task_01TEST000000000000000001',
        role: 'key',
        type: 'google_doc',
        canonical_url: 'https://docs.google.com/document/d/abc123',
        short_title: 'Protocol draft',
        // This field does NOT exist in TABLE_FIELDS['links']
        sync_status: 'local_modified',
        sort_order: 0,
      },
    });

    const { status, body } = await send(makeEnv(db), mut);
    expect(status).toBe(200);
    expect(body.results[0].status).toBe('error');
    expect(body.results[0].reason).toMatch(/unknown fields for links/i);
    expect(body.results[0].reason).toMatch(/sync_status/);
    // Nothing was written.
    expect(linkRow(db, linkId)).toBeUndefined();
  });

  it('rejects a mutation for an unlisted table (regression: links must be in ALLOWED_TABLES)', async () => {
    // This test would also catch regression if links were removed from ALLOWED_TABLES.
    const mut: Mutation = makeMut({
      table: 'unknown_table_xyz' as any,
      op: 'insert',
      record_id: 'xyz_01TEST',
      payload: { foo: 'bar' },
    });

    const { body } = await send(makeEnv(db), mut);
    expect(body.results[0].status).toBe('error');
    expect(body.results[0].reason).toMatch(/unknown table/i);
  });

  it('soft-delete on links stamps deleted_at and does NOT co-set status (links has no status column)', async () => {
    // Seed an existing links row so applyDelete finds it.
    const linkId = 'link_01TEST00000000000000000003';
    seedLink(db, linkId);

    const sqlLog: string[] = [];
    const mut: Mutation = makeMut({ table: 'links', op: 'delete', record_id: linkId });
    const { status, body } = await send(makeEnv(db, (sql) => sqlLog.push(sql)), mut);
    expect(status).toBe(200);
    expect(body.results[0].status).toBe('accepted');

    // The stored row is tombstoned: deleted_at stamped, updated_at re-stamped,
    // the row itself retained (soft-delete, sync-symmetric).
    const row = linkRow(db, linkId)!;
    expect(row).toBeDefined();
    expect(typeof row.deleted_at).toBe('string');
    expect((row.deleted_at as string).length).toBeGreaterThan(0);
    expect(row.updated_at).not.toBe('2026-06-20 10:00:00');
    expect(receiptOf(db, mut.mutation_id)!.outcome).toBe('accepted');

    // The DELETE SQL must NOT include "status = 'deleted'" (links has no status column;
    // STATUS_BEARING_DELETE_TABLES only covers tasks/projects). On the real schema a
    // co-set would also fail outright (no such column), which the accept above rules out.
    const deleteSqls = sqlLog.filter(s => /^\s*UPDATE links.*deleted_at/is.test(s));
    expect(deleteSqls.length).toBeGreaterThan(0);
    for (const sql of deleteSqls) {
      expect(sql).not.toMatch(/status\s*=/i);
    }
  });

  it('conflict detection works for links UPDATE (base_seq/base_row_hash path)', async () => {
    const linkId = 'link_01TEST00000000000000000004';
    // Seed then bump seq with real UPDATEs (the v88 trigger advances it) so the
    // stored seq is ahead of the client's base.
    seedLink(db, linkId, { short_title: 'Old title' });
    for (let i = 0; i < 9; i++) db.prepare('UPDATE links SET sort_order = ? WHERE id = ?').run(i, linkId);
    const before = linkRow(db, linkId)!;
    const staleBase = (before.seq as number) - 5;
    expect(staleBase).toBeGreaterThan(0);

    // Client holds a stale seq and provides a hash that won't match
    const mut: Mutation = makeMut({
      table: 'links',
      op: 'update',
      record_id: linkId,
      base_seq: staleBase,
      base_row_hash: 'sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      patch: { short_title: 'New title' },
    });

    const { body } = await send(makeEnv(db), mut);
    // seq > base_seq + hash mismatch => conflict
    expect(body.results[0].status).toBe('conflict');
    expect(body.results[0].reason).toMatch(/base_seq/i);
    // Hub wins: the stored row is unchanged.
    const after = linkRow(db, linkId)!;
    expect(after.short_title).toBe('Old title');
    expect(after.seq).toBe(before.seq);
  });
});

// ── GET /links handler tests ──────────────────────────────────────────────────

describe('handleGetLinks — pull endpoint', () => {
  let db: DB;
  beforeEach(() => { db = prodSchemaDb(); });

  function makePiGetRequest(queryString: string): Request {
    return new Request(`https://mn-ccore-lab.pages.dev/api/links?${queryString}`, {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
  }
  const getLinks = (env: Env, qs: string) => {
    const req = makePiGetRequest(qs);
    return handleGetLinks(new URL(req.url), req, env);
  };

  const sampleId = 'link_01TEST00000000000000000010';

  it('returns { data, count } shape on a basic pull', async () => {
    const stored = seedLink(db, sampleId);
    const resp = await getLinks(makeEnv(db), 'seq_after=0');
    expect(resp.status).toBe(200);
    const body = await resp.json() as { data: Array<Record<string, unknown>>; count: number };
    expect(body.data).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.data[0].id).toBe(sampleId);
    expect(body.data[0].seq).toBe(stored.seq);
    // The sync projection: identity-mapped columns only.
    expect(Object.keys(body.data[0]).sort()).toEqual([
      'canonical_url', 'created_at', 'deleted_at', 'id', 'last_mutation_id', 'owner_id',
      'owner_table', 'role', 'seq', 'short_title', 'sort_order', 'source_raw', 'type', 'updated_at',
    ]);
  });

  it('honours seq_after and include_deleted against real rows', async () => {
    // Strengthened (#8875): the old canned stub returned the same rows whatever
    // the WHERE clause said; this pins the cursor and tombstone filters.
    const a = seedLink(db, 'link_01TEST0000000000000000A');
    const b = seedLink(db, 'link_01TEST0000000000000000B');
    db.prepare("UPDATE links SET deleted_at = '2026-06-21 00:00:00' WHERE id = ?").run(b.id);
    const env = makeEnv(db);

    const live = await (await getLinks(env, 'seq_after=0')).json() as { data: Array<{ id: string }> };
    expect(live.data.map(r => r.id)).toEqual([a.id]);

    const all = await (await getLinks(env, 'seq_after=0&include_deleted=1')).json() as { data: Array<{ id: string; seq: number }> };
    expect(all.data.map(r => r.id)).toEqual([a.id, b.id]);
    const after = await (await getLinks(env, `seq_after=${a.seq}&include_deleted=1`)).json() as { data: Array<{ id: string }> };
    expect(after.data.map(r => r.id)).toEqual([b.id]);
  });

  it('validates seq_after is a non-negative integer', async () => {
    const resp = await getLinks(makeEnv(db), 'seq_after=abc');
    expect(resp.status).toBe(400);
    const body = await resp.json() as { error: string };
    expect(body.error).toMatch(/seq_after/i);
  });

  it('rejects non-PI callers with 403', async () => {
    seedLink(db, sampleId);
    // PB_API_KEY on env differs from the bearer, so isPiRequest fails
    const env = { ...makeEnv(db), PB_API_KEY: 'DIFFERENT_KEY' } as unknown as Env;
    const req = new Request('https://mn-ccore-lab.pages.dev/api/links?seq_after=0', {
      headers: { Authorization: 'Bearer wrong-key' },
    });
    const resp = await handleGetLinks(new URL(req.url), req, env);
    expect(resp.status).toBe(403);
  });

  it('returns empty data when the links table does not exist yet', async () => {
    // The real "no such table: links" error from the engine (migration not yet
    // applied): drop the table on this clone rather than faking the message.
    db.exec('DROP TABLE links');
    const resp = await getLinks(makeEnv(db), 'seq_after=0');
    // Should fail-soft (empty result) rather than 500 so the Worker
    // can be deployed before the D1 migration runs (R10 ordering).
    expect(resp.status).toBe(200);
    const body = await resp.json() as { data: unknown[]; count: number };
    expect(body.data).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it('rejects invalid owner_table filter', async () => {
    const resp = await getLinks(makeEnv(db), 'owner_table=invalid_table');
    expect(resp.status).toBe(400);
    const body = await resp.json() as { error: string };
    expect(body.error).toMatch(/owner_table/i);
  });
});

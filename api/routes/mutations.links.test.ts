// mutations.links.test.ts -- Phase 2 typed-links admission tests (2026-06-20)
//
// Covers:
//   - links INSERT mutation is accepted (TABLE_FIELDS whitelist, scalar PK)
//   - links UPDATE mutation (base_seq conflict path) returns conflict on mismatch
//   - links DELETE soft-delete (deleted_at + updated_at stamped; no status co-flip)
//   - unknown field in links payload is rejected with status='error'
//   - GET /links?seq_after / include_deleted / limit filtering (links.ts handler)
//
// Decision doc: Peripheral-Brain/Context/Decisions/2026-06-20-links-table.md

import { describe, it, expect } from 'vitest';
import { nowInstant } from '../lib/time';
import { handleMutations } from './mutations';
import type { Mutation } from './mutations';
import type { Env, AuthUser } from '../helpers';
import { classifyTaskDedupSelect } from '../lib/task-dedup-sql';
import { handleGetLinks } from './links';

// ── Shared helpers ─────────────────────────────────────────────────────────────

const MOCK_USER: AuthUser = {
  email: 'ingra107@umn.edu',
  slug: 'nick-ingraham',
  isPi: true,
};

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

// ── Stub DB factory ────────────────────────────────────────────────────────────
//
// Minimal D1 stub: stores rows in a Map, tracks INSERTs/UPDATEs.

type StoreRow = Record<string, unknown>;

function makeStubDB(seed: Record<string, StoreRow> = {}) {
  const store = new Map<string, StoreRow>(Object.entries(seed));
  const processedMutations = new Map<string, StoreRow>();
  const sqlLog: string[] = [];

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),

      first: async <T>() => {
        const upper = sql.trim().toUpperCase();
        sqlLog.push(sql);

        if (upper.includes('PROCESSED_MUTATIONS')) {
          const id = boundVals[0] as string;
          return (processedMutations.get(id) ?? null) as T | null;
        }
        if (upper.includes('VALIDATION_FLAGS')) {
          return null as T | null;
        }
        // Dedup check (tasks only -- not relevant for links but guard it).
        // classifyTaskDedupSelect throws on an unrecognised `SELECT id FROM
        // tasks`, so a query edit that outruns this stub is red (#530b).
        if (classifyTaskDedupSelect(sql) === 'title') {
          return null as T | null;
        }
        // readCanonical / applyDelete idempotent check: SELECT * FROM <table> WHERE id = ?
        const id = boundVals[0] as string;
        return (store.get(id) ?? null) as T | null;
      },

      all: async <T>() => {
        sqlLog.push(sql);
        return { results: [] as T[], success: true, meta: {} };
      },

      run: async () => {
        sqlLog.push(sql);
        // Simulate INSERT into links -- store row keyed by record_id
        if (/^INSERT INTO links/i.test(sql.trim())) {
          const insertMatch = sql.match(/INSERT INTO links \(([^)]+)\) VALUES \(([^)]+)\)/i);
          if (insertMatch) {
            const id = boundVals[0] as string;
            // Build a synthetic stored row (seq assigned by trigger in real D1)
            store.set(id, {
              id,
              seq: store.size + 1,
              last_mutation_id: boundVals[boundVals.length - 1] as string,
            });
          }
        }
        if (/^UPDATE links/i.test(sql.trim())) {
          // Simulate soft-delete
          const id = boundVals[boundVals.length - 1] as string;
          const existing = store.get(id);
          if (existing) {
            store.set(id, { ...existing, deleted_at: nowInstant() });
          }
        }
        return { meta: { changes: 1 } };
      },
    };
  }

  return {
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: any[]) => {
      for (const s of stmts) await s.run();
      return [];
    },
    _store: store,
    _processedMutations: processedMutations,
    _sqlLog: sqlLog,
  };
}

function makeEnv(db: ReturnType<typeof makeStubDB>): Env {
  return { DB: db as any, KV: null as any, BUCKET: null as any } as unknown as Env;
}

// Stub Request that passes isPiRequest() (API-key bearer)
function makePiRequest(env: Env): Request {
  return new Request('https://mn-ccore-lab.pages.dev/api/mutations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // isPiRequest checks env.PB_API_KEY vs Authorization Bearer
      Authorization: 'Bearer test-api-key',
    },
    body: '{}',
  });
}

// ── Admission tests ────────────────────────────────────────────────────────────

describe('mutations.ts — links table admission', () => {
  it('accepts a valid links INSERT mutation', async () => {
    const db = makeStubDB();
    // isPiRequest needs PB_API_KEY on env to match Bearer token
    const env = { ...makeEnv(db), PB_API_KEY: 'test-api-key' } as unknown as Env;
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

    const req = new Request('https://mn-ccore-lab.pages.dev/api/mutations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      },
      body: JSON.stringify({ mutations: [mut] }),
    });

    const resp = await handleMutations(req, MOCK_USER, env);
    expect(resp.status).toBe(200);
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> };
    expect(body.results).toHaveLength(1);
    // Must be accepted (not 'unknown table' or field rejection)
    expect(body.results[0].status).toBe('accepted');
    expect(body.results[0].reason).toBeUndefined();
  });

  it('rejects an unknown field in a links payload', async () => {
    const db = makeStubDB();
    const env = { ...makeEnv(db), PB_API_KEY: 'test-api-key' } as unknown as Env;

    const mut: Mutation = makeMut({
      table: 'links',
      op: 'insert',
      record_id: 'link_01TEST00000000000000000002',
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

    const req = new Request('https://mn-ccore-lab.pages.dev/api/mutations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      },
      body: JSON.stringify({ mutations: [mut] }),
    });

    const resp = await handleMutations(req, MOCK_USER, env);
    expect(resp.status).toBe(200);
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> };
    expect(body.results[0].status).toBe('error');
    expect(body.results[0].reason).toMatch(/unknown fields for links/i);
    expect(body.results[0].reason).toMatch(/sync_status/);
  });

  it('rejects a mutation for an unlisted table (regression: links must be in ALLOWED_TABLES)', async () => {
    // This test would also catch regression if links were removed from ALLOWED_TABLES.
    const db = makeStubDB();
    const env = { ...makeEnv(db), PB_API_KEY: 'test-api-key' } as unknown as Env;

    const mut: Mutation = makeMut({
      table: 'unknown_table_xyz' as any,
      op: 'insert',
      record_id: 'xyz_01TEST',
      payload: { foo: 'bar' },
    });

    const req = new Request('https://mn-ccore-lab.pages.dev/api/mutations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      },
      body: JSON.stringify({ mutations: [mut] }),
    });

    const resp = await handleMutations(req, MOCK_USER, env);
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> };
    expect(body.results[0].status).toBe('error');
    expect(body.results[0].reason).toMatch(/unknown table/i);
  });

  it('soft-delete on links stamps deleted_at and does NOT co-set status (links has no status column)', async () => {
    // Seed an existing links row so applyDelete finds it.
    const linkId = 'link_01TEST00000000000000000003';
    const db = makeStubDB({
      [linkId]: {
        id: linkId,
        owner_table: 'tasks',
        owner_id: 'task_01TEST000000000000000001',
        role: 'key',
        type: 'google_doc',
        canonical_url: 'https://docs.google.com/document/d/abc123',
        short_title: 'Protocol draft',
        sort_order: 0,
        deleted_at: null,
        seq: 1,
        last_mutation_id: null,
        created_at: '2026-06-20 10:00:00',
        updated_at: '2026-06-20 10:00:00',
      },
    });
    const env = { ...makeEnv(db), PB_API_KEY: 'test-api-key' } as unknown as Env;

    const mut: Mutation = makeMut({
      table: 'links',
      op: 'delete',
      record_id: linkId,
    });

    const req = new Request('https://mn-ccore-lab.pages.dev/api/mutations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      },
      body: JSON.stringify({ mutations: [mut] }),
    });

    const resp = await handleMutations(req, MOCK_USER, env);
    expect(resp.status).toBe(200);
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> };
    expect(body.results[0].status).toBe('accepted');

    // The DELETE SQL must NOT include "status = 'deleted'" (links has no status column;
    // STATUS_BEARING_DELETE_TABLES only covers tasks/projects).
    const deleteSqls = db._sqlLog.filter(s => /^UPDATE links.*deleted_at/i.test(s));
    expect(deleteSqls.length).toBeGreaterThan(0);
    // None of the delete statements should co-set status='deleted'
    for (const sql of deleteSqls) {
      expect(sql).not.toMatch(/status\s*=/i);
    }
  });

  it('conflict detection works for links UPDATE (base_seq/base_row_hash path)', async () => {
    const linkId = 'link_01TEST00000000000000000004';
    const db = makeStubDB({
      [linkId]: {
        id: linkId,
        owner_table: 'tasks',
        owner_id: 'task_01TEST000000000000000001',
        role: 'key',
        type: 'google_doc',
        canonical_url: 'https://docs.google.com/document/d/abc123',
        short_title: 'Old title',
        sort_order: 0,
        deleted_at: null,
        seq: 10,  // current seq is 10
        last_mutation_id: null,
        created_at: '2026-06-20 10:00:00',
        updated_at: '2026-06-20 10:00:00',
      },
    });
    const env = { ...makeEnv(db), PB_API_KEY: 'test-api-key' } as unknown as Env;

    // Client thinks seq=5 (stale) and provides a hash that won't match
    const mut: Mutation = makeMut({
      table: 'links',
      op: 'update',
      record_id: linkId,
      base_seq: 5,
      base_row_hash: 'sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      patch: { short_title: 'New title' },
    });

    const req = new Request('https://mn-ccore-lab.pages.dev/api/mutations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      },
      body: JSON.stringify({ mutations: [mut] }),
    });

    const resp = await handleMutations(req, MOCK_USER, env);
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> };
    // seq(10) > base_seq(5) + hash mismatch => conflict
    expect(body.results[0].status).toBe('conflict');
    expect(body.results[0].reason).toMatch(/base_seq/i);
  });
});

// ── GET /links handler tests ──────────────────────────────────────────────────

describe('handleGetLinks — pull endpoint', () => {
  // Stub Request with PI auth (Bearer matches PB_API_KEY on env)
  function makePiGetRequest(queryString: string): Request {
    return new Request(`https://mn-ccore-lab.pages.dev/api/links?${queryString}`, {
      headers: { Authorization: 'Bearer test-api-key' },
    });
  }

  // Build a stub DB that returns predefined rows for the links query.
  function makeLinksDB(rows: StoreRow[]) {
    return {
      prepare: (_sql: string) => ({
        bind: (..._vals: unknown[]) => ({
          all: async <T>() => ({ results: rows as T[], success: true, meta: {} }),
        }),
      }),
    };
  }

  const sampleRow: StoreRow = {
    id: 'link_01TEST00000000000000000010',
    owner_table: 'tasks',
    owner_id: 'task_01TEST000000000000000001',
    role: 'key',
    type: 'google_doc',
    canonical_url: 'https://docs.google.com/document/d/abc123',
    short_title: 'Protocol draft',
    source_raw: null,
    sort_order: 0,
    deleted_at: null,
    seq: 1,
    last_mutation_id: null,
    created_at: '2026-06-20 10:00:00',
    updated_at: '2026-06-20 10:00:00',
  };

  it('returns { data, count } shape on a basic pull', async () => {
    const db = makeLinksDB([sampleRow]);
    const env = { DB: db, PB_API_KEY: 'test-api-key' } as unknown as Env;
    const req = makePiGetRequest('seq_after=0');
    const url = new URL(req.url);
    const resp = await handleGetLinks(url, req, env);
    expect(resp.status).toBe(200);
    const body = await resp.json() as { data: unknown[]; count: number };
    expect(body.data).toHaveLength(1);
    expect(body.count).toBe(1);
    expect((body.data[0] as Record<string, unknown>).id).toBe(sampleRow.id);
  });

  it('validates seq_after is a non-negative integer', async () => {
    const db = makeLinksDB([]);
    const env = { DB: db, PB_API_KEY: 'test-api-key' } as unknown as Env;
    const req = makePiGetRequest('seq_after=abc');
    const resp = await handleGetLinks(new URL(req.url), req, env);
    expect(resp.status).toBe(400);
    const body = await resp.json() as { error: string };
    expect(body.error).toMatch(/seq_after/i);
  });

  it('rejects non-PI callers with 403', async () => {
    const db = makeLinksDB([sampleRow]);
    // No PB_API_KEY on env, so isPiRequest fails
    const env = { DB: db, PB_API_KEY: 'DIFFERENT_KEY' } as unknown as Env;
    const req = new Request('https://mn-ccore-lab.pages.dev/api/links?seq_after=0', {
      headers: { Authorization: 'Bearer wrong-key' },
    });
    const resp = await handleGetLinks(new URL(req.url), req, env);
    expect(resp.status).toBe(403);
  });

  it('returns empty data when the links table does not exist yet', async () => {
    // Simulate "no such table: links" from D1 (migration not yet applied)
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._vals: unknown[]) => ({
          all: async () => { throw new Error('D1_ERROR: no such table: links'); },
        }),
      }),
    };
    const env = { DB: db, PB_API_KEY: 'test-api-key' } as unknown as Env;
    const req = makePiGetRequest('seq_after=0');
    const resp = await handleGetLinks(new URL(req.url), req, env);
    // Should fail-soft (empty result) rather than 500 so the Worker
    // can be deployed before the D1 migration runs (R10 ordering).
    expect(resp.status).toBe(200);
    const body = await resp.json() as { data: unknown[]; count: number };
    expect(body.data).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it('rejects invalid owner_table filter', async () => {
    const db = makeLinksDB([]);
    const env = { DB: db, PB_API_KEY: 'test-api-key' } as unknown as Env;
    const req = makePiGetRequest('owner_table=invalid_table');
    const resp = await handleGetLinks(new URL(req.url), req, env);
    expect(resp.status).toBe(400);
    const body = await resp.json() as { error: string };
    expect(body.error).toMatch(/owner_table/i);
  });
});

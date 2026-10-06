// sessions.test.ts — unit tests for GET /api/sessions seq_after cursor mode
//
// Tests:
//   1. Empty cursor (seq_after=0) returns all rows from seq=0
//   2. Cursor advances: seq_after=N filters rows with seq <= N
//   3. Limit is enforced and has_more=true when result.length === limit
//   4. Missing seq_after returns 400
//   5. Invalid seq_after (non-numeric) returns 400
//   6. Empty result returns cursor=seqAfter and has_more=false
//   7. Tombstoned rows (deleted_at IS NOT NULL) are excluded from pull results
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut's stub applied the seq filter, the ORDER BY, the LIMIT and the
// tombstone exclusion itself in JavaScript (and only when it spotted the
// literal `DELETED_AT IS NULL`), so the route's query was never run. Here the
// rows are inserted with seq left to the schema, and the route's SQL decides
// what comes back.

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { handleGetSessions } from './sessions';
import type { Session } from './sessions';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

// The handler is PI-or-API-key gated (fail-closed after I-1 fix).
const TEST_API_KEY = 'sessions-test-api-key';

function apiKeyRequest(): Request {
  return new Request('https://example.com/api/sessions', {
    headers: { Authorization: `Bearer ${TEST_API_KEY}` },
  });
}

let db: InstanceType<typeof Database>;
let env: any;
let base = 0;
const seqOf: Record<string, number> = {};

function seed(rows: Partial<Session>[]) {
  for (const r of rows) {
    const stored = insertRow(db, 'sessions', {
      session_id: r.session_id, started_at: '2026-05-01T00:00:00Z', machine_id: r.machine_id ?? 'home',
      summary: r.summary ?? null, deleted_at: r.deleted_at ?? null,
    });
    seqOf[r.session_id as string] = stored.seq as number;
  }
}

beforeEach(() => {
  db = prodSchemaDb();
  env = { DB: d1Adapter(db), PB_API_KEY: TEST_API_KEY };
  // Rows the migration chain seeds (if any) sit at or below this cursor.
  base = (db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM sessions').get() as { m: number }).m;
});

function makeUrl(params: Record<string, string>) {
  const u = new URL('https://example.com/api/sessions');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

const SAMPLE_ROWS: Partial<Session>[] = [
  { session_id: 'sess_a', machine_id: 'work' },
  { session_id: 'sess_b', machine_id: 'home' },
  { session_id: 'sess_c', machine_id: 'home' },
  { session_id: 'sess_smoke', machine_id: 'home', summary: 'smoke test' },
];

async function pull(params: Record<string, string>) {
  const res = await handleGetSessions(makeUrl(params), env, apiKeyRequest());
  expect(res.status).toBe(200);
  return await res.json() as { rows: Session[]; cursor: number; has_more: boolean };
}

describe('handleGetSessions', () => {
  beforeEach(() => seed(SAMPLE_ROWS));

  it('the schema assigns each row its own increasing seq', () => {
    const seqs = SAMPLE_ROWS.map((r) => seqOf[r.session_id as string]);
    expect(seqs.every((s) => s > base)).toBe(true);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(4);
  });

  it('returns 400 when seq_after is missing', async () => {
    const res = await handleGetSessions(new URL('https://example.com/api/sessions'), env, apiKeyRequest());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/seq_after/i);
  });

  it('returns 400 when seq_after is non-numeric', async () => {
    const res = await handleGetSessions(makeUrl({ seq_after: 'abc' }), env, apiKeyRequest());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/non-negative integer/i);
  });

  it('returns 400 when seq_after is negative', async () => {
    const res = await handleGetSessions(makeUrl({ seq_after: '-1' }), env, apiKeyRequest());
    expect(res.status).toBe(400);
  });

  it('seq_after=<base> returns all rows, cursor=max_seq, has_more=false', async () => {
    const body = await pull({ seq_after: String(base) });
    expect(body.rows.map((r) => r.session_id)).toEqual(['sess_a', 'sess_b', 'sess_c', 'sess_smoke']);
    expect(body.cursor).toBe(seqOf.sess_smoke);
    expect(body.has_more).toBe(false);
  });

  it('cursor advances: seq_after=<seq of sess_b> returns only later rows', async () => {
    const body = await pull({ seq_after: String(seqOf.sess_b) });
    expect(body.rows.map((r) => r.session_id)).toEqual(['sess_c', 'sess_smoke']);
    expect(body.cursor).toBe(seqOf.sess_smoke);
    expect(body.has_more).toBe(false);
  });

  it('limit is enforced and has_more=true when result fills the limit', async () => {
    const body = await pull({ seq_after: String(base), limit: '2' });
    expect(body.rows.map((r) => r.session_id)).toEqual(['sess_a', 'sess_b']);
    expect(body.cursor).toBe(seqOf.sess_b); // max seq in result set
    expect(body.has_more).toBe(true);
  });

  it('empty result returns cursor=seqAfter and has_more=false', async () => {
    const body = await pull({ seq_after: '999999' });
    expect(body.rows).toHaveLength(0);
    expect(body.cursor).toBe(999999); // stays at seqAfter when no rows returned
    expect(body.has_more).toBe(false);
  });
});

describe('handleGetSessions — ordering', () => {
  it('rows come back in seq ASC order even when inserted out of seq order', async () => {
    // Explicit seqs, inserted shuffled, so rowid order != seq order: only the
    // route's ORDER BY seq puts them right.
    for (const [id, off] of [['sess_z3', 3], ['sess_z1', 1], ['sess_z4', 4], ['sess_z2', 2]] as const) {
      insertRow(db, 'sessions', { session_id: id, started_at: '2026-05-01T00:00:00Z', machine_id: 'home', seq: base + off })
    }
    const body = await pull({ seq_after: String(base) })
    expect(body.rows.map((r) => r.session_id)).toEqual(['sess_z1', 'sess_z2', 'sess_z3', 'sess_z4'])
    expect(body.rows.map((r) => r.seq)).toEqual([base + 1, base + 2, base + 3, base + 4])
  })
})

describe('handleGetSessions — tombstones', () => {
  it('tombstoned sessions (deleted_at IS NOT NULL) are excluded from pull results', async () => {
    // Mix of live and tombstoned rows (schema-v65 — 36 tombstones from Phase 3 Task 9 cleanup)
    seed([
      { session_id: 'sess_live_1', deleted_at: null },
      { session_id: 'session_2026-05-07T10-14-31-299429', deleted_at: '2026-05-07T10:14:31Z' },
      { session_id: 'sess_live_2', deleted_at: null },
      { session_id: 'sess_tombstone_2', deleted_at: '2026-05-08T00:00:00Z' },
    ]);
    const body = await pull({ seq_after: String(base) });
    expect(body.rows.map((r) => r.session_id)).toEqual(['sess_live_1', 'sess_live_2']);
    // Cursor reflects max seq of returned rows.
    expect(body.cursor).toBe(seqOf.sess_live_2);
    expect(body.has_more).toBe(false);
  });
});

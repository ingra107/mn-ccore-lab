// lane3.test.ts — unit tests for GET /api/lane3/:table seq-cursor list endpoint
//
// Tests:
//   1. Empty cursor returns all rows for the requested table
//   2. Cursor advances: seq_after=N filters rows with seq <= N
//   3. Limit is enforced and has_more=true when result.length === limit
//   4. Missing seq_after returns 400
//   5. Invalid seq_after (non-numeric, negative) returns 400
//   6. Empty result returns cursor=seqAfter and has_more=false
//   7. Unknown table returns 400 with eligible table list
//   8. `sessions` is NOT eligible (use /api/sessions for tombstone handling)
//   9. Tables outside Lane 3 (tasks, projects) return 400
//  10. Each Lane 3 table queried hits its own SELECT (table name isolation)
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut parsed the table name out of the route's SQL with a regex and
// filtered a JavaScript array, so a route that queried the wrong table or the
// wrong cursor column could still pass. Here every eligible table must exist
// in the migrated schema and answer the route's real query, and seq is
// assigned by the schema rather than written into the fixture.

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { handleLane3List, LANE3_PULL_TABLES } from './lane3';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

// The handler is PI-or-API-key gated (fail-closed after I-1 fix).
const TEST_API_KEY = 'lane3-test-api-key';

function apiKeyRequest(): Request {
  return new Request('https://example.com/api/lane3/test', {
    headers: { Authorization: `Bearer ${TEST_API_KEY}` },
  });
}

type Row = Record<string, unknown> & { seq: number };

let db: InstanceType<typeof Database>;
let env: any;
const maxSeq = (table: string) => (db.prepare(`SELECT COALESCE(MAX(seq), 0) AS m FROM ${table}`).get() as { m: number }).m;
let akBase = 0;
let ak: Row[] = [];

beforeEach(() => {
  db = prodSchemaDb();
  env = { DB: d1Adapter(db), PB_API_KEY: TEST_API_KEY };
  akBase = maxSeq('agent_knowledge');
  ak = [
    { category: 'cat1', topic: 'topic1', knowledge: 'k1', machine_id: 'work' },
    { category: 'cat1', topic: 'topic2', knowledge: 'k2', machine_id: 'home' },
    { category: 'cat2', topic: 'topic3', knowledge: 'k3', machine_id: 'home' },
  ].map((r) => insertRow(db, 'agent_knowledge', r) as Row);
});

function makeUrl(table: string, params: Record<string, string>) {
  const u = new URL(`https://example.com/api/lane3/${table}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}
async function list(table: string, params: Record<string, string>) {
  const res = await handleLane3List(table, makeUrl(table, params), env, apiKeyRequest());
  expect(res.status).toBe(200);
  return (await res.json()) as { rows: Row[]; cursor: number; has_more: boolean };
}

describe('handleLane3List', () => {
  it('the schema assigns increasing seq to the seeded rows', () => {
    const seqs = ak.map((r) => r.seq);
    expect(seqs.every((s) => s > akBase)).toBe(true);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it('returns 400 for unknown table', async () => {
    const res = await handleLane3List('bogus_table', makeUrl('bogus_table', { seq_after: '0' }), env, apiKeyRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not eligible/i);
    expect(body.error).toMatch(/agent_knowledge/);
  });

  it("returns 400 for 'sessions' (use /api/sessions instead)", async () => {
    const res = await handleLane3List('sessions', makeUrl('sessions', { seq_after: '0' }), env, apiKeyRequest());
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-Lane-3 tables (tasks, projects)', async () => {
    for (const t of ['tasks', 'projects', 'inbox_events']) {
      const res = await handleLane3List(t, makeUrl(t, { seq_after: '0' }), env, apiKeyRequest());
      expect(res.status).toBe(400);
    }
  });

  it('returns 400 when seq_after is missing', async () => {
    const url = new URL('https://example.com/api/lane3/agent_knowledge');
    const res = await handleLane3List('agent_knowledge', url, env, apiKeyRequest());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/seq_after/i);
  });

  it('returns 400 when seq_after is non-numeric or negative', async () => {
    for (const v of ['abc', '-1']) {
      const res = await handleLane3List('agent_knowledge', makeUrl('agent_knowledge', { seq_after: v }), env, apiKeyRequest());
      expect(res.status).toBe(400);
    }
  });

  it('seq_after=<base> returns all agent_knowledge rows, cursor=max_seq, has_more=false', async () => {
    const body = await list('agent_knowledge', { seq_after: String(akBase) });
    expect(body.rows.map((r) => r.topic)).toEqual(['topic1', 'topic2', 'topic3']);
    expect(body.cursor).toBe(ak[2].seq);
    expect(body.has_more).toBe(false);
    expect(body.rows[0].category).toBe('cat1');
  });

  it('cursor advances: seq_after=<first seq> returns later rows only', async () => {
    const body = await list('agent_knowledge', { seq_after: String(ak[0].seq) });
    expect(body.rows.map((r) => r.topic)).toEqual(['topic2', 'topic3']);
    expect(body.cursor).toBe(ak[2].seq);
    expect(body.has_more).toBe(false);
  });

  it('limit is enforced and has_more=true when result fills the limit', async () => {
    const body = await list('agent_knowledge', { seq_after: String(akBase), limit: '2' });
    expect(body.rows).toHaveLength(2);
    expect(body.cursor).toBe(ak[1].seq);
    expect(body.has_more).toBe(true);
  });

  it('empty result returns cursor=seqAfter and has_more=false', async () => {
    const body = await list('agent_knowledge', { seq_after: '999999' });
    expect(body.rows).toHaveLength(0);
    expect(body.cursor).toBe(999999);
    expect(body.has_more).toBe(false);
  });

  it('table isolation: queries only the requested table', async () => {
    const mfBase = maxSeq('memory_facts');
    insertRow(db, 'memory_facts', { id: 'mf_1' });
    insertRow(db, 'memory_facts', { id: 'mf_2' });
    const mf = await list('memory_facts', { seq_after: String(mfBase) });
    expect(mf.rows.map((r) => r.id)).toEqual(['mf_1', 'mf_2']);
    // agent_knowledge still answers with only its own rows.
    const akRows = await list('agent_knowledge', { seq_after: String(akBase) });
    expect(akRows.rows).toHaveLength(3);
  });

  it('every eligible table exists in the migrated schema and answers the route query', async () => {
    for (const t of LANE3_PULL_TABLES) {
      const body = await list(t, { seq_after: '999999' });
      expect(body.rows, t).toEqual([]);
    }
  });

  it('LANE3_PULL_TABLES covers the 8 non-sessions Lane 3 tables', () => {
    expect(LANE3_PULL_TABLES).toEqual(
      new Set([
        'agent_knowledge',
        'memory_facts',
        'pomodoro_sessions',
        'decisions',
        'kg_entities',
        'kg_relations',
        'kg_relation_type_registry',
        'trajectories',
      ]),
    );
    // sessions explicitly excluded — handled by /api/sessions
    expect(LANE3_PULL_TABLES.has('sessions')).toBe(false);
  });
});

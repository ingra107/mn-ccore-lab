// lane3.test.ts — unit tests for GET /api/lane3/:table seq-cursor list endpoint
//
// Tests:
//   1. Empty cursor (seq_after=0) returns all rows for the requested table
//   2. Cursor advances: seq_after=N filters rows with seq <= N
//   3. Limit is enforced and has_more=true when result.length === limit
//   4. Missing seq_after returns 400
//   5. Invalid seq_after (non-numeric, negative) returns 400
//   6. Empty result returns cursor=seqAfter and has_more=false
//   7. Unknown table returns 400 with eligible table list
//   8. `sessions` is NOT eligible (use /api/sessions for tombstone handling)
//   9. Tables outside Lane 3 (tasks, projects) return 400
//  10. Each Lane 3 table queried hits its own SELECT (table name isolation)

import { describe, it, expect } from 'vitest';
import { handleLane3List, LANE3_PULL_TABLES } from './lane3';

// In-memory D1 stub: keyed by table name, returns rows by seq filter.
type Row = Record<string, unknown> & { seq: number };

function makeDb(byTable: Record<string, Partial<Row>[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(byTable)) {
    tables[t] = rows.map((r, i) => ({ seq: i + 1, ...r })) as Row[];
  }

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) =>
        makeStmt(sql, [...boundVals, ...more]),
      all: async <T>() => {
        // Pattern: SELECT * FROM <table> WHERE seq > ? ORDER BY seq ASC LIMIT ?
        const m = /FROM\s+([a-z_]+)\s+WHERE\s+seq\s+>\s+\?/i.exec(sql);
        if (!m) return { results: [] as T[], success: true, meta: {} };
        const table = m[1];
        const seqAfter = Number(boundVals[0]);
        const limit = Number(boundVals[1]);
        const rows = (tables[table] ?? [])
          .filter((r) => r.seq > seqAfter)
          .sort((a, b) => a.seq - b.seq)
          .slice(0, limit);
        return { results: rows as unknown as T[], success: true, meta: {} };
      },
      first: async () => null,
      run: async () => ({ success: true, meta: {}, results: [] }),
    };
  }

  return {
    prepare: (sql: string) => makeStmt(sql, []),
    batch: (_stmts: unknown[]) => Promise.resolve([]),
  };
}

function makeEnv(byTable: Record<string, Partial<Row>[]>) {
  return { DB: makeDb(byTable) } as any;
}

function makeUrl(table: string, params: Record<string, string>) {
  const u = new URL(`https://example.com/api/lane3/${table}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

const SAMPLE_KNOWLEDGE: Partial<Row>[] = [
  { category: 'cat1', topic: 'topic1', knowledge: 'k1', seq: 1, machine_id: 'work' },
  { category: 'cat1', topic: 'topic2', knowledge: 'k2', seq: 2, machine_id: 'home' },
  { category: 'cat2', topic: 'topic3', knowledge: 'k3', seq: 3, machine_id: 'home' },
];


describe('handleLane3List', () => {
  it('returns 400 for unknown table', async () => {
    const env = makeEnv({});
    const url = makeUrl('bogus_table', { seq_after: '0' });
    const res = await handleLane3List('bogus_table', url, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not eligible/i);
    expect(body.error).toMatch(/agent_knowledge/);
  });

  it("returns 400 for 'sessions' (use /api/sessions instead)", async () => {
    const env = makeEnv({});
    const url = makeUrl('sessions', { seq_after: '0' });
    const res = await handleLane3List('sessions', url, env);
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-Lane-3 tables (tasks, projects)', async () => {
    const env = makeEnv({});
    for (const t of ['tasks', 'projects', 'inbox_events']) {
      const url = makeUrl(t, { seq_after: '0' });
      const res = await handleLane3List(t, url, env);
      expect(res.status).toBe(400);
    }
  });

  it('returns 400 when seq_after is missing', async () => {
    const env = makeEnv({ agent_knowledge: SAMPLE_KNOWLEDGE });
    const url = new URL('https://example.com/api/lane3/agent_knowledge');
    const res = await handleLane3List('agent_knowledge', url, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/seq_after/i);
  });

  it('returns 400 when seq_after is non-numeric', async () => {
    const env = makeEnv({ agent_knowledge: SAMPLE_KNOWLEDGE });
    const url = makeUrl('agent_knowledge', { seq_after: 'abc' });
    const res = await handleLane3List('agent_knowledge', url, env);
    expect(res.status).toBe(400);
  });

  it('returns 400 when seq_after is negative', async () => {
    const env = makeEnv({ agent_knowledge: SAMPLE_KNOWLEDGE });
    const url = makeUrl('agent_knowledge', { seq_after: '-1' });
    const res = await handleLane3List('agent_knowledge', url, env);
    expect(res.status).toBe(400);
  });

  it('seq_after=0 returns all agent_knowledge rows, cursor=max_seq, has_more=false', async () => {
    const env = makeEnv({ agent_knowledge: SAMPLE_KNOWLEDGE });
    const url = makeUrl('agent_knowledge', { seq_after: '0' });
    const res = await handleLane3List('agent_knowledge', url, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: Row[];
      cursor: number;
      has_more: boolean;
    };
    expect(body.rows).toHaveLength(3);
    expect(body.cursor).toBe(3);
    expect(body.has_more).toBe(false);
    expect(body.rows[0].category).toBe('cat1');
    expect(body.rows[0].topic).toBe('topic1');
  });

  it('cursor advances: seq_after=1 returns rows with seq > 1 only', async () => {
    const env = makeEnv({ agent_knowledge: SAMPLE_KNOWLEDGE });
    const url = makeUrl('agent_knowledge', { seq_after: '1' });
    const res = await handleLane3List('agent_knowledge', url, env);
    const body = (await res.json()) as { rows: Row[]; cursor: number; has_more: boolean };
    expect(body.rows).toHaveLength(2);
    expect(body.rows.map((r) => r.topic)).toEqual(['topic2', 'topic3']);
    expect(body.cursor).toBe(3);
    expect(body.has_more).toBe(false);
  });

  it('limit is enforced and has_more=true when result fills the limit', async () => {
    const env = makeEnv({ agent_knowledge: SAMPLE_KNOWLEDGE });
    const url = makeUrl('agent_knowledge', { seq_after: '0', limit: '2' });
    const res = await handleLane3List('agent_knowledge', url, env);
    const body = (await res.json()) as { rows: Row[]; cursor: number; has_more: boolean };
    expect(body.rows).toHaveLength(2);
    expect(body.cursor).toBe(2);
    expect(body.has_more).toBe(true);
  });

  it('empty result returns cursor=seqAfter and has_more=false', async () => {
    const env = makeEnv({ agent_knowledge: SAMPLE_KNOWLEDGE });
    const url = makeUrl('agent_knowledge', { seq_after: '9999' });
    const res = await handleLane3List('agent_knowledge', url, env);
    const body = (await res.json()) as { rows: Row[]; cursor: number; has_more: boolean };
    expect(body.rows).toHaveLength(0);
    expect(body.cursor).toBe(9999);
    expect(body.has_more).toBe(false);
  });

  it('table isolation: queries only the requested table', async () => {
    const env = makeEnv({
      agent_knowledge: [{ category: 'A', topic: 'ak', seq: 1 }],
      memory_facts: [{ id: 'mf_1', seq: 1 }, { id: 'mf_2', seq: 2 }],
      decisions: [{ context_id: 'd1', seq: 1 }],
    });

    const ak = await handleLane3List(
      'agent_knowledge',
      makeUrl('agent_knowledge', { seq_after: '0' }),
      env,
    );
    const akBody = (await ak.json()) as { rows: Row[] };
    expect(akBody.rows).toHaveLength(1);
    expect(akBody.rows[0].category).toBe('A');

    const mf = await handleLane3List(
      'memory_facts',
      makeUrl('memory_facts', { seq_after: '0' }),
      env,
    );
    const mfBody = (await mf.json()) as { rows: Row[] };
    expect(mfBody.rows).toHaveLength(2);
    expect(mfBody.rows.map((r) => r.id)).toEqual(['mf_1', 'mf_2']);
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

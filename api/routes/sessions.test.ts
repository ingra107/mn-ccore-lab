// sessions.test.ts — unit tests for GET /api/sessions seq_after cursor mode
//
// Uses the same in-memory D1 stub pattern as pb-sector.test.ts.
// Tests:
//   1. Empty cursor (seq_after=0) returns all rows from seq=0
//   2. Cursor advances: seq_after=N filters rows with seq <= N
//   3. Limit is enforced and has_more=true when result.length === limit
//   4. Missing seq_after returns 400
//   5. Invalid seq_after (non-numeric) returns 400
//   6. Empty result returns cursor=seqAfter and has_more=false

import { describe, it, expect } from 'vitest';
import { handleSessions } from './sessions';
import type { Session } from './sessions';

// ── Shared D1 stub ──────────────────────────────────────────────────────────

// Store of sessions rows indexed by session_id, with seq values.
function makeSessionDb(rows: Partial<Session>[]) {
  // Normalise rows: ensure seq is set
  const store: Session[] = rows.map((r, i) => ({
    session_id: r.session_id ?? `sess_${i + 1}`,
    started_at: r.started_at ?? '2026-05-01T00:00:00Z',
    ended_at: r.ended_at ?? null,
    summary: r.summary ?? null,
    context: r.context ?? null,
    projects_touched: r.projects_touched ?? null,
    skills_used: r.skills_used ?? null,
    token_estimate: r.token_estimate ?? null,
    machine_id: r.machine_id ?? 'home',
    seq: r.seq ?? i + 1,
    created_at: r.created_at ?? '2026-05-01T00:00:00Z',
    updated_at: r.updated_at ?? '2026-05-01T00:00:00Z',
    last_mutation_id: r.last_mutation_id ?? null,
  }));

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      all: async <T>() => {
        // Parse: SELECT * FROM sessions WHERE seq > ? ORDER BY seq ASC LIMIT ?
        const upper = sql.trim().toUpperCase();
        if (upper.includes('FROM SESSIONS') && upper.includes('SEQ >')) {
          const seqAfter = Number(boundVals[0]);
          const limit = Number(boundVals[1]);
          const filtered = store
            .filter((r) => r.seq > seqAfter)
            .sort((a, b) => a.seq - b.seq)
            .slice(0, limit);
          return { results: filtered as unknown as T[], success: true, meta: {} };
        }
        return { results: [] as T[], success: true, meta: {} };
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

function makeEnv(rows: Partial<Session>[]) {
  return { DB: makeSessionDb(rows) } as any;
}

function makeUrl(params: Record<string, string>) {
  const u = new URL('https://example.com/api/sessions');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

// ── Test fixtures ────────────────────────────────────────────────────────────

const SAMPLE_ROWS: Partial<Session>[] = [
  { session_id: 'sess_a', seq: 1, machine_id: 'work' },
  { session_id: 'sess_b', seq: 2, machine_id: 'home' },
  { session_id: 'sess_c', seq: 3, machine_id: 'home' },
  { session_id: 'sess_smoke', seq: 4, machine_id: 'home', summary: 'smoke test' },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('handleSessions', () => {
  it('returns 400 when seq_after is missing', async () => {
    const env = makeEnv(SAMPLE_ROWS);
    const url = new URL('https://example.com/api/sessions');
    const res = await handleSessions(url, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/seq_after/i);
  });

  it('returns 400 when seq_after is non-numeric', async () => {
    const env = makeEnv(SAMPLE_ROWS);
    const url = makeUrl({ seq_after: 'abc' });
    const res = await handleSessions(url, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/non-negative integer/i);
  });

  it('returns 400 when seq_after is negative', async () => {
    const env = makeEnv(SAMPLE_ROWS);
    const url = makeUrl({ seq_after: '-1' });
    const res = await handleSessions(url, env);
    expect(res.status).toBe(400);
  });

  it('seq_after=0 returns all rows, cursor=max_seq, has_more=false', async () => {
    const env = makeEnv(SAMPLE_ROWS);
    const url = makeUrl({ seq_after: '0' });
    const res = await handleSessions(url, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: Session[]; cursor: number; has_more: boolean };
    expect(body.rows).toHaveLength(4);
    expect(body.rows[0].session_id).toBe('sess_a');
    expect(body.rows[3].session_id).toBe('sess_smoke');
    expect(body.cursor).toBe(4);
    expect(body.has_more).toBe(false);
  });

  it('cursor advances: seq_after=2 returns only rows with seq > 2', async () => {
    const env = makeEnv(SAMPLE_ROWS);
    const url = makeUrl({ seq_after: '2' });
    const res = await handleSessions(url, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: Session[]; cursor: number; has_more: boolean };
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].session_id).toBe('sess_c');
    expect(body.rows[1].session_id).toBe('sess_smoke');
    expect(body.cursor).toBe(4);
    expect(body.has_more).toBe(false);
  });

  it('limit is enforced and has_more=true when result fills the limit', async () => {
    const env = makeEnv(SAMPLE_ROWS);
    const url = makeUrl({ seq_after: '0', limit: '2' });
    const res = await handleSessions(url, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: Session[]; cursor: number; has_more: boolean };
    expect(body.rows).toHaveLength(2);
    expect(body.cursor).toBe(2); // max seq in result set
    expect(body.has_more).toBe(true);
  });

  it('empty result returns cursor=seqAfter and has_more=false', async () => {
    const env = makeEnv(SAMPLE_ROWS);
    const url = makeUrl({ seq_after: '9999' });
    const res = await handleSessions(url, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: Session[]; cursor: number; has_more: boolean };
    expect(body.rows).toHaveLength(0);
    expect(body.cursor).toBe(9999); // stays at seqAfter when no rows returned
    expect(body.has_more).toBe(false);
  });

  it('rows are ordered by seq ASC', async () => {
    const env = makeEnv(SAMPLE_ROWS);
    const url = makeUrl({ seq_after: '0' });
    const res = await handleSessions(url, env);
    const body = await res.json() as { rows: Session[] };
    const seqs = body.rows.map((r) => r.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });
});

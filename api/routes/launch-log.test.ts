// api/routes/launch-log.test.ts
import { describe, it, expect } from 'vitest';
import type { Env } from '../helpers';
import { handleCreateLaunch, handleListLaunches, handleSetLaunchStatus, handleClaimLaunch, handleListPendingLaunches } from './launch-log';

function makeDb(seed: { rows?: any[]; first?: any } = {}) {
  const captured: Array<{ sql: string; binds: unknown[] }> = [];
  const db: any = {
    _captured: captured,
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt: any = {
        bind: (...a: unknown[]) => { binds = [...binds, ...a]; return stmt; },
        run: async () => { captured.push({ sql, binds: [...binds] }); return { success: true }; },
        first: async () => seed.first ?? null,
        all: async () => ({ results: seed.rows ?? [] }),
      };
      return stmt;
    },
  };
  return db;
}
function req(body: unknown, url = 'https://x/api/launch-log') {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const USER = { email: 'ingra107@umn.edu', name: 'Nick' };

describe('handleCreateLaunch', () => {
  it('inserts a launch_log row and returns 201 with the seed stored', async () => {
    const db = makeDb({ first: { id: 'L1', tag: 'quickchat', seed: 'fix the figure', origin: 'computer', status: 'launched' } });
    const env = { DB: db } as unknown as Env;
    const res = await handleCreateLaunch(req({ tag: 'quickchat', seed: 'fix the figure', origin: 'computer', status: 'launched' }), USER, env);
    expect(res.status).toBe(201);
    const insert = db._captured.find((c: any) => /INSERT INTO launch_log/.test(c.sql));
    expect(insert).toBeDefined();
    expect(insert.binds).toContain('fix the figure');
    expect(insert.binds).toContain('ingra107@umn.edu'); // requested_by
  });

  it('rejects an unknown tag with 400', async () => {
    const env = { DB: makeDb() } as unknown as Env;
    const res = await handleCreateLaunch(req({ tag: 'bogus', seed: 'x', origin: 'computer' }), USER, env);
    expect(res.status).toBe(400);
  });
});

// ── makeDbForClaim: variant that returns meta.changes from run() ──────────────
function makeDbForClaim({ changes = 1, firstRow = null as any } = {}) {
  const db: any = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt: any = {
        bind: (...a: unknown[]) => { binds = [...binds, ...a]; return stmt; },
        run:   async () => ({ meta: { changes } }),
        first: async () => firstRow,
        all:   async () => ({ results: [] }),
      };
      return stmt;
    },
  };
  return db;
}
function claimReq(id: string) {
  return new Request(`https://x/api/launch-log/${id}/claim`, { method: 'POST' });
}

describe('handleClaimLaunch', () => {
  it('returns 200 with verb/seed/project_slug when token is valid', async () => {
    const firstRow = { tag: 'quickchat', seed: 'fix the figure', project_slug: 'pb-sector' };
    const db = makeDbForClaim({ changes: 1, firstRow });
    const env = { DB: db } as unknown as Env;
    const res = await handleClaimLaunch('lnch_abc', claimReq('lnch_abc'), USER, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.verb).toBe('quickchat');
    expect(body.data.seed).toBe('fix the figure');
    expect(body.data.project_slug).toBe('pb-sector');
  });

  it('returns 410 on second claim (consumed_at already set — changes=0)', async () => {
    const db = makeDbForClaim({ changes: 0 });
    const env = { DB: db } as unknown as Env;
    const res = await handleClaimLaunch('lnch_abc', claimReq('lnch_abc'), USER, env);
    expect(res.status).toBe(410);
  });

  it('returns 410 when token is expired (changes=0)', async () => {
    const db = makeDbForClaim({ changes: 0 });
    const env = { DB: db } as unknown as Env;
    const res = await handleClaimLaunch('lnch_expired', claimReq('lnch_expired'), USER, env);
    expect(res.status).toBe(410);
  });

  it('returns 410 for an unknown id (changes=0)', async () => {
    const db = makeDbForClaim({ changes: 0 });
    const env = { DB: db } as unknown as Env;
    const res = await handleClaimLaunch('lnch_unknown', claimReq('lnch_unknown'), USER, env);
    expect(res.status).toBe(410);
  });

  it('returns 410 for a legacy row with NULL expires_at (expires_at IS NOT NULL guard rejects)', async () => {
    // Legacy rows have NULL expires_at — the WHERE clause rejects them (changes=0)
    const db = makeDbForClaim({ changes: 0 });
    const env = { DB: db } as unknown as Env;
    const res = await handleClaimLaunch('lnch_legacy', claimReq('lnch_legacy'), USER, env);
    expect(res.status).toBe(410);
  });
});

// ── makeDbForPending: captures all() SQL for assertion ───────────────────────
function makeDbForPending(rows: any[] = []) {
  const captured: Array<{ sql: string }> = [];
  const db: any = {
    _captured: captured,
    prepare(sql: string) {
      const stmt: any = {
        bind: () => stmt,
        run: async () => ({ success: true }),
        first: async () => null,
        all: async () => { captured.push({ sql }); return { results: rows }; },
      };
      return stmt;
    },
  };
  return db;
}

describe('handleListPendingLaunches', () => {
  it('returns pending mobile unconsumed unexpired rows unscoped by requested_by', async () => {
    const rows = [
      { id: 'lnch_a', created_at: '2026-06-26T01:00:00Z' },
      { id: 'lnch_b', created_at: '2026-06-26T01:01:00Z' },
    ];
    const db = makeDbForPending(rows);
    const env = { DB: db } as unknown as Env;
    const res = await handleListPendingLaunches(env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe('lnch_a');
    expect(body.data[1].id).toBe('lnch_b');
  });

  it('SQL is unscoped (no requested_by filter) and projects only id + created_at', async () => {
    const db = makeDbForPending([]);
    const env = { DB: db } as unknown as Env;
    await handleListPendingLaunches(env);
    const { sql } = db._captured[0];
    expect(sql).toContain("status='pending'");
    expect(sql).toContain("origin='mobile'");
    expect(sql).toContain('consumed_at IS NULL');
    expect(sql).toContain("expires_at > datetime('now')");
    expect(sql).toContain('SELECT id, created_at');
    // unscoped: a row owned by a different requested_by is still returned
    expect(sql).not.toContain('requested_by');
  });

  it('response carries no seed field (SELECT projects id + created_at only)', async () => {
    const rows = [{ id: 'lnch_c', created_at: '2026-06-26T02:00:00Z' }];
    const db = makeDbForPending(rows);
    const env = { DB: db } as unknown as Env;
    const res = await handleListPendingLaunches(env);
    const body = await res.json() as any;
    expect(body.data[0]).toHaveProperty('id');
    expect(body.data[0]).toHaveProperty('created_at');
    expect(body.data[0]).not.toHaveProperty('seed');
  });

  it('returns empty array when no pending mobile rows exist', async () => {
    const db = makeDbForPending([]);
    const env = { DB: db } as unknown as Env;
    const res = await handleListPendingLaunches(env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data).toHaveLength(0);
  });

  // 403 for non-PI callers is enforced by app.use('/api/pb/*') middleware (index.ts:282),
  // not this handler — no per-handler auth check required or tested here.
});

describe('handleSetLaunchStatus', () => {
  it('updates status + launched_at and returns the row', async () => {
    const db = makeDb({ first: { id: 'L1', status: 'launched' } });
    const env = { DB: db } as unknown as Env;
    const res = await handleSetLaunchStatus('L1', req({ status: 'launched' }), USER, env);
    expect(res.status).toBe(200);
    const upd = db._captured.find((c: any) => /UPDATE launch_log SET status/.test(c.sql));
    expect(upd.binds).toContain('launched');
    expect(upd.sql).toContain('launched_at');
  });

  it('returns 404 when a different user tries to update', async () => {
    const db = makeDb({ first: null });
    const env = { DB: db } as unknown as Env;
    const other = { email: 'someone@else.com', name: 'Other' };
    const res = await handleSetLaunchStatus('L1', req({ status: 'launched' }), other, env);
    expect(res.status).toBe(404);
  });
});

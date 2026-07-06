// api/routes/launch-log.test.ts
import { describe, it, expect } from 'vitest';
import type { Env } from '../helpers';
import { handleCreateLaunch, handleListLaunches, handleSetLaunchStatus, handleClaimLaunch, handleListPendingLaunches, handleRefireLaunch } from './launch-log';

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

  it('stores task_id when the launch fired from a task compose surface (#485)', async () => {
    const db = makeDb({ first: { id: 'L2', tag: 'quickchat', seed: 'x', task_id: 'task_1' } });
    const env = { DB: db } as unknown as Env;
    const res = await handleCreateLaunch(req({ tag: 'quickchat', seed: 'x', origin: 'computer', task_id: 'task_1' }), USER, env);
    expect(res.status).toBe(201);
    const insert = db._captured.find((c: any) => /INSERT INTO launch_log/.test(c.sql));
    expect(insert.sql).toContain('task_id');
    expect(insert.binds).toContain('task_1');
  });

  it('stores task_id as NULL for a context-free launch (Today bar #485)', async () => {
    const db = makeDb({ first: { id: 'L3', tag: 'quickchat', seed: 'x' } });
    const env = { DB: db } as unknown as Env;
    const res = await handleCreateLaunch(req({ tag: 'quickchat', seed: 'x', origin: 'computer' }), USER, env);
    expect(res.status).toBe(201);
    const insert = db._captured.find((c: any) => /INSERT INTO launch_log/.test(c.sql));
    // task_id column present in the INSERT, bound to null when absent from the body.
    expect(insert.sql).toContain('task_id');
    expect(insert.binds).toContain(null);
  });
});

describe('handleRefireLaunch', () => {
  it('carries task_id forward into the cloned launch (#485)', async () => {
    // The source row has a task_id; refire re-POSTs it so the clone keeps task
    // context (the new row re-composes fresh context at its own claim).
    const db = makeDb({ first: { id: 'L4', tag: 'workon', seed: 's', origin: 'computer', target_machine: null, project_slug: 'p', task_id: 'task_9' } });
    const env = { DB: db } as unknown as Env;
    const res = await handleRefireLaunch('L4', USER, env);
    expect(res.status).toBe(201);
    const insert = db._captured.find((c: any) => /INSERT INTO launch_log/.test(c.sql));
    expect(insert.binds).toContain('task_9');
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

describe('handleClaimLaunch — task-context composition (#485)', () => {
  // NOTE: this is the SINGLE seed-to-session exit for BOTH the computer route
  // (resolve_launch.py) AND the mobile route (hub_ai_listener claims the same
  // endpoint), so these cases cover the "forward path" too — there is no
  // separate worker-side forward that reads the seed.
  // The claim runs ONE LEFT-JOINed SELECT (launch row + task context), so the
  // plain makeDbForClaim stub serves these too — firstRow is the flat joined row.
  const taskCols = {
    task_pk: 'task_1',
    task_title: 'Wire the freshness guard',
    task_status: 'in_progress',
    task_due: '2026-07-10',
    task_description: 'Guard TODAY.md regen against stale frontmatter.',
    project_name: 'PB Sector',
  };

  it('prepends the task-context header and preserves the raw seed after a blank line', async () => {
    const firstRow = { tag: 'quickchat', seed: 'has it been done?', project_slug: 'pb-sector', task_id: 'task_1', ...taskCols };
    const db = makeDbForClaim({ changes: 1, firstRow });
    const env = { DB: db } as unknown as Env;
    const res = await handleClaimLaunch('lnch_ctx', claimReq('lnch_ctx'), USER, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.verb).toBe('quickchat');
    expect(body.data.project_slug).toBe('pb-sector');
    expect(body.data.seed).toContain('[Task context');
    expect(body.data.seed).toContain('Wire the freshness guard');
    expect(body.data.seed).toContain('in_progress');
    expect(body.data.seed).toContain('PB Sector');
    expect(body.data.seed).toContain('Guard TODAY.md regen');
    // header, blank line, then the raw seed verbatim at the end
    expect(body.data.seed).toContain('\n\nhas it been done?');
    expect(body.data.seed.endsWith('has it been done?')).toBe(true);
  });

  it('returns the raw seed unchanged when the launch carried no task_id', async () => {
    const firstRow = { tag: 'quickchat', seed: 'fix the figure', project_slug: null, task_id: null };
    const db = makeDbForClaim({ changes: 1, firstRow });
    const env = { DB: db } as unknown as Env;
    const res = await handleClaimLaunch('lnch_raw', claimReq('lnch_raw'), USER, env);
    const body = await res.json() as any;
    expect(body.data.seed).toBe('fix the figure');
  });

  it('falls back to the raw seed when task_id points to a missing/deleted task', async () => {
    // Join sentinel: task_id set but task_pk NULL (deleted_at guard nulled the join)
    const firstRow = { tag: 'workon', seed: 'pick this up', project_slug: 'x', task_id: 'task_gone', task_pk: null };
    const db = makeDbForClaim({ changes: 1, firstRow });
    const env = { DB: db } as unknown as Env;
    const res = await handleClaimLaunch('lnch_miss', claimReq('lnch_miss'), USER, env);
    const body = await res.json() as any;
    expect(body.data.seed).toBe('pick this up');
  });

  it('truncates a long description to keep the header bounded', async () => {
    const longDesc = 'x'.repeat(900);
    const firstRow = { tag: 'workon', seed: 'go', project_slug: 'x', task_id: 'task_long', ...taskCols, task_description: longDesc };
    const db = makeDbForClaim({ changes: 1, firstRow });
    const env = { DB: db } as unknown as Env;
    const res = await handleClaimLaunch('lnch_long', claimReq('lnch_long'), USER, env);
    const body = await res.json() as any;
    // 500-char cap + ellipsis; the full 900-char description never appears.
    expect(body.data.seed).toContain('…');
    expect(body.data.seed).not.toContain('x'.repeat(600));
    expect(body.data.seed.endsWith('go')).toBe(true);
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

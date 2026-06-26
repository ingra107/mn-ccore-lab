// api/routes/launch-log.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Env } from '../helpers';
import { handleCreateLaunch, handleListLaunches, handleSetLaunchStatus } from './launch-log';

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

describe('handleSetLaunchStatus', () => {
  it('updates status + launched_at and returns the row', async () => {
    const db = makeDb({ first: { id: 'L1', status: 'launched' } });
    const env = { DB: db } as unknown as Env;
    const res = await handleSetLaunchStatus('L1', req({ status: 'launched' }), env);
    expect(res.status).toBe(200);
    const upd = db._captured.find((c: any) => /UPDATE launch_log SET status/.test(c.sql));
    expect(upd.binds).toContain('launched');
  });
});

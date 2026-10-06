// api/routes/launch-log.test.ts
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut's stubs answered every first() with one canned row and every
// claim UPDATE with a chosen `changes` count, so "410 on a second claim",
// "410 when expired" and "410 for a legacy NULL expires_at" were the same
// stub with changes=0 -- the WHERE clause that tells them apart never ran.
// Here each case is a real launch_log row in the state it names, the claim's
// UPDATE decides, and every write is read back. launch_log carries CHECKs on
// tag/origin/status, so a value the schema refuses can no longer pass.
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Env } from '../helpers';
import { handleCreateLaunch, handleListLaunches, handleSetLaunchStatus, handleClaimLaunch, handleListPendingLaunches, handleRefireLaunch } from './launch-log';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

const USER = { email: 'ingra107@umn.edu', name: 'Nick' };
const API_KEY = 'test-pb-key';

let db: InstanceType<typeof Database>;
let env: Env;
beforeEach(() => {
  db = prodSchemaDb();
  env = { DB: d1Adapter(db), PB_API_KEY: API_KEY } as unknown as Env;
});

function req(body: unknown, url = 'https://x/api/launch-log') {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const row = (id: string) => db.prepare('SELECT * FROM launch_log WHERE id = ?').get(id) as Record<string, unknown> | undefined;
const count = () => (db.prepare('SELECT COUNT(*) AS n FROM launch_log').get() as { n: number }).n;
function launch(id: string, extra: Record<string, unknown> = {}) {
  insertRow(db, 'launch_log', {
    id, tag: 'quickchat', seed: 'x', origin: 'computer', status: 'pending', requested_by: USER.email,
    expires_at: "2999-01-01 00:00:00", ...extra,
  });
}

describe('handleCreateLaunch', () => {
  it('inserts a launch_log row and returns 201 with the seed stored', async () => {
    const res = await handleCreateLaunch(req({ tag: 'quickchat', seed: 'fix the figure', origin: 'computer', status: 'launched' }), USER, env);
    expect(res.status).toBe(201);
    const { data } = await res.json() as { data: { id: string } };
    expect(row(data.id)).toMatchObject({ tag: 'quickchat', seed: 'fix the figure', origin: 'computer', status: 'launched', requested_by: 'ingra107@umn.edu' });
    expect(row(data.id)!.launched_at).toBeTruthy();
    expect(row(data.id)!.expires_at).toBeTruthy();
  });

  it('rejects an unknown tag with 400, and writes nothing', async () => {
    const res = await handleCreateLaunch(req({ tag: 'bogus', seed: 'x', origin: 'computer' }), USER, env);
    expect(res.status).toBe(400);
    expect(count()).toBe(0);
  });

  it('stores task_id when the launch fired from a task compose surface (#485)', async () => {
    const res = await handleCreateLaunch(req({ tag: 'quickchat', seed: 'x', origin: 'computer', task_id: 'task_1' }), USER, env);
    expect(res.status).toBe(201);
    const { data } = await res.json() as { data: { id: string } };
    expect(row(data.id)!.task_id).toBe('task_1');
  });

  it('stores task_id as NULL for a context-free launch (Today bar #485)', async () => {
    const res = await handleCreateLaunch(req({ tag: 'quickchat', seed: 'x', origin: 'computer' }), USER, env);
    expect(res.status).toBe(201);
    const { data } = await res.json() as { data: { id: string } };
    expect(row(data.id)!.task_id).toBeNull();
    expect(row(data.id)!.status).toBe('pending');
  });
});

describe('handleRefireLaunch', () => {
  it('clones the launch into a new row carrying task_id forward (#485), source untouched', async () => {
    launch('L4', { tag: 'workon', seed: 's', project_slug: 'p', task_id: 'task_9', status: 'completed' });
    const res = await handleRefireLaunch('L4', USER, env);
    expect(res.status).toBe(201);
    const { data } = await res.json() as { data: { id: string } };
    expect(data.id).not.toBe('L4');
    expect(row(data.id)).toMatchObject({ tag: 'workon', seed: 's', project_slug: 'p', task_id: 'task_9', status: 'pending' });
    expect(row('L4')!.status).toBe('completed');
  });

  it('404s a launch owned by someone else', async () => {
    launch('L5', { requested_by: 'someone@else.com' });
    const res = await handleRefireLaunch('L5', USER, env);
    expect(res.status).toBe(404);
    expect(count()).toBe(1);
  });
});

function claimReq(id: string, opts: { auth?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) headers['Authorization'] = `Bearer ${API_KEY}`;
  return new Request(`https://x/api/launch-log/${id}/claim`, { method: 'POST', headers });
}

describe('handleClaimLaunch', () => {
  // backlog #250: PI/API-key gated in-handler (isPiRequest). Both live
  // claimants (resolve_launch.py, hub_ai_listener.py) send Bearer PB_API_KEY.
  it('403s without a valid API key or PI session, and does not consume the token', async () => {
    launch('lnch_abc');
    const res = await handleClaimLaunch('lnch_abc', claimReq('lnch_abc', { auth: false }), USER, env);
    expect(res.status).toBe(403);
    expect(row('lnch_abc')!.consumed_at).toBeNull();
  });

  it('returns 200 with verb/seed/project_slug when token is valid, and consumes it', async () => {
    launch('lnch_abc', { seed: 'fix the figure', project_slug: 'pb-sector' });
    const res = await handleClaimLaunch('lnch_abc', claimReq('lnch_abc'), USER, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data).toEqual({ verb: 'quickchat', seed: 'fix the figure', project_slug: 'pb-sector' });
    expect(row('lnch_abc')).toMatchObject({ status: 'launched' });
    expect(row('lnch_abc')!.consumed_at).toBeTruthy();
  });

  it('returns 410 on second claim (consumed_at already set)', async () => {
    launch('lnch_abc');
    expect((await handleClaimLaunch('lnch_abc', claimReq('lnch_abc'), USER, env)).status).toBe(200);
    const res = await handleClaimLaunch('lnch_abc', claimReq('lnch_abc'), USER, env);
    expect(res.status).toBe(410);
  });

  it('returns 410 when token is expired', async () => {
    launch('lnch_expired', { expires_at: '2020-01-01 00:00:00' });
    const res = await handleClaimLaunch('lnch_expired', claimReq('lnch_expired'), USER, env);
    expect(res.status).toBe(410);
    expect(row('lnch_expired')).toMatchObject({ status: 'pending', consumed_at: null });
  });

  it('returns 410 for an unknown id', async () => {
    const res = await handleClaimLaunch('lnch_unknown', claimReq('lnch_unknown'), USER, env);
    expect(res.status).toBe(410);
  });

  it('returns 410 for a legacy row with NULL expires_at (expires_at IS NOT NULL guard rejects)', async () => {
    launch('lnch_legacy', { expires_at: null });
    const res = await handleClaimLaunch('lnch_legacy', claimReq('lnch_legacy'), USER, env);
    expect(res.status).toBe(410);
    expect(row('lnch_legacy')!.consumed_at).toBeNull();
  });
});

describe('handleClaimLaunch — task-context composition (#485)', () => {
  // NOTE: this is the SINGLE seed-to-session exit for BOTH the computer route
  // (resolve_launch.py) AND the mobile route (hub_ai_listener claims the same
  // endpoint), so these cases cover the "forward path" too.
  beforeEach(() => {
    insertRow(db, 'projects', { id: 'proj_pbs', slug: 'pb-sector', title: 'PB Sector', category: 'MNCCORE' });
    insertRow(db, 'tasks', {
      id: 'task_1', title: 'Wire the freshness guard', status: 'in_progress', priority: 'medium', assignee: 'nick-ingraham',
      due_date: '2026-07-10', description: 'Guard TODAY.md regen against stale frontmatter.', project_id: 'proj_pbs',
    });
  });

  async function claim(id: string) {
    const res = await handleClaimLaunch(id, claimReq(id), USER, env);
    expect(res.status).toBe(200);
    return (await res.json() as any).data as { verb: string; seed: string; project_slug: string | null };
  }

  it('prepends the task-context header and preserves the raw seed after a blank line', async () => {
    launch('lnch_ctx', { seed: 'has it been done?', project_slug: 'pb-sector', task_id: 'task_1' });
    const data = await claim('lnch_ctx');
    expect(data.verb).toBe('quickchat');
    expect(data.project_slug).toBe('pb-sector');
    expect(data.seed).toContain('[Task context');
    expect(data.seed).toContain('Wire the freshness guard');
    expect(data.seed).toContain('in_progress');
    expect(data.seed).toContain('PB Sector');
    expect(data.seed).toContain('Guard TODAY.md regen');
    // header, blank line, then the raw seed verbatim at the end
    expect(data.seed).toContain('\n\nhas it been done?');
    expect(data.seed.endsWith('has it been done?')).toBe(true);
  });

  it('returns the raw seed unchanged when the launch carried no task_id', async () => {
    launch('lnch_raw', { seed: 'fix the figure' });
    expect((await claim('lnch_raw')).seed).toBe('fix the figure');
  });

  it('falls back to the raw seed when task_id points to a deleted task', async () => {
    db.prepare("UPDATE tasks SET deleted_at = '2026-07-01T00:00:00Z', status = 'deleted' WHERE id = 'task_1'").run();
    launch('lnch_del', { tag: 'workon', seed: 'pick this up', task_id: 'task_1' });
    expect((await claim('lnch_del')).seed).toBe('pick this up');
  });

  it('falls back to the raw seed when task_id points to a missing task', async () => {
    launch('lnch_miss', { tag: 'workon', seed: 'pick this up', task_id: 'task_gone' });
    expect((await claim('lnch_miss')).seed).toBe('pick this up');
  });

  it('truncates a long description to keep the header bounded', async () => {
    db.prepare("UPDATE tasks SET description = ? WHERE id = 'task_1'").run('x'.repeat(900));
    launch('lnch_long', { tag: 'workon', seed: 'go', task_id: 'task_1' });
    const data = await claim('lnch_long');
    // 500-char cap + ellipsis; the full 900-char description never appears.
    expect(data.seed).toContain('…');
    expect(data.seed).not.toContain('x'.repeat(600));
    expect(data.seed.endsWith('go')).toBe(true);
  });
});

describe('handleListPendingLaunches', () => {
  it('returns only pending, mobile, unconsumed, unexpired rows, unscoped by requested_by', async () => {
    launch('lnch_a', { origin: 'mobile', created_at: '2026-06-26 01:00:00' });
    launch('lnch_b', { origin: 'mobile', created_at: '2026-06-26 01:01:00', requested_by: 'someone@else.com' });
    launch('lnch_computer', { origin: 'computer' });
    launch('lnch_expired', { origin: 'mobile', expires_at: '2020-01-01 00:00:00' });
    launch('lnch_consumed', { origin: 'mobile', consumed_at: '2026-06-26 02:00:00' });
    launch('lnch_launched', { origin: 'mobile', status: 'launched' });

    const res = await handleListPendingLaunches(env);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Array<Record<string, unknown>> };
    expect(body.data.map((r) => r.id).sort()).toEqual(['lnch_a', 'lnch_b']);
    // Projects id + created_at only: never the seed.
    for (const r of body.data) expect(Object.keys(r).sort()).toEqual(['created_at', 'id']);
  });

  it('returns empty array when no pending mobile rows exist', async () => {
    const res = await handleListPendingLaunches(env);
    expect(res.status).toBe(200);
    expect((await res.json() as any).data).toHaveLength(0);
  });

  // 403 for non-PI callers is enforced by app.use('/api/pb/*') middleware (index.ts),
  // not this handler — no per-handler auth check required or tested here.
});

describe('handleListLaunches', () => {
  it("lists only the requester's own launches", async () => {
    launch('L_mine');
    launch('L_theirs', { requested_by: 'someone@else.com' });
    const res = await handleListLaunches(new URL('https://x/api/launch-log'), USER, env);
    const body = await res.json() as { data: Array<{ id: string }> };
    expect(body.data.map((r) => r.id)).toEqual(['L_mine']);
  });
});

describe('handleSetLaunchStatus', () => {
  it('updates status + launched_at and returns the row', async () => {
    launch('L1');
    const res = await handleSetLaunchStatus('L1', req({ status: 'launched' }), USER, env);
    expect(res.status).toBe(200);
    expect(row('L1')!.status).toBe('launched');
    expect(row('L1')!.launched_at).toBeTruthy();
  });

  it('returns 404 when a different user tries to update, and changes nothing', async () => {
    launch('L1');
    const other = { email: 'someone@else.com', name: 'Other' };
    const res = await handleSetLaunchStatus('L1', req({ status: 'launched' }), other, env);
    expect(res.status).toBe(404);
    expect(row('L1')!.status).toBe('pending');
  });
});

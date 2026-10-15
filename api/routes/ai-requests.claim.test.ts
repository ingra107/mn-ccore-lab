/**
 * ai-requests.claim.test.ts — schema-v140: one answer per Hermes ask.
 *
 * Nick, 2026-10-14: "Hermes can't answer the same @claude ask twice ... Build
 * it?" -> "Build it (Recommended)". Two listeners can run during a failover
 * hand-back; these cases pin that the Hub accepts exactly one answer per
 * request whatever the listeners do. Plan: PB
 * Scratch/plans/2026-10-14-hermes-claim-reconciled.md (the codex test list).
 *
 * Real migration-chain database, real D1 batches (d1Adapter's batch() is one
 * transaction). Nothing is mocked. Each case reads the stored rows.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Env } from '../helpers';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';
import {
  handleAIRequestAlertSent, handleAIRequestQueue, handleClaimAIRequest, handleGetAIRequests, handleReleaseAIRequest,
  handleUpdateAIResponse, AI_CLAIM_SWEEP_REASON, AI_CLAIM_MAX_RELEASES,
} from './ai-requests';

const KEY = 'svc-key';
const TEST_KEY = 'tm-key';
const PENDING = 'Thinking about this... (AI response pending)';

let db: InstanceType<typeof Database>;
let env: Env;
let writes: string[];
function makeEnv(hooks: Parameters<typeof d1Adapter>[1] = {}): Env {
  return {
    DB: d1Adapter(db, {
      ...hooks,
      onExec: (sql) => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql)) writes.push(sql); },
    }),
    PB_API_KEY: KEY, TEST_MODE_KEY: TEST_KEY,
  } as unknown as Env;
}

beforeEach(() => {
  db = prodSchemaDb();
  writes = [];
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', email: 'ingra107@umn.edu' });
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey', slug: 'casey-eddington', email: 'casey@umn.edu' });
  env = makeEnv();
});

// ── fixtures ─────────────────────────────────────────────────────────────────

/** A pending ask on a task thread, with its keyed 'Thinking...' placeholder. */
function askWithPlaceholder(aiId: string, opts: { requestedBy?: string | null } = {}) {
  insertRow(db, 'activity_entries', { id: `trig-${aiId}`, entity_type: 'task', entity_id: 'task-1', kind: 'comment', visibility: 'team', actor_slug: 'nick-ingraham', body: '@hermes ?', parent_id: null });
  insertRow(db, 'ai_requests', {
    id: aiId, source_type: 'task_comment', source_id: `trig-${aiId}`, prompt: 'a question', status: 'pending',
    requested_by: opts.requestedBy === undefined ? 'ingra107@umn.edu' : opts.requestedBy,
  });
  insertRow(db, 'activity_entries', {
    id: `ph-${aiId}`, entity_type: 'task', entity_id: 'task-1', kind: 'comment', visibility: 'team', actor_slug: 'claude-ai',
    body: PENDING, parent_id: `trig-${aiId}`, source_table: 'ai_requests', source_id: aiId,
  });
}

function svc(path: string, body?: unknown): Request {
  return new Request(`https://hub.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function member(path: string, body?: unknown, method = 'POST'): Request {
  return new Request(`https://hub.test${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': 'casey@umn.edu' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function claim(id: string, machine = 'work'): Promise<{ status: number; token?: string; body: Record<string, unknown> }> {
  const res = await handleClaimAIRequest(id, svc(`/api/ai-requests/${id}/claim`, { machine }), env);
  const body = await res.json() as Record<string, unknown> & { claim?: { token: string } };
  return { status: res.status, token: body.claim?.token, body };
}
async function answer(id: string, response: string, token?: string | null, extra: Record<string, unknown> = {}) {
  const res = await handleUpdateAIResponse(id, svc(`/api/ai-requests/${id}/response`, {
    response, ...(token ? { claim_token: token } : {}), ...extra,
  }), env);
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}
async function release(id: string, token: string) {
  const res = await handleReleaseAIRequest(id, svc(`/api/ai-requests/${id}/release`, { claim_token: token }), env);
  return res.status;
}
async function queue() {
  const res = await handleAIRequestQueue(svc('/api/ai-requests/queue'), env);
  return { status: res.status, body: await res.json() as { data: Array<Record<string, unknown>>; swept: Array<Record<string, unknown>> } };
}

const row = (id: string) => db.prepare('SELECT * FROM ai_requests WHERE id = ?').get(id) as Record<string, unknown>;
const body = (id: string) => (db.prepare('SELECT body FROM activity_entries WHERE id = ?').get(id) as { body: string }).body;
const notes = (id: string) => db.prepare("SELECT * FROM notifications WHERE source_type = 'ai_request' AND source_id = ?").all(id);
/** Push a held lease (or a release's backoff) into the past, as the clock would. */
const expireLease = (id: string) => db.prepare('UPDATE ai_requests SET claim_expires_at = claim_expires_at - 100000 WHERE id = ?').run(id);
const nowS = () => (db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS n").get() as { n: number }).n;
async function ackAlert(id: string) {
  return (await handleAIRequestAlertSent(id, svc(`/api/ai-requests/${id}/alert-sent`), env)).status;
}

// ── auth ────────────────────────────────────────────────────────────────────

describe('auth: PI or service only (was any signed-in member)', () => {
  it('a team member cannot claim, release, poll the queue or post an answer', async () => {
    askWithPlaceholder('ai-auth');
    expect((await handleClaimAIRequest('ai-auth', member('/api/ai-requests/ai-auth/claim', {}), env)).status).toBe(403);
    expect((await handleReleaseAIRequest('ai-auth', member('/api/ai-requests/ai-auth/release', { claim_token: 'x' }), env)).status).toBe(403);
    expect((await handleAIRequestQueue(member('/api/ai-requests/queue'), env)).status).toBe(403);
    expect((await handleUpdateAIResponse('ai-auth', member('/api/ai-requests/ai-auth/response', { response: 'hijack' }), env)).status).toBe(403);
    expect(row('ai-auth')).toMatchObject({ status: 'pending', claim_attempts: 0, response: null });
    expect(body('ph-ai-auth')).toBe(PENDING);
  });
});

// ── claim ───────────────────────────────────────────────────────────────────

describe('claim: one winner, a fresh token per acquisition', () => {
  it('two simultaneous claims: exactly one wins and the generation counts once', async () => {
    askWithPlaceholder('ai-c1');
    const [a, b] = await Promise.all([claim('ai-c1', 'home'), claim('ai-c1', 'work')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(row('ai-c1').claim_attempts).toBe(1);
    const winner = a.status === 200 ? a : b;
    expect(row('ai-c1').claim_token).toBe(winner.token);
    expect((a.status === 409 ? a : b).body.reason).toBe('held');
  });

  it('the claim returns the row with landing_visibility, and its token', async () => {
    askWithPlaceholder('ai-c2');
    const c = await claim('ai-c2');
    expect(c.status).toBe(200);
    const data = c.body.data as Record<string, unknown>;
    expect(data).toMatchObject({ id: 'ai-c2', landing_visibility: 'team', claimed_by: 'work', claim_attempts: 1 });
    expect(data).not.toHaveProperty('claim_token');
    expect(typeof c.token).toBe('string');
  });

  it('a claim on an answered row is refused as terminal; an unknown id is 404', async () => {
    askWithPlaceholder('ai-c3');
    expect((await answer('ai-c3', 'legacy answer')).status).toBe(200);
    const c = await claim('ai-c3');
    expect(c.status).toBe(409);
    expect(c.body.reason).toBe('terminal');
    expect((await claim('ai-nope')).status).toBe(404);
  });
});

// ── the fence ───────────────────────────────────────────────────────────────

describe('the response fence: the current token only', () => {
  it('A expires, B takes over (same machine name), A posts late: A is refused and writes nothing', async () => {
    askWithPlaceholder('ai-f1');
    const a = await claim('ai-f1', 'work');
    expireLease('ai-f1');
    const b = await claim('ai-f1', 'work');
    expect(b.status).toBe(200);
    expect(b.token).not.toBe(a.token);
    expect(row('ai-f1').claim_attempts).toBe(2);

    writes = [];
    const late = await answer('ai-f1', 'A answer', a.token);
    expect(late.status).toBe(409);
    expect(late.body.reason).toBe('claim_not_held');
    expect(row('ai-f1').status).toBe('pending');
    expect(body('ph-ai-f1')).toBe(PENDING);
    expect(notes('ai-f1')).toHaveLength(0);

    const won = await answer('ai-f1', 'B answer', b.token);
    expect(won.status).toBe(200);
    expect(body('ph-ai-f1')).toBe('B answer');
    expect(notes('ai-f1')).toHaveLength(1);
  });

  it('a lease that ran out but was never taken over still lands its answer (no regeneration)', async () => {
    askWithPlaceholder('ai-f2');
    const a = await claim('ai-f2');
    expireLease('ai-f2');
    const r = await answer('ai-f2', 'finished late', a.token);
    expect(r.status).toBe(200);
    expect(row('ai-f2')).toMatchObject({ status: 'completed', response: 'finished late' });
    expect(body('ph-ai-f2')).toBe('finished late');
    expect(notes('ai-f2')).toHaveLength(1);
  });

  it('release then reclaim: the released token stays dead', async () => {
    askWithPlaceholder('ai-f3');
    const a = await claim('ai-f3');
    expect(await release('ai-f3', a.token!)).toBe(200);
    // A release refunds its attempt and spends a release instead.
    expect(row('ai-f3')).toMatchObject({ claim_token: null, claim_attempts: 0, claim_releases: 1 });
    // It also backs the next claim off.
    const early = await claim('ai-f3');
    expect(early.status).toBe(409);
    expect(early.body.reason).toBe('backoff');
    expireLease('ai-f3');
    const b = await claim('ai-f3');
    expect(b.status).toBe(200);
    expect(row('ai-f3')).toMatchObject({ claim_attempts: 1, claim_releases: 1 });
    expect((await answer('ai-f3', 'stale', a.token)).status).toBe(409);
    expect((await answer('ai-f3', 'fresh', b.token)).status).toBe(200);
  });

  it('a release with the wrong token is refused and changes nothing', async () => {
    askWithPlaceholder('ai-f4');
    const a = await claim('ai-f4');
    expect(await release('ai-f4', 'not-the-token')).toBe(409);
    expect(row('ai-f4').claim_token).toBe(a.token);
  });

  it('a bodyless or non-JSON release is a 400, not a 500', async () => {
    askWithPlaceholder('ai-f5');
    await claim('ai-f5');
    const bare = new Request('https://hub.test/api/ai-requests/ai-f5/release', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` } });
    expect((await handleReleaseAIRequest('ai-f5', bare, env)).status).toBe(400);
    const junk = new Request('https://hub.test/api/ai-requests/ai-f5/release', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: 'not json' });
    expect((await handleReleaseAIRequest('ai-f5', junk, env)).status).toBe(400);
    expect(row('ai-f5').claim_releases).toBe(0);
  });
});

// ── legacy (tokenless) listeners ────────────────────────────────────────────

describe('legacy compatibility: tokenless wins only on a never-claimed row', () => {
  it('a never-claimed row takes one tokenless answer, and a claim after it is refused', async () => {
    askWithPlaceholder('ai-l1');
    expect((await answer('ai-l1', 'old listener')).status).toBe(200);
    expect(body('ph-ai-l1')).toBe('old listener');
    expect((await claim('ai-l1')).body.reason).toBe('terminal');
  });

  it('once claimed, a tokenless answer loses -- while held, and after a release', async () => {
    askWithPlaceholder('ai-l2');
    const a = await claim('ai-l2');
    expect((await answer('ai-l2', 'old listener')).status).toBe(409);
    await release('ai-l2', a.token!);
    expect(row('ai-l2')).toMatchObject({ claim_attempts: 0, claim_releases: 1 });   // refunded, still "claimed once"
    expect((await answer('ai-l2', 'old listener again')).status).toBe(409);
    expect(row('ai-l2')).toMatchObject({ status: 'pending' });
    expect(body('ph-ai-l2')).toBe(PENDING);
  });

  it('after the rollback revoke (token cleared, attempts kept) a tokenless answer still loses', async () => {
    askWithPlaceholder('ai-l3');
    await claim('ai-l3');
    db.prepare("UPDATE ai_requests SET claimed_by = NULL, claim_token = NULL, claim_expires_at = NULL WHERE status = 'pending'").run();
    expect((await answer('ai-l3', 'legacy')).status).toBe(409);
    // A repaired claim-capable listener can still finish it.
    const b = await claim('ai-l3');
    expect(b.status).toBe(200);
    expect((await answer('ai-l3', 'repaired', b.token)).status).toBe(200);
  });

  it('the legacy GET ?status=pending lists only never-claimed rows, so an old listener cannot spin on one', async () => {
    askWithPlaceholder('ai-l5');                     // never claimed
    askWithPlaceholder('ai-l6');                     // held
    askWithPlaceholder('ai-l7');                     // claimed, then released
    askWithPlaceholder('ai-l8');                     // claimed, lease lost
    await claim('ai-l6');
    const c7 = await claim('ai-l7');
    await release('ai-l7', c7.token!);
    await claim('ai-l8');
    expireLease('ai-l8');
    const req = new Request('https://hub.test/api/ai-requests?status=pending', { headers: { Authorization: `Bearer ${KEY}` } });
    const { data } = await (await handleGetAIRequests(new URL(req.url), env, req)).json() as { data: Array<{ id: string }> };
    expect(data.map((r) => r.id)).toEqual(['ai-l5']);
    // Without the status filter the claimed rows are still readable history.
    const all = new Request('https://hub.test/api/ai-requests', { headers: { Authorization: `Bearer ${KEY}` } });
    const every = await (await handleGetAIRequests(new URL(all.url), env, all)).json() as { data: Array<{ id: string }> };
    expect(every.data.map((r) => r.id).sort()).toEqual(['ai-l5', 'ai-l6', 'ai-l7', 'ai-l8']);
  });

  it('two concurrent legacy answers: one acceptance, one publication, one notification', async () => {
    askWithPlaceholder('ai-l4');
    const [x, y] = await Promise.all([answer('ai-l4', 'first'), answer('ai-l4', 'second')]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const winner = x.status === 200 ? 'first' : 'second';
    expect(row('ai-l4').response).toBe(winner);
    expect(body('ph-ai-l4')).toBe(winner);
    expect(notes('ai-l4')).toHaveLength(1);
  });
});

// ── one transaction ─────────────────────────────────────────────────────────

describe('acceptance, publication and notification commit together', () => {
  it('a submission that loses between its read and its batch publishes nothing', async () => {
    askWithPlaceholder('ai-t1');
    const a = await claim('ai-t1');
    // The handler reads the row as pending; before its batch runs, another
    // answer lands (the other listener's, accepted through the same fence).
    env = makeEnv({
      beforeBatch: () => {
        db.prepare("UPDATE ai_requests SET status = 'completed', response = 'other', responded_at = datetime('now'), response_commit_id = 'other-commit' WHERE id = 'ai-t1'").run();
        db.prepare("UPDATE activity_entries SET body = 'other', answered_at = datetime('now') WHERE id = 'ph-ai-t1'").run();
      },
    });
    const r = await answer('ai-t1', 'mine', a.token);
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe('terminal');
    expect(body('ph-ai-t1')).toBe('other');
    expect(notes('ai-t1')).toHaveLength(0);
    expect(row('ai-t1').response).toBe('other');
  });

  it('a failure after the acceptance UPDATE rolls the acceptance back; the retry then lands', async () => {
    askWithPlaceholder('ai-t2');
    const a = await claim('ai-t2');
    env = makeEnv({ failSql: /^\s*UPDATE activity_entries SET body/, failTimes: 1 });
    await expect(answer('ai-t2', 'the answer', a.token)).rejects.toThrow(/simulated D1 failure/);
    expect(row('ai-t2')).toMatchObject({ status: 'pending', response: null, response_commit_id: null });
    expect(body('ph-ai-t2')).toBe(PENDING);
    expect(notes('ai-t2')).toHaveLength(0);

    // Transport-unknown on the listener's side: it retries the same payload and token.
    const again = await answer('ai-t2', 'the answer', a.token);
    expect(again.status).toBe(200);
    expect(body('ph-ai-t2')).toBe('the answer');
    expect(notes('ai-t2')).toHaveLength(1);
  });

  it('the no-placeholder fallback inserts inside the batch, keyed to the request', async () => {
    insertRow(db, 'activity_entries', { id: 'trig-np', entity_type: 'task', entity_id: 'task-1', kind: 'comment', visibility: 'author', actor_slug: 'nick-ingraham', body: '@hermes ?', parent_id: null });
    insertRow(db, 'ai_requests', { id: 'ai-np', source_type: 'task_comment', source_id: 'trig-np', prompt: 'q', status: 'pending' });
    const a = await claim('ai-np');
    expect((await answer('ai-np', 'fresh row', a.token)).status).toBe(200);
    const fresh = db.prepare("SELECT * FROM activity_entries WHERE source_table = 'ai_requests' AND source_id = 'ai-np'").all() as Array<Record<string, unknown>>;
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ body: 'fresh row', visibility: 'author', parent_id: 'trig-np', actor_slug: 'claude-ai' });
    expect(fresh[0].answered_at).toBeTruthy();
  });
});

// ── terminal replay ─────────────────────────────────────────────────────────

describe('a terminal row answers a replay, never a rewrite', () => {
  it('the exact replay after a lost acknowledgement succeeds with zero writes', async () => {
    askWithPlaceholder('ai-r1');
    const a = await claim('ai-r1');
    expect((await answer('ai-r1', 'final', a.token, { input_tokens: 10, output_tokens: 20 })).status).toBe(200);
    const before = row('ai-r1');
    writes = [];
    const replay = await answer('ai-r1', 'final', a.token, { input_tokens: 10, output_tokens: 20 });
    expect(replay.status).toBe(200);
    expect(replay.body.replay).toBe(true);
    expect(writes).toEqual([]);
    expect(row('ai-r1')).toEqual(before);
    expect(notes('ai-r1')).toHaveLength(1);
  });

  it('a different submission against a terminal row is a 409; usage and timestamps are unchanged', async () => {
    askWithPlaceholder('ai-r2');
    const a = await claim('ai-r2');
    await answer('ai-r2', 'final', a.token, { input_tokens: 10, output_tokens: 20 });
    const before = row('ai-r2');
    writes = [];
    for (const attempt of [
      answer('ai-r2', 'different text', a.token, { input_tokens: 10, output_tokens: 20 }),
      answer('ai-r2', 'final', a.token, { input_tokens: 11, output_tokens: 20 }),
      answer('ai-r2', 'final', null, { input_tokens: 10, output_tokens: 20 }),
      answer('ai-r2', 'final', a.token, { input_tokens: 10, output_tokens: 20, status: 'failed' }),
    ]) {
      expect((await attempt).status).toBe(409);
    }
    expect(writes).toEqual([]);
    expect(row('ai-r2')).toEqual(before);
    expect(body('ph-ai-r2')).toBe('final');
  });
});

// ── exhaustion ──────────────────────────────────────────────────────────────

describe('three acquisitions, then the service sweep fails the row', () => {
  it('no fourth acquisition; the next sweep marks it failed once, with no public diagnostic', async () => {
    askWithPlaceholder('ai-x1');
    for (let i = 0; i < 3; i++) {
      expect((await claim('ai-x1')).status).toBe(200);
      expireLease('ai-x1');           // each runner crashed
    }
    const fourth = await claim('ai-x1');
    expect(fourth.status).toBe(409);
    expect(fourth.body.reason).toBe('exhausted');
    expect(row('ai-x1').claim_attempts).toBe(3);

    const q = await queue();
    expect(q.body.swept.map((r) => r.id)).toEqual(['ai-x1']);
    expect(q.body.data.map((r) => r.id)).not.toContain('ai-x1');
    expect(row('ai-x1')).toMatchObject({ status: 'failed', response: AI_CLAIM_SWEEP_REASON });
    expect(body('ph-ai-x1')).toBe(PENDING);          // failed rows publish nothing
    expect(notes('ai-x1')).toHaveLength(0);

    // The alert stays owed -- a lost /queue response must not lose it -- until acked.
    expect((await queue()).body.swept.map((r) => r.id)).toEqual(['ai-x1']);
    expect(await ackAlert('ai-x1')).toBe(200);
    expect((await queue()).body.swept).toEqual([]);
    expect(await ackAlert('ai-x1')).toBe(409);
    expect(row('ai-x1')).toMatchObject({ status: 'failed', exhaustion_alert: 'sent' });
  });

  it('a third lease still live is neither swept nor claimable', async () => {
    askWithPlaceholder('ai-x2');
    for (let i = 0; i < 2; i++) { await claim('ai-x2'); expireLease('ai-x2'); }
    const third = await claim('ai-x2');
    expect(third.status).toBe(200);
    const q = await queue();
    expect(q.body.swept).toEqual([]);
    expect(q.body.data.map((r) => r.id)).not.toContain('ai-x2');
    expect((await answer('ai-x2', 'finished on the third', third.token)).status).toBe(200);
  });

  it('releases have their own budget: three do not exhaust a row, the tenth does, and each backs off further', async () => {
    askWithPlaceholder('ai-x3');
    const backoffs: number[] = [];
    for (let i = 0; i < AI_CLAIM_MAX_RELEASES; i++) {
      const c = await claim('ai-x3');
      expect(c.status, `claim ${i + 1}`).toBe(200);
      const before = nowS();
      expect(await release('ai-x3', c.token!)).toBe(200);
      backoffs.push(Math.round(((row('ai-x3').claim_expires_at as number) - before) / 60));
      if (i === 2) {
        expireLease('ai-x3');
        expect((await queue()).body.swept, 'three releases are not three crashes').toEqual([]);
      }
      expireLease('ai-x3');
    }
    expect(backoffs).toEqual([1, 2, 4, 8, 16, 30, 30, 30, 30, 30]);
    expect(row('ai-x3')).toMatchObject({ claim_attempts: 0, claim_releases: AI_CLAIM_MAX_RELEASES });
    expect((await claim('ai-x3')).body.reason).toBe('exhausted');
    expect((await queue()).body.swept.map((r) => r.id)).toEqual(['ai-x3']);
    expect(row('ai-x3').status).toBe('failed');
  });
});

// ── the queue ───────────────────────────────────────────────────────────────

describe('the service queue lists what a runner may claim now', () => {
  it('pending unclaimed and expired-claim rows, oldest first; never held, terminal, or a token', async () => {
    const mk = (id: string, created: string) => insertRow(db, 'ai_requests', { id, source_type: 'direct', source_id: id, prompt: 'q', status: 'pending', created_at: created });
    mk('q-new', '2026-10-14 10:00:00');
    mk('q-old', '2026-10-14 09:00:00');
    mk('q-held', '2026-10-14 08:00:00');
    mk('q-stale', '2026-10-14 07:00:00');
    mk('q-done', '2026-10-14 06:00:00');
    await claim('q-held');
    await claim('q-stale');
    expireLease('q-stale');
    await answer('q-done', 'done');

    const q = await queue();
    expect(q.status).toBe(200);
    expect(q.body.data.map((r) => r.id)).toEqual(['q-stale', 'q-old', 'q-new']);
    for (const r of q.body.data) expect(r).not.toHaveProperty('claim_token');
  });
});

// ── the token stays private ─────────────────────────────────────────────────

describe('the claim token never leaves through a read', () => {
  it('neither the requester GET nor the service GET carries claim_token', async () => {
    askWithPlaceholder('ai-g1', { requestedBy: 'casey@umn.edu' });
    const c = await claim('ai-g1');
    expect(row('ai-g1').claim_token).toBe(c.token);

    for (const req of [
      member('/api/ai-requests', undefined, 'GET'),
      new Request('https://hub.test/api/ai-requests', { headers: { Authorization: `Bearer ${KEY}` } }),
    ]) {
      const res = await handleGetAIRequests(new URL(req.url), env, req);
      const text = await res.text();
      const { data } = JSON.parse(text) as { data: Array<Record<string, unknown>> };
      expect(data.map((r) => r.id)).toContain('ai-g1');
      for (const r of data) expect(r).not.toHaveProperty('claim_token');
      expect(text).not.toContain(c.token!);
    }
  });
});

// ── the triggers ────────────────────────────────────────────────────────────

describe('schema-v140 triggers: a terminal row is history', () => {
  beforeEach(() => {
    insertRow(db, 'ai_requests', { id: 'ai-done', source_type: 'direct', source_id: 's', prompt: 'q', status: 'completed', response: 'answer', requested_by: 'nick' });
    insertRow(db, 'ai_requests', { id: 'ai-open', source_type: 'direct', source_id: 's', prompt: 'q', status: 'pending' });
  });
  const raw = (sql: string) => () => db.prepare(sql).run();

  it('rewriting the result or identity of a terminal row aborts', () => {
    for (const sql of [
      "UPDATE ai_requests SET status = 'pending' WHERE id = 'ai-done'",
      "UPDATE ai_requests SET response = 'rewritten' WHERE id = 'ai-done'",
      "UPDATE ai_requests SET response = 'answer' WHERE id = 'ai-done'",      // same value: still refused
      "UPDATE ai_requests SET responded_at = datetime('now') WHERE id = 'ai-done'",
      "UPDATE ai_requests SET input_tokens = 5 WHERE id = 'ai-done'",
      "UPDATE ai_requests SET claim_token = 'x' WHERE id = 'ai-done'",
      "UPDATE ai_requests SET claim_attempts = 0 WHERE id = 'ai-done'",
      "UPDATE ai_requests SET claim_releases = 1 WHERE id = 'ai-done'",
      "UPDATE ai_requests SET response_commit_id = 'x' WHERE id = 'ai-done'",
      "UPDATE ai_requests SET id = 'ai-moved' WHERE id = 'ai-done'",
    ]) {
      expect(raw(sql), sql).toThrow(/terminal result is immutable/);
    }
    expect(row('ai-done')).toMatchObject({ status: 'completed', response: 'answer' });
  });

  it('deleting or replacing a terminal row aborts', () => {
    expect(raw("DELETE FROM ai_requests WHERE id = 'ai-done'")).toThrow(/cannot be deleted/);
    expect(raw("INSERT OR REPLACE INTO ai_requests (id, source_type, source_id, prompt, status) VALUES ('ai-done', 'direct', 's', 'q', 'pending')"))
      .toThrow(/cannot be replaced/);
    expect(row('ai-done')).toMatchObject({ status: 'completed', response: 'answer' });
  });

  it('metadata corrections on a terminal row, and every write to a pending row, still succeed', () => {
    raw("UPDATE ai_requests SET requested_by = 'nick-ingraham', project_slug = 'renamed', exhaustion_alert = 'sent' WHERE id = 'ai-done'")();
    expect(row('ai-done')).toMatchObject({ requested_by: 'nick-ingraham', project_slug: 'renamed', exhaustion_alert: 'sent' });
    raw("UPDATE ai_requests SET response = 'x', status = 'completed' WHERE id = 'ai-open'")();
    raw("DELETE FROM ai_requests WHERE id = 'ai-nonexistent'")();
  });

  it('claim_attempts (0..3), claim_releases (0..10) and exhaustion_alert are bounded by CHECK', () => {
    expect(raw("UPDATE ai_requests SET claim_attempts = 4 WHERE id = 'ai-open'")).toThrow(/CHECK/);
    expect(raw("UPDATE ai_requests SET claim_releases = 11 WHERE id = 'ai-open'")).toThrow(/CHECK/);
    expect(raw("UPDATE ai_requests SET exhaustion_alert = 'maybe' WHERE id = 'ai-open'")).toThrow(/CHECK/);
  });
});

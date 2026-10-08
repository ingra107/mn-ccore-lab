/**
 * inbox-events.test.ts — POST /api/inbox-events single-capture endpoint (A2 wave 3)
 *
 * Covers:
 *   - create succeeds: 201, returned row has id (evt_ prefix) + seq > 0
 *   - explicit source accepted when valid
 *   - empty string raw_text → 400
 *   - whitespace-only raw_text → 400 (trim guard)
 *   - missing raw_text → 400
 *   - unknown source → 400
 *
 * #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
 * The first cut handed back a fabricated read-back row (`seq: 42`), so the
 * seq the inbox_events trigger assigns was never exercised; and the sync-bulk
 * suite answered its pre/post SELECTs from a counter, so the ON CONFLICT upsert
 * never ran. Here the seq is the trigger's, every 400 is checked against an
 * empty table, and sync-bulk's replay/resync guards run on real rows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import type { Env, AuthUser } from '../helpers';

import { handleCreateInboxEvent } from './inbox-events';
import { nowInstant } from '../lib/time';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

const testUser: AuthUser = { email: 'test@example.com', name: 'Test User', slug: 'test' };

let db: InstanceType<typeof Database>;
let env: Env;
beforeEach(() => {
  db = prodSchemaDb();
  env = { DB: d1Adapter(db) } as unknown as Env;
});

const inboxRows = () =>
  db.prepare('SELECT id, source, raw_text, seq FROM inbox_events ORDER BY seq').all() as Array<{ id: string; source: string; raw_text: string; seq: number }>;

function makeRequest(body: unknown): Request {
  return new Request('https://example.com/api/inbox-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('handleCreateInboxEvent — POST /api/inbox-events', () => {
  it('returns 201 with id (evt_ prefix) and the trigger-assigned seq when row is created', async () => {
    const res = await handleCreateInboxEvent(makeRequest({ raw_text: 'buy milk' }), testUser, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(typeof body.data.id).toBe('string');
    expect((body.data.id as string).startsWith('evt_')).toBe(true);
    expect(typeof body.data.seq).toBe('number');
    expect(body.data.seq as number).toBeGreaterThan(0);
    expect(body.data.source).toBe('hub_ui');
    expect(body.data.raw_text).toBe('buy milk');
    // The response is the stored row.
    expect(inboxRows()).toEqual([{ id: body.data.id, source: 'hub_ui', raw_text: 'buy milk', seq: body.data.seq }]);
  });

  it('each capture advances seq (the pull cursor depends on it)', async () => {
    const a = await (await handleCreateInboxEvent(makeRequest({ raw_text: 'one' }), testUser, env)).json() as { data: { seq: number } };
    const b = await (await handleCreateInboxEvent(makeRequest({ raw_text: 'two' }), testUser, env)).json() as { data: { seq: number } };
    expect(b.data.seq).toBeGreaterThan(a.data.seq);
  });

  it('defaults source to hub_ui and trims raw_text when source is omitted', async () => {
    const res = await handleCreateInboxEvent(makeRequest({ raw_text: '  default source test ' }), testUser, env);
    expect(res.status).toBe(201);
    expect(inboxRows()).toMatchObject([{ source: 'hub_ui', raw_text: 'default source test' }]);
  });

  it('accepts a valid explicit source', async () => {
    const res = await handleCreateInboxEvent(makeRequest({ raw_text: 'explicit source', source: 'hub_pwa' }), testUser, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data.source).toBe('hub_pwa');
    expect(inboxRows()).toMatchObject([{ source: 'hub_pwa' }]);
  });

  it.each([
    ['empty string raw_text', { raw_text: '' }],
    ['whitespace-only raw_text (trim guard)', { raw_text: '   ' }],
    ['missing raw_text', {}],
    ['an unknown source', { raw_text: 'hello', source: 'discord' }],
  ])('returns 400 and writes nothing for %s', async (_label, payload) => {
    const res = await handleCreateInboxEvent(makeRequest(payload), testUser, env);
    expect(res.status).toBe(400);
    expect(inboxRows()).toEqual([]);
  });
});

// ── #907: a typed @hermes reaching sync-bulk must dispatch exactly once ───────
//
// A capture arriving from a non-browser producer (the mobile PWA) used to land
// as an untriaged row with no answer and no error. sync-bulk is a replayable
// bulk upsert, so the dispatch has to be guarded or a backfill re-asks
// everything. These pin all three guards plus the happy path.
//
// postActivityEntry is the Hermes dispatch seam (its own suite covers it), and
// the PI gate / actor lookup are auth seams; they stay mocked. The database is
// real.

const mockPost = vi.hoisted(() => vi.fn());
vi.mock('../lib/activity-entry', () => ({
  postActivityEntry: mockPost,
  activityVisibilityGate: () => '',
  activityHiddenClause: () => '',
}));
vi.mock('../helpers', async (orig) => ({
  ...(await orig<typeof import('../helpers')>()),
  isPiRequest: async () => true,
  resolveActor: async () => ({ slug: 'nick-ingraham' }),
  logActivity: async () => {},
}));

function bulkRequest(body: unknown): Request {
  return new Request('https://example.com/api/inbox-events/sync-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function evt(over: Record<string, unknown> = {}) {
  return {
    id: 'evt_hermes_1',
    source: 'hub_ui',
    raw_text: '@hermes what time is my CLIF meeting today',
    // nowInstant(), not raw toISOString() (R20) -- the Worker-side canonical
    // minter is what production stamps captures with, so the freshness guard is
    // exercised against the same shape it sees live.
    captured_at: nowInstant(),
    ...over,
  };
}

describe('handleSyncBulkInboxEvents — @hermes dispatch (#907)', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ ok: true, row: {}, hermes: { dispatched: true } });
  });

  /** `existing` = ids already on Hub before the write, seeded as real rows. */
  async function run(events: unknown[], extra: Record<string, unknown> = {}, existing: string[] = []) {
    for (const id of existing) {
      insertRow(db, 'inbox_events', { id, source: 'hub_ui', raw_text: 'earlier copy', captured_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
    }
    const { handleSyncBulkInboxEvents } = await import('./inbox-events');
    const res = await handleSyncBulkInboxEvents(bulkRequest({ events, ...extra }), testUser, env);
    return (await res.json()) as {
      data: { hermes?: Array<{ dispatched: boolean; reason?: string }>; results?: Array<{ client_id: string; status: string }> };
    };
  }

  it('dispatches on FIRST arrival of an @hermes capture, and the row is stored', async () => {
    const body = await run([evt()]);
    expect(mockPost).toHaveBeenCalledTimes(1);
    const arg = mockPost.mock.calls[0][0];
    expect(arg.entityType).toBe('day');
    // Token must survive verbatim -- the server detects on the stored text.
    expect(arg.body).toContain('@hermes');
    expect(body.data.hermes?.[0].dispatched).toBe(true);
    expect(inboxRows()).toMatchObject([{ id: 'evt_hermes_1', raw_text: '@hermes what time is my CLIF meeting today' }]);
  });

  it('GUARD 1 — a replay of the same id does NOT re-dispatch; the upsert updates the one row', async () => {
    await run([evt()], {}, ['evt_hermes_1']);
    expect(mockPost).not.toHaveBeenCalled();
    expect(inboxRows()).toMatchObject([{ id: 'evt_hermes_1', raw_text: '@hermes what time is my CLIF meeting today' }]);
  });

  it('GUARD 2 — a full resync (clear_existing) never dispatches, and truncates first', async () => {
    insertRow(db, 'inbox_events', { id: 'evt_old_other', source: 'hub_ui', raw_text: 'gone after resync', captured_at: '2026-01-01T00:00:00Z' });
    await run([evt()], { clear_existing: true });
    expect(mockPost).not.toHaveBeenCalled();
    expect(inboxRows().map((r) => r.id)).toEqual(['evt_hermes_1']);
  });

  it('GUARD 3 — a stale capture does not fire an old backlog, but SAYS SO', async () => {
    // Declining is right; declining silently is the bug this feature exists to
    // end, just relocated into the guard. The row is filed either way, so the
    // report is the only thing that tells you no answer is coming.
    const body = await run([evt({ captured_at: '2026-01-01T00:00:00Z' })]);
    expect(mockPost).not.toHaveBeenCalled();
    expect(body.data.hermes?.[0].dispatched).toBe(false);
    expect(body.data.hermes?.[0].reason).toMatch(/older than 24h/);
    expect(inboxRows()).toHaveLength(1);
  });

  it('leaves ordinary captures alone', async () => {
    const body = await run([evt({ raw_text: 'buy milk' })]);
    expect(mockPost).not.toHaveBeenCalled();
    expect(body.data.hermes).toBeUndefined();
  });

  it('a client copy older than the Hub row is rejected_stale and changes nothing', async () => {
    insertRow(db, 'inbox_events', { id: 'evt_newer', source: 'hub_ui', raw_text: 'hub copy', captured_at: '2026-01-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' });
    const body = await run([evt({ id: 'evt_newer', raw_text: 'old client copy', client_updated_at: '2026-08-01T00:00:00Z' })]);
    expect(body.data.results?.[0].status).toBe('rejected_stale');
    expect(inboxRows()).toMatchObject([{ id: 'evt_newer', raw_text: 'hub copy' }]);
  });

  it('files the ask on the LAB civil day, not the UTC day', async () => {
    // Regression: dayKeyFromCapture originally used getUTC*(), so a capture at
    // 20:31 CDT (01:31 UTC next day) filed under TOMORROW's feed and was
    // invisible on Today -- the exact silent misroute this feature exists to
    // end. Caught by a live prod probe, not by the suite, which is why it is
    // pinned here now. 2026-07-24T01:31Z is still 2026-07-23 in America/Chicago.
    //
    // The clock is FROZEN because Guard 3 (isFreshCapture) is relative to
    // Date.now() while this stamp is absolute: the pair gave the test a ~24h
    // shelf life, and it began failing mid-session on 2026-07-25 when the
    // capture aged past the guard. A test that expires is a test that reports
    // on the calendar rather than on the code.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T02:00:00Z'));
    try {
      await run([evt({ captured_at: '2026-07-24T01:31:00Z' })]);
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost.mock.calls[0][0].entityId).toBe('2026-07-23');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a Hermes failure never fails the capture', async () => {
    mockPost.mockRejectedValue(new Error('hermes down'));
    const body = await run([evt()]);
    // Row still applied; outcome reported instead of the ask dying silently.
    expect(body.data.hermes?.[0].dispatched).toBe(false);
    expect(inboxRows()).toHaveLength(1);
  });
});

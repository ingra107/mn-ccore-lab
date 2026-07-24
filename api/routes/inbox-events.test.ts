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
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Env, AuthUser } from '../helpers';

import { handleCreateInboxEvent } from './inbox-events';
import { nowInstant } from '../lib/time';

const testUser: AuthUser = { email: 'test@example.com', name: 'Test User' };

// ── DB stub factory ────────────────────────────────────────────────────────────

function makeDb(opts: {
  /** Row returned by the post-insert SELECT (simulates trigger-assigned seq). */
  insertRow?: Record<string, unknown> | null;
  /** Optional spy on every INSERT statement + binds. */
  captureInsert?: (sql: string, binds: unknown[]) => void;
}) {
  return {
    prepare: (sql: string) => {
      let boundVals: unknown[] = [];
      const stmt: Record<string, (...args: unknown[]) => unknown> = {
        bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
        run: async () => {
          if (/^INSERT INTO inbox_events/i.test(sql)) {
            opts.captureInsert?.(sql, [...boundVals]);
          }
          return { success: true, meta: {} };
        },
        first: async () => {
          // [\s\S]* not .* — the handler's read-back SELECT is multi-line
          // (explicit column list), and `.` does not cross newlines.
          if (/SELECT[\s\S]*FROM inbox_events WHERE id/.test(sql)) return opts.insertRow ?? null;
          return null;
        },
        all: async () => ({ results: [] }),
      };
      return stmt;
    },
    batch: async (stmts: unknown[]) => stmts.map(() => ({ success: true, meta: {}, results: [] })),
  };
}

function makeRequest(body: unknown): Request {
  return new Request('https://example.com/api/inbox-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('handleCreateInboxEvent — POST /api/inbox-events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 with id (evt_ prefix) and seq when row is created', async () => {
    const db = makeDb({
      insertRow: {
        id: 'evt_01J0000000000000TESTULID',
        source: 'hub_ui',
        raw_text: 'buy milk',
        captured_at: '2026-06-26T12:00:00Z',
        seq: 42,
        created_at: '2026-06-26T12:00:00Z',
        updated_at: '2026-06-26T12:00:00Z',
      },
    });
    const env = { DB: db } as unknown as Env;

    const res = await handleCreateInboxEvent(
      makeRequest({ raw_text: 'buy milk' }),
      testUser,
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(typeof body.data.id).toBe('string');
    expect((body.data.id as string).startsWith('evt_')).toBe(true);
    expect(typeof body.data.seq).toBe('number');
    expect(body.data.seq as number).toBeGreaterThan(0);
    expect(body.data.source).toBe('hub_ui');
    expect(body.data.raw_text).toBe('buy milk');
  });

  it('defaults source to hub_ui when source is omitted', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      insertRow: {
        id: 'evt_DEFAULTSOURCE',
        source: 'hub_ui',
        raw_text: 'default source test',
        captured_at: '2026-06-26T12:00:00Z',
        seq: 1,
        created_at: '2026-06-26T12:00:00Z',
        updated_at: '2026-06-26T12:00:00Z',
      },
      captureInsert: (sql, binds) => inserts.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    const res = await handleCreateInboxEvent(
      makeRequest({ raw_text: 'default source test' }),
      testUser,
      env,
    );
    expect(res.status).toBe(201);
    // Second bind is source
    expect(inserts[0].binds[1]).toBe('hub_ui');
  });

  it('accepts a valid explicit source', async () => {
    const db = makeDb({
      insertRow: {
        id: 'evt_EXPLICSOURCE',
        source: 'hub_pwa',
        raw_text: 'explicit source',
        captured_at: '2026-06-26T12:00:00Z',
        seq: 7,
        created_at: '2026-06-26T12:00:00Z',
        updated_at: '2026-06-26T12:00:00Z',
      },
    });
    const env = { DB: db } as unknown as Env;

    const res = await handleCreateInboxEvent(
      makeRequest({ raw_text: 'explicit source', source: 'hub_pwa' }),
      testUser,
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data.source).toBe('hub_pwa');
  });

  it('returns 400 when raw_text is empty string', async () => {
    const db = makeDb({});
    const env = { DB: db } as unknown as Env;

    const res = await handleCreateInboxEvent(
      makeRequest({ raw_text: '' }),
      testUser,
      env,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when raw_text is whitespace-only (trim guard)', async () => {
    const db = makeDb({});
    const env = { DB: db } as unknown as Env;

    const res = await handleCreateInboxEvent(
      makeRequest({ raw_text: '   ' }),
      testUser,
      env,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when raw_text is missing', async () => {
    const db = makeDb({});
    const env = { DB: db } as unknown as Env;

    const res = await handleCreateInboxEvent(
      makeRequest({}),
      testUser,
      env,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unknown source', async () => {
    const db = makeDb({});
    const env = { DB: db } as unknown as Env;

    const res = await handleCreateInboxEvent(
      makeRequest({ raw_text: 'hello', source: 'discord' }),
      testUser,
      env,
    );
    expect(res.status).toBe(400);
  });
});

// ── #907: a typed @hermes reaching sync-bulk must dispatch exactly once ───────
//
// A capture arriving from a non-browser producer (the mobile PWA) used to land
// as an untriaged row with no answer and no error. sync-bulk is a replayable
// bulk upsert, so the dispatch has to be guarded or a backfill re-asks
// everything. These pin all three guards plus the happy path.

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

/** DB stub for sync-bulk: `existing` = ids already on Hub before the write. */
function makeBulkDb(existing: string[]) {
  const present = new Set(existing);
  let selects = 0;
  return {
    prepare: (sql: string) => {
      let binds: unknown[] = [];
      const stmt: Record<string, (...a: unknown[]) => unknown> = {
        bind: (...a: unknown[]) => { binds = [...binds, ...a]; return stmt; },
        run: async () => ({ success: true, meta: {} }),
        first: async () => null,
        all: async () => {
          if (!/FROM inbox_events WHERE id IN/.test(sql)) return { results: [] };
          selects += 1;
          // 1st call = pre-write state; 2nd = post-write (everything present,
          // with a bumped updated_at so nothing reads as rejected_stale).
          const ids = binds as string[];
          if (selects % 2 === 1) {
            return { results: ids.filter(id => present.has(id)).map(id => ({ id, updated_at: '2026-01-01T00:00:00Z' })) };
          }
          return { results: ids.map(id => ({ id, updated_at: '2999-01-01T00:00:00Z' })) };
        },
      };
      return stmt;
    },
    batch: async (stmts: unknown[]) => stmts.map(() => ({ success: true, meta: {}, results: [] })),
  };
}

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

  async function run(events: unknown[], extra: Record<string, unknown> = {}, existing: string[] = []) {
    const { handleSyncBulkInboxEvents } = await import('./inbox-events');
    const db = makeBulkDb(existing);
    const res = await handleSyncBulkInboxEvents(
      bulkRequest({ events, ...extra }), testUser, { DB: db } as unknown as Env,
    );
    return (await res.json()) as { data: { hermes?: Array<{ dispatched: boolean; reason?: string }> } };
  }

  it('dispatches on FIRST arrival of an @hermes capture', async () => {
    const body = await run([evt()]);
    expect(mockPost).toHaveBeenCalledTimes(1);
    const arg = mockPost.mock.calls[0][0];
    expect(arg.entityType).toBe('day');
    // Token must survive verbatim -- the server detects on the stored text.
    expect(arg.body).toContain('@hermes');
    expect(body.data.hermes?.[0].dispatched).toBe(true);
  });

  it('GUARD 1 — a replay of the same id does NOT re-dispatch', async () => {
    await run([evt()], {}, ['evt_hermes_1']);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('GUARD 2 — a full resync (clear_existing) never dispatches', async () => {
    await run([evt()], { clear_existing: true });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('GUARD 3 — a stale capture does not fire an old backlog, but SAYS SO', async () => {
    // Declining is right; declining silently is the bug this feature exists to
    // end, just relocated into the guard. The row is filed either way, so the
    // report is the only thing that tells you no answer is coming.
    const body = await run([evt({ captured_at: '2026-01-01T00:00:00Z' })]);
    expect(mockPost).not.toHaveBeenCalled();
    expect(body.data.hermes?.[0].dispatched).toBe(false);
    expect(body.data.hermes?.[0].reason).toMatch(/older than 24h/);
  });

  it('leaves ordinary captures alone', async () => {
    const body = await run([evt({ raw_text: 'buy milk' })]);
    expect(mockPost).not.toHaveBeenCalled();
    expect(body.data.hermes).toBeUndefined();
  });

  it('files the ask on the LAB civil day, not the UTC day', async () => {
    // Regression: dayKeyFromCapture originally used getUTC*(), so a capture at
    // 20:31 CDT (01:31 UTC next day) filed under TOMORROW's feed and was
    // invisible on Today -- the exact silent misroute this feature exists to
    // end. Caught by a live prod probe, not by the suite, which is why it is
    // pinned here now. 2026-07-24T01:31Z is still 2026-07-23 in America/Chicago.
    await run([evt({ captured_at: '2026-07-24T01:31:00Z' })]);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][0].entityId).toBe('2026-07-23');
  });

  it('a Hermes failure never fails the capture', async () => {
    mockPost.mockRejectedValue(new Error('hermes down'));
    const body = await run([evt()]);
    // Row still applied; outcome reported instead of the ask dying silently.
    expect(body.data.hermes?.[0].dispatched).toBe(false);
  });
});

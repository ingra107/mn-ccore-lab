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

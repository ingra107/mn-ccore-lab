/**
 * api/lib/ledger-retention.test.ts
 *
 * Unit tests for the bounded-ledger retention primitive.
 * All tests use an in-memory D1 stub — no live D1 binding required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LEDGER_REGISTRY,
  pruneAllLedgers,
  monitorD1Health,
  type LedgerEntry,
} from './ledger-retention';

// ── Registry shape tests ─────────────────────────────────────────────────────

describe('LEDGER_REGISTRY shape', () => {
  it('every entry has required fields', () => {
    for (const entry of LEDGER_REGISTRY) {
      expect(typeof entry.table, `${entry.table}.table`).toBe('string');
      expect(entry.table.length, `${entry.table}.table nonempty`).toBeGreaterThan(0);
      expect(typeof entry.retentionColumn, `${entry.table}.retentionColumn`).toBe('string');
      expect(typeof entry.retentionDays, `${entry.table}.retentionDays`).toBe('number');
      expect(entry.retentionDays, `${entry.table}.retentionDays > 0`).toBeGreaterThan(0);
      expect(typeof entry.requiredIndex, `${entry.table}.requiredIndex`).toBe('string');
      expect(entry.requiredIndex.length, `${entry.table}.requiredIndex nonempty`).toBeGreaterThan(0);
      expect(typeof entry.note, `${entry.table}.note`).toBe('string');
    }
  });

  it('no duplicate table names', () => {
    const names = LEDGER_REGISTRY.map((e) => e.table);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('processed_mutations entry has 7-day retention', () => {
    const entry = LEDGER_REGISTRY.find((e) => e.table === 'processed_mutations');
    expect(entry).toBeDefined();
    expect(entry!.retentionDays).toBe(7);
    expect(entry!.requiredIndex).toBe('idx_processed_mutations_processed_at');
  });

  it('activity_log entry has >= 90-day retention', () => {
    const entry = LEDGER_REGISTRY.find((e) => e.table === 'activity_log');
    expect(entry).toBeDefined();
    expect(entry!.retentionDays).toBeGreaterThanOrEqual(90);
  });

  it('all maxRows thresholds are positive when set', () => {
    for (const entry of LEDGER_REGISTRY) {
      if (entry.maxRows != null) {
        expect(entry.maxRows, `${entry.table}.maxRows > 0`).toBeGreaterThan(0);
      }
    }
  });
});

// ── D1 stub helpers ──────────────────────────────────────────────────────────

interface StubRow {
  meta?: { changes: number };
  results?: unknown[];
  [key: string]: unknown;
}

function makeDb(overrides: {
  runResult?: { meta: { changes: number } };
  firstResult?: StubRow | null;
  allResult?: { results: StubRow[] };
  runError?: Error;
  firstError?: Error;
}) {
  return {
    prepare: (_sql: string) => ({
      bind: (..._args: unknown[]) => ({
        run: async () => {
          if (overrides.runError) throw overrides.runError;
          return overrides.runResult ?? { meta: { changes: 0 } };
        },
        first: async <T>() => {
          if (overrides.firstError) throw overrides.firstError;
          return (overrides.firstResult ?? null) as T;
        },
        all: async () => overrides.allResult ?? { results: [] },
      }),
      run: async () => {
        if (overrides.runError) throw overrides.runError;
        return overrides.runResult ?? { meta: { changes: 0 } };
      },
      first: async <T>() => {
        if (overrides.firstError) throw overrides.firstError;
        return (overrides.firstResult ?? null) as T;
      },
      all: async () => overrides.allResult ?? { results: [] },
    }),
  } as unknown as D1Database;
}

// ── pruneAllLedgers tests ────────────────────────────────────────────────────

describe('pruneAllLedgers', () => {
  it('returns zero-deleted when DB has no old rows', async () => {
    const db = makeDb({ runResult: { meta: { changes: 0 } } });
    const results = await pruneAllLedgers(db);
    for (const entry of LEDGER_REGISTRY) {
      expect(results[entry.table].deleted).toBe(0);
      expect(results[entry.table].error).toBeUndefined();
    }
  });

  it('accumulates deleted count across chunks for one table', async () => {
    // First call returns 3 deletions, second returns 0 (done).
    let callCount = 0;
    const db = {
      prepare: () => ({
        run: async () => {
          callCount++;
          return { meta: { changes: callCount === 1 ? 3 : 0 } };
        },
        bind: () => ({
          run: async () => {
            callCount++;
            return { meta: { changes: callCount === 1 ? 3 : 0 } };
          },
          first: async () => ({ cnt: 0, oldest: null, newest: null }),
        }),
        first: async () => ({ cnt: 0, oldest: null, newest: null }),
      }),
    } as unknown as D1Database;

    const results = await pruneAllLedgers(db);
    // At least one table should record some deletion (the first call).
    const totals = Object.values(results).reduce((s, r) => s + r.deleted, 0);
    expect(totals).toBeGreaterThan(0);
  });

  it('records error for a failing table but continues others', async () => {
    let tableIndex = 0;
    const db = {
      prepare: () => ({
        run: async () => {
          tableIndex++;
          if (tableIndex === 1) throw new Error('D1_ERROR: simulated timeout');
          return { meta: { changes: 0 } };
        },
        bind: () => ({
          run: async () => {
            tableIndex++;
            if (tableIndex === 1) throw new Error('D1_ERROR: simulated timeout');
            return { meta: { changes: 0 } };
          },
          first: async () => ({ cnt: 0, oldest: null, newest: null }),
        }),
        first: async () => ({ cnt: 0, oldest: null, newest: null }),
      }),
    } as unknown as D1Database;

    const results = await pruneAllLedgers(db);
    // At least one entry should have an error recorded
    const errors = Object.values(results).filter((r) => r.error);
    expect(errors.length).toBeGreaterThan(0);
    // At least one entry should have no error (the second table processed)
    const successes = Object.values(results).filter((r) => !r.error);
    expect(successes.length).toBeGreaterThan(0);
  });
});

// ── monitorD1Health tests ────────────────────────────────────────────────────

describe('monitorD1Health', () => {
  it('returns no alert when all tables under budget', async () => {
    const db = makeDb({
      firstResult: { cnt: 100, oldest: '2026-06-01T00:00:00Z', newest: '2026-06-18T00:00:00Z' },
    });
    const pruneResults = Object.fromEntries(LEDGER_REGISTRY.map((e) => [e.table, { deleted: 0 }]));
    const report = await monitorD1Health(db, pruneResults);

    expect(report.alertTriggered).toBe(false);
    expect(report.tables.length).toBe(LEDGER_REGISTRY.length);
    for (const t of report.tables) {
      expect(t.overRowBudget).toBe(false);
      expect(t.pruneError).toBe(false);
    }
  });

  it('triggers alert when a table exceeds maxRows', async () => {
    // Return a row count above the processed_mutations maxRows (10,000)
    const db = makeDb({
      firstResult: { cnt: 15_000, oldest: '2026-06-01T00:00:00Z', newest: '2026-06-18T00:00:00Z' },
      // notifications INSERT also needs to succeed
      runResult: { meta: { changes: 1 } },
    });
    const pruneResults = Object.fromEntries(LEDGER_REGISTRY.map((e) => [e.table, { deleted: 0 }]));
    const report = await monitorD1Health(db, pruneResults);

    expect(report.alertTriggered).toBe(true);
    const overBudget = report.tables.filter((t) => t.overRowBudget);
    expect(overBudget.length).toBeGreaterThan(0);
  });

  it('triggers alert when a table had a prune error', async () => {
    const db = makeDb({
      firstResult: { cnt: 50, oldest: null, newest: null },
      runResult: { meta: { changes: 0 } },
    });
    // Signal a prune error for the first registered table
    const pruneResults = Object.fromEntries(
      LEDGER_REGISTRY.map((e, i) => [e.table, i === 0 ? { deleted: 0, error: 'timeout' } : { deleted: 0 }])
    );
    const report = await monitorD1Health(db, pruneResults);

    expect(report.alertTriggered).toBe(true);
    expect(report.tables[0].pruneError).toBe(true);
  });

  it('does not throw when notifications insert fails', async () => {
    // Row count over budget to trigger alert, but notifications insert fails
    const db = {
      prepare: () => ({
        first: async () => ({ cnt: 99_999, oldest: null, newest: null }),
        bind: () => ({
          first: async () => ({ cnt: 99_999, oldest: null, newest: null }),
          run: async () => { throw new Error('notifications table missing'); },
        }),
        run: async () => { throw new Error('notifications table missing'); },
      }),
    } as unknown as D1Database;

    const pruneResults = Object.fromEntries(LEDGER_REGISTRY.map((e) => [e.table, { deleted: 0 }]));
    // Should not throw
    await expect(monitorD1Health(db, pruneResults)).resolves.toBeDefined();
  });

  it('report includes checkedAt ISO timestamp', async () => {
    const db = makeDb({ firstResult: { cnt: 0, oldest: null, newest: null } });
    const pruneResults = Object.fromEntries(LEDGER_REGISTRY.map((e) => [e.table, { deleted: 0 }]));
    const report = await monitorD1Health(db, pruneResults);

    expect(report.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

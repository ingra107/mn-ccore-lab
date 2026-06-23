/**
 * api/lib/ledger-retention.ts
 * ───────────────────────────────────────────────────────────────────────────
 * Bounded-ledger retention primitive (2026-06-18, post-mortem Level-1 fix).
 *
 * Background: `processed_mutations` (A3 idempotency ledger) accumulated
 * 88,887 rows / 126 MB with no retention, causing D1 storage timeouts on
 * ALL write ops (shared-DB blast radius). `activity_log` is the second
 * unbounded ledger (22,403 rows, no retention).
 *
 * Level-1 design: every append-only/ledger/audit table MUST be declared in
 * LEDGER_REGISTRY before writes are accepted. The pre-commit gate
 * (scripts/check-ledger-registry.py) rejects any new schema file that
 * introduces a table with a timestamp column but no registry entry —
 * making "a ledger with no retention" structurally unrepresentable.
 *
 * Exports:
 *   LEDGER_REGISTRY       — typed declarative list of all ledger tables
 *   pruneAllLedgers()     — chunked DELETE for all registered tables
 *   monitorD1Health()     — row count + oldest row per table; alerts via
 *                           notifications if thresholds exceeded
 */

import { generateId } from '../helpers';

// ── Registry ────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  /** D1 table name. */
  table: string;
  /** Column used for time-based retention (must be indexed). */
  retentionColumn: string;
  /** Rows older than this many days are eligible for deletion. */
  retentionDays: number;
  /** Alert if row count exceeds this. null = no row-count alert. */
  maxRows?: number;
  /** Index name that covers `retentionColumn`; gate verifies it exists. */
  requiredIndex: string;
  /**
   * Human-readable note for the gate / monitor — why this table is bounded
   * and what the retention window means.
   */
  note: string;
}

/**
 * LEDGER_REGISTRY is the single source of truth for every append-only /
 * audit / idempotency table in the D1 schema. The pre-commit gate
 * (scripts/check-ledger-registry.py) rejects new schema files that add a
 * table with a timestamp column without a matching entry here.
 *
 * Adding a new ledger table:
 *   1. Add an entry below (table, retentionColumn, retentionDays, requiredIndex).
 *   2. Make sure the requiredIndex exists in the corresponding schema-v*.sql.
 *   3. Run `npm test` — the gate test (ledger-retention.test.ts) will verify
 *      the registry shape is coherent.
 */
export const LEDGER_REGISTRY: readonly LedgerEntry[] = [
  {
    table: 'processed_mutations',
    retentionColumn: 'processed_at',
    retentionDays: 7,
    maxRows: 10_000,
    requiredIndex: 'idx_processed_mutations_processed_at',
    note:
      'A3 idempotency ledger. 7d covers any realistic retry window. ' +
      'Bloated to 88k rows/126MB on 2026-06-18, causing D1 timeout cascade.',
  },
  {
    table: 'activity_log',
    retentionColumn: 'timestamp',
    retentionDays: 180,
    maxRows: 50_000,
    requiredIndex: 'idx_activity_log_timestamp',
    note:
      'Team activity feed. Default read window is 90d (activity.ts:51); ' +
      '180d retention keeps a comfortable buffer. 22k rows as of 2026-06-18.',
  },
] as const;

// ── Pruning ──────────────────────────────────────────────────────────────────

/** Maximum rows deleted in one DELETE statement. D1 has per-statement limits;
 *  chunking prevents a single prune from timing out even on a neglected table. */
const CHUNK_SIZE = 5_000;

/**
 * Prune a single ledger table in chunks until no rows older than
 * `retentionDays` remain (or no more changes occur).
 *
 * Returns the total number of rows deleted.
 */
async function pruneLedger(db: D1Database, entry: LedgerEntry): Promise<number> {
  const cutoff = `datetime('now', '-${entry.retentionDays} days')`;
  // D1 doesn't natively support LIMIT in DELETE; we use a subquery to select
  // the rowids of the oldest N rows then delete only those.
  const sql = `
    DELETE FROM ${entry.table}
    WHERE ${entry.retentionColumn} IN (
      SELECT ${entry.retentionColumn} FROM ${entry.table}
      WHERE ${entry.retentionColumn} < ${cutoff}
      LIMIT ${CHUNK_SIZE}
    )
  `;

  let totalDeleted = 0;
  let iterations = 0;
  // Safety cap: max 20 iterations per table per cron run (= 100k rows).
  // If a table is severely bloated, this leaves the remainder for next hour.
  while (iterations < 20) {
    const result = await db.prepare(sql).run();
    const deleted = result.meta?.changes ?? 0;
    totalDeleted += deleted;
    iterations++;
    if (deleted === 0) break;
  }
  return totalDeleted;
}

/**
 * Prune ALL registered ledger tables.
 *
 * Each table is pruned independently; a failure on one table is logged and
 * skipped — other tables still get pruned. Returns a per-table summary.
 */
export async function pruneAllLedgers(
  db: D1Database
): Promise<Record<string, { deleted: number; error?: string }>> {
  const results: Record<string, { deleted: number; error?: string }> = {};

  for (const entry of LEDGER_REGISTRY) {
    try {
      const deleted = await pruneLedger(db, entry);
      if (deleted > 0) {
        console.log(`[LedgerPrune] ${entry.table}: deleted ${deleted} rows (>${entry.retentionDays}d)`);
      }
      results[entry.table] = { deleted };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[LedgerPrune] ${entry.table} prune failed: ${msg}`);
      results[entry.table] = { deleted: 0, error: msg };
    }
  }

  return results;
}

// ── JSON compaction ──────────────────────────────────────────────────────────

/**
 * Null out `original_response_json` on `processed_mutations` rows older than
 * JSON_NULL_AFTER_HOURS (48h) whose outcome is 'accepted'.
 *
 * Rationale (backlog #36, 2026-06-18 post-mortem):
 *   The full response JSON (~1.4 KB per row) is only needed for exact-replay
 *   fidelity — a client re-sending the same mutation_id within a short window.
 *   After 48h the practical retry window is closed; keeping the JSON for the
 *   remaining 5 days of the 7d retention window costs ~10× per-row storage
 *   with zero benefit. Nulling accepted rows cuts per-row size ~10x.
 *
 *   Only 'accepted' rows are nulled. 'conflict', 'merged_clean', and
 *   'dependency_failed' rows are LEFT with their JSON because those outcomes
 *   carry non-trivial diagnostic state (canonical_payload, current_payload,
 *   rejection reason) that may be useful for longer. The replay path handles
 *   all nulled rows with a synthesized response (see mutations.ts:readPrior).
 *
 * Chunked UPDATE to avoid D1 per-statement limits on large result sets.
 * Returns the number of rows compacted.
 */
const JSON_NULL_AFTER_HOURS = 48;
const JSON_NULL_CHUNK_SIZE = 2_000;

export async function compactProcessedMutationsJson(db: D1Database): Promise<number> {
  const cutoff = `datetime('now', '-${JSON_NULL_AFTER_HOURS} hours')`;
  // D1 doesn't natively support LIMIT in UPDATE; use a subquery on the PK.
  const sql = `
    UPDATE processed_mutations
    SET original_response_json = NULL
    WHERE mutation_id IN (
      SELECT mutation_id FROM processed_mutations
      WHERE processed_at < ${cutoff}
        AND outcome = 'accepted'
        AND original_response_json IS NOT NULL
      LIMIT ${JSON_NULL_CHUNK_SIZE}
    )
  `;

  let totalCompacted = 0;
  let iterations = 0;
  // Safety cap: max 20 iterations per cron run (= 40k rows).
  while (iterations < 20) {
    const result = await db.prepare(sql).run();
    const compacted = (result.meta?.changes as number | undefined) ?? 0;
    totalCompacted += compacted;
    iterations++;
    if (compacted === 0) break;
  }
  if (totalCompacted > 0) {
    console.log(`[LedgerCompact] processed_mutations: nulled JSON on ${totalCompacted} accepted rows (>${JSON_NULL_AFTER_HOURS}h)`);
  }
  return totalCompacted;
}

// ── Health Monitor ───────────────────────────────────────────────────────────

export interface LedgerHealth {
  table: string;
  rowCount: number;
  oldestRetainedAt: string | null;
  newestAt: string | null;
  /** True if row count exceeds the entry's maxRows threshold. */
  overRowBudget: boolean;
  /** True if a prune error was logged for this table. */
  pruneError: boolean;
}

export interface D1HealthReport {
  checkedAt: string;
  tables: LedgerHealth[];
  /** True if any table is overRowBudget or had a pruneError. */
  alertTriggered: boolean;
}

/**
 * Check row counts and oldest rows for all registered ledger tables.
 * If any table exceeds its `maxRows` budget, inserts a notification for
 * `nick-ingraham` via the notifications table (the existing Hub ops channel).
 *
 * Returns the health report (useful for tests and future /api/health extension).
 */
export async function monitorD1Health(
  db: D1Database,
  pruneResults: Record<string, { deleted: number; error?: string }>
): Promise<D1HealthReport> {
  const checkedAt = new Date().toISOString();
  const tables: LedgerHealth[] = [];
  let alertTriggered = false;

  for (const entry of LEDGER_REGISTRY) {
    let rowCount = 0;
    let oldestRetainedAt: string | null = null;
    let newestAt: string | null = null;

    try {
      const stats = await db
        .prepare(
          `SELECT COUNT(*) as cnt,
                  MIN(${entry.retentionColumn}) as oldest,
                  MAX(${entry.retentionColumn}) as newest
           FROM ${entry.table}`
        )
        .first<{ cnt: number; oldest: string | null; newest: string | null }>();
      rowCount = stats?.cnt ?? 0;
      oldestRetainedAt = stats?.oldest ?? null;
      newestAt = stats?.newest ?? null;
    } catch (e) {
      console.error(`[D1Health] stats query failed for ${entry.table}:`, e instanceof Error ? e.message : e);
    }

    const pruneError = !!(pruneResults[entry.table]?.error);
    const overRowBudget = entry.maxRows != null && rowCount > entry.maxRows;

    if (overRowBudget || pruneError) {
      alertTriggered = true;
    }

    tables.push({ table: entry.table, rowCount, oldestRetainedAt, newestAt, overRowBudget, pruneError });
  }

  if (alertTriggered) {
    await _createHealthAlert(db, tables, checkedAt);
  }

  console.log(
    `[D1Health] ${checkedAt} — ` +
      tables.map((t) => `${t.table}: ${t.rowCount} rows${t.overRowBudget ? ' ⚠ OVER BUDGET' : ''}`).join(', ')
  );

  return { checkedAt, tables, alertTriggered };
}

/**
 * Insert a notification for nick-ingraham when a table exceeds its budget.
 * Uses the existing notifications table (the Hub ops alert channel).
 * Idempotent-ish: one notification per monitor run, not per table.
 */
async function _createHealthAlert(
  db: D1Database,
  tables: LedgerHealth[],
  checkedAt: string
): Promise<void> {
  const overBudget = tables.filter((t) => t.overRowBudget || t.pruneError);
  if (overBudget.length === 0) return;

  const lines = overBudget.map((t) => {
    if (t.pruneError) return `${t.table}: prune error — ${t.rowCount} rows`;
    return `${t.table}: ${t.rowCount} rows (over budget)`;
  });

  const body =
    `D1 ledger alert at ${checkedAt}:\n` +
    lines.join('\n') +
    '\nCheck wrangler tail for prune errors. DB may be approaching timeout threshold.';

  try {
    await db
      .prepare(
        `INSERT INTO notifications
           (id, recipient_slug, type, source_type, source_id, title, body, link)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        generateId(),          // id
        'nick-ingraham',       // recipient — PI / system owner
        'system_alert',        // type
        'db_health',           // source_type
        'ledger-monitor',      // source_id
        'D1 ledger over budget', // title
        body,                  // body
        '/api/health'          // link — points to the health endpoint
      )
      .run();
  } catch (e) {
    // Never let a failed alert block the cron — just log it.
    console.error('[D1Health] alert notification insert failed:', e instanceof Error ? e.message : e);
  }
}

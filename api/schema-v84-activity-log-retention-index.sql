-- schema-v84-activity-log-retention-index.sql (2026-06-18, bounded-ledger primitive)
-- Add retention index on activity_log.timestamp so the chunked DELETE in
-- pruneAllLedgers() (api/lib/ledger-retention.ts) can use the index instead
-- of a full table scan.
--
-- activity_log is the second unbounded ledger identified in the 2026-06-18
-- D1 bloat post-mortem (22,403 rows as of that date, no retention). Registered
-- in LEDGER_REGISTRY with 180d retention + this index as requiredIndex.
--
-- No existing index covers just `timestamp` for range deletes. The only index
-- present historically was an implicit primary key on `id`.
--
-- APPLY (test FIRST, probe, then prod) — sanctioned wrapper ONLY:  wrangler-d1-allowed
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v84-activity-log-retention-index.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=api/schema-v84-activity-log-retention-index.sql

CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp
    ON activity_log(timestamp);

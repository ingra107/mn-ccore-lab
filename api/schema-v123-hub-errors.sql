-- schema-v123-hub-errors.sql (2026-10-10, Hub error ledger)
--
-- One durable store for Hub errors, so "Hub errors per week" is a number.
-- Nick approved the reconciled plan 2026-10-10 ("Approve as reconciled"):
-- PB Scratch/plans/2026-10-09-hub-error-ledger-reconciled.md, decision doc
-- PB Context/Decisions/2026-10-10-hub-error-ledger.md.
--
-- Why: /api runs as a Pages Function, which keeps no logs. Every console.error
-- in api/ and the request_id SEC-10.1 returns on a 500 joined to nothing.
-- The writer is api/lib/error-ledger.ts (withErrorLedger wraps the default
-- export; onError and POST /api/client-errors feed it).
--
-- Shape: one row per (fingerprint, day); day is the America/Chicago civil day. fingerprint = sha256 of
-- source | normalized message | top stack frame, first 16 hex; ids, digits,
-- hex runs and the request_id are stripped before hashing, so a loop of one
-- error is one row per day whatever its rate (count = count + n on upsert).
-- last_request_id keeps SEC-10.1's correlation id OUT of the fingerprint.
-- No project id column (check-project-identity-gate.py), Hub-only (not in
-- pb-schema, not synced to brain.db). Rows are readable on the raw handle only
-- (api/lib/table-scope.ts: no person or nobody viewer reads a row).
-- Retention: LEDGER_REGISTRY, 400 days on `day` (idx_hub_errors_day).
--
-- PRE-CHECKS (read-only):
--   a) v122 applied and v123 not:
--      SELECT version FROM schema_migrations WHERE version IN (122, 123);   -- expect one row: 122
--   b) the names are free:
--      SELECT name FROM sqlite_master WHERE name IN ('hub_errors', 'idx_hub_errors_day');  -- expect 0 rows
--
-- ORDER: this DDL (test, then prod) -> npm run deploy:worker -> npm run deploy:pages:gated.
-- The table must exist before the code that writes it ships; the writer drops
-- a failed flush to the original console.error, so the reverse order loses
-- entries but breaks nothing.
--
-- APPLY (test first, then prod; sanctioned wrapper only):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v123-hub-errors.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v123-hub-errors.sql
-- VERIFY:
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --json --command "SELECT MAX(version) AS v FROM schema_migrations"   -- 123
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --json --command "PRAGMA table_info(hub_errors)"                      -- 11 columns
-- ROLLBACK (after the code rollback; export the rows first if wanted:
--   SELECT * FROM hub_errors;). Leaving the table is harmless: additive, pruned.
--   DROP INDEX IF EXISTS idx_hub_errors_day;
--   DROP TABLE IF EXISTS hub_errors;
--   DELETE FROM schema_migrations WHERE version = 123;

CREATE TABLE IF NOT EXISTS hub_errors (
  fingerprint     TEXT NOT NULL,
  day             TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('server', 'cron', 'client')),
  count           INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  sample_message  TEXT NOT NULL,
  sample_stack    TEXT,
  path            TEXT,
  last_request_id TEXT,
  last_actor_slug TEXT,
  first_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (fingerprint, day)
);

CREATE INDEX IF NOT EXISTS idx_hub_errors_day ON hub_errors(day);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (123, 'schema-v123-hub-errors.sql');

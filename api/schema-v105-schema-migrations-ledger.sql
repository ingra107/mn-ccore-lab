-- schema-v105-schema-migrations-ledger.sql (2026-07-30)
--
-- Migration-ledger table (backlog #893): prod D1 has never recorded which
-- schema-v*.sql files actually executed against it -- "did this migration
-- run?" has twice been answerable only by counting rows by hand: #564 (the
-- schema-v6 action_items backfill, which HAD landed) and #559 (a two-week
-- false alarm claiming no --file migration had ever propagated, when v97 had).
-- check-schema-versions.py already guards the committed FILE set (INFRA-5);
-- nothing guards APPLY state on prod.
--
-- schema_migrations is that ledger. Every schema-vNN*.sql file from THIS file
-- onward (v105+) must end with a self-registering
--   INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (...)
-- naming its own filename -- enforced by check-schema-versions.py's new
-- self-registration assertion (LEDGER_EPOCH_VERSION = 105). The row lands
-- ONLY if the INSERT statement itself executes, which is the LAST statement
-- in every such file: a file that is committed but never applied leaves no
-- row, and a file that failed partway through also leaves no row. "Attempted
-- but failed" is visible as absence, not a false positive.
--
-- Pre-epoch files (v2-v104) are deliberately OUT of coverage -- no fabricated
-- history backfill. Retrofitting real apply history for 104 files that, per
-- .github/workflows/schema-drift.yml's own comment, "were never designed to
-- replay against each other" is a different and much larger project than
-- closing the going-forward gap #893 is about.
--
-- filename is the PRIMARY KEY (not version): a single version number can
-- carry more than one file today (schema-v22.sql / schema-v22-rename-columns
-- .sql) -- the same identity check-schema-versions.py already keys on.
--
-- NOT a bounded ledger (api/lib/ledger-retention.ts / check-ledger-registry.py
-- does not require this table to register, and it should not): retention
-- there exists for tables that grow unbounded with request traffic
-- (processed_mutations) and must be pruned. This table grows roughly once per
-- committed schema file -- development cadence, not request cadence -- and
-- every row is exactly the permanent audit history #893 exists to provide.
-- Pruning it would defeat the point.
--
-- Rollback -- INDEX FIRST, and both IF EXISTS:
--   DROP INDEX IF EXISTS idx_schema_migrations_version;
--   DROP TABLE IF EXISTS schema_migrations;
--   The obvious order is wrong. DROP TABLE also removes every index associated
--   with the table (SQLite lang_droptable), so "DROP TABLE" then "DROP INDEX"
--   errors on statement 2 with "no such index" and leaves the rollback
--   half-run. IF EXISTS on both makes the order forgiving either way.
--   (safe -- purely additive; nothing reads this table yet except the CI
--   drift step this same change adds, and that step soft-skips until the
--   table exists)
--
-- Apply (NOT executed by this commit -- prod D1 DDL needs its own named
-- authorization; see backlog #893's scope-question):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v105-schema-migrations-ledger.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v105-schema-migrations-ledger.sql

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT PRIMARY KEY,
  version     INTEGER NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);

-- Self-registration: this row is the proof that schema-v105 itself ran to
-- completion (must stay the LAST statement in this file).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (105, 'schema-v105-schema-migrations-ledger.sql');

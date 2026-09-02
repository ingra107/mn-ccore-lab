-- schema-v108-drop-raw-title-dedup-index.sql (2026-09-02)
--
-- Retire the raw-title name-identity index superseded by schema-v107.
--
-- Normalized uniqueness is strictly STRONGER than raw uniqueness: two rows
-- with the same title also have the same lower(trim(title)), so every pair the
-- raw index refused is a pair the normalized index refuses. Dropping it removes
-- a redundant constraint, never a live guarantee.
--
-- RUN ONLY AFTER both of these are true, in this order:
--   1. idx_tasks_title_norm_project_active exists in prod sqlite_master (read
--      it back; do NOT infer it from the migration's exit code), and
--   2. the Worker deploy that moved BOTH applyInsert dedup arms onto
--      lower(trim(title)) is live on mn-ccore-lab.pages.dev.
-- Dropping this first would leave a window with a looser index than the code,
-- which is the direction that can manufacture a violator.
--
-- The dedup SELECTs never named this index; only comments did, and they were
-- repointed in the same wave. api/routes/mutations.ts's catch matches
-- /UNIQUE constraint failed/i, which both index shapes produce.
--
-- ROLLBACK: re-create it, then drop v107's. Loosen the CODE first (redeploy
-- the previous Worker), then the DDL -- never the reverse.
--   CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_title_project_active
--     ON tasks(title, project_id)
--     WHERE deleted_at IS NULL
--       AND status != 'done'
--       AND (source IS NULL OR source != 'meeting_approval');
--   DROP INDEX IF EXISTS idx_tasks_title_norm_project_active;
--   The re-CREATE cannot fail on interim data, for the same superset reason
--   this DROP is safe.
--
-- Apply (NOT executed by this commit -- prod D1 DDL needs its own named
-- authorization; the schema file must NOT land before the DDL does):
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=api/schema-v108-drop-raw-title-dedup-index.sql

DROP INDEX IF EXISTS idx_tasks_title_project_active;

-- Self-registration: this row is the proof that schema-v108 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (108, 'schema-v108-drop-raw-title-dedup-index.sql');

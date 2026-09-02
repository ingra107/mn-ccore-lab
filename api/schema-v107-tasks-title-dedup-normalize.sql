-- schema-v107-tasks-title-dedup-normalize.sql (2026-09-02)
--
-- Normalize the task name-identity key to lower(trim(title)), and make the
-- project half of that key NULL-safe. PB backlog #530b; reconciled Dual-Plan
-- (builder + mechanic + codex), Nick's GO 2026-09-02.
--
-- WHY. Nick, 2026-08-18: a title differing only by case or edge whitespace IS
-- a duplicate. PB's local pre-check already keys on LOWER(TRIM(name))
-- (scripts/db/dedup.py find_name_duplicate, shipped 2026-07-16 as #530a),
-- while this database's central admission rule keyed on the raw title. A cache
-- that is STRICTER than its arbiter loses writes silently: PB collapses a case
-- variant locally, never POSTs it, and the task never exists. This index plus
-- the paired Worker deploy end that divergence.
--
-- WHY COALESCE(project_id, ''). SQLite treats NULLs as DISTINCT in a UNIQUE
-- index, so two active same-titled rows with project_id IS NULL both insert --
-- while the two applyInsert dedup SELECTs use `project_id IS ?`, which treats
-- NULL as EQUAL. The byte-match between the SELECTs and the index was
-- therefore ALREADY false for NULL-project rows, and the race window stayed
-- open for exactly them (1 of the 27 in-scope rows on 2026-09-02). PB's own
-- migration 038 used COALESCE(project_id, '') for this reason.
--
-- WHY A NEW NAME. `CREATE UNIQUE INDEX IF NOT EXISTS` matches on the NAME, so
-- re-declaring idx_tasks_title_project_active with a new key expression is a
-- SILENT NO-OP: the migration reports success, the ledger row lands, and
-- sqlite_master still holds the old definition (measured locally in SQLite
-- 3.50.4 -- a case variant still inserted afterwards). "CREATE the new index
-- FIRST, so it fails loud on a live violator" is only expressible under a
-- distinct identifier, so `_norm` is load-bearing, not cosmetic.
--
-- The predicate below is BYTE-IDENTICAL to schema-v92's Step 2 (read back out
-- of prod sqlite_master, not out of the file). Only the key expression
-- changes. v92's standing warning applies unchanged: this predicate must
-- BYTE-MATCH the two dedup SELECTs in api/routes/mutations.ts applyInsert
-- (serial + race-loser catch), or the SELECT-then-INSERT race hole reopens.
-- Both arms are now built from ONE exported constant, TASK_TITLE_KEY_SQL, and
-- api/routes/mutations.dedup-key-contract.test.ts reads THIS FILE and asserts
-- the two agree -- v92's comment is now a gate.
--
-- The meeting-approval exclusion is CARRIED FORWARD unchanged. Dropping it
-- re-breaks the 2026-07-02 wave (distinct meetings legally share a title).
-- The `status != 'done'` exemption is load-bearing too: 54 normalized groups
-- in this table hold more than one row once done rows are counted -- task
-- names legitimately repeat over time.
--
-- PRE-CHECK (must return 0 rows; do NOT auto-clean -- a violator is a decision
-- about which row survives, and v92's refusal to auto-clean is the better
-- precedent over v60's 201-row auto-soft-delete):
--   SELECT lower(trim(title)), COALESCE(project_id, ''), COUNT(*) c FROM tasks
--   WHERE deleted_at IS NULL
--     AND status != 'done'
--     AND (source IS NULL OR source != 'meeting_approval')
--   GROUP BY 1, 2 HAVING c > 1;
--   Measured 2026-09-02 on prod: 0 rows (27 rows in scope, 1,940 total).
--
-- ROLLBACK -- loosen the CODE first, then the DDL (never the reverse):
--   1. Redeploy the Worker with both arms back on the raw title.
--   2. CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_title_project_active
--        ON tasks(title, project_id)
--        WHERE deleted_at IS NULL AND status != 'done'
--          AND (source IS NULL OR source != 'meeting_approval');
--      (only needed once schema-v108 has run)
--   3. DROP INDEX IF EXISTS idx_tasks_title_norm_project_active;
--   The re-CREATE cannot fail on interim data: normalized uniqueness implies
--   raw uniqueness, so any row set this index admitted already satisfies the
--   raw one. What does NOT roll back is an adoption already made under the
--   normalized rule -- that is a data decision, undone by hand on the row.
--
-- Apply (NOT executed by this commit -- prod D1 DDL needs its own named
-- authorization; the schema file must NOT land before the DDL does):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v107-tasks-title-dedup-normalize.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v107-tasks-title-dedup-normalize.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_title_norm_project_active
  ON tasks(lower(trim(title)), COALESCE(project_id, ''))
  WHERE deleted_at IS NULL
    AND status != 'done'
    AND (source IS NULL OR source != 'meeting_approval');

-- Self-registration: this row is the proof that schema-v107 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (107, 'schema-v107-tasks-title-dedup-normalize.sql');

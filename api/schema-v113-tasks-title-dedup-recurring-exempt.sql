-- schema-v113-tasks-title-dedup-recurring-exempt.sql (2026-09-24)
--
-- Exempt recurring-marked task titles from the name-identity index. PB backlog
-- #8496; Nick decided the direction on 2026-09-10: restore the exemption at the
-- ARBITER rather than retire the `(recurring)` marker.
--
-- WHY. Until PB backlog #8352 (2026-09-09) PB's local create pre-check skipped
-- dedup for recurring-marked names (scripts/db/dedup.py is_recurring_name).
-- #8352 deleted that pre-check so the Hub adjudicates every create, and the
-- Hub had no such exemption: a "Weekly X (recurring)" created while the prior
-- instance was still open was ADOPTED onto the old row and its new content
-- discarded. The always-loaded PB rule that prescribes the marker went inert.
--
-- WHAT. The same key and scope as schema-v107's
-- idx_tasks_title_norm_project_active, plus three instr() clauses that leave a
-- recurring-marked title out of the index. The clauses are built in code from
-- api/lib/task-dedup-sql.ts TASK_TITLE_RECURRING_TOKENS and
-- api/routes/mutations.dedup-key-contract.test.ts asserts every one of them
-- appears in this predicate.
--
-- The exemption is a function of the key (every token is space-free, and
-- lower(trim(title)) differs from lower(title) only by edge spaces), so it
-- never splits an identity group. instr(), not LIKE: `_` is a LIKE wildcard and
-- LIKE's case folding depends on PRAGMA case_sensitive_like.
--
-- WHY A NEW NAME. `CREATE UNIQUE INDEX IF NOT EXISTS` matches on the NAME, so
-- re-declaring idx_tasks_title_norm_project_active with a new predicate is a
-- SILENT NO-OP (schema-v107's header records the measurement). Hence `_nonrecurring`.
--
-- WHY THE DROP IS IN THIS FILE (v107/v108 split theirs). The new index covers a
-- SUBSET of the old one's rows, so it cannot fail on live data, and dropping the
-- old index while the PREVIOUS Worker is live is safe: that Worker still adopts
-- recurring titles in its serial SELECT, i.e. the code is stricter than the
-- index, which cannot manufacture a violator. The unsafe order is the other
-- one: the NEW Worker against the OLD index would skip adoption, hit the old
-- index's UNIQUE refusal, find no winner in its (exempting) race-loser
-- re-query, and dead-letter the create. So: APPLY THIS FILE, READ IT BACK, THEN
-- DEPLOY THE WORKER. Never the reverse.
--
-- PRE-CHECK: none needed for the CREATE (subset of an index that already
-- holds). Read-back after apply (must return exactly the new index, and no row
-- for the old name):
--   SELECT name, sql FROM sqlite_master WHERE type='index'
--    AND name IN ('idx_tasks_title_norm_nonrecurring_active',
--                 'idx_tasks_title_norm_project_active');
--
-- ROLLBACK -- loosen the CODE first, then the DDL (never the reverse):
--   1. Redeploy the previous Worker. It is correct against THIS index (stricter
--      code, looser index), so stopping here is a complete rollback.
--   2. Only if the old index is wanted back, first check that no recurring pair
--      was admitted in the meantime (must return 0 rows, else the CREATE fails):
--        SELECT lower(trim(title)), COALESCE(project_id, ''), COUNT(*) c FROM tasks
--        WHERE deleted_at IS NULL AND status != 'done'
--          AND (source IS NULL OR source != 'meeting_approval')
--        GROUP BY 1, 2 HAVING c > 1;
--      then
--        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_title_norm_project_active
--          ON tasks(lower(trim(title)), COALESCE(project_id, ''))
--          WHERE deleted_at IS NULL AND status != 'done'
--            AND (source IS NULL OR source != 'meeting_approval');
--        DROP INDEX IF EXISTS idx_tasks_title_norm_nonrecurring_active;
--
-- Apply (NOT executed by this commit -- prod D1 DDL needs its own named
-- authorization):
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=api/schema-v113-tasks-title-dedup-recurring-exempt.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_title_norm_nonrecurring_active
  ON tasks(lower(trim(title)), COALESCE(project_id, ''))
  WHERE deleted_at IS NULL
    AND status != 'done'
    AND (source IS NULL OR source != 'meeting_approval')
    AND instr(lower(title), '(recurring)') = 0
    AND instr(lower(title), '_recurring') = 0
    AND instr(lower(title), 'recurring:') = 0;

DROP INDEX IF EXISTS idx_tasks_title_norm_project_active;

-- Self-registration: this row is the proof that schema-v113 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (113, 'schema-v113-tasks-title-dedup-recurring-exempt.sql');

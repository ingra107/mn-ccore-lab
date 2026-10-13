-- schema-v138-tasks-title-dedup-per-assignee.sql (2026-10-13)
--
-- A PROJECT-LESS task's name identity is (title, ASSIGNEE), not (title). #145
-- follow-up: "project-less task title dedup keys lab-wide, so two people's
-- same-named private tasks collide."
--
-- WHY. schema-v113's idx_tasks_title_norm_nonrecurring_active keys an open task
-- on (lower(trim(title)), COALESCE(project_id, '')). For a task on a project
-- that is right: the project is the shared place and two open tasks of one name
-- there are one task. A task with NO project is private to its assignee (the
-- #145 read rule shows it only to its assignee, assigner and watchers), so the
-- same key made Casey's "Review draft" and Nick's "Review draft" one identity:
-- the dedup SELECT could adopt the other person's row (through the PB key, or
-- any handle that can see both), and the INSERT hit the lab-wide UNIQUE index
-- when it could not see the other row, which dead-letters the create.
--
-- WHAT. The same index plus a third key part: for a project-less task, the
-- assignee; for a project task, '' (so nothing changes there). The expression
-- is api/lib/task-dedup-sql.ts TASK_OWNER_KEY_SQL and the dedup SELECT compares
-- the same expression, so the arm and the index still agree;
-- api/routes/mutations.dedup-key-contract.test.ts reads this file and checks.
--
-- WHY A NEW NAME. `CREATE UNIQUE INDEX IF NOT EXISTS` matches on the NAME, so
-- re-declaring idx_tasks_title_norm_nonrecurring_active with a new key is a
-- silent no-op (v107 and v113 both record the measurement). Hence `_owner_`.
--
-- ORDER IS THE REVERSE OF v113's REASONING. This index is LOOSER than the one it
-- replaces (every pair it refuses, the old one refused too; the old one also
-- refused cross-assignee project-less pairs). So the CREATE cannot fail on live
-- data, and the NEW Worker against the OLD index would skip adoption of a
-- cross-assignee pair and then hit the old UNIQUE refusal with no winner it can
-- re-query: a dead-lettered create. The OLD Worker against the NEW index is
-- stricter code than the index, which cannot manufacture a violator. So:
-- APPLY THIS FILE, READ IT BACK, THEN DEPLOY THE WORKER. Never the reverse.
--
-- REASSIGN. A project-less task handed to someone who already holds an open task
-- of the same name now hits this index on the UPDATE, exactly as a rename onto
-- a taken title always has. The patch path reports the constraint error; it
-- does not merge two tasks.
--
-- PRE-CHECK: none needed (looser than an index that already holds). Read-back
-- after apply (must return exactly the new index, and no row for the old name):
--   SELECT name, sql FROM sqlite_master WHERE type='index'
--    AND name IN ('idx_tasks_title_norm_owner_active',
--                 'idx_tasks_title_norm_nonrecurring_active');
--
-- ROLLBACK -- loosen the CODE first, then the DDL (never the reverse):
--   1. Redeploy the previous Worker. It is correct against THIS index
--      (stricter code, looser index), so stopping here is a complete rollback.
--   2. Only if the v113 index is wanted back, first check that no cross-assignee
--      project-less pair was admitted in the meantime (must return 0 rows, else
--      the CREATE fails):
--        SELECT lower(trim(title)), COALESCE(project_id, ''), COUNT(*) c FROM tasks
--        WHERE deleted_at IS NULL AND status != 'done'
--          AND (source IS NULL OR source != 'meeting_approval')
--          AND instr(lower(title), '(recurring)') = 0
--          AND instr(lower(title), '_recurring') = 0
--          AND instr(lower(title), 'recurring:') = 0
--        GROUP BY 1, 2 HAVING c > 1;
--      then
--        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_title_norm_nonrecurring_active
--          ON tasks(lower(trim(title)), COALESCE(project_id, ''))
--          WHERE deleted_at IS NULL AND status != 'done'
--            AND (source IS NULL OR source != 'meeting_approval')
--            AND instr(lower(title), '(recurring)') = 0
--            AND instr(lower(title), '_recurring') = 0
--            AND instr(lower(title), 'recurring:') = 0;
--        DROP INDEX IF EXISTS idx_tasks_title_norm_owner_active;
--
-- Apply (NOT executed by this commit -- prod D1 DDL needs its own named
-- authorization):
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=api/schema-v138-tasks-title-dedup-per-assignee.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_title_norm_owner_active
  ON tasks(lower(trim(title)), COALESCE(project_id, ''), CASE WHEN project_id IS NULL THEN COALESCE(assignee, '') ELSE '' END)
  WHERE deleted_at IS NULL
    AND status != 'done'
    AND (source IS NULL OR source != 'meeting_approval')
    AND instr(lower(title), '(recurring)') = 0
    AND instr(lower(title), '_recurring') = 0
    AND instr(lower(title), 'recurring:') = 0;

DROP INDEX IF EXISTS idx_tasks_title_norm_nonrecurring_active;

-- Self-registration: this row is the proof that schema-v138 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (138, 'schema-v138-tasks-title-dedup-per-assignee.sql');

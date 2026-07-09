-- schema-v97-completed-at-repair.sql (2026-07-09)
-- Repairs the 11 task rows that schema-v96-action-items-backfill.sql wrote at
-- status='done' AND completed_at IS NULL.
--
-- CAUSE: v96 (and its source template schema-v6.sql:36-54) derived `status`
-- from `completed` but passed `completed_at` through raw. The 15 seeded
-- action_items in seed-v2.sql set `completed` (0/1) and never set
-- `completed_at`, so the 11 rows with completed=1 landed as done-with-no-
-- timestamp. Both SQL files are fixed as of 2026-07-09 so a re-run cannot
-- recreate the state; this file repairs the rows already written.
--
-- IMPACT: PB invariant I2 ("done tasks missing completed_at") has been in
-- ERROR since 2026-07-08, exiting audit-runner non-zero on BOTH machines
-- every night (backlog #550). These 11 rows are the entire violation set:
--   SELECT COUNT(*) FROM tasks WHERE status='done' AND completed_at IS NULL;
--   -- 11, all id LIKE 'ai-%', all source='meeting'
--
-- VALUE CHOICE: completed_at := created_at ('2026-03-26 03:22:16').
-- These are seeded demo rows that were born already-completed; there is no
-- true completion instant to recover. created_at is the only honest
-- timestamp actually present on the row. Deliberately NOT due_date, which
-- would fabricate a plausible-but-false completion date.
--
-- SCOPE: bounded to ids that came from the v96 backfill (id IN action_items)
-- so a real task that is independently in this broken state is NOT silently
-- stamped with its creation time — that would be a different bug needing a
-- different answer. Today those sets coincide exactly (11 == 11).
--
-- Idempotent / re-runnable: the WHERE clause self-excludes once repaired.
--
-- APPLY (test FIRST, probe, then prod — sanctioned wrapper ONLY):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v97-completed-at-repair.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v97-completed-at-repair.sql
--
-- VERIFY (expect 0):
--   SELECT COUNT(*) FROM tasks WHERE status='done' AND completed_at IS NULL;

UPDATE tasks
SET completed_at = created_at
WHERE status = 'done'
  AND completed_at IS NULL
  AND id IN (SELECT id FROM action_items);

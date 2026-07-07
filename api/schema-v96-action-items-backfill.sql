-- schema-v96-action-items-backfill.sql (2026-07-07)
-- Re-run of schema-v6.sql's backfill (line 36) — the ORIGINAL never landed
-- in prod. Evidence (T9 investigation):
--   SELECT a.id FROM action_items a LEFT JOIN tasks t ON t.id = a.id
--     WHERE t.id IS NULL
-- returns ALL 23 action_items rows, including the 15 original seed rows
-- (ai-1..ai-15, created 2026-03-26 03:22:16) that schema-v6.sql's own header
-- comment claims it already backfilled ("backfills from action_items (19
-- rows)"). Either that INSERT never executed against mnccore-lab, or its
-- output was later removed by something else — not chased further here.
-- 4 of the 23 are still `completed=0` (ai-1, ai-2, ai-3, ai-6) and their
-- parent meetings (mtg-2026-03-11, mtg-2026-03-25) still exist, so this
-- backfill produces valid, joinable task rows for them — required so the
-- T9 frontend conversion (Meetings.tsx "All Pending Actions" -> tasks
-- model, filtered on meeting_id IS NOT NULL) doesn't silently drop them
-- from every UI surface once GET /api/action-items is retired.
--
-- No `created_at` guard: unlike the brief's original assumption (a few
-- post-v6 stragglers), the finding is the WHOLE original backfill is
-- missing — this covers all 23 rows, identically to schema-v6.sql's shape.
--
-- Idempotent / re-runnable: INSERT OR IGNORE on the preserved `id` (tasks.id
-- is PK) — a second run against an already-backfilled DB is a no-op.
-- action_items table is untouched (stays as the rollback net, per T9 step 5).
--
-- Column mapping copied verbatim from schema-v6.sql:36-54.
--
-- APPLY (test FIRST, probe, then prod — sanctioned wrapper ONLY):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v96-action-items-backfill.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v96-action-items-backfill.sql
-- (prod command staged only — Nick fires prod, per T9 dispatch contract.)

INSERT OR IGNORE INTO tasks (
  id, meeting_id, project_id, title, description, assignee,
  due_date, completed, completed_at, completed_by, created_at,
  source, status, priority
)
SELECT
  id, meeting_id, project_id,
  description,
  description,
  assignee,
  due_date,
  completed,
  completed_at,
  completed_by,
  created_at,
  CASE WHEN meeting_id IS NOT NULL THEN 'meeting' ELSE 'manual' END,
  CASE WHEN completed = 1 THEN 'done' ELSE 'todo' END,
  'medium'
FROM action_items;

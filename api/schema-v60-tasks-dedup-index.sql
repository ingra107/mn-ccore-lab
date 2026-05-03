-- schema-v60-tasks-dedup-index.sql
--
-- Task A (2026-05-03): structural close of the (title, project_id) dedup
-- race window. Phase 2 commit 651e1fb5 added application-layer dedup but
-- left a race: two concurrent applyInsert calls with different record_ids
-- but same (title, project_id) can both pass the SELECT check before either
-- INSERT lands.
--
-- This partial index makes the constraint structural:
--   UNIQUE(title, project_id) WHERE deleted_at IS NULL AND status != 'done'
--
-- SQLite partial UNIQUE indexes are not directly creatable with that syntax
-- in D1 (no CREATE UNIQUE INDEX ... WHERE). We use a standard partial index
-- via `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE ...` which SQLite 3.8.9+
-- and D1 support.
--
-- Conflict handling: the INSERT in applyInsert already uses ON CONFLICT(id)
-- DO NOTHING for the same-record_id idempotency case. The (title, project_id)
-- conflict lands on a DIFFERENT column set — the application-layer dedup
-- SELECT-then-INSERT sequence is the first line of defense; this index is the
-- structural backstop for the race window between the SELECT and the INSERT.
-- When the index fires (the race is lost), the INSERT is silently ignored
-- (DO NOTHING on the id conflict doesn't help here — we need DO NOTHING on
-- the title+project_id conflict). Because D1/SQLite only supports one
-- ON CONFLICT clause per INSERT statement, and applyInsert already uses
-- ON CONFLICT(id) DO NOTHING, the structural index will produce a D1 error
-- on the losing-race INSERT rather than a silent no-op. The application-
-- layer dedup catches the serial case; the index adds defense for the race.
--
-- Pre-dedup step: soft-delete all but the oldest row for each duplicate
-- (title, project_id) group. The duplicate rows are all I18 incident
-- artifacts (mechanic triage tasks created before Phase 2 shipped, plus
-- test rows). We keep the oldest (min created_at) per group.
--
-- Applied 2026-05-03 via:
--   npx wrangler d1 execute mnccore-lab --remote --file=api/schema-v60-tasks-dedup-index.sql

-- Step 1: soft-delete duplicate rows, keeping the oldest per (title, project_id) group.
-- Uses a correlated subquery to identify non-canonical rows.
UPDATE tasks
SET
  deleted_at = datetime('now'),
  updated_at = datetime('now')
WHERE
  deleted_at IS NULL
  AND status != 'done'
  AND id NOT IN (
    -- canonical row = min(rowid) per (title, project_id) group
    -- ROWID is implicit PK in SQLite, monotonically increasing with INSERT order.
    -- For equal created_at values, ROWID gives a stable tiebreaker.
    SELECT MIN(rowid)
    FROM tasks t2
    WHERE
      t2.deleted_at IS NULL
      AND t2.status != 'done'
    GROUP BY t2.title, t2.project_id
  )
  AND title IN (
    -- Only target known-duplicate titles to avoid touching legitimate rows
    SELECT title
    FROM tasks
    WHERE deleted_at IS NULL AND status != 'done'
    GROUP BY title, project_id
    HAVING COUNT(*) > 1
  );

-- Step 2: create the structural partial unique index.
-- Fires on any INSERT/UPDATE that would create a second active
-- (deleted_at IS NULL AND status != 'done') row with the same (title, project_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_title_project_active
  ON tasks(title, project_id)
  WHERE deleted_at IS NULL AND status != 'done';

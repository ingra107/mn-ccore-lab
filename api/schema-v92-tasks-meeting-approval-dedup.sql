-- schema-v92-tasks-meeting-approval-dedup.sql
--
-- Meeting-dedup wave (2026-07-02): split the single universal task-insert
-- identity rule into TWO explicit identity classes so meeting-approval tasks
-- are keyed by (source, meeting_id) instead of (title, project_id).
--
-- WHY: a meeting-approval task is the durable cross-machine approval handle for
-- a staged transcript. Distinct meetings routinely share a title
-- ("Meeting: … [pending approval]"), so the universal (title, project_id)
-- index (schema-v60 idx_tasks_title_project_active) falsely blocked / adopted
-- the second distinct meeting, orphaning its transcript and mis-keying its
-- Telegram buttons. See PB Context/Decisions/2026-07-02-codex-meetdedup-third-seat.md.
--
-- The two partial-index predicates below BYTE-MATCH the two dedup SELECTs in
-- api/routes/mutations.ts applyInsert (serial + race-loser catch). A predicate
-- mismatch reopens the SELECT-then-INSERT race hole through the catch.
--
-- PRE-CHECK (run BEFORE this migration; do NOT auto-clean):
--   SELECT source, meeting_id, COUNT(*) c FROM tasks
--   WHERE source = 'meeting_approval' AND meeting_id IS NOT NULL
--     AND deleted_at IS NULL AND status != 'done'
--   GROUP BY source, meeting_id HAVING c > 1;
--   Expect 0 rows. If any exist, STOP and report — the new meeting index would
--   fail to build. (Legal same-TITLE distinct-meeting rows are fine and NOT
--   cleaned; only true (source, meeting_id) duplicates would block the index.)
--
-- Applied 2026-07-02 via the sanctioned env-stripping entry point (NOT raw
-- `npx wrangler d1`, which shadows the D1-scoped OAuth creds):
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=api/schema-v92-tasks-meeting-approval-dedup.sql

-- Step 1: drop the universal (title, project_id) active index. It encodes the
-- broken universal name identity and blocks legal distinct meeting approvals
-- with the same title/project.
DROP INDEX IF EXISTS idx_tasks_title_project_active;

-- Step 2: recreate the (title, project_id) active index for NON-meeting rows
-- only. Preserves I18's structural race guard for name-keyed task producers
-- while removing meeting approvals from the name identity class.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_title_project_active
  ON tasks(title, project_id)
  WHERE deleted_at IS NULL
    AND status != 'done'
    AND (source IS NULL OR source != 'meeting_approval');

-- Step 3: structural identity for meeting approvals — makes same-meeting retry
-- and two-machine duplication impossible. Keyed by (source, meeting_id) over
-- only the active (non-deleted, non-done) meeting-approval rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_meeting_approval_active
  ON tasks(source, meeting_id)
  WHERE source = 'meeting_approval'
    AND meeting_id IS NOT NULL
    AND deleted_at IS NULL
    AND status != 'done';

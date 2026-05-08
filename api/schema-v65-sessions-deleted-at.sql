-- schema-v65-sessions-deleted-at.sql (2026-05-07)
-- Stage 3 Phase 3 v3 — codex pass-2 M5 fix.
--
-- Adds deleted_at column to the sessions table so that applyDelete mutations
-- can soft-delete sessions rows using the standard Hub convention
-- (deleted_at = datetime('now')).
--
-- Required for Task 9 cleanup of 9 stranded session_2026-05-07T1[4-5]-XX-...
-- rows. Without this column, a DELETE mutation against sessions would fail with
-- D1_ERROR: table sessions has no column named deleted_at, and the cleanup
-- would silently no-op or error out.
--
-- Apply via (strip env first per feedback_wrangler-home-auth-works.md):
--   unset CLOUDFLARE_API_TOKEN && unset CLOUDFLARE_ACCOUNT_ID
--   wrangler d1 execute mnccore-lab --remote --file=api/schema-v65-sessions-deleted-at.sql

ALTER TABLE sessions ADD COLUMN deleted_at TEXT;

-- Sparse index: only non-NULL rows are meaningful for tombstone queries.
CREATE INDEX IF NOT EXISTS idx_sessions_deleted_at
    ON sessions(deleted_at) WHERE deleted_at IS NOT NULL;

-- v45 (2026-04-19): Add projects.deleted_at for soft-delete parity with tasks.
--
-- Motivation: End-to-end sync audit 2026-04-19 found that Hub project delete
-- hard-DROPs the row, giving brain.db no signal to mirror the delete.
-- tasks.deleted_at exists since v22; projects missed it. Adding here closes
-- the gap so /api/projects/deleted-since can expose a tombstone list for
-- sync_d1_pull to consume.
--
-- Migration: additive column only. Existing hard-delete code paths (duplicate
-- cleanup scripts etc.) still work; the cascade writes deleted_at first, then
-- keeps the row tombstoned for 30 days before a sweep reclaims it.

ALTER TABLE projects ADD COLUMN deleted_at TEXT;

-- Indexed lookup for the /api/projects/deleted-since?since=X query.
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at)
  WHERE deleted_at IS NOT NULL;

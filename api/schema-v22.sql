-- v22: Add updated_at + deleted_at for bidirectional sync (Phase 24B)
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v22.sql --remote
-- Or: POST /api/admin/migrate with {"version": 22}

-- Track when each task was last modified (for delta sync).
-- Note 2026-04-21: prod's sqlite_master shows this column without a
-- DEFAULT clause — the live table was rebuilt at some point and the
-- default clause didn't survive. Committed definition reconciled to
-- match. Application code explicitly sets updated_at on every write
-- path (api/routes/tasks.ts), so the default was never load-bearing.
ALTER TABLE tasks ADD COLUMN updated_at TEXT;

-- Soft-delete: set deleted_at instead of hard DELETE (prevents zombie re-push)
ALTER TABLE tasks ADD COLUMN deleted_at TEXT;

-- Index for delta sync queries (updated_since filter)
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);

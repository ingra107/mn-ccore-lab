-- v22: Add updated_at + deleted_at for bidirectional sync (Phase 24B)
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v22.sql --remote
-- Or: POST /api/admin/migrate with {"version": 22}

-- Track when each task was last modified (for delta sync)
ALTER TABLE tasks ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- Soft-delete: set deleted_at instead of hard DELETE (prevents zombie re-push)
ALTER TABLE tasks ADD COLUMN deleted_at TEXT;

-- Index for delta sync queries (updated_since filter)
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);

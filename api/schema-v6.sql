-- MN-CCORE Lab Hub — Schema v6: Unified Tasks (replaces action_items)
-- Run with: scripts/wrangler-d1 d1 execute mnccore-lab --file=api/schema-v6.sql --remote
--
-- Creates unified tasks table, backfills from action_items (19 rows).
-- action_items table is preserved as safety net for 1-2 weeks.

-- 1. Create tasks table with full schema
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  meeting_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  assignee TEXT NOT NULL,
  assigned_by TEXT,
  due_date TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'todo',
  source TEXT DEFAULT 'manual',
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  completed_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 2. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_meeting ON tasks(meeting_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);

-- 3. Backfill from existing action_items (preserves all data)
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
  -- action_items rows may carry completed=1 with a NULL completed_at (the
  -- seed rows in seed-v2.sql never set it). Deriving `status` from
  -- `completed` while passing `completed_at` through raw emits
  -- status='done' AND completed_at IS NULL, which violates invariant I2.
  -- Derive both from the same expression so that state is unrepresentable.
  CASE WHEN completed = 1 THEN COALESCE(completed_at, created_at) END,
  completed_by,
  created_at,
  CASE WHEN meeting_id IS NOT NULL THEN 'meeting' ELSE 'manual' END,
  CASE WHEN completed = 1 THEN 'done' ELSE 'todo' END,
  'medium'
FROM action_items;

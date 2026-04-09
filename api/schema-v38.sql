-- v38: Task subtasks table for checklist functionality
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v38.sql --remote

CREATE TABLE IF NOT EXISTS task_subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  completed_by TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_subtasks_task ON task_subtasks(task_id);

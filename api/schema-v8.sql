-- schema-v8.sql — Task Comments
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v8.sql --remote

CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  author_slug TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

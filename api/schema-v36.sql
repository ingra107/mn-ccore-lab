-- v36: task_updates — append-only timestamped notes for tasks (mirrors project_updates)
CREATE TABLE IF NOT EXISTS task_updates (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  author_slug TEXT NOT NULL,
  content TEXT NOT NULL,
  update_type TEXT DEFAULT 'progress',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_updates_task ON task_updates(task_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_created ON task_updates(created_at);

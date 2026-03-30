-- v18: Add task_handoffs table for structured SBAR-inspired handoff protocol
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v18.sql --remote

CREATE TABLE IF NOT EXISTS task_handoffs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  from_slug TEXT NOT NULL,
  to_slug TEXT NOT NULL,
  situation TEXT NOT NULL,
  background TEXT,
  assessment TEXT,
  recommendation TEXT,
  acknowledged INTEGER DEFAULT 0,
  acknowledged_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_handoffs_task ON task_handoffs(task_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_to ON task_handoffs(to_slug);

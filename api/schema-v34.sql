-- v34: Task detail LabSync parity — watchers, reminders, instructions, file links
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v34.sql --remote
-- Or: POST /api/admin/migrate with {"version": 34}

-- Watchers: comma-separated slugs of people to notify (not assignee)
ALTER TABLE tasks ADD COLUMN watchers TEXT;

-- Reminder: days before due date to send email reminder
ALTER TABLE tasks ADD COLUMN reminder_days INTEGER;

-- Instructions: step-by-step protocols, separate from description
ALTER TABLE tasks ADD COLUMN instructions TEXT;

-- Task file links (URL-based, no binary upload)
CREATE TABLE IF NOT EXISTS task_files (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  file_type TEXT DEFAULT 'link',
  uploaded_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id);

-- v37: Key links on tasks + email drafts + file activity daily
ALTER TABLE tasks ADD COLUMN key_link_1 TEXT;
ALTER TABLE tasks ADD COLUMN key_link_1_desc TEXT;
ALTER TABLE tasks ADD COLUMN key_link_2 TEXT;
ALTER TABLE tasks ADD COLUMN key_link_2_desc TEXT;
ALTER TABLE tasks ADD COLUMN key_link_3 TEXT;
ALTER TABLE tasks ADD COLUMN key_link_3_desc TEXT;

CREATE TABLE IF NOT EXISTS email_drafts (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  gmail_draft_url TEXT,
  draft_type TEXT,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS file_activity_daily (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  project_id TEXT,
  project_name TEXT,
  file_count INTEGER DEFAULT 0,
  total_events INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(date, project_id)
);

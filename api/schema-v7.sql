-- schema-v7.sql — Ideas Board
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v7.sql --remote

CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  submitted_by TEXT NOT NULL,
  research_area TEXT,
  status TEXT DEFAULT 'new',  -- new, under_review, approved, parked, archived
  votes INTEGER DEFAULT 0,
  project_id TEXT,            -- linked if idea becomes a project
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_ideas_submitted_by ON ideas(submitted_by);

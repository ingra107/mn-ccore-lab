-- Schema v23: Paper Revision Tracker
-- Tracks manuscript revision rounds with per-comment status tracking.

CREATE TABLE IF NOT EXISTS manuscript_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  submitted_at TEXT,
  response_due TEXT,
  status TEXT DEFAULT 'in_progress',
  journal TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviewer_comments (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL,
  reviewer_number INTEGER DEFAULT 1,
  comment_text TEXT NOT NULL,
  assigned_to TEXT DEFAULT 'nick',
  status TEXT DEFAULT 'pending',
  response_text TEXT,
  resolved_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (revision_id) REFERENCES manuscript_revisions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_revisions_project ON manuscript_revisions(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_revision ON reviewer_comments(revision_id);

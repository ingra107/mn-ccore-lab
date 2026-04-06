-- v26: Submission lifecycle events — track paper submission journey
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v26.sql --remote
-- Or: POST /api/admin/migrate with {"version": 26}

CREATE TABLE IF NOT EXISTS submission_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_date TEXT NOT NULL,
  journal TEXT,
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submission_events_project ON submission_events(project_id);
CREATE INDEX IF NOT EXISTS idx_submission_events_date ON submission_events(event_date);
CREATE INDEX IF NOT EXISTS idx_submission_events_type ON submission_events(event_type);

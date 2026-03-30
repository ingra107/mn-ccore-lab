-- v15: Add decision_log table for tracking decisions with outcome review
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v15.sql --remote

CREATE TABLE IF NOT EXISTS decision_log (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  rationale TEXT,
  context TEXT,
  project_slug TEXT,
  meeting_id TEXT,
  decided_by TEXT,
  outcome TEXT,
  outcome_date TEXT,
  outcome_status TEXT DEFAULT 'pending',
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decisions_project ON decision_log(project_slug);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decision_log(outcome_status);

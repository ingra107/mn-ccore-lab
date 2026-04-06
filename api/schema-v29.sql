-- v29: Grant Post-Award Lifecycle Tracking — progress reports, continuing review, NCE, budget periods
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v29.sql --remote
-- Or: POST /api/admin/migrate with {"version": 29}

CREATE TABLE IF NOT EXISTS grant_milestones (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL,
  milestone_type TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT,
  completed_at TEXT,
  status TEXT DEFAULT 'upcoming',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grant_milestones_grant ON grant_milestones(grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_milestones_due ON grant_milestones(due_date);
CREATE INDEX IF NOT EXISTS idx_grant_milestones_status ON grant_milestones(status);

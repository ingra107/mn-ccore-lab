-- v24: Mentee Milestone Dashboard — per-mentee timeline tracking
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v24.sql --remote
-- Or: POST /api/admin/migrate with {"version": 24}

CREATE TABLE IF NOT EXISTS mentee_milestones (
  id TEXT PRIMARY KEY,
  mentee_slug TEXT NOT NULL,
  milestone_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  completed_at TEXT,
  status TEXT DEFAULT 'upcoming',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mentee_milestones_mentee ON mentee_milestones(mentee_slug);
CREATE INDEX IF NOT EXISTS idx_mentee_milestones_due ON mentee_milestones(due_date);
CREATE INDEX IF NOT EXISTS idx_mentee_milestones_status ON mentee_milestones(status);

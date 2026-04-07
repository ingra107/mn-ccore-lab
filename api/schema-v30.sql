-- v30: PB Session History — browse past Claude Code sessions
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v30.sql --remote
-- Or: POST /api/admin/migrate with {"version": 30}

CREATE TABLE IF NOT EXISTS pb_sessions (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  machine TEXT,
  project_name TEXT,
  summary TEXT,
  actions_count INTEGER DEFAULT 0,
  commits_count INTEGER DEFAULT 0,
  duration_minutes INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pb_sessions_started ON pb_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_pb_sessions_project ON pb_sessions(project_name);

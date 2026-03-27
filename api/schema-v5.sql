-- MN-CCORE Lab Hub — Schema v5: Commitments
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v5.sql --remote

CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY,
  commitment TEXT NOT NULL,
  to_whom TEXT NOT NULL,
  status TEXT DEFAULT 'open',        -- 'open', 'done'
  due_date TEXT,
  source TEXT,                       -- e.g. 'meeting: Adams/Emma Zoom 2026-03-20'
  project TEXT,                      -- optional project link
  task_id TEXT,                      -- optional link to brain.db task
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_commitments_to ON commitments(to_whom, status);
CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments(status);

-- v19: Add ai_requests table for AI Co-Scientist infrastructure
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v19.sql --remote

CREATE TABLE IF NOT EXISTS ai_requests (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  project_slug TEXT,
  prompt TEXT NOT NULL,
  context TEXT,
  response TEXT,
  status TEXT DEFAULT 'pending',
  requested_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  responded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_status ON ai_requests(status);
CREATE INDEX IF NOT EXISTS idx_ai_requests_project ON ai_requests(project_slug);

-- v17: Add expertise_tags table for member skills with auto-inference from publications
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v17.sql --remote

CREATE TABLE IF NOT EXISTS expertise_tags (
  id TEXT PRIMARY KEY,
  member_slug TEXT NOT NULL,
  tag TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  confidence REAL DEFAULT 1.0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(member_slug, tag)
);

CREATE INDEX IF NOT EXISTS idx_expertise_member ON expertise_tags(member_slug);
CREATE INDEX IF NOT EXISTS idx_expertise_tag ON expertise_tags(tag);

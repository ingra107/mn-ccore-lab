-- v14: Add project_dependencies table for visualizing project relationships
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v14.sql --remote

CREATE TABLE IF NOT EXISTS project_dependencies (
  id TEXT PRIMARY KEY,
  from_slug TEXT NOT NULL,
  to_slug TEXT NOT NULL,
  relationship_type TEXT DEFAULT 'feeds_into',
  note TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(from_slug, to_slug)
);

CREATE INDEX IF NOT EXISTS idx_deps_from ON project_dependencies(from_slug);
CREATE INDEX IF NOT EXISTS idx_deps_to ON project_dependencies(to_slug);

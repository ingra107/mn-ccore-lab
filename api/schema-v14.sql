-- v14: project_dependencies table for visualizing project relationships.
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v14.sql --remote
--
-- Definition reconciled 2026-04-21 to match live prod D1 (table was
-- rebuilt on prod at some point to use composite PK instead of separate
-- id/UNIQUE combination; original v14 definition differed in PK, default
-- value, and NOT NULL constraint on relationship_type). Prod is
-- authoritative; committed definition now matches.

CREATE TABLE IF NOT EXISTS project_dependencies (
  from_slug TEXT NOT NULL,
  to_slug TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'related_to',
  created_at TEXT DEFAULT (datetime('now')),
  id TEXT,
  note TEXT,
  created_by TEXT,
  PRIMARY KEY (from_slug, to_slug)
);

CREATE INDEX IF NOT EXISTS idx_deps_from ON project_dependencies(from_slug);
CREATE INDEX IF NOT EXISTS idx_deps_to ON project_dependencies(to_slug);

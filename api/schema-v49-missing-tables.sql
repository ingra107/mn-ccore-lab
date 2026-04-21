-- v49 (part 1 of 2): missing tables + indexes on prod that were never
-- committed to schema files. Apply to prod — fully idempotent via
-- CREATE [TABLE|INDEX] IF NOT EXISTS.
--
-- Audit 2026-04-21 (after wiring up D1 Schema Drift Check CI) found 13
-- tables + 2 unique indexes that exist on prod but aren't in any
-- committed api/schema*.sql file. They got created over the past year+
-- via `wrangler d1 execute --command` or /api/admin/migrate without
-- committing the underlying SQL. All are backing real features that
-- ship to users every day (inbox, nih_grants, narrative_projects,
-- file_attachments, watchlist, etc.).
--
-- Companion file: schema-v49-missing-columns.sql — bootstrap-only ALTERs
-- for 6 columns added to existing tables on prod. That file is included
-- in the schema-drift CI bundle but NOT applied to prod (ALTER TABLE
-- ADD COLUMN isn't idempotent in SQLite; prod already has those columns).
--
-- Run against prod via:
--   wrangler d1 execute mnccore-lab --remote --file api/schema-v49-missing-tables.sql

-- ── research_narratives must exist before narrative_projects (FK) ──
CREATE TABLE IF NOT EXISTS research_narratives (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  theme_color TEXT DEFAULT '#2d8a8a',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS narrative_projects (
  narrative_id TEXT NOT NULL REFERENCES research_narratives(id) ON DELETE CASCADE,
  project_slug TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  role_in_narrative TEXT NOT NULL DEFAULT 'supporting',
  PRIMARY KEY (narrative_id, project_slug)
);

-- ── features backed by these tables: mentor dashboards, lab metrics ──
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  member_slug TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  project_slug TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  weight REAL DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS trainee_milestones (
  id TEXT PRIMARY KEY,
  member_slug TEXT NOT NULL,
  milestone_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_date TEXT,
  completed_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── file attachments (R2 upload integration) ──
CREATE TABLE IF NOT EXISTS file_attachments (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  r2_key TEXT NOT NULL,
  uploaded_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── inbox (iOS Shortcut quick-capture destination) ──
CREATE TABLE IF NOT EXISTS inbox (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  tag TEXT,
  project_id TEXT,
  author TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  synced_at TEXT
);

-- ── NIH RePORTER sync (Phase 3 grants feature) ──
CREATE TABLE IF NOT EXISTS nih_grants (
  project_number TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  pi_name TEXT,
  organization TEXT,
  total_cost REAL,
  fiscal_year INTEGER,
  study_section TEXT,
  abstract TEXT,
  start_date TEXT,
  end_date TEXT,
  is_lab_grant INTEGER NOT NULL DEFAULT 0,
  last_synced TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pubmed_sync_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))),
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  authors_checked INTEGER DEFAULT 0,
  new_papers INTEGER DEFAULT 0,
  error TEXT
);

-- ── open science resources (Home page public section) ──
CREATE TABLE IF NOT EXISTS open_science_resources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('repo', 'dataset', 'citation', 'tool', 'reproducibility')),
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  metadata TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── project documents (linked resources on Project Detail) ──
CREATE TABLE IF NOT EXISTS project_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  doc_type TEXT DEFAULT 'link',
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- ── project ↔ publication junction (Phase 25 paper-link-to-project) ──
CREATE TABLE IF NOT EXISTS project_publications (
  project_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, publication_id)
);

-- ── watchlist (subscribe to activity on projects/items) ──
CREATE TABLE IF NOT EXISTS watchlist (
  id TEXT PRIMARY KEY,
  member_slug TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'action_item')),
  entity_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── system meta table (migration version tracking) ──
CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── 2 unique indexes that exist on prod ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_date_title ON meetings(date, title);
CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_unique   ON watchlist(member_slug, entity_type, entity_id);

-- ── indexes on the tables just created above ──
-- v48 shipped these earlier, but v48 runs BEFORE v49 in version order, so
-- against a fresh-DB bootstrap (CI workflow) the CREATE INDEX silently
-- failed because the target tables didn't exist yet. Duplicating them
-- here (after table creation) fixes that. Idempotent — CREATE IF NOT
-- EXISTS, so re-applying against prod is a no-op.
CREATE INDEX IF NOT EXISTS idx_attachments_entity            ON file_attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_contributions_member          ON contributions(member_slug, created_at);
CREATE INDEX IF NOT EXISTS idx_contributions_type            ON contributions(type);
CREATE INDEX IF NOT EXISTS idx_inbox_created                 ON inbox(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_synced                  ON inbox(synced_at);
CREATE INDEX IF NOT EXISTS idx_narrative_projects_narrative  ON narrative_projects(narrative_id, position);
CREATE INDEX IF NOT EXISTS idx_narrative_projects_slug       ON narrative_projects(project_slug);
CREATE INDEX IF NOT EXISTS idx_nih_grants_lab                ON nih_grants(is_lab_grant);
CREATE INDEX IF NOT EXISTS idx_nih_grants_section            ON nih_grants(study_section);
CREATE INDEX IF NOT EXISTS idx_nih_grants_year               ON nih_grants(fiscal_year DESC);
CREATE INDEX IF NOT EXISTS idx_osr_position                  ON open_science_resources(position);
CREATE INDEX IF NOT EXISTS idx_osr_type                      ON open_science_resources(type, position);
CREATE INDEX IF NOT EXISTS idx_pp_project                    ON project_publications(project_id);
CREATE INDEX IF NOT EXISTS idx_pp_publication                ON project_publications(publication_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_project     ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_pubmed_sync_log_date          ON pubmed_sync_log(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_trainee_milestones_slug       ON trainee_milestones(member_slug);
CREATE INDEX IF NOT EXISTS idx_trainee_milestones_type       ON trainee_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_watchlist_entity              ON watchlist(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_member              ON watchlist(member_slug);

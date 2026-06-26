-- MN-CCORE Lab Hub — D1 BOOTSTRAP Schema
--
-- THIS FILE IS NOT THE CURRENT PRODUCTION SCHEMA.
-- It is the seed schema applied once when D1 was bootstrapped.
-- Current production state = this file + 60 migrations (api/schema-v*.sql).
-- For current schema, run: wrangler d1 export mnccore-lab --remote  -- wrangler-d1-allowed
--
-- Run with: wrangler d1 execute mnccore-lab --file=api/bootstrap-schema.sql  -- wrangler-d1-allowed

-- Publications
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT NOT NULL, -- JSON array of author strings
  journal TEXT,
  year INTEGER,
  status TEXT DEFAULT 'Published', -- Published, In Review, In Preparation
  doi TEXT,
  pubmed TEXT,
  abstract TEXT,
  topics TEXT, -- JSON array
  featured INTEGER DEFAULT 0,
  author_slugs TEXT, -- JSON array of team member slugs
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'Active', -- Active, In Review, Published, In Preparation
  description TEXT,
  category TEXT, -- clif, lab, nate
  pi TEXT,
  slug TEXT,
  stage TEXT DEFAULT 'Idea', -- Idea, Data Collection, Analysis, Writing, Review, Published
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Team Members
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  credentials TEXT,
  slug TEXT UNIQUE,
  photo_url TEXT,
  bio TEXT,
  scholar_id TEXT,
  author_name TEXT, -- PubMed-style name for matching
  title TEXT,
  department TEXT,
  member_type TEXT, -- director, senior_mentor, faculty, research_team
  email TEXT,       -- v43: real column (backfilled slug@umn.edu); still nullable
  created_at TEXT DEFAULT (datetime('now'))
);

-- Grants
CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY,
  mechanism TEXT, -- R01, R03, K23, etc.
  title TEXT NOT NULL,
  agency TEXT,
  pi TEXT,
  start_date TEXT,
  end_date TEXT,
  proposed INTEGER DEFAULT 0,
  total_funding REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Milestones (for project tracking dashboard)
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  title TEXT NOT NULL,
  target_date TEXT,
  completed_date TEXT,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, overdue
  created_at TEXT DEFAULT (datetime('now'))
);

-- Activity Log (for dashboard feed)
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- publication, project_update, team_join, grant_milestone, meeting
  description TEXT NOT NULL,
  related_id TEXT,
  related_type TEXT,
  actor TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

-- Links (v88: link-normalization Phase 2 -- typed links as first-class Hub-synced table)
CREATE TABLE IF NOT EXISTS links (
    id            TEXT PRIMARY KEY,
    owner_table   TEXT NOT NULL CHECK (owner_table IN ('tasks','projects')),
    owner_id      TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'key',
    type          TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    short_title   TEXT NOT NULL,
    source_raw    TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    deleted_at    TEXT,
    seq           INTEGER DEFAULT 0,
    last_mutation_id TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_links_owner_role_url
    ON links(owner_table, owner_id, role, canonical_url)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_links_owner ON links(owner_table, owner_id);
CREATE INDEX IF NOT EXISTS idx_links_type ON links(type);
CREATE INDEX IF NOT EXISTS idx_links_seq ON links(seq);

DROP TRIGGER IF EXISTS trg_links_seq_insert;
CREATE TRIGGER trg_links_seq_insert AFTER INSERT ON links
FOR EACH ROW
WHEN NEW.seq = 0
BEGIN
  UPDATE links
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM links WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_links_seq_update;
CREATE TRIGGER trg_links_seq_update AFTER UPDATE ON links
FOR EACH ROW
WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE links
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM links)
  WHERE id = NEW.id;
END;

-- launch_log (v89: @-tag delegation launch log -- recovery surface + mobile queue)
-- Hub-D1-ONLY. NOT registered in PB synced_table_registry; no brain.db mirror.
-- The seed lives ONLY here; it is never written to activity_entries.
CREATE TABLE IF NOT EXISTS launch_log (
    id              TEXT PRIMARY KEY,
    tag             TEXT NOT NULL CHECK (tag IN ('quickchat','workon')),
    seed            TEXT NOT NULL DEFAULT '',
    origin          TEXT NOT NULL CHECK (origin IN ('computer','mobile')),
    target_machine  TEXT,
    project_slug    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','launched','failed','completed','expired')),
    requested_by    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    launched_at     TEXT,
    seq             INTEGER DEFAULT 0,
    last_mutation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_launch_log_status ON launch_log(status);
CREATE INDEX IF NOT EXISTS idx_launch_log_origin_status ON launch_log(origin, status);
CREATE INDEX IF NOT EXISTS idx_launch_log_requested_by ON launch_log(requested_by, created_at);

DROP TRIGGER IF EXISTS trg_launch_log_seq_insert;
CREATE TRIGGER trg_launch_log_seq_insert AFTER INSERT ON launch_log
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE launch_log SET seq = (SELECT COALESCE(MAX(seq),0)+1 FROM launch_log WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_launch_log_seq_update;
CREATE TRIGGER trg_launch_log_seq_update AFTER UPDATE ON launch_log
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE launch_log SET seq = (SELECT COALESCE(MAX(seq),0)+1 FROM launch_log) WHERE id = NEW.id;
END;

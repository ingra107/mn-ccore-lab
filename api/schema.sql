-- MN-CCORE Lab Hub — D1 Schema
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema.sql

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

-- Comments (for project discussions)
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  author_id TEXT REFERENCES team_members(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

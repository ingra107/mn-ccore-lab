-- MN-CCORE Lab Hub — Schema V2: Team Portal Tables
-- Run with: npx wrangler d1 execute mnccore-lab --remote --file=api/schema-v2.sql

-- Meetings (replaces static meetings.ts — the meeting lifecycle)
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'biweekly',
  attendees TEXT,
  agenda TEXT,
  notes TEXT,
  decisions TEXT,
  status TEXT DEFAULT 'upcoming',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Action Items (extracted from meetings, assignable, trackable)
CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT REFERENCES meetings(id),
  project_id TEXT,
  description TEXT NOT NULL,
  assignee TEXT NOT NULL,
  due_date TEXT,
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  completed_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Agenda Items (team members can add before meetings)
CREATE TABLE IF NOT EXISTS agenda_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT REFERENCES meetings(id),
  content TEXT NOT NULL,
  added_by TEXT NOT NULL,
  project_id TEXT,
  type TEXT DEFAULT 'discussion',
  document_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Project Updates (async status posts between meetings)
CREATE TABLE IF NOT EXISTS project_updates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  update_type TEXT DEFAULT 'progress',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_action_items_assignee ON action_items(assignee);
CREATE INDEX IF NOT EXISTS idx_action_items_meeting ON action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_action_items_completed ON action_items(completed);
CREATE INDEX IF NOT EXISTS idx_agenda_items_meeting ON agenda_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_project_updates_project ON project_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_project_updates_created ON project_updates(created_at);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);

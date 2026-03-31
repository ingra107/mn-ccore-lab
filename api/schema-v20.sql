-- v20: PB Sector v2 — Daily Planner tables
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v20.sql --remote

-- Daily plan: stores the day's task selections and slot assignments
CREATE TABLE IF NOT EXISTS daily_plans (
  id TEXT PRIMARY KEY,
  plan_date TEXT NOT NULL,
  star_task_id TEXT,
  focus_task_ids TEXT,
  quick_win_ids TEXT,
  intention TEXT,
  gratitude TEXT,
  status TEXT DEFAULT 'planning',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(plan_date);

-- Pomodoro sessions
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  plan_date TEXT NOT NULL,
  slot_type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_minutes INTEGER DEFAULT 25,
  completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pomo_task ON pomodoro_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_pomo_date ON pomodoro_sessions(plan_date);

-- Daily reflections
CREATE TABLE IF NOT EXISTS daily_reflections (
  id TEXT PRIMARY KEY,
  plan_date TEXT NOT NULL UNIQUE,
  highlight TEXT,
  learned TEXT,
  energy_rating INTEGER,
  focus_rating INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reflections_date ON daily_reflections(plan_date);

-- Dispatch queue: actionable comments for Claude to process
CREATE TABLE IF NOT EXISTS dispatch_queue (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  task_title TEXT,
  project_slug TEXT,
  comment TEXT NOT NULL,
  comment_type TEXT DEFAULT 'action',
  status TEXT DEFAULT 'pending',
  dispatched_at TEXT,
  completed_at TEXT,
  response TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dispatch_status ON dispatch_queue(status);

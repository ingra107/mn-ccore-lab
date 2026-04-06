-- Conference submission tracking: abstract lifecycle from planning to presented
CREATE TABLE IF NOT EXISTS conference_submissions (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  conference TEXT NOT NULL,
  conference_date TEXT,
  submission_type TEXT NOT NULL,
  title TEXT NOT NULL,
  authors TEXT,
  abstract_due TEXT,
  abstract_submitted_at TEXT,
  accepted_at TEXT,
  presentation_type TEXT,
  materials_status TEXT DEFAULT 'not_started',
  travel_booked INTEGER DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'planning',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conf_sub_project ON conference_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_conf_sub_conference ON conference_submissions(conference);
CREATE INDEX IF NOT EXISTS idx_conf_sub_status ON conference_submissions(status);

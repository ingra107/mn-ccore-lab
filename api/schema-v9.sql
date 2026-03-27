-- schema-v9.sql — Lab Settings + Workflow Templates
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v9.sql --remote

CREATE TABLE IF NOT EXISTS lab_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Default settings
INSERT OR IGNORE INTO lab_settings (key, value) VALUES
  ('lab_name', 'MN-CCORE Lab'),
  ('lab_description', 'Minnesota Critical Care Outcomes & Research Effort'),
  ('lab_type', 'clinical_research'),
  ('lab_icon', '🧬'),
  ('cover_image_url', ''),
  ('workflow_stages', '["Idea","Data Collection","Analysis","Writing","Review","Published"]');

CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stages TEXT NOT NULL,  -- JSON array of stage names
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO workflow_templates (id, name, stages, is_default) VALUES
  ('default', 'Research Project', '["Idea","Data Collection","Analysis","Writing","Review","Published"]', 1),
  ('manuscript', 'Manuscript', '["Drafting","Internal Review","Submitted","In Review","Revision","Accepted","Published"]', 0),
  ('grant', 'Grant Application', '["Concept","Specific Aims","Research Strategy","Budget","Internal Review","Submitted","Under Review","Funded"]', 0);

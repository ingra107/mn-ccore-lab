-- v27: Regulatory & Compliance Tracking — IRB, DUA, DTA, COI, training
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v27.sql --remote
-- Or: POST /api/admin/migrate with {"version": 27}

CREATE TABLE IF NOT EXISTS regulatory_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  title TEXT NOT NULL,
  protocol_number TEXT,
  approved_date TEXT,
  expiration_date TEXT,
  renewal_due TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_regulatory_project ON regulatory_items(project_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_expiration ON regulatory_items(expiration_date);
CREATE INDEX IF NOT EXISTS idx_regulatory_status ON regulatory_items(status);

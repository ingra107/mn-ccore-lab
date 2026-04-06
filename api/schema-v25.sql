-- Schema v25: Deadline dependencies for cascade view
CREATE TABLE IF NOT EXISTS deadline_dependencies (
  id TEXT PRIMARY KEY,
  upstream_id TEXT NOT NULL,
  upstream_type TEXT NOT NULL,
  downstream_id TEXT NOT NULL,
  downstream_type TEXT NOT NULL,
  lag_days INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deadline_deps_upstream ON deadline_dependencies(upstream_id);
CREATE INDEX IF NOT EXISTS idx_deadline_deps_downstream ON deadline_dependencies(downstream_id);

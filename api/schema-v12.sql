-- v12: Paper-to-Project linking — living literature reviews
CREATE TABLE IF NOT EXISTS paper_project_links (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  linked_by TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(paper_id, project_slug)
);
CREATE INDEX IF NOT EXISTS idx_paper_project_paper ON paper_project_links(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_project_project ON paper_project_links(project_slug);

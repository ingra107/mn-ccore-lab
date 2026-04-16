-- v40: Digest comments (R13 Model B)
-- Inline comments on research digest papers.
CREATE TABLE IF NOT EXISTS digest_comments (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  author_slug TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (paper_id) REFERENCES research_digest(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_digest_comments_paper ON digest_comments(paper_id);

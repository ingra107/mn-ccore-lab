-- Research Digest table — stores daily PubMed papers relevant to MNCCORE research
CREATE TABLE IF NOT EXISTS research_digest (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT,
  journal TEXT,
  pub_date TEXT,
  abstract TEXT,
  pmid TEXT,
  doi TEXT,
  relevance_score REAL DEFAULT 0,
  relevance_reason TEXT,
  topics TEXT, -- JSON array of topic tags
  status TEXT DEFAULT 'new', -- new, saved, dismissed
  saved_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  digest_date TEXT -- the date this appeared in the digest
);

CREATE INDEX IF NOT EXISTS idx_digest_date ON research_digest(digest_date DESC);
CREATE INDEX IF NOT EXISTS idx_digest_status ON research_digest(status);
CREATE INDEX IF NOT EXISTS idx_digest_relevance ON research_digest(relevance_score DESC);

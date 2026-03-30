-- v16: Ask the Lab — cross-project Q&A channel
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v16.sql --remote

CREATE TABLE IF NOT EXISTS lab_questions (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  context TEXT,
  asked_by TEXT NOT NULL,
  project_slug TEXT,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lab_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  content TEXT NOT NULL,
  author_slug TEXT NOT NULL,
  is_accepted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (question_id) REFERENCES lab_questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_questions_status ON lab_questions(status);
CREATE INDEX IF NOT EXISTS idx_answers_question ON lab_answers(question_id);

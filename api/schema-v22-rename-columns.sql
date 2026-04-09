-- v22: Rename lab_questions and lab_answers columns to match code conventions
-- Run with: npx wrangler d1 execute mnccore-lab --file=api/schema-v22-rename-columns.sql --remote
--
-- lab_questions: title->question, body->context, author_slug->asked_by
-- lab_answers: body->content, accepted->is_accepted
--
-- SQLite doesn't support RENAME COLUMN, so we recreate tables with correct names.

-- Step 1: Recreate lab_questions with correct column names
CREATE TABLE lab_questions_new (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  context TEXT,
  asked_by TEXT NOT NULL,
  project_slug TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO lab_questions_new (id, question, context, asked_by, project_slug, status, created_at, updated_at)
SELECT id, title, body, author_slug, project_slug, status, created_at, updated_at FROM lab_questions;

DROP TABLE lab_questions;
ALTER TABLE lab_questions_new RENAME TO lab_questions;
CREATE INDEX IF NOT EXISTS idx_questions_status ON lab_questions(status);

-- Step 2: Recreate lab_answers with correct column names
CREATE TABLE lab_answers_new (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  content TEXT NOT NULL,
  author_slug TEXT NOT NULL,
  is_accepted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (question_id) REFERENCES lab_questions(id) ON DELETE CASCADE
);

INSERT INTO lab_answers_new (id, question_id, content, author_slug, is_accepted, created_at)
SELECT id, question_id, body, author_slug, accepted, created_at FROM lab_answers;

DROP TABLE lab_answers;
ALTER TABLE lab_answers_new RENAME TO lab_answers;
CREATE INDEX IF NOT EXISTS idx_answers_question ON lab_answers(question_id);

-- v147: drop the retired Ask the Lab tables, lab_questions and lab_answers.
--
-- Ask the Lab (/portal/ask, api/routes/questions.ts) is retired: its @hermes went
-- 2026-10-21 (#8238), its menus 2026-10-23 (40a50450), and its page and six routes
-- 2026-10-23 (d3749ac7). The Worker that ships with this migration no longer reads or
-- writes either table, and table-scope / project-slug / viewer-sweep no longer name them.
-- No view, trigger or FK elsewhere points at them (sqlite_master checked 2026-10-23).
--
-- Decision: PB Context/Decisions/2026-10-23-ask-the-lab-retirement.md (Nick, 2026-10-23:
-- "Now, skip the 24h wait").
--
-- Export: on 2026-10-23 prod held ONE question and ZERO answers. The row, verbatim:
--   id=ae5e745ee89d98358dccebdba8d16771  question="@hermes what is CLIF"  context=NULL
--   asked_by=anonymous  project_slug=NULL  status=open
--   created_at=2026-04-10 02:46:10  updated_at=2026-04-10 02:46:10
--
-- APPLY (after the Worker without the routes is deployed):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v147-drop-lab-questions.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v147-drop-lab-questions.sql
-- ROLLBACK (then re-INSERT the row above):
--   CREATE TABLE IF NOT EXISTS lab_questions (
--     id TEXT PRIMARY KEY, question TEXT NOT NULL, context TEXT, asked_by TEXT NOT NULL,
--     project_slug TEXT, status TEXT NOT NULL DEFAULT 'open',
--     created_at TEXT NOT NULL DEFAULT (datetime('now')),
--     updated_at TEXT NOT NULL DEFAULT (datetime('now')));
--   CREATE INDEX IF NOT EXISTS idx_questions_status ON lab_questions(status);
--   CREATE TABLE IF NOT EXISTS lab_answers (
--     id TEXT PRIMARY KEY, question_id TEXT NOT NULL, content TEXT NOT NULL,
--     author_slug TEXT NOT NULL, is_accepted INTEGER NOT NULL DEFAULT 0,
--     created_at TEXT NOT NULL DEFAULT (datetime('now')),
--     FOREIGN KEY (question_id) REFERENCES lab_questions(id) ON DELETE CASCADE);
--   CREATE INDEX IF NOT EXISTS idx_answers_question ON lab_answers(question_id);
--   DELETE FROM schema_migrations WHERE version = 147;

DROP INDEX IF EXISTS idx_answers_question;
DROP TABLE IF EXISTS lab_answers;
DROP INDEX IF EXISTS idx_questions_status;
DROP TABLE IF EXISTS lab_questions;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (147, 'schema-v147-drop-lab-questions.sql');

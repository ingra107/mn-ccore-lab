-- v137: drop the lab-wide Research Digest status (contract step of v136).
--
-- Reading state lives in digest_paper_state (schema-v136), one row per person.
-- research_digest.status / saved_by and their index have no reader or writer
-- once the v136 code is deployed (api/routes/digest.ts names neither).
--
-- APPLY ONLY AFTER the v136 Worker + Pages deploy is live and a save on two
-- accounts reads back per person. The pre-v136 Worker runs
-- `UPDATE research_digest SET status`, which fails once the column is gone.
-- Back up first: python scripts/d1_table_backup.py research_digest
--
-- APPLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v137-drop-digest-lab-status.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v137-drop-digest-lab-status.sql
-- ROLLBACK:
--   ALTER TABLE research_digest ADD COLUMN status TEXT DEFAULT 'new';
--   ALTER TABLE research_digest ADD COLUMN saved_by TEXT;
--   UPDATE research_digest SET status = COALESCE((SELECT s.status FROM digest_paper_state s
--     WHERE s.paper_id = research_digest.id AND s.member_slug = 'nick-ingraham'), 'new');
--   UPDATE research_digest SET saved_by = 'ingra107@umn.edu' WHERE status = 'saved';
--   CREATE INDEX IF NOT EXISTS idx_digest_status ON research_digest(status);
--   DELETE FROM schema_migrations WHERE version = 137;

DROP INDEX IF EXISTS idx_digest_status;
ALTER TABLE research_digest DROP COLUMN status;
ALTER TABLE research_digest DROP COLUMN saved_by;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (137, 'schema-v137-drop-digest-lab-status.sql');

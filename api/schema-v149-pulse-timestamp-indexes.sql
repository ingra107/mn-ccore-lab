-- v149: indexes for the Lab pulse counts (#156 review, Nick 2026-10-26: "fix those things").
--
-- GET /api/pulse counts who was active in the last day (entity_seen.last_seen_at,
-- activity_entries.created_at), tasks and milestones done this week
-- (tasks.completed_at) and papers added in 30 days (publications.created_at).
-- None of those columns had an index, so every count scanned its table, and every
-- member's open tab ran them. api/lib/pulse-aggregates.ts compares the bare
-- columns (PULSE_SQL), and pulse-aggregates.test.ts asserts each plan SEARCHes.
--
-- APPLY (before or with the Worker that relies on them; harmless either way):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v149-pulse-timestamp-indexes.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v149-pulse-timestamp-indexes.sql
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_entity_seen_last_seen; DROP INDEX IF EXISTS idx_activity_entries_created;
--   DROP INDEX IF EXISTS idx_tasks_completed_at; DROP INDEX IF EXISTS idx_publications_created;

CREATE INDEX IF NOT EXISTS idx_entity_seen_last_seen ON entity_seen(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_activity_entries_created ON activity_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_publications_created ON publications(created_at);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (149, 'schema-v149-pulse-timestamp-indexes.sql');

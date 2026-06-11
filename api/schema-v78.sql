-- schema-v78 (2026-06-10)
-- Physical removal of the 4 frozen legacy activity tables.
--
-- These tables were frozen on 2026-06-10 (P2-A) after all write paths were
-- retargeted to activity_entries (Design C, schema-v77). The read endpoints
-- (/api/task-comments, /api/task-updates, /api/project-updates, /api/comments)
-- are projections over activity_entries and are unaffected by this migration.
-- Snapshots archived in Scratch/t3-drop-snapshots-2026-06-10/ before this drop.
--
-- The DROP TABLE IF EXISTS form is safe: if the table has already been removed
-- (e.g. on a fresh bootstrap from scratch), the statement is a no-op.
--
-- Orchestrator runs this via scripts/wrangler-d1 (test D1 first, then prod).

DROP TABLE IF EXISTS task_comments;
DROP TABLE IF EXISTS task_updates;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS project_updates;

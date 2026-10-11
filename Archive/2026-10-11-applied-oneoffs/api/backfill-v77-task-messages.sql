-- backfill-v77-task-messages.sql (2026-06-10)
-- STATUS: COMPLETED 2026-06-10 (3 task_updates rows migrated to activity_entries;
-- task_comments had 0 rows). DO NOT RE-RUN — source tables dropped in schema-v78.
-- Migrate the live task_comments + task_updates rows into the unified
-- activity_entries store (Design C, schema-v77). The ORCHESTRATOR ran this.
--
-- Scope (ground truth, live prod D1 2026-06-10): task_updates = 3 rows (all
-- nick-ingraham, update_type 'progress'); task_comments = 0 rows. Legacy
-- activity_log (22,220) backfill is Phase 2, NOT here.
--
-- IDEMPOTENT: INSERT OR IGNORE against the partial UNIQUE index
-- idx_ae_source(source_table, source_id) so a re-run never duplicates a row.
-- Rollback: DELETE FROM activity_entries WHERE source_table IS NOT NULL.
--
-- Field mapping:
--   id          → fresh 'bk_<source>_<orig id>' deterministic id (stable across
--                 re-runs so the OR IGNORE works even though the UNIQUE index is
--                 on (source_table, source_id), not id).
--   entity_type = 'task'
--   entity_id   = original task_id
--   project_id  = derived from tasks.project_id (the stored typed proj_* PK)
--   kind        = 'comment' (task_comments) / 'update' (task_updates)
--   visibility  = 'team' (legacy rows had no @me concept)
--   actor_slug  = original author_slug
--   body        = original content
--   update_type = original update_type (task_updates only; NULL for comments)
--   source_table/source_id = original table + row id (idempotency key)
--   created_at  = original created_at (PRESERVED, not now)
--
-- APPLY — sanctioned wrapper ONLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/backfill-v77-task-messages.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/backfill-v77-task-messages.sql

-- task_updates → activity_entries (kind='update')
INSERT OR IGNORE INTO activity_entries
  (id, entity_type, entity_id, project_id, kind, visibility, actor_slug, body, mentions_json, update_type, metadata_json, source_table, source_id, created_at)
SELECT
  'bk_task_updates_' || tu.id,
  'task',
  tu.task_id,
  (SELECT t.project_id FROM tasks t WHERE t.id = tu.task_id),
  'update',
  'team',
  tu.author_slug,
  tu.content,
  NULL,
  COALESCE(tu.update_type, 'progress'),
  NULL,
  'task_updates',
  tu.id,
  tu.created_at
FROM task_updates tu;

-- task_comments → activity_entries (kind='comment'); 0 rows today but kept
-- idempotent + complete so a future comment created on the legacy table before
-- physical cutover still migrates cleanly on a re-run.
INSERT OR IGNORE INTO activity_entries
  (id, entity_type, entity_id, project_id, kind, visibility, actor_slug, body, mentions_json, update_type, metadata_json, source_table, source_id, created_at)
SELECT
  'bk_task_comments_' || tc.id,
  'task',
  tc.task_id,
  (SELECT t.project_id FROM tasks t WHERE t.id = tc.task_id),
  'comment',
  'team',
  tc.author_slug,
  tc.content,
  NULL,
  NULL,
  NULL,
  'task_comments',
  tc.id,
  tc.created_at
FROM task_comments tc;

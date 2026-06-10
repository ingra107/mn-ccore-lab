-- schema-v77-activity-entries.sql (2026-06-10)
-- Unified timeline store — Design C per the codex referee ruling + Nick's approved
-- brainstorm (docs/superpowers/specs/2026-06-10-activity-entries-unified-timeline-design.md).
--
-- ONE entity-generic store for human + system activity across tasks/projects.
-- Replaces the task_comments / task_updates split (the "every message feature
-- built twice" class); legacy activity_log (22,220 rows) stays alive as a
-- compat READ only — never extended, backfilled in Phase 2.
--
-- Columns:
--   id             TEXT PK   'ae_<random>' minted by postActivityEntry().
--   entity_type    TEXT      'task' | 'project' (extensible).
--   entity_id      TEXT      task/project id.
--   project_id     TEXT      derived at write for task rows (whole-picture project
--                            feed = entity rows UNION task rows by project_id);
--                            = entity_id for project rows.
--   kind           TEXT      'comment' | 'update' | 'completion' | 'system'
--                            (shared/activityKinds.ts is the one enum source).
--   visibility     TEXT      'team' | 'author'. '@me ' body prefix or composer
--                            toggle sets 'author'; reads are SQL-gated
--                            (visibility='team' OR actor_slug=current).
--   actor_slug     TEXT      canonical team slug ('claude-ai' for Hermes).
--   body           TEXT      message text (@me prefix already stripped).
--   mentions_json  TEXT      JSON array of mentioned slugs, nullable.
--   update_type    TEXT      sub-kind when kind='update': progress|blocker|result|
--                            question|session. Nullable otherwise.
--   metadata_json  TEXT      kind-specific extras, nullable.
--   source_table   TEXT      backfill idempotency (original table), nullable.
--   source_id      TEXT      backfill idempotency (original row id), nullable.
--   created_at     TEXT      UTC 'YYYY-MM-DD HH:MM:SS' (store UTC, render local).
--
-- Purely additive (CREATE TABLE IF NOT EXISTS + indexes). Reversible: DROP TABLE
-- activity_entries (no FK references it). Backfill rollback: DELETE WHERE
-- source_table IS NOT NULL. D1 Time-Travel (30d) is the data backstop.
--
-- APPLY (test FIRST, probe, then prod) — sanctioned wrapper ONLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v77-activity-entries.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v77-activity-entries.sql

CREATE TABLE IF NOT EXISTS activity_entries (
  id             TEXT PRIMARY KEY,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  project_id     TEXT,
  kind           TEXT NOT NULL,
  visibility     TEXT NOT NULL DEFAULT 'team',
  actor_slug     TEXT NOT NULL,
  body           TEXT NOT NULL,
  mentions_json  TEXT,
  update_type    TEXT,
  metadata_json  TEXT,
  source_table   TEXT,
  source_id      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ae_entity
  ON activity_entries (entity_type, entity_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ae_project
  ON activity_entries (project_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ae_recent
  ON activity_entries (created_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ae_source
  ON activity_entries (source_table, source_id)
  WHERE source_table IS NOT NULL;

-- #113 — backfill the missing `created` lifecycle rows on meeting-linked tasks.
--
-- Why this exists: the Hub mints a "Created this task · from a meeting" row at
-- the applyInsert chokepoint (api/lib/lifecycle-activity.ts), which shipped
-- 2026-07-09. Every meeting-linked task created since then has a real one —
-- measured on prod 2026-08-18: 29/29 in August. The gap is entirely historical,
-- 37 tasks created 2026-06-26 through 2026-07-08. PB's writer was never the
-- problem, so nothing in Peripheral-Brain changes.
--
-- Shape is copied from a live row rather than invented:
--   kind='system', visibility='team', actor_slug='nick-ingraham',
--   source_table='lifecycle', metadata_json={"event":"created","lifecycle":true}
-- Two deliberate differences, both so a reconstruction never passes as a
-- natively-emitted row:
--   * metadata carries "backfill":"#113"
--   * source_id is 'backfill-113:<task_id>:created' instead of a mutation id
--
-- project_id is the task's CURRENT project. Creation-time project is not
-- recoverable, and this column is what puts the row in the project feed —
-- which is the whole reason the client-side synthetic row existed.
--
-- created_at is the TASK's created_at so the entry sorts where it belongs.
--
-- Idempotent: idx_ae_source is UNIQUE(source_table, source_id) WHERE
-- source_table IS NOT NULL, so INSERT OR IGNORE makes a re-run a no-op.
--
-- Rollback, one statement:
--   DELETE FROM activity_entries
--    WHERE source_table = 'lifecycle' AND source_id LIKE 'backfill-113:%';

INSERT OR IGNORE INTO activity_entries (
  id, entity_type, entity_id, project_id, kind, visibility, actor_slug, body,
  mentions_json, update_type, metadata_json, source_table, source_id, created_at
)
SELECT
  lower(hex(randomblob(16))),
  'task',
  t.id,
  t.project_id,
  'system',
  'team',
  'nick-ingraham',
  'Created this task · from a meeting',
  NULL,
  NULL,
  '{"event":"created","lifecycle":true,"backfill":"#113"}',
  'lifecycle',
  'backfill-113:' || t.id || ':created',
  t.created_at
FROM tasks t
LEFT JOIN activity_entries a
  ON a.entity_type = 'task'
 AND a.entity_id = t.id
 AND a.kind = 'system'
 AND a.body LIKE 'Created this task%'
WHERE t.meeting_id IS NOT NULL
  AND t.deleted_at IS NULL
  AND a.id IS NULL;

-- schema-v100-activity-entries-threads.sql (2026-07-22)
--
-- Bug #98: reply to a specific comment; the reply collapses under that comment
-- with a "N replies" signal, and a reply that starts with @hermes continues the
-- conversation WITH the thread as context.
--
-- ONE nullable self-referencing column. `parent_id IS NULL` means root,
-- `parent_id = <root id>` means reply. Deliberately NOT `thread_root_id +
-- depth`: that stores two facts derivable from one and admits corrupt states
-- (depth=0 with a non-null root, depth=1 pointing at another child). Nesting is
-- capped at ONE level in the API -- a reply whose parent already has a parent is
-- rejected -- so the pair buys nothing.
--
-- NO FOREIGN KEY, deliberately. activity_entries carries no FK constraints
-- (schema-v77 header: "no FK references it"), and every existing cascade is
-- entity-scoped -- deleting a task runs
-- `DELETE FROM activity_entries WHERE entity_type='task' AND entity_id=?`,
-- which already removes a thread's replies because children inherit the
-- parent's entity identity. The ONE gap an FK would have covered is the
-- single-root hard delete at api/routes/activity.ts:56 (handleDeleteActivityEntry);
-- that is handled explicitly in code so the cascade is greppable rather than
-- an invisible engine behaviour.
--
-- NO stored reply_count. The count is VIEWER-SPECIFIC: an @me reply on a team
-- root counts only for its author (and the PI), and replies under an @me root
-- count only for the root's author. A single denormalized counter would either
-- leak the existence of private replies to everyone or be wrong for nearly
-- every viewer. Counts are computed per-request against idx_ae_parent.
--
-- Rollback: DROP the three indexes. The column is additive + nullable, so
-- pre-v100 code ignores it and every existing row is already a valid root.
--
-- Apply:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v100-activity-entries-threads.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v100-activity-entries-threads.sql

ALTER TABLE activity_entries ADD COLUMN parent_id TEXT;

-- Chronological reply loading for one root + the per-root count probe.
CREATE INDEX IF NOT EXISTS idx_ae_parent
  ON activity_entries (parent_id, created_at ASC, id ASC)
  WHERE parent_id IS NOT NULL;

-- The unified feeds now scan ROOTS only. These partial mirrors of the v77
-- indexes keep that scan from walking reply rows it will discard.
CREATE INDEX IF NOT EXISTS idx_ae_entity_roots
  ON activity_entries (entity_type, entity_id, created_at DESC, id DESC)
  WHERE parent_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ae_project_roots
  ON activity_entries (project_id, created_at DESC, id DESC)
  WHERE parent_id IS NULL;

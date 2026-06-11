-- schema-v81-entity-seen.sql (2026-06-11)
-- Per-viewer "seen" tracking for the new-activity signal (Slack-style unread).
--
-- Nick (2026-06-11): "i kind of like knowing when things have new activity...
-- but it should be clear that its new activity and not newly assigned" — two
-- DISTINCT signals:
--   • NEW (gold pill)        = assigned to you, never opened
--                              (tasks.acknowledged_at IS NULL — one-shot).
--   • new activity (teal ●)  = an entity you HAVE seen has team-visible
--                              activity_entries by OTHERS newer than your last
--                              look (this table vs activity_entries).
--
-- entity_seen is generic over entity_type ('task' | 'project'; artifacts can
-- join later) — one row per (entity, viewer). Upserted by POST /api/seen every
-- time a detail surface opens; read by GET /api/seen/unseen.
--
-- HUB-ONLY table — NO Peripheral Brain lockstep (no pb-schema, no enums.py,
-- no shared-schema-registry entry; same class as artifacts v79). No project-FK
-- column (entity_id is polymorphic) → no identity-gate registration.
--
-- Purely additive (CREATE TABLE IF NOT EXISTS + index). Reversible:
--   DROP TABLE entity_seen;
--
-- APPLY (test FIRST, probe, then prod) — sanctioned wrapper ONLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v81-entity-seen.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v81-entity-seen.sql

CREATE TABLE IF NOT EXISTS entity_seen (
  entity_type   TEXT NOT NULL,            -- 'task' | 'project'
  entity_id     TEXT NOT NULL,            -- task id / typed proj_* id
  viewer_slug   TEXT NOT NULL,            -- canonical team slug
  last_seen_at  TEXT NOT NULL,            -- UTC 'YYYY-MM-DD HH:MM:SS'
  PRIMARY KEY (entity_type, entity_id, viewer_slug)
);

-- The unseen query filters by viewer first, then joins activity per entity.
CREATE INDEX IF NOT EXISTS idx_entity_seen_viewer ON entity_seen (viewer_slug);

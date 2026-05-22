-- schema-v67-stage3-deleted-at.sql (2026-05-15)
-- Stage 3 Lane 3 tables — add deleted_at for soft-delete parity.
--
-- Background: schema-v48-stage3-8tables.sql created 8 Lane 3 semantic tables
-- without a deleted_at column. mutations.ts:applyDelete (line 636-638) issues
--   SET deleted_at = datetime('now')
-- universally. Without this column every DELETE mutation for Lane 3 rows fails:
--   D1_ERROR: table X has no column named deleted_at: SQLITE_ERROR
-- This caused 307 dead_letter outbox rows (I42 health invariant).
--
-- sessions already got deleted_at via schema-v65-sessions-deleted-at.sql.
-- This migration adds the same column + sparse index to the remaining 8 tables.
--
-- APPLY (already applied to prod 2026-05-15 — file committed to unblock CI drift
-- check; safe to re-run because ALTER TABLE ADD COLUMN is idempotent on SQLite if
-- wrapped in IF NOT EXISTS via separate guard, otherwise produces benign
-- "duplicate column name" error which the CI tolerates):
--
--   wrangler d1 execute mnccore-lab --local  --file=api/schema-v67-stage3-deleted-at.sql
--   wrangler d1 execute mnccore-lab --remote --file=api/schema-v67-stage3-deleted-at.sql
--
-- Escalation: Context/Mechanic/escalations/2026-05-15_lane3-deleted-at-gap.md

ALTER TABLE agent_knowledge         ADD COLUMN deleted_at TEXT;
ALTER TABLE memory_facts            ADD COLUMN deleted_at TEXT;
ALTER TABLE decisions               ADD COLUMN deleted_at TEXT;
ALTER TABLE kg_entities             ADD COLUMN deleted_at TEXT;
ALTER TABLE kg_relations            ADD COLUMN deleted_at TEXT;
ALTER TABLE kg_relation_type_registry ADD COLUMN deleted_at TEXT;
ALTER TABLE pomodoro_sessions       ADD COLUMN deleted_at TEXT;
ALTER TABLE trajectories            ADD COLUMN deleted_at TEXT;

-- Sparse indexes — only non-NULL tombstone rows are meaningful.
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_deleted_at
    ON agent_knowledge(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memory_facts_deleted_at
    ON memory_facts(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_decisions_deleted_at
    ON decisions(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kg_entities_deleted_at
    ON kg_entities(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kg_relations_deleted_at
    ON kg_relations(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kg_relation_type_registry_deleted_at
    ON kg_relation_type_registry(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_deleted_at
    ON pomodoro_sessions(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trajectories_deleted_at
    ON trajectories(deleted_at) WHERE deleted_at IS NOT NULL;

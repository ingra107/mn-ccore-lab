-- v63 -- A3 last_mutation_id column for Stage 3 Phase 1 tables
--
-- Stage 3 Phase 1 (schema-v48, 2026-05-06) created 8 new tables without
-- the last_mutation_id column required by the A3 mutation protocol.
-- v59 added this column to tasks, projects, and project_state_log.
-- This migration extends the same pattern to all 9 Stage 3 tables:
--   sessions, agent_knowledge, memory_facts, pomodoro_sessions, decisions,
--   kg_entities, kg_relations, kg_relation_type_registry, trajectories
--
-- last_mutation_id is written by mutations.ts:applyInsert/applyPatch on every
-- successful write, enabling PB-side echo suppression (outbox.py acked_at check).
--
-- Without this column, every POST /api/mutations for any Stage 3 table fails
-- with: D1_ERROR: table X has no column named last_mutation_id
--
-- Apply via:
--   wrangler d1 execute mnccore-lab --remote --file=api/schema-v63-stage3-last-mutation-id.sql
--
-- Idempotent: ALTER TABLE ADD COLUMN errors if column already exists (SQLite),
-- so this is wrapped to be safe on re-apply.

ALTER TABLE sessions                ADD COLUMN last_mutation_id TEXT;
ALTER TABLE agent_knowledge         ADD COLUMN last_mutation_id TEXT;
ALTER TABLE memory_facts            ADD COLUMN last_mutation_id TEXT;
ALTER TABLE pomodoro_sessions       ADD COLUMN last_mutation_id TEXT;
ALTER TABLE decisions               ADD COLUMN last_mutation_id TEXT;
ALTER TABLE kg_entities             ADD COLUMN last_mutation_id TEXT;
ALTER TABLE kg_relations            ADD COLUMN last_mutation_id TEXT;
ALTER TABLE kg_relation_type_registry ADD COLUMN last_mutation_id TEXT;
ALTER TABLE trajectories            ADD COLUMN last_mutation_id TEXT;

-- Sparse indexes (same pattern as v59 idx_tasks_last_mutation).
-- Only index non-NULL values — typical usage is "find rows touched by mutation X".
CREATE INDEX IF NOT EXISTS idx_sessions_last_mutation
    ON sessions(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_last_mutation
    ON agent_knowledge(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memory_facts_last_mutation
    ON memory_facts(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_last_mutation
    ON pomodoro_sessions(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_decisions_last_mutation
    ON decisions(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kg_entities_last_mutation
    ON kg_entities(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kg_relations_last_mutation
    ON kg_relations(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kg_relation_type_registry_last_mutation
    ON kg_relation_type_registry(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trajectories_last_mutation
    ON trajectories(last_mutation_id) WHERE last_mutation_id IS NOT NULL;

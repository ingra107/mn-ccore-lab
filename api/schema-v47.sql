-- v47 (2026-04-20 Airtable Funeral Phase 1): add 5 columns to tasks so
-- Hub can accept the richer field set currently sent to Airtable by
-- gmail-airtable.js Apps Script and peripheral-brain-mobile PWA.
--
-- Rationale: Airtable Funeral Phase 1 routes Gmail + Mobile writes to
-- Hub instead of Airtable. Hub's tasks schema pre-v47 was missing 5
-- fields those writers send. Option X (concat into description) would
-- be lossy and accrue debt; Option Y (this migration) ships clean
-- structured storage. Nick approved Option Y 2026-04-20 19:42 overriding
-- the pragmatic-but-lossy Z recommendation.
--
-- Paired: api/routes/tasks.ts handleCreateTask extended to accept these
-- fields (same commit). Paired: brain.db sync_d1_pull needs to read them
-- (future; not required for Phase 1 — brain.db already has equivalents
-- in its own schema for most of these).
--
-- See: Context/Decisions/2026-04-20-airtable-funeral-phase-1-schema.md
-- See: Context/Topics/shared-schema-registry.md (updated same commit).
--
-- All additive. No row changes. Safe to apply to production D1.

ALTER TABLE tasks ADD COLUMN notes TEXT;
ALTER TABLE tasks ADD COLUMN effort TEXT;
ALTER TABLE tasks ADD COLUMN short_title TEXT;
ALTER TABLE tasks ADD COLUMN source_thread_id TEXT;
ALTER TABLE tasks ADD COLUMN related_message_ids TEXT;

-- Index on source_thread_id for Gmail dedup lookups: invariant I25 class
-- (external-writer duplicates) will GROUP BY source_thread_id when I26/I27
-- ship. Index keeps that query on the hot path cheap.
CREATE INDEX IF NOT EXISTS idx_tasks_source_thread_id ON tasks(source_thread_id) WHERE source_thread_id IS NOT NULL;

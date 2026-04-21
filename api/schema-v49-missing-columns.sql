-- v49 (part 2 of 2): columns that exist on prod but aren't in any
-- committed api/schema*.sql file.
--
-- ⚠️ BOOTSTRAP-ONLY — DO NOT APPLY TO PROD.
--
-- ALTER TABLE ADD COLUMN isn't idempotent in SQLite (no IF NOT EXISTS),
-- and every column below already exists on prod. This file exists so the
-- schema-drift CI workflow's fresh-DB bootstrap ends up with the same
-- columns prod has. The workflow tolerates "duplicate column name"
-- errors during bundle replay so the errors these would throw against a
-- DB that already has the columns are expected + ignored.
--
-- If you're spinning up a fresh staging env, apply this AFTER all other
-- schema-v*.sql migrations — the base tables must exist first.

-- ── tasks: blocked_by + description_json (Phase 18 + Phase 28) ──
ALTER TABLE tasks ADD COLUMN blocked_by TEXT;
ALTER TABLE tasks ADD COLUMN description_json TEXT;

-- ── team_members: expertise_tags (Phase 19) ──
ALTER TABLE team_members ADD COLUMN expertise_tags TEXT;

-- ── meetings: facilitator (Phase 29+ meeting prep) ──
ALTER TABLE meetings ADD COLUMN facilitator TEXT;

-- ── projects: stage_notes (Project Detail context field) ──
ALTER TABLE projects ADD COLUMN stage_notes TEXT;

-- ── grants: status (R9/R10 grant pipeline vocabulary) ──
ALTER TABLE grants ADD COLUMN status TEXT DEFAULT 'planning';

-- ── action_items: created_by + category + parent_task_id + idx_parent ──
ALTER TABLE action_items ADD COLUMN created_by TEXT;
ALTER TABLE action_items ADD COLUMN category TEXT;
ALTER TABLE action_items ADD COLUMN parent_task_id TEXT;
-- Indexes can run safely after columns exist. Still guarded by IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS idx_action_items_category ON action_items(category);
CREATE INDEX IF NOT EXISTS idx_action_items_parent   ON action_items(parent_task_id);

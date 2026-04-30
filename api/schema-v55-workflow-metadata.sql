-- Schema v55 — workflow restructure metadata (W1, plan rev 4 §W1)
--
-- Adds projects.state + project_state_log + day_capacity tables, plus
-- 10 task workflow columns + 3 project pipeline columns. Mirrors brain.db
-- migrations 046–050 on the Hub side.
--
-- Mentees stay LOCAL-ONLY (rev 4) — no mentee schema changes here.
-- audit_log is brain.db-only — no Hub mirror.
--
-- Apply via:
--   wrangler d1 execute mnccore-lab --remote --file=api/schema-v55-workflow-metadata.sql
--
-- Deploy AFTER brain.db side has verified on both home + work laptops.

-- ── projects: operational state + pipeline metadata ──────────────────────────
ALTER TABLE projects ADD COLUMN state TEXT;
ALTER TABLE projects ADD COLUMN next_artifact TEXT;
ALTER TABLE projects ADD COLUMN last_meaningful_movement TEXT;
ALTER TABLE projects ADD COLUMN stale_active_since TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_state ON projects(state);
CREATE INDEX IF NOT EXISTS idx_projects_stale_active_since ON projects(stale_active_since);

-- Backfill state from existing status (matches brain.db mig 047 backfill).
UPDATE projects SET state = 'Active'  WHERE status = 'active' AND state IS NULL;
UPDATE projects SET state = 'Waiting' WHERE status = 'waiting_external' AND state IS NULL;

-- ── tasks: 10 operational workflow columns ───────────────────────────────────
ALTER TABLE tasks ADD COLUMN waiting_on TEXT;
ALTER TABLE tasks ADD COLUMN promised_to TEXT;
ALTER TABLE tasks ADD COLUMN promise_date TEXT;
ALTER TABLE tasks ADD COLUMN next_checkin_date TEXT;
ALTER TABLE tasks ADD COLUMN nick_followup_date TEXT;
ALTER TABLE tasks ADD COLUMN requires_nick_brain INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER;
ALTER TABLE tasks ADD COLUMN deadline_type TEXT;
ALTER TABLE tasks ADD COLUMN next_artifact TEXT;
ALTER TABLE tasks ADD COLUMN inbox_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_next_checkin ON tasks(next_checkin_date);
CREATE INDEX IF NOT EXISTS idx_tasks_nick_followup ON tasks(nick_followup_date);
CREATE INDEX IF NOT EXISTS idx_tasks_inbox_event ON tasks(inbox_event_id);

-- ── project_state_log: append-only state-transition trail ────────────────────
CREATE TABLE IF NOT EXISTS project_state_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    old_state TEXT,
    new_state TEXT NOT NULL,
    reason TEXT,
    actor TEXT,
    seq INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_state_log_project
    ON project_state_log(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_project_state_log_seq
    ON project_state_log(seq);

-- ── day_capacity: Nick's daily capacity declarations ─────────────────────────
CREATE TABLE IF NOT EXISTS day_capacity (
    date TEXT PRIMARY KEY,
    day_type TEXT NOT NULL,
    declared_at TEXT DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'manual',
    deleted_at TEXT,
    last_mutation_id TEXT,
    seq INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_day_capacity_seq ON day_capacity(seq);
CREATE INDEX IF NOT EXISTS idx_day_capacity_deleted ON day_capacity(deleted_at);

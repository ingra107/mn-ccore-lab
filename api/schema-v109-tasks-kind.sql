-- schema-v109-tasks-kind.sql (2026-09-16)
--
-- A milestone is a task row with kind='milestone' (GH #131/#132). Same project
-- link, due date, assignee, activity thread and sync as any task; the Hub
-- renders it as a half-height dated rule with no done box, interleaved by due
-- date inside its Today group. Chosen over the empty `milestones` table so
-- nothing task-shaped is built twice.
--
-- NOT NULL DEFAULT 'task': every existing row and every writer that omits the
-- column stays an ordinary task. Purely additive, no backfill. Values are
-- guarded at the API (VALID_TASK_KINDS in api/routes/tasks.ts, 400 on create
-- and update); brain.db mirrors the column (PB mig 128) and the pb-schema
-- contract carries it (0.7.1).
--
-- R10 lockstep: this DDL lands on test then prod BEFORE the Worker that reads
-- and writes `kind` deploys; PB pushes a milestone value only after that.
--
-- ROLLBACK: redeploy the previous Worker first (the column is inert with the
-- default), then, once no row holds 'milestone':
--   ALTER TABLE tasks DROP COLUMN kind;
--
-- Apply (NOT executed by this commit -- prod D1 DDL needs its own named
-- authorization; granted by Nick's plan approval 2026-09-16):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v109-tasks-kind.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v109-tasks-kind.sql

ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'task';

-- Self-registration: this row is the proof that schema-v109 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (109, 'schema-v109-tasks-kind.sql');

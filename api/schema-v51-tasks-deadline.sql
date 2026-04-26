-- v51 (2026-04-24): tasks.deadline — mirror of brain.db migration 041.
--
-- Nick's model (Decision 2026-04-24):
--   - due_date     = "when I plan to work on this" (reshuffles daily)
--   - deadline     = "external hard date" (immutable once set)
--   - milestone_id = project-level event link
-- All three independent. See:
--   - brain.db: scripts/db/migrations/041_tasks_deadline.sql
--   - decision: Context/Decisions/2026-04-24-task-deadline-field-option-a.md
--
-- Paired Hub code changes (same deploy):
--   - api/routes/tasks.ts: TASK_ALLOWED_FIELDS extended, 3 INSERT paths carry deadline
--     (handleCreateTask, handleSyncBulkTasks, handleMobileTasksToHub)
--
-- Additive. Safe to apply to production D1.

ALTER TABLE tasks ADD COLUMN deadline TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_deadline
  ON tasks(deadline)
  WHERE deadline IS NOT NULL AND completed = 0;

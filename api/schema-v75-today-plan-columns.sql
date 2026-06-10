-- schema-v75-today-plan-columns.sql (2026-06-09)
-- Workstream B: the Today operating-day plan becomes synced TASK COLUMNS,
-- replacing the per-browser `today_state_*` localStorage blob.
--
-- Three nullable columns on tasks (Hub-canonical, same lane/authority as
-- group_override / waiting_since / email_link):
--   planned_for  TEXT  civil date 'YYYY-MM-DD' — the day this task is planned for.
--                      "planned today" = planned_for == todayCivil(). NULL = unplanned.
--                      Self-expiring: only == today lights the cockpit; NO history table.
--   plan_slot    TEXT  one of 'right_now' | 'strip' | 'between-<n>' (<n> = integer
--                      timeline-gap index). 'right_now' is a singleton per assignee-day,
--                      enforced at the frontend write helper (src/lib/todayPlan.ts).
--                      Value-guarded at the Hub write boundary (tasks.ts VALID_PLAN_SLOT),
--                      NOT via the enum-domain trigger (between-<n> is parametric).
--   plan_rank    REAL  ordering within the plan (fractional so a drag-insert never
--                      renumbers siblings).
--
-- All three: nullable, no default. Purely additive — no backfill (a brand-new plan
-- store; pre-existing tasks are simply unplanned until a user plans them). Reversible:
-- columns left inert on rollback (no destructive DROP); D1 Time-Travel (30d) is the
-- data backstop.
--
-- Worker acceptance: tasks.{planned_for,plan_slot,plan_rank} enter TABLE_FIELDS via the
-- regenerated pb-schema field-authority.generated.ts (imported by mutations.ts); this
-- ALTER + the Worker deploy of that regenerated artifact together make Hub ACCEPT the
-- fields BEFORE PB pushes them (R10 lockstep — never ship the data migration ahead of
-- Hub accepting the field). TASK_SELECT_COLS (api/lib/task-cols.ts) returns them.
--
-- Decision doc pointer:
--   Peripheral-Brain/Context/Decisions/2026-06-09-today-plan-task-columns.md
--
-- APPLY (test FIRST, probe, then prod) — sanctioned wrapper ONLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v75-today-plan-columns.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v75-today-plan-columns.sql

ALTER TABLE tasks ADD COLUMN planned_for TEXT;
ALTER TABLE tasks ADD COLUMN plan_slot TEXT;
ALTER TABLE tasks ADD COLUMN plan_rank REAL;

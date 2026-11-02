-- schema-v155-tasks-run-skill.sql (2026-11-02)
--
-- The teal Run button on a skill-backed task. Nick, 2026-11-02: "if its
-- something i should run i guess it should just hav ea button to run it like
-- the "work-on" button but maybe its a teal color because its a special run
-- this to start a session that will complete this task after its done and i
-- interact with the session". Approved: "Build it (Recommended)" and "Add the
-- column (Recommended)". Decision: PB Context/Decisions/2026-11-02-task-run-skill.md.
-- Plan: PB Scratch/plans/2026-11-02-run-skill-RECONCILED.md (seats L1 + MIN).
--
-- tasks.run_skill names the PB skill the Run button starts. NULL = no button.
-- Purely ADDITIVE: NULL on every existing row, no backfill. PB mig 156 adds
-- the same column to the brain.db cache (no CHECK there: a cache stricter than
-- the arbiter can only lose writes).
--
-- WHAT THE SCHEMA MAKES UNREPRESENTABLE (Level 1 at the arbiter):
--   - a value that is not a skill-directory name: CHECK tasks_run_skill_shape
--     (1-64 chars of a-z, 0-9 and '-', first char not '-'). The same shape as
--     PB scripts/utils/run_skill_task.SKILL_RE and the Hub's SKILL_NAME_RE.
--
-- WHAT STAYS LEVEL 2 (api/lib/task-run-skill.ts runSkillError, one chokepoint
-- in applyInsert + applyPatch; why Level 1 is unreachable: D1 has no per-writer
-- authorization, so "only the PB key writes this" cannot be a column rule):
--   - a hub_ui: write that carries run_skill is refused, and so is any caller
--     that is not the PB API key (a PI browser session included);
--   - a question or check-in may not carry one.
-- The real boundary is on the laptop: PB runs a skill only if it is in the
-- git-tracked enums.RUN_SKILLS and the task's source is one that skill allows.
--
-- ROLLBACK (manual, after rolling the Worker back to one that does not send or
-- check run_skill):
--   UPDATE tasks SET run_skill = NULL WHERE run_skill IS NOT NULL;
--   ALTER TABLE tasks DROP COLUMN run_skill;
--   DELETE FROM schema_migrations WHERE version = 155;
-- The CHECK is attached to the column itself, so SQLite's DROP COLUMN accepts
-- it (it refuses only a CHECK that is not associated with the dropped column;
-- proved on a scratch copy, api/routes/mutations.run-skill.real.test.ts).
-- Leaving the column inert (all NULL) is also a safe rollback.

ALTER TABLE tasks ADD COLUMN run_skill TEXT
  CONSTRAINT tasks_run_skill_shape CHECK (
    run_skill IS NULL OR (
      length(run_skill) BETWEEN 1 AND 64
      AND run_skill GLOB '[a-z0-9]*'
      AND run_skill NOT GLOB '*[^a-z0-9-]*'
    )
  );

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (155, 'schema-v155-tasks-run-skill.sql');

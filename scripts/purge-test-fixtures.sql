-- Purge QA test fixtures from prod D1 (R4-P1-01).
--
-- Motivation: ~174 fixture rows across 6 tables leaked to real UIs
-- (Ask the Lab, Decisions, Ideas, Meeting Prep, Mentee Milestones) on
-- 2026-04-22 — full findings in docs/design-handoff-2026-04-23/.
-- Server-side filter (api/lib/fixtures.ts) prevents NEW leakage; this
-- script does the one-time cleanup of existing rows.
--
-- Run against prod once, in a maintenance window:
--   npx wrangler d1 execute mnccore-lab --remote \
--     --file=scripts/purge-test-fixtures.sql
--
-- Dry-run first — every block has a matching SELECT above it:
--   npx wrangler d1 execute mnccore-lab --remote \
--     --command="SELECT COUNT(*) FROM lab_questions WHERE ..."

-- ── lab_questions ────────────────────────────────────────────────────
-- Dry-run: SELECT id, question FROM lab_questions WHERE
--   LOWER(question) LIKE '\_test\_delete\_%' ESCAPE '\' OR
--   LOWER(question) LIKE 'test\_delete\_%' ESCAPE '\' OR
--   LOWER(question) LIKE 'deep-audit-%' OR
--   LOWER(question) GLOB 'test q*' OR LOWER(question) = 'test' OR
--   LOWER(question) LIKE 'test question%' OR
--   LOWER(question) = '@claude hi';
DELETE FROM lab_answers WHERE question_id IN (
  SELECT id FROM lab_questions WHERE
    LOWER(question) LIKE '\_test\_delete\_%' ESCAPE '\' OR
    LOWER(question) LIKE 'test\_delete\_%' ESCAPE '\' OR
    LOWER(question) LIKE 'deep-audit-%' OR
    LOWER(question) GLOB 'test q*' OR LOWER(question) = 'test' OR
    LOWER(question) LIKE 'test question%' OR
    LOWER(question) = '@claude hi'
);
DELETE FROM lab_questions WHERE
  LOWER(question) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(question) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(question) LIKE 'deep-audit-%' OR
  LOWER(question) GLOB 'test q*' OR LOWER(question) = 'test' OR
  LOWER(question) LIKE 'test question%' OR
  LOWER(question) = '@claude hi';

-- ── decision_log ─────────────────────────────────────────────────────
DELETE FROM decision_log WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%' OR
  LOWER(title) LIKE 'test decision%';

-- ── ideas ────────────────────────────────────────────────────────────
DELETE FROM ideas WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%' OR
  LOWER(title) LIKE 'test idea%';

-- ── mentee_milestones ────────────────────────────────────────────────
DELETE FROM mentee_milestones WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%';

-- ── tasks (hard-delete fixtures; real tasks soft-delete via deleted_at) ─
DELETE FROM tasks WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%' OR
  LOWER(title) LIKE '%\_\_\_cli\_edit' ESCAPE '\' OR
  LOWER(title) LIKE 'test task%';

-- ── projects (be conservative — require explicit fixture prefix) ─────
DELETE FROM projects WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%';

-- ── meetings ─────────────────────────────────────────────────────────
DELETE FROM meetings WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%';

-- ── activity_log (descriptions often reference fixture titles) ───────
DELETE FROM activity_log WHERE
  LOWER(description) LIKE '%\_test\_delete\_%' ESCAPE '\' OR
  LOWER(description) LIKE '%test\_delete\_%' ESCAPE '\' OR
  LOWER(description) LIKE '%deep-audit-%' OR
  LOWER(description) LIKE '%\_\_\_cli\_edit%' ESCAPE '\';

-- Verification queries (run after):
--   SELECT (SELECT COUNT(*) FROM lab_questions WHERE LOWER(question) LIKE '%test%delete%') AS lab_questions_remaining,
--          (SELECT COUNT(*) FROM decision_log WHERE LOWER(title) LIKE '%test%delete%')    AS decisions_remaining,
--          (SELECT COUNT(*) FROM ideas WHERE LOWER(title) LIKE '%test%delete%')           AS ideas_remaining,
--          (SELECT COUNT(*) FROM mentee_milestones WHERE LOWER(title) LIKE '%test%delete%') AS milestones_remaining,
--          (SELECT COUNT(*) FROM tasks WHERE LOWER(title) LIKE '%test%delete%')            AS tasks_remaining,
--          (SELECT COUNT(*) FROM projects WHERE LOWER(title) LIKE '%test%delete%')         AS projects_remaining,
--          (SELECT COUNT(*) FROM meetings WHERE LOWER(title) LIKE '%test%delete%')         AS meetings_remaining;

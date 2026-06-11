-- Phase 0 cleanup — Everything Sprint V2 (2026-04-15)
-- Deletes every test_delete_*-prefixed row seeded during Phase 0 plus any
-- pre-existing test_delete_ clutter rows from prior Playwright runs.
-- Children before parents to respect FK constraints.
--
-- Also catches the orphan canary project (0a394efe...) that wasn't in the
-- seed manifest because --canary was run before idempotency guard existed.

-- Task reactions (child of tasks)
DELETE FROM reactions
  WHERE target_type = 'task'
    AND target_id IN (
      SELECT id FROM tasks
       WHERE description LIKE 'test_delete_%' OR title LIKE 'test_delete_%'
    );

-- task_comments dropped (schema-v78, 2026-06-10) — activity_entries handles comments now.

-- Task subtasks (child of tasks)
DELETE FROM task_subtasks
  WHERE title LIKE 'test_delete_%'
     OR task_id IN (
       SELECT id FROM tasks
        WHERE description LIKE 'test_delete_%' OR title LIKE 'test_delete_%'
     );

-- Manuscript revisions (child of projects)
DELETE FROM manuscript_revisions
  WHERE notes LIKE 'test_delete_%'
     OR project_id IN (SELECT id FROM projects WHERE title LIKE 'test_delete_%');

-- Milestones (child of projects via project_id FK — project_id is the project UUID)
DELETE FROM milestones
  WHERE title LIKE 'test_delete_%'
     OR project_id IN (SELECT id FROM projects WHERE title LIKE 'test_delete_%');

-- Research digest (standalone)
DELETE FROM research_digest WHERE title LIKE 'test_delete_%';

-- Publications (standalone)
DELETE FROM publications WHERE title LIKE 'test_delete_%';

-- Grants (standalone)
DELETE FROM grants WHERE title LIKE 'test_delete_%';

-- Meetings (action items referencing meetings already cleaned via tasks delete below)
DELETE FROM meetings WHERE title LIKE 'test_delete_%';

-- Decisions (hub_decisions table — not 'decisions')
DELETE FROM hub_decisions WHERE title LIKE 'test_delete_%';

-- Ideas
DELETE FROM ideas WHERE title LIKE 'test_delete_%';

-- Tasks (after all task-children cleared above)
-- Covers Phase 0 regular tasks, meeting action items (which are tasks with meeting_id),
-- and any pre-existing test_delete_ task clutter.
DELETE FROM tasks
  WHERE description LIKE 'test_delete_%' OR title LIKE 'test_delete_%';

-- Projects last — catches the orphan canary project + the 5 full-seed projects
DELETE FROM projects WHERE title LIKE 'test_delete_%';

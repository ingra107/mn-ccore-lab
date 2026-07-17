-- Cleanup all test data tagged with test_delete_ prefix
-- FK-ordered deletion: dependent records first
-- Usage: bash scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=scripts/cleanup-test-data.sql

-- Activity entries on test tasks (task_comments/task_updates dropped schema-v78, 2026-06-10)
DELETE FROM activity_entries WHERE entity_type = 'task' AND entity_id IN (SELECT id FROM tasks WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%');

-- Subtasks of test tasks
DELETE FROM task_subtasks WHERE task_id IN (SELECT id FROM tasks WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%');

-- Tasks (soft delete via deleted_at since hard delete would orphan sync_log)
UPDATE tasks SET deleted_at = datetime('now') WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%';

-- Ideas and their votes
DELETE FROM idea_votes WHERE idea_id IN (SELECT id FROM ideas WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%');
DELETE FROM ideas WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%';

-- Decisions
DELETE FROM hub_decisions WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%';

-- Meetings + agenda + action items
-- (action_items DELETE removed here — table DROPPED, backlog #742,
-- 2026-07-16; action-item rows now live as `tasks`, already covered by
-- the tasks soft-delete above)
DELETE FROM agenda_items WHERE meeting_id IN (SELECT id FROM meetings WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%');
DELETE FROM meetings WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%';

-- Projects (project_updates dropped schema-v78, 2026-06-10; activity_entries cascade handles it)
DELETE FROM activity_entries WHERE entity_type = 'project' AND entity_id IN (SELECT id FROM projects WHERE slug LIKE 'test_delete_%' OR title LIKE 'test_delete_%');
DELETE FROM projects WHERE slug LIKE 'test_delete_%' OR title LIKE 'test_delete_%';

-- Grants + milestones
DELETE FROM grant_milestones WHERE grant_id IN (SELECT id FROM grants WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%');
DELETE FROM grants WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%';

-- Mentee milestones
DELETE FROM mentee_milestones WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%';

-- Regulatory / IRB items
DELETE FROM regulatory_items WHERE id LIKE 'test_delete_%' OR title LIKE 'test_delete_%';

-- Paper revisions + reviewer comments
DELETE FROM reviewer_comments WHERE revision_id IN (SELECT id FROM manuscript_revisions WHERE id LIKE 'test_delete_%');
DELETE FROM manuscript_revisions WHERE id LIKE 'test_delete_%';

-- Submission events
DELETE FROM submission_events WHERE id LIKE 'test_delete_%';

-- Expertise tags
DELETE FROM expertise_tags WHERE id LIKE 'test_delete_%' OR tag LIKE 'test_delete_%';

-- Activity log entries
DELETE FROM activity_log WHERE id LIKE 'test_delete_%' OR description LIKE 'test_delete_%';

-- Notifications generated during test runs
DELETE FROM notifications WHERE body LIKE 'test_delete_%' OR id LIKE 'test_delete_%';

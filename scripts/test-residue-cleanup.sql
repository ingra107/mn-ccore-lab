-- 2026-04-19 audit: clean test_delete_* residue across tables that lack
-- a deleted_at soft-delete column. Without this, /ideas + /decisions are
-- wallpapered with test rows for any new team member opening the link.
--
-- Tables: ideas, hub_decisions, meetings, digest_comments, lab_questions,
-- publications. ~160 rows total.
-- Tasks already use deleted_at (not affected).

DELETE FROM ideas WHERE LOWER(title) LIKE 'test_delete_%' OR LOWER(description) LIKE 'test_delete_%';

DELETE FROM hub_decisions WHERE LOWER(title) LIKE 'test_delete_%';

-- agenda_items + tasks reference meeting_id. Clean cascading.
-- (action_items DELETE removed here — table DROPPED, backlog #742,
-- 2026-07-16; action-item rows now live as `tasks`, already detached by
-- the meeting_id=NULL UPDATE below)
DELETE FROM agenda_items WHERE meeting_id IN (SELECT id FROM meetings WHERE LOWER(title) LIKE 'test_delete_%');
UPDATE tasks SET meeting_id = NULL, updated_at = datetime('now') WHERE meeting_id IN (SELECT id FROM meetings WHERE LOWER(title) LIKE 'test_delete_%');
DELETE FROM meetings WHERE LOWER(title) LIKE 'test_delete_%';

DELETE FROM digest_comments WHERE LOWER(content) LIKE 'test_delete_%';

-- lab_answers references question_id. Clean cascading.
DELETE FROM lab_answers WHERE question_id IN (SELECT id FROM lab_questions WHERE LOWER(question) LIKE 'test_delete_%');
DELETE FROM lab_questions WHERE LOWER(question) LIKE 'test_delete_%';

DELETE FROM publications WHERE LOWER(title) LIKE 'test_delete_%';

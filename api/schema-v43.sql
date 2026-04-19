-- v43: team_members.email column + backfill from slug.
-- Run: POST /api/admin/migrate with {"version": 43}
--
-- Before this migration, three code paths derived email as `${slug}@umn.edu`:
--   api/index.ts:1725 (all-members loop for notifications)
--   api/routes/digest-email.ts:682 (digest recipient)
--   api/routes/tasks.ts:299 (task-assignment email)
--
-- That pattern breaks the moment a non-UMN collaborator joins (Carleton
-- fellows, etc.). Email is now a real column; reads go through it, writes
-- happen via the team directory. Existing rows are backfilled to
-- `slug@umn.edu` so behavior is unchanged for current team members.

ALTER TABLE team_members ADD COLUMN email TEXT;
UPDATE team_members SET email = slug || '@umn.edu' WHERE email IS NULL AND slug IS NOT NULL;

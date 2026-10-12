-- schema-v127-project-member-folders.sql (2026-10-12)
--
-- My folder for this project: one local path per (person, project), private to
-- that person, set by any member of the project.
--
-- Nick, 2026-10-12: "if other folks have local folders they want to put in they
-- should be able to do that maybe?", then "Also install the launcher", then
-- "they might have a mac too". projects.primary_folder is ONE shared column
-- holding Nick's own Box path; it cannot hold Casey's C:\Users\casey\Box\...
-- next to Steven's /Users/steven/Library/CloudStorage/Box-Box/..., and a
-- member's path is nobody else's business.
--
-- SHAPE:
--   - (project_id, member_slug) is the primary key AND a composite foreign key
--     to project_members' primary key. A folder row cannot exist for someone
--     who is not on the project (unrepresentable, not checked), and removing a
--     member removes their folder (ON DELETE CASCADE). A slug renamed in place
--     cascades through project_members to here (ON UPDATE CASCADE).
--   - folder_path: an absolute local path, a Windows drive path (C:\ or C:/)
--     or a POSIX absolute path (/Users/...), 3 to 1024 characters, no double
--     quote, no control character. The route (api/routes/project-member-
--     folders.ts, shared/localFolderPath.ts) gives the readable refusal; these
--     CHECKs are the arbiter's backstop for any other writer.
--   - Clearing a folder deletes the row. No soft delete: nothing reads history.
--
-- PRIVACY: api/lib/table-scope.ts scopes this table to the viewer's OWN rows
-- (member_slug = viewer) on projects the viewer can see, for every person, the
-- PI and "show all projects" included. A route cannot read another person's
-- folder through the viewer-bound handle; only the PB key's raw handle could,
-- and no route reads this table for the PB key.
--
-- PB: Hub-only, per-person data. No brain.db table, no schema_dsl.py entry,
-- nothing on the A3 wire (the shape project_members has, v120). PB keeps using
-- projects.primary_folder for Nick's Box paths; that column is untouched.
--
-- Purely ADDITIVE: no code live before this file names the table.
--
-- APPLY (test first, then prod; sanctioned wrapper only):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v127-project-member-folders.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v127-project-member-folders.sql
-- ROLLBACK:
--   DROP TABLE IF EXISTS project_member_folders;
--   DELETE FROM schema_migrations WHERE version = 127;

CREATE TABLE IF NOT EXISTS project_member_folders (
  project_id  TEXT NOT NULL,
  member_slug TEXT NOT NULL,
  folder_path TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, member_slug),
  FOREIGN KEY (project_id, member_slug) REFERENCES project_members(project_id, member_slug)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT project_member_folders_path_length CHECK (length(folder_path) BETWEEN 3 AND 1024),
  CONSTRAINT project_member_folders_path_absolute CHECK (
    folder_path GLOB '[A-Za-z]:[\/]*' OR folder_path GLOB '/[^/]*'
  ),
  CONSTRAINT project_member_folders_path_no_quote CHECK (instr(folder_path, '"') = 0),
  CONSTRAINT project_member_folders_path_no_control CHECK (
    folder_path NOT GLOB ('*[' || char(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
                                        21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 127) || ']*')
  )
);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (127, 'schema-v127-project-member-folders.sql');

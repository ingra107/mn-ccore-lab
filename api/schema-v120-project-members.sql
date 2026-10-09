-- schema-v120-project-members.sql (2026-10-09, #145 Lane B)
--
-- Project membership: who is on which project. Membership is the one rule
-- that decides which projects (and their tasks, comments, files, activity) a
-- signed-in person sees, Nick included (Nick, 2026-10-08: "we treat it like a
-- slack channel where you have to join it ... the default should always be
-- only projects that I'm on"). The read rule lives in api/lib/table-scope.ts;
-- this file only holds the data and the two ways the data grows on its own.
--
-- SHAPE (third-seat ruling, codex-145-last.md Q2):
--   - project_id -> projects(id): the canonical typed PK, never a slug. ON
--     DELETE CASCADE: the Hub soft-deletes projects, so this fires only on a
--     hand-run hard delete, which should take the memberships with it.
--   - member_slug -> team_members(slug), ON UPDATE CASCADE ON DELETE RESTRICT.
--     A slug renamed in place carries its memberships along. The historical
--     rename procedure (scripts/rename-team-slugs.sql: insert new member,
--     move references, delete old) must move project_members too; if it
--     forgets, RESTRICT stops the delete instead of silently dropping access.
--     D1 enforces foreign keys on every query (PRAGMA foreign_keys = 1).
--   - No role column: being a member is the only per-project authority; the
--     PI flag and Nick's site-admin switch live outside this table.
--   - added_by: who or what put the row there (a member slug, 'assignment',
--     'pi', 'backfill-v120'). The seed rollback deletes by it.
--
-- TRIGGERS: membership follows the data, not the caller.
--   - Assigning a task makes the assignee a member of the task's project
--     (#145 acceptance: "assigning Casey a task joins him to the project").
--     A trigger, so every writer gets it: Hub UI, PB /api/mutations, the
--     Apps Script, the PWA.
--   - Naming a project's PI makes the PI a member.
--   Both skip a 'Peripheral Brain' project (PI-only either way) and a
--   deleted row. Both are guarded by EXISTS on team_members: an unknown
--   assignee ('nick', 'not_a_real_person', an email) would otherwise fail
--   the member_slug foreign key and roll back the TASK write that fired the
--   trigger (D1 enforces FKs; INSERT OR IGNORE does not ignore an FK).
--   project_id may hold a legacy slug, so the project is matched on id or slug.
--   NOT EXISTS keeps a re-assignment from touching an existing row (and from
--   depending on the outer statement's conflict clause, which SQLite lets
--   override a trigger's).
--
-- The seed (Nick on every live project; everyone else from task assignees and
-- projects.pi) is a separate, reviewed step generated from a prod pre-image:
-- scripts/backfill-120-project-members.ts.
--
-- ORDER: this DDL, then the seed, then the Worker deploy that reads the table.
-- The deployed Worker before that deploy never names project_members, so the
-- table and triggers are inert to it.
--
-- APPLY (test first, then prod; sanctioned wrapper only):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v120-project-members.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v120-project-members.sql
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_projects_pi_joins_ins;
--   DROP TRIGGER IF EXISTS trg_projects_pi_joins_upd;
--   DROP TRIGGER IF EXISTS trg_tasks_assignee_joins_ins;
--   DROP TRIGGER IF EXISTS trg_tasks_assignee_joins_upd;
--   DROP TABLE IF EXISTS project_members;
--   DELETE FROM schema_migrations WHERE version = 120;

CREATE TABLE IF NOT EXISTS project_members (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  member_slug TEXT NOT NULL REFERENCES team_members(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
  added_by    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, member_slug)
);

CREATE INDEX IF NOT EXISTS idx_project_members_member_project ON project_members(member_slug, project_id);

CREATE TRIGGER IF NOT EXISTS trg_tasks_assignee_joins_ins AFTER INSERT ON tasks
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL AND NEW.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.slug = NEW.assignee)
BEGIN
  INSERT INTO project_members (project_id, member_slug, added_by)
  SELECT p.id, NEW.assignee, 'assignment' FROM projects p
  WHERE (p.id = NEW.project_id OR p.slug = NEW.project_id)
    AND p.deleted_at IS NULL
    AND COALESCE(p.category, '') <> 'Peripheral Brain'
    AND NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.member_slug = NEW.assignee)
  LIMIT 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_assignee_joins_upd AFTER UPDATE OF assignee, project_id, deleted_at ON tasks
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL AND NEW.deleted_at IS NULL
 AND (NEW.assignee IS NOT OLD.assignee OR NEW.project_id IS NOT OLD.project_id OR OLD.deleted_at IS NOT NULL)
 AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.slug = NEW.assignee)
BEGIN
  INSERT INTO project_members (project_id, member_slug, added_by)
  SELECT p.id, NEW.assignee, 'assignment' FROM projects p
  WHERE (p.id = NEW.project_id OR p.slug = NEW.project_id)
    AND p.deleted_at IS NULL
    AND COALESCE(p.category, '') <> 'Peripheral Brain'
    AND NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.member_slug = NEW.assignee)
  LIMIT 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_pi_joins_ins AFTER INSERT ON projects
FOR EACH ROW
WHEN NEW.pi IS NOT NULL AND NEW.deleted_at IS NULL
 AND COALESCE(NEW.category, '') <> 'Peripheral Brain'
 AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.slug = NEW.pi)
BEGIN
  INSERT INTO project_members (project_id, member_slug, added_by)
  SELECT NEW.id, NEW.pi, 'pi'
  WHERE NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = NEW.id AND pm.member_slug = NEW.pi);
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_pi_joins_upd AFTER UPDATE OF pi, category, deleted_at ON projects
FOR EACH ROW
WHEN NEW.pi IS NOT NULL AND NEW.deleted_at IS NULL
 AND COALESCE(NEW.category, '') <> 'Peripheral Brain'
 AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.slug = NEW.pi)
BEGIN
  INSERT INTO project_members (project_id, member_slug, added_by)
  SELECT NEW.id, NEW.pi, 'pi'
  WHERE NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = NEW.id AND pm.member_slug = NEW.pi);
END;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (120, 'schema-v120-project-members.sql');

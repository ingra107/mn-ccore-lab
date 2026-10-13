-- schema-v139-project-join-requests.sql (2026-10-13)
--
-- Request to join a project, approved by Nick or Nate (#145 follow-up).
-- Nick, 2026-10-13: "members ... can request to get added to projects where I
-- can join say yes through a [Telegram] message or on my today page kind of
-- like slack where it's a channel so they have some visibility to those
-- channels and such but Nate and I need to approve that". His rulings: EITHER
-- Nick or Nate approves, the first approval adds the member; before joining a
-- member sees only the project's name, a one-line description and its PI.
--
-- WHY THE DATABASE DOES THE WORK. #145 put visibility below the routes
-- (api/lib/viewer-db.ts) and made membership grow by trigger (schema-v120:
-- "membership follows the data, not the caller"). Nate is not a member of most
-- projects and has no "show all projects" switch, so POST
-- /api/projects/:id/members answers him 404 there. An approval therefore cannot
-- go through that route; it is a trigger here, whichever surface decided.
--
-- WHAT THIS FILE ADDS
--   project_blurbs          the one-line description, its own Hub-only table.
--                           Starts empty; never derived from projects.description
--                           (internal notes). Not on `projects`: a projects
--                           column would have to join the PB wire (TABLE_FIELDS,
--                           pb-schema) to be writable, and PB never needs it.
--   project_directory       a VIEW with exactly five columns. It is the only
--                           thing a non-member can read about a project. A
--                           view's body reads the real tables, not the viewer's
--                           filtered copies, which is the point; its column list
--                           is the whole contract (there is no description,
--                           task or file column to select through it).
--                           table-scope.test.ts pins the column list.
--   project_join_requests   one row per ask. At most one pending per (project,
--                           person). Decided once. Only nick-ingraham or
--                           nate-mesfin may decide (CHECK), never the requester
--                           (CHECK). TS mirrors the list as JOIN_APPROVER_SLUGS
--                           (shared/joinApprovers.ts); a contract test reads
--                           this file and checks the two agree.
--   triggers                guards on the request and on its question row, and
--                           the decision's effects (member row, notification,
--                           the question closed with a consumer receipt).
--
-- THE TWO WAYS A REQUEST IS DECIDED
--   Hub (Nick or Nate, Today's JoinRequestsCard): the route UPDATEs the request.
--   Telegram (Nick only; Nate has no Telegram): the route minted a kind='question'
--     task (source 'project_join', assignee nick-ingraham, no project, nobody
--     else named, so the requester can never see or answer it). PB's listener
--     sends a card for every question row; a tap writes question_answer_json,
--     and trg_tasks_project_join_answered turns that into the decision.
--   Either way trg_pjr_decided runs once, in the same transaction: adds the
--   member ('join:<decider>'), notifies the requester, and closes the question
--   with an answer and a receipt {consumer:'project_join'} (PB enums
--   QUESTION_CONSUMERS carries it), so Nick's card converges to "answered".
--   'other' with text from Telegram is a decline with that text as the note.
--
-- RECURSION. D1 may run with recursive_triggers on. Nothing here can re-enter:
-- the answered trigger fires only when the OLD answer is NULL, the close keeps
-- an existing answer as-is (COALESCE), and the decided trigger fires only when
-- the OLD status is 'pending'. Tests run the chain with the pragma both ways.
--
-- ORDER: this DDL (test, then prod), then `npm run deploy:pages:gated`. The code
-- live before the deploy never names these objects, and the tasks triggers fire
-- only on source='project_join' rows, which no older writer produces. PB's enum
-- line (QUESTION_CONSUMERS += 'project_join') must be on HOME before the first
-- request is decided, or PB's question_state reads the closed row as `anomaly`
-- (loud, harmless).
--
-- APPLY (test first, then prod; sanctioned wrapper only):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v139-project-join-requests.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v139-project-join-requests.sql
-- READ-BACK (must list 9 names):
--   SELECT type, name FROM sqlite_master WHERE name IN ('project_blurbs',
--     'project_directory', 'project_join_requests', 'trg_pjr_guard_ins',
--     'trg_pjr_identity_frozen', 'trg_pjr_decided_once', 'trg_pjr_decided',
--     'trg_tasks_project_join_ins', 'trg_tasks_project_join_upd') ORDER BY name;
-- ROLLBACK (redeploy the previous Pages build first; the objects are inert
-- without the routes):
--   DROP TRIGGER IF EXISTS trg_tasks_project_join_answered;
--   DROP TRIGGER IF EXISTS trg_tasks_project_join_answer_frozen;
--   DROP TRIGGER IF EXISTS trg_tasks_project_join_upd;
--   DROP TRIGGER IF EXISTS trg_tasks_project_join_ins;
--   DROP TRIGGER IF EXISTS trg_pjr_decided;
--   DROP TRIGGER IF EXISTS trg_pjr_decided_once;
--   DROP TRIGGER IF EXISTS trg_pjr_identity_frozen;
--   DROP TRIGGER IF EXISTS trg_pjr_guard_ins;
--   DROP TABLE IF EXISTS project_join_requests;   -- export it first
--   DROP VIEW IF EXISTS project_directory;
--   DROP TABLE IF EXISTS project_blurbs;          -- export it first
--   DELETE FROM schema_migrations WHERE version = 139;
-- Members added by approval stay, tagged added_by LIKE 'join:%'. Open join
-- questions: retire with op=delete (source='project_join').

CREATE TABLE IF NOT EXISTS project_blurbs (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  -- One line: 1..140 characters, no line break, not blank.
  blurb      TEXT NOT NULL CHECK (
    length(blurb) BETWEEN 1 AND 140
    AND length(trim(blurb)) > 0
    AND instr(blurb, char(10)) = 0
    AND instr(blurb, char(13)) = 0
  ),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Listed: live, not Peripheral Brain (Nick's personal and admin work, PI-only by
-- membership), and active or waiting (not done, blocked or deleted).
CREATE VIEW IF NOT EXISTS project_directory AS
SELECT p.id                                          AS project_id,
       COALESCE(NULLIF(trim(p.short_name), ''), p.title) AS name,
       b.blurb                                       AS blurb,
       p.pi                                          AS pi_slug,
       COALESCE(NULLIF(trim(tm.preferred_name), ''), tm.name) AS pi_name
  FROM projects p
  LEFT JOIN project_blurbs b ON b.project_id = p.id
  LEFT JOIN team_members tm ON tm.slug = p.pi
 WHERE p.deleted_at IS NULL
   AND COALESCE(p.category, '') <> 'Peripheral Brain'
   AND lower(COALESCE(p.status, '')) IN ('active', 'waiting_external');

CREATE TABLE IF NOT EXISTS project_join_requests (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  requester_slug   TEXT NOT NULL REFERENCES team_members(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  note             TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 280),
  -- Nick's Telegram question row; NULL when none was minted (Nick's own request).
  question_task_id TEXT UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  decided_by       TEXT REFERENCES team_members(slug) ON UPDATE CASCADE,
  decided_via      TEXT CHECK (decided_via IS NULL OR decided_via IN ('hub', 'telegram')),
  decided_note     TEXT CHECK (decided_note IS NULL OR length(decided_note) BETWEEN 1 AND 500),
  decided_at       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Pending <=> nothing decided.
  CHECK ((status = 'pending') = (decided_by IS NULL AND decided_via IS NULL AND decided_at IS NULL)),
  -- The approvers, by name (Nick's ruling): not a role, so a third director is not one.
  CHECK (decided_by IS NULL OR decided_by IN ('nick-ingraham', 'nate-mesfin')),
  -- Nobody decides their own request.
  CHECK (decided_by IS NULL OR decided_by <> requester_slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pjr_one_pending
  ON project_join_requests(project_id, requester_slug) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pjr_requester ON project_join_requests(requester_slug, created_at);
CREATE INDEX IF NOT EXISTS idx_pjr_status ON project_join_requests(status, created_at);

-- A request is born pending, for a listed project, by someone not already on it.
CREATE TRIGGER IF NOT EXISTS trg_pjr_guard_ins BEFORE INSERT ON project_join_requests
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'join_not_pending: a join request is created pending')
   WHERE NEW.status IS NOT 'pending';
  SELECT RAISE(ABORT, 'join_not_listed: the project is not in the directory')
   WHERE NOT EXISTS (SELECT 1 FROM project_directory d WHERE d.project_id = NEW.project_id);
  SELECT RAISE(ABORT, 'join_already_member: the requester is already on this project')
   WHERE EXISTS (SELECT 1 FROM project_members pm
                  WHERE pm.project_id = NEW.project_id AND pm.member_slug = NEW.requester_slug);
END;

-- What was asked never changes. project_id and requester_slug are left out on
-- purpose: their foreign keys cascade a renamed id or slug.
CREATE TRIGGER IF NOT EXISTS trg_pjr_identity_frozen BEFORE UPDATE ON project_join_requests
FOR EACH ROW
WHEN NEW.id IS NOT OLD.id OR NEW.note IS NOT OLD.note OR NEW.created_at IS NOT OLD.created_at
  OR NEW.question_task_id IS NOT OLD.question_task_id
BEGIN
  SELECT RAISE(ABORT, 'join_request_immutable: a join request''s id, note, question and created_at never change');
END;

-- Decided once: the first answer stands.
CREATE TRIGGER IF NOT EXISTS trg_pjr_decided_once BEFORE UPDATE ON project_join_requests
FOR EACH ROW
WHEN OLD.status <> 'pending'
 AND (NEW.status IS NOT OLD.status OR NEW.decided_by IS NOT OLD.decided_by OR NEW.decided_via IS NOT OLD.decided_via
      OR NEW.decided_note IS NOT OLD.decided_note OR NEW.decided_at IS NOT OLD.decided_at)
BEGIN
  SELECT RAISE(ABORT, 'join_request_decided: this request was already decided');
END;

-- The decision's effects, in the same transaction as the decision.
CREATE TRIGGER IF NOT EXISTS trg_pjr_decided AFTER UPDATE OF status ON project_join_requests
FOR EACH ROW
WHEN OLD.status = 'pending' AND NEW.status IN ('approved', 'declined')
BEGIN
  INSERT INTO project_members (project_id, member_slug, added_by)
  SELECT NEW.project_id, NEW.requester_slug, 'join:' || NEW.decided_by
   WHERE NEW.status = 'approved'
     AND EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM project_members pm
                      WHERE pm.project_id = NEW.project_id AND pm.member_slug = NEW.requester_slug);

  INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link)
  SELECT 'ntf_pjr_' || NEW.id, NEW.requester_slug, 'update', 'project_join', NEW.id,
         CASE NEW.status
           WHEN 'approved' THEN 'You joined ' || COALESCE(NULLIF(trim(p.short_name), ''), p.title)
           ELSE 'Your request to join ' || COALESCE(NULLIF(trim(p.short_name), ''), p.title) || ' was declined'
         END,
         CASE WHEN NEW.decided_note IS NULL
              THEN CASE NEW.status WHEN 'approved' THEN 'Approved by ' ELSE 'Declined by ' END
                   || COALESCE((SELECT COALESCE(NULLIF(trim(tm.preferred_name), ''), tm.name)
                                  FROM team_members tm WHERE tm.slug = NEW.decided_by), NEW.decided_by)
              ELSE NEW.decided_note END,
         CASE NEW.status
           WHEN 'approved' THEN '/portal/projects/' || COALESCE(NULLIF(p.slug, ''), p.id)
           ELSE '/portal/projects?view=browse'
         END
    FROM projects p WHERE p.id = NEW.project_id;

  UPDATE tasks
     SET question_answer_json = COALESCE(question_answer_json,
           CASE WHEN NEW.decided_note IS NULL
                THEN json_object('v', 1, 'choice', CASE NEW.status WHEN 'approved' THEN 'approve' ELSE 'decline' END,
                                 'via', 'hub', 'at', NEW.decided_at)
                ELSE json_object('v', 1, 'choice', CASE NEW.status WHEN 'approved' THEN 'approve' ELSE 'decline' END,
                                 'via', 'hub', 'at', NEW.decided_at, 'text', NEW.decided_note)
           END),
         question_consumed_json = json_object('v', 1, 'consumer', 'project_join', 'at', NEW.decided_at,
           'answer_at', COALESCE(json_extract(question_answer_json, '$.at'), NEW.decided_at),
           'evidence', 'project_join_requests ' || NEW.id || ': ' || NEW.status || ' by ' || NEW.decided_by),
         status = 'done', completed = 1, completed_at = NEW.decided_at, completed_by = NEW.decided_by,
         updated_at = datetime('now')
   WHERE id = NEW.question_task_id
     AND deleted_at IS NULL
     AND status IS NOT 'done' AND status IS NOT 'deleted';
END;

-- The question row: Nick's alone, no project, nobody else named, tied to a
-- pending request. The requester can never read it (taskRule shows a
-- project-less task only to the people it names), so they can never answer it.
CREATE TRIGGER IF NOT EXISTS trg_tasks_project_join_ins BEFORE INSERT ON tasks
FOR EACH ROW
WHEN NEW.source IS 'project_join'
BEGIN
  SELECT RAISE(ABORT, 'project_join_question_shape: a project_join task is a question for nick-ingraham alone, with no project, tied to a pending request by someone else')
   WHERE NOT (
     NEW.kind IS 'question'
     AND NEW.project_id IS NULL
     AND NEW.assignee IS 'nick-ingraham'
     AND NEW.assigned_by IS NULL
     AND COALESCE(NEW.watchers, '') IN ('', '[]')
     AND EXISTS (SELECT 1 FROM project_join_requests r
                  WHERE r.question_task_id = NEW.id AND r.status = 'pending'
                    AND r.requester_slug <> 'nick-ingraham')
   );
END;

-- ... and it stays that way: no re-pointing it at someone else or a project.
CREATE TRIGGER IF NOT EXISTS trg_tasks_project_join_upd BEFORE UPDATE ON tasks
FOR EACH ROW
WHEN (OLD.source IS 'project_join' OR NEW.source IS 'project_join')
 AND (NEW.source IS NOT OLD.source OR NEW.kind IS NOT OLD.kind OR NEW.assignee IS NOT OLD.assignee
      OR NEW.assigned_by IS NOT OLD.assigned_by OR NEW.watchers IS NOT OLD.watchers
      OR NEW.project_id IS NOT OLD.project_id)
BEGIN
  SELECT RAISE(ABORT, 'project_join_question_identity: a project_join question keeps its source, kind, assignee, assigned_by, watchers and project');
END;

-- Once answered, the answer is the decision: no undo, no second tap.
CREATE TRIGGER IF NOT EXISTS trg_tasks_project_join_answer_frozen BEFORE UPDATE OF question_answer_json ON tasks
FOR EACH ROW
WHEN OLD.source IS 'project_join'
 AND OLD.question_answer_json IS NOT NULL
 AND NEW.question_answer_json IS NOT OLD.question_answer_json
BEGIN
  SELECT RAISE(ABORT, 'question_answer_frozen: this join request was already decided');
END;

-- An answer on the question (Telegram, or Nick's own Hub write) decides the
-- request. 'approve' approves; 'decline' and 'other' decline, the text as the note.
CREATE TRIGGER IF NOT EXISTS trg_tasks_project_join_answered AFTER UPDATE OF question_answer_json ON tasks
FOR EACH ROW
WHEN NEW.source IS 'project_join'
 AND OLD.question_answer_json IS NULL
 AND NEW.question_answer_json IS NOT NULL
BEGIN
  UPDATE project_join_requests
     SET status = CASE json_extract(NEW.question_answer_json, '$.choice') WHEN 'approve' THEN 'approved' ELSE 'declined' END,
         decided_by = NEW.assignee,
         decided_via = CASE json_extract(NEW.question_answer_json, '$.via') WHEN 'telegram' THEN 'telegram' ELSE 'hub' END,
         decided_note = NULLIF(substr(trim(COALESCE(json_extract(NEW.question_answer_json, '$.text'), '')), 1, 500), ''),
         decided_at = COALESCE(NULLIF(json_extract(NEW.question_answer_json, '$.at'), ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   WHERE question_task_id = NEW.id AND status = 'pending';
END;

-- Self-registration: must stay the LAST statement (v105 ledger epoch).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (139, 'schema-v139-project-join-requests.sql');

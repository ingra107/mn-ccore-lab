-- schema-v139-project-join-requests.sql (2026-10-13)
--
-- Request to join a project, approved by Nick or Nate (#145 follow-up).
-- Nick, 2026-10-13: "members ... can request to get added to projects where I
-- can join say yes through a [Telegram] message or on my today page kind of
-- like slack where it's a channel so they have some visibility to those
-- channels and such but Nate and I need to approve that". His rulings: EITHER
-- Nick or Nate approves, the first approval adds the member; before joining a
-- member sees only the project's name, a one-line description and its PI.
-- Review rulings (same day): Browse lists "All but Friends + a hide switch";
-- a Telegram 'Other' "Stays pending" (a note for the approvers, not a decision).
--
-- WHY THE DATABASE DOES THE WORK. #145 put visibility below the routes
-- (api/lib/viewer-db.ts) and made membership grow by trigger (schema-v120:
-- "membership follows the data, not the caller"). Nate is not a member of most
-- projects and has no "show all projects" switch, so POST
-- /api/projects/:id/members answers him 404 there. An approval therefore cannot
-- go through that route; it is a trigger here, whichever surface decided.
--
-- WHAT THIS FILE ADDS
--   project_listing         per project, Hub-only: the one-line description
--                           (starts empty, never derived from the internal
--                           description) and the "hidden from Browse" switch,
--                           which only Nick or the project's PI may set. Not
--                           columns on `projects`: a projects column would have
--                           to join the PB wire (TABLE_FIELDS, pb-schema) to be
--                           writable, and PB never needs these.
--   project_directory       a VIEW with exactly six columns. It is the only
--                           thing a non-member can read about a project. A
--                           view's body reads the real tables, not the viewer's
--                           filtered copies, which is the point; its column list
--                           is the whole contract (there is no description,
--                           task or file column to select through it).
--                           table-scope.test.ts pins the column list. Listed:
--                           live, active or waiting, not Peripheral Brain, not
--                           type 'Friends', not hidden.
--   project_join_requests   one row per ask. At most one pending per (project,
--                           person); after a decline, one new ask per 7 days.
--                           Decided once. Only nick-ingraham or nate-mesfin may
--                           decide (CHECK), never the requester (CHECK). TS
--                           mirrors the list as JOIN_APPROVER_SLUGS
--                           (shared/joinApprovers.ts); a contract test reads this
--                           file and checks the two agree. 'expired' closes a
--                           request whose project left the directory.
--   project_join_notes      an approver's note on a pending request (a Telegram
--                           'Other'). Read by Nick and Nate only (table-scope);
--                           never shown or sent to the requester.
--   triggers                guards; the approvers' bell (each approver other
--                           than the requester gets a notification linking to
--                           Today, marked read once the request is closed; Nick
--                           ruled "Bell notification too" for Nate, who has no
--                           Telegram); and the decision's effects (member row,
--                           notification, Nick's Telegram question closed with a
--                           consumer receipt) in the same transaction.
--
-- THE TWO WAYS A REQUEST IS DECIDED
--   Hub (Nick or Nate, Today's JoinRequestsCard): the route UPDATEs the request.
--   Telegram (Nick only; Nate has no Telegram): the route minted a kind='question'
--     task (source 'project_join', assignee nick-ingraham, no project, nobody
--     else named, so the requester can never see or answer it), tied to the
--     request by choices[0].payload.request_id. PB's listener sends a card for
--     every question row. Approve or Decline decides. 'Other' with text is NOT a
--     decision: the text becomes a project_join_notes row and the answer is
--     cleared in the same write, so the question stays open and its Telegram
--     card keeps its buttons; Nick can still decide from Telegram or Today.
--   Either way trg_pjr_decided runs once: adds the member ('join:<decider>'),
--   notifies the requester, and closes the question with an answer naming who
--   decided ("by Nate Mesfin") and a receipt {consumer:'project_join'} (PB
--   enums QUESTION_CONSUMERS carries it), so Nick's card converges to it.
--
-- RECURSION. D1 may run with recursive_triggers on. Nothing here can re-enter:
-- the answered trigger fires only when the OLD answer is NULL, the close keeps
-- an existing answer as-is (COALESCE), the 'Other' clear writes NULL (which the
-- answered trigger ignores), and the decided trigger fires only when the OLD
-- status is 'pending'. Tests run the chain with the pragma both ways.
--
-- ORDER: this DDL (test, then prod), then `npm run deploy:pages:gated`. The code
-- live before the deploy never names these objects, and the tasks triggers fire
-- only on source='project_join' rows, which no older writer produces. PB's enum
-- line (QUESTION_CONSUMERS += 'project_join') must be on HOME before the first
-- request is decided, or PB's question_state reads the closed row as `anomaly`
-- (loud, harmless). Lands after schema-v138 (wave/1013-issues).
--
-- APPLY (test first, then prod; sanctioned wrapper only):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v139-project-join-requests.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v139-project-join-requests.sql
-- READ-BACK (must return exactly these 21 rows: 3 tables, 1 view, 4 indexes,
-- 13 triggers):
--   SELECT type, name FROM sqlite_master WHERE name IN (
--     'project_listing', 'project_join_requests', 'project_join_notes',
--     'project_directory',
--     'idx_pjr_one_pending', 'idx_pjr_requester', 'idx_pjr_status', 'idx_tasks_project_join_request',
--     'trg_project_listing_hide_ins', 'trg_project_listing_hide_upd', 'trg_pjn_approver_only',
--     'trg_pjr_guard_ins', 'trg_pjr_notify_approvers', 'trg_pjr_identity_frozen', 'trg_pjr_decided_once',
--     'trg_pjr_approve_listed', 'trg_pjr_decided',
--     'trg_tasks_project_join_ins', 'trg_tasks_project_join_upd',
--     'trg_tasks_project_join_answer_frozen', 'trg_tasks_project_join_answered'
--   ) ORDER BY type, name;
-- ROLLBACK (redeploy the previous Pages build first; the objects are inert
-- without the routes):
--   DROP TRIGGER IF EXISTS trg_tasks_project_join_answered;
--   DROP TRIGGER IF EXISTS trg_tasks_project_join_answer_frozen;
--   DROP TRIGGER IF EXISTS trg_tasks_project_join_upd;
--   DROP TRIGGER IF EXISTS trg_tasks_project_join_ins;
--   DROP INDEX IF EXISTS idx_tasks_project_join_request;
--   DROP TRIGGER IF EXISTS trg_pjr_decided;
--   DROP TRIGGER IF EXISTS trg_pjr_approve_listed;
--   DROP TRIGGER IF EXISTS trg_pjr_decided_once;
--   DROP TRIGGER IF EXISTS trg_pjr_identity_frozen;
--   DROP TRIGGER IF EXISTS trg_pjr_notify_approvers;
--   DROP TRIGGER IF EXISTS trg_pjr_guard_ins;
--   DROP TRIGGER IF EXISTS trg_pjn_approver_only;
--   DROP TRIGGER IF EXISTS trg_project_listing_hide_upd;
--   DROP TRIGGER IF EXISTS trg_project_listing_hide_ins;
--   DROP TABLE IF EXISTS project_join_notes;      -- export it first
--   DROP TABLE IF EXISTS project_join_requests;   -- export it first (drops its indexes)
--   DROP VIEW IF EXISTS project_directory;
--   DROP TABLE IF EXISTS project_listing;         -- export it first
--   DELETE FROM schema_migrations WHERE version = 139;
-- Members added by approval stay, tagged added_by LIKE 'join:%'. Open join
-- questions: retire with op=delete (source='project_join').

CREATE TABLE IF NOT EXISTS project_listing (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  -- One line: 1..140 characters, no line break, not blank. NULL = none yet.
  blurb      TEXT CHECK (blurb IS NULL OR (
    length(blurb) BETWEEN 1 AND 140
    AND length(trim(blurb)) > 0
    AND instr(blurb, char(10)) = 0
    AND instr(blurb, char(13)) = 0
  )),
  -- 1 = not listed in Browse. Set only by Nick or the project's PI (triggers below).
  hidden     INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  hidden_by  TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (hidden = 0 OR hidden_by IS NOT NULL)
);

CREATE TRIGGER IF NOT EXISTS trg_project_listing_hide_ins BEFORE INSERT ON project_listing
FOR EACH ROW
WHEN NEW.hidden_by IS NOT NULL
 AND NEW.hidden_by IS NOT 'nick-ingraham'
 AND NEW.hidden_by IS NOT (SELECT p.pi FROM projects p WHERE p.id = NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'listing_hide_forbidden: only Nick or the project''s PI may hide or show a project in Browse');
END;

CREATE TRIGGER IF NOT EXISTS trg_project_listing_hide_upd BEFORE UPDATE ON project_listing
FOR EACH ROW
WHEN (NEW.hidden IS NOT OLD.hidden OR NEW.hidden_by IS NOT OLD.hidden_by)
 AND NEW.hidden_by IS NOT 'nick-ingraham'
 AND NEW.hidden_by IS NOT (SELECT p.pi FROM projects p WHERE p.id = NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'listing_hide_forbidden: only Nick or the project''s PI may hide or show a project in Browse');
END;

CREATE VIEW IF NOT EXISTS project_directory AS
SELECT p.id                                               AS project_id,
       COALESCE(NULLIF(trim(p.short_name), ''), p.title)  AS name,
       l.blurb                                            AS blurb,
       p.pi                                               AS pi_slug,
       COALESCE(NULLIF(trim(tm.preferred_name), ''), tm.name) AS pi_name,
       tm.photo_url                                       AS pi_photo
  FROM projects p
  LEFT JOIN project_listing l ON l.project_id = p.id
  LEFT JOIN team_members tm ON tm.slug = p.pi
 WHERE p.deleted_at IS NULL
   AND COALESCE(p.category, '') <> 'Peripheral Brain'
   AND COALESCE(p.type, '') <> 'Friends'
   AND COALESCE(l.hidden, 0) = 0
   AND lower(COALESCE(p.status, '')) IN ('active', 'waiting_external');

CREATE TABLE IF NOT EXISTS project_join_requests (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  requester_slug   TEXT NOT NULL REFERENCES team_members(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  note             TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 280),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
  decided_by       TEXT REFERENCES team_members(slug) ON UPDATE CASCADE,
  decided_via      TEXT CHECK (decided_via IS NULL OR decided_via IN ('hub', 'telegram')),
  decided_note     TEXT CHECK (decided_note IS NULL OR length(decided_note) BETWEEN 1 AND 500),
  decided_at       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Pending <=> not closed; approved/declined <=> someone decided (expired: nobody did).
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  CHECK ((status IN ('approved', 'declined')) = (decided_by IS NOT NULL)),
  CHECK (status <> 'pending' OR (decided_via IS NULL AND decided_note IS NULL)),
  -- The approvers, by name (Nick's ruling): not a role, so a third director is not one.
  CHECK (decided_by IS NULL OR decided_by IN ('nick-ingraham', 'nate-mesfin')),
  -- Nobody decides their own request.
  CHECK (decided_by IS NULL OR decided_by <> requester_slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pjr_one_pending
  ON project_join_requests(project_id, requester_slug) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pjr_requester ON project_join_requests(requester_slug, created_at);
CREATE INDEX IF NOT EXISTS idx_pjr_status ON project_join_requests(status, created_at);

-- An approver's note on a request (a Telegram 'Other'). Approvers only.
CREATE TABLE IF NOT EXISTS project_join_notes (
  request_id TEXT PRIMARY KEY REFERENCES project_join_requests(id) ON DELETE CASCADE,
  note       TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 500),
  note_by    TEXT NOT NULL,
  note_at    TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_pjn_approver_only BEFORE INSERT ON project_join_notes
FOR EACH ROW
WHEN NEW.note_by NOT IN ('nick-ingraham', 'nate-mesfin')
BEGIN
  SELECT RAISE(ABORT, 'join_note_forbidden: only Nick or Nate leave a note on a request');
END;

-- A request is born pending, for a listed project, by someone not already on
-- it, and not within 7 days of a decline of the same ask.
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
  SELECT RAISE(ABORT, 'join_too_soon: one new request per 7 days after a decline')
   WHERE EXISTS (SELECT 1 FROM project_join_requests r
                  WHERE r.project_id = NEW.project_id AND r.requester_slug = NEW.requester_slug
                    AND r.status = 'declined'
                    AND julianday(r.decided_at) > julianday('now', '-7 days'));
END;

-- The approvers' bell: one notification per approver other than the requester,
-- linking to Today, where JoinRequestsCard holds the Approve and Decline
-- buttons. Written here, like every other join notification, so no writer can
-- create a request without it. trg_pjr_decided marks them read on close.
CREATE TRIGGER IF NOT EXISTS trg_pjr_notify_approvers AFTER INSERT ON project_join_requests
FOR EACH ROW
BEGIN
  INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link)
  SELECT 'ntf_pjq_' || NEW.id || '_' || a.slug, a.slug, 'update', 'project_join', NEW.id,
         COALESCE((SELECT COALESCE(NULLIF(trim(tm.preferred_name), ''), tm.name)
                     FROM team_members tm WHERE tm.slug = NEW.requester_slug), NEW.requester_slug)
         || ' asks to join ' || COALESCE(NULLIF(trim(p.short_name), ''), p.title),
         NEW.note,
         '/portal/dashboard'
    FROM (SELECT 'nick-ingraham' AS slug UNION ALL SELECT 'nate-mesfin') a
    JOIN projects p ON p.id = NEW.project_id
   WHERE a.slug <> NEW.requester_slug
     AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.slug = a.slug);
END;

-- What was asked never changes. project_id and requester_slug are left out on
-- purpose: their foreign keys cascade a renamed id or slug.
CREATE TRIGGER IF NOT EXISTS trg_pjr_identity_frozen BEFORE UPDATE ON project_join_requests
FOR EACH ROW
WHEN NEW.id IS NOT OLD.id OR NEW.note IS NOT OLD.note OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'join_request_immutable: a join request''s id, note and created_at never change');
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

-- Nobody joins a project that left the directory (done, blocked, Peripheral
-- Brain, Friends, hidden, deleted). The writers expire such a request instead.
CREATE TRIGGER IF NOT EXISTS trg_pjr_approve_listed BEFORE UPDATE OF status ON project_join_requests
FOR EACH ROW
WHEN NEW.status = 'approved' AND OLD.status = 'pending'
 AND NOT EXISTS (SELECT 1 FROM project_directory d WHERE d.project_id = NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'join_not_listed: the project left the directory; the request can only be closed');
END;

-- The decision's effects, in the same transaction as the decision.
CREATE TRIGGER IF NOT EXISTS trg_pjr_decided AFTER UPDATE OF status ON project_join_requests
FOR EACH ROW
WHEN OLD.status = 'pending' AND NEW.status IN ('approved', 'declined', 'expired')
BEGIN
  UPDATE notifications
     SET read = 1, read_at = COALESCE(read_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   WHERE source_type = 'project_join' AND source_id = NEW.id
     AND id LIKE 'ntf_pjq_%' AND read = 0;

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
           WHEN 'declined' THEN 'Your request to join ' || COALESCE(NULLIF(trim(p.short_name), ''), p.title) || ' was declined'
           ELSE 'Your request to join ' || COALESCE(NULLIF(trim(p.short_name), ''), p.title) || ' was closed'
         END,
         CASE
           WHEN NEW.status = 'expired' THEN 'The project is no longer open to requests'
           WHEN NEW.decided_note IS NOT NULL THEN NEW.decided_note
           ELSE CASE NEW.status WHEN 'approved' THEN 'Approved by ' ELSE 'Declined by ' END
                || COALESCE((SELECT COALESCE(NULLIF(trim(tm.preferred_name), ''), tm.name)
                               FROM team_members tm WHERE tm.slug = NEW.decided_by), NEW.decided_by)
         END,
         CASE NEW.status
           WHEN 'approved' THEN '/portal/projects/' || COALESCE(NULLIF(p.slug, ''), p.id)
           ELSE '/portal/projects?view=browse'
         END
    FROM projects p WHERE p.id = NEW.project_id;

  -- Close Nick's question. Its answer names who decided, so his Telegram card
  -- reads "Approve -- by Nate Mesfin" when Nate decided on Today.
  UPDATE tasks
     SET question_answer_json = COALESCE(question_answer_json,
           CASE NEW.status
             WHEN 'expired' THEN json_object('v', 1, 'choice', 'other', 'via', 'hub', 'at', NEW.decided_at,
                                             'text', 'Closed: the project is no longer open to requests')
             ELSE json_object('v', 1, 'choice', CASE NEW.status WHEN 'approved' THEN 'approve' ELSE 'decline' END,
                              'via', 'hub', 'at', NEW.decided_at,
                              'text', 'by ' || COALESCE((SELECT COALESCE(NULLIF(trim(tm.preferred_name), ''), tm.name)
                                                            FROM team_members tm WHERE tm.slug = NEW.decided_by), NEW.decided_by)
                                      || COALESCE(': ' || NEW.decided_note, ''))
           END),
         question_consumed_json = json_object('v', 1, 'consumer', 'project_join', 'at', NEW.decided_at,
           'answer_at', COALESCE(json_extract(question_answer_json, '$.at'), NEW.decided_at),
           'evidence', 'project_join_requests ' || NEW.id || ': ' || NEW.status
                       || COALESCE(' by ' || NEW.decided_by, '')),
         status = 'done', completed = 1, completed_at = NEW.decided_at,
         completed_by = COALESCE(NEW.decided_by, 'project_join'),
         updated_at = datetime('now')
   WHERE kind = 'question' AND source = 'project_join'
     AND json_extract(question_spec_json, '$.choices[0].payload.request_id') = NEW.id
     AND deleted_at IS NULL
     AND status IS NOT 'done' AND status IS NOT 'deleted';
END;

-- One live question per request; the triggers find it by this key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_project_join_request
  ON tasks(json_extract(question_spec_json, '$.choices[0].payload.request_id'))
  WHERE source = 'project_join' AND deleted_at IS NULL;

-- The question row: Nick's alone, no project, nobody else named, tied to a
-- pending request by someone else. The requester can never read it (taskRule
-- shows a project-less task only to the people it names), so never answer it.
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
                  WHERE r.id = json_extract(NEW.question_spec_json, '$.choices[0].payload.request_id')
                    AND r.status = 'pending'
                    AND r.requester_slug <> 'nick-ingraham')
   );
END;

-- ... and it stays that way: no re-pointing it at someone, a project or another request.
CREATE TRIGGER IF NOT EXISTS trg_tasks_project_join_upd BEFORE UPDATE ON tasks
FOR EACH ROW
WHEN (OLD.source IS 'project_join' OR NEW.source IS 'project_join')
 AND (NEW.source IS NOT OLD.source OR NEW.kind IS NOT OLD.kind OR NEW.assignee IS NOT OLD.assignee
      OR NEW.assigned_by IS NOT OLD.assigned_by OR NEW.watchers IS NOT OLD.watchers
      OR NEW.project_id IS NOT OLD.project_id OR NEW.question_spec_json IS NOT OLD.question_spec_json)
BEGIN
  SELECT RAISE(ABORT, 'project_join_question_identity: a project_join question keeps its source, kind, assignee, assigned_by, watchers, project and spec');
END;

-- Approve or Decline IS the decision, and a closed question is closed: no undo,
-- no second tap. An 'Other' note is not a decision and never stays stored.
CREATE TRIGGER IF NOT EXISTS trg_tasks_project_join_answer_frozen BEFORE UPDATE OF question_answer_json ON tasks
FOR EACH ROW
WHEN OLD.source IS 'project_join'
 AND OLD.question_answer_json IS NOT NULL
 AND (json_extract(OLD.question_answer_json, '$.choice') IN ('approve', 'decline') OR OLD.status IS 'done')
 AND NEW.question_answer_json IS NOT OLD.question_answer_json
 -- The single exception: trg_tasks_project_join_answered rewriting a Telegram
 -- Approve on a project that left the directory into the "Closed" answer, while
 -- the request is still pending, so Nick's card says closed, not approved.
 AND NOT (
   json_extract(OLD.question_answer_json, '$.choice') = 'approve'
   AND OLD.status IS NOT 'done'
   AND json_extract(NEW.question_answer_json, '$.choice') = 'other'
   AND json_extract(NEW.question_answer_json, '$.text') = 'Closed: the project is no longer open to requests'
   AND EXISTS (SELECT 1 FROM project_join_requests r
                WHERE r.id = json_extract(OLD.question_spec_json, '$.choices[0].payload.request_id')
                  AND r.status = 'pending'
                  AND NOT EXISTS (SELECT 1 FROM project_directory d WHERE d.project_id = r.project_id))
 )
BEGIN
  SELECT RAISE(ABORT, 'question_answer_frozen: this join request was already decided');
END;

-- An answer on the question (a Telegram tap, or Nick's own Hub write):
--   approve -> approved; if the project left the directory, expired, and the
--              answer is rewritten to "Closed" so Nick's card says so;
--   decline -> declined, its text the note to the requester;
--   other   -> the request stays pending; the text becomes the approvers' note
--              and the answer is cleared, so the question stays open.
CREATE TRIGGER IF NOT EXISTS trg_tasks_project_join_answered AFTER UPDATE OF question_answer_json ON tasks
FOR EACH ROW
WHEN NEW.source IS 'project_join'
 AND OLD.question_answer_json IS NULL
 AND NEW.question_answer_json IS NOT NULL
BEGIN
  UPDATE tasks
     SET question_answer_json = json_object('v', 1, 'choice', 'other',
           'via', COALESCE(json_extract(NEW.question_answer_json, '$.via'), 'hub'),
           'at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           'text', 'Closed: the project is no longer open to requests')
   WHERE id = NEW.id
     AND json_extract(NEW.question_answer_json, '$.choice') = 'approve'
     AND EXISTS (SELECT 1 FROM project_join_requests r
                  WHERE r.id = json_extract(NEW.question_spec_json, '$.choices[0].payload.request_id')
                    AND r.status = 'pending'
                    AND NOT EXISTS (SELECT 1 FROM project_directory d WHERE d.project_id = r.project_id));

  UPDATE project_join_requests
     SET status = CASE
                    WHEN json_extract(NEW.question_answer_json, '$.choice') = 'decline' THEN 'declined'
                    WHEN EXISTS (SELECT 1 FROM project_directory d WHERE d.project_id = project_join_requests.project_id) THEN 'approved'
                    ELSE 'expired'
                  END,
         decided_by = CASE
                        WHEN json_extract(NEW.question_answer_json, '$.choice') = 'decline'
                          OR EXISTS (SELECT 1 FROM project_directory d WHERE d.project_id = project_join_requests.project_id)
                        THEN NEW.assignee
                      END,
         decided_via = CASE json_extract(NEW.question_answer_json, '$.via') WHEN 'telegram' THEN 'telegram' ELSE 'hub' END,
         decided_note = CASE WHEN json_extract(NEW.question_answer_json, '$.choice') = 'decline'
                             THEN NULLIF(substr(trim(COALESCE(json_extract(NEW.question_answer_json, '$.text'), '')), 1, 500), '')
                        END,
         decided_at = COALESCE(NULLIF(json_extract(NEW.question_answer_json, '$.at'), ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   WHERE id = json_extract(NEW.question_spec_json, '$.choices[0].payload.request_id')
     AND status = 'pending'
     AND json_extract(NEW.question_answer_json, '$.choice') IN ('approve', 'decline');

  INSERT OR REPLACE INTO project_join_notes (request_id, note, note_by, note_at)
  SELECT r.id, substr(trim(json_extract(NEW.question_answer_json, '$.text')), 1, 500), NEW.assignee,
         COALESCE(NULLIF(json_extract(NEW.question_answer_json, '$.at'), ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    FROM project_join_requests r
   WHERE r.id = json_extract(NEW.question_spec_json, '$.choices[0].payload.request_id')
     AND r.status = 'pending'
     AND json_extract(NEW.question_answer_json, '$.choice') NOT IN ('approve', 'decline')
     AND length(trim(COALESCE(json_extract(NEW.question_answer_json, '$.text'), ''))) > 0;

  UPDATE tasks SET question_answer_json = NULL
   WHERE id = NEW.id
     AND json_extract(NEW.question_answer_json, '$.choice') NOT IN ('approve', 'decline')
     AND EXISTS (SELECT 1 FROM project_join_requests r
                  WHERE r.id = json_extract(NEW.question_spec_json, '$.choices[0].payload.request_id')
                    AND r.status = 'pending');
END;

-- Self-registration: must stay the LAST statement (v105 ledger epoch).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (139, 'schema-v139-project-join-requests.sql');

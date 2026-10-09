-- schema-v122-meeting-access.sql (2026-10-09, meeting access)
--
-- Who may see a meeting, as data. Nick's rulings, 2026-10-09 (verbatim in PB
-- Context/Decisions/2026-10-09-hub-meeting-access.md):
--   - Lab series are set by title: MNCCORE biweekly, Pulmonary HSR group, AND
--     CLIF WG weekly. Owner + Nick may flip a meeting between private and lab.
--   - A project's access to a meeting is an explicit "belongs to" grant, chosen
--     by Nick (or the owner) on the meeting page; none by default; nothing
--     automated writes it. meetings.tags stays "projects DISCUSSED" (schema-v72).
--   - No PI or admin arm in the meeting rule (the read rule is code:
--     api/lib/table-scope.ts meetingRule).
-- Plus the cross-device "seen" record for a thread's New tag (Nick: fold into
-- this schema window).
--
-- 1. meetings.audience: 'private' | 'lab'. CHECK + NOT NULL DEFAULT, so no
--    other value can be stored and every row the old Worker writes during the
--    deploy window is 'private' (the window sweep reclassifies lab titles).
-- 2. idx_meetings_lab_date_title: two LAB rows of one title on one day are
--    unrepresentable (a member's Prep press and Nick's debrief push of the same
--    series meeting land on one row; upsertMeeting retries onto it on a race).
--    Partial expression index, the schema-v113 form D1 already runs in prod.
-- 3. meeting_project_grants: the "belongs to" set. Typed FKs: a grant can only
--    name a real meeting and a real project id (never a slug, so the
--    slug-squat class that held the old tag arm off cannot be stored).
--    granted_by is a member slug, no FK (project_members.added_by's reason).
-- 4. activity_thread_seen: per viewer, per thread root, how far the viewer has
--    read (the newest reply's timestamp they have seen). Replaces the browser's
--    localStorage marker in src/components/activity/useThreadNew.ts so "New"
--    agrees across devices. Typed FKs; CASCADE both ways (a seen row has no
--    value without its thread or its reader).
--
-- FUTURE HAZARD: meetings and activity_entries are now FK parents. A table
-- rebuild of either (CREATE new / copy / DROP old / rename) must carry these
-- child rows across, or D1's FK enforcement refuses the DROP.
--
-- PRE-CHECKS (prod, read-only):
--   a) v121 applied and v122 not:
--      SELECT version FROM schema_migrations WHERE version IN (121, 122);   -- expect one row: 121
--   b) the names are free:
--      SELECT name FROM sqlite_master WHERE name IN ('meeting_project_grants',
--        'activity_thread_seen', 'idx_meetings_lab_date_title');            -- expect 0 rows
--      SELECT COUNT(*) FROM pragma_table_info('meetings') WHERE name = 'audience';  -- expect 0
--   c) the FK parents are unique keys: team_members.slug is UNIQUE (bootstrap
--      schema), meetings.id / projects.id / activity_entries.id are PKs.
--   The unique index cannot fail at DDL time: every row is 'private' until the
--   backfill runs.
--
-- PRE-IMAGE: Time-Travel bookmark before the DDL; then, right before the
-- backfill (a D1 --file run is not atomic, so generate from a fresh export):
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
--     --command "SELECT id, date, title, owner_slug, source_id, created_at, audience, attendees FROM meetings ORDER BY id" > pre-meetings.json
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
--     --command "SELECT slug, email FROM team_members WHERE slug IS NOT NULL ORDER BY slug" > pre-team.json
--
-- ORDER: this DDL (test, then prod) -> audience backfill (scripts/backfill-122-meetings-audience.ts)
-- -> npm run deploy:pages:gated -> npm run deploy:worker -> window sweep (same
-- script, --window-start <DDL time>). Grants backfill: none (default = no grant).
--
-- APPLY (test first, then prod; sanctioned wrapper only):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v122-meeting-access.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v122-meeting-access.sql
-- ROLLBACK (after the code rollback and the generated audience rollback; a
-- dropped table loses its rows, so export them first:
--   SELECT * FROM meeting_project_grants; SELECT * FROM activity_thread_seen;):
--   DROP TABLE IF EXISTS activity_thread_seen;
--   DROP TABLE IF EXISTS meeting_project_grants;
--   DROP INDEX IF EXISTS idx_meetings_lab_date_title;
--   ALTER TABLE meetings DROP COLUMN audience;
--   DELETE FROM schema_migrations WHERE version = 122;

ALTER TABLE meetings ADD COLUMN audience TEXT NOT NULL DEFAULT 'private'
  CHECK (audience IN ('private', 'lab'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_lab_date_title
  ON meetings(date, lower(trim(title))) WHERE audience = 'lab';

CREATE TABLE IF NOT EXISTS meeting_project_grants (
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON UPDATE CASCADE ON DELETE CASCADE,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  granted_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (meeting_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_project_grants_project
  ON meeting_project_grants(project_id, meeting_id);

CREATE TABLE IF NOT EXISTS activity_thread_seen (
  root_id      TEXT NOT NULL REFERENCES activity_entries(id) ON UPDATE CASCADE ON DELETE CASCADE,
  viewer_slug  TEXT NOT NULL REFERENCES team_members(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  read_up_to   TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (root_id, viewer_slug)
);

CREATE INDEX IF NOT EXISTS idx_activity_thread_seen_viewer
  ON activity_thread_seen(viewer_slug, root_id);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (122, 'schema-v122-meeting-access.sql');

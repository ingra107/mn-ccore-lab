-- v148: hub_releases + hub_announcements, the What's new / Lab pulse pill (#156).
--
-- The top-bar pill showed one hand-written release from 2026-04-20. Nick, 2026-10-26:
-- releases are drafted at deploy (scripts/post-release-draft.mjs opens or extends the
-- ONE pending draft), the shipping session writes plain-English blurbs, and Nick
-- approves in the panel; the Lab pulse tab carries his announcements.
-- Design: docs/superpowers/specs/2026-10-26-whats-new-lab-pulse-design.md
--
-- hub_releases.status: draft -> approved | discarded. A non-PI viewer reads only
-- 'approved' rows (api/lib/table-scope.ts). At most one draft (partial unique index).
-- commit_from/commit_to: the git range the release covers; commits_json the subjects.
--
-- APPLY (with or after the Worker that reads them; nothing reads them before):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v148-hub-releases-announcements.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v148-hub-releases-announcements.sql
-- ROLLBACK:
--   DROP TABLE IF EXISTS hub_releases; DROP TABLE IF EXISTS hub_announcements;

CREATE TABLE IF NOT EXISTS hub_releases (
  id           TEXT PRIMARY KEY,
  status       TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'discarded')),
  title        TEXT NOT NULL DEFAULT '',
  blurbs_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(blurbs_json)),
  commit_from  TEXT NOT NULL,
  commit_to    TEXT NOT NULL,
  commits_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(commits_json)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  approved_at  TEXT,
  approved_by  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS hub_releases_one_draft ON hub_releases(status) WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS hub_releases_approved ON hub_releases(status, approved_at);

CREATE TABLE IF NOT EXISTS hub_announcements (
  id          TEXT PRIMARY KEY,
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 280),
  author_slug TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS hub_announcements_live ON hub_announcements(deleted_at, created_at);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (148, 'schema-v148-hub-releases-announcements.sql');

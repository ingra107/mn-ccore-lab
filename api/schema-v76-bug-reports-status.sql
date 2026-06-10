-- schema-v76-bug-reports-status.sql (2026-06-10)
-- Bug Squasher: give bug reports a queryable, status-trackable D1 home.
--
-- Before this, POST /api/bug-report filed a GitHub Issue ONLY (api/routes/bug-report.ts)
-- — there was no `bug_reports` table at all. The Bug Squasher (scripts/bug-squasher.bat,
-- ⌘K "Bug Squasher") needs to LIST open bugs and MARK them resolved, which GitHub-only
-- storage can't serve to the Hub's own /api/* surface cleanly. This migration creates the
-- minimal table the squasher reads/writes; the POST handler now mirrors each report into it
-- (in addition to creating the GitHub Issue, which is unchanged).
--
-- Columns:
--   id           TEXT PK   'bug_<random>' minted in the handler.
--   description  TEXT      the reporter's text (NOT NULL — handler already 400s on empty).
--   page_url     TEXT      auto-captured route, nullable.
--   viewport     TEXT      auto-captured, nullable.
--   theme        TEXT      auto-captured (light|dark), nullable.
--   issue_number INTEGER   the GitHub Issue number, nullable (set when the issue create
--                          succeeds; a row can exist without one if GitHub is down).
--   issue_url    TEXT      the GitHub Issue html_url, nullable.
--   status       TEXT      'open' | 'resolved' | 'dismissed'. DEFAULT 'open'.
--   reporter     TEXT      authed-user email or 'anonymous', nullable.
--   created_at   TEXT      UTC instant 'YYYY-MM-DDTHH:MM:SS.sssZ'.
--   resolved_at  TEXT      UTC instant when status left 'open', nullable.
--
-- Purely additive (CREATE TABLE IF NOT EXISTS + one index). Reversible: DROP TABLE
-- bug_reports (no other table references it). D1 Time-Travel (30d) is the data backstop.
--
-- APPLY (test FIRST, probe, then prod) — sanctioned wrapper ONLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v76-bug-reports-status.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v76-bug-reports-status.sql

CREATE TABLE IF NOT EXISTS bug_reports (
  id            TEXT PRIMARY KEY,
  description   TEXT NOT NULL,
  page_url      TEXT,
  viewport      TEXT,
  theme         TEXT,
  issue_number  INTEGER,
  issue_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  reporter      TEXT,
  created_at    TEXT NOT NULL,
  resolved_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_status_created
  ON bug_reports (status, created_at DESC);

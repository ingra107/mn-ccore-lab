-- v54 (2026-04-28): per-author Google Scholar citation cache on team_members.
--
-- Decision: D2-followup (audit/2026-04-28/DECISIONS-RESOLVED.md). Lab Overview
-- StatsCard.totalCitations was hardcoded `2626`. Wire to real data.
--
-- Source-of-truth pipeline (PB-side, OUT OF SCOPE for this migration):
--   weekly cron on home laptop iterates `team_members WHERE scholar_id IS NOT NULL`,
--   uses `scholarly` Python library to fetch each author's Google Scholar profile,
--   writes citation_count + h_index + last_scholar_refresh back to D1 via
--   PUT /api/team/:slug.
--
-- Hub-side endpoint:
--   GET /api/citations returns SUM(citation_count) + MAX(last_scholar_refresh)
--   so the dashboard renders the lab-wide total + a "Updated N days ago" subtitle.
--
-- All three columns are nullable. NULL = "no scholarly fetch has run yet for
-- this author." A NULL on citation_count is excluded from the SUM (sqlite3
-- skips NULL in SUM by default), so partial-coverage states render correctly.
--
-- Cross-repo coordination: brain.db does NOT mirror citation_count / h_index /
-- last_scholar_refresh — these fields live only in D1. The PB cron writes via
-- the Hub API, not via brain.db sync. No enums.py / shared-schema-registry
-- update needed.
--
-- Additive. Safe to apply to production D1.

ALTER TABLE team_members ADD COLUMN citation_count INTEGER DEFAULT NULL;
ALTER TABLE team_members ADD COLUMN h_index INTEGER DEFAULT NULL;
ALTER TABLE team_members ADD COLUMN last_scholar_refresh TIMESTAMP DEFAULT NULL;

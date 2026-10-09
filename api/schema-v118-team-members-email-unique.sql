-- schema-v118-team-members-email-unique.sql (2026-10-08)
--
-- One login email, one team_members row.
--
-- WHY: membership is now a team_members row whose email matches the CF Access
-- login (the member gate, same day). Two rows on one address would make that
-- login resolve to whichever row was created first (resolveSlug orders by
-- auto_created, created_at), so the duplicate state must not exist. Until now
-- it was guarded in code at both write sites (POST /api/team 409 email_taken,
-- POST /api/team/:slug 409 on another row's address); this index makes it
-- unrepresentable, and closes the race between the 409 check and the INSERT.
-- Case-insensitive, to match every reader (lower(email) = lower(?)). NULL and
-- '' are left out: a row with no login is legal and there can be several.
--
-- PRE-CHECK (prod, read-only, 2026-10-08): 19 rows, 0 duplicate lower(email).
-- Re-run before applying; any row returned blocks the CREATE:
--   SELECT lower(email), COUNT(*) FROM team_members
--   WHERE email IS NOT NULL AND email != '' GROUP BY 1 HAVING COUNT(*) > 1;
--
-- ORDER: independent of the Worker. Old and new Workers never write a
-- duplicate on purpose; the old one's ensureTeamMember inserted only for an
-- email no row carried. Apply any time after the pre-check.
--
-- APPLY (test first, then prod; sanctioned wrapper only):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v118-team-members-email-unique.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v118-team-members-email-unique.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_email_lower
  ON team_members(lower(email))
  WHERE email IS NOT NULL AND email != '';

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (118, 'schema-v118-team-members-email-unique.sql');

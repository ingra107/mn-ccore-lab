-- v53 (2026-04-28): team_members.auto_created flag.
--
-- Drives auto-provisioning on first login: when a CF Access JWT arrives
-- carrying an email not in team_members, the auth middleware inserts a
-- row with the user's Google name + picture and marks auto_created = 1.
-- The Team page surfaces a "Pending review" badge so Nick (or whoever
-- manages the team directory) can fill in role / member_type / expertise
-- tags. Editing the role clears the flag.
--
-- Replaces CLAUDE.md Rule 24's three-step manual provisioning for new
-- members. The EMAIL_PREFIX_TO_SLUG LUT in api/helpers.ts remains the
-- canonical mapping for the existing 19 members; auto-created members
-- get slug = email-prefix and aren't added to the LUT.
--
-- Additive. Safe to apply to production D1.

ALTER TABLE team_members ADD COLUMN auto_created INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_team_members_auto_created
  ON team_members(auto_created)
  WHERE auto_created = 1;

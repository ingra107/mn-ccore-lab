-- 2026-04-19 late: fix Nick's real email + PI allowlist.
-- `ningraha@umn.edu` and `sandb029@umn.edu` aren't Nick's addresses —
-- they were guesses based on UMN NetID heuristics. Nick's real UMN is
-- `ingra107@umn.edu` per Peripheral-Brain/Context/contacts.md.

-- Fix Nick's team_members.email (was backfilled to slug@umn.edu in v43).
UPDATE team_members SET email = 'ingra107@umn.edu' WHERE slug = 'nick-ingraham';

-- Update lab_settings PI allowlist: drop the wrong addresses, add real UMN.
UPDATE lab_settings
SET value = '["ingra107@umn.edu","nicholas.ingraham@gmail.com"]', updated_at = datetime('now')
WHERE key = 'pi_emails';

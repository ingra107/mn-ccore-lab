-- v136: Research Digest reading state per person, and a note can become a task.
--
-- WHY. research_digest.status / saved_by (schema-v3, 2026-03-26) held ONE
-- status for the whole lab: when one member dismissed a paper it was dismissed
-- for everyone, and a dismiss wrote saved_by back to NULL, so nobody could
-- tell who did it. Nick, 2026-10-13: Save/Dismiss becomes per person.
--
-- 'new' is the ABSENCE of a row. There is no stored 'new' to drift (the CHECK
-- refuses it), and "reset to unread" is a DELETE.
--
-- ORDER (expand / contract): apply this file, deploy the Worker + Pages that
-- read digest_paper_state, verify on prod, THEN apply schema-v137 (drops the
-- lab-wide columns). The old Worker still writes research_digest.status during
-- the deploy window, so dropping it here would break saves in that window.
--
-- APPLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v136-digest-per-person-state-and-note-task.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v136-digest-per-person-state-and-note-task.sql
-- ROLLBACK (before v137; purely additive, old code ignores both):
--   DROP TABLE IF EXISTS digest_paper_state;
--   ALTER TABLE digest_comments DROP COLUMN task_id;
--   DELETE FROM schema_migrations WHERE version = 136;

CREATE TABLE IF NOT EXISTS digest_paper_state (
  paper_id    TEXT NOT NULL REFERENCES research_digest(id) ON DELETE CASCADE,
  member_slug TEXT NOT NULL REFERENCES team_members(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('saved', 'dismissed')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (paper_id, member_slug)
);

-- The Saved list across every digest date, newest first.
CREATE INDEX IF NOT EXISTS idx_digest_paper_state_member
  ON digest_paper_state(member_slug, status, updated_at DESC);

-- Carry today's lab-wide state to its owner. Prod on 2026-10-13: 2 saved (both
-- saved_by = ingra107@umn.edu) and 23 dismissed (saved_by NULL); every digest
-- action in activity_log is nick-ingraham's but one pre-login 'anonymous' row.
-- Owner = the last member who saved/dismissed it in activity_log, else the
-- member whose email is saved_by, else nick-ingraham (Nick was the only reader
-- before login existed). Timestamps are normalised to the table's ISO form.
INSERT OR IGNORE INTO digest_paper_state (paper_id, member_slug, status, updated_at)
SELECT rd.id,
  COALESCE(
    (SELECT al.actor FROM activity_log al
      WHERE al.related_type = 'digest' AND al.related_id = rd.id
        AND al.description IN ('Saved digest paper', 'Dismissed digest paper')
        AND al.actor IN (SELECT slug FROM team_members WHERE slug IS NOT NULL)
      ORDER BY al.timestamp DESC LIMIT 1),
    (SELECT tm.slug FROM team_members tm
      WHERE rd.saved_by IS NOT NULL AND lower(tm.email) = lower(rd.saved_by)
      LIMIT 1),
    'nick-ingraham'),
  rd.status,
  strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(
    (SELECT MAX(al.timestamp) FROM activity_log al
      WHERE al.related_type = 'digest' AND al.related_id = rd.id),
    rd.created_at,
    'now'))
FROM research_digest rd
WHERE rd.status IN ('saved', 'dismissed');

-- A note that became a task points at it, so the card shows the task instead
-- of offering "Make task" again. The Hub soft-deletes tasks (deleted_at), but
-- the test-DB fixture purges hard-delete them: ON DELETE SET NULL lets such a
-- purge through and frees the note, where a bare REFERENCES would refuse it.
ALTER TABLE digest_comments ADD COLUMN task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;

-- The card's newest-note lookup.
CREATE INDEX IF NOT EXISTS idx_digest_comments_paper_created
  ON digest_comments(paper_id, created_at DESC);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (136, 'schema-v136-digest-per-person-state-and-note-task.sql');

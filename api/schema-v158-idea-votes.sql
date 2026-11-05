-- schema-v158-idea-votes.sql (2026-11-05)
--
-- Ideas: one vote per person, with a toggle, and the voters' faces beside the count.
-- Until now a vote was `ideas.votes = votes + 1`, with no voter and no limit.
--
-- THE COUNT is now COUNT(*) of an idea's rows here (api/routes/ideas.ts).
--
-- EXISTING VOTES (6 across 4 of the 10 ideas on prod, 2026-11-05) have no voter. Each
-- becomes a row with a placeholder slug, legacy-vote-1, legacy-vote-2 and so on
-- (shared/ideaVotes.ts LEGACY_VOTE_PREFIX), so no idea's count changes. A placeholder
-- counts and draws no face, and nobody can remove it. No member slug starts that way.
--
-- ideas.votes stays, unread: the frozen count at this migration, and what the older
-- Worker reads if a deploy has to roll back. Nothing here changes it.
--
-- APPLY BEFORE the deploy that carries api/routes/ideas.ts: that Worker reads this
-- table on every /api/ideas call and answers 500 without it. Apply right before it,
-- since a vote cast on the old Worker in between raises ideas.votes and adds no row.
-- This file is safe to run again: re-running picks up exactly that gap, and only
-- adds rows while a count is short.
--
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v158-idea-votes.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v158-idea-votes.sql
--
-- CHECK, expect 0 rows:
--   SELECT i.id, i.votes FROM ideas i
--    WHERE COALESCE(i.votes, 0) <> (SELECT COUNT(*) FROM idea_votes v WHERE v.idea_id = i.id);
--
-- ROLLBACK: DROP TABLE idea_votes; and redeploy the older Worker. ideas.votes still
-- holds the old counts; votes cast in between are lost.

CREATE TABLE IF NOT EXISTS idea_votes (
  idea_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (idea_id, slug)
);

-- One placeholder per stored vote. INSERT OR IGNORE on the primary key keeps a re-run
-- from adding any row twice.
WITH RECURSIVE n(i) AS (
  SELECT 1
  UNION ALL
  SELECT i + 1 FROM n WHERE i < (SELECT COALESCE(MAX(votes), 0) FROM ideas)
)
INSERT OR IGNORE INTO idea_votes (idea_id, slug, created_at)
SELECT ideas.id, 'legacy-vote-' || n.i, ideas.created_at
  FROM ideas JOIN n ON n.i <= COALESCE(ideas.votes, 0);

-- Self-registration: this row is the proof that schema-v158 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (158, 'schema-v158-idea-votes.sql');

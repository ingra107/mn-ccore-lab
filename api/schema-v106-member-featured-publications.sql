-- schema-v106-member-featured-publications.sql (2026-08-01)
--
-- Per-member curated "Top-10 Featured Articles" (PB backlog #906, Nick's
-- 2026-07-23 spec: a member page shows ten articles THAT MEMBER CHOOSES,
-- above the recency-ordered "All Publications" rollup).
--
-- Wave 6 (9ee95b9b) shipped the frontend half of #906: recency rollups, the
-- lab-wide Featured section driven by the GLOBAL `publications.featured`
-- boolean, and the author-avatar stack. `featured` is one flag per paper for
-- the whole lab, so it cannot express "Dudley's ten" and "Chipman's ten" at
-- once. This table is the missing per-member axis, and nothing else about the
-- publications model changes: no `featured_by` JSON, no member-side id array,
-- no second publication table.
--
--   - PRIMARY KEY (member_slug, publication_id) makes "the same paper featured
--     twice by one member" UNREPRESENTABLE rather than guarded (ethos #15).
--     A re-add is a no-op under INSERT OR IGNORE; the writer replaces the whole
--     set instead, so it never needs one.
--   - sort_order is the MEMBER'S order, not a derived one. Nick decided
--     2026-08-01 that the member controls the sequence (the alternative --
--     display the chosen set by year DESC -- was the simpler design and was
--     rejected: "featured" is an editorial statement and the lead paper is
--     part of it). The writer assigns 0..N-1 from the submitted array index;
--     it is dense and gapless by construction, so nothing renumbers.
--   - The ten-item cap lives in the ROUTE (api/routes/member-featured-
--     publications.ts), not in a trigger. A CHECK/trigger cannot count sibling
--     rows cheaply in SQLite and would buy nothing the replace-set write does
--     not already give: the PUT rejects >10 before it writes anything.
--   - ON DELETE CASCADE on both FKs: retiring a team member or a publication
--     drops the feature rows with it. D1 does NOT enforce foreign keys unless
--     PRAGMA foreign_keys=ON is set per-connection, which this Worker does not
--     set (same caveat as schema-v104-artifact-tags.sql). So the FKs here are
--     schema INTENT + correctness-when-enabled; the PUT handler validates both
--     `team_members.slug` and every `publications.id` itself before inserting,
--     which is what actually prevents orphan rows today.
--   - No created_at / updated_at. This is a small mutable selection set that is
--     rewritten wholesale, not an append-only event log, so it has no retention
--     story to register (scripts/check-ledger-registry.py) and no timestamp a
--     reader would ever sort by.
--
-- Purely additive: no backfill, no column change on publications or
-- team_members. Hub-D1-local (this selection exists only in D1, never in
-- brain.db), so NO brain.db mirror and NO shared-schema-registry entry.
--
-- Rollback -- INDEX FIRST, and both IF EXISTS:
--   DROP INDEX IF EXISTS idx_mfp_member;
--   DROP TABLE IF EXISTS member_featured_publications;
--   (DROP TABLE also drops the table's indexes, so the reverse order errors on
--   statement 2 with "no such index" and leaves the rollback half-run -- the
--   v105 lesson. IF EXISTS on both makes either order safe.)
--   Safe to run: nothing reads this table except the two routes this change
--   adds, and the GET degrades to "no Featured section" when it returns empty.
--
-- Apply (NOT executed by this commit -- prod D1 DDL needs its own named
-- authorization; the schema file must NOT land before the DDL does):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v106-member-featured-publications.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v106-member-featured-publications.sql

CREATE TABLE IF NOT EXISTS member_featured_publications (
  member_slug    TEXT NOT NULL
    REFERENCES team_members(slug)
    ON UPDATE CASCADE ON DELETE CASCADE,
  publication_id TEXT NOT NULL
    REFERENCES publications(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (member_slug, publication_id)
);

-- Covers the only read: one member's list, already in display order.
CREATE INDEX IF NOT EXISTS idx_mfp_member
  ON member_featured_publications(member_slug, sort_order);

-- Self-registration: this row is the proof that schema-v106 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (106, 'schema-v106-member-featured-publications.sql');

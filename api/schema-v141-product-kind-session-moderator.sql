-- schema-v141-product-kind-session-moderator.sql (2026-10-19)
--
-- A 9th product kind: session_moderator. Data only, like v125's honor and
-- v132's talk: product_kinds and product_stages ARE the kind set (v124: "a
-- kind is an INSERT, not a code change"), so no CHECK, enum or trigger names a
-- kind and none changes here.
--
-- Nick, 2026-10-19: "If those are things at ATS then it needs to be a separate
-- moderator thing". Two ATS session-moderator roles (2024, 2025) were filed as
-- talk products with nick_event_role = 'moderator' (PB
-- Scratch/talks_abstracts_to_products_2026_10_12.py). A role column cannot
-- make them separate: the Manuscripts page's Talks tab lists every talk, and
-- a moderated session is not a talk Nick gave. A kind of its own gets its own
-- tab, its own ladder word for done ("Moderated", not "Delivered") and its own
-- count. nick_event_role stays 'moderator' on these rows, so the role filter
-- keeps working across the event kinds.
--
-- Ladder: Invited > Preparing > Moderated (Declined), the talk ladder with
-- the done rung named for what happened. moderated and declined are terminal.
-- Cannot fund. sort_order 27 lists it after talk (25), before
-- grant_application (30).
--
-- PB copy: scripts/db/products.py PRODUCT_LADDERS / KIND_LABELS, pinned by
-- tests/db/test_products_home_stage.py::test_ladder_matches_hub_seeds against
-- this file at Hub origin/main. This file lands on main FIRST.
--
-- Decision: PB Context/Decisions/2026-10-19-talk-per-delivery-and-moderated-sessions.md.
--
-- APPLY (test first, then prod; sanctioned wrapper only):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v141-product-kind-session-moderator.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v141-product-kind-session-moderator.sql
-- Rollback (no live product of this kind first; the composite FK refuses):
--   DELETE FROM product_stages WHERE kind = 'session_moderator';
--   DELETE FROM product_kinds WHERE kind = 'session_moderator';
--   DELETE FROM schema_migrations WHERE version = 141;

INSERT OR IGNORE INTO product_kinds (kind, label, plural_label, has_page, can_fund, sort_order) VALUES
  ('session_moderator', 'Moderated session', 'Moderated sessions', 1, 0, 27);
INSERT OR IGNORE INTO product_stages (kind, stage, label, ordinal, is_terminal) VALUES
  ('session_moderator', 'invited',   'Invited',   10, 0),
  ('session_moderator', 'preparing', 'Preparing', 20, 0),
  ('session_moderator', 'moderated', 'Moderated', 30, 1),
  ('session_moderator', 'declined',  'Declined',  40, 1);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (141, 'schema-v141-product-kind-session-moderator.sql');

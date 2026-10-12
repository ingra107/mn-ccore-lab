-- schema-v132-product-kind-talk.sql (2026-10-12)
--
-- An 8th product kind: talk. Data only, like v125's honor: product_kinds and
-- product_stages are the kind set (v124: "a kind is an INSERT, not a code
-- change"), so no CHECK, enum or trigger names a kind and none changes here.
--
-- Nick, 2026-10-12: "if i have to give a talk for CRIKEY then talk would be a
-- product". Approved ladder: "Talk = Invited > Preparing > Delivered
-- (Declined)". An invited talk (grand rounds, a portfolio meeting) is not a
-- submitted abstract; `abstract` stays for conference abstracts (Planning >
-- Submitted > Accepted > Preparing > Presented, Rejected).
--
-- delivered is the done end; declined is a not-done end, terminal like an
-- abstract's rejected. A talk cannot fund (can_fund = 0). sort_order 25 puts
-- it after abstract (20) and before grant_application (30), so pickers and
-- rollups list it beside abstracts.
--
-- Rollback (no live product of kind talk first; the composite FK refuses):
--   DELETE FROM product_stages WHERE kind = 'talk';
--   DELETE FROM product_kinds WHERE kind = 'talk';
--   DELETE FROM schema_migrations WHERE version = 132;

INSERT OR IGNORE INTO product_kinds (kind, label, plural_label, has_page, can_fund, sort_order) VALUES
  ('talk', 'Talk', 'Talks', 1, 0, 25);
INSERT OR IGNORE INTO product_stages (kind, stage, label, ordinal, is_terminal) VALUES
  ('talk', 'invited',   'Invited',   10, 0),
  ('talk', 'preparing', 'Preparing', 20, 0),
  ('talk', 'delivered', 'Delivered', 30, 1),
  ('talk', 'declined',  'Declined',  40, 1);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (132, 'schema-v132-product-kind-talk.sql');

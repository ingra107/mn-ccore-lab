-- schema-v135-product-event-date-and-nick-role.sql (2026-10-12)
--
-- A product gets the date it happened and Nick's part in it (Nick
-- 2026-10-12: "Go now; add proper date + role fields next"). Before this,
-- tonight's talks/abstracts batch (PB Scratch/talks_abstracts_to_products_
-- 2026_10_12.py) could only put a month-or-year date and Nick's author
-- position in the description's first lines ("Nick: <role> (k of n)",
-- "Date: May 2019"), and the 12 talks with a known day in due_date, which the
-- product card reads as "Due Feb 11" on a talk given years ago.
--
--   products.event_date            when it happened or will happen: a talk
--                                  given, an abstract presented, a paper out.
--                                  'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' (the CV
--                                  often knows only the month or the year);
--                                  rendered with formatPublicationDate. Not
--                                  due_date (an internal date) and not
--                                  deadline (a hard date): the two-date rule
--                                  of v124 is about work still owed.
--   products.nick_author_position  Nick's place on the product's byline:
--                                  first, co_first, middle, senior, or
--                                  investigator (a consortium's investigator
--                                  list, not the byline). NULL = not an
--                                  author, or not recorded.
--   products.nick_event_role       what Nick did at the event: presenter or
--                                  moderator. NULL = not his to present.
--
-- Two role columns, not one: the source vocabulary is two axes ("first author,
-- presenter" is 16 of the 77 CV rows), so one enum would need a value per
-- pair, and the Manuscripts page filters on each axis alone (presenter; first,
-- senior, middle).
--
-- NICK's, by name: a product row holds one position, so a generic
-- author_position could only ever be one person's, and a member editing their
-- own abstract would read it as theirs. The lab's other authors stay where the
-- team pages already find them: the byline (publications.authors, matched by
-- name in src/lib/authorAvatars.ts). A per-member product byline would be its
-- own table; nothing asks for it yet.
--
-- WHAT THE SCHEMA MAKES UNREPRESENTABLE (Level 1 at the arbiter):
--   - an event date that is not a year, a month or a calendar day:
--     products_event_date_shape (date() refuses 2026-02-30 and 2026-13);
--   - a position or a role outside the vocabulary: each column is a foreign
--     key to its own small table, so a value cannot be stored unless its row
--     exists, and a position cannot be put in the role column.
-- The vocabularies are DATA, like product_kinds (v124: "a kind is an INSERT,
-- not a code change"). A CHECK IN (...) would make the next value (panelist,
-- discussant, co_senior) a rebuild of products, which v124 showed cascades
-- into tasks' children. Adding one here is an INSERT. The UI reads the labels
-- from GET /api/projects/products (`roles`), never a copy.
--
-- Not kind-scoped, unlike v128's award terms: a kind is data, an honor has a
-- date too, and a manuscript has a byline. Which kinds SHOW these is the UI's
-- call (talk and abstract show the event date in place of "Due").
--
-- PB: the three columns join the products wire set and the products pull
-- (PB mig 149, pb-schema 0.18.0); the cache carries them with no constraint,
-- so a pull never aborts on a row the Hub accepted. The two vocabulary tables
-- are Hub-only, like product_kinds.
--
-- DEPENDENCY: numbered after v134 (schema-v134-drop-legacy-grants, live on
-- prod since 2026-10-12). Neither touches the other's tables.
--
-- APPLY (TEST first; prod waits for Nick's go; BEFORE the Worker whose
-- SYNC_COLS / PRODUCT_LIST_SQL name the columns, or every product read 500s):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v135-product-event-date-and-nick-role.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v135-product-event-date-and-nick-role.sql
-- Not re-runnable (ADD COLUMN); the schema_migrations row says it landed.
-- ROLLBACK (columns first: their FKs name the tables; the index before its column):
--   ALTER TABLE products DROP COLUMN nick_event_role;
--   ALTER TABLE products DROP COLUMN nick_author_position;
--   DROP INDEX IF EXISTS idx_products_event_date;
--   ALTER TABLE products DROP COLUMN event_date;
--   DROP TABLE IF EXISTS product_event_roles;
--   DROP TABLE IF EXISTS product_author_positions;
--   DELETE FROM schema_migrations WHERE version = 135;

-- ── the two vocabularies (data) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_author_positions (
  position   TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_event_roles (
  role       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO product_author_positions (position, label, sort_order) VALUES
  ('first',        'First author',    10),
  ('co_first',     'Co-first author', 20),
  ('middle',       'Middle author',   30),
  ('senior',       'Senior author',   40),
  ('investigator', 'Investigator',    50);

INSERT OR IGNORE INTO product_event_roles (role, label, sort_order) VALUES
  ('presenter', 'Presenter', 10),
  ('moderator', 'Moderator', 20);

-- ── the columns ─────────────────────────────────────────────────────────────
-- SQLite tests a CHECK added by ADD COLUMN against existing rows; every row
-- starts NULL, which the CHECK accepts. An FK column added by ADD COLUMN must
-- default to NULL, which these do.
ALTER TABLE products ADD COLUMN event_date TEXT
  CONSTRAINT products_event_date_shape CHECK (
    event_date IS NULL
    OR (length(event_date) = 4  AND event_date GLOB '[0-9][0-9][0-9][0-9]')
    OR (length(event_date) = 7  AND event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        AND date(event_date || '-01') IS NOT NULL AND date(event_date || '-01') = event_date || '-01')
    OR (length(event_date) = 10 AND date(event_date) IS NOT NULL AND date(event_date) = event_date)
  );
-- date() answers NULL for 2026-13-01, and a CHECK that evaluates to NULL
-- PASSES; the IS NOT NULL terms make each arm false instead (v128's form).

ALTER TABLE products ADD COLUMN nick_author_position TEXT
  REFERENCES product_author_positions(position) ON UPDATE CASCADE;

ALTER TABLE products ADD COLUMN nick_event_role TEXT
  REFERENCES product_event_roles(role) ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_products_event_date ON products(event_date) WHERE event_date IS NOT NULL;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (135, 'schema-v135-product-event-date-and-nick-role.sql');

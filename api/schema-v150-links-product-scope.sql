-- schema-v150-links-product-scope.sql (2026-10-26) -- a product's current draft.
--
-- Nick, 2026-10-26: "you will have seen that there were two more versions of
-- edits to an abstract or manuscript and you will have filed them away so that
-- when I do go to work on that project I know that I'm working with the most
-- recent version". Rulings: auto-file a newer version as current, list it in
-- the process session, one-tick undo, the old pointer archived and never removed.
--
-- Design (codex tie-break, option C; PB
-- Context/Decisions/2026-10-26-codex-current-draft-tiebreak.md and
-- Context/Decisions/2026-10-26-current-draft-per-product.md): a draft is a
-- PROJECT-owned links row scoped to one PRODUCT. One project can hold two
-- manuscripts; each is a product, each gets its own current draft and history.
--
--   links.product_id      the product the link belongs to (NULL = project-wide)
--   role 'current_draft'  THE draft of that product; replaced drafts go to
--                         'archive' with the same product_id (never deleted)
--
-- What is structural here (the arbiter refuses the wrong state on EVERY write
-- path: /api/mutations, applyInsert/applyUpdate callers, raw SQL):
--   * idx_links_one_current_draft: at most one live current draft per product
--     (Level 1 for the upper bound). Deliberately not keyed on kind: a kind in
--     the key would allow one current draft per kind.
--   * the CHECK on product_id: a current_draft row names a product, and a
--     product-scoped row is project-owned (task links reach a product through
--     tasks.product_id, schema-v124).
--   * trg_links_product_project_*: a link's product belongs to the link's
--     project (Level 2, a trigger, the schema-v131 precedent).
--   * idx_links_owner_role_url gains product scope, so the same URL can be the
--     draft of two products of one project.
--   * current_draft_changes: the receipt of every promotion and undo, written
--     in the SAME batch as the role changes. idempotency_key is UNIQUE (a
--     replayed request returns its receipt), a promotion is undone at most
--     once (idx_current_draft_changes_one_undo), and (product_id, seq) is
--     UNIQUE, so "the latest promotion" is one row.
-- What is a route rule (Level 2, one door, api/routes/current-draft.ts): the
-- archive + promote order, the expected-current compare, undo only while the
-- promoted draft is still current. The generic doors refuse current_draft and
-- product_id writes (api/lib/current-draft.ts currentDraftGuard).
--
-- PB: brain.db mig 154 caches product_id (no FK/CHECK/trigger; the singleton
-- and the product-aware natural key ARE in the cache). The PB links pull names
-- product_id once the Worker below ships.
--
-- DEPENDENCY: numbered after v148 (hub_releases / hub_announcements) and v149
-- (pulse timestamp indexes), both #156 and unrelated to links; apply them
-- first so schema_migrations stays in order. Written as v149 first; renumbered
-- 2026-10-26 when #156 took v148/v149 on main.
--
-- APPLY ORDER (prod is orchestrator-only; do not apply from a lane):
--   1. PB mig 154 on BOTH machines first.
--   2. Backup: scripts/wrangler-d1 d1 export mnccore-lab --remote --output=<file>
--      and a Time Travel bookmark: npx wrangler d1 time-travel info mnccore-lab
--   3. scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v150-links-product-scope.sql
--      probe: PRAGMA index_list(links) -> idx_links_one_current_draft (unique, partial)
--   4. scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v150-links-product-scope.sql
--   5. THEN deploy the Worker that selects links.product_id.
-- Not re-runnable (ADD COLUMN); the schema_migrations row says it landed.
-- ROLLBACK (Worker rolled back first; export the scoped rows first:
--   SELECT * FROM links WHERE product_id IS NOT NULL; SELECT * FROM current_draft_changes;):
--   UPDATE links SET role = 'archive' WHERE role = 'current_draft';
--   DROP TRIGGER IF EXISTS trg_links_product_project_ins;
--   DROP TRIGGER IF EXISTS trg_links_product_project_upd;
--   DROP INDEX IF EXISTS idx_links_one_current_draft;
--   DROP INDEX IF EXISTS idx_links_product;
--   DROP INDEX IF EXISTS idx_links_owner_role_url;
--   CREATE UNIQUE INDEX idx_links_owner_role_url ON links(owner_table, owner_id, role, canonical_url) WHERE deleted_at IS NULL;
--     (fails if one URL is now scoped to two products of a project; tombstone one first)
--   ALTER TABLE links DROP COLUMN product_id;
--   DROP TABLE IF EXISTS current_draft_changes;
--   DELETE FROM schema_migrations WHERE version = 150;

-- NULL default: SQLite admits ADD COLUMN with REFERENCES only when the default
-- is NULL. The CHECK reads the row's other columns; every existing row has
-- product_id NULL and role key/archive, so it passes on the ALTER.
ALTER TABLE links ADD COLUMN product_id TEXT REFERENCES products(id)
  CHECK ((product_id IS NULL OR owner_table = 'projects')
     AND (role <> 'current_draft' OR product_id IS NOT NULL));

DROP INDEX IF EXISTS idx_links_owner_role_url;
CREATE UNIQUE INDEX IF NOT EXISTS idx_links_owner_role_url
    ON links(owner_table, owner_id, COALESCE(product_id, ''), role, canonical_url)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_links_one_current_draft
    ON links(product_id)
    WHERE role = 'current_draft' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_links_product ON links(product_id) WHERE product_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_links_product_project_ins BEFORE INSERT ON links
FOR EACH ROW
WHEN NEW.product_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.project_id = NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'link_product_project_mismatch: a link''s product must belong to the link''s project');
END;

CREATE TRIGGER IF NOT EXISTS trg_links_product_project_upd BEFORE UPDATE OF product_id, owner_table, owner_id ON links
FOR EACH ROW
WHEN NEW.product_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.project_id = NEW.owner_id)
BEGIN
  SELECT RAISE(ABORT, 'link_product_project_mismatch: a link''s product must belong to the link''s project');
END;

CREATE TABLE IF NOT EXISTS current_draft_changes (
  id              TEXT PRIMARY KEY,                       -- cdc_<id>
  product_id      TEXT NOT NULL REFERENCES products(id),
  seq             INTEGER NOT NULL,                       -- per-product receipt order (1, 2, ...), UNIQUE below
  op              TEXT NOT NULL CHECK (op IN ('promote', 'undo')),
  idempotency_key TEXT NOT NULL UNIQUE,
  candidate_url   TEXT,                                   -- promote: the canonical_url promoted
  before_link_id  TEXT,                                   -- current draft before this change (NULL = none)
  after_link_id   TEXT,                                   -- current draft after it (NULL = none)
  created_link    INTEGER NOT NULL DEFAULT 0 CHECK (created_link IN (0, 1)),
  undoes_id       TEXT REFERENCES current_draft_changes(id),
  undone_by       TEXT,
  note            TEXT,
  actor           TEXT,
  origin          TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((op = 'undo') = (undoes_id IS NOT NULL)),
  CHECK (op = 'undo' OR (candidate_url IS NOT NULL AND after_link_id IS NOT NULL))
);
-- The order of a product's receipts. Undo acts only on the latest promotion
-- not yet undone (api/routes/current-draft.ts), so the order must be total:
-- two concurrent writers cannot both take the same seq.
CREATE UNIQUE INDEX IF NOT EXISTS idx_current_draft_changes_product_seq ON current_draft_changes(product_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_current_draft_changes_one_undo
    ON current_draft_changes(undoes_id) WHERE undoes_id IS NOT NULL;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (150, 'schema-v150-links-product-scope.sql');

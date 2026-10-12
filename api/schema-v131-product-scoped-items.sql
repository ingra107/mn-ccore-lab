-- schema-v131-product-scoped-items.sql (2026-10-12)
--
-- Products carry their own description, files, revisions and activity inside
-- the project (Nick 2026-10-12: "there should be a description too that's a
-- little bit different. Similar with activity, so essentially things like
-- revisions and files that could be associated with each product within that
-- overarching project").
--
-- Ruling ("Project-wide, shown everywhere"): an item with product_id NULL is
-- project-wide. It shows under All AND under every product, marked "project".
-- A tagged item shows only under its product (and under All). The project
-- description stays the umbrella; each product gets its own under it.
--
--   products.description              the product's own description, nullable
--   file_attachments.product_id       the Files tab (entity_type = 'project')
--   manuscript_revisions.product_id   the Revisions tab
--   activity_entries.product_id       the Activity tab's project-entity rows
--
-- Task rows in the activity feed take their product from the task
-- (tasks.product_id, v124), so they carry no copy here.
--
-- Level 2 at the arbiter, like v124's task guard: a product must belong to the
-- item's project, whatever writes it. A file's project is entity_id (a slug or
-- a proj_ id, both seen in the table); a revision's is project_id (the same);
-- an activity row's is project_id (the typed PK).
--
-- DEPENDENCY: numbered after v130 (schema-v130-retire-project-stage-triggers),
-- which is live on prod (2026-10-12). Neither touches the other's tables.
--
-- PB: products.description joins the products wire set and the products pull
-- (a PB migration + the pb-schema bump). The three product_id columns are Hub
-- only: file_attachments, manuscript_revisions and activity_entries are not
-- pulled by PB.
--
-- APPLY (TEST first; prod waits for Nick's go; before the Worker that names
-- the columns):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v131-product-scoped-items.sql
-- Not re-runnable (ADD COLUMN); the schema_migrations row says it landed.
-- ROLLBACK: drop the six triggers, then ALTER TABLE ... DROP COLUMN
-- product_id on the three tables and products.description.

ALTER TABLE products ADD COLUMN description TEXT;

ALTER TABLE file_attachments     ADD COLUMN product_id TEXT REFERENCES products(id);
ALTER TABLE manuscript_revisions ADD COLUMN product_id TEXT REFERENCES products(id);
ALTER TABLE activity_entries     ADD COLUMN product_id TEXT REFERENCES products(id);

CREATE INDEX IF NOT EXISTS idx_file_attachments_product     ON file_attachments(product_id)     WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_manuscript_revisions_product ON manuscript_revisions(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_entries_product     ON activity_entries(product_id)     WHERE product_id IS NOT NULL;

-- ── files ───────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_file_attachments_product_project_ins BEFORE INSERT ON file_attachments
FOR EACH ROW
WHEN NEW.product_id IS NOT NULL
 AND NOT (NEW.entity_type = 'project' AND EXISTS (
       SELECT 1 FROM products p
        WHERE p.id = NEW.product_id
          AND (p.project_id = NEW.entity_id OR p.project_id = (SELECT pr.id FROM projects pr WHERE pr.slug = NEW.entity_id))))
BEGIN
  SELECT RAISE(ABORT, 'item_product_project_mismatch: a file''s product must belong to the file''s project');
END;

CREATE TRIGGER IF NOT EXISTS trg_file_attachments_product_project_upd BEFORE UPDATE OF product_id, entity_type, entity_id ON file_attachments
FOR EACH ROW
WHEN NEW.product_id IS NOT NULL
 AND NOT (NEW.entity_type = 'project' AND EXISTS (
       SELECT 1 FROM products p
        WHERE p.id = NEW.product_id
          AND (p.project_id = NEW.entity_id OR p.project_id = (SELECT pr.id FROM projects pr WHERE pr.slug = NEW.entity_id))))
BEGIN
  SELECT RAISE(ABORT, 'item_product_project_mismatch: a file''s product must belong to the file''s project');
END;

-- ── revisions ───────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_manuscript_revisions_product_project_ins BEFORE INSERT ON manuscript_revisions
FOR EACH ROW
WHEN NEW.product_id IS NOT NULL
 AND NOT EXISTS (
       SELECT 1 FROM products p
        WHERE p.id = NEW.product_id
          AND (p.project_id = NEW.project_id OR p.project_id = (SELECT pr.id FROM projects pr WHERE pr.slug = NEW.project_id)))
BEGIN
  SELECT RAISE(ABORT, 'item_product_project_mismatch: a revision''s product must belong to the revision''s project');
END;

CREATE TRIGGER IF NOT EXISTS trg_manuscript_revisions_product_project_upd BEFORE UPDATE OF product_id, project_id ON manuscript_revisions
FOR EACH ROW
WHEN NEW.product_id IS NOT NULL
 AND NOT EXISTS (
       SELECT 1 FROM products p
        WHERE p.id = NEW.product_id
          AND (p.project_id = NEW.project_id OR p.project_id = (SELECT pr.id FROM projects pr WHERE pr.slug = NEW.project_id)))
BEGIN
  SELECT RAISE(ABORT, 'item_product_project_mismatch: a revision''s product must belong to the revision''s project');
END;

-- ── activity ────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_activity_entries_product_project_ins BEFORE INSERT ON activity_entries
FOR EACH ROW
WHEN NEW.product_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.project_id = NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'item_product_project_mismatch: an activity entry''s product must belong to the entry''s project');
END;

CREATE TRIGGER IF NOT EXISTS trg_activity_entries_product_project_upd BEFORE UPDATE OF product_id, project_id ON activity_entries
FOR EACH ROW
WHEN NEW.product_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.project_id = NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'item_product_project_mismatch: an activity entry''s product must belong to the entry''s project');
END;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (131, 'schema-v131-product-scoped-items.sql');

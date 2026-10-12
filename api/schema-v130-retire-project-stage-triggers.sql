-- schema-v130-retire-project-stage-triggers.sql (2026-10-12)
--
-- Contract phase step 4 (PB Scratch/plans/2026-10-12-contract-phase-retire-
-- project-stage.md; Nick 2026-10-12, "Go, column drop asks me later"). No
-- trigger names projects.stage or projects.stage_entered_at after this file,
-- so the step-6 `ALTER TABLE projects DROP COLUMN stage` is no longer refused
-- for a trigger reference. This file drops no column.
--
-- WHAT CHANGES
--   trg_products_stage_mirror (v126): DROPPED. It copied a sole manuscript
--     product's stage onto projects.stage for the readers that still read the
--     project column. Step 1 moved every Hub reader to the home product and
--     step 2 moved PB's, so the copy has no reader.
--   trg_projects_home_product_ins (v129): the home is built from the
--     project_home_seed row ONLY. v125/v129 fell back to a manuscript at
--     projects.stage (else 'idea') when no seed was written: that fallback is
--     the root cause the contract phase names (every new project born a
--     manuscript). Every create lane now sends Mutation.home_product
--     (api/routes/projects.ts create and upsert; PB create_project), and
--     /api/mutations refuses a project insert without one (envelope_invalid),
--     so a seedless insert can only be raw SQL. It is refused here
--     (RAISE ABORT project_home_seed_missing) instead of guessed. The new
--     home's clock starts now: projects.stage_entered_at has no writer.
--   trg_projects_home_product_restore (v125): unchanged in its first two
--     steps (un-tombstone the most recent home, else the derived prd_<ULID>
--     row). Its last-resort home, made only when the project has no product
--     row at all, is a manuscript at the manuscript ladder's first rung,
--     clock now, instead of reading projects.stage. Nothing to seed from on a
--     restore, and a restore must not fail.
--
-- Checked on mnccore-lab-test before writing (sqlite_master, sql LIKE
-- '%stage%'): the three triggers above are the only trigger, view or index
-- that names projects.stage. The projects table carries no CHECK on it.
--
-- APPLY (test first, then prod; sanctioned wrapper only). On prod, AFTER the
-- Worker that sends home_product from every create route is live AND both
-- laptops run PB with create_project sending home_product (a seedless insert
-- fails from this file on):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v130-retire-project-stage-triggers.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v130-retire-project-stage-triggers.sql
-- ROLLBACK: re-apply api/schema-v126-product-stage-mirror.sql, then
--   api/schema-v129-project-home-seed.sql (restores the seed-or-manuscript
--   insert trigger), then the restore trigger block of
--   api/schema-v125-product-home-paths.sql, then
--   DELETE FROM schema_migrations WHERE version = 130;
--
-- Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.

DROP TRIGGER IF EXISTS trg_products_stage_mirror;

DROP TRIGGER IF EXISTS trg_projects_home_product_ins;
CREATE TRIGGER trg_projects_home_product_ins AFTER INSERT ON projects
FOR EACH ROW
WHEN NEW.deleted_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.project_id = NEW.id AND p.deleted_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'project_home_seed_missing: a project insert names its first product (project_home_seed kind, stage)')
   WHERE NOT EXISTS (SELECT 1 FROM project_home_seed h WHERE h.project_id = NEW.id);
  -- Derived id only while no row holds it (v125's rule, unchanged).
  INSERT INTO products (id, project_id, kind, stage, is_home, stage_entered_at)
  SELECT
    CASE WHEN length(NEW.id) = 31 AND NEW.id LIKE 'proj\_%' ESCAPE '\' AND substr(NEW.id, 6) NOT GLOB '*[^0-9A-HJKMNP-TV-Z]*'
              AND NOT EXISTS (SELECT 1 FROM products x WHERE x.id = 'prd_' || substr(NEW.id, 6))
         THEN 'prd_' || substr(NEW.id, 6) ELSE 'prd_' || lower(hex(randomblob(16))) END,
    NEW.id, h.kind, h.stage, 1, datetime('now')
  FROM project_home_seed h WHERE h.project_id = NEW.id;
  DELETE FROM project_home_seed WHERE project_id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_projects_home_product_restore;
CREATE TRIGGER trg_projects_home_product_restore AFTER UPDATE OF deleted_at ON projects
FOR EACH ROW
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.project_id = NEW.id AND p.deleted_at IS NULL)
BEGIN
  UPDATE products SET deleted_at = NULL, updated_at = datetime('now')
   WHERE id = (SELECT h.id FROM products h WHERE h.project_id = NEW.id AND h.is_home = 1
                ORDER BY julianday(h.deleted_at) DESC, h.id DESC LIMIT 1);
  UPDATE products SET deleted_at = NULL, is_home = 1, updated_at = datetime('now')
   WHERE id = 'prd_' || substr(NEW.id, 6) AND project_id = NEW.id
     AND NOT EXISTS (SELECT 1 FROM products p WHERE p.project_id = NEW.id AND p.deleted_at IS NULL);
  -- The derived id is used only while no row holds it (a client may have
  -- minted that id for another project's product); otherwise a fresh
  -- prd_<32 hex>, so this step can never leave the project with nothing.
  INSERT INTO products (id, project_id, kind, stage, is_home, stage_entered_at)
  SELECT
    CASE WHEN length(NEW.id) = 31 AND NEW.id LIKE 'proj\_%' ESCAPE '\' AND substr(NEW.id, 6) NOT GLOB '*[^0-9A-HJKMNP-TV-Z]*'
              AND NOT EXISTS (SELECT 1 FROM products x WHERE x.id = 'prd_' || substr(NEW.id, 6))
         THEN 'prd_' || substr(NEW.id, 6) ELSE 'prd_' || lower(hex(randomblob(16))) END,
    NEW.id,
    'manuscript',
    (SELECT st.stage FROM product_stages st
      WHERE st.kind = 'manuscript' AND st.deleted_at IS NULL ORDER BY st.ordinal LIMIT 1),
    1,
    datetime('now')
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.project_id = NEW.id AND p.deleted_at IS NULL);
END;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (130, 'schema-v130-retire-project-stage-triggers.sql');

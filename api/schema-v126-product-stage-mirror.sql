-- schema-v126-product-stage-mirror.sql (2026-10-12)
--
-- One stage truth while projects.stage still exists. v124's forwarding rule
-- (mutations.ts projectStageDependents) copies a projects.stage edit onto the
-- project's single product. Nothing copied the other way, so a stage set on
-- the product ladder (project page, schema-v124/v125) left projects.stage
-- behind, and every reader of projects.stage -- the Projects list, the
-- Manuscripts page, Insights, PB brain.db -- showed the old stage. Cold review
-- of s61 4a77d405, B1.
--
-- trg_products_stage_mirror: when a live product's stage changes and it is
-- its project's ONLY live product, the project's stage (and its clock) follow
-- it in the same statement, if the new stage is a project stage. The project
-- stage set is the manuscript ladder (v124 seeded it from PB PROJECT_STAGE;
-- api/routes/projects.ts PROJECT_STAGE_VALUES, pinned equal by
-- api/routes/products.stage-mirror.test.ts).
--
-- Why only a single-product project: projects.stage describes ONE deliverable.
-- With 2+ products it has no single meaning, which is exactly why the forward
-- rule refuses a projects.stage edit there (project_stage_unforwardable). The
-- home product is not the answer either: it is where umbrella tasks land
-- (admin / trial ops), and v124's forward rule deliberately never uses it as a
-- stage tiebreak. Mirroring the home's stage onto projects.stage would publish
-- an admin product's stage as "the project's stage". So on a 2+ project the
-- mirror does nothing, and the list view reads products instead (chips).
--
-- Why only a project stage: a single infrastructure or award product's stage
-- ('running', 'active') is not a value projects.stage may hold; the project
-- keeps its last project stage, and the list view reads the product.
--
-- No loop: the forward rule is Worker code that writes products with the
-- project's own new value, so the mirror's WHEN (NEW.stage IS NOT pr.stage)
-- is false for it; and nothing fires on a projects UPDATE.
--
-- APPLY (test first, then prod, before the Worker that writes stage through
-- POST /api/projects/:slug/products deploys):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v126-product-stage-mirror.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v126-product-stage-mirror.sql
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_products_stage_mirror;
--   DELETE FROM schema_migrations WHERE version = 126;
--
-- Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.

DROP TRIGGER IF EXISTS trg_products_stage_mirror;
CREATE TRIGGER trg_products_stage_mirror AFTER UPDATE OF stage ON products
FOR EACH ROW
WHEN NEW.deleted_at IS NULL
 AND NEW.stage IS NOT OLD.stage
 AND NEW.stage IN (SELECT st.stage FROM product_stages st WHERE st.kind = 'manuscript' AND st.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM products o WHERE o.project_id = NEW.project_id AND o.id <> NEW.id AND o.deleted_at IS NULL)
BEGIN
  UPDATE projects
     SET stage = NEW.stage,
         stage_entered_at = COALESCE(NEW.stage_entered_at, datetime('now')),
         updated_at = datetime('now')
   WHERE id = NEW.project_id AND deleted_at IS NULL AND stage IS NOT NEW.stage;
END;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (126, 'schema-v126-product-stage-mirror.sql');

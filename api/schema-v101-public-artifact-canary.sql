-- schema-v101-public-artifact-canary.sql
--
-- Seeds a SYSTEM-OWNED public HTML artifact whose only purpose is to be the
-- post-deploy CSP probe's target, and makes it structurally undeletable.
--
-- WHY (backlog #531, filed 2026-07-07): the post-deploy probe
-- (scripts/post-deploy-probe.mjs, shipped 3c6a50a7 as the #508 interim) asserts
-- the hardened Content-Security-Policy on a LIVE /a/:id response. It has to use
-- a real, published artifact because `handleGetPublicArtifact`'s notFound()
-- helper deliberately sets NO CSP -- only the 200 path does -- so a 404 for a
-- made-up id proves nothing about the header. Until now the probe was pinned to
-- art_b424399a..., a USER artifact (Nick's LLM Ethics Workflow Map). That
-- coupled deploy gating to one person's content lifecycle: unpublish or delete
-- it and every subsequent deploy fails for a reason that has nothing to do with
-- security. Wrong failure, right alarm -- the classic bug-shape != fix-shape
-- trap, because the loud red would train everyone to ignore a real CSP break.
--
-- NOT FIXED BY setting the header on the 404 path. That would let the probe
-- pass against a 404 while a 200-only header regression sailed through -- it
-- would delete the coverage instead of stabilising it. The 200 path IS the
-- surface under test, so the fix is a permanent 200 that belongs to the system.
--
-- Level 1 (ethos #15): three triggers make the states the probe depends on
-- unrepresentable rather than merely unlikely --
--   * the canary row cannot be DELETEd (the realistic vector is not a human
--     clicking delete on an id nobody recognises; it is some future
--     prune-orphan-artifacts cleanup, since this row has no task_id/project_id);
--   * its visibility cannot leave 'public' and its content_type cannot leave
--     'html' (either would turn the 200 into a 404 and red the deploy);
--   * its id cannot be rewritten out from under the probe.
-- Without these the canary is only a politer version of the same coupling.
--
-- The body is deliberately inert: static HTML, no script, no network. It is a
-- header fixture, not a demo. Nothing links to it and nothing lists it.
--
-- Runs against the SAME prod D1 both Pages projects bind (the #508 origin split
-- is a browser-origin boundary, not a data boundary), so one seeded row covers
-- the probe on mn-ccore-artifacts.pages.dev.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_artifact_canary_no_delete;
--   DROP TRIGGER IF EXISTS trg_artifact_canary_stays_public;
--   DROP TRIGGER IF EXISTS trg_artifact_canary_id_frozen;
--   DELETE FROM artifacts WHERE id = 'art_cafe0000cafe0000cafe0000cafe0000';
--   (and re-point KNOWN_PUBLIC_ARTIFACT_ID in scripts/post-deploy-probe.mjs)
--
-- Idempotent: the INSERT upserts on the PK and each CREATE TRIGGER is preceded
-- by DROP TRIGGER IF EXISTS. Safe to re-apply. The triggers only RAISE(ABORT) --
-- they never write.

INSERT INTO artifacts (id, title, body_md, version, task_id, project_id, created_by, content_type, visibility)
VALUES (
  'art_cafe0000cafe0000cafe0000cafe0000',
  'Deploy canary - public artifact security headers',
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Deploy canary</title></head><body style="font-family:system-ui,sans-serif;max-width:34rem;margin:3rem auto;line-height:1.55"><h1 style="font-size:1.05rem">Deploy canary</h1><p>This is a system-owned artifact. Every deploy fetches it and asserts the hardened <code>Content-Security-Policy</code> that isolates published artifacts. It carries no content of its own and is not linked from anywhere.</p><p>It cannot be deleted or unpublished (schema-v101 triggers) so that a failing deploy always means a real header regression.</p></body></html>',
  1,
  NULL,
  NULL,
  'system',
  'html',
  'public'
)
ON CONFLICT(id) DO UPDATE SET
  title        = excluded.title,
  body_md      = excluded.body_md,
  content_type = excluded.content_type,
  visibility   = excluded.visibility,
  updated_at   = datetime('now');

DROP TRIGGER IF EXISTS trg_artifact_canary_no_delete;
DROP TRIGGER IF EXISTS trg_artifact_canary_stays_public;
DROP TRIGGER IF EXISTS trg_artifact_canary_id_frozen;

CREATE TRIGGER trg_artifact_canary_no_delete BEFORE DELETE ON artifacts FOR EACH ROW
WHEN OLD.id IS 'art_cafe0000cafe0000cafe0000cafe0000'
BEGIN SELECT RAISE(ABORT, 'artifact canary is deploy infrastructure (schema-v101, backlog #531) and cannot be deleted -- drop trg_artifact_canary_no_delete first if you really mean it'); END;

CREATE TRIGGER trg_artifact_canary_stays_public BEFORE UPDATE ON artifacts FOR EACH ROW
WHEN OLD.id IS 'art_cafe0000cafe0000cafe0000cafe0000'
 AND (NEW.visibility IS NOT 'public' OR NEW.content_type IS NOT 'html')
BEGIN SELECT RAISE(ABORT, 'artifact canary must stay visibility=public/content_type=html (schema-v101, backlog #531) -- the post-deploy CSP probe asserts its 200 response'); END;

CREATE TRIGGER trg_artifact_canary_id_frozen BEFORE UPDATE ON artifacts FOR EACH ROW
WHEN OLD.id IS 'art_cafe0000cafe0000cafe0000cafe0000' AND NEW.id IS NOT OLD.id
BEGIN SELECT RAISE(ABORT, 'artifact canary id is pinned by scripts/post-deploy-probe.mjs (schema-v101, backlog #531) and cannot be rewritten'); END;

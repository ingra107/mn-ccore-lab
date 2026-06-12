-- schema-v82-ai-request-tokens.sql (2026-06-11, N7b)
-- Per-generation token usage on Hermes requests.
--
-- Nick (2026-06-11 close): "if there is a way to track hermes tokens". The
-- listener runs `claude --print` on the Max subscription ($0 marginal) but we
-- capture usage anyway: hub_ai_listener.py now invokes the CLI with
-- --output-format json, parses usage.{input_tokens,output_tokens}, and POSTs
-- them with the response; handleUpdateAIResponse stamps them here.
--
-- HUB-ONLY columns — NO Peripheral Brain lockstep (no pb-schema, no enums.py,
-- no shared-schema-registry entry; same class as artifacts v79 / entity_seen
-- v81). Surfaced as a totals rollup on GET /api/ai-requests.
--
-- Purely additive. Reversible: ALTER TABLE ai_requests DROP COLUMN ... (x2).
--
-- APPLY (test FIRST, probe, then prod) — sanctioned wrapper ONLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v82-ai-request-tokens.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=api/schema-v82-ai-request-tokens.sql

ALTER TABLE ai_requests ADD COLUMN input_tokens INTEGER;
ALTER TABLE ai_requests ADD COLUMN output_tokens INTEGER;

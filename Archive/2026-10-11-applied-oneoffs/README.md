Archived 2026-10-11 (s51 dead-weight lane). Single-use prod data fixes, migrations and seeds, April to September 2026, already applied.

Proof: per-stem git grep over the Hub (excluding CHANGELOG, docs/archived, Archive) finds no caller. phase36b and fix-nick-email were cited only by REFERENCE.md rows (removed in this commit). deploy-audit-wave.sh was cited only by audit/2026-04-28/progress-log.md. api/backfill-v77 reads task_updates and task_comments, which api/schema-v78.sql dropped, so it cannot run on any current database. None is in package.json, .github/workflows, .githooks/ or schedule.json. Not queried: prod D1 state they produced.

Kept on purpose: scripts/seed/phase0-direct-sql.ts (step 2 of the phase0 seed, cited by local-db-bootstrap.ts, local-db-seed.ts, TESTING.md and phase0-verify.ts), backfill-119/120/122 and their planners (api/lib/*-plan.test.ts import them), backfill-author-slugs-report.ts, check-* gates, wrangler_d1*, post-deploy-probe.

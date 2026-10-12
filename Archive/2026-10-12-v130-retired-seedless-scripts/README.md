# Retired 2026-10-12: scripts that insert a project with no home seed

schema-v130 refuses a project insert with no `project_home_seed` row
(contract phase step 4). Nothing live called these scripts:

- `probe-v124-products.ts` (archived here): the one-off local-D1 probe behind
  schema-v124's claims. Its checks now live in `api/lib/products-schema.test.ts`
  and the migration-chain vitest suites, which run on every commit.
- `scripts/seed-d1.ts` + `scripts/seed.sql` (deleted, recoverable from git
  history at the parent of this commit): the March 2026 seed path (`npm run
  seed`, `db:seed`, `db:seed:remote`, removed from package.json), flagged dead
  by the 2026-05-22 codex simplify review (stale slugs and categories; it also
  ran `DELETE FROM publications`). They are not archived here because their
  raw `wrangler d1` lines trip the pre-commit raw-wrangler gate. The live
  local seed is `scripts/local-db-seed.ts` via `npm run test:local:setup`,
  which writes the seed.

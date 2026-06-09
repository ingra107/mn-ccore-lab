# RUNBOOK — Slice D: re-key `project_dependencies` on durable project PKs (PROD D1)

**Status: NOT YET APPLIED. Nick-gated. Do NOT run the `--remote` apply without Nick's explicit go.**

This is the irreversible prod-D1 slice. The reversible build (schema file, worker
routes, tests) already merged on branch `slice-d-dep-rekey`. The worker code reads
`from_project_id`/`to_project_id`; the live worker (pre-deploy) reads the OLD
`from_slug`/`to_slug`. Therefore the schema and the worker deploy are COUPLED — see
"Deploy sequencing" below.

## What this does
Recreates `project_dependencies` keyed on `from_project_id`/`to_project_id` (`proj_*`
PKs) with FKs to `projects(id)` (`ON UPDATE CASCADE ON DELETE CASCADE`), `UNIQUE(from,to)`,
`CHECK(from<>to)`. There is NO data backfill: all 8 existing rows are proven
double-orphans (unrecoverable junk, Nick-approved to drop). The new table starts empty.

## Pre-verified (this branch, 2026-06-09)
- Local-D1 dry-run GREEN against a fresh prod export: 8 rows, all double-orphans;
  post-migration row count 0, `foreign_key_check` 0, new DDL present.
- `vitest run --config vitest.config.api.ts`: 751 passed (incl. 10 Slice D tests +
  the re-judged `projects.cascade` fail-loud test).
- Frontend: zero changes (the wire shape stays `from_slug`/`to_slug`).

## Deploy sequencing (READ FIRST)
Because the table is RECREATED (not additively migrated), old-worker + new-table
cannot coexist (old worker would `INSERT … from_slug` into a table lacking that
column → 500s). Mitigation: the feature is PI-only-write, single-user (Nick), and
will be EMPTY after this migration, so a brief gap is harmless (the list/map just
show "no dependencies").

**Apply order: SCHEMA first, then WORKER deploy, back-to-back, when idle.**
1. Run the prod apply (steps below).
2. Immediately `git checkout main && git merge slice-d-dep-rekey` (or PR-merge) and
   deploy the worker (`wrangler deploy` / the repo's deploy path) so the new code that
   writes `from_project_id` goes live.

**Rollback order is the REVERSE: WORKER first, then SCHEMA.** If you roll the schema
back to slug-keyed, the new worker (writing `from_project_id`) breaks — revert the
worker (`git revert` the merge) BEFORE the Time-Travel restore.

> Zero-outage alternative (NOT built — noted per codex): ship a compat-worker that
> reads both column shapes and dual-writes during a window, then cut over. Not worth
> it here (single-user, empty feature). Documented only so the option is on record.

---

## STEP 1 — Capture the Time-Travel rollback bookmark (do this FIRST)
```
cd ~/mn-ccore-lab
npx wrangler d1 time-travel info mnccore-lab
```
Copy the bookmark string from the output (`The current bookmark is '<BOOKMARK>'`).
**Record it here before proceeding:**

    ROLLBACK BOOKMARK: ____________________________________________
    ROLLBACK CMD:      npx wrangler d1 time-travel restore mnccore-lab --bookmark=<BOOKMARK>

## STEP 2 — Fresh read-only export + fail-closed interlock dry-run
Re-run the dry-run immediately before the apply so the interlock is checked against
the CURRENT prod state (not a stale export). This aborts if ANY of the 8 rows has
become a real (resolving) edge since the branch was built.
```
python scripts/migrations/slice-d-dryrun.py
```
**Proceed ONLY if it prints `[PASS] … interlock + migration + post-state all GREEN`.**
If it prints `[ABORT] … RESOLVE to a real project`, STOP — a genuine edge now exists;
re-plan with Nick (the data is no longer all-junk).

Keep the exported `slice_d_fresh.sql` as an out-of-account backup copy (belt-and-
suspenders beyond the ~30-day Time-Travel window) until the slice is proven stable.

## STEP 3 — Apply the migration to PROD (the irreversible step)
```
npx wrangler d1 execute mnccore-lab --remote --file scripts/migrations/slice-d-dep-rekey.sql
```
Point of no return: the `DROP TABLE` inside the batch destroys the 8 orphan rows.
(Recoverable within the Time-Travel window via STEP 1's bookmark.) wrangler wraps the
file; D1 auto-rolls back the whole batch on any error.

## STEP 4 — Post-write verification (re-export, assert)
```
npx wrangler d1 execute mnccore-lab --remote --json --command \
  "SELECT name, sql FROM sqlite_master WHERE name='project_dependencies';"
npx wrangler d1 execute mnccore-lab --remote --json --command \
  "SELECT COUNT(*) AS n FROM project_dependencies;"
npx wrangler d1 execute mnccore-lab --remote --json --command "PRAGMA foreign_key_check;"
```
**Expect ALL of:**
- `sql` for `project_dependencies` shows `from_project_id` + `to_project_id`, the two
  `REFERENCES projects(id)` FKs, `UNIQUE (from_project_id, to_project_id)`, and
  `CHECK (from_project_id <> to_project_id)`. NO `from_slug`/`to_slug` columns.
- count `n` == 0.
- `PRAGMA foreign_key_check` returns an empty result set (0 violations).

If any assertion fails → run the ROLLBACK CMD from STEP 1, then revert the worker.

## STEP 5 — Deploy the worker (immediately after STEP 4 green)
Merge `slice-d-dep-rekey` to `main` and deploy so the worker that writes
`from_project_id` goes live. Then smoke-test in the UI: open a project → Dependencies
→ Add dependency (should 201) → rename a project slug → confirm the edge survives.

## ROLLBACK (if needed)
1. Revert the worker first: `git revert <merge-sha>` + redeploy (back to slug-reading code).
2. Restore the schema: `npx wrangler d1 time-travel restore mnccore-lab --bookmark=<BOOKMARK>`
   (recovers the old slug-keyed table AND the 8 rows; ~30-day window).
3. If past the Time-Travel window, reload from the `slice_d_fresh.sql` backup taken in STEP 2.

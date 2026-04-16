# MN-CCORE Lab Hub — Testing Guide

## Test Suites (546 tests total)

| Suite | File | Tests | What It Covers | Run Time |
|-------|------|-------|----------------|----------|
| Inspection | `tests/inspection.spec.ts` | 212 | API health, page rendering, design system, keyboard shortcuts, performance, accessibility, visual regression | ~9 min |
| Workflows | `tests/inspection-workflows.spec.ts` | 169 | Missing routes, API endpoints, keyboard shortcuts, user journeys, edge cases, sync round-trips, filters, mobile, a11y | ~8 min |
| Daily Super-User | `tests/daily-superuser.spec.ts` | 131 | Every daily interaction: inline edits, detail panel, subtasks, board/timeline views, modals, context menu, undo system, optimistic updates, localStorage, all dashboard cards, key links, quick capture, PB sector | ~6 min |
| Sync Pipeline | `tests/sync-pipeline.test.py` | 48 | brain.db → D1 push (6 types), D1 → brain.db pull (7 colleague scenarios), full round-trips (7 workflows), timing, idempotency, new feature sync (pomodoro, sessions, email, files, key links, health) | ~5 min |

## Running Tests

```bash
# All suites
./scripts/run-tests.sh all

# Quick check (API + page renders only)
./scripts/run-tests.sh quick

# UI interactions only
./scripts/run-tests.sh ui

# Sync pipeline only
./scripts/run-tests.sh sync

# Individual suites
npx playwright test tests/inspection.spec.ts
npx playwright test tests/daily-superuser.spec.ts --grep "EXHAUSTIVE"
python tests/sync-pipeline.test.py
```

## After Adding New Features

When you add a new feature to the Hub, add tests for:

1. **API endpoint** → `inspection-workflows.spec.ts` Part 12
2. **Page/component render** → `inspection.spec.ts` or `daily-superuser.spec.ts`
3. **User interaction** (click, hover, keyboard) → `daily-superuser.spec.ts` EXHAUSTIVE section
4. **Sync to/from brain.db** → `sync-pipeline.test.py` TestNewFeatureSync or TestFullRoundTripWorkflows
5. **Dashboard card** → `daily-superuser.spec.ts` FEATURE section
6. **Visual state change** → screenshot test in any suite

### Test Naming Convention
- `API GET/POST:` — API endpoint tests
- `ROUTE:` — Page render tests
- `FEATURE:` — Feature-specific interaction tests
- `JOURNEY:` — Multi-step workflow tests
- `VISUAL:` — Screenshot/visual verification tests
- `EDGE:` — Error handling and boundary tests
- `SYNC:` — Data sync round-trip tests
- `MOBILE:` — Phone viewport tests
- `A11Y:` — Accessibility tests
- `GAPS:` — Previously untested workflow tests
- `EXHAUSTIVE:` — Granular interaction verification
- `DATA:` — Real data content verification
- `test_NN_description` — Python sync pipeline tests

## Test Database Isolation

Playwright tests run against a **separate D1 database** (`mnccore-lab-test`), not production. Production data is never touched by E2E tests.

| Component | What It Does |
|-----------|-------------|
| `playwright.config.ts` | Sends `X-Test-Mode: true` header on all requests |
| `api/index.ts` middleware | Detects header, swaps `env.DB` to `env.DB_TEST` |
| `wrangler.toml` | Declares `DB_TEST` binding (`a30fe84d-0891-4035-9358-f7813b5f5807`) |
| `api/types.ts` | `DB_TEST` in `Env` interface |
| `functions/api/[[route]].ts` | `DB_TEST` in `Env` interface |
| `tests/test-cleanup.ts` | Cleans up `_TEST_DELETE_`-prefixed records |
| `tests/test-seed.ts` | globalSetup: seeds DB_TEST via API before Playwright runs (Phase 32) |

**Canonical test prefix:** `_TEST_DELETE_` -- all test-created data should use this prefix for reliable cleanup.

**Note:** Sync pipeline tests (`tests/sync-pipeline.test.py`) still operate on brain.db directly and are not affected by D1 test isolation.

## Test Infrastructure

- **Playwright config (prod smoke)**: `playwright.config.prod.ts` (Chromium, 30s, narrow `tests/smoke.spec.ts` match, NO `X-Test-Mode` header — that pattern was deprecated in the 2026-04-15 Miniflare rework)
- **Playwright config (local, default)**: `playwright.config.local.ts` (Chromium, 30s, `testMatch: tests/local/**`, baseURL `http://localhost:5173`, no extra headers)
- **Test database (local)**: Miniflare-hosted D1 in `.wrangler/state/v3/d1/` (binding: `DB`), bootstrapped from `api/schema.sql` + every `api/schema-v*.sql`
- **Test database (legacy prod)**: `mnccore-lab-test` D1 instance (binding: `DB_TEST`) — still exists but no longer the primary path
- **Test cleanup**: `tests/test-cleanup.ts` (prefix: `_TEST_DELETE_`)
- **Test results**: `review/audit-results.json` + `review/test-summary.txt`
- **Screenshots**: `review/*.png` (200+ screenshots per run)
- **Runner script**: `scripts/run-tests.sh` (modes: quick, ui, sync, all)

---

## Miniflare Local-First Testing (2026-04-15)

As of the Everything-Sprint V2 rework, the Hub's primary testing path is a
fully local Miniflare harness.  Prod Playwright (`test:prod`) is retained
only for narrow post-deploy smoke against a real `hub-realtime` Durable
Object — everything else should run locally.

### One-time setup per machine

```bash
npm install                     # pulls @cloudflare/vitest-pool-workers, miniflare, concurrently, wait-on
npm run test:local:setup        # apply schema + seed the local D1
```

`test:local:setup` runs two scripts back-to-back:

1. **`tsx scripts/local-db-bootstrap.ts`** — applies `api/schema.sql` to the
   local D1 (`.wrangler/state/v3/d1`), then every `api/schema-v*.sql`
   migration in numeric version order.  Files sharing a version number
   (e.g. `schema-v22.sql` and `schema-v22-rename-columns.sql`) run
   base-first, variant-second.
2. **`tsx scripts/local-db-seed.ts`** — reads `scripts/seed/phase0-plan.json`,
   strips the `test_delete_` prefix off every title/slug (the local DB is
   isolated so no guard prefix is needed), and inserts via direct
   `wrangler d1 execute --local --config=wrangler.local.toml` with
   batched SQL files (same Windows-libuv-safe pattern as
   `scripts/seed/phase0-direct-sql.ts`).

Both scripts strip `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` before
shelling out to wrangler so they fall back to the OAuth config
(`~/.wrangler/config/default.toml`) which has `d1:write` scope.  The global
env token in Nick's shell is Pages-scoped and returns `7403` on any D1 call.

### Running the suite

```bash
npm run test:local    # the default `npm test` alias
```

This spawns three processes via `concurrently -k -s first`:

1. `wrangler pages dev --local --d1 DB=local --port 8787` — the Worker
   API backed by the local D1.
2. `vite` — the React dev server on port 5173 proxying `/api` to :8787.
3. `wait-on http://localhost:5173 && playwright test --config=playwright.config.local.ts`
   — the test run.

`-k` kills all other processes when any one exits; `-s first` means the
whole command exits with the first-to-exit status code.  Playwright
finishing green brings the whole stack down.

### Prod smoke only

```bash
npm run test:prod            # narrow, post-deploy
npm run test:smoke           # alias, same config
```

Prod Playwright is deliberately scoped to `tests/smoke.spec.ts` in
`playwright.config.prod.ts`.  Do NOT expand that matcher without
explicit sign-off — Workers quota is finite.

### WebSocket stub limitation (real-time E2E)

The Hub frontend opens a WebSocket to a `hub-realtime` Durable Object for
live task/idea updates.  That Durable Object lives in a **separate,
unknown Workers repo** and cannot be loaded into Miniflare alongside the
Pages worker.  We work around it with `tests/setup/websocket-stub.ts`,
which:

- fulfils any HTTP request to `**/hub-realtime/**` with a canned
  `{"type":"connected"}` JSON response via `page.route`,
- routes real `wss://` upgrades through `page.routeWebSocket` (Playwright
  1.48+) and sends a canned `{"type":"connected"}` frame.

**Consequences:**

- Real-time sync cannot be E2E-tested locally.  Any spec that depends on
  live WebSocket events lives under `tests/smoke.spec.ts` (prod) or gets
  skipped locally.
- Stub only covers the handshake path.  If the frontend changes its
  expected message schema, update `tests/setup/websocket-stub.ts` in lockstep.

### Known prod bug — hub-realtime handshake 400

Phase 0 dogfood (2026-04-15) found that the prod `hub-realtime` endpoint
returns **HTTP 400** on WebSocket upgrade.  Source repo is unknown —
it's not `mn-ccore-lab`.  This means:

- Local tests must stub the handshake (see above) or they'll flake.
- Prod smoke specs should NOT assert on successful real-time sync until
  whoever owns `hub-realtime` fixes the handshake.
- Until then, the stub is load-bearing, not a convenience.

### Schema drift CI

`.github/workflows/schema-drift.yml` runs nightly (09:00 UTC / ~3am CT)
and on manual `workflow_dispatch`.  It dumps the live prod D1 schema via
`wrangler d1 execute mnccore-lab --remote --command ".schema"`, builds a
concatenated committed-schema reference from `api/schema.sql` +
`api/schema-v*.sql` in version order, and `diff`s them.  Drift fails the
job and uploads a `schema-drift-diff` artifact for inspection.

**This workflow is the only place in the repo that runs
`wrangler d1 execute --remote`.**  Everything else goes through `--local`
Miniflare.

**Required GitHub secrets** (configured once by a repo admin in
`Settings -> Secrets and variables -> Actions`):

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with D1 read permission
  on the `mnccore-lab` database.  Do NOT reuse the Pages deploy token
  (Pages-scoped token returns `7403` on D1).  Create a fresh token at
  `https://dash.cloudflare.com/profile/api-tokens` from the "Read D1"
  template, scoped to the single `mnccore-lab` database.
- `CLOUDFLARE_ACCOUNT_ID` — The account ID that owns the `mnccore-lab`
  D1, found in the dashboard URL.

### Gotchas

- **Local wrangler OAuth token:** wrangler needs D1 OAuth scope.  If you
  get `[code: 7403] account not authorized`, verify you've run
  `wrangler login` at least once on the machine and re-run without
  `CLOUDFLARE_API_TOKEN` set in the environment.  The bootstrap and seed
  scripts do this env-stripping automatically, but ad-hoc wrangler
  invocations may need manual `CLOUDFLARE_API_TOKEN= CLOUDFLARE_ACCOUNT_ID= npx wrangler ...`.
- **Schema ordering:** `schema-v22-rename-columns.sql` must run AFTER
  `schema-v22.sql` — the rename depends on tables the base v22 file
  creates.  The bootstrap script handles this via suffix-rank sort.  Do
  not add more variants without updating the comparator in
  `scripts/local-db-bootstrap.ts`.
- **Windows libuv handle race:** direct `execSync` calls to wrangler in a
  tight loop trigger an assertion failure
  (`!(handle->flags & UV_HANDLE_CLOSING)`) on Windows Node.  Both
  bootstrap and seed scripts batch SQL into a single temp file and use
  one wrangler invocation per table group.  If you add more inserts, use
  `d1Execute(...)` + `d1Flush(label)` — do not add per-row `execSync`.
- **Vite dev server** must proxy `/api` to the Miniflare worker on
  :8787.  If a future Vite config change breaks that proxy, `test:local`
  will hang on `wait-on http://localhost:5173` because Playwright will
  404 on every API call.  Check `vite.config.ts` `server.proxy` before
  debugging test failures.

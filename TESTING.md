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

- **Playwright config**: `playwright.config.ts` (Chromium, 30s timeout, screenshots on failure, `X-Test-Mode: true` header, globalSetup: `tests/test-seed.ts` as string path)
- **Test database**: `mnccore-lab-test` D1 instance (binding: `DB_TEST`)
- **Test cleanup**: `tests/test-cleanup.ts` (prefix: `_TEST_DELETE_`)
- **Test results**: `review/audit-results.json` + `review/test-summary.txt`
- **Screenshots**: `review/*.png` (200+ screenshots per run)
- **Runner script**: `scripts/run-tests.sh` (modes: quick, ui, sync, all)

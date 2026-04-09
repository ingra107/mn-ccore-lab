# MN-CCORE Lab Hub — Testing Guide

## Test Suites (546 tests total)

| Suite | File | Tests | What It Covers | Run Time |
|-------|------|-------|----------------|----------|
| Inspection | `tests/inspection.spec.ts` | 198 | API health, page rendering, design system, keyboard shortcuts, performance, accessibility, visual regression | ~9 min |
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

## Test Infrastructure

- **Playwright config**: `playwright.config.ts` (Chromium, 30s timeout, screenshots on failure)
- **Test results**: `review/audit-results.json` + `review/test-summary.txt`
- **Screenshots**: `review/*.png` (200+ screenshots per run)
- **Runner script**: `scripts/run-tests.sh` (modes: quick, ui, sync, all)

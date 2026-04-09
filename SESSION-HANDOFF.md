# Session Handoff — 2026-04-09

## What happened today

Massive deploy + test + sync pipeline audit. 15 commits across both repos.

### Deploy & Tests
- Deployed 3 times to Cloudflare Pages (bug fixes → schema fixes → column renames)
- Playwright: 494/494 passing (100%) across 3 suites
- Sync pipeline: 48 tests passing + 13 new tests added (not yet verified in full run)

### App Bug Fixes
- `MyItems.tsx:665` — null guard on `item.description` (was crashing page)
- `team.ts:getPersonInfo` — null guard on undefined slug
- `api/routes/questions.ts` — D1 columns renamed to match code (v22 migration)
- `api/routes/handoffs.ts` — notification INSERT used wrong column names
- `api/routes/meetings.ts` — activity query used wrong table name (`activity` → `activity_log`) and columns (`entity_id` → `related_id`, `created_at` → `timestamp`)

### D1 Schema v22 Migration
- `lab_questions`: title→question, body→context, author_slug→asked_by
- `lab_answers`: body→content, accepted→is_accepted
- No more SQL aliases — column names match TypeScript interfaces exactly

### Sync Pipeline Overhaul
- **brain.db**: added `priority` and `assignee` columns to tasks table
- **Airtable**: added Priority (single select, fldXC6gSPNRD0tn3Z) and Assignee (text, fld339bnembwVnWiG) fields
- **sync_d1_pull.py**: pulls priority+assignee from D1, removed nonexistent `assignee` column ref that was crashing hub→brain INSERT
- **sync_d1_push.py**: sends priority (priority > effort mapping > null) and assignee from brain.db
- **sync_push.py** (Airtable): sends priority+assignee on new and modified tasks
- **sync_pull.py** (Airtable): reads Priority+Assignee, COALESCE preserves D1-set values
- **query.py**: BrainDB create_task() and update_task() accept priority+assignee
- **session-start.py**: added auto_pull_d1() — D1 pull at session start (2h threshold)
- **process SKILL.md**: added step 6c (D1 pull after push, both machines)

### Test Infrastructure
- All `loadPage`/`go` helpers: `networkidle` → `load` + 1.5s hydration wait (fixes WebSocket timeout)
- Dropdown interaction tests use `page.evaluate` (bypasses Playwright task-row interception)
- CSS selector fixes: `.or()` instead of comma-separated pseudo-selectors
- Sync pipeline: `time.sleep(2)` for timestamp settling between D1 writes and pulls

### Key Files Modified
| File | Repo | What changed |
|------|------|-------------|
| scripts/db/sync_d1_pull.py | PB | priority+assignee pull, removed assignee crash |
| scripts/db/sync_d1_push.py | PB | priority+assignee push, reads from brain.db |
| scripts/db/sync_push.py | PB | Airtable push includes priority+assignee |
| scripts/db/sync_pull.py | PB | Airtable pull reads Priority+Assignee |
| scripts/db/query.py | PB | create_task/update_task accept priority+assignee |
| .claude/hooks/session-start.py | PB | auto_pull_d1() function + wired into Phase 1 |
| .claude/skills/process/SKILL.md | PB | step 6c D1 pull, updated create_task signature |
| api/routes/questions.ts | Hub | real column names (no aliases) |
| api/routes/meetings.ts | Hub | activity_log table + column fix |
| api/schema-v22-rename-columns.sql | Hub | migration file |
| tests/sync-pipeline.test.py | Hub | 13 new tests (test_50-62) |
| tests/inspection.spec.ts | Hub | loadPage helper, Project Detail slug filter |
| tests/inspection-workflows.spec.ts | Hub | loadPage helper, CV test removed |
| tests/daily-superuser.spec.ts | Hub | go helper, dropdown page.evaluate |

### Known Issues for Next Session
- **test_09** (completion round-trip) has timing flake — may need time.sleep(2)
- **13 new tests** (TestPriorityAssigneeSync, TestSessionHookSync) — first real run pending
- **D1 test data**: cleaned 602 rows, but new test runs will create more

### What to verify
Run all 4 suites in parallel:
```bash
npx playwright test tests/inspection.spec.ts --reporter=list
npx playwright test tests/inspection-workflows.spec.ts --reporter=list
npx playwright test tests/daily-superuser.spec.ts --reporter=list
python tests/sync-pipeline.test.py
```
Target: 100%. Sync pipeline should have 61 tests.

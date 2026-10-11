# MN-CCORE Lab Hub — Bug Fix Batch Session Plan

## Context

Phase 29 built 546 tests across 4 suites + 9 new features + Office of Inspection testing infrastructure. 55 bugs documented in `CLAUDE.md` "Known Bugs" section. This session fixes them all in one batch, runs the full suite, and deploys once.

## Start With

```
/work-on mnccore lab hub
```

Then say:

> We have 55 documented bugs in CLAUDE.md and 546 tests ready to verify fixes. The bug list is in CLAUDE.md under "Known Bugs — Test-Verified". Fix all of them in one batch. Here's the priority order:
>
> **Fix 1 (unblocks 18 sync tests): Push script crash**
> The new push handlers added to `scripts/db/sync_d1_push.py` (PB repo) have a syntax/import error that crashes the entire push. Fix the crash, run `python scripts/db/sync_d1_push.py` to verify it completes without error.
>
> **Fix 2 (unblocks ~8 tests): D1 schema migrations v21-v35**
> Older migrations were never applied to the live D1 database. Run these on D1:
> - `api/schema-v21.sql` through `api/schema-v36.sql` (check which are missing)
> - This fixes: pub_date column, linked_projects column, questions table, narratives route, PI dashboard
> - Use: `npx wrangler d1 execute mnccore-lab --remote --file=api/schema-vNN.sql`
>
> **Fix 3 (CSS): Dashboard overflow at all breakpoints**
> Something extends past viewport width on Dashboard. Check for elements with explicit widths or flex-shrink:0 that overflow. Likely a new card or the QuickCaptureBar.
>
> **Fix 4 (CSS): h1 fontWeight 800 → 600**
> `index.css:190` has h1 at 800. Change to 600. Remove inline 800 from 7 portal pages. Keep 800 on public pages only.
>
> **Fix 5 (keyboard): Ctrl+K command palette not opening**
> Check keyboard event handler registration. May be intercepted by browser or another listener.
>
> **Fix 6 (keyboard): Enter key doesn't open TaskDetailPanel**
> Fix keyboard shortcut handler for Enter on focused task row.
>
> **Fix 7 (keyboard): F key conflict — focus mode vs filter toggle**
> F key triggers focus mode everywhere, including Tasks page where it should toggle filter panel. Add page-specific routing.
>
> **Fix 8 (UI): ScrollToTop blocked by FAB**
> The Quick-add FAB button (bottom-right, z-40) overlaps ScrollToTop button. Fix z-index or reposition. ScrollToTop should be above FAB or offset.
>
> **Fix 9 (UI): MeetingDetail crash (React #310)**
> Conditional hook call in sortable section. Fix hook order.
>
> **Fix 10 (UI): ProjectDetail crash**
> React error on project detail page — likely related to schema or hook issue.
>
> **Fix 11 (API): Task POST response shape**
> POST /api/tasks must return `{ data: { id: "..." } }` — the sync round-trip tests depend on this. Check the response structure.
>
> **Fix 12 (API): Proactive brief response shape**
> GET /api/proactive-brief must return `{ overdue_count, due_today_count, bullets: [...] }` at top level. The test expects these keys directly in the response.
>
> **Fix 13 (API): PB Health missing sync_summary**
> GET /api/pb/health must include `sync_summary` key in response.
>
> **Fix 14 (API): 14 endpoints returning 500**
> See bugs A1-A14 in CLAUDE.md. Most are missing route handlers or schema issues. Fix each one.
>
> **Fix 15 (Sync): Hub→brain.db pull gaps**
> - Hub-created tasks (hex IDs) don't appear in brain.db after pull
> - Hub completion (done status) doesn't sync completed=1 to brain.db
> - Hub due date changes don't reach brain.db
> - task_updates/comments have no pull handler
> These are in `sync_d1_pull.py` — the pull logic needs to handle new hex-ID tasks and field-level merges.
>
> **Fix 16 (Sync): Push not idempotent**
> Double push adds ~10 duplicate tasks. The sync-bulk ON CONFLICT clause isn't matching correctly.
>
> **Fix 17 (Sync): effort→priority mapping not pushed**
> `sync_d1_push.py` should send `priority: "low"` when brain.db `effort="Quick"` but sends None.
>
> After fixing, run: `bash scripts/run-tests.sh all`
> Target: 500+ passing out of 546.
> Then deploy once: `npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab`
> Then clean up test data from D1 (INSPECTION/EDGE/SYNC/JOURNEY/DAILYTEST prefixed items).

## Key Files

| What | Path |
|------|------|
| Bug list | `C:/Users/ingra107/mn-ccore-lab/CLAUDE.md` (Known Bugs section) |
| Test runner | `C:/Users/ingra107/mn-ccore-lab/scripts/run-tests.sh` |
| Test suites | `C:/Users/ingra107/mn-ccore-lab/tests/` (4 files) |
| Feature registry | `C:/Users/ingra107/mn-ccore-lab/tests/feature-registry.json` |
| Scanner | `C:/Users/ingra107/mn-ccore-lab/scripts/inspection-scanner.py` |
| Push script | `C:/Users/ingra107/Peripheral-Brain/scripts/db/sync_d1_push.py` |
| Pull script | `C:/Users/ingra107/Peripheral-Brain/scripts/db/sync_d1_pull.py` |
| API routes | `C:/Users/ingra107/mn-ccore-lab/api/routes/` |
| API router | `C:/Users/ingra107/mn-ccore-lab/api/index.ts` |
| D1 schemas | `C:/Users/ingra107/mn-ccore-lab/api/schema-v*.sql` |
| Dashboard | `C:/Users/ingra107/mn-ccore-lab/src/pages/Dashboard.tsx` |
| CSS | `C:/Users/ingra107/mn-ccore-lab/src/index.css` |

## Rules

- ONE deploy at the end (KV free tier limit)
- Do NOT deploy from worktree
- Run `bash scripts/run-tests.sh all` after all fixes, before deploy
- Commit at natural checkpoints (every 3-5 fixes)
- After deploy, clean up test data prefixed with INSPECTION/EDGE/SYNC/JOURNEY/DAILYTEST/SYNCTEST

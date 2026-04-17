# Deep Audit — 20260417T21425_06-sync-pipeline

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 5
Bugs: 3 (P0 3, P1 0, P2 0)

## Bugs

- **[SYNC-PULL-DID-NOT-INGEST] [P0] 6.E Hub task in brain.db after sync_d1_pull**
  - Observed: no row
  - Expected: row with matching id
- **[SYNC-TITLE-NOT-UPDATED] [P0] 6.F title update propagates to brain.db**
  - Observed: undefined
  - Expected: test_delete_deep_sync_task_hy69eu__hub_edit
- **[SYNC-DONE-FLAG-DRIFT] [P0] 6.G done state syncs**
  - Observed: status=undefined completed=undefined
  - Expected: status=done completed=1

## Full trace


══════ SUITE: 06-sync-pipeline (run 20260417T21425_06-sync-pipeline) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 6.A  Pre-flight — brain.db accessible ━━━
- [PASS] 6.A brain.db present at C:/Users/ingra/Peripheral-Brain/data/brain.db

━━━ 6.B  Create task in Hub (D1) via API ━━━
- [PASS] 6.B Task created in Hub, id=d05d8a149b4de1533d49b2b76cfe1956

━━━ 6.C  Confirm task NOT in brain.db yet (pre-sync) ━━━
- [PASS] 6.C brain.db has no row for this task before sync_d1_pull

━━━ 6.D  Run scripts/db/sync_d1_pull.py ━━━
- [PASS] 6.D sync_d1_pull completed without crash

━━━ 6.E  Verify task appears in brain.db with correct fields ━━━
- **[SYNC-PULL-DID-NOT-INGEST] [P0] 6.E Hub task in brain.db after sync_d1_pull**
  - Observed: no row
  - Expected: row with matching id

━━━ 6.F  Edit title in Hub, re-pull, verify brain.db updated ━━━
- [PASS] 6.F Hub POST title update accepted
- **[SYNC-TITLE-NOT-UPDATED] [P0] 6.F title update propagates to brain.db**
  - Observed: undefined
  - Expected: test_delete_deep_sync_task_hy69eu__hub_edit

━━━ 6.G  Hub status=done → brain.db completed=1 + status=done ━━━
- **[SYNC-DONE-FLAG-DRIFT] [P0] 6.G done state syncs**
  - Observed: status=undefined completed=undefined
  - Expected: status=done completed=1

━━━ 6.H  brain.db edit → sync_d1_push → Hub reflects ━━━

⚠ FATAL: no such column: "now" - should this be a string literal in single-quotes?
SqliteError: no such column: "now" - should this be a string literal in single-quotes?
    at Database.prepare (C:\Users\ingra\mn-ccore-lab\node_modules\better-sqlite3\lib\methods\wrappers.js:5:21)
    at main (C:\Users\ingra\mn-ccore-lab\scripts\deep-audit\06-sync-pipeline.ts:200:10)

──── CLEANUP (1 items) ────
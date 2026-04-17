# Deep Audit — 20260417T21440_06-sync-pipeline

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 7
Bugs: 5 (P0 5, P1 0, P2 0)

## Bugs

- **[SYNC-PULL-DID-NOT-INGEST] [P0] 6.E Hub task in brain.db after sync_d1_pull**
  - Observed: no row
  - Expected: row with matching id
- **[SYNC-TITLE-NOT-UPDATED] [P0] 6.F title update propagates to brain.db**
  - Observed: undefined
  - Expected: test_delete_deep_sync_task_mcysh0__hub_edit
- **[SYNC-DONE-FLAG-DRIFT] [P0] 6.G done state syncs**
  - Observed: status=undefined completed=undefined
  - Expected: status=done completed=1
- **[SYNC-NO-ROW-FOR-PUSH-TEST] [P0] 6.H brain.db row exists before push test**
  - Observed: row missing
  - Expected: row resolvable by D1 id via aliases
- **[SYNC-PUSH-NOT-PROPAGATED] [P0] 6.H Hub reflects brain.db title after push**
  - Observed: test_delete_deep_sync_task_mcysh0__hub_edit
  - Expected: test_delete_deep_sync_task_mcysh0__cli_edit

## Full trace


══════ SUITE: 06-sync-pipeline (run 20260417T21440_06-sync-pipeline) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 6.A  Pre-flight — brain.db accessible ━━━
- [PASS] 6.A brain.db present at C:/Users/ingra/Peripheral-Brain/data/brain.db

━━━ 6.B  Create task in Hub (D1) via API ━━━
- [PASS] 6.B Task created in Hub, id=77bde057b7623d06e0b53dc4e2655ac1

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
  - Expected: test_delete_deep_sync_task_mcysh0__hub_edit

━━━ 6.G  Hub status=done → brain.db completed=1 + status=done ━━━
- **[SYNC-DONE-FLAG-DRIFT] [P0] 6.G done state syncs**
  - Observed: status=undefined completed=undefined
  - Expected: status=done completed=1

━━━ 6.H  brain.db edit → sync_d1_push → Hub reflects ━━━
- **[SYNC-NO-ROW-FOR-PUSH-TEST] [P0] 6.H brain.db row exists before push test**
  - Observed: row missing
  - Expected: row resolvable by D1 id via aliases
- [PASS] 6.H sync_d1_push completed without crash
- **[SYNC-PUSH-NOT-PROPAGATED] [P0] 6.H Hub reflects brain.db title after push**
  - Observed: test_delete_deep_sync_task_mcysh0__hub_edit
  - Expected: test_delete_deep_sync_task_mcysh0__cli_edit

━━━ 6.I  Hub soft-delete → brain.db soft-delete ━━━
- [PASS] 6.I Task removed from brain.db after Hub delete

──── CLEANUP (1 items) ────
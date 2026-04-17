# Deep Audit — 20260417T21520_06-sync-pipeline

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 15
Bugs: 1 (P0 1, P1 0, P2 0)

## Bugs

- **[SYNC-PUSH-NOT-PROPAGATED] [P0] 6.H Hub reflects brain.db title after push**
  - Observed: deep-audit-probe-z6bcst__hub_edit
  - Expected: deep-audit-probe-z6bcst__cli_edit

## Full trace


══════ SUITE: 06-sync-pipeline (run 20260417T21520_06-sync-pipeline) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 6.A  Pre-flight — brain.db accessible ━━━
- [PASS] 6.A brain.db present at C:/Users/ingra/Peripheral-Brain/data/brain.db

━━━ 6.B  Create task in Hub (D1) via API (non-test-prefix title so sync doesnt skip) ━━━
- [PASS] 6.B Task created in Hub, id=e8b2bba4702c22a18b6b26110790452b

━━━ 6.C  Confirm task NOT in brain.db yet (pre-sync) ━━━
- [PASS] 6.C brain.db has no row for this task before sync_d1_pull

━━━ 6.D  Run scripts/db/sync_d1_pull.py ━━━
- [PASS] 6.D sync_d1_pull completed without crash

━━━ 6.E  Verify task appears in brain.db with correct fields ━━━
- [PASS] 6.E brain.db row present id=task_01KPEPW10HZNZBYS7QTK37DSCW
- [PASS] 6.E name matches Hub title
- [PASS] 6.E priority synced=high
- [PASS] 6.E assignee synced=nick
- [PASS] 6.E status synced=todo

━━━ 6.F  Edit title in Hub, re-pull, verify brain.db updated ━━━
- [PASS] 6.F Hub POST title update accepted
- [PASS] 6.F brain.db picked up new title

━━━ 6.G  Hub status=done → brain.db completed=1 + status=done ━━━
- [PASS] 6.G brain.db shows status=done completed=1

━━━ 6.H  brain.db edit → sync_d1_push → Hub reflects ━━━
- [PASS] 6.H brain.db UPDATE written (brain id task_01KPEPW10HZNZBYS7QTK37DSCW, sync_status=local_modified)
- [PASS] 6.H sync_d1_push completed without crash
- **[SYNC-PUSH-NOT-PROPAGATED] [P0] 6.H Hub reflects brain.db title after push**
  - Observed: deep-audit-probe-z6bcst__hub_edit
  - Expected: deep-audit-probe-z6bcst__cli_edit

━━━ 6.I  Hub soft-delete → brain.db soft-delete ━━━
- [PASS] 6.I brain.db soft-deleted (status=done completed=1)

──── CLEANUP (1 items) ────
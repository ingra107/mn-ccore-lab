# Deep Audit — 20260417T21460_06-sync-pipeline

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 12
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 06-sync-pipeline (run 20260417T21460_06-sync-pipeline) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 6.A  Pre-flight — brain.db accessible ━━━
- [PASS] 6.A brain.db present at C:/Users/ingra/Peripheral-Brain/data/brain.db

━━━ 6.B  Create task in Hub (D1) via API (non-test-prefix title so sync doesnt skip) ━━━
- [PASS] 6.B Task created in Hub, id=af11fdd418330a2a5eaa49dd3b52497e

━━━ 6.C  Confirm task NOT in brain.db yet (pre-sync) ━━━
- [PASS] 6.C brain.db has no row for this task before sync_d1_pull

━━━ 6.D  Run scripts/db/sync_d1_pull.py ━━━
- [PASS] 6.D sync_d1_pull completed without crash

━━━ 6.E  Verify task appears in brain.db with correct fields ━━━
- [PASS] 6.E brain.db row present id=task_01KPEPH1GMWER936WP395FVF57
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

⚠ FATAL: no such column: "now" - should this be a string literal in single-quotes?
SqliteError: no such column: "now" - should this be a string literal in single-quotes?
    at Database.prepare (C:\Users\ingra\mn-ccore-lab\node_modules\better-sqlite3\lib\methods\wrappers.js:5:21)
    at main (C:\Users\ingra\mn-ccore-lab\scripts\deep-audit\06-sync-pipeline.ts:227:12)

──── CLEANUP (1 items) ────
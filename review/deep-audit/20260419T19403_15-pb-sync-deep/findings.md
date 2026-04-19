# Deep Audit — 20260419T19403_15-pb-sync-deep

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 17
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 15-pb-sync-deep (run 20260419T19403_15-pb-sync-deep) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 15.A  Preflight — brain.db accessible + Python import path ━━━
- [PASS] 15.A brain.db at C:/Users/ingra/Peripheral-Brain/data/brain.db

━━━ 15.B  Create task in Hub with full payload (name+priority+assignee+due+keylink) ━━━
- [PASS] 15.B Hub task 6ad225142c536f03a54fb1daf506ae12 created

━━━ 15.C  sync_d1_pull brings full payload into brain.db ━━━
- [PASS] 15.C sync_d1_pull completed
- [PASS] 15.C name synced
- [PASS] 15.C priority synced=high
- [PASS] 15.C assignee synced=nick
- [PASS] 15.C due_date synced=2026-05-03
- [PASS] 15.C task_key_link_1 synced
- [PASS] 15.C task_key_link_1_desc synced

━━━ 15.D  brain.db edit → sync_d1_push → Hub ━━━
- [PASS] 15.D brain.db UPDATE with sync_status=local_modified
- [PASS] 15.D sync_d1_push completed
- [PASS] 15.D Hub reflects brain.db name after push

━━━ 15.E  Task comments — Hub → brain.db d1_task_comments ━━━
- [PASS] 15.E Hub comment created
- [PASS] 15.E Hub comment landed in brain.db d1_task_comments

━━━ 15.F  Project sync — Hub → brain.db projects table ━━━
- [PASS] 15.F Hub project created slug=deep-audit-sync-probe-yl0t02
- [PASS] 15.F Hub project found in brain.db projects

━━━ 15.G  Confirm ideas/decisions/grants are Hub-only (not in brain.db schema) ━━━
  15.G brain.db missing table 'ideas' (Hub-only feature)
  15.G brain.db has table 'decisions'
  15.G brain.db missing table 'decision_log' (Hub-only feature)
  15.G brain.db missing table 'grants' (Hub-only feature)
  15.G brain.db missing table 'lab_questions' (Hub-only feature)

━━━ 15.H  Hub soft-delete → brain.db soft-delete mirror ━━━
- [PASS] 15.H brain.db soft-deleted (status=deleted)

──── CLEANUP (2 items) ────
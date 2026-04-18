# Deep Audit — 20260418T15340_15-pb-sync-deep

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 11
Bugs: 4 (P0 1, P1 3, P2 0)

## Bugs

- **[SYNC-KLINK-URL] [P1] 15.C task_key_link_1 synced**
  - Observed: null
  - Expected: https://example.com/deep-sync-full
- **[SYNC-KLINK-DESC] [P1] 15.C task_key_link_1_desc synced**
  - Observed: null
  - Expected: Reference link
- **[SYNC-PUSH-NOT-PROP] [P0] 15.D Hub title after push**
  - Observed: deep-audit-sync-full-3kitc1
  - Expected: deep-audit-sync-full-3kitc1__cli_edit
- **[SYNC-DEL-NO-MIRROR] [P1] 15.H brain.db mirrors Hub delete**
  - Observed: still present status=todo
  - Expected: row removed or status=deleted

## Full trace


══════ SUITE: 15-pb-sync-deep (run 20260418T15340_15-pb-sync-deep) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 15.A  Preflight — brain.db accessible + Python import path ━━━
- [PASS] 15.A brain.db at C:/Users/ingra/Peripheral-Brain/data/brain.db

━━━ 15.B  Create task in Hub with full payload (name+priority+assignee+due+keylink) ━━━
- [PASS] 15.B Hub task 0080ab5fa40996cf006aa0a5e4f15ea5 created

━━━ 15.C  sync_d1_pull brings full payload into brain.db ━━━
- [PASS] 15.C sync_d1_pull completed
- [PASS] 15.C name synced
- [PASS] 15.C priority synced=high
- [PASS] 15.C assignee synced=nick
- [PASS] 15.C due_date synced=2026-05-02
- **[SYNC-KLINK-URL] [P1] 15.C task_key_link_1 synced**
  - Observed: null
  - Expected: https://example.com/deep-sync-full
- **[SYNC-KLINK-DESC] [P1] 15.C task_key_link_1_desc synced**
  - Observed: null
  - Expected: Reference link

━━━ 15.D  brain.db edit → sync_d1_push → Hub ━━━
- [PASS] 15.D brain.db UPDATE with sync_status=local_modified
- [PASS] 15.D sync_d1_push completed
- **[SYNC-PUSH-NOT-PROP] [P0] 15.D Hub title after push**
  - Observed: deep-audit-sync-full-3kitc1
  - Expected: deep-audit-sync-full-3kitc1__cli_edit

━━━ 15.E  Task comments — Hub → brain.db ━━━
- [PASS] 15.E Hub comment created
  15.E INFO: brain.db has no task_comments table — Hub task_comments do NOT sync back (by design?)

━━━ 15.F  Project sync — Hub → brain.db projects table ━━━
- [PASS] 15.F Hub project created slug=deep-audit-sync-proj-milrbg
  15.F INFO: Hub-created project did NOT appear in brain.db — projects are not bidirectional in sync_d1_pull (gap or by design)

━━━ 15.G  Confirm ideas/decisions/grants are Hub-only (not in brain.db schema) ━━━
  15.G brain.db missing table 'ideas' (Hub-only feature)
  15.G brain.db has table 'decisions'
  15.G brain.db missing table 'decision_log' (Hub-only feature)
  15.G brain.db missing table 'grants' (Hub-only feature)
  15.G brain.db missing table 'lab_questions' (Hub-only feature)

━━━ 15.H  Hub soft-delete → brain.db soft-delete mirror ━━━
- **[SYNC-DEL-NO-MIRROR] [P1] 15.H brain.db mirrors Hub delete**
  - Observed: still present status=todo
  - Expected: row removed or status=deleted

──── CLEANUP (2 items) ────
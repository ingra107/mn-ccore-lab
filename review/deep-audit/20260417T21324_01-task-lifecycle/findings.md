# Deep Audit — 20260417T21324_01-task-lifecycle

Base: https://mn-ccore-lab.pages.dev
Screenshots: 6
PASS: 15
Bugs: 17 (P0 5, P1 10, P2 2)

## Bugs

- **[TASK-GET-NOT-FOUND] [P0] 1.B GET /api/tasks/:id**
  - Observed: null/404
  - Expected: full task object
- **[TASK-PATCH-FAIL] [P0] 1.E PATCH /api/tasks/:id title**
  - Observed: HTTP 405
  - Expected: 200
- **[TASK-TITLE-NOT-PERSISTED] [P0] 1.E readback shows new title**
  - Observed: undefined
  - Expected: test_delete_deep_task_full_1ug55z__edited
- **[TASK-TITLE-STALE-UI] [P1] 1.E new title visible after reload**
  - Observed: old or missing title
  - Expected: "test_delete_deep_task_full_1ug55z__edited" visible
- **[TASK-PATCH-ASSIGNEE] [P0] 1.F PATCH assignee=mesfin**
  - Observed: HTTP 405
  - Expected: 200
- **[TASK-ASSIGNEE-NOT-PERSISTED] [P0] 1.F readback shows assignee=mesfin**
  - Observed: undefined
  - Expected: mesfin
- **[TASK-PATCH-PRIORITY] [P1] 1.G PATCH priority=urgent**
  - Observed: HTTP 405
  - Expected: 200
- **[TASK-PRIORITY-NOT-PERSISTED] [P1] 1.G priority persisted**
  - Observed: undefined
  - Expected: urgent
- **[TASK-PATCH-STATUS-IP] [P1] 1.H PATCH status=in_progress**
  - Observed: HTTP 405
  - Expected: 200
- **[TASK-STATUS-IP-DRIFT] [P1] 1.H status=in_progress persisted**
  - Observed: undefined
  - Expected: in_progress
- **[TASK-COMPLETED-FLAG-DRIFT] [P2] 1.H completed flag stays 0 for in_progress**
  - Observed: undefined
  - Expected: 0
- **[TASK-DONE-COMPLETED-FLAG] [P1] 1.H done sets both status and completed**
  - Observed: status=undefined completed=undefined
  - Expected: status=done completed=1
- **[TASK-REOPEN-FLAG] [P1] 1.I reopen clears completed**
  - Observed: status=undefined completed=undefined
  - Expected: status=todo completed=0
- **[TASK-KEYLINK-PATCH] [P1] 1.J PATCH key_link_1**
  - Observed: HTTP 405
  - Expected: 200
- **[TASK-KEYLINK-URL-DRIFT] [P1] 1.J key_link_1 url round-trips**
  - Observed: undefined
  - Expected: https://example.com/deep-audit-task
- **[TASK-KEYLINK-DESC-DRIFT] [P1] 1.J key_link_1_desc round-trips**
  - Observed: undefined
  - Expected: Deep audit link
- **[TASK-ACTIVITY-MISSING] [P2] 1.M Activity feed has task-related entries**
  - Observed: 0 entries
  - Expected: >=1 entry (create + edits)

## Full trace


══════ SUITE: 01-task-lifecycle (run 20260417T21324_01-task-lifecycle) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 1.A  Create task via API — full payload ━━━
- [PASS] 1.A Task created via API — id=dbda2ac2fe8b922bde329dfb97d6e971
- [PASS] 1.A response echoes title exactly
- [PASS] 1.A response echoes priority=high
- [PASS] 1.A response echoes assignee=nick
- [PASS] 1.A response echoes status=todo

━━━ 1.B  Read back via GET /api/tasks/:id ━━━
- **[TASK-GET-NOT-FOUND] [P0] 1.B GET /api/tasks/:id**
  - Observed: null/404
  - Expected: full task object

━━━ 1.C  UI visibility — /my-tasks default filter ━━━
- [PASS] 1.C Task visible on /my-tasks (auto-filter Mine)

━━━ 1.D  UI visibility — /tasks (All view) ━━━
- [PASS] 1.D Task visible on /tasks

━━━ 1.E  Edit title via API, verify readback + UI after reload ━━━
- **[TASK-PATCH-FAIL] [P0] 1.E PATCH /api/tasks/:id title**
  - Observed: HTTP 405
  - Expected: 200
- **[TASK-TITLE-NOT-PERSISTED] [P0] 1.E readback shows new title**
  - Observed: undefined
  - Expected: test_delete_deep_task_full_1ug55z__edited
- **[TASK-TITLE-STALE-UI] [P1] 1.E new title visible after reload**
  - Observed: old or missing title
  - Expected: "test_delete_deep_task_full_1ug55z__edited" visible

━━━ 1.F  Change assignee via API, verify on new assignee and OFF old assignee workload ━━━
- **[TASK-PATCH-ASSIGNEE] [P0] 1.F PATCH assignee=mesfin**
  - Observed: HTTP 405
  - Expected: 200
- **[TASK-ASSIGNEE-NOT-PERSISTED] [P0] 1.F readback shows assignee=mesfin**
  - Observed: undefined
  - Expected: mesfin
- [PASS] 1.F Task no longer on /my-tasks (Mine filter respects new assignee)

━━━ 1.G  Change priority low→urgent via API ━━━
- **[TASK-PATCH-PRIORITY] [P1] 1.G PATCH priority=urgent**
  - Observed: HTTP 405
  - Expected: 200
- **[TASK-PRIORITY-NOT-PERSISTED] [P1] 1.G priority persisted**
  - Observed: undefined
  - Expected: urgent

━━━ 1.H  Change status todo→in_progress→done via API ━━━
- **[TASK-PATCH-STATUS-IP] [P1] 1.H PATCH status=in_progress**
  - Observed: HTTP 405
  - Expected: 200
- **[TASK-STATUS-IP-DRIFT] [P1] 1.H status=in_progress persisted**
  - Observed: undefined
  - Expected: in_progress
- **[TASK-COMPLETED-FLAG-DRIFT] [P2] 1.H completed flag stays 0 for in_progress**
  - Observed: undefined
  - Expected: 0
- **[TASK-DONE-COMPLETED-FLAG] [P1] 1.H done sets both status and completed**
  - Observed: status=undefined completed=undefined
  - Expected: status=done completed=1

━━━ 1.I  Reopen task — status=todo, completed back to 0 ━━━
- **[TASK-REOPEN-FLAG] [P1] 1.I reopen clears completed**
  - Observed: status=undefined completed=undefined
  - Expected: status=todo completed=0

━━━ 1.J  Attach key_link, verify round-trip + UI display ━━━
- **[TASK-KEYLINK-PATCH] [P1] 1.J PATCH key_link_1**
  - Observed: HTTP 405
  - Expected: 200
- **[TASK-KEYLINK-URL-DRIFT] [P1] 1.J key_link_1 url round-trips**
  - Observed: undefined
  - Expected: https://example.com/deep-audit-task
- **[TASK-KEYLINK-DESC-DRIFT] [P1] 1.J key_link_1_desc round-trips**
  - Observed: undefined
  - Expected: Deep audit link

━━━ 1.K  Post comment with @mention — verify notification fires ━━━
- [PASS] 1.K Comment POST accepted
- [PASS] 1.K Comment visible via GET /comments

━━━ 1.L  Post note via /updates endpoint ━━━
- [PASS] 1.L Note POST accepted
- [PASS] 1.L Note visible via GET /updates

━━━ 1.M  Activity feed contains task creation + updates ━━━
- **[TASK-ACTIVITY-MISSING] [P2] 1.M Activity feed has task-related entries**
  - Observed: 0 entries
  - Expected: >=1 entry (create + edits)

━━━ 1.N  Visibility on /activity page UI ━━━
  INFO: 1.N activity UI does not show task title directly (may aggregate by actor) — not flagged as bug

━━━ 1.O  Soft delete via batch endpoint — verify gone from /tasks ━━━
- [PASS] 1.O Batch delete accepted
- [PASS] 1.O GET task after delete returns null (hard-delete semantics)
- [PASS] 1.O Task hidden from /tasks after delete

──── CLEANUP (1 items) ────
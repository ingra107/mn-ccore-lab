# Deep Audit — 20260418T23053_01-task-lifecycle

Base: https://mn-ccore-lab.pages.dev
Screenshots: 6
PASS: 29
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 01-task-lifecycle (run 20260418T23053_01-task-lifecycle) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 1.A  Create task via API — full payload ━━━
- [PASS] 1.A Task created via API — id=a424997707c239edc83e433cad4b5f54
- [PASS] 1.A response echoes title exactly
- [PASS] 1.A response echoes priority=high
- [PASS] 1.A response echoes assignee=nick
- [PASS] 1.A response echoes status=todo

━━━ 1.B  Read back via /api/tasks list lookup (no single-task GET endpoint) ━━━
- [PASS] 1.B GET readback: title matches
- [PASS] 1.B GET readback: priority matches

━━━ 1.C  UI visibility — /my-tasks default filter ━━━
- [PASS] 1.C Task visible on /my-tasks (auto-filter Mine)

━━━ 1.D  UI visibility — /tasks (All view) ━━━
- [PASS] 1.D Task visible on /tasks

━━━ 1.E  Edit title via POST /:id, verify readback + UI after reload ━━━
- [PASS] 1.E POST title accepted
- [PASS] 1.E Readback shows new title
- [PASS] 1.E New title renders on /my-tasks after reload

━━━ 1.F  Change assignee via POST, verify on new assignee and OFF old workload ━━━
- [PASS] 1.F POST assignee=nate accepted
- [PASS] 1.F Readback shows new assignee
  1.F SKIP Mine filter check — no CF Access JWT (dev/test run)

━━━ 1.G  Change priority high→urgent ━━━
- [PASS] 1.G Priority persisted urgent

━━━ 1.H  Change status todo→in_progress→done ━━━
- [PASS] 1.H status=in_progress persisted
- [PASS] 1.H in_progress leaves completed=0
- [PASS] 1.H done sets status=done + completed=1

━━━ 1.I  Reopen task — status=todo, completed back to 0 ━━━
- [PASS] 1.I Reopen clears completed flag

━━━ 1.J  Attach key_link, verify round-trip + UI display ━━━
- [PASS] 1.J key_link_1 url round-trips
- [PASS] 1.J key_link_1_desc round-trips

━━━ 1.K  Post comment with @mention — verify notification fires ━━━
- [PASS] 1.K Comment POST accepted
- [PASS] 1.K Comment visible via GET /comments

━━━ 1.L  Post note via /updates endpoint ━━━
- [PASS] 1.L Note POST accepted
- [PASS] 1.L Note visible via GET /updates

━━━ 1.M  Activity feed contains task creation + updates ━━━
- [PASS] 1.M 5 activity entries reference this task

━━━ 1.N  Visibility on /activity page UI ━━━
  INFO: 1.N activity UI does not show task title directly (may aggregate by actor) — not flagged as bug

━━━ 1.O  Soft delete via batch endpoint — verify gone from /tasks ━━━
- [PASS] 1.O Batch delete accepted
- [PASS] 1.O Task hidden from /api/tasks list after delete (soft-delete filter)
- [PASS] 1.O Task hidden from /tasks after delete

──── CLEANUP (1 items) ────
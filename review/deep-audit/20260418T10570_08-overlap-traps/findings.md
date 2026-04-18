# Deep Audit — 20260418T10570_08-overlap-traps

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 8
Bugs: 2 (P0 0, P1 1, P2 1)

## Bugs

- **[TASK-DANGLING-PROJECT] [P1] 8.C task with bogus project_id**
  - Observed: accepted and stored
  - Expected: reject OR set project_id=null
- **[TASK-BOGUS-ASSIGNEE] [P2] 8.D task with bogus assignee stored**
  - Observed: accepted as-is
  - Expected: reject OR map to default

## Full trace


══════ SUITE: 08-overlap-traps (run 20260418T10570_08-overlap-traps) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 8.A  Duplicate project title gets distinct slug ━━━
- [PASS] 8.A Distinct slugs generated: overlap-trap-pj1nwv vs overlap-trap-pj1nwv-2

━━━ 8.B  Explicit duplicate slug in payload — server must prevent collision ━━━
- [PASS] 8.B Server side-stepped collision: returned slug=overlap-trap-pj1nwv-3 instead of overlap-trap-pj1nwv

━━━ 8.C  Task referencing nonexistent project_id ━━━
- **[TASK-DANGLING-PROJECT] [P1] 8.C task with bogus project_id**
  - Observed: accepted and stored
  - Expected: reject OR set project_id=null

━━━ 8.D  Task assigned to nonexistent user ━━━
- **[TASK-BOGUS-ASSIGNEE] [P2] 8.D task with bogus assignee stored**
  - Observed: accepted as-is
  - Expected: reject OR map to default

━━━ 8.E  Delete project that has linked tasks ━━━
- [PASS] 8.E Project delete accepted despite linked tasks
- [PASS] 8.E Task retained, project_id reset to null (good orphan handling)

━━━ 8.F  Blank content comment should reject ━━━
- [PASS] 8.F Blank comment rejected with 400

━━━ 8.G  Very long title — stored intact? ━━━
- [PASS] 8.G Long title stored intact (533 chars)

━━━ 8.H  Unicode + emoji in task title ━━━
- [PASS] 8.H Unicode+emoji title round-trips exactly

━━━ 8.I  Rapid-fire status cycle (todo→in_progress→done→todo) ━━━
- [PASS] 8.I All 4 rapid status changes accepted
  8.I final status: done (any of in_progress/done/todo/blocked acceptable)

──── CLEANUP (9 items) ────
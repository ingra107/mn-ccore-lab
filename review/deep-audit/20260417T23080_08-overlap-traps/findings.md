# Deep Audit — 20260417T23080_08-overlap-traps

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 5
Bugs: 5 (P0 2, P1 2, P2 1)

## Bugs

- **[DUP-PROJ-SAME-SLUG] [P0] 8.A Distinct slugs for duplicate title**
  - Observed: both got overlap-trap-aw6sxp
  - Expected: s1 !== s2
- **[DUP-SLUG-ACCEPTED] [P0] 8.B Explicit slug collision prevented**
  - Observed: second create stored slug=overlap-trap-aw6sxp, may have overwritten first
  - Expected: reject OR generate distinct slug
- **[TASK-DANGLING-PROJECT] [P1] 8.C task with bogus project_id**
  - Observed: accepted and stored
  - Expected: reject OR set project_id=null
- **[TASK-BOGUS-ASSIGNEE] [P2] 8.D task with bogus assignee stored**
  - Observed: accepted as-is
  - Expected: reject OR map to default
- **[TASK-ORPHAN-DANGLING-REF] [P1] 8.E deleted-project task has dangling project_id**
  - Observed: project_id=overlap-trap-aw6sxp
  - Expected: null (project gone) OR task deleted

## Full trace


══════ SUITE: 08-overlap-traps (run 20260417T23080_08-overlap-traps) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 8.A  Duplicate project title gets distinct slug ━━━
- **[DUP-PROJ-SAME-SLUG] [P0] 8.A Distinct slugs for duplicate title**
  - Observed: both got overlap-trap-aw6sxp
  - Expected: s1 !== s2

━━━ 8.B  Explicit duplicate slug in payload — server must prevent collision ━━━
- **[DUP-SLUG-ACCEPTED] [P0] 8.B Explicit slug collision prevented**
  - Observed: second create stored slug=overlap-trap-aw6sxp, may have overwritten first
  - Expected: reject OR generate distinct slug

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
- **[TASK-ORPHAN-DANGLING-REF] [P1] 8.E deleted-project task has dangling project_id**
  - Observed: project_id=overlap-trap-aw6sxp
  - Expected: null (project gone) OR task deleted

━━━ 8.F  Blank content comment should reject ━━━
- [PASS] 8.F Blank comment rejected with 400

━━━ 8.G  Very long title — stored intact? ━━━
- [PASS] 8.G Long title stored intact (533 chars)

━━━ 8.H  Unicode + emoji in task title ━━━
- [PASS] 8.H Unicode+emoji title round-trips exactly

━━━ 8.I  Rapid-fire status cycle (todo→in_progress→done→todo) ━━━
- [PASS] 8.I All 4 rapid status changes accepted
  8.I final status: blocked (any of in_progress/done/todo/blocked acceptable)

──── CLEANUP (9 items) ────
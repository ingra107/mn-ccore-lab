# Deep Audit — 20260418T23074_08-overlap-traps

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 10
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 08-overlap-traps (run 20260418T23074_08-overlap-traps) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 8.A  Duplicate project title gets distinct slug ━━━
- [PASS] 8.A Distinct slugs generated: overlap-trap-oki1av vs overlap-trap-oki1av-2

━━━ 8.B  Explicit duplicate slug in payload — server must prevent collision ━━━
- [PASS] 8.B Server side-stepped collision: returned slug=overlap-trap-oki1av-3 instead of overlap-trap-oki1av

━━━ 8.C  Task referencing nonexistent project_id ━━━
- [PASS] 8.C Server dropped bogus project_id → stored as null

━━━ 8.D  Task assigned to nonexistent user ━━━
- [PASS] 8.D Server rejected bogus assignee with HTTP 400

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

──── CLEANUP (8 items) ────
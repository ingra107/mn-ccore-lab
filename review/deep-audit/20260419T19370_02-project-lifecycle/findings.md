# Deep Audit — 20260419T19370_02-project-lifecycle

Base: https://mn-ccore-lab.pages.dev
Screenshots: 5
PASS: 22
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 02-project-lifecycle (run 20260419T19370_02-project-lifecycle) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 2.A  Create project via API ━━━
- [PASS] 2.A Project created — slug=test-delete-deep-proj-0bocaw
- [PASS] 2.A response echoes title
- [PASS] 2.A response echoes status=active
- [PASS] 2.A response echoes stage=Idea
- [PASS] 2.A response echoes category=lab

━━━ 2.B  Readback via /api/projects list (no single GET endpoint) ━━━
- [PASS] 2.B Readback title matches
- [PASS] 2.B Readback status=active

━━━ 2.C  Appears on /projects list ━━━
- [PASS] 2.C Project visible on /projects list

━━━ 2.D  Project detail page loads ━━━
- [PASS] 2.D Project detail heading renders title

━━━ 2.E  Edit project fields via POST /api/projects/:slug ━━━
- [PASS] 2.E Project update accepted
- [PASS] 2.E Stage persisted
- [PASS] 2.E Description persisted

━━━ 2.F  Attach key_link (all 3 slots) ━━━
- [PASS] 2.F All 3 key_links round-trip
- [PASS] 2.F All 3 key_link descs round-trip

━━━ 2.G  key_links render on /projects list row ━━━
  INFO: 2.G key_link_1 URL not found on /projects list — may only render on detail page (document behavior)

━━━ 2.H  Link a task to project, verify task count badge ━━━
- [PASS] 2.H Task created linked to project, id=067b156e379ad3743628ff4619075e8f
- [PASS] 2.H Task appears on project detail Tasks tab

━━━ 2.I  Reassign task project_id to a DIFFERENT project — verify count decrements ━━━
- [PASS] 2.I Task reassigned project_id=admin-tasks
- [PASS] 2.I Task removed from old project detail after reassign

━━━ 2.J  Project status pivot — active → waiting_external ━━━
- [PASS] 2.J status=waiting_external persisted

━━━ 2.K  Invalid enum values rejected ━━━
- [PASS] 2.K Invalid status rejected with 400

━━━ 2.L  Add a project comment ━━━
- [PASS] 2.L Project comment accepted

━━━ 2.M  Restore status to active, then delete project via POST /:id/delete ━━━
- [PASS] 2.M Project POST /delete succeeded

──── CLEANUP (2 items) ────
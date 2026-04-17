# Deep Audit — 20260417T21365_02-project-lifecycle

Base: https://mn-ccore-lab.pages.dev
Screenshots: 5
PASS: 10
Bugs: 12 (P0 3, P1 8, P2 1)

## Bugs

- **[PROJ-GET-NOT-FOUND] [P0] 2.B GET /api/projects/:slug**
  - Observed: null/404
  - Expected: full project row
- **[PROJ-UPDATE-FAIL] [P0] 2.E PUT /api/projects/:slug**
  - Observed: HTTP 404
  - Expected: 200
- **[PROJ-STAGE-NOT-PERSISTED] [P0] 2.E stage persisted**
  - Observed: undefined
  - Expected: Data Collection
- **[PROJ-DESC-NOT-PERSISTED] [P1] 2.E description persisted**
  - Observed: undefined
  - Expected: test_delete_deep_proj_kofqut updated description
- **[PROJ-KEYLINKS-FAIL] [P1] 2.F PUT project key_links**
  - Observed: HTTP 404
  - Expected: 200
- **[PROJ-KEYLINKS-DRIFT] [P1] 2.F all 3 key_links round-trip**
  - Observed: {}
  - Expected: all 3 urls match
- **[PROJ-KEYLINKS-DESC-DRIFT] [P1] 2.F all 3 key_link descs round-trip**
  - Observed: {}
  - Expected: all 3 descs match
- **[PROJ-TASK-NOT-ON-DETAIL] [P1] 2.H linked task on project detail**
  - Observed: title not found
  - Expected: "test_delete_deep_proj_task_kdl8hf" visible
- **[PROJ-STATUS-PIVOT] [P1] 2.J status waiting_external**
  - Observed: HTTP 404
  - Expected: 200
- **[PROJ-STATUS-NOT-PERSISTED] [P1] 2.J status pivot persisted**
  - Observed: undefined
  - Expected: waiting_external
- **[PROJ-COMMENT-POST] [P1] 2.L POST project comment**
  - Observed: HTTP 404
  - Expected: 200
- **[PROJ-DELETE-NOT-IMPL] [P2] 2.M DELETE /api/projects/:slug implemented**
  - Observed: HTTP 405
  - Expected: DELETE endpoint exists

## Full trace


══════ SUITE: 02-project-lifecycle (run 20260417T21365_02-project-lifecycle) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 2.A  Create project via API ━━━
- [PASS] 2.A Project created — slug=test-delete-deep-proj-kofqut
- [PASS] 2.A response echoes title
- [PASS] 2.A response echoes status=active
- [PASS] 2.A response echoes stage=Idea
- [PASS] 2.A response echoes category=lab

━━━ 2.B  Readback via GET /api/projects/:slug ━━━
- **[PROJ-GET-NOT-FOUND] [P0] 2.B GET /api/projects/:slug**
  - Observed: null/404
  - Expected: full project row

━━━ 2.C  Appears on /projects list ━━━
- [PASS] 2.C Project visible on /projects list

━━━ 2.D  Project detail page loads ━━━
- [PASS] 2.D Project detail heading renders title

━━━ 2.E  Edit project fields via PUT /api/projects/:slug ━━━
- **[PROJ-UPDATE-FAIL] [P0] 2.E PUT /api/projects/:slug**
  - Observed: HTTP 404
  - Expected: 200
- **[PROJ-STAGE-NOT-PERSISTED] [P0] 2.E stage persisted**
  - Observed: undefined
  - Expected: Data Collection
- **[PROJ-DESC-NOT-PERSISTED] [P1] 2.E description persisted**
  - Observed: undefined
  - Expected: test_delete_deep_proj_kofqut updated description

━━━ 2.F  Attach key_link (all 3 slots) ━━━
- **[PROJ-KEYLINKS-FAIL] [P1] 2.F PUT project key_links**
  - Observed: HTTP 404
  - Expected: 200
- **[PROJ-KEYLINKS-DRIFT] [P1] 2.F all 3 key_links round-trip**
  - Observed: {}
  - Expected: all 3 urls match
- **[PROJ-KEYLINKS-DESC-DRIFT] [P1] 2.F all 3 key_link descs round-trip**
  - Observed: {}
  - Expected: all 3 descs match

━━━ 2.G  key_links render on /projects list row ━━━
  INFO: 2.G key_link_1 URL not found on /projects list — may only render on detail page (document behavior)

━━━ 2.H  Link a task to project, verify task count badge ━━━
- [PASS] 2.H Task created linked to project, id=2ce29e234b7c91e2392286587b063b0a
- **[PROJ-TASK-NOT-ON-DETAIL] [P1] 2.H linked task on project detail**
  - Observed: title not found
  - Expected: "test_delete_deep_proj_task_kdl8hf" visible

━━━ 2.I  Reassign task project_id to a DIFFERENT project — verify count decrements ━━━
- [PASS] 2.I Task reassigned project_id=admin-tasks
- [PASS] 2.I Task removed from old project detail after reassign

━━━ 2.J  Project status pivot — active → waiting_external ━━━
- **[PROJ-STATUS-PIVOT] [P1] 2.J status waiting_external**
  - Observed: HTTP 404
  - Expected: 200
- **[PROJ-STATUS-NOT-PERSISTED] [P1] 2.J status pivot persisted**
  - Observed: undefined
  - Expected: waiting_external

━━━ 2.K  Invalid enum values rejected ━━━
  INFO: 2.K invalid status returned 404 — not 400/422 but not success either

━━━ 2.L  Add a project comment ━━━
- **[PROJ-COMMENT-POST] [P1] 2.L POST project comment**
  - Observed: HTTP 404
  - Expected: 200

━━━ 2.M  Restore status to active, then delete project ━━━
- **[PROJ-DELETE-NOT-IMPL] [P2] 2.M DELETE /api/projects/:slug implemented**
  - Observed: HTTP 405
  - Expected: DELETE endpoint exists

──── CLEANUP (2 items) ────
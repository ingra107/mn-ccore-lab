# Deep Audit — 20260418T00353_03-content-entities

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 9
Bugs: 5 (P0 0, P1 4, P2 1)

## Bugs

- **[GRANT-CREATE-FAIL] [P1] 3.C POST /api/grants**
  - Observed: HTTP 404
  - Expected: 200
- **[QUESTION-ANSWER-POST] [P1] 3.G POST /api/questions/:id/answers**
  - Observed: HTTP 400
  - Expected: 200
- **[QUESTION-ANSWER-GET] [P1] 3.G GET /answers after POST**
  - Observed: 0
  - Expected: >=1
- **[REV-CREATE-FAIL] [P2] 3.H POST /api/projects/:slug/revisions**
  - Observed: HTTP 404
  - Expected: 200
- **[DIGEST-SAVE-FAIL] [P1] 3.I POST /api/digest/:id**
  - Observed: HTTP 404
  - Expected: 200

## Full trace


══════ SUITE: 03-content-entities (run 20260418T00353_03-content-entities) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 3.A  Meeting lifecycle — create + action items ━━━
- [PASS] 3.A Meeting mtg-2026-05-01-a6b20ee8 created
- [PASS] 3.A title echoed
- [PASS] 3.A date echoed
- [PASS] 3.A Meeting appears in /api/meetings list

━━━ 3.B  Meeting action item creates linked task ━━━
- [PASS] 3.B Action-item task linked via meeting_id
- [PASS] 3.B source=meeting on action task
- [PASS] 3.B /api/tasks?meeting filter returns action item

━━━ 3.C  Grant lifecycle ━━━
- **[GRANT-CREATE-FAIL] [P1] 3.C POST /api/grants**
  - Observed: HTTP 404
  - Expected: 200

━━━ 3.F  Ask-the-lab question lifecycle ━━━
- [PASS] 3.F Question 9ab82bec2c73707d0f9e21b026880e47 created

━━━ 3.G  Answer the question ━━━
- **[QUESTION-ANSWER-POST] [P1] 3.G POST /api/questions/:id/answers**
  - Observed: HTTP 400
  - Expected: 200
- **[QUESTION-ANSWER-GET] [P1] 3.G GET /answers after POST**
  - Observed: 0
  - Expected: >=1

━━━ 3.H  Paper revision tracking ━━━
- **[REV-CREATE-FAIL] [P2] 3.H POST /api/projects/:slug/revisions**
  - Observed: HTTP 404
  - Expected: 200

━━━ 3.I  Digest papers endpoint — save / dismiss ━━━
- **[DIGEST-SAVE-FAIL] [P1] 3.I POST /api/digest/:id**
  - Observed: HTTP 404
  - Expected: 200

━━━ 3.J  Digest comment round-trip ━━━
- [PASS] 3.J Digest comment round-trips

──── CLEANUP (3 items) ────
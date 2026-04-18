# Deep Audit — 20260418T00374_03-content-entities

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 12
Bugs: 2 (P0 0, P1 1, P2 1)

## Bugs

- **[QUESTION-ANSWER-GET] [P1] 3.G GET /answers after POST**
  - Observed: 0
  - Expected: >=1
- **[REV-CREATE-FAIL] [P2] 3.H POST /api/revisions**
  - Observed: HTTP 400
  - Expected: 200

## Full trace


══════ SUITE: 03-content-entities (run 20260418T00374_03-content-entities) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 3.A  Meeting lifecycle — create + action items ━━━
- [PASS] 3.A Meeting mtg-2026-05-01-3e0096fa created
- [PASS] 3.A title echoed
- [PASS] 3.A date echoed
- [PASS] 3.A Meeting appears in /api/meetings list

━━━ 3.B  Meeting action item creates linked task ━━━
- [PASS] 3.B Action-item task linked via meeting_id
- [PASS] 3.B source=meeting on action task
- [PASS] 3.B /api/tasks?meeting filter returns action item

━━━ 3.C  Grant endpoint responds (no POST /api/grants by design) ━━━
- [PASS] 3.C /api/grants returned 5 rows

━━━ 3.F  Ask-the-lab question lifecycle ━━━
- [PASS] 3.F Question 01bda6399d652c503fac1bd9628e9f73 created

━━━ 3.G  Answer the question (body uses "content", not "answer") ━━━
- [PASS] 3.G Answer POST accepted
- **[QUESTION-ANSWER-GET] [P1] 3.G GET /answers after POST**
  - Observed: 0
  - Expected: >=1

━━━ 3.H  Paper revision tracking — POST /api/revisions (not /api/projects/:slug/revisions) ━━━
- **[REV-CREATE-FAIL] [P2] 3.H POST /api/revisions**
  - Observed: HTTP 400
  - Expected: 200

━━━ 3.I  Digest papers endpoint — save/dismiss (uses POST /:id/status) ━━━
- [PASS] 3.I Digest save persisted

━━━ 3.J  Digest comment round-trip ━━━
- [PASS] 3.J Digest comment round-trips

──── CLEANUP (3 items) ────
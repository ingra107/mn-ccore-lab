# Deep Audit — 20260418T21180_03-content-entities

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 14
Bugs: 1 (P0 0, P1 1, P2 0)

## Bugs

- **[QUESTION-ANSWER-GET] [P1] 3.G GET /answers after POST**
  - Observed: 0
  - Expected: >=1

## Full trace


══════ SUITE: 03-content-entities (run 20260418T21180_03-content-entities) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 3.A  Meeting lifecycle — create + action items ━━━
- [PASS] 3.A Meeting mtg-2026-05-01-6bf789a5 created
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
- [PASS] 3.F Question abfc26ce1f35dd517998a48935b18a1d created

━━━ 3.G  Answer the question (body uses "content", not "answer") ━━━
- [PASS] 3.G Answer POST accepted
- **[QUESTION-ANSWER-GET] [P1] 3.G GET /answers after POST**
  - Observed: 0
  - Expected: >=1

━━━ 3.H  Paper revision tracking — POST /api/revisions (not /api/projects/:slug/revisions) ━━━
- [PASS] 3.H Revision 10a03a6e7cc1e5493f728ae068bcb5bb created on mceachron-central-line-days-disparities
- [PASS] 3.H Revision in /projects/:slug/revisions list

━━━ 3.I  Digest papers endpoint — save/dismiss (uses POST /:id/status) ━━━
- [PASS] 3.I Digest save persisted

━━━ 3.J  Digest comment round-trip ━━━
- [PASS] 3.J Digest comment round-trips

──── CLEANUP (3 items) ────
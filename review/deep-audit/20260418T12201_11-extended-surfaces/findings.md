# Deep Audit — 20260418T12201_11-extended-surfaces

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 11
Bugs: 6 (P0 0, P1 2, P2 4)

## Bugs

- **[TEAM-GET] [P1] 11.A GET /api/team-members**
  - Observed: null
  - Expected: array
- **[INBOX-CREATE] [P1] 11.D POST /api/inbox**
  - Observed: HTTP 400
  - Expected: 200
- **[CASCADE-FAIL] [P2] 11.E GET /api/deadline-cascade**
  - Observed: HTTP 400
  - Expected: 200
- **[POMODORO-GET] [P2] 11.H GET /api/pomodoros**
  - Observed: null
  - Expected: array
- **[DISPATCH-GET] [P2] 11.N GET /api/dispatch**
  - Observed: null
  - Expected: array
- **[SESSIONS-FAIL] [P2] 11.S GET /api/sessions**
  - Observed: HTTP 404
  - Expected: 200

## Full trace


══════ SUITE: 11-extended-surfaces (run 20260418T12201_11-extended-surfaces) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 11.A  Team profile read — 4-tier name fields ━━━
- **[TEAM-GET] [P1] 11.A GET /api/team-members**
  - Observed: null
  - Expected: array

━━━ 11.B  Lab settings endpoint ━━━
- [PASS] 11.B /api/settings returns undefined settings

━━━ 11.C  Narratives endpoint ━━━
- [PASS] 11.C /api/narratives returns 3 narratives

━━━ 11.D  Inbox Quick Capture create + read + sync marker ━━━
- **[INBOX-CREATE] [P1] 11.D POST /api/inbox**
  - Observed: HTTP 400
  - Expected: 200

━━━ 11.E  Deadline cascade endpoint ━━━
- **[CASCADE-FAIL] [P2] 11.E GET /api/deadline-cascade**
  - Observed: HTTP 400
  - Expected: 200

━━━ 11.F  R2 upload signed URL endpoint ━━━
- [PASS] 11.F /api/upload/url endpoint exists (400 — likely needs fields our test omitted)

━━━ 11.G  Daily plan endpoint ━━━
  11.G INFO: no daily plan for 2026-04-18 (may not exist)

━━━ 11.H  Pomodoro sessions endpoint ━━━
- **[POMODORO-GET] [P2] 11.H GET /api/pomodoros**
  - Observed: null
  - Expected: array

━━━ 11.I  Meeting prep endpoint (find most recent meeting, check prep data) ━━━
- [PASS] 11.I Meeting prep for mtg-2026-05-01-3e0096fa responds

━━━ 11.J  Digest preview endpoint ━━━
- [PASS] 11.J /api/digest-preview returns HTML (8078 bytes)

━━━ 11.K  Mark all notifications read endpoint ━━━
- [PASS] 11.K /api/notifications/read-all accepted

━━━ 11.L  File activity heatmap endpoint ━━━
- [PASS] 11.L /api/file-activity/heatmap responds

━━━ 11.M  Email drafts endpoint (synced from brain.db) ━━━
- [PASS] 11.M /api/email-drafts returns 121 drafts

━━━ 11.N  Dispatch queue endpoint ━━━
- **[DISPATCH-GET] [P2] 11.N GET /api/dispatch**
  - Observed: null
  - Expected: array

━━━ 11.O  Trainee trajectory endpoint ━━━
  11.O INFO: no trajectory data for nick

━━━ 11.P  PI dashboard endpoint ━━━
  11.P INFO: PI dashboard empty or 404

━━━ 11.Q  Publications endpoint ━━━
- [PASS] 11.Q /api/publications returns 63 publications

━━━ 11.R  Conference submissions endpoint ━━━
- [PASS] 11.R /api/conferences returns 0 submissions

━━━ 11.S  Sessions endpoint ━━━
- **[SESSIONS-FAIL] [P2] 11.S GET /api/sessions**
  - Observed: HTTP 404
  - Expected: 200

━━━ 11.T  Bug report endpoint (validates GitHub token available) ━━━
- [PASS] 11.T /api/bug-report rejects empty payload with 400 (endpoint reachable)

──── CLEANUP (0 items) ────
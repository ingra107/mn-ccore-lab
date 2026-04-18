# Deep Audit — 20260418T20575_11-extended-surfaces

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 19
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 11-extended-surfaces (run 20260418T20575_11-extended-surfaces) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 11.A  Team profile read — 4-tier name fields (endpoint is /api/team) ━━━
- [PASS] 11.A /api/team-members returns 19 members
- [PASS] 11.A Nick has ≥1 tier field populated (schema v41 migration verified)

━━━ 11.B  Lab settings endpoint ━━━
- [PASS] 11.B /api/settings returns undefined settings

━━━ 11.C  Narratives endpoint ━━━
- [PASS] 11.C /api/narratives returns 3 narratives

━━━ 11.D  Inbox Quick Capture create + read + sync marker ━━━
- [PASS] 11.D Inbox entry 093e01f3-30e9-4bfd-99f8-4fb24a7a48dc created
- [PASS] 11.D Inbox entry appears in /api/inbox list

━━━ 11.E  Deadline cascade — /all returns the full graph ━━━
- [PASS] 11.E /api/deadline-cascade/all responds OK

━━━ 11.F  R2 upload signed URL endpoint ━━━
- [PASS] 11.F /api/upload/url endpoint exists (400 — likely needs fields our test omitted)

━━━ 11.G  Daily plan endpoint ━━━
  11.G INFO: no daily plan for 2026-04-18 (may not exist)

━━━ 11.H  Pomodoro endpoints (POST /api/pb/pomodoro/start and /complete) ━━━
- [PASS] 11.H /api/pb/pomodoro/start reachable (400)

━━━ 11.I  Meeting prep endpoint (find most recent meeting, check prep data) ━━━
- [PASS] 11.I Meeting prep for mtg-2026-05-01-875000b2 responds

━━━ 11.J  Digest preview endpoint ━━━
- [PASS] 11.J /api/digest-preview returns HTML (8985 bytes)

━━━ 11.K  Mark all notifications read endpoint ━━━
- [PASS] 11.K /api/notifications/read-all accepted

━━━ 11.L  File activity heatmap endpoint ━━━
- [PASS] 11.L /api/file-activity/heatmap responds

━━━ 11.M  Email drafts endpoint (synced from brain.db) ━━━
- [PASS] 11.M /api/email-drafts returns 122 drafts

━━━ 11.N  Dispatch queue endpoint (/api/pb/dispatch/pending) ━━━
- [PASS] 11.N /api/pb/dispatch/pending returns 0 items

━━━ 11.O  Trainee trajectory endpoint ━━━
  11.O INFO: no trajectory data for nick

━━━ 11.P  PI dashboard endpoint ━━━
  11.P INFO: PI dashboard empty or 404

━━━ 11.Q  Publications endpoint ━━━
- [PASS] 11.Q /api/publications returns 63 publications

━━━ 11.R  Conference submissions endpoint ━━━
- [PASS] 11.R /api/conferences returns 0 submissions

━━━ 11.S  PB sessions endpoint (/api/pb/sessions) ━━━
- [PASS] 11.S /api/pb/sessions returns 50 sessions

━━━ 11.T  Bug report endpoint (validates GitHub token available) ━━━
- [PASS] 11.T /api/bug-report rejects empty payload with 400 (endpoint reachable)

──── CLEANUP (1 items) ────
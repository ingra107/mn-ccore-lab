# Deep Audit — 20260418T12225_11-extended-surfaces

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 5
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 11-extended-surfaces (run 20260418T12225_11-extended-surfaces) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 11.A  Team profile read — 4-tier name fields (endpoint is /api/team) ━━━
- [PASS] 11.A /api/team-members returns 19 members
- [PASS] 11.A Nick has ≥1 tier field populated (schema v41 migration verified)

━━━ 11.B  Lab settings endpoint ━━━
- [PASS] 11.B /api/settings returns undefined settings

━━━ 11.C  Narratives endpoint ━━━
- [PASS] 11.C /api/narratives returns 3 narratives

━━━ 11.D  Inbox Quick Capture create + read + sync marker ━━━
- [PASS] 11.D Inbox entry 7c1d779a-3c71-4cb3-9937-96239f427d11 created

⚠ FATAL: inbox?.find is not a function
TypeError: inbox?.find is not a function
    at main (C:\Users\ingra\mn-ccore-lab\scripts\deep-audit\11-extended-surfaces.ts:66:28)

──── CLEANUP (1 items) ────
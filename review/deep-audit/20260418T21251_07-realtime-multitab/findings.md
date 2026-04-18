# Deep Audit — 20260418T21251_07-realtime-multitab

Base: https://mn-ccore-lab.pages.dev
Screenshots: 1
PASS: 5
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 07-realtime-multitab (run 20260418T21251_07-realtime-multitab) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 7.A  Create a task via API — will use as shared subject ━━━
- [PASS] 7.A Task 270c71f07a8e2d768726daa5cd3384bc ready

━━━ 7.B  Open 2 independent browser contexts to /tasks ━━━
  7.B tab B initial network: 3 /api/version+/api/tasks calls in first 3s
- [PASS] 7.B Both tabs show task

━━━ 7.C  Mutate in tab A (priority=urgent) — tab B should pick up without reload ━━━
- [PASS] 7.C Tab B picked up priority=urgent without reload (~12s)

━━━ 7.D  Race — 5 rapid edits across both tabs ━━━
- [PASS] 7.D All 5 concurrent edits accepted
  7.D final priority after race: urgent (last-write-wins: expect "high" as last payload)
  7.D LWW may not have converged on last-issued edit — race ordering is non-deterministic across 2 API workers

━━━ 7.E  Close tab A, edit from tab B only — tab B reflects own change fast ━━━
- [PASS] 7.E Single-tab propagation reflects own change (~13s)

──── CLEANUP (1 items) ────
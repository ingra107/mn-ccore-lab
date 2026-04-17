# Deep Audit — 20260417T23104_07-realtime-multitab

Base: https://mn-ccore-lab.pages.dev
Screenshots: 1
PASS: 5
Bugs: 1 (P0 0, P1 1, P2 0)

## Bugs

- **[RT-NO-PROPAGATION] [P1] 7.C tab B sees priority change without reload**
  - Observed: no urgent text found in 20s window
  - Expected: urgent text visible after WS/poll push

## Full trace


══════ SUITE: 07-realtime-multitab (run 20260417T23104_07-realtime-multitab) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 7.A  Create a task via API — will use as shared subject ━━━
- [PASS] 7.A Task 51d7af6c0db0ee06e419a411ed641fe5 ready

━━━ 7.B  Open 2 independent browser contexts to /tasks ━━━
- [PASS] 7.B Both tabs show task

━━━ 7.C  Mutate in tab A (priority=urgent) — tab B should pick up without reload ━━━
- **[RT-NO-PROPAGATION] [P1] 7.C tab B sees priority change without reload**
  - Observed: no urgent text found in 20s window
  - Expected: urgent text visible after WS/poll push

━━━ 7.D  Race — 5 rapid edits across both tabs ━━━
- [PASS] 7.D All 5 concurrent edits accepted
  7.D final priority after race: high (last-write-wins: expect "high" as last payload)
- [PASS] 7.D LWW converged on last edit

━━━ 7.E  Close tab A, edit from tab B only — tab B reflects own change fast ━━━
- [PASS] 7.E Single-tab propagation reflects own change (~0s)

──── CLEANUP (1 items) ────
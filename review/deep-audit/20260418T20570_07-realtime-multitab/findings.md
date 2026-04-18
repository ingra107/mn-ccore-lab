# Deep Audit — 20260418T20570_07-realtime-multitab

Base: https://mn-ccore-lab.pages.dev
Screenshots: 1
PASS: 5
Bugs: 1 (P0 0, P1 1, P2 0)

## Bugs

- **[RT-SELF-PROPAGATION] [P1] 7.E tab sees its own recent change within 20s**
  - Observed: not seen
  - Expected: priority=low visible

## Full trace


══════ SUITE: 07-realtime-multitab (run 20260418T20570_07-realtime-multitab) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 7.A  Create a task via API — will use as shared subject ━━━
- [PASS] 7.A Task 18dc4d649d40abb79337abd723f1710e ready

━━━ 7.B  Open 2 independent browser contexts to /tasks ━━━
  7.B tab B initial network: 3 /api/version+/api/tasks calls in first 3s
- [PASS] 7.B Both tabs show task

━━━ 7.C  Mutate in tab A (priority=urgent) — tab B should pick up without reload ━━━
- [PASS] 7.C Tab B picked up priority=urgent without reload (~11s)

━━━ 7.D  Race — 5 rapid edits across both tabs ━━━
- [PASS] 7.D All 5 concurrent edits accepted
  7.D final priority after race: high (last-write-wins: expect "high" as last payload)
- [PASS] 7.D LWW converged on last edit

━━━ 7.E  Close tab A, edit from tab B only — tab B reflects own change fast ━━━
- **[RT-SELF-PROPAGATION] [P1] 7.E tab sees its own recent change within 20s**
  - Observed: not seen
  - Expected: priority=low visible

──── CLEANUP (1 items) ────
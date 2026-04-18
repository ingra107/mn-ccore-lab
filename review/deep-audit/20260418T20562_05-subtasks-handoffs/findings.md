# Deep Audit — 20260418T20562_05-subtasks-handoffs

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 8
Bugs: 2 (P0 0, P1 2, P2 0)

## Bugs

- **[HO-POST-FAIL] [P1] 5.D POST /api/tasks/:id/handoffs**
  - Observed: HTTP 400
  - Expected: 200
- **[ACK-BY-DRIFT] [P1] 5.E acknowledged_by persists**
  - Observed: anonymous
  - Expected: mesfin

## Full trace


══════ SUITE: 05-subtasks-handoffs (run 20260418T20562_05-subtasks-handoffs) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 5.A  Create parent task with 3 subtasks ━━━
- [PASS] 5.A Parent task 2233217d3f3b31490984028ee70b873d
- [PASS] 5.A All 3 subtasks created

━━━ 5.B  GET subtasks — returns all 3 with order preserved ━━━
- [PASS] 5.B GET returns 3 subtasks
- [PASS] 5.B Order matches insertion order

━━━ 5.C  Complete one subtask — state persists ━━━
- [PASS] 5.C Subtask /toggle accepted
- [PASS] 5.C Subtask completed=1 persisted

━━━ 5.D  Task handoff request — nick → mesfin ━━━
- **[HO-POST-FAIL] [P1] 5.D POST /api/tasks/:id/handoffs**
  - Observed: HTTP 400
  - Expected: 200

━━━ 5.E  Acknowledge task (closed-loop CRM pattern) ━━━
- [PASS] 5.E Acknowledge POST accepted
- [PASS] 5.E acknowledged_at timestamp set: 2026-04-18T20:57:13.290Z
- **[ACK-BY-DRIFT] [P1] 5.E acknowledged_by persists**
  - Observed: anonymous
  - Expected: mesfin

━━━ 5.F  Complete parent — subtasks also marked? (product behavior check) ━━━
  5.F Parent done → 1/3 subtasks auto-done (product decision: current behavior documented)

──── CLEANUP (2 items) ────
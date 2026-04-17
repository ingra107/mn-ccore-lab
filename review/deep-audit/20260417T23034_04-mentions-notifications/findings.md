# Deep Audit — 20260417T23034_04-mentions-notifications

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 13
Bugs: 2 (P0 0, P1 2, P2 0)

## Bugs

- **[MENTION-SOURCE-WRONG] [P1] 4.C notification cites task comment**
  - Observed: source_type=task_comment source_id=7d502a62d9d110be2c541d3ef7f97eb1
  - Expected: source_type=task_comment source_id=6892c6d2f8f1fdf17cd1f8223256408d
- **[NOTIF-READ-NOT-PERSISTED] [P1] 4.L read_at persists**
  - Observed: undefined
  - Expected: non-null timestamp

## Full trace


══════ SUITE: 04-mentions-notifications (run 20260417T23034_04-mentions-notifications) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 4.A  Baseline notification counts for mesfin + dudley ━━━
- [PASS] 4.A baselines — mesfin=0 dudley=0 nick=50

━━━ 4.B  Create a task to mention people about ━━━
- [PASS] 4.B Task created 6892c6d2f8f1fdf17cd1f8223256408d

━━━ 4.C  Task comment with SINGLE @mesfin → mesfin gets +1 notification ━━━
- [PASS] 4.C mesfin got exactly +1 notification (was 0, now 1)
- **[MENTION-SOURCE-WRONG] [P1] 4.C notification cites task comment**
  - Observed: source_type=task_comment source_id=7d502a62d9d110be2c541d3ef7f97eb1
  - Expected: source_type=task_comment source_id=6892c6d2f8f1fdf17cd1f8223256408d

━━━ 4.D  Task comment with DOUBLE @mesfin @dudley → mesfin +1 AND dudley +1 ━━━
- [PASS] 4.D mesfin got +1 more (now 2)
- [PASS] 4.D dudley got +1 (now 1)

━━━ 4.E  Self-mention @nick (author) → NO notification for nick ━━━
- [PASS] 4.E nick NOT self-notified (delta=0)

━━━ 4.F  Invalid @mention (nonexistent slug) → no notification for anyone ━━━
- [PASS] 4.F invalid @mention produced no notification for mesfin

━━━ 4.G  Task note via /updates — no mentions → no new notifications ━━━
- [PASS] 4.G plain note did not notify anyone

━━━ 4.H  Task note WITH @mesfin mention → mesfin +1 ━━━
- [PASS] 4.H note with @mesfin produced +1 notification

━━━ 4.I  Create a project to test project-comment mention fan-out ━━━
- [PASS] 4.I Project created test-delete-deep-mention-proj-ir5hlv

━━━ 4.J  Project comment with @dudley → dudley +1 notification ━━━
- [PASS] 4.J Project comment POST accepted
- [PASS] 4.J dudley got +1 from project comment @mention

━━━ 4.K  @hermes mention → ai_requests row (background listener picks it up) ━━━
  INFO: 4.K no @claude-ai placeholder on this task — check if @hermes path is task-only vs project-only

━━━ 4.L  Mark notification read — read_at stamps ━━━
- [PASS] 4.L POST /notifications/:id/read accepted
- **[NOTIF-READ-NOT-PERSISTED] [P1] 4.L read_at persists**
  - Observed: undefined
  - Expected: non-null timestamp

──── CLEANUP (2 items) ────
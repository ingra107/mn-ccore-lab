# Deep Audit — 20260418T21180_04-mentions-notifications

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 15
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 04-mentions-notifications (run 20260418T21180_04-mentions-notifications) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 4.A  Baseline notification counts for nate + dudley ━━━
- [PASS] 4.A baselines — nate=0 dudley=3 nick=50

━━━ 4.B  Create a task to mention people about ━━━
- [PASS] 4.B Task created b96c6b6d2dcb855595c3664389b1158b

━━━ 4.C  Task comment with SINGLE @nate → nate gets +1 notification ━━━
- [PASS] 4.C nate got exactly +1 notification (was 0, now 1)
- [PASS] 4.C notification source_type+id correct

━━━ 4.D  Task comment with DOUBLE @nate @dudley → nate +1 AND dudley +1 ━━━
- [PASS] 4.D nate got +1 more (now 2)
- [PASS] 4.D dudley got +1 (now 4)

━━━ 4.E  Self-mention @nick (author) → NO notification for nick ━━━
- [PASS] 4.E nick NOT self-notified (delta=0)

━━━ 4.F  Invalid @mention (nonexistent slug) → no notification for anyone ━━━
- [PASS] 4.F invalid @mention produced no notification for nate

━━━ 4.G  Task note via /updates — no mentions → no new notifications ━━━
- [PASS] 4.G plain note did not notify anyone

━━━ 4.H  Task note WITH @nate mention → nate +1 ━━━
- [PASS] 4.H note with @nate produced +1 notification

━━━ 4.I  Create a project to test project-comment mention fan-out ━━━
- [PASS] 4.I Project created test-delete-deep-mention-proj-4y9umn

━━━ 4.J  Project comment with @dudley → dudley +1 notification ━━━
- [PASS] 4.J Project comment POST accepted
- [PASS] 4.J dudley got +1 from project comment @mention

━━━ 4.K  @hermes mention → ai_requests row (background listener picks it up) ━━━
  INFO: 4.K no @claude-ai placeholder on this task — check if @hermes path is task-only vs project-only

━━━ 4.L  Mark notification read — read_at stamps ━━━
- [PASS] 4.L POST /notifications/:id/read accepted
- [PASS] 4.L read_at timestamp set

──── CLEANUP (2 items) ────
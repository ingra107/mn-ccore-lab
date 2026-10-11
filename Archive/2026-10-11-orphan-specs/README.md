Archived 2026-10-11 (s51 dead-weight lane). Five Playwright specs that no config selects.

Proof: all nine playwright.config*.ts testMatch lists skip them (prod runs smoke + inspection only). `npx playwright test tests/task-delete.spec.ts tests/m5-workflow-smoke.spec.ts --config=playwright.config.prod.ts --list` printed 'No tests found'. git grep for audit-newteammate finds only the specs themselves. task-delete asserts a cascade onto task_comments and task_updates, which schema-v78.sql dropped. Their fixtures still clean up through the prefix list in tests/test-cleanup.ts.

Not archived: tests/round8-interactive-surface.spec.ts (maintained in July under backlog #386/#494; needs a keep-or-wire ruling).

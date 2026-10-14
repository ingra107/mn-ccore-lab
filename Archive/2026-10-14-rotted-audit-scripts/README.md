Archived 2026-10-14 (overnight dead-code lane O2C). Two standalone audit scripts that nothing runs.

hub-audit.ts (1,350 lines): not in package.json, CI, hooks or PB schedule.json, and no run output on HOME. Section 11.1b reads GET /api/inbox, a route deleted 2026-05-04 (974e0a51), so it can only fail. README pointed at a HUB-AUDIT-CHECKLIST.md that no longer exists. Its --cleanup mode is covered by scripts/test-residue-cleanup.sql. The auth recipe it proved lives on in tests/helpers/capture-auth.ts.

e2e-validate.ts (232 lines): last commit 2026-04-22, last output 2026-04-11. tests/real-auth-page-check.spec.ts replaced it (PB backlog #896).

Not checked: a WORK-laptop habit of running either by hand.

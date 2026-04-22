# C-entities/C1-task — desktop/dark

Run: 20260422T04485
Base: https://mn-ccore-lab.pages.dev
Screenshots: 10
PASS: 14
BUGS: 0 (P0 0, P1 0, P2 0)

## Bugs


## Trace


══════ SECTION C-entities/C1-task (desktop/dark) — run 20260422T04485 ══════
Base: https://mn-ccore-lab.pages.dev
C1 — task lifecycle
C1.1 Create task via CreateTaskModal
- [PASS] C1.1 modal opens with data-testid
- [PASS] C1.1 task row appears in list (_TEST_DELETE_c1task_mo9koz4u_03yv)
  created task id=72ebd4c42e3b…
C1.2 inline edit status
- [PASS] C1.2 status InlineSelect change succeeded
- [PASS] C1.2 API reflects status=in_progress
C1.3 inline edit priority
- [PASS] C1.3 priority InlineSelect change succeeded
- [PASS] C1.3 API reflects priority=high
C1.4 inline edit due_date (Tomorrow preset, dispatched mousedown)
- [PASS] C1.4 API reflects due_date=2026-04-22
C1.5 inline edit assignee (dispatched click)
- [PASS] C1.5 API reflects assignee=nate-mesfin
C1.6 status dropdown opens + remains in DOM
- [PASS] C1.6 status listbox attached to DOM after click
- [PASS] C1.6 listbox still in DOM after 800ms (no auto-close race)
C1.7 reload persistence check
- [PASS] C1.7 task row visible after reload
- [PASS] C1.7 status cell shows In Progress after reload
C1.8 soft-delete via batch
- [PASS] C1.8 batch soft-delete returned ok
- [PASS] C1.8 task no longer in default list (filtered by deleted_at)

──── CLEANUP (1 callbacks) ────
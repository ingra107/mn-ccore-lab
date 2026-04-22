# C-entities/C1-task — desktop/dark

Run: 20260422T04374
Base: https://mn-ccore-lab.pages.dev
Screenshots: 9
PASS: 10
BUGS: 3 (P0 0, P1 3, P2 0)

## Bugs

- **[C1.4.1] [P1] due_date API readback**
  - Observed: actual=null
  - Expected: 2026-04-23
- **[C1.5.2] [P1] assignee picker search input**
  - Observed: input[placeholder*=Filter people] not found
  - Expected: search input visible
- **[C1.6.1] [P1] status dropdown opens on click**
  - Observed: listbox not visible 1.5s after click
  - Expected: visible

## Trace


══════ SECTION C-entities/C1-task (desktop/dark) — run 20260422T04374 ══════
Base: https://mn-ccore-lab.pages.dev
C1 — task lifecycle
C1.1 Create task via CreateTaskModal
- [PASS] C1.1 modal opens with data-testid
- [PASS] C1.1 task row appears in list (_TEST_DELETE_c1task_mo9kap6w_tglq)
  created task id=3419dc54c8be…
C1.2 inline edit status
- [PASS] C1.2 status InlineSelect change succeeded
- [PASS] C1.2 API reflects status=in_progress
C1.3 inline edit priority
- [PASS] C1.3 priority InlineSelect change succeeded
- [PASS] C1.3 API reflects priority=high
C1.4 inline edit due_date (via date input)
- [BUG] [C1.4.1] [P1] due_date API readback
C1.5 inline edit assignee (via search + Enter)
- [BUG] [C1.5.2] [P1] assignee picker search input
C1.6 dropdown remains open during settle (no auto-close)
- [BUG] [C1.6.1] [P1] status dropdown opens on click
C1.7 reload persistence check
- [PASS] C1.7 task row visible after reload
- [PASS] C1.7 status cell shows In Progress after reload
C1.8 soft-delete via batch
- [PASS] C1.8 batch soft-delete returned ok
- [PASS] C1.8 task no longer in default list (filtered by deleted_at)

──── CLEANUP (1 callbacks) ────
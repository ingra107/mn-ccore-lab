# D-modals — desktop/dark

Run: 20260422T04581
Base: https://mn-ccore-lab.pages.dev
Screenshots: 6
PASS: 9
BUGS: 2 (P0 0, P1 1, P2 1)

## Bugs

- **[D.CommandPalette.1] [P1] CommandPalette renders dialog**
  - Observed: no dialog/testid in DOM
  - Expected: role=dialog
- **[D.ShortcutHelp.2] [P2] ShortcutHelp Escape closes**
  - Observed: still in DOM
  - Expected: closed

## Trace


══════ SECTION D-modals (desktop/dark) — run 20260422T04581 ══════
Base: https://mn-ccore-lab.pages.dev
D — CreateTaskModal
- [PASS] D CreateTaskModal renders dialog
- [PASS] D CreateTaskModal Escape closes
D — CreateProjectModal
- [PASS] D CreateProjectModal renders dialog
- [PASS] D CreateProjectModal Escape closes
D — CreateIdeaModal
- [PASS] D CreateIdeaModal renders dialog
- [PASS] D CreateIdeaModal Escape closes
D — CreateQuestionModal
- [PASS] D CreateQuestionModal renders dialog
- [PASS] D CreateQuestionModal Escape closes
D — CommandPalette
- [BUG] [D.CommandPalette.1] [P1] CommandPalette renders dialog
D — ShortcutHelp
- [PASS] D ShortcutHelp renders dialog
- [BUG] [D.ShortcutHelp.2] [P2] ShortcutHelp Escape closes

──── CLEANUP (0 callbacks) ────
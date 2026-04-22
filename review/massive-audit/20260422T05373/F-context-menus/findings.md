# F-context-menus — desktop/dark

Run: 20260422T05373
Base: https://mn-ccore-lab.pages.dev
Screenshots: 1
PASS: 1
BUGS: 2 (P0 0, P1 2, P2 0)

## Bugs

- **[F.1] [P1] context menu opens**
  - Observed: no menu/listbox with Status text in DOM
  - Expected: menu portal visible
- **[F.2] [P1] context menu Priority item**
  - Observed: not found in menu portal
  - Expected: Priority item visible

## Trace


══════ SECTION F-context-menus (desktop/dark) — run 20260422T05373 ══════
Base: https://mn-ccore-lab.pages.dev
F — task right-click context menu
- [BUG] [F.1] [P1] context menu opens
- [BUG] [F.2] [P1] context menu Priority item
- [PASS] F Escape closes context menu

──── CLEANUP (0 callbacks) ────
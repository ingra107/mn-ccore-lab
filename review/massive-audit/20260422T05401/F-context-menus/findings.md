# F-context-menus — desktop/dark

Run: 20260422T05401
Base: https://mn-ccore-lab.pages.dev
Screenshots: 1
PASS: 2
BUGS: 2 (P0 0, P1 2, P2 0)

## Bugs

- **[F.2a] [P1] context menu Status trigger**
  - Observed: no item titled Status
  - Expected: Status submenu trigger
- **[F.2b] [P1] context menu Priority trigger**
  - Observed: no item titled Priority
  - Expected: Priority submenu trigger

## Trace


══════ SECTION F-context-menus (desktop/dark) — run 20260422T05401 ══════
Base: https://mn-ccore-lab.pages.dev
F — task right-click context menu
- [PASS] F context menu opens (7 items)
- [BUG] [F.2a] [P1] context menu Status trigger
- [BUG] [F.2b] [P1] context menu Priority trigger
- [PASS] F Escape closes context menu

──── CLEANUP (0 callbacks) ────
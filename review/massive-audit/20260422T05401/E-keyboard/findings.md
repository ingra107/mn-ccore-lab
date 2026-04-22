# E-keyboard — desktop/dark

Run: 20260422T05401
Base: https://mn-ccore-lab.pages.dev
Screenshots: 2
PASS: 8
BUGS: 1 (P0 0, P1 1, P2 0)

## Bugs

- **[E.qmark] [P1] ? opens shortcut help**
  - Observed: no dialog rendered
  - Expected: help dialog

## Trace


══════ SECTION E-keyboard (desktop/dark) — run 20260422T05401 ══════
Base: https://mn-ccore-lab.pages.dev
E — keyboard shortcut sweep
- [PASS] E G+D → /portal/dashboard
- [PASS] E G+T → /portal/my-tasks
- [PASS] E G+P → /portal/projects
- [PASS] E G+M → /portal/meetings
- [PASS] E G+I → /portal/ideas
- [PASS] E G+C → /portal/calendar
- [PASS] E G+S → /portal/settings#profile
E — Ctrl+K opens command palette
- [PASS] E Ctrl+K opens dialog
E — ? opens shortcut help
- [BUG] [E.qmark] [P1] ? opens shortcut help

──── CLEANUP (0 callbacks) ────
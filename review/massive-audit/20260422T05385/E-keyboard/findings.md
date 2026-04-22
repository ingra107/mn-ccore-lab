# E-keyboard — desktop/dark

Run: 20260422T05385
Base: https://mn-ccore-lab.pages.dev
Screenshots: 2
PASS: 8
BUGS: 1 (P0 0, P1 1, P2 0)

## Bugs

- **[E.cmd-k] [P1] Ctrl+K opens command palette**
  - Observed: no dialog rendered
  - Expected: palette dialog

## Trace


══════ SECTION E-keyboard (desktop/dark) — run 20260422T05385 ══════
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
- [BUG] [E.cmd-k] [P1] Ctrl+K opens command palette
E — ? opens shortcut help
- [PASS] E ? opens shortcut help dialog

──── CLEANUP (0 callbacks) ────
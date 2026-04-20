# A11y Deep Audit — https://mn-ccore-lab.pages.dev
Run: 20260420T01425
Total findings: 7

## By severity

| Sev | Count |
|-----|-------|
| P0 | 0 |
| P1 | 6 |
| P2 | 0 |
| INFO | 1 |

## All findings

- **[P1] GRID-NO-ROLE** @ `/tasks` — Data page renders columnar layout but has 0 role=grid / role=table elements. Screen reader users cannot navigate by column or row. _(1.3.1 Info and Relationships)_
- **[P1] GRID-NO-ROLE** @ `/my-tasks` — Data page renders columnar layout but has 0 role=grid / role=table elements. Screen reader users cannot navigate by column or row. _(1.3.1 Info and Relationships)_
- **[P1] GRID-NO-ROLE** @ `/projects` — Data page renders columnar layout but has 0 role=grid / role=table elements. Screen reader users cannot navigate by column or row. _(1.3.1 Info and Relationships)_
- **[P1] CMDK-NO-ESC-CLOSE** @ `/dashboard` — Escape key did not close Cmd+K modal _(2.1.2 No Keyboard Trap)_
- **[INFO] INPUT-NONE** @ `/tasks` — No text input found to test J/K-in-input regression
- **[P1] DASH-RESIZE-NO-KBD** @ `/dashboard` — Card resize handles exist but appear keyboard-inoperable (no aria-label, no role=separator, no documented keyboard pattern in CLAUDE.md) _(2.1.1)_
- **[P1] TOUCH-TARGET-SMALL** @ `/tasks (mobile 390x844)` — 12 interactive elements below 44×44 minimum. Examples: <a> 1×1px "Skip to content"; <button> 28×44px ""; <button> 28×44px "" _(2.5.5 Target Size (Level AAA, but UMN brand spec))_
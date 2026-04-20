# A11y Deep Audit — https://mn-ccore-lab.pages.dev
Run: 20260420T01463
Total findings: 15

## By severity

- P0: 0
- P1: 13
- P2: 0
- INFO: 2

## All findings

- **[P1] LM-NAV-UNLABELED** @ `/dashboard` — 1/2 <nav> elements have no aria-label (multiple navs require distinct labels) _(1.3.1)_
- **[P1] LM-NAV-UNLABELED** @ `/tasks` — 1/2 <nav> elements have no aria-label (multiple navs require distinct labels) _(1.3.1)_
- **[P1] GRID-NO-ROLE** @ `/tasks` — Data page renders columnar layout but has 0 role=grid / role=table / role=columnheader. Screen reader users get no row/column navigation; they hear an undifferentiated stream of div content. _(1.3.1 Info and Relationships)_
- **[P1] LM-NAV-UNLABELED** @ `/my-tasks` — 1/2 <nav> elements have no aria-label (multiple navs require distinct labels) _(1.3.1)_
- **[P1] GRID-NO-ROLE** @ `/my-tasks` — Data page renders columnar layout but has 0 role=grid / role=table / role=columnheader. Screen reader users get no row/column navigation; they hear an undifferentiated stream of div content. _(1.3.1 Info and Relationships)_
- **[P1] LM-NAV-UNLABELED** @ `/projects` — 1/2 <nav> elements have no aria-label (multiple navs require distinct labels) _(1.3.1)_
- **[P1] GRID-NO-ROLE** @ `/projects` — Data page renders columnar layout but has 0 role=grid / role=table / role=columnheader. Screen reader users get no row/column navigation; they hear an undifferentiated stream of div content. _(1.3.1 Info and Relationships)_
- **[P1] LM-NAV-UNLABELED** @ `/meetings` — 1/2 <nav> elements have no aria-label (multiple navs require distinct labels) _(1.3.1)_
- **[P1] LM-NAV-UNLABELED** @ `/personal` — 1/2 <nav> elements have no aria-label (multiple navs require distinct labels) _(1.3.1)_
- **[P1] LIVE-NONE** @ `/team` — No aria-live regions or role=status/alert found. Toasts, optimistic updates, and realtime sync (15s polling) won't be announced to SR users. _(4.1.3 Status Messages)_
- **[P1] CMDK-NO-ESC** @ `/dashboard` — Escape key did not close Cmd+K modal _(2.1.2)_
- **[INFO] INPUT-NONE** @ `/tasks` — No text input found on /tasks; cannot test J/K-while-typing regression directly
- **[INFO] DASH-DRAG-CHECK-KBD** @ `/dashboard` — Customize button exists ("Drag to reorder"). Manual test required: does it expose keyboard reorder/resize?
- **[P1] TOUCH-TARGET-SMALL** @ `/tasks (390x844)` — 11+ interactive elements below 44×44 minimum. Examples: <button> 28×44px ""; <button> 28×44px ""; <button> 28×44px ""; <button> 18×44px "Reorder task" _(2.5.5 Target Size)_
- **[P1] INLINE-EDIT-NO-ROLE** @ `/tasks` — Inline-editable cell <div> lacks role=combobox/button/listbox (got ""). Screen reader users can't tell it's interactive. _(4.1.2)_
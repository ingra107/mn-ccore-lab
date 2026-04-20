# MN-CCORE Lab Hub — Design Handoff (April 2026)

Implementation brief for Claude Code against `github.com/ingra107/mn-ccore-lab`, HEAD `ef604db`.

## What this is

A prioritized backlog of **33 tickets** covering every finding in the April 20 design audit — P1 ship-blockers, P2 polish, P3 new surfaces. Each ticket has:

- File path(s) in the real repo
- Problem description grounded in the live screenshot
- Proposed implementation approach with code snippets
- Acceptance criteria
- Reference to the audit screenshot

## How to use this in Claude Code

1. Open the repo in Claude Code.
2. Paste `TICKETS.md` into the conversation (or drop this folder in).
3. Work P1 → P2 → P3, one ticket at a time. Each ticket is self-contained.
4. Use `Audit.html` as the visual source of truth — annotated screenshots showing every finding in context.
5. The `reference/` folder has tokens (`colors_and_type.css`) and the UI kit mocks showing the design direction for polish changes.

## Files in this bundle

| File | What it is |
|---|---|
| `TICKETS.md` | The implementation backlog. 33 tickets, ordered P1 → P2 → P3. |
| `Audit.html` | Interactive audit doc with annotated screenshots (open in browser). |
| `screenshots/` | All 30 captures referenced in tickets (`desktop-*`, `mobile-*`). |
| `reference/colors_and_type.css` | Token source of truth (already present in repo at `src/index.css`; included here for standalone reference). |
| `reference/ui-kit/` | Simplified HTML mocks of Dashboard, Tasks, Projects, Meetings, Hermes — use for visual direction on polish tickets. |

## About the design files

The HTML files in `reference/ui-kit/` are **design references**, not production code. They were created in this design session as simplified mockups of the existing Hub. When a ticket points at them (e.g. "match the section-header treatment in `reference/ui-kit/Tasks.html`"), treat them as visual guidance — the real implementation should use the Hub's existing React components, Radix primitives, Tailwind classes, and `src/index.css` tokens.

## Fidelity

**High-fidelity.** All mocks, tokens, and references use the Hub's real design system — same fonts (Fraunces · DM Sans · JetBrains Mono), same color tokens, same spacing scale. Pixel-perfect reproduction is the target. Where a ticket suggests a new pattern, it's written against the exact Tailwind/CSS conventions already in the codebase.

## Priority semantics

- **P1 · Ship-blocker.** Visible bug or broken string a stakeholder will notice in a Tuesday 11am demo. Fix first.
- **P2 · Polish.** Density, scannability, consistency. Meaningfully improves daily use. Ship this week.
- **P3 · New surface or deeper work.** Speculative ideas, new features, redesigns. Next quarter.

## After landing a ticket

Each ticket has acceptance criteria. Once met:
1. Screenshot the fixed state.
2. Compare against the "before" screenshot in `screenshots/`.
3. Mark the ticket done in `TICKETS.md` (check the box).

## Scope boundaries

- **Don't introduce new dependencies** unless a ticket explicitly calls for one.
- **Don't refactor beyond the ticket scope** — if you notice something else broken, file it as a new ticket at the bottom of P3, don't fix it in-line.
- **Preserve the voice.** The Hub is intentionally dense, honest, and anti-corporate. Don't soften error messages, don't add emoji, don't change `[System: still here]` phrasing.

---

**Audit compiled:** 2026-04-20 · from 30 screenshots + 205 imported source files
**Total tickets:** 33 (8 P1 · 14 P2 · 11 P3)
**Estimated effort:** ~3 days P1+P2 · ~2 weeks P3

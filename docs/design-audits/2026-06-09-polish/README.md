# Handoff → Claude Code · Polish + Workflow Round (2026-06-09)

This is an **audit of the existing `mn-ccore-lab` repo** — not a set of mockups to recreate. Claude Code already has the codebase; this package tells it exactly what to change.

## What's in here
| File | Role |
|---|---|
| `TICKETS.md` | **The work list.** 30 file-scoped tickets (P1×13 / P2×10 / P3×7), each with problem · fix · acceptance · `file:line`s. This is what CC executes. |
| `Design Audit — Polish & Workflow.html` | **The visual reference.** Annotated before/after for every finding + interactive date-picker, width, bg, priority, trust, and Heartbeat-loader mockups. Open in a browser to see intended outcomes. |
| `colors_and_type.css` | The design tokens the audit references (already mirrors the repo's `colors_and_type.css`). |

## How to run it
1. Drop this folder into the repo, e.g. `docs/design-audits/2026-06-09-polish/`, and commit — so CC can read `TICKETS.md` in-context.
2. Open a Claude Code session in the `mn-ccore-lab` repo root.
3. Paste the kickoff prompt below.
4. CC works through the **continuous build order** in `TICKETS.md` end to end — no stop-gates. (Nick has pre-approved the full plan.)

## ⚠️ Guardrails (CC must honor — these are in `TICKETS.md` too)
- **Out of scope this round:** the Today page, the daily-cockpit IA, and the operating-day plan model (localStorage-vs-Hub). Do NOT restructure them. The deep cures for the #1 friction (a cockpit showing the top priority) and the CLI fallback (capture→act→Claude) are routed to that deferred session.
- **Honor shipped primitives — extend via props, never re-fork:** the shared `<TaskRow>`, `TaskQuickEditChips`, one date control, `<DueLabel>`/`isOverdue()`, the `ui/` primitives.
- **My Tasks List is the protected power-grid** (j/k/e/x + inline-edit columns) — do not unify it to inline-expand.
- Dark-first; columnar tables on data pages (cards = dashboards only); rationed color; opacity ≥0.85 floor on readable dark text; no compound-opacity; hex-pinned palette (axe-AA); routes via `src/constants/paths.ts`.

## Kickoff prompt (paste into Claude Code)
> Read `docs/design-audits/2026-06-09-polish/TICKETS.md` and open the sibling `Design Audit — Polish & Workflow.html` for visual intent. This is a **visual-polish + workflow-efficiency + no-dead-ends** round against this repo — **Today, the daily-cockpit IA, and the plan model are OUT of scope** (their own session). The **"✅ Decisions resolved up front" section near the top of `TICKETS.md` pre-answers every judgment call** — follow it; don't re-litigate. Work through the **"Build order" section at the bottom end to end, in order** — no stop-gates; the plan is pre-approved. Each ticket lists its acceptance criteria and `file:line`s — follow them, and commit per ticket (or per build-order group) so progress is reviewable. Honor the guardrails in the audit's §4 and the TICKETS header: extend the shipped primitives via props, never re-fork; keep the List power-grid intact; dark-first + rationed color + axe-AA. Only stop if something is genuinely ambiguous *and* not covered by the Decisions section, or if a fix would require touching the out-of-scope Today/plan code.

## Sequencing
See the **"Build order"** section at the bottom of `TICKETS.md` — a single continuous sequence (Foundation → felt wins → no-dead-ends → consolidation → polish/cleanup), with dependencies noted. No stop-gates; commit per ticket so progress stays reviewable.

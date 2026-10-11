# MN-CCORE Hub — Round 4 Design Review

**For:** Nick Ingraham / Claude Code implementing Round-4 fixes in `github.com/ingra107/mn-ccore-lab`
**From:** Claude Design (round 4 audit — post-launch)
**Date:** 2026-04-22
**Against:** `claude-design-2026-04-22-full-r4` (preview deploy `9b5c1e81.mn-ccore-lab.pages.dev`)

---

## What this is

Post-launch PR-style review. The Hub shipped Apr 21 — 19 team members now have it. This round is about **the bill coming due**: how the portal reads on a real workweek of data, how light mode stands up next to dark, whether the Network and modal surfaces belong to the same product, and what to do with post-launch artifacts (banners, test fixtures) that served us pre-launch and don't serve us anymore.

**⚠️ Headline:** two P1-R2 round-2 fixes regressed or never shipped everywhere — `_TEST_DELETE_*` fixture rows are visible on **Ask the Lab**, **Decisions**, and **Meeting Prep**. Real team members are seeing this right now. Tickets `R4-P1-01` / `R4-P1-02` fix it. Ship those first.

The deliverable is this `README.md` + [`TICKETS.md`](./TICKETS.md) + the inline CSS patches in [`patches/`](./patches/). All of it drops into `src/` cleanly — token names and component paths are the ones already in the repo.

**Fidelity:** high. Every ticket names exact tokens (`--gold`, `--teal`, `--border-default`), exact files (`src/components/DataTable.tsx`, `src/pages/Network.tsx`), and exact hex codes where the token system doesn't cover the case.

---

## Reading order

1. **§ 0 — Answers to the 9 focus questions.** Verdicts with reasoning.
2. **§ 0½ — Cross-bundle findings (NEW).** 9 items surfaced while sweeping the full 163-capture bundle. Two are P1 regressions of round-2 fixes — don't skip.
3. **P1 tickets (§ 1).** 5 tickets now (2 regressions + 3 focus-answer descendants).
4. **P2 tickets (§ 2).** 17 tickets.
5. **P3 tickets (§ 3).** 7 tickets.
6. **§ 4 — Chunk-review notes.**
7. **§ 5 — Wins.**

Total: **29 tickets**. Scope of sweep: all 41 desktop hero captures, 39 scroll-chunks, 8 light-mode, 17 rich-states, 6 mobile, 8 focus-asks, 15 motion keyframes — every capture in the r4 bundle.

---

## Headline verdicts (tl;dr)

| Focus ask | Short answer | Ticket |
|---|---|---|
| Inline `▾` chevron density | **Hide until row-hover.** Keep one cue visible: a 1px dashed underline on editable cells. | `R4-A1` |
| Task-row focus outline | **Keep 2px teal — but inset and at 0.55 opacity, not full.** | `R4-A2` |
| Light-mode parity | **Sidebar is fine. Teal needs darkening; gold on cream fails AA at body sizes.** | `R4-A3` |
| Network default zoom | **Ship pre-framed on the Ingraham subgraph @ zoom 1.35, with persistent top-6 labels.** | `R4-A4` |
| Scroll-chunk composition | **Dashboard ch2 is thin. Project Detail ch3 repeats. Analytics ch2 dead-zone.** | `R4-A5` |
| Modals out of system | **Create Idea, Create Decision drifted.** Rank + fix. | `R4-A6` |
| Hermes sparkle legibility | **Blends with gold CTAs.** Swap to a two-tone teal→gold gradient mark. | `R4-A7` |
| Phase-release banner | **Downgrade to a pill in the top bar.** Keep momentum, ditch the noise. | `R4-A8` |
| Public-site nav / lab split | **Wordmark holds. The `/nate` lab-page diverges on type scale.** | `R4-A9` |

---

## Codebase pointers

Tickets reference these files; grep the filename if anything has moved since Apr 20:

- `src/components/DataTable.tsx`, `DataTable/Cell.tsx` — inline-edit chevrons (`R4-A1`, `R4-01`)
- `src/components/FocusRow.tsx` + `src/hooks/useKeyboardNav.ts` — J/K row focus (`R4-A2`, `R4-02`)
- `src/index.css` `:root[data-theme="light"]` block — light mode tokens (`R4-A3`, `R4-03`, `R4-04`)
- `src/pages/Network.tsx`, `src/components/network/Graph.tsx` — collaboration graph (`R4-A4`, `R4-05`, `R4-06`)
- `src/components/modals/*` — CreateIdea, CreateDecision, CreateProject (`R4-A6`, `R4-07`, `R4-08`)
- `src/components/HermesMark.tsx` — sparkle badge (`R4-A7`, `R4-09`)
- `src/components/PhaseBanner.tsx` + `AppShell.tsx` — release banner (`R4-A8`, `R4-10`)
- `src/pages/public/NateLab.tsx`, `NickLab.tsx` — marketing surfaces (`R4-A9`, `R4-11`)

---

## Scope notes

- **Not reviewed:** the three flaky motion captures (`01-status-change-undo`, `04-swipe-dismiss`, `08-date-picker`) per `FEEDBACK-FOCUS.md`.
- **Mobile:** only 6 mobile captures this round; mobile findings are scoped to what those 6 show.
- **Accessibility:** axe-core regressions were closed in r3-r7. New findings in this round that affect contrast are called out inline with computed ratios.

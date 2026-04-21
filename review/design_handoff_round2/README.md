# MN-CCORE Hub — Round 2 Design Handoff

**For:** Claude Code / dev implementing Round-2 fixes in `github.com/ingra107/mn-ccore-lab`
**From:** Design review (Round 2 post-fixes audit, 3 passes)
**Date:** 2026-04-20

---

## What this bundle is

This is a **ticketed design-review handoff**, not a greenfield design. The Hub is already shipped. Round 1 went in; this is the audit of what landed, what regressed, and what's still broken — plus answers to four explicit questions the PM (Nick) asked about the next iteration.

All the work to do is in [`TICKETS.md`](./TICKETS.md). Every ticket has a problem statement, the capture showing the problem, a concrete fix (often with code), and acceptance criteria. You should need nothing else.

The `captures/` folder is the evidence every ticket references — 39 desktop/mobile screenshots, 4 focus-area captures, 15 motion GIFs. **Filenames in TICKETS.md resolve relative to `captures/`** (e.g. a ticket referencing `desktop-27-my-items.png` means `captures/desktop-27-my-items.png`).

---

## How to work this

Open `TICKETS.md`. Reading order:

1. **§ 0 — Four priority answers.** Nick asked four specific design questions. Each has a verdict + code. Don't skip; later tickets reference these decisions.
2. **P1 section.** Ship-blockers. 7 tickets, all new since Round 1.
3. **§ 5 — Motion review.** Timing/easing issues discovered from the 15 motion GIFs. Contains an additional 5 motion tickets (M-02, M-03, M-09, M-11, M-13) and a proposed motion-token set.
4. **P2 section.** Polish and regressions. 18 tickets.
5. **P3 section.** Nice-to-haves. 9 tickets.
6. **§ 3 regression matrix + § 4 rollup** for sequencing.

Each P1/P2/P3 ticket is self-contained — pick one, read, implement, check it off.

---

## Fidelity

**High-fidelity.** Every ticket gives exact values — hex codes, px sizes, CSS selectors, file paths in the existing codebase, acceptance criteria. Several tickets include drop-in code blocks (CSS or TSX) that match the patterns already in the repo.

The bundle is written against the existing React + Tailwind codebase at `github.com/ingra107/mn-ccore-lab`. Where a ticket proposes new tokens, components, or hooks, it names them consistently with what's already there (`--teal`, `--gold`, `Lucide` icons, etc.).

---

## About the captures

- `captures/desktop-NN-*.png` — full-page desktop screenshots at 1440px
- `captures/mobile-NN-*.png` — Pixel 5 / iPhone 13 mobile captures
- `captures/focus-NN-*.png` — zoomed captures for the three focus asks (quick-add, chevrons, row-focus outline)
- `captures/videos/*.gif` — 15 interaction clips
- `captures/videos/*-{a,b,c}.png` — keyframe triplets extracted from each clip

Clips were analyzed frame-by-frame (not included in the bundle — would've added 89 more PNGs for no dev value). The GIFs themselves are here; open them in any browser or image viewer. Findings referencing specific moments call out approximate timestamps.

---

## Priority order (from § 4)

**Do first (P1, this week):**
1. `P1-R2-01` My Items sign-in wall for logged-in users
2. `P1-R2-02` Ask the Lab shows `test q` and `@claude Hi` publicly
3. `P1-R2-03` Settings emoji icon field (off-brand)
4. `P1-R2-04` Narratives mystery dot chart
5. `P1-R2-05` J/K keyboard nav paints nothing (WCAG + UX)
6. `P1-R2-07` Swipe-to-dismiss is inert on Pixel 5
7. `P1-R2-08` Board view drag never fires

**Focus answers (parallel to P1):** § 0 Asks 1–4 are effectively design decisions with small-to-medium dev work each. Ship them with the P1 batch.

**Do next (P2):** 18 tickets, grouped by area in § 4.

**Backlog (P3):** 9 tickets.

---

## Codebase pointers ticket-refs use

Tickets reference these paths. If they've moved, grep the filename:

- `src/pages/MyItems.tsx` — P1-R2-01
- `src/pages/AskTheLab.tsx` — P1-R2-02
- `src/pages/Settings/Profile.tsx` — P1-R2-03
- `src/pages/Narratives.tsx` — P1-R2-04
- `src/components/TaskDetail.mobile.tsx` — P1-R2-07, M-02, M-03
- `src/components/KanbanBoard.tsx` — P1-R2-08
- `src/components/Sidebar.tsx` — various
- `src/design-tokens/` — proposed new `motion.ts` token file (§ 5)

---

## Suggested Claude Code prompt

```
Read design_handoff_round2/README.md for context, then read
design_handoff_round2/TICKETS.md.

Start with the P1 tickets in the order listed in § 4. For each ticket:

1. Read the ticket + the referenced capture in captures/
2. Locate the code it points to
3. Propose the smallest change that meets the acceptance criteria
4. Confirm with me before writing code, then implement
5. Check off the ticket when the acceptance criteria pass

After P1 is done, pause so I can review, then continue with § 0 Focus
Answers, then P2.

Don't batch-implement — one ticket at a time, with the acceptance
criteria as the test.
```

---

## Round 1 context

If you need Round-1 context for regressions (e.g. ticket `P2-R2-01` references "Round-1 P2-02"), ask the PM for the Round-1 bundle — it's not included here to keep this zip focused.

The regression matrix in § 3 of TICKETS.md lists every Round-1 ticket with its Round-2 status (✅ shipped / ⚠️ partial / ❌ regressed / 🆕 new issue) so you can triangulate without the original doc in most cases.

---

## Files in this bundle

- `README.md` — this file
- `TICKETS.md` — the 34 tickets + 4 focus answers + motion review (the thing you implement against)
- `captures/` — all 175 design-review captures (screenshots + GIFs + keyframes)

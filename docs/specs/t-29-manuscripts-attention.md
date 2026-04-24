# T-29 Clarification — Manuscripts "Needs your attention"

**Date:** 2026-04-23 (round 5 close-out)
**Status:** Not stale. **Net-new spec for round 6.** Verified against current live Manuscripts page in `claude-design-2026-04-22-full-r4/desktop-08-manuscripts.png`.

---

## Was I looking at stale data?

No. I re-opened the current Manuscripts capture after your ping. Here's what shipped vs. what I had in mind:

**Shipped in Phase 26aq (✓):**
- Category + Focus + Owner + Status + Research Area filter chips along the top
- Sortable columns (Title / Date / Owner / Status / Progress)
- Stage progress dots in the rightmost column
- An **"Action items"** section above the main table, currently rendering 6 flat rows — each showing title + a right-side phrase like "Ready to submit." No grouping, no count badge, no urgency signal, no click-to-filter behavior.

**What I had in mind for T-29:** The **"Action items"** section is the embryo of the feature — but it's underdeveloped. Net-new work is to turn that flat 6-row list into a **grouped triage surface** with urgency semantics, not to add a new section.

---

## Spec

### Paragraph 1 — what "Action items" should become

Rename the section **"Needs your attention"** (Action Items is generic; Needs Your Attention is the operational verbatim you use everywhere else — TodayHero, MyItems NotificationCard). Turn the flat list into **3 collapsible subgroups**, each with a count badge and a click-to-filter behavior that refreshes the main table below to match the subgroup's scope:

1. **Revisions overdue** (N) — papers where `status = revisions-requested` AND `daysSinceRevisionRequest > 14`. Most urgent; amber dot.
2. **Awaiting your review** (N) — papers where `reviewerAssigned = currentUser` AND `status ∈ {submitted, in-review}` AND `daysAwaitingReview > 7`. Teal dot.
3. **Stale drafts** (N) — papers where `status ∈ {draft, in-writing}` AND `daysSinceLastActivity > 30`. Muted dot.

The subgroup headers are clickable: clicking "Revisions overdue (3)" collapses the other two subgroups AND applies `status=revisions-requested + overdue` as filter chips in the main table below — so the user moves from "what needs my attention" to "let me work through the list" in one click. A fourth pill, "Show all" (N total), resets. Papers in subgroups deep-link to the paper detail on row-click. Each subgroup is independently collapsible (user might want revisions-overdue collapsed once addressed).

### Paragraph 2 — placement, count, dismiss, edge cases

Placement stays at top-of-page, below the filter chips and above the main table. If **all three subgroups are empty**, collapse the entire section to a single 32px muted line: `● Nothing needs your attention. Below: 47 manuscripts in the pipeline.` — consistent with the shipped empty-state pattern on AskTheLab (T-35) and PB Sector (T-44). If **only one subgroup has entries**, render it expanded and skip the others entirely (no zero-state subgroup headers — they're noise). **Count badges** render as `(N)` at 11px muted next to the subgroup title; when `N ≥ 5`, the count gets an amber color to signal pile-up. **No dismiss button** on individual items — this is a derived view, not an inbox; the way to "dismiss" an item is to address the underlying state (submit the revision, finish the review, update the draft). If the user wants to temporarily hide the entire section for a sprint, the section header has a `▾` collapse toggle that persists per-user in localStorage (`manuscripts.attention.collapsed = true`). Keyboard: `j/k` navigate across subgroup items + main table as one continuous focus ring; `Enter` opens the paper detail; `e` on a highlighted row opens the inline-edit on the status field (so you can resolve a revision from the attention list without context switch).

**Thresholds are configurable per-lab:** ship defaults `14d / 7d / 30d` but expose them in Settings → Lab Preferences → "Manuscript attention thresholds" for PIs whose cadence differs. Nick's 14-day revision SLA may be tight for Nate's slower projects.

---

## Why I think this is worth doing

- The current flat "Action items" list is doing *some* of this work but not labeled, sorted, or segmented. It's a 6-row readout without semantic structure — the user has to scan to understand urgency.
- The Hub's best pattern is **grouped-by-urgency with count badges** (TodayHero, MyItems NotificationCard type-coded borders per T-37, Decisions tag-chip filter per T-21). Manuscripts is the last big data page that doesn't use it.
- Rule 23 (operational, not editorial) implies the user should land on "what's broken" before "what's in the pipeline" — which is exactly what this surfaces.

## Skip-it

If capacity is tight, the degraded version is: **rename "Action items" → "Needs your attention"** + add a count badge to the section header (`Needs your attention · 6`) + sort the flat list by a crude urgency score (`daysOverdue + daysAwaitingReview + daysStale`, descending). That's ~2 hours of work and captures 50% of the value. The full 3-subgroup spec is round-6 scope; the rename + sort is round-5.5 scope if you want to land something small now.

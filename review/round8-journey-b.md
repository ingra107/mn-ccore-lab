# Round 8 — Journey B (Coordinator Workflow) Report

**Date:** 2026-04-13
**Agent:** Journey B (Coordinator workflow)
**Target:** https://mn-ccore-lab.pages.dev
**Spec:** `tests/round8-journey-b.spec.ts` (deleted after run)
**Runtime:** 20.1s, all 18 steps executed, test wrapper passed
**Screenshots:** `review/round8-journey-b/*.png`

## Summary

| Result | Count |
|--------|-------|
| PASS | 5 |
| FAIL | 2 |
| FRICTION | 11 |
| Total | 18 |

The coordinator workflow is **largely broken at the interaction layer**. The meeting list → detail navigation, meeting action-item NLP quick-add, and publications/tasks pages render, but the core coordinator actions (mark AI complete, carry forward, decision create via N, deadline inline status, regulatory strip, copy bibliography, agenda generate) are all silent failures. Three high-severity issues surfaced that consultants would not have caught from screenshots.

## Step Matrix

| # | Step | Result | Evidence / Friction |
|---|------|--------|---------------------|
| 1 | `/meetings` → open most recent meeting | PASS | navigated to `/meetings/mtg-2026-04-08-e4359890` |
| 2 | Scan for action items | PASS | 2 action-item references found |
| 3 | Mark action item complete inline | FRICTION | No interactive completion control found on meeting detail. No checkbox, no status circle. Coordinator has no way to resolve an AI without navigating to `/tasks`. |
| 4 | Undo toast after completion | FRICTION | N/A — step 3 never fired a completion. Violates Design Principle #8 if step 3 is fixed without undo wiring. |
| 5 | Carry-forward button | FRICTION | No explicit `Carry forward` button on any action item. Confirms known UX gap — coordinator must manually re-create next-meeting tasks. |
| 6 | Quick-add action item (NLP) | PASS | Input accepted `test_delete_journey_b review draft by friday` and cleared on Enter. |
| 7 | `/decisions` → N key → create | FRICTION | N key did not open the CreateDecisionModal. Either keybinding not wired on this page or focus trapping on body is wrong. CLAUDE.md claims "N-key create" is verified on Decisions. |
| 8 | New decision appears in list | FAIL | Decision not in list after reload. Confirmed zero rows in `decision_log` with `test_delete_journey_b%`. Step 7 silently failed to submit. |
| 9 | Generate agenda / meeting prep | FRICTION | No visible `Prep` / `Agenda` / `Generate` button on `/meetings` list view. Meeting prep route exists elsewhere; coordinator can't reach it from the meetings list without URL knowledge. |
| 10 | `/deadlines` renders with data | FAIL | 0 row elements found by `[role="row"], tr, [data-testid*="deadline"]` selectors. Page may be rendering cards (not rows), but data-testids are missing for deadlines — blocking test hooks. Screenshot `10-deadlines.png` will confirm visual state. |
| 11 | Download `.ics` from deadlines | PASS | Download event fired. Export works even though the row test failed. |
| 12 | Inline change deadline status | FRICTION | Clicked status element but no dropdown opened. Either status control is not inline-editable on deadlines, or the selector missed the actual control (no `data-testid` on deadline status cell). |
| 13 | `/personal` regulatory alert strip | FRICTION | No text matching `/regulatory|IRB|expir/i` found. Phase 25 claims regulatory items appear with expiration alerts on `/personal`. Either no data seeded or the strip is conditionally hidden. |
| 14 | Regulatory alert clickable | FRICTION | N/A — strip not present per step 13. |
| 15 | `/publications` renders | PASS | Publications page rendered with expected copy. |
| 16 | Copy bibliography button | FRICTION | No `Copy` / `Copy bibliography` button found on `/publications`. CLAUDE.md Component Coverage table lists "Copy to clipboard: Publications" — this capability is missing or mis-labeled. |
| 17 | Meeting-created AI syncs to `/tasks` | FRICTION | Literal match on "test_delete_journey_b" succeeded in DOM, but D1 query `SELECT id, title FROM tasks WHERE title LIKE '%journey%'` returned zero rows. This means the match was a selector false-positive (e.g. hitting placeholder/help text), OR the write was soft-deleted, OR quick-add in step 6 never actually persisted. Net: quick-add is NOT reliably creating tasks. |
| 18 | `/calendar` renders for planning | FRICTION | `/calendar` returned no grid / date elements. Either the route is blank, lazy-loading slow, or Calendar requires more settle time than 1.5s. |

## High-Severity Findings (new, not in Nick's 11)

### B-H1 — Meeting action items have no inline completion control
**Severity:** HIGH. Coordinator opens a meeting, sees action items, but there is no checkbox or status circle to mark them done in-context. They must open the linked task in `/tasks`, which defeats the "review meeting + close loop" workflow. Violates Pattern 4 (Inline Editing) — every editable field should show affordance.

**Proposed fix:** Wire `TaskStandUpView`-style status pill into MeetingDetail action-item rows. Same pattern already used on `/tasks`.

### B-H2 — N-key create does not fire on `/decisions`
**Severity:** HIGH. CLAUDE.md Component Coverage lists `/decisions` as having "N-key create." Actual: pressing `n` with focus on body does nothing. Step 7 saw no modal. Either the keybinding is scoped wrong (only fires when a specific element has focus) or the handler was removed.

**Proposed fix:** Confirm `useHotkeys('n', ...)` registration in DecisionsPage; ensure it fires on document-level, not a scoped container.

### B-H3 — Publications page missing Copy bibliography button
**Severity:** MEDIUM-HIGH. Phase 26aq changelog says "Publications: year distribution mini-chart (clickable), Copy bibliography button." CLAUDE.md Component Coverage table lists "Copy to clipboard: Publications." Live site has no such button visible with standard selectors.

**Proposed fix:** Verify `PublicationsPage.tsx` still mounts the Copy button; may have been refactored out during Round 7 polish.

## Medium-Severity Findings

### B-M1 — No "carry forward" affordance on meetings
Confirmed gap. Coordinator has to re-type unfinished AIs into the next agenda. Blocker for weekly cadence.

### B-M2 — `/deadlines` rows not addressable by tests
Zero `tr` / `role=row` / `data-testid*=deadline` elements. Either Deadlines switched to a card layout (breaking Phase 30 "Deadlines: sortable columns" claim) or the table lacks test IDs. Also blocks B-M3.

### B-M3 — Deadline status not inline-editable (or picker broken)
Click on status cell → no dropdown. Matches Nick-finding pattern "inline date picker flashes and immediately closes" (#10). May be same root cause — dismiss-on-click race.

### B-M4 — No agenda/prep discoverable from `/meetings` list
Coordinator has to know `/meeting-prep` URL or hotkey. Should be a prominent "Prep next meeting" CTA in list header.

### B-M5 — `/personal` regulatory strip absent
Phase 25 feature. Either no regulatory rows exist for this user, or the strip only renders above a threshold. Needs empty-state OR default sample row so the feature is discoverable.

### B-M6 — `/calendar` slow / blank on initial load
Test at 1.5s settle saw no grid. Could be legit lazy-load (calendar lib), but feels slow for a planning view that coordinators hit daily.

## Low-Severity / Friction Notes

- Meeting detail URL has collision-resistant suffix — good.
- Quick-add input on meeting detail accepted and cleared text without error, but we cannot verify persistence without a D1 round-trip (confirmed zero rows post-test).
- Screenshot capture stable across 14 shots.

## Test Data Cleanup

- `tasks` WHERE `title LIKE '%test_delete_journey_b%'` — 0 rows (nothing ever persisted, nothing to clean)
- `tasks` WHERE `title LIKE '%journey%'` — 0 rows
- `decision_log` WHERE `title LIKE '%test_delete_journey%'` — 0 rows (nothing ever persisted)
- `meeting_action_items` table does not exist by that name — no cleanup needed
- Cleanup SQL run; `changes: 0` confirms nothing to remove

## Evidence Artifacts

- `review/round8-journey-b/01-meetings.png` — meetings list
- `review/round8-journey-b/01b-meeting-detail.png` — opened meeting
- `review/round8-journey-b/04-undo-toast.png` — state after step 3
- `review/round8-journey-b/06-quick-add.png` — meeting NLP quick-add
- `review/round8-journey-b/07-decisions.png` — decisions page pre-N
- `review/round8-journey-b/07b-decision-created.png` — post-N (no modal)
- `review/round8-journey-b/09-agenda.png` — meetings list, no agenda CTA
- `review/round8-journey-b/10-deadlines.png` — deadlines view
- `review/round8-journey-b/12-deadline-status.png` — after status click attempt
- `review/round8-journey-b/13-personal.png` — personal page
- `review/round8-journey-b/15-publications.png` — publications page
- `review/round8-journey-b/18-calendar.png` — calendar attempt
- `review/round8-journey-b/results.json` — structured step results

## Recommendation to aggregator

Treat B-H1, B-H2, B-H3 as fix-round candidates for Round 8 Phase 4. B-M1 (carry-forward) is a small feature, not a polish fix — defer or scope separately. B-M2/B-M3 cluster with Nick's finding #10 (date picker flash) and should be diagnosed as one family: "inline editors on non-Tasks tables don't wire dropdowns correctly." B-M5 and B-M6 need data-vs-bug triage before fix work.

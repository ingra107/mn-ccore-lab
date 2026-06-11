# Composer Placement + "Next Step" + Succinct Descriptions — Design Proposal

**Date:** 2026-06-11 · **Status:** PROPOSAL (no implementation)
**Trigger:** Nick's feedback, verbatim: (1) "descriptions need to be succinct and to the point"; (2) "myhub doesn't need the 'why this is important' … potentially it could have next step maybe as a thing"; (3) "i want the 'comment' box much closer in dropdowns and not at the bottom … that goes for full editor too."
**Context:** activity_entries unified timeline shipped (schema v77/78, Rule 70); descriptions are now static lead prose (task dated-breadcrumb migration ran today — `docs/superpowers/plans/2026-06-11-task-desc-migration-dryrun.md`, project twin reviewed in `2026-06-11-description-migration-review.md`).

> **See the ADDENDUM at the bottom** — Nick's round-2 feedback (same day, after drafting)
> CONFIRMS the single-Activity-tab direction and adds the field-lift above the tabs.

## Ground truth — where every composer sits today

| Surface | Component | Composer today | Feed today |
|---|---|---|---|
| Today inline expand | `src/components/today/TaskDetailDrawer.tsx` | `<SmartCompose>` is the **last element** (line 197), below action bar (87–124) → quick-edit chips (127–132) → "Why this matters" callout (134–139) → subtasks/updates grid (140–191) → Workflow fields (192–196) | "Recent updates" right column, newest-first (server sorts DESC, `api/routes/tasks.ts:745-747`), capped at 8 (line 171) |
| MyTasks Columns + Lanes inline expand | `src/pages/MyTasks/components/InlineDetail.tsx` (rendered by `MyTasksRow`, `ColumnsView.tsx:156`; Lanes reuses the same row, `LanesView.tsx:91-104`) | `<SmartCompose>` is the **last element** (lines 156–158), below 💡 description blurb (105–109) → action buttons (110–147) → chips (149–154) | **No feed at all** — post-and-pray |
| MyTasks List right drawer | `TaskDetailPanel` (`src/pages/MyTasks/index.tsx:333-336`) | See full editor row | — |
| My Hub | `PersonalPage.tsx` — **no inline expand**; body-click opens `TaskDetailPanel` (`PersonalPage.tsx:343-345` comment + `HubTaskRow` 347–369, `hideCaret`, `onToggleExpand → onOpenDetail`) | See full editor row | — |
| Full editor | `src/components/tasks/TaskDetailPanel.tsx` | `OverviewQuickAdd` is the **last element of the Overview tab** (lines 618–624), after fields (534–579) → key links (584–591) → Description rich editor (593–610) → Subtasks (613). It has the comment/note mode pills (1294–1321), Hermes toggle (1446–1473), and the **@me lock toggle** (1477–1495). Comments tab (`TaskComments.tsx`): feed first (88–112, newest-first per `tasks.ts:597`), composer **below** (115+). Notes tab (`TaskUpdateFeed.tsx`): composer already **on top** (40–101), feed below (104–111). Activity tab (`TaskActivityFeed.tsx`): **no composer**, filter pills on top (86–109), newest-first server-ordered feed (`tasks.ts:663`) | per tab |

Two structural facts worth noting before the options:
- **The Notes tab already implements exactly what Nick is asking for** (composer on top, newest-first feed directly under — `TaskUpdateFeed.tsx:40-111`). The pattern exists; it just isn't where he lands.
- **There are 4 distinct composer implementations** posting into the same `activity_entries` store (SmartCompose task-mode posts a *note* via `usePostTaskUpdate`; OverviewQuickAdd posts comment-or-note; TaskComments posts comments; TaskUpdateFeed posts typed notes). Only OverviewQuickAdd has the @me lock toggle — the inline drawers rely on typing `@me ` by hand (Rule 70).

---

## A. Comment composer placement

**Design principle (all surfaces):** *expand → composer is the first interactive thing under the action bar; the newest-first feed sits directly beneath it (chat-inverse pattern).* The composer lives **inside** the expanded region, which already `stopPropagation()`s clicks (`TaskDetailDrawer.tsx:86`, `InlineDetail.tsx:104`) — so Rule 58's body-click-expands contract is untouched, and nothing is added to the shared `TaskRow` itself (Rule 68: no row fork, no new row click targets).

### Options considered

1. **Composer-on-top inside the expansion (chat-inverse).** Action bar stays row 1 (it carries the Rule-58 ▶/📌 affordances), composer row 2, newest-first feed row 3, fields/subtasks/workflow move below the feed.
2. **Always-visible one-line composer on the collapsed row.** Rejected: it adds a click target to the shared row that competes with body-click-expand (Rule 58) and bloats every row on every surface even when nobody wants to comment — the opposite of operational density.
3. **Sticky composer at the bottom of the expansion/panel** (chat-classic). Rejected for inline drawers: the drawer isn't a fixed-height scroll container, so "sticky bottom" still means scrolling past subtasks/workflow on long tasks. (It's already the mobile pattern in TaskDetailPanel — `TaskDetailPanel.tsx:1257-1268` — keep that.)

**Recommendation: Option 1 on every surface**, with one shared composer primitive per surface (extend `SmartCompose` by prop, never fork — same ethos as Rule 68).

### Per-surface layout

**A1. Today inline expand (`TaskDetailDrawer.tsx`) — reorder, scope S**

```
┌─ expanded drawer ──────────────────────────────────────────┐
│ ▶ Work on this now  📌 Plan  Move →  [links]   ProjectName │  ← action bar (stays, lines 87-124)
│ [✎ comment box — one line, expands on focus      ] [Post]  │  ← SmartCompose MOVES here (from line 197)
│   (@me 🔒) (For Hermes) toggles appear with content        │
│ ── Activity (newest first) ────────────────────────────────│  ← updates column becomes full-width,
│  nick · 2h   reran cohort, n=412                           │    directly under composer (from 167-190)
│  hermes · 1d  pulled 3 JAMA refs…            (show 5, +N)  │
│ ── below the fold ─────────────────────────────────────────│
│ chips: Status Priority Due Project   ·   Subtasks │ Blocks │  ← chips (127-132) + subtasks/blocks
│ Workflow: waiting_on / check-in / promised                 │    (140-166) + workflow (192-196) move down
└────────────────────────────────────────────────────────────┘
```
What moves DOWN: quick-edit chips, subtasks/blocks, workflow fields. The "Why this matters" callout (134–139) is **deleted** (Section B). The two-column subtasks|updates grid (line 140) dissolves: updates go full-width under the composer; subtasks pair with chips below. Add the **@me lock toggle to SmartCompose** as an opt-in prop so the drawer matches OverviewQuickAdd's affordance instead of requiring hand-typed `@me `.

**A2. MyTasks Columns/Lanes inline expand (`InlineDetail.tsx`) — reorder + add feed peek, scope S/M**

```
│ ▶ Work on this  📌 Plan today  Move →  Snooze  ✓  Archive  │  ← action bar (stays, 110-147)
│ [✎ comment box                                   ] [Post]  │  ← SmartCompose moves up (from 156-158)
│  nick · 2h   last activity entry…                          │  ← NEW: 3-entry newest-first peek
│  emma · 1d   …                            view all →       │    (reuse useTaskDetail's updates,
│ chips: Status Priority Due Project                         │     same hook the Today drawer uses)
```
The 💡 description blurb (105–109) is deleted (Section B). Adding the peek costs one `useTaskDetail(task.id)` query — identical to what `TaskDetailDrawer.tsx:32` already does, so no new endpoint. This fixes the current "comment into the void" problem (InlineDetail shows no feed today).

**A3. MyTasks List drawer + My Hub + full editor (`TaskDetailPanel.tsx`) — one fix covers all three, scope M**

All three surfaces open the same panel (List: `MyTasks/index.tsx:333-336`; My Hub: `PersonalPage.tsx` `selectedTask` → panel; Today/MyTasks "open full editor" buttons). Today the composer is the *last* thing on the Overview tab — maximum scroll distance.

```
┌─ TaskDetailPanel ──────────────────────────┐
│ Task Detail                        ⧉  ✕   │  ← sticky header (stays, 328-390)
│ Title…              [short title]          │  ← title/status block (stays, 393-470)
│ Status ▾                       Delete      │
│ [✎ COMMENT | NOTE]  [box, 1 line→grows ]   │  ← OverviewQuickAdd MOVES here, above the
│   (@me 🔒)(Hermes) appear with content     │    tab bar — visible on EVERY tab, zero scroll
│ ─ Overview Intelligence Notes Comments … ─ │  ← tab bar (473-496)
│ (tab content: fields, description, etc.)   │
└────────────────────────────────────────────┘
```
Mechanics:
- Lift `OverviewQuickAdd` (1127–1501) out of the Overview tab into a fixed zone between the title block and the tab bar. Textarea starts at `rows={1}` and grows on focus (the secondary toggle row already only renders when there's content — 1443).
- **Consolidate to one composer per panel:** drop the duplicate form inside `TaskComments.tsx` (115+) and the form inside `TaskUpdateFeed.tsx` (40–101); both tabs become pure feeds. Three composers → one, always in the same place. The @me lock and Hermes toggles already live in OverviewQuickAdd; the filter pills stay where they are at the top of the Activity feed (`TaskActivityFeed.tsx:86-109`), now sitting directly under the (lifted) composer when the Activity tab is open — composer → pills → newest-first feed, top to bottom.
- After posting, show the existing success toast; if the active tab is Comments/Notes/Activity the invalidations (1227–1229) refresh the feed in place.
- Mobile keeps the sticky-bottom compose override (1257–1268) — thumbs reach bottom, not top; this is a deliberate per-breakpoint divergence.

**Optional follow-up (separate ticket):** default `activeTab` to a merged Activity view instead of Overview (`TaskDetailPanel.tsx:117`). Not required for zero-scroll once the composer is above the tabs; listed because Nick's "whole picture" pref points that way eventually. *(→ CONFIRMED by round-2 feedback; see Addendum.)*

**Scope summary A:** S (Today drawer reorder) + S/M (InlineDetail reorder + peek) + M (panel composer lift + de-dup) — no API changes, no schema changes.

---

## B. My Hub "why this is important" → "next step"

**Ground truth first (so the proposal is honest about what exists):** My Hub (`PersonalPage.tsx`) itself never renders a "why" — its rows open the full TaskDetailPanel, which has no why callout. The literal element is the gold **"Why this matters"** callout in the **Today** drawer (`TaskDetailDrawer.tsx:134-139`), fed by `detail?.why ?? description first line` (line 35), server-computed as the description's first paragraph, 400-char cap, in `handleGetTaskDetail` (`api/routes/tasks.ts:683-689`, returned at 751 — note: the route is `GET /api/tasks/:id/detail`). Its sibling is the 💡 italic description blurb in `InlineDetail.tsx:105-109`. Nick uses Today/My Hub as one mental surface; the fix is to remove the *class* (description-derived "context" callouts), not hunt for a literal My Hub element.

**Remove:**
- `TaskDetailDrawer.tsx:34-35` (why derivation) + 134–139 (callout).
- `InlineDetail.tsx:105-109` (💡 blurb).
- `api/routes/tasks.ts:683-689` why computation + the `why` key at 751 — or keep the field returning `null` for one deploy if anything else reads it (grep shows only TaskDetailDrawer consumes `detail.why`).

Rationale for removal: post-migration, the description's first paragraph is just… the description's first sentence. Echoing it in a gold callout 30px above the description is editorial, not operational, and it double-renders content. Nick has now said so directly.

**What fills the slot — "Next step" options:**

1. **First open subtask** (`detail.subtasks` is already in the same `/detail` payload, `tasks.ts:753`). Zero schema, zero new fetches, and it's *honest* — a next step only shows when one actually exists. When there are no open subtasks, render **nothing** (operational-not-editorial: don't fabricate a next step from prose).
2. **Dedicated `tasks.next_step` column** (schema v79). Mirrors `projects.next_action` (exists since schema v71 — `api/schema-v71-projects-promote-fields.sql:28`). Honest cost: D1 migration + `TASK_SELECT_COLS` + cross-repo lockstep with PB (CLAUDE.md "Cross-repo Schema Coordination") + pull-back allowlist + an editing affordance. That's an M/L for a field that overlaps subtasks ~80%.
3. **Newest activity entry** (`detail.updates[0]`). Free, but it's the top of the feed that (per Section A) now sits directly under the composer — rendering it twice is the same double-render sin as the why callout.
4. **Project's `next_action`** in the task drawer. Wrong altitude — conflates project- and task-level next steps; confusing when a task isn't the project's spearhead.

**Recommendation: Option 1**, rendered as a single quiet line where the why callout was:

```
NEXT STEP   ☐ Re-run propensity weights with HOSP_ID merge      (= first open subtask)
```
Clicking it focuses/toggles via the existing `useToggleSubtask` wiring (`TaskDetailDrawer.tsx:52`). If Nick later wants *authored* next steps that subtasks don't capture, Option 2 is the upgrade path — propose it only after he's lived with Option 1, since a new synced column is the expensive irreversible piece.

**Scope B:** S. Files: `TaskDetailDrawer.tsx`, `InlineDetail.tsx`, `api/routes/tasks.ts` (delete ~7 lines).

---

## C. Succinct descriptions

The migration made descriptions *static*, not *short*. Options:

- **(a) One-shot LLM condense pass, human-review-gated.** Same machinery shape as the P2-B review package (deterministic candidate list → proposed rewrites → Nick approves a diff doc → apply). Risk: these are now **human-authored** leads; rewriting them machine-side is exactly the provenance line the nightly-gardener scope was drawn to protect ("NEVER rewrites human-authored comments" — `docs/superpowers/plans/2026-06-10-m5-phase2-brainstorm-lite.md:39-43`). Even review-gated, it normalizes machine edits to Nick's prose. Scope M.
- **(b) UI-side clamp.** Render description in drawer/expand surfaces clamped to ~3 lines (`-webkit-line-clamp`) with a "more" expander; full editor stays unclamped (it's the editing surface). Note InlineDetail's blurb already hard-truncates at 220 chars (`InlineDetail.tsx:107`) — proving the instinct, badly. Scope S.
- **(c) Writing convention + gardener boundary.** Document "description = 1–3 sentence static lead; everything dated/running goes to the timeline" (it's already recorded in Nick's prefs memory), and rely on the P2-B writer-retarget + nightly gardener to keep machine breadcrumbs from ever re-polluting descriptions. Scope S (docs + the already-planned P2-B work).
- **(d) Curated `summary` field** (short_title pattern, Rule 68). Rejected: post-migration the description's *job* is to be the curated summary — a second field is the same data with a different name, plus sync cost.

**Recommendation: (b) + (c) together, with (a) as a one-time opt-in backstop.** Clamp gives immediate relief on every surface without touching a byte of Nick's text (zero provenance risk, instantly reversible). Convention + gardener prevents regression at the source. Then, optionally: a one-time report listing the N longest leads (e.g., >400 chars — the same threshold the why-cap used, `tasks.ts:689`) with proposed condensed versions in a review doc; Nick accepts line-by-line; originals preserved in the doc. Never a recurring automatic rewrite of human prose.

**Scope C:** S for clamp (`TaskDetailDrawer.tsx`/`InlineDetail.tsx`/possibly `RichTextEditor` read-mode wrapper) + S docs; optional M for the review-gated condense pass (scripts + review doc, no app code).

---

## Sequencing

1. **B (remove why/blurb)** — smallest, unblocks the A1/A2 layouts that reclaim its space.
2. **A1 + A2** (inline drawers reorder) — pure component reorder, deployable same day.
3. **A3** (panel composer lift + 3→1 composer consolidation) — the only M-sized piece; touch `TaskComments`/`TaskUpdateFeed` carefully since ProjectDetail does **not** share them.
4. **C** clamp + convention; condense-report only if Nick asks after living with the clamp.

Verbatim-checkable claims all cited above; nothing here requires schema changes, new endpoints, or PB lockstep (the one option that would — `tasks.next_step` — is explicitly deferred).

---

## ADDENDUM — Nick's round-2 feedback (2026-06-11, after drafting)

Verbatim: *"i wnat activity on the overview for editing... i think priority and project in the
right column with things is a waste of space those can be small drop downs inline above the tabs
of overview. also i thought activity would be a single tab with notes/comment filters on the
editor tab. lastly it shoudl show recent activities with a link to full activities tab in the
design."*

This RESOLVES three of the proposal's choices for the full editor (A3) and extends it:

1. **Single Activity tab — CONFIRMED, no longer optional.** The Notes / Comments / Activity
   tabs collapse into ONE **Activity** tab whose filter pills (`TaskActivityFeed.tsx:86-109`,
   backed by `filterMatchesKind()` in `shared/activityKinds.ts`) carry the notes/comments split.
   `TaskComments.tsx` and `TaskUpdateFeed.tsx` retire as tabs (their feeds are projections of
   the same store anyway). This supersedes the proposal's "optional follow-up."
2. **Field lift above the tabs.** Priority + Project (today in the right-hand fields column,
   `TaskDetailPanel.tsx:534-579`) become **small inline dropdowns on the same row as Status**,
   above the tab bar — alongside Due. The right column shrinks to what's left (assignee, dates,
   key links move into Overview body). "Waste of space" column is gone.
3. **Overview keeps a recent-activity section**: newest 3–5 entries + "view all →" link that
   switches to the Activity tab. Combined with the lifted composer (A3), Overview = compose +
   recent at zero scroll; Activity tab = the full filtered history.

**Revised A3 sketch (supersedes the one above):**

```
┌─ TaskDetailPanel ──────────────────────────────┐
│ Task Detail                            ⧉  ✕   │
│ Title…                       [short title]     │
│ Status ▾  Priority ▾  Project ▾  Due ▾  Delete │  ← small inline dropdowns (was right column)
│ [✎ COMMENT | NOTE box]   (@me 🔒)(Hermes)      │  ← composer above tabs (unchanged from A3)
│ ── Overview │ Activity │ Intelligence ──       │  ← Notes+Comments merged INTO Activity
│ Overview: description · key links · subtasks   │
│   RECENT ACTIVITY (3 newest)    view all →     │  ← link switches to Activity tab
└────────────────────────────────────────────────┘
```

**Scope impact:** A3 grows M → M/L (tab merge + field lift + Overview recent-peek ride along
with the composer lift — one panel rework, one PR). Sequencing unchanged; A3 stays step 3.

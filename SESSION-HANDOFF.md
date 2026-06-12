# ▶ SESSION 2026-06-12 (CONTINUED) — D1 DESIGN-PARITY SWEEP — EXECUTED + DEPLOYED

**Live deploy = `d7bd6180` (HEAD = `20a7a797`). All built green, all deployed. Frontend-only — no schema/route/API change (still 74 tables / 240 routes / v82).**

This session deployed the prior 5-commit batch AND executed the entire "D1 DESIGN-PARITY SWEEP" arc that was queued below (now DONE — see ✅ block). Plus a flashing-feed bug fix and a session-close simplify extraction.

**Commits this session (newest first):**
- **`20a7a797` refactor(simplify):** extracted `TaskInlineFieldRow` into `FieldControls.tsx` (Rule 68 — TaskDetailDrawer + InlineDetail had two identical GhostSelect field-row blocks, now ONE renderer); **deleted orphaned `TaskQuickEditChips.tsx`** (0 importers after the GhostSelect swap); fixed stale InlineDatePicker comment. Net −311 lines.
- **`f7cc11f9` D1 parity P3:** TaskDetailDrawer description moved below-fold (action → composer → peek → next-step → description, matching panel canon); SmartCompose placeholders shortened to "Note or @hermes…" on both drawers (D1-pre item 7 ✅).
- **`a1387ac8` D1 parity P2:** `SmartCompose` gained `showHermesToggle` prop (prepends `@hermes ` on submit, HermesMark icon, **mutually exclusive with the @me lock**); wired on both drawers; InlineDetail gained a NEXT STEP line (first open subtask, interactive); TaskDetailDrawer activity feed → peek-first (3 + "view all →").
- **`7b9a4f9e` D1 parity P1:** extracted `ProjectInlineGhostSelect` + `DueInlineSelect` from TaskDetailPanel into `FieldControls.tsx` (now exported); replaced `TaskQuickEditChips` (boxed ChipPopover pills) with the canonical GhostSelect inline row on TaskDetailDrawer + InlineDetail; added `alwaysShowToolbar`; removed resting box shells from ColumnsView + LanesView.
- **`f34e097e` fix(activity):** project activity feed was flashing every second — root cause was an inline `Wrapper` component defined inside `ActivityEntryItem` (re-mounted every render → Framer `initial:{opacity:0}` replayed) → extracted module-level `ActivityEntryWrapper`; also fixed `usePresence.ts` ttlCleanup to bail on a stable reference (was firing setState every 1s).

**Architecture outcome:** the three task-expand surfaces (TaskDetailDrawer / InlineDetail / TaskDetailPanel) now share `TaskInlineFieldRow` + `ProjectInlineGhostSelect` + `DueInlineSelect` from `FieldControls.tsx`. The drawers match the LOCKED PANEL STYLE canon (one continuous surface, box-budget-of-one composer, GhostSelect controls, composer-on-top, peek-first activity, below-fold description). Rule 68's "add a prop, never re-fork" now holds for the field row too.

## ✅ "D1 DESIGN-PARITY SWEEP" arc (queued below) — DONE this session

Codex Pass 0 (sibling audit) + Pass 1 (expand-surface matrix) ran (`codex-d1-parity-…-last.md`). Verified against code, executed the actionable gaps:
- Pass 0 sibling classes 1–5: all CLEAR or already-fixed (the hex-alpha siblings ListView:224/SearchPage:830 were fixed in the prior 5-commit batch; classes 2/3/4 verified clean by codex).
- Pass 1 gaps: GhostSelect field row (P1), alwaysShowToolbar (P2), Hermes toggle (P2), NEXT STEP in InlineDetail (P2), peek-first drawer (P3), description reorder (P3) — **all shipped above.**
- Codex's proposed `TaskInlineFieldRow` (which didn't exist) — **now created** in the simplify pass.

**Remaining low-priority D1-pre items (apply opportunistically, NOT blocking):**
- Item 2: framer-motion `style.transform` silently replaced on motion elements (8 candidate files — codex Pass 0 found HermesPending/Layout/NetworkBackground CLEAR; 5 listed files don't exist at the cited paths)
- Item 4: fixed-px grid tracks + 1fr crushing at 768–1023 (codex: ListView already has mobile+tablet overrides; Kanban scroll is intentional)
- Item 8: z-order — remaining `z-50` Tailwind modals (CreateDecisionModal) should use `--z-modal`
- N1.20–N1.24 mobile polish batches (see docket below); N1b app-wide de-box sweep; N5 JS-hover→CSS

# ▶ DOCKET STATE after the 2026-06-11 late-evening execution session

> Executed this session (live = HEAD, 848/848 tests, all pushed):
> **N1 ✅** (audit → 24 tickets → ALL fixed, deploys `b4c6e6b6`+`9a3afa91`) · **N1c ✅**
> (@mention typeahead: OverviewQuickAdd→MentionInput + hermes in /api/team/slugs,
> `8a41827a`) · **N1b wave-1 ✅** (`865d6815`: TableControls tint-not-fill class de-box,
> Projects pills, ProjectDetail gold band + composer pills; remaining waves ride the queued
> pill-language sweep task) · **N4 ✅** (peek avatars xs) · **N2 report ✅** —
> `docs/superpowers/plans/2026-06-11-n2-description-condense-review.md`, **APPLY AWAITS
> NICK's row approvals** (rec: condense rows 6/8/9/15 + Q on 14, keep the rest) ·
> **N8 check ✅ — Ask the Lab is DEAD** (1 question ever, 2026-04-10; 0 answers): recommend
> substrate-swap-gated RETIREMENT over H4 convergence — **Nick decides**.
>
> **DOCKET 100% EXECUTED (second pass, same evening, Nick: "get all done"):**
> **N2 APPLIED** (rows 6/8/9/15 condensed via length-guarded UPDATEs + updated_at bump;
> verified) · **mobile Done-bar fixed** (Nick's click-test bug: "Done" only closed — now
> ✓ Complete actually completes w/ undo, beside an honest Close) · **N3 ✅** (PB
> `scripts/collect_artifacts.py` cursor-based vault collection; ArtifactPage Download .md;
> `/og/artifact/<id>` card + ogImage meta) · **N6 ✅ dogfood 17/17 GREEN** (root cause: the
> suite predated the CF gate and was testing the Access interstitial — now runs vs ungated
> preview via DOGFOOD_BASE_URL + fake auth; stale R11 seed-data probes removed w/ tombstone) ·
> **N7 ✅ SETTLED: KEEP** activity_log (71 live logActivity writers + ~12 analytics readers —
> "compat read only" was wrong; Rule 70 corrected) · **N7b ✅** (schema v82
> ai_requests.input/output_tokens test+prod; listener on --output-format json posting usage,
> PB `4981d9d2`; /api/ai-requests totals rollup; HOME asked via chat to restart the daemon) ·
> **N5 ✅** (hov-* CSS utility primitive + 51 pure style-mutation hover pairs converted across
> 28 files; remaining 67 onMouseEnter are stateful-by-design and stay JS).
>
> **Nick's pending:** phone re-test (esp. ✓ Complete on the task panel bottom bar), Ask-the-Lab
> retire verdict (1 question ever, 0 answers — recommend retirement, substrate-swap-gated),
> gardener maiden --apply artifact review (ran 22:40, home), N1b remaining de-box waves ride
> the queued pill-language sweep task.

# ▶▶▶ NEXT-SESSION DOCKET (Nick-ordered 2026-06-11 close) — EXECUTE IN ORDER

> Nick verbatim: "Make sure all these are crystal clear in that order and then we can have the
> next session just start tackling them." Each ticket is self-contained — no re-triaging.
> **Nick's own first move (not a ticket): review the gardener's FIRST --apply artifact**
> (PB `data/gardener/runs/`, maiden run 2026-06-11 22:40 home).
>
> **THE HOUSE STYLE IS LOCKED** (evening, 8 panel rounds, Nick: "lock it in this is great!!!"):
> 8-point canon in `docs/design-system.md` "THE LOCKED PANEL STYLE" — one surface, borderless-
> until-interactive, box-budget-of-one, floating composer, pill controls, GhostSelect canonical,
> floating side-peek panels, title-group/action-group rhythm, one-line empty states. N1/N1b/N1c
> execute AGAINST that doc. Parallel session also landed schema v81 `entity_seen` (new-activity
> teal signal) + AttentionChip — counts now 74 tables / 240 routes / 846 API tests.

## ◀ PARALLEL SESSION RECORD (2026-06-11 — bug #70 → Slack-style seen model → attention signals)

One arc, all deployed (live = HEAD at this close), Nick-driven end to end:

- **Bug #70 RESOLVED** (only open bug; 0 remain): List view DoneBox completion on the side
  (multiselect demoted to x/shift-click), List = full `.mt-band` width (= Calendar/My Hub),
  `--content-band` 1296→1440 (universal edge ~72px nearer the nav at 1920).
- **One color language:** status/priority/project-status converged on `--task-accent-*`
  (matches the shared-row dots); List project column teal like Lanes.
- **Slack-style seen model:** auto-acknowledge on any task-detail open (`useAutoAcknowledge`;
  explicit Acknowledge button DELETED; self-created tasks born-acked in `applyInsert`;
  reassignment resets ack in `applyPatch`); NotificationBell now IN the portal sidebar
  (mark-all-read on dropdown CLOSE); My Hub's misleading unread badge removed.
- **Badge honesty:** My Tasks badge = UNSEEN (gold, drains on open, click → My Items "New for
  You" triage). THE 231 "OVERDUE" WAS 100% SOFT-DELETED PHANTOMS (overdue-count lacked a
  deleted_at guard — fixed; Nick's true overdue = 0). `/api/tasks/overdue-count` → `{count, unseen}`.
- **Schema v81 `entity_seen`** (test+prod, Nick-approved): per-viewer seen tracking → teal
  ● n NEW activity signal (vs gold ✦ NEW assignment), `POST /api/seen` + `GET /api/seen/unseen`
  (routes 240), AttentionChip = THE chip primitive, My Items "New Activity" section.
- **Click-opens-the-thing:** ROOT CAUSE of dead notification clicks = plain `<Navigate>` shims
  dropping `?open=` (209 dead links); ALL legacy redirects now `NavigateKeepSearch`; new
  notification links minted `/portal/my-tasks?open=`; My Items rows open TaskDetailPanel
  IN PLACE; owner re-notification on task comments/updates (no @mention needed; @me/self/
  mentioned-already skipped).
- **Premium pass:** sidebar icons 1.5px absolute strokes + `SquareCheck` (Rule 74); AttentionChip
  anatomy (hairline 28% border, whisper 9% fill) — canon in design-system.md.
- **Codified:** design-system.md "Attention & Notification Canon" + "Icon Discipline";
  CLAUDE.md Rules 73-74; memory `feedback_nick-style-2026-06-11` (8 style rules).
- **5 Hub tasks queued (task_01KTWD89..–task_01KTWD8D..) for the class sweeps** — icon pass
  site-wide, one pill/chip language, badge-honesty audit, deep-link integrity audit, style-
  learnings consistency hunt. ⚠️ These OVERLAP N1b's de-box screenshot sweep — run them off the
  SAME audit pass, don't duplicate.
- **Nick's pending click-tests:** teal ● 1 new chip on the lit-review task (seeded demo row);
  bell open→close clears the 274 notification backlog; badge → My Items → in-place editor loop.

**N1 — MOBILE VISUAL AUDIT (step one, audit-then-tickets).** Nick: "too many visual issues to
make it functional at this point." Dispatch an audit (Playwright mobile viewports 375/390/430 +
the 768-1023 tablet band; key surfaces: Today, My Tasks ×3 views, TaskDetailPanel/mobile compose,
project detail, artifacts page, nav/tab bar/FAB) → produce a TICKET LIST of concrete visual
defects (screenshot evidence, file:line where known, S/M/L), append to this docket as N1.a, N1.b…
Relevant standing rules: 15 (row-height @media scoping), 55 (useIsMobile=1024, tab bar, sheets,
FAB lift), mobile sticky-bottom compose (deliberate), Rule 56 swipe. AUDIT ONLY first — fixes are
follow-on tickets Nick reviews.

### ✅✅ N1 FIX WAVE EXECUTED same evening — ALL 24 TICKETS SHIPPED (Nick: "i trust you" + 4 AskUserQuestion answers: all-24 / Columns→List <768 / full design latitude / two deploys)

Deploy 1 = P1 batch (`b4c6e6b6`), deploy 2 = P2+P3 batch (`9a3afa91`); both live, 848/848
tests, visually verified via re-capture at m375+t768 (screenshots in
`review/n1-mobile-audit-2026-06-11/`, pre-fix evidence in `...-KEEP/`). Deliberate design
calls (live-reviewable): Columns auto-renders List <768 w/ notice; phone toolbar = Filters
pill + swipeable quick-views + Create-Task dropped (FAB is the create path); ScrollToTop
hidden <1024; drop zones + drag hints hidden on touch; NOW line = inline divider between
meetings; task panel = true full-screen ABOVE the tab bar (its Done bar exit, previously
COVERED by the tab bar, is now visible — pre-existing affordance, not new); phone stage
strip shows only the current label; TaskCards hide hover-actions on touch (reachable via
tap→panel). NOT done here (left to their owners): site-wide emoji→icon sweep + box-budget
items (queued icon-sweep task + N1b); ProjectDetail header-meta wrap judged acceptable
clean unit-wrap. Original ticket list below for reference.

### ✅ N1 AUDIT EXECUTED 2026-06-11 evening — TICKET LIST (all fixed, see above)

Captured 70 PNGs (8 surfaces × 6 viewports: 375/390/430 phones, 768+1023 tablet-band edges,
1440 ride-along) against an ungated preview of HEAD; 7 surface reviews → 70 adversarially
verified defects → class-collapsed to the 24 tickets below. Screenshots:
`review/n1-mobile-audit-2026-06-11/` (`<viewport>-<surface>[-cN].png`); raw findings + verdicts in
`_joined.json` there. Numbered N1.01… (dots, 2-digit — deliberately NOT "N1.b/N1.c", which would
collide with the existing N1b/N1c docket tickets). The P3 polish tickets and N1.24 overlap the 5
queued style-sweep Hub tasks + N1b — run those off this same evidence set.

**P1 — broken/unusable on the affected viewport:**
- **N1.01 [P1/M] My Tasks List responsive grid is broken in two distinct ways.** (a) 768–1023:
  title column collapses to ZERO width (TITLE/PROJECT headers overlap, no titles render) — the
  column-collapse gate sits at 767px while mobile-nav mode runs to 1023 (`src/index.css:1949`,
  `ListView.tsx:106,213`); (b) phones: surviving tracks keep a redundant 110px "To Do" status
  column + a dead 32px keyboard-cursor arrow column (touch!) while titles truncate to ~12 chars
  (`index.css:1953`, `ListView.tsx:233`); project cells also hard-clip mid-word at 1023
  (`InlineSelect.tsx:100`). Fix shape: one responsive track-allocation pass — gate to 1023,
  drop status/cursor cols on touch, give the freed width to title. Evidence: `t768-mt-list.png`,
  `m375-mt-list.png`.
- **N1.02 [P1/M] Shared-row stack mode never engages on phones (Today groups + Lanes).** Today
  task rows render one-word-per-line title slivers; Lanes squeezes titles to ~150px wrapping 5-6
  lines beside an empty right column. The shared TaskRow supports stacking but the `today/TaskRow`
  adapter and `LanesView.tsx:91-104` never enable it (`src/components/today/TaskRow.tsx:56-75`).
  Evidence: `m375-today-c1.png`, `m390-mt-lanes.png`.
- **N1.03 [P1/S] Quick-add modal is never horizontally centered** — left edge pinned at 50vw so
  it overflows the right viewport edge on EVERY viewport incl. desktop (missing translateX(-50%)
  in the animate transform, `GlobalQuickAddModal.tsx:121-129`). Evidence: `m375-quick-add.png`,
  `d1440-quick-add.png`.
- **N1.04 [P1/S] Task-panel tab strip clips Files/Details with no horizontal scroll** — Details
  unreachable on phones AND tablets (`TaskDetailPanel.tsx:588-611`). Evidence:
  `m390-task-panel.png`, `t1023-task-panel.png`.
- **N1.05 [P1/M] Right Now hero card crushes its own title** — glyph slivers at 430, ellipsis at
  375/768 while free space sits unused, and the card wraps into a ragged 3-row scatter on phones
  (`RightNowCard.tsx:36-42`). Evidence: `m430-today.png`, `m375-today.png`.
- **N1.06 [P1/M] Today timeline meeting titles vanish on phones** — 2-3 characters per row
  (`MeetingRow.tsx:18-24`); the overlap band makes it worse by forcing side-by-side cards with no
  responsive collapse (`OverlapBand.tsx:77`). Evidence: `m390-today-c1.png`.
- **N1.07 [P1/M] TaskCard touch-forced hover-action icons render ON TOP of wrapped title text +
  avatar** on all touch viewports (absolute overlay, no reserved space — `TaskCard.tsx:196` +
  `index.css:1720`). Hits ProjectDetail and every TaskCard surface. Evidence:
  `m390-project-detail-c1.png`.

**P2 — clearly wrong but workable:**
- **N1.08 [P2/S — CLASS] Blanket 44px mobile button min-height deforms the 17px DoneBox into a
  17×44 vertical capsule on EVERY touch surface** (Today, all 3 My Tasks views, ProjectDetail) —
  the row's primary control looks broken app-wide (`index.css:1669-1677` + `1694-1701`). Fix
  shape: exempt the DoneBox (or scope the blanket rule) and give it a proper centered 44px hit
  AREA instead. Evidence: any `m###-mt-*.png`.
- **N1.09 [P2/M — CLASS] FAB stack (up to 3: quick-add, capture inbox, scroll-top) covers content
  and live controls bottom-right on every mobile surface** — rows' right-meta column, labels,
  even the Columns peek (`index.css:126-145` --fab-stack vars give vertical lift only;
  `PortalLayout.tsx:251`). Fix shape: content gutter (reserved bottom padding on scroll
  containers) and/or collapse-on-scroll. Evidence: `m375-mt-lanes.png`, `m430-project-detail.png`.
- **N1.10 [P2/M] My Tasks toolbar consumes ~55-65% of a phone viewport** — up to seven stacked
  control rows before the first task (`TopBar.tsx:53-132`). Fix shape: mobile condensation —
  filters behind one "Filter" pill, single-row toolbar. Evidence: `m375-mt-columns.png`.
- **N1.11 [P2/S] TaskDetailPanel mobile sheet geometry:** 90vw — a dead sliver of the underlying
  page shows through (canon says full-screen sheet) — and the bottom tab bar stays ON TOP of the
  open panel, permanently occluding the last content strip with live nav above a modal
  (`TaskDetailPanel.tsx:331-344`). Evidence: `m390-task-panel.png`.
- **N1.12 [P2/S] TaskDetailPanel token mismatch: near-black bands behind sticky header + composer
  on the cream panel** (`--cream` vs dark-pinned `--surface-2`-ish hexes, `TaskDetailPanel.tsx:849-851`)
  — violates LOCKED-canon pt 1 (one continuous surface) on ALL viewports incl. desktop.
  Evidence: `d1440-task-panel.png`.
- **N1.13 [P2/S] Panel header touch targets 18-22px and tightly clustered** (prev/next chevrons,
  copy-link — `TaskDetailPanel.tsx:378-409`). Evidence: `m375-task-panel.png`.
- **N1.14 [P2/L] Columns view is desktop kanban shrunk onto phones** — 5 fixed-260px columns =
  ~1360px of blind horizontal panning; the clipped peek renders broken fragments (mid-word
  truncation, orphaned DoneBoxes/priority dots) (`ColumnsView.tsx:40`). Fix shape: phone mode =
  single-column pager with a lane switcher, or auto-fall-back to List <768. Evidence:
  `m390-mt-columns.png`.
- **N1.15 [P2/M] Today timeline mechanics on mobile:** NOW line renders through meeting cards
  with its label colliding (`Timeline.tsx:164-167`, fraction-of-listHeight positioning); six
  drag-only drop zones occupy phone space but are dead UI on touch (`Timeline.tsx:79-96`);
  section headers cram hint text into colliding two-column wraps (`Timeline.tsx:229-236`).
  Evidence: `m375-today-c1.png`, `t1023-today-c1.png`.
- **N1.16 [P2/S] ProjectDetail stage stepper: dots stretch into tall gold/gray ellipses below
  1440** (`ProjectDetail.tsx:1552-1576` — button sets height, dot inherits) **and stage labels
  truncate to ambiguous fragments** ("Data C…", "Revisio…") on phones (`:2110-2117`). Evidence:
  `m390-project-detail.png`, `t1023-project-detail.png`.
- **N1.17 [P2/S — CLASS] Dark-mode tab-strip overflow fade uses a light token → opaque white
  smear clipping the last tabs** (ProjectDetail `:2107-2109`; same pattern may exist on other
  scrollable tab strips — sweep). Evidence: `m375-project-detail.png` (dark).
- **N1.18 [P2/S] ProjectDetail Overview is a cramped 3-col grid at t768** — md:768 grid breakpoint
  disagrees with useIsMobile=1024, so tablet gets desktop grid inside mobile chrome
  (`ProjectDetail.tsx:1050`). Evidence: `t768-project-detail.png`.
- **N1.19 [P2/M] LinkifiedText over-captures prose into the repo-path chip** — rest of sentence
  swallowed, chip truncates mid-word leaving an orphan period (`LinkifiedText.tsx:26` regex +
  chip max-width). Evidence: `m430-project-detail.png`, `d1440-project-detail.png`.

**P3 — polish (batchable):**
- **N1.20 [P3/S] My Tasks toolbar polish batch:** orphaned 1×18px divider stranded when the
  filter row wraps (`TopBar.tsx:93`), search input dead-stops at 260px on its own row (`:74`),
  duplicate create affordances (big teal "Create Task" + global teal + FAB, `:57-69`), Lanes
  header label/description double-wrap (`LanesView.tsx:81-86`).
- **N1.21 [P3/S] Today header/compose polish batch:** date wraps into a 3-line sliver beside the
  H1 at 375 (`TodayPage.tsx:342-346`); how-to hint's dismiss × floats detached mid-text
  (`:370-381`); morning-compose placeholder clips mid-sentence (`MorningThoughtCompose.tsx:58-60`
  — needs a short mobile placeholder); mixed 12h/24h formats ("8:00 AM" rows vs "18:05" NOW badge,
  `Timeline.tsx:177-178` hand-format → use `lib/time.ts`).
- **N1.22 [P3/S] Task-panel text polish batch:** composer placeholder truncates to "@mention a"
  on phones (`TaskDetailPanel.tsx:1514-1517` — short mobile string); metadata separator-dot
  orphans at line wraps (`:458-488`); field row wraps raggedly (indented second line, floating
  Delete — `:495-551`).
- **N1.23 [P3/S] ProjectDetail polish batch:** duplicate "KEY LINKS"/"Key Links" stacked headers
  (`KeyLinksEditor.tsx:226-238` unconditional internal header); redundant own-project chip on
  every task card of the project's own page (`ProjectDetail.tsx:1108-1116`); header meta row
  orphans the stage label (`:792`).
- **N1.24 [P3/M — rides queued sweeps] Icon/emoji discipline + box-budget:** MobileTabBar icons
  skip Rule 74 (default stroke-2 at 20px, no absoluteStrokeWidth — `MobileTabBar.tsx:98,123,184,
  220,261`); emoji glyphs as functional icons (📌 PlannedChip etc., `TaskRow.tsx:115-134`) —
  both fold into queued task task_01KTWD89… (icon sweep); ProjectDetail Overview gold band +
  boxed empty states + Columns box-in-box → fold into N1b de-box sweep. Artifact not-found page
  is a dead end (no recovery action, FABs float on empty page — `ArtifactPage.tsx:136-148`).

Rejected as deliberate/not-shown by adversarial verify: 2 (recorded in `_joined.json`).
One unverified finding (Columns peek edge-clip) folded into N1.14.

**N1c — Composer @mention autocomplete (Nick 2026-06-11 close: "when i @ hermes or someone in
the task detail it doesn't try to autopopulate").** The panel/drawer composers (OverviewQuickAdd
+ SmartCompose) don't surface mention suggestions while typing `@`. Rule 7 says @mentions use
`MentionInput` — either those composers bypass it or its typeahead isn't wired in this context.
Add a mention-typeahead popover (team slugs + `hermes`, GhostSelect-style opaque menu, keyboard
nav) at the `@` caret in BOTH composer primitives. Small/medium; high-traffic surface.

**N1b — App-wide de-box sweep (Nick 2026-06-11: "less boxyness everywhere").** After the panel
style is validated: propagate borderless-until-interactive beyond it. Rule: **box budget of one
per view** — the input-inviting element is the only boxed/elevated thing; ghost controls
(GhostSelect = the canonical select everywhere, built in panel round 5); search inputs +
composers keep boxes; tables keep their grid (structural) but their TOOLBARS de-box; dashboard
cards stay but their interiors de-box; menus/modals exempt. Run as screenshot-driven
audit-then-tickets — SHARE the N1 mobile screenshot pass (one sweep feeds both). Wave order:
drawers (TaskDetailDrawer/InlineDetail) → data-page toolbars → composer surfaces → card
interiors. Codify in design-system.md once the panel verdict is in.

**N2 — One-time description condense pass (review-gated).** Report of the longest task/project
descriptions (>~400 chars) with proposed condensed versions side-by-side in a review doc; Nick
approves line-by-line; originals preserved in the doc; apply only approved rows (guarded UPDATEs
+ updated_at bump for PB pull). NEVER auto-rewrite human prose (design-system "Conversation
Surfaces" + gardener boundary).

**N3 — Artifacts riders:** (a) PB vault-collection script (`GET /api/artifacts?since=` →
`Context/Artifacts/<date>-<slug>.md`, ride /process or janitor); (b) "Send to Google Doc"
export button (one-way, md→Doc via Workspace MCP / md_to_docx.py pattern); (c) OG share card
for `/og/artifact/<id>` (Rule 31 pattern).

**N4 — Overview peek avatar density:** pass `avatarSize="xs"` (20px) on the TaskDetailPanel
OverviewActivityPeek → TaskActivityFeed call (~line 1086) — one-liner, Nick wants the peek
tighter. Verify against the Slack-anatomy section (skeleton unchanged, size is a functional prop).

**N5 — JS-hover→CSS pass (218 sites).** The long-carried polish item — Nick: "should happen."
Convert inline JS hover handlers to CSS rules (index.css patterns; Tailwind v4 group-hover
constraint per Rule 12). Batch by component family; build+axe spot-checks per batch.

**N6 — Dogfood Playwright failures triage (13 pre-existing on main).** Carried 3 sessions —
Nick: "should definitely happen." Run `playwright.config.dogfood.ts`, classify each failure:
real regression vs stale selector vs data-dependent flake; fix or quarantine WITH a reason
comment; target = dogfood suite green or every skip documented.

**N7 — Legacy `activity_log` disposition (22,220 rows, compat-read only).** "Figure it out":
enumerate remaining readers (ActivityFeedCard, ActivityPage, useActivity hook + any API),
decide migrate-those-views-to-activity_entries vs keep-as-frozen-log, then substrate-swap-gated
retire plan if removable (snapshot first; T6a audit already judged content ALL-LOW).

**N7b — Hermes token tracking (Nick 2026-06-11 close: "if there is a way to track hermes
tokens").** The listener runs `claude --print` on the Max subscription ($0 marginal) — capture
per-request usage anyway: claude CLI's JSON output mode reports usage; have
`hub_ai_listener.py` parse input/output tokens per generation and stamp them onto the
`ai_requests` row (metadata or two new columns — Hub-only, no PB lockstep) + artifact revisions.
Surface: a small line in PI Analytics or `/api/ai-requests` totals. S/M; design the column shape
before writing.

**N8 (LOWER — Nick: "not sure ask the lab is being used at all"):** H4 Ask-the-Lab data
convergence (lab_answers → activity_entries + questions.ts Hermes copy). Check usage first
(lab_questions/lab_answers row counts + recency); if dead, consider retiring the surface
instead of converging it.

**Carried tail (below the ordered queue, unchanged):** spacing-token tail ·
`/portal/my-tasks-legacy` retire (substrate-swap-gated) · local-seed schema drift · 768px
journey spec · Query-Resource phased pass · IdeasPage:67/AskTheLab:44 param-strip · HUB-5
dedup-PK assessment (Dual-Plan gated) · PB I40 retirement after one clean Apps Script morning ·
PB sync_lock payload PermissionError warning (watch for recurrence).

---

# ▶ Session 2026-06-11 (FULL DAY) — docket + Nick's live-review cycle ALL SHIPPED

> **State: 838/838 API tests · live deploy = HEAD (final close deploy) · D1 schema v80 ·
> 73 tables · 238 routes.** Full record: CHANGELOG top two entries (DAY + PM). Morning: H1
> migration (descriptions clean, 907→912 timeline entries incl. residual+ID-strip), Hermes
> fetch-bug root-cause fix (lane NEVER worked; lit review delivered), H3 gardener built +
> wired nightly --apply 22:40 home, editor redesign (Rule 72), Hermes Artifacts v1
> (`/portal/artifacts/:id`), drift CI green (v80 retro parity). Afternoon live-review cycle:
> Slack-shaped composers (idle one-row, action row below), Slack-thread entry anatomy in the
> ONE renderer (ActivityEntryItem), AskTheLab converged, ProjectComments/ProjectUpdateFeed
> DELETED, 5 raw-ID timeline bodies rewritten, patterns codified in design-system.md
> "Conversation Surfaces". Nick's style prefs captured in the mn-ccore-lab design-prefs memory.

## OPEN ITEMS (next session / Nick)

1. **HOME listener restart ✅ CONFIRMED via chat** (## HOME 13:38Z): stale pre-fix daemon
   (PID 21736) killed, clean `--once` on fixed code, relaunched PID 21176; gardener schedule
   entry parses (nightly 22:40 --apply, home). Note: the file-relay path FAILED silently
   (req archived status:pending, no response — dispatcher Method-1 kill); chat-mode was the
   working path again. **Tomorrow: review the gardener's FIRST --apply artifact** in PB
   `data/gardener/runs/` (tonight 22:40 is its maiden mutation run).
2. **Nick click-tests:** redesigned task editor (field row, composer above tabs, Activity tab,
   Overview peek), drawer composer-on-top + NEXT STEP line + clamp, first real @hermes →
   artifact flow (needs home listener up or a manual drain), `/portal/artifacts/:id` page.
3. **Artifacts riders (deferred by design):** Google-Doc export button, OG share card, vault
   collection script (`GET /api/artifacts?since=` → PB Context/Artifacts/).
4. **H4 (questions.ts Hermes copy)** — still conditional on Ask-the-Lab timeline surface.
   **H6 carried backlog** unchanged below.

---

# ▶▶▶ HUB-ONLY DOCKET (executed 2026-06-11 — see session section above)

> State entering this docket: **820/820 API tests · live deploy = HEAD code (`82059168` worker;
> later commits are docs-only) · D1 schema v78 · unified timeline is THE message substrate**
> (all 4 legacy message tables + daily_plans/reflections physically dropped; every reader/writer
> on activity_entries; Hermes response lane live; renderers unified). The comment/notes
> UNIFICATION is DONE — what remains below is the task-DESCRIPTION cleanup + riders.

**H1 ✅ EXECUTED 2026-06-11** (gate answers: ① emit as-is ② keep blocker — normalized to the
contract-correct `kind='update', update_type='blocker'` since stored `kind='blocker'` was
off-enum ③ no batching needed (PB pull pages at 2000) ④ NULL verified safe, 0 empty titles).
Final: **907** entries in prod (903 pipeline + 4 residual), task-description line-start dated
count = **0**, LIKE = 2 (wikilink false-positives, intentional). Residual sweep caught 18 tasks
the pipeline missed (14 empty stubs / 3 truly double-encoded `"Sender:…"` / 1 tagged
`[date mechanic]` line) — `Scratch/task-desc-migration-2026-06-11/residual_cleanup.py`. PB pull
applied 590; 79 stripped-to-NULL tasks' stale local `notes` cleared (pull's None-guard skips
NULL). Full execution record at the bottom of
`docs/superpowers/plans/2026-06-11-task-desc-migration-dryrun.md`.

**H2 — Nick's @me visibility click-test** (his step, still pending since v77 ship): post an
@me-locked comment, confirm only-you visibility. Prompt him at session start.

**H3 ✅ BUILT 2026-06-11** (Nick approved appetite; PB commit `1f1e523f`, 41 tests green,
real prod dry-run validated — 9 machine-origin admitted, @hermes/Hermes/free-text human notes
correctly left alone, 0 mutations proposed). PB `scripts/gardener/activity_gardener.py`:
DELTA (SyncCursor) → fail-closed machine-origin gate (ARM1 source_table allowlist + ARM2
pinned PB breadcrumb body-templates — live breadcrumbs are provenance-indistinguishable from
hand-typed notes, so default-DENY) → one bounded Haiku call → validated mutations
(`gardener_collapse:` rollback pattern). `--dry-run` DEFAULT; **scheduler wiring left for
Nick** (schedule.json entry named `activity-gardener`, home-only, 22:40 — enable after
reviewing the first dry-run artifact in PB `data/gardener/runs/`).

**H4 — `questions.ts` Hermes copy convergence** — CONDITIONAL: only if/when Ask-the-Lab gets a
timeline surface. Don't self-start.

**H5 — `scripts/seed/phase0-seed.ts` task_comments plan-JSON loop** — non-live path writing to a
dropped table if ever fed task_comments entries; clean in the next phase0/seed audit.

**H6 — carried backlog (unchanged, lower priority):** JS-hover→CSS pass (218 sites);
spacing-token tail; `/portal/my-tasks-legacy` retire (substrate-swap-gated); local-seed schema
drift; 768px journey spec; Query-Resource phased pass; IdeasPage:67/AskTheLab:44 param-strip;
HUB-5 dedup-PK assessment (Dual-Plan gated, optional); triage the 13 pre-existing dogfood
Playwright failures on main; M5 Phase 2 pointer (activity_entries Phase 2+).

## ✅ Morning additions (2026-06-11, after the closure header below)

- **I40 fired TRUE-POSITIVE (02:51):** Apps Script UPDATE path (handleUpdateTask) stamped
  source_thread_id onto 6 existing tasks with no email_link — only the create paths derived.
  Fix `e6f3ab45` (derived pair on UPDATE + 3 tests) + `82059168` (lint), deployed; Nick-approved
  backfill; remaining=0. PB retires I40 after the next clean Apps Script morning.
- **applyInsert now stamps `updated_at`** (`cd6644bc`, deployed + prod-verified): insert was the
  only mutation op that didn't — every Hub-created row carried updated_at NULL (and PB's pull
  cold-insert separately dropped contract-extension fields; PB-side fix `e2518446`). 12/12 +
  4/4 regression tests, proven-fail-on-pre-fix-form.
- Tests now **820/820** · live deploy = HEAD.

# ✅ DOCKET EXECUTED 2026-06-10/11 NIGHT (PB ultracode session) — ALL TICKETS CLOSED

> **T1 ✅** daily_plans+daily_reflections DROPPED test+prod (~23:20 CDT; snapshots+DDL
> `Scratch/t1-drop-snapshots-2026-06-10/`; codex cold-read SAFE; PB decision doc + I37 yaml
> retired `d97eef43`; brain.db task completed `.applied=True`; REFERENCE rows removed `82e0558c`).
> **T2 ✅** tail done: descriptionLog.ts deleted (`ad11f871`, live muddied-count=0).
> **T3 ✅** P2-C complete: 18 readers + team-pulse (orchestrator catch, `3cdef5c5`) repointed
> (`a8b605dc`); codex cold-read forced deploy-before-drop; cascade-removal wave `d0d57028`
> (schema-v78, seeds/tests/deep-audit retargeted, REFERENCE+Rule-70 updated); 4 twins DROPPED
> test+prod ~00:00 CDT (snapshots `Scratch/t3-drop-snapshots-2026-06-10/`); PB decision doc
> `2026-06-10-hub-legacy-message-tables-drop.md`.
> **T4 ✅** Hermes response lane live (`a4e116c1`): placeholder resolved in-place, visibility
> inherited, 10 tests, prod-smoked. **T5 ✅** ActivityEntryItem unified + filterMatchesKind +
> LinkChip (`c45f9580`; 13-difference props contract). **T6 ✅** (a) audit verdict ALL-LOW →
> 0 of 974 imported per Nick's medium/high bar (`docs/superpowers/plans/2026-06-11-t6a-system-events-audit.md`);
> (b) 12 spam clusters collapsed 41→12 (rollback: `DELETE ... source_id LIKE 'spam_collapse:%'`);
> 112 truncations proven source-truncated, unrecoverable. Brief-7 ✅ actor=nick-ingraham
> (+4-row backfill). HUB-4 ✅ CORS '*' KEEP-as-final (named consumer in helpers.ts docblock).
> **Tests 817/817 · live deploy `4fd2dda4` = HEAD · D1 schema v78.**
> Carried: phase0-seed.ts task_comments plan-JSON loop (non-live path, next phase0 audit);
> 13 pre-existing dogfood Playwright failures on main (predate tonight).

# ▼ (executed above) NEXT-SESSION DOCKET (2026-06-11) — EXECUTE IN ORDER, ASAP

> **Nick (2026-06-10 close, verbatim intent): "i would rather just get everything you mentioned
> done asap" — do NOT wait for the 1pm dogfood-window close; he explicitly waived the remainder
> of the daily_plans 24h window (interim checks were fully clean, snapshot + D1 Time-Travel 30d
> make the drop reversible). He may run this docket from a PB ultracode session — every ticket
> below is self-contained. Trust CLAUDE.md Rules 70/71; state: 793/793 tests, live deploy must be
> brought to HEAD first if any code commits exist above the last deploy (check
> `wrangler pages deployment list`).**

**T1 — daily_plans/daily_reflections DROP (Nick-waived window; brain.db task
`task_01KTSB808F8SGNAYT2EDR42M1D`).** Snapshot both tables (wrangler-d1 SELECT export to
Scratch/) → `DROP TABLE daily_plans; DROP TABLE daily_reflections;` on mnccore-lab-test then
prod via `scripts/wrangler-d1` → remove their REFERENCE.md rows → fill the dogfood table in PB
`Context/Decisions/2026-06-10-daily-plans-retirement.md` (evidence from the 2026-06-10 interim
check is in this file's evening section) → flip PB
`Context/Topics/substrate-swaps/daily-plans-retirement.yaml` `status: retired` → complete the
brain.db task.

**T2 — PB breadcrumb-writer retarget (PB-repo work, TIME-SENSITIVE — every PB
complete-with-note until then re-adds a dated line to a clean description).** Full brief:
`Scratch-handoff/2026-06-11-pb-breadcrumb-retarget-brief.md`. After it lands + one clean sync
cycle: Hub deletes `src/lib/descriptionLog.ts` (+ its test, + the ProjectDetail import) — run the
delta pipeline first (`Scratch/desc-migration-2026-06-10/pipeline.py`) to catch any line that
slipped in.

**T3 — P2-C: legacy-table reader repoint, THEN drop the 4 frozen twins.** Repoint these direct
readers of `comments`/`project_updates` to `activity_entries` equivalents (byte-shape doesn't
matter — they're internal aggregations): `api/routes/contributions.ts:17,22`,
`contributions-decay.ts:55,59`, `insights.ts:321,330,489`, `meeting-cadence.ts:34`,
`meetings.ts:295`, `search.ts:166`, `index.ts:2737` (digest), `projects.ts:361,364` (health agg),
`projects.ts:486` (handleRecentUpdates). Keep the delete-cascade DELETEs (mutations.ts:871-872,
902-903; projects.ts:781-782) until the physical drop, then remove them WITH the drop. Then
substrate-swap-gated DROP of `task_comments`/`task_updates`/`comments`/`project_updates`
(snapshot first; their write-freeze started 2026-06-10; Nick's ASAP stance applies here too).
Update REFERENCE.md + CLAUDE.md Rule 70 ("physical drop deferred" → done).

**T4 — Hermes ai_requests response lane (small, high-visibility).** `handleUpdateAIResponse`
(api/routes/ai-requests.ts) only updates the `ai_requests` row — NO Hermes response has ever
reached a feed (0 completed requests ever; the placeholder "Thinking…" rows never resolve). Fix:
on response for source_type `task_comment`/`project_comment`, post the response via
`postActivityEntry` (kind='comment', actorSlug='claude-ai', fireSideEffects=false, visibility
inherited from the triggering entry if findable via ai_requests.source_id → activity_entries.id)
and ideally UPDATE the placeholder row's body instead of adding a second row. Add tests; smoke
with a real @hermes mention end-to-end (listener polls every 60s on the home laptop).

**T5 — riders (do with T3/T4 if touching those files anyway):** unify
TaskActivityFeed/ActivityStream row renderers into one `ActivityEntryItem` (PB tech-debt item);
`filterMatchesKind()` + LinkChip extraction (PB tech-debt, S); `questions.ts` Hermes copy
converges only if/when Ask-the-Lab gets a timeline surface; nightly-gardener design rides with
the P2-B retarget (machine-origin entries only — never rewrite human comments).

**T6 — Nick-decision items (ask, don't assume):** (a) backfill leftovers per
`docs/superpowers/plans/2026-06-10-activity-log-backfill-report.md` — import 626 "Created task"
+ 348 "Status →" system events as kind='system'? 378 completions on hard-deleted tasks stay
unimported; (b) migration flags per `2026-06-11-description-migration-review.md` — 112
completions hard-truncated at 50 chars (live as-is) + 12 spam clusters emitted individually
(collapse to summary lines?); (c) his @me test is still pending on his side.

**Carried older backlog (unchanged, lower priority):** JS-hover→CSS pass (218 sites),
spacing-token tail, `/portal/my-tasks-legacy` retire (substrate-swap-gated), local-seed schema
drift, 768px journey spec, Query-Resource phased pass, IdeasPage:67/AskTheLab:44 param-strip
wart; PB-side I40/backfill_email_links retirement after one clean janitor cycle.

---

# Session Handoff — 2026-06-10 (EVENING) — P2-A · backfill · DESCRIPTION MIGRATION EXECUTED · Obsidian links SOLVED both machines

> **State: 793/793 API tests · live deploy on `998d089d` (pushed; later doc commits also pushed) · D1 at v77 + 407 `description_line` entries.**
> Evening session executed Nick's queue + "keep going" + live link-debugging to resolution.

## ✅ LATE-EVENING ADDITIONS (after the section below was first written)

- **Description migration EXECUTED (Nick: "go", engine: LLM-on-parse):** 407 entries in prod,
  0 encoded descriptions, 0 line-start dated lines. The double-encoded class was 9 projects not
  the flagged 2 — repaired via `Scratch/desc-migration-2026-06-10/repair_encoded.py` (raw_decode
  prefix → same pipeline). `updated_at` bumped on all 55 so PB's pull takes clean descriptions.
  Full execution record at the bottom of `docs/superpowers/plans/2026-06-11-description-migration-review.md`.
  **PB owes the breadcrumb-writer retarget URGENTLY** (Nick has the paste-ready prompt) — until
  then any PB complete-with-note re-adds ONE dated line (delta pipeline re-runs in seconds).
- **Obsidian links SOLVED — both machines, Nick-confirmed.** TWO stacked bugs: (1) IWD key links
  are stored as WIKILINKS (`[[note|label]]`) which classifyUrl never handled — chips navigated the
  SPA to a relative URL ("website flashes"); fixed `a35848f7` (parseWikilink at the chokepoint).
  (2) obsidian:// warm second-instance handoff drops URIs intermittently — fixed `998d089d`:
  chips now fire **`mnccore://obsidian/<note>`**; the handler opens via the Obsidian CLI
  (`Obsidian.com open`, success pinned on its "Opened:" line) when Obsidian is RUNNING, protocol
  on cold start. Requires Obsidian Settings→General→Advanced→CLI ON (done both machines).
  Work shell was already current (the "stale installer" was a red herring — NSIS preserves build
  timestamps); HOME's shell WAS stale → Nick reinstalled + enabled CLI, confirmed working.
  Handler gotchas learned: `::`-comments inside if-blocks kill the whole bat parser; use full
  System32 paths for tasklist/find (PATH-independence).
- **Ride-along deployed:** `fd4f7cb4` HUB-4 request-aware CORS (authored by the concurrent PB
  session) shipped with the wikilink deploy; 793/793 re-verified including it.
- Click-test sweep CLOSED: folder ✓ workon ✓ My-Tasks title-click ✓ ⚙ Process ✓ project-Activity
  titles+density ✓ Obsidian ✓ (work+home). Remaining: Nick's @me test (his call, later).

## ✅ This session (newest first)

- **P2-A — project composer retarget SHIPPED + smoke-proven** (`5f2890e1`, Rule 70 amended `7debd8ea`):
  project notes/comments → `postActivityEntry` (typed `proj_*` entity keys; new `projectSlug` input
  preserves the legacy `/projects/<slug>` mention-link); GET comments/updates = byte-preserved
  projections; `comments`(2 rows backfilled, ids+timestamps preserved, idempotent)/`project_updates`
  (0 rows) FROZEN; `handleClaudeMention` deleted (3rd Hermes copy — projects.ts half of the
  tech-debt item; questions.ts remains); ActivityStream = unified-feed-only (legacy merge removed —
  re-adding double-renders) + ReactionBar on project rows. Prod smoke: probe project → note+comment
  through new path → projections byte-identical → cascade-delete left 0 orphan entries.
- **⚠️ P2-C SCOPED — DO NOT naively drop the 4 frozen tables:** ~12 live readers still query
  `comments`/`project_updates` directly (contributions{,-decay}, insights×3, meeting-cadence,
  meetings:295, search:166, digest index.ts:2737, handleRecentUpdates projects.ts:486, health agg
  projects.ts:361-364, delete-cascades in mutations.ts/projects.ts). Harmless today (tables
  near-empty + frozen) but a drop under them = the Slice-D 500 class. **P2-C = repoint those
  readers to activity_entries, THEN substrate-swap-gated drop of all 4 twins
  (task_comments/task_updates/comments/project_updates).**
- **activity_log backfill DONE (Nick overrode the skip recommendation):** agent mined all 22,220
  rows → 30 real completions imported (idempotent `source_table='activity_log'`; rollback = one
  DELETE). Report: `docs/superpowers/plans/2026-06-10-activity-log-backfill-report.md` (`3d194c24`).
  Generic bodies blanked → body uniformly = completion-note slot. Ambiguous leftovers listed in the
  report for Nick (system events on live tasks; completions on hard-deleted tasks).
- **Nick's live-review fixes DEPLOYED** (`2a5037b9`): project Activity names the originating task
  (`task_title` JOIN in `/api/projects/:slug/activity` + titled TaskOriginBadge); completions =
  compact one-liners (actor + linked title + optional note); tighter card padding + stream gap.
  Folder chips / workon / My-Tasks title-click / ⚙ Process all PASSED Nick's click-tests.
- **Obsidian root-caused + FIXED on WORK machine:** app self-updated (1.12.7 asar) but the
  installer shell exe was ancient → protocol args dropped (flash, no page). Force-reinstalled via
  `winget install --force Obsidian.Obsidian`, relaunched, fired test URI. **HOME machine needs the
  same one-liner.** Awaiting Nick's visual confirm.
- **M5 P2 brainstorm-lite + Nick's calls** (`7819d226`, comparison `d4480b55`+`548b2dce`, gardener
  `80d4f8a6`): backfill=YES (done); parser-vs-LLM = evidence doc built from real R03 data (Nick
  leaning LLM, reviewing); **retarget CONFIRMED** ("don't want description muddied") — PB owes the
  4 breadcrumb-site repoint (query.py:1960/2001/2084/2650); nightly gardener recorded (machine-origin
  entries only, never rewrites human comments). Order P2-A→P2-C→P2-B approved.
- **Dogfood interim (daily_plans): CLEAN but window runs to ~13:00 CT 06-11** (retirement deployed
  13:01 today — NOT 24h yet). Evidence: 8/8 retired routes 404, pb/sessions 200, health 200, 0 open
  bug_reports, only mutation errors = the 2 documented arc-4 probes. **No drop done.**
- **PB coordination:** the staged-but-never-committed retirement artifacts rescued → PB `3b775d48`
  (decision doc + I37 yaml, pushed). I40 clock tracked PB-side (gate 1/2 met). Tech-debt row
  updated PB `f1ac6e88`. Mirror-table disposition was already done PB-side (`779bcfbf`).
- **Latent gap noted (pre-existing, NOT P2-A):** the ai_requests Hermes lane has **0 completed
  requests ever** — `handleUpdateAIResponse` only updates `ai_requests`; nothing ever writes the
  response into a feed or replaces the 'Thinking…' placeholder. The live Hermes write-back is the
  dispatch lane (pb-sector → postActivityEntry). Needs its own small fix: on response, post a
  claude-ai activity entry (and retire/replace the placeholder row).

### ▶ NEXT
1. **2026-06-11 ~13:00+: the daily_plans DROP** (dogfood task `task_01KTSB808F8SGNAYT2EDR42M1D`):
   snapshot → DROP `daily_plans`+`daily_reflections` (test then prod via `scripts/wrangler-d1`) →
   REFERENCE.md rows → fill the decision-doc dogfood table → flip I37 yaml to retired.
2. **P2-C session:** repoint the ~12 legacy-table readers (list above) to activity_entries, then
   substrate-swap-gated drop of the 4 frozen twins (their own dogfood window started 06-10).
3. **Nick:** Obsidian click-test confirm (work; home needs `winget install --force Obsidian.Obsidian`
   + browser restart), @me test, eyeball the new completion one-liners + titled task chips.
4. **P2-B (PB pairing):** PB repoints the 4 breadcrumb writers; then one-shot description migration
   (LLM-cleaned per Nick's lean, pending his read of the comparison doc) → delete descriptionLog.ts.
5. **Riders still open:** feed-renderer unification (ActivityEntryItem), filterMatchesKind/LinkChip,
   questions.ts Hermes copy, ai_requests response-lane fix (item above).

---

# Session Handoff — 2026-06-10 (PM session, arcs 2-4) — IA CONSOLIDATION · pb-schema 0.4.0 · FOLDER LINKS · email_link
> One PM session, four arcs (newest first below): arc 4 = create-409 incident+hotfix + email_link-at-create ·
> arc 3 = folder-link fix + uniform chips · arc 2 = IA-1 daily_plans retirement + 0.4.0 adoption + HUB-7 ·
> arc 1 = activity_entries Phase 1 (own section further down). Session-close ran at end: /simplify pass
> committed `dc697fbb` (shared activityRender module, INSERT…RETURNING, project-feed index fix, gmailThreadUrl
> helper); 3 deferred refactors → PB `Docs/tech-debt-backlog.md`; doc sweep + 2 new auto-memories
> (local-launch debugging, contract-change payload sweep). Final state: **790/790 API tests · 231 routes ·
> schema v77 · live deploy `be2458ea` on `1f9e46be` = HEAD** (live == main, no skew).

## ✅ IA consolidation EXECUTED + pb-schema 0.4.0 adopted (same session as Phase 1 below)

- **IA-1 — daily_plans RETIRED** (`433b2083`, −1434 lines, substrate-swap gated): audit verdict
  DEAD (1 prod row from 2026-03-31, sidebar flag already false, 0 PB CLI refs, nothing to
  migrate). Removed: `/portal/pb` PBSector page + nav/paths, 8 API routes (command-center, plan
  CRUD/reorder/promote/history, reflection, pomodoro start/complete) + handlers + orphaned hooks
  (`usePBMutations.ts` deleted) + monitors that probed the dead page (deep-audit 11.G/11.H,
  inspection-scanner, feature-registry, 3 Playwright specs); route-contract 239→231. KEPT:
  capture/defer routes, dispatch lane, `pb/sessions*` (pomodoro telemetry, 788 rows), pb-today.
  **D1 `daily_plans`+`daily_reflections` NOT dropped** — 24h dogfood first; brain.db follow-up
  task `task_01KTSB808F8SGNAYT2EDR42M1D` (due 06-11) owns the drop. Decision doc:
  PB `Context/Decisions/2026-06-10-daily-plans-retirement.md`; I37 matrix:
  PB `Context/Topics/substrate-swaps/daily-plans-retirement.yaml`. IA-2 (Personal already on the
  todayPlan primitive — no local plan state found), IA-3 (today_md = KEEP, artifact), IA-4
  (pomodoro KEEP / intention+gratitude+reflections NOT migrated, 1 row each, M5 is future home).
- **pb-schema 0.4.0 adopted** (`8fc11923`, submodule 6f61981→b09cf29 per the PB session's
  request): `notes` wire alias RETIRED + `acknowledged_at/by` ADDED to the tasks contract.
  Adaptations: PWA mobile create stops sending `notes` (contract now rejects it — M5 D1 wire half
  force-resolved); notes-leak test asserts reject-outright (supersedes accept-and-strip);
  brain-db-schema-snapshot regenerated (acknowledged_* = hub_only). **HUB-7 FIXED** —
  `handleAcknowledgeTask` routes through `applyMutation` (was contract-blocked).
- **NEW from Nick (live, queued):** folder/Obsidian links are unreliable — "sometimes it does
  something and other times it doesn't... still haven't had successful opening of a folder or
  obsidian file" (workon for R03 DID work). Wants ONE uniform link presentation everywhere
  (editor/inline/feeds) with TODAY.md's vocabulary: folder, workon, obsidian, gmail thread,
  draft links. → **top of the next-session queue** (debug per-surface URI building/encoding vs
  the working workon verb + unify on `useProtocolLaunch`/`classifyUrl` chips).

## ✅ (arc 4) ⚠️INCIDENT+HOTFIX: creates 409'd ~70min · email_link-at-create SHIPPED — deploy `a4f0ee1c` on `1fb69bbd`

- **INCIDENT (self-inflicted, caught via PB's FYI nudge):** the 0.4.0 contract adoption
  (`8fc11923`) fixed the PWA payload but MISSED `handleCreateTask`, which unconditionally built
  `notes: null` into its insert payload → **every POST /api/tasks create 409'd in prod**
  ("unknown fields for tasks: notes") from deploy `d742cf12` until `a4f0ee1c` (~70 min).
  **Zero real losses** — both rejected mutations in the window were my own probes (verified via
  `processed_mutations`). **Class gap:** 789 tests had NO end-to-end create-payload-vs-contract
  coverage. **Class fix shipped:** a drift-guard test mirrors the FULL create-payload key set
  through applyMutation — a future contract shrink under a route payload fails in CI, not prod.
  Also removed `notes` from `TASK_ALLOWED_FIELDS` (stray legacy `notes` on update is silently
  dropped instead of 409ing the whole patch).
- **email_link at create (PB §2D handoff) — LIVE:** both create paths (handleCreateTask +
  handleMobileTasksToHub) derive `email_link = https://mail.google.com/mail/u/1/#inbox/
  <source_thread_id>` when source_thread_id is present (Apps Script "Email Tasks"). Live-verified
  (probe created with derived link, then soft-deleted). **PB may retire backfill_email_links.py +
  invariant I40 after one clean janitor cycle.** Pairs with arc-3's email_link Gmail chip.
- PB's other FYIs: worker redeploy ✓ (4 deploys since the bump); HUB-7 ✓ (shipped `8fc11923`);
  since_id on task-updates/project-updates /recent = declined for now (their 1ms-floor + client
  dedup works; YAGNI).
- Home chat message sent (pull + Obsidian winget upgrade); Monitor armed for the HOME reply.
- 790/790 tests · tsc green.

## ✅ (arc 3) FOLDER LINKS FIXED + uniform chips SHIPPED — deploy `b5bd159f` on `9b63fa67`

- **THE folder bug (reproduced live → fix proven live):** `verb_open` in `mnccore-handler.bat`
  did `set "path=%~1"` — clobbering `%PATH%` so cmd couldn't resolve `explorer.exe`; EVERY
  open-click died in a flash-and-close console while workon worked (`start` builtin + different
  var). Fixed (renamed var + `%SystemRoot%\explorer.exe`); post-fix the R03 folder verifiably
  opened (Shell.Application window enumeration). The handler log (`%TEMP%\mnccore-handler.log`)
  was the ground truth.
- **Obsidian (NOT our code):** the machine's Obsidian INSTALLER is outdated and drops protocol
  args ("Your Obsidian installer is out of date… better CLI support"); the app package
  self-updates (1.12.7) but the shell doesn't. Our URIs verified correct (22/22 tests).
  **→ NICK: reinstall Obsidian from obsidian.md/download (work + home, 2 min each).**
- **Uniform chips:** LinkifiedText matcher fixed (forward-slash drive paths + line-bounded
  spaced paths — was backslash-only + truncated at first space); ALL non-http clicks unified on
  the `useProtocolLaunch` chokepoint (3 silent duplicates removed — LinkifiedText had NO toast);
  Gmail vocabulary added (`gmailKind` → "Gmail thread"/"Gmail draft" chips w/ Mail icon);
  **`email_link` (v74) rendered NOWHERE until now** (short_title class) — read-only Gmail chip
  above the key links in the task editor.
- **→ NICK (home machine):** `git pull` in mn-ccore-lab gets the handler fix (registry points at
  the script path — no re-registration needed).

### ▶ NEXT (arc-2/3 additions; Phase-1 NEXT list below still applies)
1. **Nick: reinstall Obsidian (both machines) + home `git pull`** — then click-test: folder
   chip, workon, an Obsidian vault-note key link, and the new Gmail chip on an email-captured task.
2. **2026-06-11: the 24h dogfood task** — if clean, DROP daily_plans + daily_reflections
   (snapshot first), fill the decision doc's dogfood table, flip the I37 yaml to retired.
3. PB session: regen-side commits were held for the submodule bump — now landed; they commit
   schema_dsl/schema_contract/aux_writers + mirror `_HUB_ONLY_FIELDS` (acknowledged_*) in
   janitor_dead_letters.py if their drift gate needs it.

---

# Session Handoff — 2026-06-10 (PM) — UNIFIED ACTIVITY TIMELINE PHASE 1

## ✅ activity_entries (schema v77) SHIPPED + DEPLOYED — deploy `70e23a6a` on `3c1a493d`

Executed `Scratch-handoff/2026-06-10-HUB-SESSION-BRIEF.md` end-to-end: ground truth → bounded
brainstorm (4 decisions, all Nick-approved) → UI quick-fixes → Phase 1 build → deploy + smoke.
**789/789 API tests · build + tsc green · identity gate PASS · smoke verified on prod.**

- **Design settled** (spec `docs/superpowers/specs/2026-06-10-activity-entries-unified-timeline-design.md`,
  commit `7e804008`): Design C entity-generic `activity_entries`; referee kind spelling
  (stored `comment|update|completion|system` in `shared/activityKinds.ts`, derived `task-*` at
  render); `@me` prefix + composer lock toggle → `visibility='author'` SQL-gated; derived all-kinds
  project rollups (task entries carry `project_id`). **CLAUDE.md Rule 70** is the operating rule.
- **Ground truth:** 160-vs-3 RESOLVED — brain.db mirror is append-only history of 151 hard-deleted
  tasks (cascade wiped prod rows). Backfill = the 3 live rows, done + idempotency-proven.
- **Backend** (`016a9aab`): `postActivityEntry()` primitive (auth, @me, mentions w/ preserved
  per-kind notification source_types, Hermes on ALL kinds + @me visibility inheritance, project_id
  derivation, source idempotency); writes retargeted (task comments/updates + pb-sector Hermes);
  old endpoints = byte-preserved projections (+ optional compound `?since_id=` cursor); NEW
  `GET /api/tasks/:id/activity` + `GET /api/projects/:slug/activity`; delete cascades clear entries.
- **Frontend** (`de016706`): TaskActivityFeed 3-way merge DELETED → one unified query w/ disciplined
  kind-rendering map; @me lock toggle on the task composer; ActivityStream merges the whole-picture
  feed (task events in project activity, derived kinds, openTask deep-links).
- **UI quick-fixes** (`3fc55559`, `ac615f7a`): My Tasks picker = List | Lanes | Columns, **List =
  cold-load default** (localStorage read removed; URL ?view= wins — Rule 60 updated); **title-click
  opens the full editor** on My Tasks all 3 views via shared-row `onOpenEditor` prop (Rule 71;
  Today/My Hub deliberately unwired — Rule 58 intact).
- **Gate/CI:** `activity_entries.project_id` registered in BOTH identity-SSOT copies (Hub `3c1a493d`
  + PB `cb7e649b`); INFRA-5 schema snapshot was STALE (v75/v76 never registered) — fixed incl. v77
  (`fb54021b`).
- **Ride-alongs:** enums flag verified ON · HUB-3 already enforced by `hub_validate_conflict_hash`
  (brief's claim stale; no change) · notes wire-alias + HUB-7 are **PB-gated** (TABLE_FIELDS is
  GENERATED from the pb-schema submodule; `acknowledged_*` not in the wire contract) — full hand-off:
  **`Scratch-handoff/2026-06-10-PHASE1-SHIPPED-pb-handoff.md`** (PB master brief §2B gate is OPEN).

### ▶ NEXT
1. **Nick eyeballs live:** task detail Activity tab (unified feed + filter pills), @me lock toggle
   (post one, confirm only-you), a project's Activity (task events now roll up), My Tasks List
   default + title-click→editor.
2. **Hub side after PB regens pb-schema:** bump submodule pointer (notes alias retired) + route
   `handleAcknowledgeTask` through `applyMutation` (HUB-7, once `acknowledged_*` are in contract).
3. **Phase 2 (deferred, designed):** legacy activity_log backfill; project composer retarget
   (+ `comments`(2)/`project_updates`(0) backfill); nightly Haiku description-line migration →
   delete `descriptionLog.ts`; physical drops of task_comments/task_updates after alias traffic
   confirms unused; mirror-table disposition (PB).
4. Carried: Today-cockpit IA consolidation plan; polish residue (JS-hover pass, spacing-token tail,
   my-tasks-legacy retire, local-seed drift, 768px journey spec); Query-Resource phased pass;
   param-strip wart (IdeasPage:67/AskTheLab:44).

---

# Session Handoff — 2026-06-10 (continued, historical)

## ✅ Live-review batch 2 + Bug Squasher — DEPLOYED (final session deploy `b3b3ed1a` on `f5299c7e` after the session-close /simplify + v76 doc sweep)

Nick live-drove the morning's deploys and filed a stream of items; ALL shipped + deployed (11 commits `8afe0fdf`..`15362986`):
- **Anchored-left + FLUID-RIGHT wide mode** (`.band-anchored-wide`): My Tasks Columns + Projects Pipeline now share the title's left edge AND expand rightward (no h-scroll; Grants was the reference). Root cause: ColumnsView nested a 960px col-main cap inside the band.
- **Task editor:** editable `short_title` (mirrors project short_name; write-path verified allowlisted), quiet **Delete** at the end of the status row (soft-delete, 5s undo via delayed-commit — server has no un-delete), h-scroll killed (flex min-width-0 class).
- **Folder-open FIXED on real data:** `primary_folder` values are heterogeneous (`file:///` + %20 / backslash / plain) — new `normalizeLocalFolderPath()` chokepoint + handler-side file:/// strip (both-ends). Toast now honest ("Opening folder… (path copied as backup)"). **Obsidian:** vault `.md` key links → `obsidian://open?vault=Peripheral-Brain&file=…` chips (username-agnostic, works both machines).
- **"Posted note" double-entry** killed (read-side filter in the one feed that merges task_updates + activity_log; other surfaces depend on the emit).
- **CLASS: viewer-local timestamps.** New `parseDbUtc()`/`formatDbLocal()` in time.ts (bare SQLite `YYYY-MM-DD HH:MM:SS` = UTC); dateUtils.safeParse delegates; ~30 sites swept across two passes (incl. relative-time, day-grouping, age computations). Store UTC, display local — done.
- **Description dated-log renders newest-first** (`src/lib/descriptionLog.ts`; static lead prose stays pinned on top). Interim fix — the real cure is M5.
- **⌘K `create=true` CLASS fixed:** 4 broken generator→consumer pairs (My Tasks, Meetings, Decisions + PersonalPage's double-broken query-dropping `<Navigate>` shim → new `NavigateKeepSearch`). All palette create commands now open their modals.
- **Create-task default due = today** (`todayCivil()`; quick-add `q` capture deliberately stays dateless — inbox semantics, documented judgment).
- **Bug Squasher (schema v76):** `bug_reports` D1 table (the old /api/bug-report only made GitHub issues) + `GET /api/bug-reports?status=` + `POST /api/bug-reports/:id/status` (PI/API-key; 766/766 tests) + `scripts/bug-squasher.bat` (launches a Claude session that fetches open bugs, fixes, marks resolved, deploys) + `mnccore://bugsquash` verb + **⌘K-only, PI-only "Bug Squasher" command**.
- **mnccore:// registered on BOTH machines** (work: this session; home: via home-work chat — Nick approved in-session there; browser restart at home still pending).
- **M5 plan addendum** (`docs/superpowers/plans/2026-05-26-m5-timeline-build-plan.md`): Nick's Description-vs-Activity requirements (static description / newest-first activity / task events feed project activity / nightly Haiku legacy-description migration / compact link chips). M5 needs its own brainstorm session — Nick's call.

### ▶ NEXT
1. **M5 brainstorm session** (the Description→Activity split) — plan + addendum are the inputs; run superpowers:brainstorming first.
2. Nick: home browser restart (protocol registered); first ⚙ Process / Bug Squasher click-tests; his /process run should pick up Hub comments (collector live — watch `data/hub_comments_digest.md` in PB).
3. Carried: Today-cockpit IA consolidation plan; deferred polish residue (JS-hover pass, spacing-token tail, legacy my-tasks-legacy retire, local-seed schema drift, 768px journey spec); Query-Resource phased pass; param-strip wart in IdeasPage:67/AskTheLab:44 (setSearchParams({}) nukes all params — harmless today).

---

# Session Handoff — 2026-06-10 (morning)

## ✅ Nick's live-review fixes + LOCAL-LAUNCH PARITY + comment→/process loop — DEPLOYED `db13bba2` on `e6816434`

**Two deploys today atop yesterday's round; both repos pushed.**
1. **Nick's 4 live-review fixes (deploy `fab0997b`):** ONE anchored left edge on ALL portal surfaces (Today/My Hub/MyTasks/Calendar/Lab Overview now share the data pages' band edge — verified 320px@1440/480px@1920 on all; the full-bleed taxonomy exemption is DEAD, CLAUDE.md amended); Today+MyTasks page-wide bg tint removed; planned rows show `short_title`; 📌 plan button moved inline after the title.
2. **TODAY.md-parity local launch (deploy `db13bba2`):** `mnccore://` is now a verb router (`scripts/mnccore-handler.bat`): `open/<path>` (Explorer) · `workon/<folder>` (runs ONLY `<folder>\Start Claude.bat` — basename pin = allowlist) · `process` (runs `%USERPROFILE%\Peripheral-Brain\Quick_Process.bat`). Per Nick: executes on the machine he's SITTING AT (no listener routing). **Registered on the WORK machine** via new portable `scripts/setup-mnccore-protocol.bat` (HKCU, derives paths from `%~dp0`+`%USERPROFILE%` — works for home user `ingra` too); handler dry-run verified incl. space-encoded Box paths + refusal gates. UI: ProjectDetail "Open folder"/"Work on this in Claude" (primary_folder now surfaced through rowToProject — was never read by the frontend before), TaskDetailPanel 📂/▶, Today header PI-only `⚙ Process` button (fire-and-forget). CLAUDE.md Rule 69.
3. **Hub comments → /process:** `GET /api/task-comments/recent?since=` (existing route extended: +`task_title`, ASC forward-cursor when `since` present; pb-aware gated; 7-case vitest). PB `scripts/process_hub_comments.py` (filter: ALL nick-ingraham comments + any-author `@claude|@hermes`; drops `claude-ai` + "Thinking about this" placeholders; SyncCursor `hub_task_comments`, advance-after-emit) + /process SKILL.md phase 0a2. Live dry-run: auth OK, 0 comments in prod (table empty — first real comment exercises it).

### ▶ NEXT
1. **Nick: one direct command on the HOME machine** — `cmd /c "C:\Users\ingra\mn-ccore-lab\scripts\setup-mnccore-protocol.bat"` (10s, no admin; then restart the browser there). A relay (req_20260610_074404_work) already pulled home's Hub repo to `b764a137` so the scripts are staged; home's classifier correctly refused the registry write itself (relayed approval ≠ direct authorization for persistent system changes). Work machine = registered + verified this session. Then click-test on either machine: ProjectDetail folder/work-on buttons + Today ⚙ Process.
2. **First real loop test:** leave a comment on a Hub task → click ⚙ Process (or run Quick_Process.bat) → verify the comment lands in the /process triage + cursor advances.
3. Yesterday's queue (unchanged): Today-cockpit IA consolidation plan; deferred polish residue (JS-hover pass, spacing-token tail, legacy my-tasks-legacy retire, local-seed schema drift, 768px journey spec); Query-Resource phased pass.

---

# Session Handoff — 2026-06-09 (evening)

## ✅ ALL THREE WORKSTREAMS (A+B+C) SHIPPED + DEPLOYED — deploy `8c5b8950` on `0f3d09a8`, HEAD `fd5182da`

**One session executed the whole queue: 52 commits, 5 agent waves, 751/751 API tests, deployed + smoke-verified. Schema is v75.** Full record: `CHANGELOG.md` top entry. The work:
- **A (design polish):** all 30 `docs/design-audits/2026-06-09-polish/TICKETS.md` tickets + all 21 cold-audit `SUPPLEMENTAL-TICKETS.md` tickets (S1–S21). The cold audit ran FIRST (4 lenses, 40 fresh prod screenshots at `review/claude-design-20260609T-audit/`), then merged with Claude Design's round per Nick. Headline fixes: deep-link consumers (`useOpenParam` — search→task/⌘K/copy-link now actually open the task), Manuscripts = **stage ≥ writing** (was a filter tautology rendering all 78 projects), fake snooze-undo fixed, ProjectDetail category silent-revert fixed, Activity "anonymous" actors canonicalized at the `logActivity` chokepoint, anchored-column width tokens (`--col-main: 960px`) + `DataPage` shell, first-click date popover, honest sync clock, one staleness truth (Settings sliders), global compact density (per-view toggles REMOVED), capture shortcut **`q`** (Cmd+N was browser-reserved, never fired), `useIsMobile` **768→1024** (UX-9: 768–1023 iPad-portrait = mobile-nav).
- **B (Today driver):** Nick decided **Today = THE cockpit; plan = synced task columns** `planned_for`/`plan_slot`/`plan_rank` (D1 v75 prod+test, brain.db mig 100/101, pb-schema 0.3.3, generic pull-back = zero new sync code). `useTodayState` re-backed via `src/lib/todayPlan.ts` (same API, one-time LS migration, `right_now` singleton). TODAY.md pins planned tasks (`📌▶`/`📌`). Meeting-capture on Today now persists to `meetings.notes` (debounced; `cal-*` iCal events honestly disabled). Decision: PB `Context/Decisions/2026-06-09-today-plan-task-columns.md`.
- **C (ENG backlog):** dead handler deleted, Narratives contract fixed (+ canonical `stageLabel()`/`stageColor()`), UnifiedMyTasks shim gone, PersonalPage→PATHS. Query-Resource primitive = proposal only (65 swallow-sites; needs paired error-UI; phased plan in the C agent report).

### ▶ NEXT (queued, none urgent)
1. **Nick eyeballs the live round** — esp. Today (plan now synced — plan a task, reload, check another browser), My Tasks overdue-first + `OverdueBanner`, Manuscripts (now a real subset), the new date popover, iPad-portrait nav. Post-deploy smoke all green but design is taste.
2. **B follow-up (its own session, plan written):** `docs/superpowers/plans/2026-06-09-today-cockpit-ia-consolidation-plan.md` — PB Sector planner retirement/migration (`daily_plans`), Personal strip removal, the stale `lab_settings.today_md` view verdict, pomodoro/intention disposition.
3. **Deferred with rationale:** JS-hover→CSS conversion (218 sites/57 files — dedicated pass); spacing token long-tail (342-site WARN baseline via new `scripts/check-token-snap.mjs`); ~25 borderline 0.75-opacity slate sites (codemod candidate); legacy `/portal/my-tasks-legacy` page retire (`/substrate-swap`-gated); Query-Resource phased pass; local-seed schema drift (`scripts/local-db-seed.ts` missing `waiting_since` etc. — blocks local journey tests; hub-backend candidate); a 768px journey spec to lock in UX-9.
4. **CLAUDE.md rules were updated this session** (v75, plan columns, `q` shortcut, useIsMobile 1024, Manuscripts identity, global density) — trust CLAUDE.md over older handoff sections below.

---

# Session Handoff — 2026-06-09 (morning, historical)

## ▶ (DONE — see above) Design polish round was teed up (3 parallel workstreams; see WORKPLAN.md top)

The post-deploy work split into three **parallel-capable** workstreams (`WORKPLAN.md` → "PARALLEL WORKSTREAMS 2026-06-09"):
- **A (ACTIVE) — Claude Design polish round.** Brief + prompt are on `main`: `docs/design-briefs/2026-06-09-next-design-audit-{brief,PROMPT}.md` (+ Codex audit `…-codex-hub-simplify-audit.md`). Scope = visual polish + workflow efficiency + "no dead ends" + delight; **width consistency = Tier-1**; the date-picker "first click pops the calendar grid AND the +1d/+1wk presets together" is the click-efficiency archetype to hunt. ⚠️ **Today / the daily-cockpit / the operating-day plan are OUT** (→ Workstream B). **Next action: Nick re-snapshots the repo in Claude Design → pastes the PROMPT → Design returns TICKETS.md → we implement.**
- **B (QUEUED — its own session) — "Today driver."** The operating-day plan split-brain (Today `localStorage` / MyTasks / PB Sector D1) + the one-cockpit IA + meeting-capture persistence. ⛔ Deferred from A; do NOT touch Today in the polish round.
- **C (QUEUED — parallelizable) — ENG-only backlog.** Dead `handleUpsertTodayMd`, Narratives data-contract break, query-resource primitive, stage model, legacy MyTasks, Personal `PATHS`.

Below: what shipped this session (the Slice C/D/E deploy that closed the B-5 skew).

---

## ✅ Slice C/D/E DEPLOYED to pages.dev — B-5 skew CLOSED (2026-06-09)

**Live = deploy `90626636` on commit `7bb1ccef` (HEAD) — Production/main.** Was stuck on B-5 (`dbf9cf97`/`1cd193f2`) for 2 days. `/api/version` 200 production; `/api/dependencies` 401 (clean auth-gate, no longer the column-error 500). Identity deploy-gate `npm run predeploy:identity` → **PASS**.

### Why this deploy was needed — the wrong-surface root cause (LESSON)
The PB sessions that "shipped" **Slice C** (`18680afa`, wire-flip Hub code) and **Slice D** (`7bb1ccef`, `project_dependencies` typed-PK migration) deployed the Hub Worker via **`wrangler deploy` → the unused `mn-ccore-lab-api.workers.dev`**, and smoke-tested against *that* surface (it has the new code + sees the migrated D1, so it passed). **But the team's real surface is `pages.dev`, which only updates via `wrangler pages deploy`** — it stayed on B-5. Meanwhile Slice D's **prod-D1 migration WAS applied** (D1 is shared across both Workers). Net live state until today: B-5 code (queries `from_slug`/`to_slug`) against a D1 table re-keyed to `from_project_id`/`to_project_id` → **`/api/dependencies` + `/api/narratives` 500'd in prod**, unnoticed because the smoke tests hit workers.dev. The Slice-D rollback runbook itself uses `npx wrangler deploy` — the tell. **Rule: a Hub deploy is `npm run deploy:pages:gated` (= `wrangler pages deploy`). `wrangler deploy` does NOT touch the team's site.** (This is the 2nd recurrence; see CLAUDE.md Quick Reference deploy row.)

### Slice-E gate gap fixed (was blocking the deploy)
Slice D added `project_dependencies.from_project_id`/`to_project_id` (typed FK) but **never registered them in the Project-Identity gate SSOT** → `predeploy:identity` fail-closed on `introspection_fail_closed`. Fixed: added both columns (`policy: typed_required`) to **both** byte-equal SSOT copies — PB canonical `scripts/db/project_identity_surfaces.json` + Hub copy `scripts/project-identity-surfaces.json`. Gate now PASS (both columns verified 0 non-typed; the L1 kg dangling-rel stays a tracked WARN). **These two edits + the 4 doc updates below are committed this session.**

### Project-identity convergence — now fully LIVE (storage + wire + display all converged)
The PB-side arc (Slices A–E) is closed AND now actually deployed to pages.dev:
- **Schema is v74** (was documented v70): v71 project fields, v72 meeting tags, v73 `projects.type`, v74 `waiting_since`/`email_link`; + Slice-D `project_dependencies` DROP+recreate (unnumbered DDL).
- **`tasks.project_id` 3-axis contract (CORRECTED):** storage = typed `proj_*` · **sync wire = typed `proj_*` (Slice C, 2026-06-09)** · browser `/api/tasks` display = slug (COALESCE in `task-cols.ts`). The old CLAUDE.md "wire = slug / PB pull reads slug" was true only of the browser read; the **sync** wire is now typed.
- **kg converged + detached:** Slice A re-keyed Hub + work kg to typed `proj_*` (the old "Hub kg still slug-format / never propagated" is FALSE now). Hub kg is a **detached store post-P4** (no steady-state PB→Hub kg path; cross-machine kg rides the brain event log) → the gate's 5 Hub-kg checks are WARN-only.
- **`waiting_since`/`email_link`** promoted PB-only → Hub-canonical (v74, synced, in `/api/tasks`).
- **pb-schema:** sole-emitter manifest (VERSION 0.3.2); Hub CI runs `python -m pb_schema.verify`. One non-urgent pointer bump to `70c7196` still pending PB-side.

### Sync is SAFE across any deploy boundary (verified in code)
PB pull requests `?wire=typed` but tolerates a slug response (B-5 ignored the param); `_resolve_task_project_fk` (PB `hub.py:375`) resolves slug OR typed, **fails closed** on unresolvable refs, and never clobbers a link to NULL. PB push (`hub_payload.py:334`) sends typed `proj_*`; B-5 `applyInsert` canonicalizes idempotently. No silent loss occurred during the 2-day skew.

---

# Session Handoff — 2026-06-07

## ✅ Slice B B-5 DEPLOYED to pages.dev (2026-06-07)

**Deploy `dbf9cf97` on commit `1cd193f2` — Production/main, LIVE.** `waiting_since` + `email_link` promoted from PB-only to Hub-canonical on tasks. Round-trip verified on `https://mn-ccore-lab.pages.dev/api/mutations` → `status: accepted`, `result_seq: 6120`; GET returned both fields; cleanup confirmed (seq: 6121).

**Note:** The prior session ran `wrangler deploy` (standalone Worker) which updated `mn-ccore-lab-api.workers.dev` only. pages.dev deploys via `npm run build && wrangler pages deploy dist --project-name mn-ccore-lab --branch main` (MANUAL, no CI auto-deploy on push). This B-5 deploy used that mechanism.

# Session Handoff — 2026-06-05

## ⏸️ PAUSED pending the PB P3-cut (2026-06-05). Project-identity is ORTHOGONAL + on hold.

> The brain-sync **P3 cut is mid-soak**; finishing it takes priority. **Next-session START HERE:**
> `~/Peripheral-Brain/Scratch/plans/2026-06-06-NEXT-SESSION-finish-p3-cut-and-decide.md` (home active → can close the cut).
> Project-identity status below: **Slice A DONE (Hub+work kg), gate (Slice E) shipped; 5 KEEP + home-kg + Slice C pending.**
> Do NOT resume Slice C or kg-data work until the P3 cut is closed (it's the lane Slice C rides). Don't conflate the two.

## ▶▶▶ AUTO MODE (post-compact) — EXECUTE: Project-Identity Convergence

**START HERE. Approved + prioritized by Nick (2026-06-05).** Read + execute the ticket queue in
`docs/superpowers/plans/2026-06-05-project-identity-convergence.md` IN ORDER — do not re-triage,
do not re-investigate (verified facts are in the plan). Decision: PB
`Context/Decisions/2026-06-05-project-identity-single-machine-identity.md`. Reconciled design:
`Scratch/project-id-decision-2026-06-05/SYNTHESIS-project-identity-northstar.md`.

**Decision:** ONE machine identity = typed `proj_*` everywhere internal (storage / FK / kg / sync
wire); slug = a one-way human projection (URL + display) only — a LEAF, never a hub. Ends the
recurring "slug load-bearing on an internal machine path" class (tasks, kg, propagation gaps).

**Order:** ~~Slice A~~ **DONE 2026-06-05** → build the symmetric **completeness GATE** (the
primitive — SSOT surface list + schema-introspection + runtime guards + round-trip test +
both-store/HOME dry-run) → **Slice C** (replication wire → typed PK via a dedicated typed contract;
browser `/api/tasks` STAYS slug; cross-repo, gated on the gate + HOME verification + snapshots,
fail-closed alias-resolving) → **Slice D** (project_dependencies / HISTORICAL disposition).
**Slice B** (5 straggler rows → typed) already DONE.

**✅ SLICE A COMPLETE (2026-06-05) — Hub + work brain.db converged to typed-only kg.** Record:
`~/Peripheral-Brain/Scratch/slice-a-kg-2026-06-05/SLICE-A-COMPLETE.md`. Tool:
`~/Peripheral-Brain/scripts/db/slice_a_kg_typed_rekey.py` (dual-planned + 4-agent adversarially
verified). Hub: 105 typed-orphan entities + 35 orphan rels re-keyed/merged to canonical `proj_*`,
174+451 `deleted_at`-only tombstones healed, GAP-4 (`tasks.project_id='multidiseasepred-xie'`
slug→typed + dead-source edge). brain.db converged via kg-only pull + local TEST/children cleanup.
Both stores verified 0 typed-orphan / 0 orphan-rel / 0 orphan-edges; 5 KEEP slug nodes by design.
**⚠️ MAJOR FINDING:** `PB_BRAIN_EVENT_LOGS=on` gates the Lane-3 pull (`hub.py:1253`) → the audit's
"live bleed via pull" was NOT active (kg pull skipped; brain.db wasn't being re-poisoned). Hub was
the dirty store; now clean. **OPEN:** (1) HOME brain.db kg still stale (flag-gated pull) — converge
via kg-only flag-off pull; (2) the flag / stuck event-log lane / outbox-retirement transition
(2026-06-03 handoff) is the systemic blocker to automatic cross-machine kg sync — Nick's
architectural call; (3) 5 KEEP slug nodes = B2 "create-new-project" candidates (deferred).

**HEADs:** Hub `main` `5921ce18` (live deploy `8cc00130` / `7653955d`); PB `main` `b3ef97e5`.
**Guardrails:** don't run `p2_hub_rekey_apply.py` as-is (projects.id already converged; doesn't
cover kg right); don't blind-rewrite `project:*` (dual-use namespace — tier it); don't flip the
wire before the gate + HOME verify; don't let `COALESCE(...,raw)` tolerance leak into internal channels.

---

## ▶▶ (2026-06-05, DONE this session) project_id read-boundary fix + edit-more + P6 + 9a007fd1 ALL DEPLOYED

**Live = deploy `7653955d` on commit `8cc00130` (2026-06-05) · both repos pushed · /api/version 200 production.** Ultracode session cleared the entire WORKPLAN "▶▶▶ NEXT SESSION" queue. Build + `tsc` green; **API suite 732/732**; journeys **6/6**; resolver verified against live prod data.

**1. `tasks.project_id` slug↔id — FIXED (the DECISION-FIRST item).** Decided **Direction 1 (store typed `proj_*` PK, present the SLUG at the read boundary)** via dual cold-plan + Codex + live-prod ground truth. Resolution is ONE chokepoint — a `COALESCE((SELECT p.slug FROM projects p WHERE p.id=t.project_id), t.project_id) AS project_id` subquery in `TASK_SELECT_COLS` (`api/lib/task-cols.ts`) — fixes the slug-keyed frontend AND the PB→Hub pull (same `/api/tasks` seq-cursor handler). `?project=` resolves slug→id; `meetings.ts` aliased `tasks t` (dropped the fragile `.replace`). Commit `e7d00d04`. **5 slug-straggler task rows backfilled → typed PK in prod D1** (Nick-authorized; verified 0 remain; needed for the id-only internal mutation paths). Decision doc + registry + plan-banner: PB `63367967`. CLAUDE.md rule added. ⚠️ **Do NOT re-key the frontend to `p.id`, do NOT run `p2_hub_rekey_apply.py`** — `projects.id` rekey already converged on work+Hub (76/76 + 73/73 typed). Slug is the wire form per the documented layering (master plan: "slugs are display/routing fields") + every read consumer is slug-keyed + cross-store typed-PK convergence is fragile (Hub D1 `kg_*` still hold slug-format project keys). (Self-audit correction: an earlier draft's "peripheral-brain-system PK divergence" was an alias, not a live divergence — work+Hub converged.)
- **2. `9a007fd1` Today fixes — runtime-verified + DEPLOYED.** journeys spec extended (undo-on-complete, planned-strip DoneBox+grip, Completed-today uncheck) — 6/6. Commit `897d5d81`.
- **3. edit-more — SHIPPED** (`73977e43`): shared `TaskQuickEditChips` (Status/Priority/Due/Project + "Open full editor →") on Today's `TaskDetailDrawer` + MyTasks `InlineDetail`, reusing FieldControls; full panel mounts locally.
- **4. P6 responsive — SHIPPED** (`8cc00130`): BottomSheet focus trap (UX-7), CreateTaskModal→BottomSheet on mobile, MyTasks ListView mobile grid (desktop power-grid untouched). PAGE-7 already present. **UX-9 tablet breakpoint DEFERRED** (global layout change; flagged).
- **5. key_links PB→Hub — NOT a bug.** Both sides have the same 3 projects with key_links; plumbing fully wired; it's a data-entry gap.

**▶ Remaining (small):** (a) **DH-5** — Nick's eyes on live Key Links (CF Access gated; data + component verified, can't automate). (b) **edit-more / P6 post-deploy visual** confirm (presentation-only; not journey-covered). (c) optional follow-up: reconcile the PB-project per-store typed-PK divergence (non-urgent; sync bridges on slug). (d) **UX-9** tablet breakpoint (deferred). The P2 prod rekey is now **moot** (parent table already typed) — its consolidated plan is banner-superseded.

**Session investigation artifacts (gitignored):** `Scratch/project-id-decision-2026-06-05/` (A1 ground-truth, A2 dual-cold-plan, codex synthesis + blind-spots, B3 key_links, S1 edit-more/P6 scope).

---

## ▶▶ (HISTORY 2026-06-04) Round-6 design batch DEPLOYED + LIVE (drag fix + P3–P6)

**Live = deploy `0d024aee` on `1bbb2406` (2026-06-05) · origin/main pushed.** The Round-6 design batch (`a231fea7`…`663043e5` + docs `1bbb2406`) is **DEPLOYED + LIVE** — live frontend bundle hash verified **== local build** (`index-Dt-iZcHv.js`), `/api/version` 200 production. Build + `tsc --noEmit` green; drag fix verified **3/3** on the local journeys stack (re-verified green after P3–P6). Don't re-triage a deploy decision.

**The deployed Round-6 batch (detail: `CHANGELOG.md` top + `WORKPLAN.md` → TASK-UI CONTINUATION):**
- **`a231fea7` — Today drag-to-plan FIXED** (Nick-reported). Root cause: grip was `opacity:0`-until-hover (users grabbed the non-draggable row body → no `dragstart`) + all timeline drop zones render above the task list with no HTML5 auto-scroll (below-fold tasks unreachable). Fix: always-visible grip + a **📌 no-drag plan button** (works on touch via `@media hover:none`) + `useDragAutoScroll`. Proof: `tests/local/journeys/drag-to-plan.spec.ts` (3/3). Rule 58 intact.
- **`c4fbb3ec` P3** `<DueLabel>` consolidation (5 surfaces; NOT full-row-into-cards — taxonomy) · **`958d835f` P4** global Settings density + skeleton/touch fixes · **`4a21efce` P5** new `src/components/ui/` {Button,Chip,Field,Modal} + adoptions · **`663043e5` P6** mobile pass (iOS focus-zoom, touch-reveal, overflow, PAGE-6, UX-8).

**⚠️ Committed but NOT deployed / NOT runtime-verified — `9a007fd1` (2026-06-05):** three more Today row bugs Nick hit live — undo-on-complete (`markDone` now fires the 5s undo toast + restores the prior plan slot), the planned-strip row swaps its raw checkbox for the shared `DoneBox` (mark-done tooltip) + gains a drag grip, and "Completed today" items are clickable to uncomplete. Build + tsc green; **runtime-verify (extend the journeys spec) + deploy still pending** — WORKPLAN → NEXT SESSION task 5.

**Shipped since 2026-06-01 (all deployed):**
- **`4d17036f` (06-04) — Hub renders `short_title`.** The shared `TaskRow` now displays `short_title || title` (full title on hover via native `title=` + still full in the detail drawer). The brain.db/D1 `short_title` field always synced to the Hub and was returned by `/api/tasks` (it's in `TASK_SELECT_COLS`), but the frontend read it **nowhere** — so 219–365-char RO3 titles dominated Today/MyTasks after Round-6 removed truncation (Rule 68). **Pure display gap; the short titles already existed in D1.** Backlog reconciled to 0 (1 straggler generated via `BrainDB.update_task`). Generation stays automated via **`generate-today` Phase 1b (daily, home)** — NOT a cron; no new schedule added. CLAUDE.md Rule 68 updated.
- **`12036dc5` B-8** (mutations/projects allowlist-lag), **`fc91ccd9` DH-6** (page empty-states via `<EmptyState>`), **`b733c424` DH-3** (`isTaskDone` sweep), **`b5f38d10` DH-4** (`dueLabelText`) — 06-04.
- **`33293abe` F1** (pb-schema submodule import, CONTRACT_VERSION 0.2.0), **`aa85c71b` P2 drop-slug** (store typed project PK not slug on FK cols) + test updates — 06-02.

**▶ OPEN THREAD — P2 Hub re-key prod-D1 migration (un-run, GATED).** The P2 *code* (typed project PK on FK columns) is deployed, but the **prod-D1 data rekey has not run**. Tool: `scripts/p2_hub_rekey_apply.py` (committed `4d... tidy`; dry-run default, fail-closed assertions). Template: `scratch/p2-hub-rekey.sql` (gitignored, regenerated from brain.db). Gates: ✅ F1 codegen · ✅ 4 ex-no-anchor projects · ✅ sentinel — ⬜ **HISTORICAL-table per-table policy** · ⬜ **`project_dependencies` slug-keyed decision** · ⬜ **Nick's go + both machines up + soft-freeze.** ⚠️ **UPDATE 2026-06-05 — this IS a confirmed LIVE mismatch, not safe cleanup:** 20/22 open linked tasks store `project_id` = the typed id, but the frontend resolves by slug AND the sync expects slug (`hub.py:2212 d1_project_slug`) → tasks render unlinked + group wrong, and the sync is silently broken too. The P2 write flip (`aa85c71b`) forgot both consumers. **Fix direction is UNDECIDED — needs a dual + Codex opinion first; see `WORKPLAN.md` → "▶▶▶ NEXT SESSION" → "DECISION-FIRST" block.** Do NOT run the rekey tool until that lands (and whichever direction wins must SUPERSEDE the conflicting old slug decisions).

**▶ NEXT — see `WORKPLAN.md` → "▶▶▶ NEXT SESSION" block (the queued, ultracode-ready pickup with full context for fixers):**
- **DECISION-FIRST: the `tasks.project_id` slug↔id mismatch** — get a dual + Codex opinion on direction, decide, **supersede the conflicting old slug decisions**, then fix (frontend + sync + maybe the rekey). Full origin/options in WORKPLAN.
- **edit-more** (design-promised inline quick-edit + "Open full editor →" on the Today/MyTasks drawers — currently no field editing or path to the full editor from those surfaces); **DH-5** Key Links eyeball (only 3 prod projects have any: `adhere-lpv-trial`, `oncology-risk-tools-lyons`, `ats-early-career-working-group`); **key_links PB→Hub sync gap**; **deferred P6** responsive items; **runtime-verify + deploy the `9a007fd1` Today UI fixes**.
- Parallelizable via ultracode (see WORKPLAN) — the slug *decision* gates only its own implementation.

**Loose working-tree files (after 06-04 tidy):** `dist-dryrun/` deleted + gitignored. `review/audit-results.json` stays tracked-but-gitignore-intended (machine-generated; shows as `M` — harmless, just never commit it; a clean untrack needs a bare index commit that Rule 13 bans, so left as-is). Still untracked by design: `review/MN-CCORE Lab Hub Design System (5)/` (the Round-6 design-tool source — like prior handoffs, zip+commit it if you want it preserved in git; otherwise local-only).

---

## ▶▶ (HISTORY 2026-06-01) Task-UI consistency refactor (P0–P2) MERGED + pushed to main

Executed the `review/MN-CCORE Lab Hub Design System (5)/design/` handoff (Round 6 task-UI consistency pass), P0→P2. **tsc + build green; P0 surfaces visually verified (dark + light) on the local stack.** All on `main` + **pushed** (author ingra107, no Claude attribution):

- `4ed8e657` — **P0 + P1 + P1.5**
- `b1f10a04` — **P2 §4** (status-as-truth)
- `aa15f556` — `/simplify` session-close cleanup
- `a19a7aa0` — local test-harness fix

**P0 — one shared row.** New `src/components/tasks/TaskRow.tsx` is the single canonical row: square = complete (never select/promote), body-click = expand, shift-click / long-press = select, full non-truncating titles on one fixed left edge, reserved priority dot, theme-aware `--task-*` tokens. Surfaces now use **thin adapters** that preserve all prior behavior — `today/TaskRow.tsx` (drag-to-plan, Right Now, workflow badges, drawer), `MyTasksRow` in `MyTasks/views/ColumnsView.tsx` (+ reused by `LanesView`), `HubTaskRow` in `portal/PersonalPage.tsx`. **Don't fork the row — extend its props.** **My Tasks List view is deliberately left as the protected power grid** (j/k/e/x nav + inline-edit columns; CLAUDE.md Rule 60).

**P1 — editor + due-date consistency.** Due-date field made uniform (`noContainer`); Key Links → compact inline chips in `KeyLinksEditor.tsx` (auto-applies to ProjectDetail); one date control (`DateInput` delegates to `InlineDatePicker`); new `src/components/DueLabel.tsx` + a sweep replacing hand-rolled `new Date(due+'T23:59:59') < new Date()` with `dateUtils.isOverdue()` across dashboard cards / Analytics / Deadlines / Grants / task views / Pulse / etc.

**P2 §4 — status-as-truth.** New `lib/taskGrouping.isTaskDone(t)` (= `t.status === 'done'`) adopted on the core surfaces; `completed`/`completed_at` still written through mutations. **§5 (no-double-bg + click-affordance) verified ALREADY-COMPLIANT** via screenshots + code inspection — no changes (the double-bg problem was the My Tasks/Today one P0 already fixed; TaskGridView already does body=open / checkbox=select).

**Harness:** `scripts/local-db-bootstrap.ts` now skips the superseded monolithic `schema-v48.sql` (it collided with v20's `pomodoro_sessions`, aborting the migration chain so `tasks.blocked_by` never landed → `/api/tasks` 500). `npm run test:local:setup` works again.

### ⚠️ Incident + lesson (shared-worktree concurrency)
Mid-session a `git stash` (signature: `WIP→reset: moving to HEAD` at 07:02) — most likely a `git pull --autostash` triggered by the **concurrent second Claude session in this same working tree** — swept ~17 uncommitted files. Recovered by hand re-application + commit (no work lost; the dangling stash `1903677f` is redundant/safe to drop). **Lesson:** running two Claude sessions on one checkout shares one index/worktree — uncommitted edits are fragile. Mitigation: commit-per-chunk, or give the second session its own `git worktree`.

### ▶ NEXT — tracked in WORKPLAN.md (NOT "optional" — see `## T1 — Design-handoff leftovers` → Round 6, items DH-3…DH-6)
- **DH-4** *(do this one)* consolidate the due-label text helper (TaskRow `DueChip` / `DueLabel` / MyTasks `dueLabel` → one `dueLabelText`).
- **DH-5** post-deploy visual verify of ProjectDetail Key Links chips + editor Due-date box (couldn't verify on local seed).
- **DH-3** finish the §4 `isTaskDone` sweep across the ~85 remaining dual-check sites (hygiene, not a bug — lowest urgency).
- **DH-6** page-level empty-state consistency pass.
- **Deploy:** nothing deployed this session — task-UI is on `main` only. Check live-vs-main + decide (see the 2026-05-28 section below for the still-pending hub-hardening deploy + its validator activation).

---

## ▶▶ (2026-05-28 — still-relevant deploy context) Hub hardening + primitive-enforcement MERGED to main; deploy pending

**Hub HEAD on main:** post-merge; the branch `hub-hardening-2026-05-27` was merged `--no-ff` with **68 commits** (34 hardening + 21 primitive sweep + 6 codex-pass-5 BLOCK fixes + 7 misc). **691/691 API tests, build green.** **PB main HEAD:** post-merge; the branch `primitive-write-result-2026-05-28` was merged with 3 commits (WriteResult typed return). All four codex review passes recorded (`Scratch/audit-2026-05-27/codex/{synthesis,pass2-synthesis,pass3-final/synthesis,pass4-primitives/synthesis,pass5-final/...}.md`).

**The 11 codex-pass-4-recommended class-of-bug eliminator primitives (the "slope-changing" structural work, all shipped):**
1. `defineRoute()` DSL at `api/lib/route-dsl.ts` — 236 routes migrated in `api/index.ts`; metadata explicit not path-derived
2. Generated route contract test at `api/routes/route-contract.generated.test.ts` — auto-emits PB-403 assertion per registered route
3. Typed branded Request at `api/lib/typed-request.ts` (`AuthedRequest`/`PIRequest`/`ProjectVisibleRequest`) + `request?:` lint. **Adoption deferred** (~200 handlers still take raw Request) — codex pass-5 said "either adopt or narrow claim to lint-only"; we shipped the lint, deferred adoption to a follow-on branch.
4. Runtime entity guard wrappers at `api/lib/route-guards.ts` (`withProjectWrite`/`withTaskProject`/`withExistingRowProject`) — 4 hand-rolled create-sites + 5 hand-rolled update-sites migrated
5. `TABLE_PRIVATE_COLS` expansion — email_drafts/inbox_events/regulatory_items/file_attachments (+gmail_draft_url, +r2_key added in Wave 4)
6. `FK_SLUG_FIELDS` expansion + `ALLOWED_TABLES` unblocking (Wave 4 fix — registry was dead until ALLOWED_TABLES caught up) + canonicalize at 6 direct-write routes that bypass `/api/mutations`
7. `SELECT *` lint at `scripts/check-select-star.mjs` — table-aware; 8-site baseline burned to 0 (W3-A); `--enforce` mode wired in package.json (W4-C)
8. `hiddenResource()` helper at `api/lib/hidden-resource.ts` — applied at the revision oracle path (W4-BE; the Phase 10 "fix" was incomplete)
9. `idempotentDelete()` wrapper at `api/lib/idempotent-delete.ts` — mode soft/hard; 9 sites migrated (3 in Wave 2 + 6 sibling sweep in Wave 4); 2 exemption-documented (deadline-cascade double-project gate; uploads R2 side-effect)
10. PB `WriteResult` typed return — silent `if result:` bypass is a TypeError; 11 writers + 22 callers + 13 tests; status semantics: `accepted`/`merged_clean`/`conflict` have `.ok=True` (Hub-wins convergence is rest state, not failure)
11. `cleanupWrapper.runCleanup()` at `scripts/cleanup-wrapper.mjs` — requires verified `_final_summary.json`

**Defensive lints (warn-on-new in dev, `--enforce` in package.json composite for CI):** color-concat (339-site baseline; recommends `withAlpha()`), `SELECT *` (empty baseline post W3-A), `request?:` (3 grandfathered cron-dual-invoke baselined → future Z1.7 to split cron from HTTP).

**Plan (primitive-enforcement):** `docs/superpowers/plans/2026-05-28-primitive-enforcement-plan.md`. 7 phases (Z1-Z7), 25 tasks, executed by 17 parallel subagent dispatches across 4 waves.

## ▶ NEXT — deploy decision

The only remaining decision: deploy. `npm run deploy:pages:gated` ACTIVATES the 4 Phase-A1 validators in `lab_settings` (flag-on since 2026-05-26; code ships with this branch). Phase 5 cleanup removed every prod row that would trip a validator → activation should be a no-op for the team. Post-deploy smoke plan (≥330s wait for the 5-min validator-flag cache, then probe each validator in order: `hub_validate_enums` → `completion_tombstone` → `conflict_hash` → `dedup_adoptable`).

Deferred items NOT in this merge: full typed-Request adoption (~200 handlers), generated-contract-test behavior matrix (currently shape-only), Z1.7 cron-vs-HTTP split for the 3 grandfathered `request?:` sites.

## ▶▶ (HISTORY) Hub hardening branch READY for review/merge/deploy

**Branch:** `hub-hardening-2026-05-27` (34 commits since the plan; not yet merged to `main`, not yet deployed). **Hub: 602/602 API tests passing, build green, working tree clean.** **PB main: 3 new commits** (Phase 3 retry/fail-loud + skill-doc corrections + push canonicalization). All Codex critical findings closed across three review passes (`Scratch/audit-2026-05-27/codex/{synthesis,pass2-synthesis,pass3-final/synthesis}.md`).

**What landed (full plan: `docs/superpowers/plans/2026-05-27-hub-hardening-plan.md`):**
- **Phase 0** local test env repaired to v69 + canonical seed + PI/non-PI fixtures + `TEST_MODE_KEY`.
- **Phase 1a** 4 shared ACL/visibility primitives (`actorSlugFromRequest`, `assertProjectVisible`, `projectRefToCanonical`, `safeTaskRow`).
- **Phase 1b** full ACL + PB-visibility sweep across **~50 endpoints** — READS + WRITES + cross-project FEEDS + meeting sub-routes. Notifications scoped to authed user; task-files attach/list/delete gated; sessions/lane3/inbox-events PI-gated; PB content blocked for non-PI on every project-linked CRUD + every feed. API-key passthrough preserved (PB-sync/hub_ai_listener still work).
- **Phase 2** `notes` privacy leak closed (tasks.ts/meetings.ts `SELECT *` + `/api/mutations` canonical_payload).
- **Phase 3 (PB)** Hub-first writes no longer silently lose updates — soft-failures durably INSERT a retry envelope (drain processes it; dead-letter after 3) + fail-loud caller doctrine. `/process` cannot strike a task off TODAY.md on a False return.
- **Phase 4** Hermes slug→id, upsert enum guard, delete idempotency-before-cascade (projects + tasks routes), single-project conflict→409, regulatory enum drift, `projectRefToCanonical` sweep, `/api/mutations` insert-path project_id resolver.
- **Phase 5** prod-data cleanup: **27 zz-test/fixture projects soft-deleted**, enum drift normalized, **78 orphan tasks reconciled** (69 + 9 drift), schema **v70** (`idx_projects_slug_active` UNIQUE partial index). PB push canonicalize (`hub_payload.py`) closes the orphan-class at the producer.
- **Phase 6** UX — dead controls wired/removed, fake dashboard data fixed (mentee velocity quoted-LIKE, grants relabeled "active", Day Score rename resolves dual-Lab-Health), shared `<QueryState>` distinguishes loading/auth-error/empty.
- **Phase 7** design ethos semantic tokens — `--task-*` CSS vars (light + dark, axe-AA-pinned); JS palette swapped to vars (`withAlpha()` helper); Today + MyTasks no longer dark-locked (light mode works); `section-ink` always-dark preserved; opacity-floor lint (WARN); monospace removed from pb-sector; Hermes Sparkles → HermesMark; sub-24px tap targets bumped.
- **Phase 8** WebSocket invalidation one-liner (was a silent no-op); Manuscripts redundant stage dots removed; Grants milestone panel consolidated to Post-Award.
- **Phase 9** doc drift — REFERENCE routing table, PB skill docs (sync push is a no-op for tasks/projects), hub-schema-sync agent.md DB name + wrapper.
- **Phase 10** coverage gaps — global error sanitization in prod (request_id + log-only details); PB-visibility contract test (15 reads + 18 writes + 8 feeds with body inspection + drift guard); delete-semantics standardized (idempotent 200); rate-limit gap documented (no middleware exists; `RATE_LIMIT_ENABLED` flag recommendation).

## ▶ NEXT SESSION — three decisions

1. **Review the branch.** Diff against `main`: 34 commits, scoped, path-explicit, ingra107-authored, no Claude attribution. Tests + build green.
2. **Merge + deploy decision.** Deploy ACTIVATES the 4 Phase-A1 validators — they were already flag-ON in `lab_settings` (set 2026-05-26) but the validator CODE doesn't ship in the current live deploy `a3ff900` (which predates `fc7c08f9`). Post-deploy plan: wait ≥330s for the 5-min validator-flag cache → smoke-test the 4 in order (`hub_validate_enums` → `completion_tombstone` → `conflict_hash` → `dedup_adoptable`) by writing a deliberately-invalid task per validator + verifying rejection. Phase 5 cleanup already removed every prod row that would trip a validator, so activation should be a no-op for the team.
3. **Schema v70** doc bumps landed in CLAUDE.md/REFERENCE.md/PROJECT.md.

**Artifacts:** audit bundle at `Scratch/audit-2026-05-27/` (FINAL-PLAN.md, COLLATED-PLAN.md, GROUND-TRUTH.md, findings/01-10, codex/{synthesis, pass2-synthesis, pass3-final/synthesis}). Phase 5 drift log at `~/Peripheral-Brain/Scratch/phase5-cleanup/_drift_cleanup_2026-05-28.json`.

> ⚠️ **SUPERSEDED — do NOT action.** Everything below referencing "Phase β", the `lww_zone_shadow.jsonl` review gate, "P1 SYNC-FIDELITY", and the "DEDICATED COORDINATED SESSION" is done or moot. Phase β shipped as a forward primitive 2026-05-25 (Tasks 8/9 descoped); the shadow-log window is moot post-enforce. Kept below as history only.

## ▶▶ (HISTORY) NEXT SESSION — Phase β of Increment 1A (COORDINATED, both machines)

**The full reviews-before-code → brainstorm → writing-plans → executing-plans pipeline RAN this session. Increment 1A Phase α is SHIPPED + DEPLOYED + LIVE. Phase β (the live-data cross-machine migration) was DEFERRED by Nick to a dedicated coordinated session — that is your next action. Do NOT re-run the review/design/plan work; it's done + committed.**

**DONE this session (2026-05-23):**
- **6-review wave** (3 Opus specialist + 2 Codex plan-audits) on the 3 interrelated plans → reconciled into ONE Nick-approved design: `docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md`. Reviews persisted in `Scratch/reviews-2026-05-23/`. Key verified finding: wrong LWW overwrites are **UNRECOVERABLE in place** (`audit_log`=hash only `query.py:314`; CRDT=hash+latest-only `crdt.py:247-255`) → a snapshot is mandatory for β. `completed_at` resolved to UTC-store/display-local (not a CT exception); server-side display = rendering-machine OS zone.
- **Increment 1A plan** (`docs/superpowers/plans/2026-05-23-increment-1A-time-sync-foundation.md`, `d2de8ee2` → Codex-blocked → amended `217989c3` → spot-checked). Split into Phase α (done) + Phase β (next). **Plan 1B** (the ~91-site Hub display-migration to viewer-local) is still UNWRITTEN — write it after β, since it consumes `time.ts`.
- **Phase α SHIPPED + LIVE** (deploy `17d7cdd1`, `/api/health` ok, smoke-clean): Task 1 PB `timez.py`+`now_instant` (`569a604a`); Task 2 Hub `time.ts` (`be2eb1d4`); Task 3 lint R20-R23 WARN both repos (`43b9eb68`+`40058df6`); **Task 4 — KILLED the live LMM churn bug** via UTC-normalized atomic compare in `advanceProjectMovement` (`d9398a83`+`68b8d861`); Task 10 hazards — `operations.py:920` Bug-2 fix + backfill `--allow-post-utc-cutover` quarantine + zone-contract registry (`c00db519`). Deploy also batched the **`tasks.notes` redaction** (`66e5c9d0`) → LIVE.

**▶ NEXT: Phase β = Increment 1A Tasks 5-9 — DEDICATED COORDINATED SESSION.** snapshot both repos → fail-closed LWW enforce flip (3 pull-gates `hub.py:1278/1861/2002`) → `client_ts` cutover (cross-repo lockstep, Hub handoff spec first) → ONE stopped-world legacy UTC migration (`088_normalize_timestamps_utc.py`, frozen-CT converter) → delete `to_utc_dt` zone-guessing scaffold + lint WARN→ERROR. **HARD PRECONDITIONS — do NOT start β without ALL:**
   1. **Home laptop quiescent** (or Syncthing paused) the whole β window — β rewrites the Syncthing-synced `brain.db` AND changes how BOTH machines arbitrate vs the shared Hub D1. Running it while home is live → divergent `brain.db` + Syncthing conflict = the exact silent corruption β prevents.
   2. ✅ **DONE 2026-05-24 — `tests/sync` triaged + cleaned.** Were 18 deterministic failures (+1 flaky), ALL stale-test debt asserting deliberately-deleted behavior (JSON dual-write `e29c30fd`, symmetry checker `9528f79c`, pre-mig-073 key_link, pre-`abeebc51` enum casing) — **zero real regressions**, none timezone/LWW. Retired/updated in PB commit `4427a808`; suite now **328 passed / 0 failures**. ⚠️ **Carry into the watch window (#4):** the pull-symmetry auto-guard (`.githooks/check_pull_symmetry.py`) was deleted `9528f79c` and β edits exactly those 3 gates (`hub.py:1278/1861/2002`) → do MANUAL symmetric-gate verification; no automation catches an asymmetric change now.
   3. **Snapshot FIRST** (rollback artifact; overwrites are unrecoverable). Plan Task 5 has the exact commands. Valid ~hours → snapshot→flip→watch→restore-or-discard.
   4. Run **fail-closed** + the plan's 2-hour watch window (exact diff queries, count=0, restore trigger). `_ISO_T_SHIFT_ELIGIBLE_IDS` (Task 8) ships EMPTY (fail-closed) → hand-audit + populate from real naive-ISO-T candidates, rehearse on a copied brain.db, before applying.

> **Increment 2** (Activity-timeline/comments, P2) stays specced + amended (`docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md` + the opus/codex timeline reviews) but UNPLANNED-for-build. It MUST follow β's `client_ts` cutover (shared files). Extend `activity_log` (visibility-gate the public endpoints); remove ALL notes→description paths incl. the create-path leaks (`query.py:736/900`); add a Hub Activity write transport.
> **Going-forward rule** (global CLAUDE.md): any architectural/substrate change gets reviews-before-code → brainstorm → writing-plans → executing-plans. Phase β execution is already grounded by all four — it just needs the coordinated window.

---

## Current State

| Item | Value |
|------|-------|
| HEAD | Hub `fc4069bf` on main, pushed (2026-06-04 — session-close docs/simplify atop short_title fix `4d17036f`; preceded by B-8/DH-6/DH-3/DH-4 `12036dc5`…`b5f38d10` on 06-04, F1+P2-drop-slug `33293abe`/`aa85c71b` on 06-02). Live deploy is on `4d17036f` — the close commits are behavior-identical. |
| Deploy | `59b02aa8.mn-ccore-lab.pages.dev` (2026-06-04) — Production/main, LIVE on `4d17036f`. Verify: `wrangler pages deployment list --project-name mn-ccore-lab`. |
| Build | GREEN (0 TS errors, `npm run build` 2026-06-04) |
| API tests | Hub API suite green as of the 2026-05-28 hub-hardening merge (**691/691**); not re-run this session (frontend-only change). PB `tests/sync/`: 328 passed / 2 skip / 0 failures (2026-05-24). |
| Schema | **v70** prod D1 (`idx_projects_slug_active` partial UNIQUE, Phase 5 2026-05-28). brain.db migration high-water **093**. |
| API auth | GET endpoints locked down (unchanged from 2026-05-15) |
| Team adoption | Not yet broadly directed. |

## Latest — 2026-05-22 evening: Pre-adoption SECURITY tier (T0) shipped — orchestrated 3-agent batch

Full pipeline executed: plan (`docs/superpowers/plans/2026-05-22-hub-pre-adoption-batch.md`) → codex plan-audit (gpt-5.5, **BLOCK→ship-after-amend**, 217K tokens, every finding verified) → amendments folded in → **3 parallel Opus agents** (BACKEND `api/`, FRONTEND `src/`, SYNC PB — disjoint file domains, edits-only, orchestrator committed) → build/test/commit/deploy/smoke.

**Shipped (`0a612459`/`45911e6d`/`7c222e65`; deploy `b9e31ca8`; PB `148138e3`):** SEC-T0-1..9 (auth-aware public-GET projections incl. NEW `/api/meetings` + `/api/team/pulse`; search PB-visibility; digest authz; tasks.notes redaction on BOTH endpoints; shared protected-field null-reject across 3 write paths; ~11-site actor-identity policy; cascade gaps; **NEW codex-found attachment visibility gate**; JWT fail-closed + X-API-Key) · CT-2 server+frontend (`ctToday`/`localDateKey`) · FAKE-2 `<HermesPending>` · CON-2 (emailSlug LUT 3→21, res.ok guard, TaskRow types) · DH-1 seed template · PB sync NULL-clear symmetry. **api tests 199/199**, build GREEN.

**Codex caught (all fixed before dispatch):** B1 missed `/api/tasks/:id` + mutation inserts; B3/B4 needed handler signature changes (no auth param) + `photo_url` not `photo`; B5 missed the single-task `SELECT t.*`; the SECURITY-vs-CORRECTNESS commit split was fiction (collide in projects.ts/index.ts → one BACKEND commit); `pb-sector.ts:142` is NOT a today anchor (don't touch); 6 NEW holes (meetings, team/pulse, 4 actor sites, attachment visibility).

**Follow-ups (not blockers):** ~13 more frontend UTC-today sites outside AM-7 (CalendarPage extras, CommandPalette, Dashboard, ProjectDetail, etc. — date *display*); dead `isPublicGet` regex for non-existent `GET /api/team/:slug`; the "/api/team/:slug leak" the backend agent flagged was a **false positive** (no GET handler exists — only POST update). DH-1 needs real grant data to apply the seed.

## Latest — 2026-05-22 PM: T1 correctness batch (the WORKPLAN directive, DONE)

Executed the full "▶ NEXT SESSION" directive (fixes first → fresh Codex audit as the gate).

**`5f5f597d` — T1 batch:** CT date helper (`api/lib/ct-date.ts` `ctToday(offsetDays)`) replacing 10 UTC "today" anchors + paired window-bounds across tasks/meetings/pb-sector/proactive-brief/projects/digest-email (rolled to tomorrow after ~6pm CT). STATE-2 (ProfilePage `['team-raw']` → real useQuery so save-invalidate refetches). STATE-1 (TodayPage done-from-cache: reconciliation effect prunes optimistic flag on cache-confirm + markDone onError rollback + isToday() instead of UTC slice). Enum-drift audit + DAT-4 realtimeBus: verified clean, no change.

**`909c6e8b` — Codex-gate fixes:** `/codex-cli` audit (synthesis `Scratch/codex-t1-verify-2026-05-22/`) returned Block with 2 critical + 5 minor, all verified + fixed: pb-sector meetings query used SQLite `date('now')` UTC vs CT `today` (dropped today's meeting after 6pm CT); digest date LABELS used `toLocaleDateString` w/o timeZone; reverted over-migrated `fourteenDaysAgo` to UTC; `ctToday` hardened with formatToParts; TodayPage `localDoneIds` dedup; ProfilePage query auth-gated.

**`cf85cfa0` — docs:** corrected CLAUDE.md deploy rows (manual-only; token from secrets.ps1; push≠deploy; pages.dev=prod vs unused workers.dev).

**Also:** deployed `af3189f0` (verified live on 909c6e8); test D1 reconciled to prod (hub-schema-sync — was missing 27 tables + cols, now 76 exact match); librarian corrected 3 stale brain.db agent_knowledge entries that falsely claimed "Pages auto-deploys on push via GitHub Actions."

**`8cb953df` + `8ebb490e` — 5-pass Codex "simplify + improve" review** (WORKPLAN-blind, exclusion-chained, ~8 findings spot-checked accurate): graduated into `WORKPLAN.md` "Codex 5-pass review" section + `docs/reviews/2026-05-22-codex-simplify/`. **Top output = a pre-adoption SECURITY tier (T0)** — all NET-NEW, none active yet (team adoption not started): over-exposed public GETs (PB titles + emails), search ignoring PB-category visibility, `/api/mutations` nulling protected fields, 9 identity-canonicalization bypasses, cascade gaps. The "fail-open JWT" was verified a NON-issue (CF_ACCESS_TEAM_DOMAIN/AUD set in prod). Also: ~12 more CT/UTC sites the api-only sweep missed (PB Sector/regulatory/submissions/conferences/frontend Calendar).

### ⚠️ Deploy + auth — learned this session (see CLAUDE.md Quick Reference)
Deploy is **MANUAL ONLY** — `npm run deploy:pages:gated`; pushing to origin/main does NOT deploy. Auth via **`CLOUDFLARE_API_TOKEN`** (PB `scripts/scheduled/secrets.ps1`), NOT interactive `wrangler login`. Verify live commit: `wrangler pages deployment list --project-name mn-ccore-lab`.

## What shipped earlier 2026-05-22 (AM) — verify-first batch

Nick: "do Batch 1 + Batch 2 + schema migrations, but verify each is still needed first." Verification killed 4 of 9 backend items as already-fixed and deferred 3 of 5 schema items as dead columns. Net 8 real changes shipped + deployed.

**`3bd5d419` — 5 backend correctness fixes (Batch 1+2):**
- SEC-4 timezone DST (`pb-sector.ts` + `digest-email.ts` → `Intl.DateTimeFormat('America/Chicago', h23')`)
- SEC-6 project FK resolver on pb-sector capture
- DAT-3 `/api/tasks/batch` returns `{ok,count,applied,failed}` (additive)
- DAT-6 meeting-notes 404 on missing meeting
- DAT-8 regulatory renew wrapped in `env.DB.batch()`

**`9eb9b192` + `5483d30b` — D7 (`projects.stage_entered_at`, fixes FAKE-5):** schema-v68 (Hub-only) + frontend surface + `daysInStage` fix. The write engine (co-flip in `applyPatch`, fires on any stage transition) lives in `8990acb7` — see heads-up below.

**`1c40fa2a` — D22 (typed activity_log events):** stage_change, pi_change, project_rename, assignee_change, role_assignment. No schema needed (table existed).

**Verified ALREADY-FIXED / deferred (no work):** DAT-1 (PK_COLUMN map), DAT-2 (ALLOWED_TABLES), DAT-5 (404/400 guards). D8/D9/D28 deferred — dead columns until their features are built. `meeting_cancel` N/A — no cancel handler.

**Then: Codex audit + audit-fix batch.** Ran a `/codex-cli` state audit (synthesis: `Scratch/codex-state-audit-2026-05-22/synthesis.md`). It caught real misses, all verified + fixed in **`6a69cfb2`** (deploy `4681a29c`):
- **advanceProjectMovement** matched `WHERE id=?` only, but tasks store project *slug* → silently never advanced `last_meaningful_movement` (regression in `8990acb7`). Now `id=? OR slug=?`.
- **D7 new-project hole** — `handleCreateProject` didn't set `stage_entered_at` → new projects NULL → bug recurred. Now set on insert.
- **SEC-5 was wrongly dismissed** — random UUID per submit meant double-click made duplicate inbox rows. Now a stable per-draft id reused across retries (server `ON CONFLICT(id)` dedups).
- **Manuscripts status enum** — UI sent `pending`/`completed` the server rejects → silent revert. Aligned to `active/waiting_external/blocked/done` (both dropdowns).
- **D22 batch-assign** now emits `assignee_change` (was single-task only).

## ⚠️ Heads-up for next session

1. **A background `builder` agent committed AND pushed to this repo concurrently** (`8990acb7` advanceProjectMovement, 09:49). Its commit wasn't path-explicit, so it **swept this session's D7 `applyPatch` co-flip into it** — that's why the stage_entered_at write engine is in a commit labeled "advance project movement." Code is correct, `ingra107`-authored, no Claude attribution. But: if a builder agent is running, coordinate / expect concurrent commits. (The slug/id bug `8990acb7` introduced in advanceProjectMovement was caught by the Codex audit + fixed in `6a69cfb2`.) Still-open follow-up from that commit: `stale_active_since` NULL doesn't pull back to brain.db (hub.py `_w1col` truthy gate skips NULL) — companion fix needed for full symmetry.
2. **Test D1 (`mnccore-lab-test`) is drifted** — missing schema-v55 columns (`last_meaningful_movement` et al.). Surfaced when v68's original backfill referenced one. Pre-existing; worth a janitor/schema-sync pass to bring test D1 current with prod.

## Prior session — 2026-05-15 (13 commits)

Security (digest XSS/escapeHtml, GET API auth lockdown, admin endpoints deleted, PB POST PI-gating, upload R2 integrity), data/naming fixes (ProjectDetail archive, Manuscripts categories → 3-bucket, digest enums, search comment join, v66 `hub_decisions` rename), UX (folder-link drive letters, mnccore-handler, transcript honesty), and the CLAUDE.md diet + WORKPLAN creation. Full detail in `CHANGELOG.md` + git history. **NOT fixed (intentional):** project delete cascade swallow-and-continue (documented design decision, `projects.cascade.test.ts` B-CRIT-05).

---

## Next Session Playbook

> ⚠️ **SUPERSEDED 2026-05-27.** The P1 SYNC-FIDELITY / shadow-log / notes↔description-protocol items below are DONE or superseded by the Hub-first simplification + the M5 plan. See the CURRENT banner at the top + `Scratch/audit-2026-05-27/GROUND-TRUTH.md`. Kept as history.

**▶ P1 SYNC-FIDELITY is the active priority (mission north-star #1).** State: Track A safe wins SHIPPED (frozen-row trust-tax gone), P0/P1 root-cause front-end SHIPPED (PB `61c53d78`, 51 tests) with a **provenance shadow-log running on the 3 pull-gates — 48h window started ~2026-05-23 03:00 UTC**. **⏰ NEXT ACTION (~2026-05-25, after the window): review `~/Peripheral-Brain/data/logs/lww_zone_shadow.jsonl`** — if 0 "new-decision-wrong" rows, proceed with the gated tasks (flip pull-gates to origin-aware; Task 5 LMM writer→UTC; Task 6 `client_ts` explicit-Z + Hub `advanceProjectMovement` cutover, CROSS-REPO with hub-backend; Task 7 43-row migration). Plan: `~/Peripheral-Brain/Context/Decisions/2026-05-22-sync-lww-timezone-unification-v2.md`. **▶ NEW DESIGN DECIDED (P2) — Activity Timeline + Comments.** The `notes`↔`description` question is RESOLVED → **Model A** (consolidate the 4 overlapping text fields → clean **Description** + unified **Activity timeline** with a one-line `MentionInput` comment composer + `@`→`NotificationBell`; **`notes` becomes brain.db-local-only**). Spec (detailed, with exhaustive read/write map + migration questions): **`docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md`**. Core problem it fixes: Hub `description` is wrongly an *append-target* for brain.db notes. **Next-session protocol (Nick's explicit instruction):** (1) review whole WORKPLAN + this spec; (2) `/codex-cli` review of JUST this part; (3) Codex must output explicit step-by-step instructions to **(a) alter the plan** and **(b) carry out the notes+comments migration**; (4) then implement under P2. Out-of-scope per Nick: comment auto-changing a structured field. Independent quick win: redact the residual `SELECT *` `tasks.notes` leak (`tasks.ts:149/339/466/934` + `proactive-brief.ts:18/25`). Then P2 (Today/MyTasks completeness) → P3 (research SoR) → P4 (Co-Scientist) per WORKPLAN north-star.

---

**The TIER-0 SECURITY batch is DONE + DEPLOYED** (2026-05-22 evening, `b9e31ca8`) — SEC-T0-1..9 + attachment visibility + CT-2 + FAKE-2 + CON-2 + PB sync symmetry all shipped & smoke-verified (see "Latest — 2026-05-22 evening" above). The pre-adoption security gate is closed; **team adoption is now unblocked** (Manual Item #3). Remaining work, pick a tier from `WORKPLAN.md`:

- **CT-3** ✅ DONE 2026-05-22 evening (`a8bd7a9e`, deploy `cd30f61e`) — 12 frontend UTC-today sites → `localDateKey()` (CommandPalette, Dashboard, Layout, useOnboarding, UpcomingCard, NotificationBell, ProjectDetail, GrantsPage, ActivityPage, UpcomingMeetingBanner, TaskTimelineView, TaskGridView). The timezone-correctness sweep (CT-2 + CT-3) is now complete.
- **`isPublicGet` regex for `GET /api/team/:slug`:** assessed — LEFT IN PLACE (no GET handler exists, but the branch likely forward-provisions a public marketing profile endpoint; per justify-it, not removed as "dead").
- **DH-1:** apply `scripts/seed-grant-milestones.sql` once real grant IDs/dates are supplied.
- Otherwise pick a tier from `WORKPLAN.md`:

- **T1 leftovers:** FAKE-1 (Lab Overview `totalCitations` hardcoded — show `—` until PB scholarly cron), FAKE-2 (Hermes "Thinking…" → `<HermesPending>`), DH-1 (grant_milestones seed data), DH-2 (verify/drop Pulse PWA manifest).
- **CT-2 (from Codex review):** ~12 more UTC "today" sites the api-only sweep missed (server: projects/index/pb-sector/regulatory/submissions/conferences; frontend Calendar/PBSector → a `localDateKey()` helper).
- **Open follow-up from the morning batch:** `stale_active_since` NULL doesn't pull back to brain.db (`hub.py` `_w1col` truthy gate skips NULL) — companion fix for full symmetry.
- **T2 polish** (during adoption): see WORKPLAN T2 (brand primitives, token discipline, keyboard nav, search source isolation, mobile breakpoint split-brain).

### Schema Queue

| ID | What | Status |
|----|------|--------|
| D7 | `projects.stage_entered_at` | ✅ DONE 2026-05-22 (schema-v68, Hub-only) |
| D22 | `activity_log` typed emits | ✅ DONE 2026-05-22 (no schema; 5 typed events) |
| D8 | `lab_questions.tags` | DEFERRED — build with AskTheLab tag-filter feature |
| D9 | `commitments.to_slug` | DEFERRED — build with MyItems commitment tracker |
| D28 | `meetings.start_time/end_time` | DEFERRED — build with time-aware Calendar |

### Manual Items (Nick-owned)

1. **Register mnccore:// on home machine** — `regedit /s "C:\Users\ingra\mn-ccore-lab\scripts\setup-mnccore-protocol.reg"` (note: home user is `ingra`, work is `ingra107` — check the .reg path matches)
2. **CF Access cleanup** — remove preset Google IdP from CF Access app (Generic OIDC `Google UMN` is canonical)
3. **Team adoption push** — security fixes are deployed. Tell the team when ready.
4. **Kill AskHermes coach ref** — remove mention from CLAUDE.md if still there (per decision 5)

---

## Key Files

| File | Purpose |
|------|---------|
| `WORKPLAN.md` | Single source of truth for remaining work (open items first; done in a compact ledger) |
| `Scratch/codex-state-audit-2026-05-22/synthesis.md` | Latest Codex audit (2026-05-22; all findings verified) |
| `CLAUDE.md` | Operational guide (~8K tokens) |
| `docs/design-system.md` | Extracted design reference (palette, spacing, animations) |
| `docs/archived/CLAUDE.md-history-2026-05-15.md` | Archived CLAUDE.md content |

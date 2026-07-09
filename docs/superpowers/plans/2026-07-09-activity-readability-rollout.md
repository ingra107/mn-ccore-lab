# Activity-Feed Readability — Class-Level Rollout Plan

> **For the executing session (post-compact):** this is a phased, review-gated sweep.
> Ship **Wave 1**, let Nick eyeball it, then decide on Waves 2–3. Same loop we used
> for the activity feed itself. Deploy per wave (`npm run deploy:pages:gated`),
> commit path-explicit (author ingra107, no Claude attribution).

**Origin:** the #93 activity-feed polish (commits `47bbc418` → `e9cde123`, 2026-07-09)
produced three reusable primitives. This plan propagates them to the ~10 genuine
card-on-page surfaces + the high-frequency tooltips that the 2026-07-09 audit found
(read-only hub-frontend audit; scope: ~10 real card fixes out of 55 `--cream`
matches, tooltips converge on the shared task-row family, badges already done).

**Environment caveat:** the git-bash `fork()` MDE-storm is intermittent (see
`repo-environment-gotchas` memory). Retry crashed shell calls; use background
launches or chain `tsc && build` in one command to minimize forks. Read/Grep/Edit
tools never crash — do all code work through them.

---

## The three primitives (recipes)

### Recipe A — Card lift (figure/ground)
**Problem:** in dark mode `--cream` == the page body bg (`oklch(0.12 0 0)`,
`src/index.css:229` / body `:664`), so a card with `background: var(--cream)` is
invisible against the page. (`--ice` dark = `oklch(0.14 0 0)` is only ~2% lighter —
same problem, milder.)

**Fix:** lift the card a step above the page + add a hairline edge. Reference impl:
`src/components/activity/activityRender.tsx` `cardStyle` (the non-Hermes branch).
```
// before
background: 'var(--cream)',
// after
background: 'var(--surface-2)',
boxShadow: '0 0 0 1px color-mix(in srgb, var(--slate) 15%, transparent)',  // theme-neutral hairline
```
Keep any existing `borderLeft` accent bar. `--slate` flips per theme (dark = light
grey, light = dark), so the hairline reads in both. Don't over-border (Nick's ethos
= "less boxy"); the subtle lift + hairline is the whole effect.

### Recipe B — `.tip` styled tooltip (replaces native `title=`)
**Problem:** native `title=` renders a bland white OS box.
**Fix:** the `.tip` CSS primitive is already defined in `src/index.css` (search
`.tip[data-tip]`). On any element with a `title`:
```
// before
title={label}
// after
className={`tip ${existingClassName ?? ''}`}   // APPEND tip to any existing className
data-tip={label}
aria-label={label}                              // a11y — keep the accessible name
// (remove the native title= to avoid a double tooltip)
```
Reference impl: `EntryTime` in `activityRender.tsx` (className `tip`, data-tip, aria-label, no title).

### Recipe C — reuse `EntryTime` for relative-time tooltips
Where a `title=` is a relative-time-with-exact-hover ("3 days ago" + full date on
hover), don't hand-roll `.tip` — reuse `<EntryTime ts={iso} />` (exported from
`src/components/activity/activityRender.tsx`). It already gives the relative display
(no "ago"), the `.tip` hover with full local datetime, and matches the feed exactly.

### NOT a primitive — badges
The audit found NO further whisper candidates. The app's other filled pills
(priority/status/stage/sentiment) are the PRIMARY signal per design Rules 41/42 —
**do not whisper them.** Only the old `UpdateBadge` qualified (already done).

---

## ⚠️ Execution learning (found while shipping Wave 1) — READ BEFORE Waves 2/3

**`.tip` self-clips inside ANY `overflow: hidden` ancestor** (it's an absolutely-
positioned `::after`). Native `title=` is the OS tooltip — it escapes all clipping.
So the rule for Recipe B is: **only convert a `title=` to `.tip` when neither the
element NOR any ancestor up to the scroll container has `overflow: hidden/auto`.**
- If the element itself clips for an ellipsis (e.g. a truncating title/link) →
  move `.tip` to a NON-clipping WRAPPER (see ProjectTag fix in TaskRow.tsx).
- If it sits in an intentionally-clipped **power-grid / table cell** (ellipsis
  columns) → **LEAVE the native `title=`** — that's the correct choice there.
This killed Wave-1 item 2 (ListView) and item 3 (today/TaskRow workflow chips):
their tooltips live in clipped cells. **Directly affects Wave 2 items 11
(Projects.tsx rows) + 12 (ProjectDetail) + 13 (Sidebar collapsed) — grep each
tooltip's ancestor chain for overflow before converting.**

## Wave 1 — ✅ SHIPPED 2026-07-09 (commit 769baa86, live)

Done: Recipe A card lift on PersonalPage (My Tasks panel + CompactCard ×4) +
PendingMeetingsCard (fill swap only — they already have borders, so no hairline).
Recipe B `.tip` on the **shared TaskRow.tsx (all 10 tooltips** — expanded past the
listed 7 to include DoneBox/PlannedChip/DragHandle/planBtn so the row has ZERO
bland tooltips; ProjectTag wrapped to avoid self-clip) and **TaskCard.tsx (all 5**
— Status/Complete/Priority/View-details/Re-accept). **Skipped** item 2 (ListView)
+ item 3 (today/TaskRow) per the clipping learning above. Baseline line-numbers
for TaskCard's static Tailwind rgba classes bumped (they shifted +2 lines).

## Wave 1 — original targets (for reference)

1. **`src/components/tasks/TaskRow.tsx`** — Recipe B on its 7 tooltips:
   `:68` (done toggle), `:98` (`Due ${dueDay}`), `:114` (`Jump to ${project.name}`),
   `:327` (title/open-editor), `:431` + `:447` (truncated-title spans),
   `:454` (`Moved manually (${group_override})`). This is the shared row (Rule 68) →
   cascades to Today + My Hub + My Tasks Columns/Lanes.
2. **`src/pages/MyTasks/views/ListView.tsx`** (the protected power-grid fork, Rule 68) —
   `:1199` truncated title → Recipe B; `:1231` (`Last updated N days ago`) and
   `:1419` (`In progress for N days`) → **Recipe C (reuse EntryTime)**; `:1103-1111`
   status/blocker hover chip → Recipe B.
3. **`src/components/today/TaskRow.tsx`** — Recipe B on `:288` (group dot), `:295`
   (truncated title), `:308` (moved-manually). Third fork of the row — don't miss it.
4. **`src/components/tasks/TaskCard.tsx`** — Recipe B on `:102` (`Status:`), `:122`
   (truncated title), `:224` (complete/reopen), `:245` (`Priority:`).
5. **`src/pages/portal/PersonalPage.tsx`** — Recipe A:
   - `CompactCard` wrapper `:394-402` (`background: 'var(--cream)'`) — one edit fixes
     4 My Hub sections (`:434` Upcoming, `:473` Recent Activity, `:530` Quick Stats,
     `:1068` My Launches).
   - "My Tasks" panel wrapper `:244-254` — same lift.
6. **`src/components/tasks/PendingMeetingsCard.tsx`** — Recipe A on `:46-58`
   (card inside `.mt-band` on My Tasks).

**Verify:** `npx tsc -b --noEmit && npm run build` (chain in one command). No API
change → no `test:api` needed, but running it is cheap insurance. Deploy
`npm run deploy:pages:gated`. Commit path-explicit. Then Nick reviews before Wave 2.

---

## Wave 2 — ✅ SHIPPED 2026-07-09 (commit e467b279, live)

Done: Recipe A card lifts — MenteeMilestones defeated-lift `.card` bug (removed the
inline `background` override; grep-verified sole instance), Manuscripts PipelineCard
+ Projects-kanban ProjectCard, Meetings action-item cards (active + completed),
Onboarding checklist (collapsed + expanded). Recipe B `.tip` — Projects list rows
(6; ellipsis title's tip moved to its non-clipping parent) + ProjectDetail (6:
copy-link/more-actions/stage-dot/stage-label/recent-activity-row/copy-tasks).
**Skipped item 13 (Sidebar)** — `.tip` anchors up-right, wrong for a vertical
collapsed nav (needs a right-side tooltip); native title is correct + non-clipping.
Item 8's nested `.pipeline-column` (`--ice`) left as-is (reads fine after the card lift).

## Wave 2 — original targets (for reference)

7. **`src/pages/portal/MenteeMilestonesPage.tsx:270-284`** — DISTINCT BUG: `className="card"`
   (which HAS a working `.dark .card` gradient-lift at `src/index.css:892-896`) + an
   inline `style={{ background: 'var(--cream)' }}` that RESETS `background-image` and
   thus DEFEATS the lift. Fix: **remove the inline `background` override** (let `.card`
   work) — do NOT just swap to surface-2. **First run a grep** for the same
   `className="card"` + inline-`background:var(--cream)` combo elsewhere (distinct
   bug class) before closing this.
8. **`src/pages/portal/ManuscriptsPage.tsx:894-928`** (`PipelineCard`, `className="project-card"`
   + cream) + **`src/components/ProjectCard.tsx:18-32`** (Projects kanban, same combo;
   `.project-card` only has a `:hover` shadow at `src/index.css:916-919`, no base lift).
   Recipe A on both. Nested `.pipeline-column` uses `--ice` (`src/pages/Projects.tsx:1033`) —
   nudge it only if it still reads flat after the card fix. Both are alt-views
   (default = list), hence P2.
9. **`src/pages/Meetings.tsx`** action-item cards `:941` (active) + `:1027` (completed) —
   `.action-item-card` has NO CSS definition at all (100% inline cream). Recipe A on both.
10. **`src/components/OnboardingChecklist.tsx:107-118`** (collapsed) + `:184-194`
    (expanded) — Recipe A. Single consumer = My Hub.
11. **`src/pages/Projects.tsx`** — Recipe B on 7 row tooltips: `:661,693,716,723,747,775`
    (pin, truncated title, open-task-count, health, stage, last-activity-days).
12. **`src/pages/ProjectDetail.tsx`** — Recipe B on `:727` (copy link), `:1621`
    (move-to-stage), `:1625` (stage label), `:1940` (Copied!); `:1247` (`fullWhen`
    timestamp) → **Recipe C (EntryTime)**.
13. **`src/components/Sidebar.tsx:343` + `:435`** — `title={collapsed ? label : undefined}`
    on nav items → Recipe B. Only active in collapsed mode; confirm how often Nick
    collapses the sidebar before over-prioritizing.

---

## Wave 3 — ✅ SHIPPED 2026-07-09 (code complete; deploy pending storm window)

Done: Recipe A lift on NarrativesPage arc cards + QuickAddForm composer wrapper.
Recipe B `.tip` on the TaskDetailPanel composer cluster (7: mode-toggle, attach,
@mention, emoji, queue-for-Claude, "See all", submit) — **skipped the upload-progress
overlay (1792)**: it sits in a 44×44 `overflow:hidden` thumbnail and would self-clip.
**Item 17 (ActivityStream NOTE_TYPE_CONFIG DRY) SKIPPED — the premise was wrong:**
NOTE_TYPE_CONFIG (note-type PICKER: 4 user types, `borderBg` @0.25) and
UPDATE_TYPE_CONFIG (render config: 5 types incl. `session`, `borderColor` @0.4) have
DIVERGED. Importing one for the other would (a) break pill borders (`config.borderBg`
→ undefined at ActivityStream.tsx:260) and (b) inject a bogus "Session" pill into the
user-facing note picker. Not a safe DRY — left as-is (a real DRY needs a shared base +
per-use extension, more work than the cosmetic value).

## Wave 3 — original targets (for reference)

14. **`src/pages/portal/NarrativesPage.tsx:100`** — Recipe A (low-traffic).
15. **`src/components/QuickAddForm.tsx:67-75`** — Recipe A (small composer wrapper).
16. **`src/components/tasks/TaskDetailPanel.tsx`** — Recipe B on `:1693` (compose toggle),
    `:1790` (upload progress), `:1928` (submit hint).
17. **`src/components/project/ActivityStream.tsx:63-68`** (`NOTE_TYPE_CONFIG`) — NOT a
    whisper (it's a selection-state note-type picker at `:247`, legit fill). It's a
    stale DUPLICATE of `UPDATE_TYPE_CONFIG` (`activityRender.tsx:132-138`; the file its
    comment references was deleted per Rule 70). DRY cleanup: import `UPDATE_TYPE_CONFIG`
    instead of maintaining a copy. Consistency, not a visual bug.

---

## LEAVE ALONE (audit-verified — do NOT "fix" these)

- **Overlays/dropdowns/menus/popovers** using `--cream` + shadow (separate via shadow,
  not lift): PersonalPage role menu `:104-119`, `NotificationBell:147`, `SavedViewsMenu:70`,
  `MentionInput:381`, `ArtifactPage:220`, `TaskGridView:1918/1064/2031`, `DispatchBadge:57`,
  `Digest:442`, `TaskSearchDropdown:53`, `GrantsPage:1136`, `MenteeMilestonesPage:907`,
  `CreateDecisionModal:122/321`, `IdeasPage:1104`.
- **Bottom sheets / modals:** `BottomSheet:122`, `GlobalQuickAddModal:144`,
  `QuickCaptureInbox:182`, `MobileTabBar:148`, `ProjectLiterature:271`.
- **Form inputs/textareas** (Meetings, MeetingDetail, ConferencePrep, RelayCard,
  KeyLinksEditor, AskTheLab, ProjectDocuments, ProjectDependencies, DecisionsPage,
  IdeasPage, MeetingNotesPage, SettingsPage, RoundPrompt) — separate via border by convention.
- **Recharts `contentStyle` chart tooltips:** TrajectoryPage `:138/628`, AnalyticsPage
  `:498/650`, PIAnalytics `:196`, PublicationTimeline `:65` — floating overlay, not a card.
- **`TaskDetailPanel` sticky header `:383`** — looks like the bug but is ALREADY protected
  by `!important` at `src/index.css:2215-2219` (verified). No fix.
- **`TaskGridView` rows `:968` (`.task-grid-row`)** — canonical TABLE row (design Rule 2),
  separated by `border-bottom` (`src/index.css:585-597`), never by fill lift. Correct as-is.
- **Semantic pills (Pattern 3, intentional):** `PRIORITY_CONFIG` (`taskConstants.ts:48-53`),
  `TaskBoardView priorityConfig` (`:31-43`), `SentimentBadge`/`SENTIMENT_CONFIG`, and all
  `--stage-fill-*` / `--gold-on-emphasis` (Rules 41/42), DoneBox, progress bars — primary
  signals, NOT decoration. Do not whisper.

---

## Execution notes
- **Per-wave loop:** implement wave → `tsc && build` → deploy → Nick reviews → next wave.
- **`.tip` gotcha:** APPEND `tip` to any existing className (don't replace it); remove the
  native `title=` (keep `aria-label` for a11y); `.tip` needs `position: relative` which the
  primitive already sets. The tooltip anchors bottom-right — fine for right-aligned metas.
- **Recipe A gotcha:** don't add a full `border` (boxy); the `box-shadow` hairline is the edge.
  In light mode `--surface-2` is a light grey — glance at light mode too.
- **Verify visually** after Wave 1 (Nick's screenshots) — the whole point is legibility.
- **Scope discipline:** the value is the ~10 real card fixes + the converged task-row
  tooltips. Do NOT expand into the LEAVE-ALONE list.

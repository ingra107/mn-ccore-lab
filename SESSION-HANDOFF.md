# Session Handoff — 2026-04-23 (night)

> Last worked: **Claude Design round-5 ticket execution — 4 batches.**
> 49 tickets received, ~32 shipped across 4 deploys. 3 P0s resolved.
> T-49 mobile swipe-to-dismiss RESTORED after Nick pushback, with
> framer-motion-backed fix for the original Pixel 5 + iOS conflicts.
>
> Deploy: `7077314e.mn-ccore-lab.pages.dev`. HEAD `e20bf70` on main.
> Earlier today: `d76a60a0` (Overview refocus + Slack-parity round).

---

## ⚡ Nick decisions (triaged 2026-04-23 night)

These were vision-level items NOT addressed by the tactical auto-mode queue.
Triage done — outcomes below.

- **DD-#3 status-line pilot** → **DRAFT SPEC FIRST.** Spec lives at
  `docs/specs/dd-3-status-line-pilot.md`. Nick reviews, then next session
  ships Option C (chip row). Builds on already-shipped T-30 greeting shrink.
- **DD-#1, #2, #4, #5, #6, #7** → **REQUEST CD DOC.** Email draft at
  `docs/cd-round-trip/2026-04-23-dd-doc-request.md` asks CD to drop
  `DESIGN-DIRECTION.md` with one paragraph per DD item. Nick to send.
- **Hermes ambient shape** → **SUGGEST SLOT ON LANDING.** Small strip on
  TaskDetailPanel / ProjectDetail landing surfaces 1 proactive Hermes
  suggestion ("3 tasks stale >14d — draft nudges?"). Opt-in, most visible.
  Spec not drafted yet; queue for a later session.
- **T-24 Digest rows view** → **AWAITING DATE.** Supervised session needed
  (1000+ line file). Nick to pick a date.
- **T-29 Manuscripts "Needs attention" grouping** → **CD CLARIFICATION
  REQUESTED.** Email draft at `docs/cd-round-trip/2026-04-23-t-29-clarification.md`
  asks CD to verify against live page + specify UI. Nick to send.

---

# 🤖 NEXT SESSION — AUTO-MODE PLAYBOOK

**Nick's instruction:** go, don't ask. Execute the punch list below in
priority order. Batch 3-5 tickets per commit + deploy. Stop when the
list is exhausted OR a ticket turns out to be a false-alarm that needs
Nick's judgment. If blocked on one, skip + document + continue.

## Environment

- Cwd: `C:\Users\ingra107\mn-ccore-lab`
- Build: `tsc -b && vite build`. Both should be green before any commit.
  Runs in <3s. Ship nothing that fails tsc.
- Deploy: `npx wrangler pages deploy dist --project-name mn-ccore-lab
  --commit-message "<ASCII-ONLY MESSAGE>" --commit-dirty=true`
  ⚠ Wrangler rejects commit messages with non-UTF-8 chars (em-dashes,
  arrows, emoji) with `code: 8000111 Invalid commit message`. Always
  pass `--commit-message "CD r5 batch N"` explicitly, ASCII only.
- Git: conventional commits. Long bodies OK, just not in
  `--commit-message`. Push after each deploy via `git push origin main`.
- Auth: CF Access gates `/portal/*` in prod. Deploys inherit Nick's
  wrangler auth — no action needed from agent.

## Ticket queue (in exact ship order)

Use this as a checklist. Mark DONE inline as you go. When all DONE,
update this file + push + run `/session-close`.

### Batch A' — Slack-parity reactions (ship FIRST, promoted from stretch)

**T-06 Reactions first-class placement**
- Files: look for `ReactionBar` component + its current usages (grep).
  Likely surfaces: `ProjectUpdateFeed`, `ProjectComments`,
  `TaskComments`, `TaskUpdateFeed`.
- Change: Lift the reaction pills to render flush-left under each
  note/comment body (not hover-revealed). Always show existing
  reactions as pills with count. Show a single muted `+` button at
  the right end of the reaction row that opens an emoji picker
  (simple: 6 preset reactions — 👍 🎉 ✅ 🔥 👀 ❤️). When a note has zero
  reactions, `+` still visible at opacity 0.55.
- Rationale for promotion: this is the last Slack-pillar gap. Guardrail
  #9 (clean but useful) says don't sacrifice utility for aesthetics —
  hover-hidden reactions are the inverse.
- Acceptance: screenshots show reactions flush-left, not tucked
  under/on-hover. Clicking `+` on an empty reaction row adds one
  without modal friction.

**Commit + deploy:** `CD r5 batch 5a reactions`

### Batch A — compose + keyboard (pairs well, one deploy)

**T-05 Compose toolbar affordance — visible `@` and `:` buttons**
- Files:
  - `src/pages/ProjectDetail.tsx` (Overview quick-compose, near the
    paperclip button added 2026-04-23)
  - `src/components/tasks/TaskDetailPanel.tsx` (`OverviewQuickAdd`
    function, near the paperclip button)
  - `src/pages/MeetingDetail.tsx` (`AddActionItemForm`, near paperclip)
- Change: Add two sibling buttons next to the existing paperclip — `@`
  (AtSign icon, gold) and `:` (Smile icon, slate). On click, append the
  respective char to the textarea/input value + focus it + move caret
  to end. Tooltip: "Mention teammate (@name)" / "Add emoji reaction".
  Group the 3 buttons visually (paperclip + @ + :) as a single toolbar
  cluster. Match the existing paperclip button styling.
- Success: mobile users who don't know about `@` suffix see the
  affordance on the compose bar.

**T-20 MeetingDetail keyboard — n/j/k/x/Enter on action items**
- File: `src/pages/MeetingDetail.tsx`
- Change: Add a `useEffect` at the top of `MeetingDetail` that
  registers keyboard handlers scoped to the page:
  - `n` → focus `AddActionItemForm` input (store ref in parent or use
    `document.querySelector('[data-testid="meeting-action-add"]')`)
  - `j` / `k` → move a `focusedActionIndex` up/down through the
    rendered action items (skip during text input focus)
  - `x` → toggle done on the focused action via `toggleAction.mutate`
  - `Enter` → open the linked task detail panel for focused action
- Guard: if `document.activeElement` is input/textarea/contenteditable,
  skip the shortcut (don't intercept typing).
- Testid on the add-form input: add `data-testid="meeting-action-add"`.

**Commit + deploy:** `CD r5 batch 5`

### Batch B — polish (5 tickets, one deploy)

**T-07 Sticky overdue count pill on MyTasks scroll**
- File: `src/pages/portal/MyTasks.tsx`
- Change: In the page header row, wrap the overdue count in a
  `position: sticky; top: 0` element (or use a secondary sticky row
  below PageHeader). When user scrolls past the TodayHero band, the
  `⚠ N overdue` pill stays visible. Click scrolls back to TodayHero
  (use `scroll-margin-top` so the pill doesn't cover it).
- Only show when `quickFilter === 'all'` (consistent with TodayHero).

**T-08 TodayHero + main-list Today dedup**
- File: `src/pages/portal/MyTasks.tsx`
- Change: In the `GroupedTaskList` render path, when
  `groupBy === 'due_date'` AND TodayHero is showing (`todayHeroLists.overdue.length > 0 || todayHeroLists.dueToday.length > 0`),
  collapse or hide the "Today" group in the main list so the
  same 3 tasks don't render twice. Alternative: start the main list
  at "This Week" group when TodayHero shows.

**T-09 TodayHero row padding 16→10**
- File: `src/pages/portal/MyTasks.tsx` (and the mirror in
  `src/pages/portal/Personal.tsx` added in batch 3)
- Change: Find the TodayHero row divs (`className="flex items-center
  gap-2 text-xs rounded px-1.5 py-1 cursor-pointer"`). Reduce
  `py-1` → no change (already tight). If rows feel loose, drop row
  `gap-1` to `gap-0.5` in the parent `flex flex-col`. Verify
  visually — this might already be tight enough.

**T-16 Cmd+K "Recent" section from sessionStorage**
- File: `src/components/CommandPalette.tsx`
- Change: Pull last 5 visited `/portal/*` routes from
  `sessionStorage`. On mount, read `mnccore-cmdk-recent` key (JSON
  array). Add a `Recent` section at the top of the palette items array
  (only when query is empty AND array is non-empty). Each item: label
  = route basename, sublabel = full path, action = `navigate(path)`.
- Also: register a history listener in a useEffect that pushes current
  pathname onto the sessionStorage array (dedupe, max 5) on every
  route change.

**T-47 Cmd+K footer "View all → Search"**
- File: `src/components/CommandPalette.tsx` (footer region, search for
  `{tasks.filter(t => !t.completed).length} tasks · {projects.length}
  projects`)
- Change: Extend the count string to include total entity types from
  unified search (tasks + projects + N other). Add a trailing button
  `View all → Search` that closes the palette and navigates to
  `/portal/search?q=<current query>`. Only show when query.length >= 2.

**Commit + deploy:** `CD r5 batch 6`

### Batch C — auth/empty/state polish (one deploy)

**T-23 ActivityPage chip strip (replace InlineSelects)**
- File: `src/pages/portal/ActivityPage.tsx`
- Change: Replace the two `InlineSelect`s in the PageHeader actions
  with a chip strip like SearchPage's (see
  `src/pages/portal/SearchPage.tsx` for the pattern). For type filter:
  chips = `typeOptions` minus the empty-string entry, shift-click for
  multi-select. For person filter: keep as InlineSelect (too many
  members for chips). Multi-selected type filter = OR semantics.

**T-32 Personal onboarding pinned when <80% complete AND <30 days**
- File: `src/pages/portal/Personal.tsx`
- Change: Use `useOnboarding()` to read `progress`, `completedCount`,
  `totalSteps`, and compute `daysSinceJoin` from `startDate`. If
  `progress < 80` AND `daysSinceJoin < 30` AND not dismissed, render
  a compact progress card top-right of the header row: `{completedCount}/{totalSteps} items · {daysSinceJoin}d in`.
  Click scrolls to the existing onboarding section at the bottom.

**T-34 Settings tab unsaved-state dot**
- File: `src/pages/portal/SettingsPage.tsx`
- Change: For each of the 5 tabs, compare current settings to defaults
  (pull defaults from initial load, compare via JSON stringify). If
  any field in a tab diverges from default, render a 6px dot on that
  tab's label. Minor: Profile tab is always "customized" if user has
  filled it, so guard with a shorter comparison (only flag dots when
  the user has deviated from the template/zero-state).

**T-40 Publication detail stub sections**
- File: `src/pages/PublicationDetail.tsx` (or wherever
  `/publications/:slug` renders)
- Change: Below the existing content, add 3 stub sections that only
  render when data exists — otherwise omit cleanly:
  1. `Trial Registration` — if pub has `nct_id` or `trial_registry`
     field, show link. Else skip.
  2. `Related Publications` — other pubs from same project. Filter
     existing publications list by shared `project_slug`.
  3. `Press & Mentions` — placeholder card "No press mentions yet —
     share this page" (non-empty content for recent pubs so the page
     doesn't end on 80% whitespace).

**Commit + deploy:** `CD r5 batch 7`

### Batch F — Slack-parity Files tab + typing (new tickets)

**T-50 Files tab on TaskDetailPanel + MeetingDetail**
- Files:
  - `src/components/tasks/TaskDetailPanel.tsx` — add Files tab between
    Activity + Details in the existing tabstrip
  - `src/pages/MeetingDetail.tsx` — add Files tab in the existing tabstrip
- Change: Reuse the `FileUpload` component with `entity_type='task'` /
  `'meeting'`. Render the attached-files list below the uploader (same
  layout as ProjectDetail Files tab — see `src/pages/ProjectDetail.tsx`
  Files tab section as the reference implementation).
- API: `FileUpload` already supports both entity types — no backend change.
- Rationale: CD Priority 2 explicitly asked "Files tab exists on ProjectDetail
  but not yet on TaskDetailPanel, MeetingDetail." Inline compose-drop (T-04)
  is attach-only; a dedicated tab lets you find files later.
- Success: any task or meeting can have files attached AND browsed in a
  dedicated tab, not just inline-dropped in compose.

**T-51 Typing indicators on comment threads**
- Files:
  - `src/hooks/usePresence.ts` — add `broadcastTyping(isTyping: boolean)`
    returning void; debounce to emit at most every 3s.
  - `src/components/PresenceAvatars.tsx` — add `typingPeers: string[]` prop;
    render "{name} is typing…" below avatar stack when non-empty.
  - Wire into `TaskDetailPanel` + `MeetingDetail` + `ProjectDetail` compose
    + comment inputs. Call `broadcastTyping(true)` on input focus/change,
    `broadcastTyping(false)` on blur/submit.
- Workers: `workers/hub-realtime/` — extend message shape with
  `{type: 'typing', actor, ttl: 5s}`. Peers clear typing state after 5s
  of no ping.
- Rationale: CD Priority 2 explicitly asked "typing indicators on comment
  threads." `usePresence` already broadcasts 15s pings; this is additive.
- Success: threads feel live. Typing indicator appears within 1s of a peer
  typing, clears within 5s of silence.

**Commit + deploy:** `CD r5 batch 9 slack-parity`

### Skip reasons

**Nick-owned (agent cannot do this):**
- Mobile swipe real-device validation — iPhone + Android dogfood. Regression
  from batch 3 T-49 framer-motion restore; needs real-device confirmation
  Pixel 5 inert-drag + iOS Safari edge-swipe-back both behave.
- **DD-#1 through DD-#7** — strategic direction items requiring Nick's
  product call. Surface in the decisions block at top of this file, do not
  auto-execute.

**Scheduled (future session, not auto-mode):**
- **T-24 Research Digest rows view** — Airtable multi-view pillar. 1000+
  line file refactor. Schedule a Nick-supervised session — date set via
  the decisions block triage at top of this file.
- **T-29 Manuscripts "Needs attention" grouping** — CD described UI that
  doesn't exist in current `src/pages/portal/Manuscripts.tsx`. Awaiting
  CD clarification round-trip before re-ticketing.

## Ship rhythm

1. Read the next batch's ticket(s).
2. Implement. Build. TS clean? OK.
3. `git add -A && git commit -m "<body>"` — long bodies OK in commit.
4. `npm run build`.
5. `npx wrangler pages deploy dist --project-name mn-ccore-lab
   --commit-message "CD r5 batch N" --commit-dirty=true`. The
   `--commit-message` flag MUST be ASCII-only.
6. `git push origin main`.
7. Record the new deploy URL + HEAD short-SHA in this handoff + next
   batch.
8. Move to next batch.

## When the queue is exhausted

1. Run `/session-close` (this updates CLAUDE.md, CHANGELOG.md,
   SESSION-HANDOFF.md, MEMORY.md indexes).
2. If time remains, tackle T-06 (reactions) — the only Batch D item
   kept as stretch.
3. Leave a final handoff in SESSION-HANDOFF.md saying "CD round-5
   fully exhausted. Ready for round-6 tickets or DD-#N pilot." Push.

## When you hit a blocker

- Build fails on an edit: revert the edit, log what broke, skip the
  ticket, document in handoff, continue.
- Wrangler 8000111 UTF-8 error: rerun with simpler ASCII
  `--commit-message`. Never try to parse the error — just retry.
- Ticket describes code that doesn't exist (T-29 pattern): grep for
  the described UI. If absent, mark ticket "stale/re-audit", move on.
- New requirement emerges (Nick mid-run): stop auto, wait for Nick.

## Files you'll touch (quick ref)

Compose surfaces:
- `src/pages/ProjectDetail.tsx` — Overview quick-compose
- `src/components/tasks/TaskDetailPanel.tsx` — OverviewQuickAdd fn
- `src/pages/MeetingDetail.tsx` — AddActionItemForm fn

MyTasks / Personal:
- `src/pages/portal/MyTasks.tsx`
- `src/pages/portal/Personal.tsx`

Command palette + search:
- `src/components/CommandPalette.tsx`
- `src/pages/portal/SearchPage.tsx` (reference for chip-strip pattern)

Misc:
- `src/pages/portal/ActivityPage.tsx`
- `src/pages/portal/SettingsPage.tsx`
- `src/pages/PublicationDetail.tsx`
- `src/pages/MyItems.tsx`

Helper components (reuse, don't reimplement):
- `src/components/InlineSelect.tsx`
- `src/components/InlineAssigneePicker.tsx`
- `src/components/FileUpload.tsx` (reference for presigned-R2 flow)
- `src/hooks/usePresence.ts` (entity-agnostic)
- `src/components/PresenceAvatars.tsx`

## Starting-state verification (first thing agent should do)

```bash
cd C:\Users\ingra107\mn-ccore-lab
git status --short        # expect clean or minor uncommitted
git log --oneline -3      # expect e20bf70 at top
npx tsc -b                # expect silent (green)
```

If HEAD ≠ `e20bf70`, something has moved since this handoff — read
last 3 commits to understand before continuing.

---

## What shipped this round (batches `ab8ba90` → `3c6d20a`)

### Batch 3-4 additions (evening, after initial ticket sweep)
- **T-49 REVISITED → shipped.** Nick pushed back on the prior removal.
  Restored swipe-right-to-dismiss on TaskDetailPanel via framer-motion
  drag (MotionValue + RAF — no React setState race on Androids).
  `edgeGuardRef` blocks drag activation within 32px of viewport left so
  iOS Safari edge-swipe-back still works. `touch-action: pan-y` lets
  vertical content scroll. Dismiss at 30% width OR velocity > 500px/s.
- **T-18** ProjectDetail header pills inline-editable — category
  InlineSelect (4 canonical values) + PI InlineAssigneePicker. Status +
  stage were already inline; row now fully Airtable-pattern.
- **T-31** Personal TodayHero 2-col (Overdue | Due Today) above
  regulatory strip. Mirrors MyTasks. Hidden when quiet.
- **T-04 fully extended.** Inline file drop (paperclip + dragover +
  paste-image) now on all 3 compose surfaces:
  - ProjectDetail Overview (entityType='project')
  - TaskDetailPanel OverviewQuickAdd (entityType='task')
  - MeetingDetail AddActionItemForm (entityType='meeting')
  Each upload → presigned R2 PUT → /api/upload/done → appends
  `[filename](url)` into the compose. Drop zone shows dashed teal
  outline while dragOver.
- **T-37** My Items NotificationCard type-coded left-border accent
  (mention=gold / assignment=teal / deadline=maroon / other=slate).
  Card padding dropped 1rem → 0.75rem (~8px row height reduction).
- **T-10** "+N more →" on MyTasks TodayHero now sets filter AND
  smooth-scrolls to main list so the click pays off.

## What shipped earlier this round (batch 1 `ab8ba90` + batch 2 `a034e47`)

### Tier-1 same-day (P0s + structural)
- **T-01 / T-17 / T-33 / T-43** — Raw `<select>` codemod. 36 sites / 22
  files → `InlineSelect` + `InlineAssigneePicker`. Guardrail #4 violation
  eradicated. Includes Ideas kanban card status, Settings Lab Type,
  Activity filters, Deadlines filter, MyTasks group/sort, Meetings
  action-item assignee + project, MenteeMilestones, MeetingNotesPage,
  AskTheLab, DecisionsPage outcome, Grants milestone modal, Manuscripts
  PI + category, ProjectDependencies relation picker, ProjectDocuments
  type, SessionHistory project filter, SubmissionTimeline event type,
  CreateTaskModal priority + project, TaskDetailPanel recurrence,
  TableControls sort, ConferencePrep type, QuickCaptureInbox project,
  RelayCard direction, PBSector. Build green.
- **T-38 Projects stage data** — verified **false alarm**. Live API
  distribution: 33 Idea / 12 Data Collection / 9 Writing / 9 Data
  Analysis / 3 Submitted. Chunk capture #3 landed inside the Idea group
  because default sort is grouped-by-stage, which renders the same stage
  value for every row within a group. Not filed.
- **T-49 Mobile swipe-to-dismiss** — verified **intentional prior removal**
  (commit 428183f, 2026-04-20) after Pixel 5 inert-drag + iOS Safari
  edge-swipe-back conflicts. Replaced with enlarged X + sticky Done pill
  + tap-backdrop. Rationale still in TaskDetailPanel.tsx:93.

### Tier-2 this-week P1s
- **T-02** ProjectDetail "Your progress log" label deleted (was dead copy
  between tabs and textarea).
- **T-03** RecentActivity "Unknown" actor now falls back to event-type
  attribution ("Note · Apr 13", "Comment · Apr 13") instead of literal
  Unknown.
- **T-11** MyTasks `Stale` quickFilter chip — status=in_progress AND
  `updated_at` older than 14 days. Badge count wired.
- **T-12** SearchPage per-type filter chip strip above results. 14 entity
  types with live counts + shift-multi-select. Sticky below search input.
- **T-13 / T-14** `usePresence` extended to TaskDetailPanel header
  (next to Task Detail label) and MeetingDetail header (next to
  WatchButton). Hook was already entity-agnostic; drop-in.
- **T-22** Activity page date headers (Today / Yesterday / Apr 21) now
  sticky on scroll so long feeds stay oriented.
- **T-30** Dashboard greeting shrunk from clamp(1.1rem, 2.5vw, 1.4rem)
  600-weight to 14px / 500-weight. Operational status-line look. Welcome
  banner already auto-stales after 7d via useOnboarding.
- **T-39** NateLab reorder — `Grants & Proposals` lifted to top section
  above Research Projects; Publications dropped to bottom. Parity shape
  with NickLab (funding-led hierarchy) so Nate's page no longer leads
  with an empty publications block.
- **T-41** GlobalQuickAdd panel `max-width: min(560px, calc(100vw - 32px))`
  + `TokenHint` rows `white-space: nowrap` + `flex-shrink: 0` so mobile
  token hints (`@name assignee`, `#project`) never clip at the viewport
  edge.
- **T-42** CommandPalette task rows — sublabel now `project · due date`
  (assignee shown only when ≠ current user). Airtable pattern; replaces
  low-signal `assignee · status`.
- **T-46** Dashboard Customize panel header gets sticky **Done** button
  that closes panel + scrolls to top so user sees their changes.

### Tier-3 polish P2s
- **T-21** Decisions tag-chip filter row now hides when
  `allDecisions.length < 15`. Frees up vertical on lightly-populated
  boards.
- **T-35** AskTheLab empty state re-worded to nudge `@hermes` usage.
- **T-36** MeetingNotesPage "How Meeting Transcripts Work" 4-step
  educational band → collapsible "What is this?" panel. Auto-collapsed
  when `processedCount ≥ 3`. Preference persists via localStorage.
- **T-44** PBSector empty state rewritten: "Connect Peripheral Brain
  to see your daily plan" + "Learn more" CTA linking install docs.
- **T-45** SessionHistory empty state rewritten: "Set up SessionEnd hook
  to see Claude history" + "Open install guide" CTA.
- **T-48** Dashboard light-mode dupe of T-30 — same greeting fix applies.

### Already-shipped (verified against CD screenshots)
- **T-25** Calendar "Today" button — already rendered when
  `currentDate.toDateString() !== new Date().toDateString()`.
- **T-26** Deadlines timeline-hint banner — already auto-dismisses after
  10s + persists via localStorage (`deadlines-timeline-hint-seen`).
- **T-27** Deadlines overdue alert — already compact single-line
  "next-urgent" banner (not 80px-tall red box per claim).
- **T-28** Projects ColumnHeader — already renders `▲/▼` chevron with
  teal color + 0.9 opacity when sort is active.
- **T-15** CommandPalette jump-to — project / meeting / person rows
  already render as separate sections with fuzzy search.
- **T-19** MeetingDetail action-item hint — already hidden when
  `text.trim()` has content (token preview chips take over).

## Still-open tickets (historical list as of batch 4 close-out)

> **Note:** the live queue is the "Ticket queue" section above + the
> "⚡ Nick decisions needed" block at the top. This list is kept for
> history; where a ticket moved, the inline note says so.

### Punch list for next round (P2 polish, ~6 hrs if all done)
- **T-05** Compose toolbar visible buttons — paperclip is now there
  (T-04), but `@` and `:` trigger buttons are still hidden affordances.
- **T-06** Reactions first-class placement. **→ PROMOTED to Batch A'
  (ship first) in live queue above.**
- **T-07** Sticky overdue count pill on MyTasks scroll.
- **T-08** TodayHero vs main-list Today dedup (spike Option A: collapse
  Today group in main list when TodayHero is showing).
- **T-09** TodayHero row padding 16→10px (current is fine; CD wanted
  tighter).
- **T-16** CommandPalette "Recent" section from sessionStorage history.
- **T-20** MeetingDetail keyboard `n/j/k/x/Enter` for action items.
- **T-23** ActivityPage per-type chip strip (InlineSelect already fixes
  guardrail #4 but chips allow multi-select).
- **T-29** Manuscripts "Needs your attention" grouping. **→ Awaiting CD
  clarification round-trip (see Scheduled section + decisions block).**
- **T-32** Personal onboarding checklist pinned-to-top when <80%
  complete.
- **T-34** Settings tabs unsaved-state dot.
- **T-40** Publication detail stub sections (Trial Reg / Related
  / Press).
- **T-47** Cmd+K "View all → Search" footer.

### New tickets added this plan update (vision-alignment)
- **T-50** Files tab on TaskDetailPanel + MeetingDetail. **→ See Batch F
  in live queue.**
- **T-51** Typing indicators on comment threads. **→ See Batch F in
  live queue.**

### Big lift (scheduled supervised session — see decisions block)
- **T-24** Research Digest rows view (`?view=rows`). Significant lift
  — ~1000-line file. Airtable multi-view pillar. **→ Date via Nick
  decisions-block triage.**

### Direction doc (strategic, not ticketed)
- DESIGN-DIRECTION.md items #1-7 are 2-3 sprint commitments. DD-#3
  (status line vs greeting) is closest-to-ship on T-30 foundation.
  **→ Surfaced in "⚡ Nick decisions needed" block at top of this file.
  Action on DD-#1/#2/#4-7: ask CD to drop the DESIGN-DIRECTION.md doc
  so each can be triaged individually.**

## Deploys
- **batch 1**: `ab8ba90` → `45129bde.mn-ccore-lab.pages.dev`
- **batch 2**: `a034e47` → `87beb596.mn-ccore-lab.pages.dev`
- **batch 3**: `674928e` → `abf9bd41.mn-ccore-lab.pages.dev`
- **batch 4**: `3c6d20a` → `7077314e.mn-ccore-lab.pages.dev` (current)

## Quality gate
- Build: `tsc -b && vite build` green all 4 batches.
- No local-miniflare regression tests run this round; prior round
  already validated 5/5 post-sprint.
- Mobile swipe: NOT validated on real device this session — Nick
  should dogfood on iPhone + Android before trusting it. If Pixel 5
  inert-drag returns, framer-motion owning transform should've killed
  it. If iOS Safari still hijacks the right-swipe, bump
  `edgeGuardRef` threshold from 32px higher.

## What-to-do-first next session

0. **Triage** the "⚡ Nick decisions needed" block at top of this file
   (2-5 min). Marks route for DD-#3, Hermes ambient shape, T-24 + T-29.
1. **Nick-owned:** Real-device swipe test on iPhone + Android (T-49
   regression from batch 3).
2. **Auto-mode:** Batch A' reactions first-class (T-06) → then Batch A
   compose+keyboard (T-05/T-20) → then Batch B polish → Batch C → Batch F
   Slack-parity Files+typing (T-50/T-51).
3. **Supervised (scheduled):** T-24 Research Digest rows view — date set
   via Nick decisions-block triage.
4. **CD round-trip:** T-29 Manuscripts "Needs attention" — send
   clarification ask + fresh screenshots to CD.
5. **DD-#3 status-line pilot on Dashboard** — only if Nick approved in
   decisions block. Closest-to-ship of the 7 direction items, builds on
   T-30 greeting shrink.

## Memory snapshot (agent-side, persists across sessions)

- `feedback_nick-design-philosophy.md` — 9 guardrails
- `project_hub-vision-airtable-slack-hybrid.md` — product vision
- `project_session-2026-04-23-late-evening.md` — yesterday's snapshot
  (now superseded but keep for context)
- `reference_claude-design-link-rescan.md` — CD integration note

## Session-end state

- HEAD `a034e47` pushed to origin/main
- Deploy `87beb596.mn-ccore-lab.pages.dev` (prod alias)
- `ab8ba90` (batch 1) + `a034e47` (batch 2) on main
- Claude Design round-5 handoff at
  `C:\Users\ingra107\Downloads\MN-CCORE Lab Hub Design System (3)\design_handoff_round5\`
  covered 49 tickets; ~28 shipped, ~15 deferred with reasoning above.

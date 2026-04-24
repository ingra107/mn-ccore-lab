# Session Handoff — 2026-04-23 (night)

> Last worked: **Claude Design round-5 ticket execution — 4 batches.**
> 49 tickets received, ~32 shipped across 4 deploys. 3 P0s resolved.
> T-49 mobile swipe-to-dismiss RESTORED after Nick pushback, with
> framer-motion-backed fix for the original Pixel 5 + iOS conflicts.
>
> Deploy: `7077314e.mn-ccore-lab.pages.dev`. HEAD `3c6d20a` on main.
> Earlier today: `d76a60a0` (Overview refocus + Slack-parity round).

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

## Still-open tickets (deferred, low-impact-to-defer reasoning)

### Punch list for next round (P2 polish, ~6 hrs if all done)
- **T-05** Compose toolbar visible buttons — paperclip is now there
  (T-04), but `@` and `:` trigger buttons are still hidden affordances.
- **T-06** Reactions first-class placement (flush-left with `+` at row
  end). `ReactionBar` already exists but needs promotion.
- **T-07** Sticky overdue count pill on MyTasks scroll.
- **T-08** TodayHero vs main-list Today dedup (spike Option A: collapse
  Today group in main list when TodayHero is showing).
- **T-09** TodayHero row padding 16→10px (current is fine; CD wanted
  tighter).
- **T-16** CommandPalette "Recent" section from sessionStorage history.
- **T-20** MeetingDetail keyboard `n/j/k/x/Enter` for action items.
- **T-23** ActivityPage per-type chip strip (InlineSelect already fixes
  guardrail #4 but chips allow multi-select).
- **T-29** Manuscripts "Needs your attention" grouping — CD described
  UI that doesn't exist in current Manuscripts.tsx; needs re-audit.
- **T-32** Personal onboarding checklist pinned-to-top when <80%
  complete.
- **T-34** Settings tabs unsaved-state dot.
- **T-40** Publication detail stub sections (Trial Reg / Related
  / Press).
- **T-47** Cmd+K "View all → Search" footer.

### Big lift (skip or standalone session)
- **T-24** Research Digest rows view (`?view=rows`). Significant lift
  — ~1000-line file. Lower ROI than the punch list above.

### Direction doc (strategic, not ticketed)
- DESIGN-DIRECTION.md items #1-7 are 2-3 sprint commitments. DD-#3
  (status line vs greeting) is closest-to-ship on T-30 foundation.

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

1. Real-device swipe test (iOS + Android) — regression from batch 3.
2. Punch list (T-05/06/07/08/16/20/23/32/34/40/47) in priority order.
3. T-24 Research Digest rows view (bigger, standalone).
4. DD-#3 status-line pilot on Dashboard (replace greeting entirely
   with operational status). Closest-to-ship of the 7 direction items.

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

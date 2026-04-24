# Session Handoff — 2026-04-23 (night)

> Last worked: **Claude Design round-5 ticket execution.**
> 49 tickets received, ~28 shipped across 2 deploys. 3 P0s resolved
> (T-01 select sweep 36 sites / T-17 + T-33 rolled up / T-38 verified
> false alarm / T-49 verified intentional prior removal).
>
> Deploy: `87beb596.mn-ccore-lab.pages.dev`. HEAD `a034e47` on main.
> Earlier today: `d76a60a0` (Overview refocus + Slack-parity round).

## What shipped this round (batch 1 `ab8ba90` + batch 2 `a034e47`)

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

### Will ship next round
- **T-04** Inline file drops in compose — needs `FileUpload` as
  paperclip + dropzone + clipboard-paste handler across ProjectDetail
  compose + TaskDetailPanel + MeetingDetail. Real work (~4 pts).
- **T-05** Compose toolbar (@ / : / 📎 buttons). Pairs with T-04.
- **T-06** Reactions first-class placement (flush-left with `+` at row
  end). `ReactionBar` already exists but needs promotion.
- **T-18** Inline-editing on ProjectDetail header pills (category, PI,
  status, stage). `toApiStage()` already handles mapping per Rule 35;
  just wire the pills.
- **T-24** Research Digest rows view alongside cards (`?view=rows`).
  Significant lift — ~1000-line file.
- **T-31** Personal page operational restructure (apply TodayHero shape
  top + 2-col stats below).

### Punch list
- T-07 sticky overdue count pill on MyTasks scroll.
- T-08 TodayHero vs Focus Next dedup (spike Option A).
- T-09 TodayHero row padding 16→10px.
- T-10 "+N more →" already filters; add scroll-to-list.
- T-16 CommandPalette "Recent" section from sessionStorage history.
- T-20 MeetingDetail keyboard `n/j/k/x/Enter` for action items.
- T-23 ActivityPage per-type chip strip (now that `<select>` is gone).
- T-29 Manuscripts "Needs your attention" grouping — CD described UI
  that doesn't exist in current Manuscripts.tsx; need to investigate
  whether this is stale or referring to somewhere else.
- T-32 Personal onboarding checklist pinned-to-top when <80% complete.
- T-34 Settings tabs unsaved-state dot.
- T-37 My Items entity-type left-border accent + icon.
- T-40 Publication detail stub sections (Trial Reg / Related / Press).
- T-47 Cmd+K "View all → Search" footer.

### Direction doc (strategic, not ticketed)
- DESIGN-DIRECTION.md items #1-7 are 2-3 sprint commitments. DD-#3
  (status line vs greeting) is closest-to-ship on T-30 foundation.

## Deploys
- **batch 1**: `ab8ba90` → `45129bde.mn-ccore-lab.pages.dev`
- **batch 2**: `a034e47` → `87beb596.mn-ccore-lab.pages.dev` (current)

## Quality gate
- Build: `tsc -b && vite build` green both batches.
- No local-miniflare regression tests run this round (prior round
  already validated 5/5 post-sprint).

## What-to-do-first next session

1. T-04/T-05/T-06 compose upgrade sprint — inline file drop + toolbar +
   reactions placement. One cohesive change across 3 detail surfaces.
2. T-18 ProjectDetail header inline-edit pills.
3. T-24 Research Digest rows view.
4. T-31 Personal operational restructure.
5. Punch list (T-07 → T-47) as time permits.

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

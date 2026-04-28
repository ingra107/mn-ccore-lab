# MN-CCORE Hub — Multi-Agent Audit Synthesis (2026-04-28)

**Trigger**: 12 parallel page-audit agents dispatched against TodayPage, UnifiedMyTasks, ProjectDetail, ProfilePage, Lab Overview, Manuscripts, MyItems+Personal, Meetings (all 4), SearchPage, AskTheLab, CalendarPage, InsightsPage. Each agent received full design ethos, brand-primitive context, recent phase context, and an audit framework. Reports read end-to-end (≥1500 words each, ~25k words synthesized).

**Volume**: ~364 findings. P0 = 22. P1 = 109. Rest P2/P3.

---

## 20 Cross-Cutting Themes (fix once, fix many)

These are patterns that recur across ≥3 surfaces. Cheaper to fix as a horizontal sprint than per-page.

### T1. Decorative compose surfaces (P0 — recurring 7+ times)
Bare `<input>` / `<textarea>` with placeholder hints + `<kbd>` chips that look interactive but have **no submit handler, no @-mention, no Cmd+Enter**:
- TodayPage:237-244 morning thought input
- TodayPage RightNowCard:67-71 "Chat with Claude" input
- TaskDetailDrawer:114 subtask checkbox `defaultChecked` no `onChange`
- MeetingDetail:1133-1167 `AddActionItemForm` @ button = `appendCh('@')`, emoji = `appendCh(':')`
- MeetingDetail:752-779 notes textarea (plain, no SmartCompose)
- ProjectDetail:957-994 Overview bottom compose @ + emoji buttons
- AskTheLab question modal + answer form (bare textareas)
- SearchPage:188-197 advertises `@`/`#`/`/` syntax that doesn't exist server-side

### T2. SmartCompose adoption is patchy
SmartCompose ships in ProjectDetail Notes tab, TaskDetailPanel, Today's drawer (Phase 38 closure cf285b6). NOT used on:
- TodayPage morning-thought + Right Now chat (T1)
- ProjectDetail Overview bottom compose (T1)
- MeetingDetail action item form + notes (T1)
- AskTheLab compose + answer (T1)
- ProjectUpdateFeed (legacy, predates SmartCompose)
- ProjectComments (Hermes detection works but compose is bespoke)

### T3. Hermes is hugely under-utilized
- HermesMark missing on AskTheLab PageHeader (uses generic `HelpCircle`)
- HermesSuggestsCard on Lab Overview is heuristic JS pretending to be AI ("brand fraud" — comment in source admits it)
- Hermes pending state shows literal string `"Thinking about this... (AI response pending)"` with no animation, no timeout, no failure state
- Hermes responses lag 60-90s because no `realtimeBus.subscribe()` on AskTheLab
- Zero Hermes integration on MeetingDetail (transcript summarize, action item synthesis, agenda generation)
- Manuscripts has no "Ask Hermes about this paper"
- InsightsPage labeled "Insights" but no Hermes anywhere
- AskHermes coach (T-35 in CLAUDE.md) DOES NOT EXIST in code
- `/api/meetings/process-transcript` referenced from MeetingNotesPage:227 — endpoint DOES NOT EXIST. Silent 404 → regex fallback. Ships as broken Potemkin feature.

### T4. Hardcoded fake data on team-facing surfaces (P0 trust-killer)
- `StatsCard.tsx:70` — `totalCitations = 2626` hardcoded literal
- `UpcomingCard.tsx:17-53` — fake R01/K23/CCI-ARDS deadlines via `daysFromNow(12)`
- `GrantTimelineCard.tsx:7-13` — hardcoded grant timeline array; `useGrants()` is fetched and discarded
- `ActivityFeedCard.tsx:81-87` — "CLIF Consortium expanding to 13+ sites" hardcoded marketing copy
- All four ship on the team-facing Lab Overview default card set

### T5. iCal feeds half-integrated (Phase 39 promise broken)
Phase 39 v52 shipped iCal feeds → user_calendar_events. Today timeline merges. But:
- **CalendarPage doesn't show iCal events at all.** `useCalendarEvents` hits `/api/calendar/events` (Hub-only). `useUserCalendarEvents` exists but unused. The page named "Lab Calendar" excludes the user's actual calendar.
- Today timeline lacks live "now" line, proportional time blocks, overlap rendering despite parser shipping full ISO timestamps
- Meeting URL extraction works (`ics-parser.ts:247-269`) but no Join button anywhere
- CalendarFeedsPanel lives on BOTH Profile and Settings → Integrations (the Airtable-funeral negative-space pattern)

### T6. Page identity overlap (Rule 57 violation)
Four "where do I start" surfaces:
- Today (`/portal/dashboard`) — operating day
- Lab Overview (`/portal/overview`) — weekly planning
- Personal (`/portal/personal`) — Phase 26b artifact
- MyItems (`/portal/my-items`) — sidebar avatar destination

Personal duplicates Today (TodayHero), UnifiedMyTasks (MyTasksColumn), Dashboard (QuickStats) — 70% redundant. Lab Overview default cards include 6 personal cards (ProactiveBrief, QuickWins, MyItems, EmailDrafts, Pomodoro, YourWeek) — Rule 57 explicitly forbids "personal cards on Lab Overview." StatusLine chip strip in Lab Overview header duplicates Today metrics.

### T7. Authorization bugs (P0 SECURITY)
- AskTheLab.tsx:366 accept-answer button gates on `userSlug === 'ningraha'` — slug doesn't exist post-Phase-36b. UI dead. Status `open → resolved` impossible via UI.
- `POST /api/answers/:id/accept` (`questions.ts:209`) has **zero authorization check**. Any authed user can resolve any question via curl.

### T8. Cache-subscription violations (Rule 18)
Detail panels must subscribe to `['tasks']` cache via `qc.getQueryCache().subscribe()`. Violations:
- UnifiedMyTasks `TaskDrawer` + `InlineDetail` — both bypass cache subscribe
- ProfilePage `rawRow` — read from `['team-raw']` cache that has NO `queryFn`. `invalidateQueries` is a no-op. Form desyncs after first save.
- TodayPage `state.done` localStorage doesn't reflect status changes from MyTasks/TaskDetailPanel

### T9. Missing undo on destructive actions (Rule 8 — "Optimistic + 5s undo")
- MyItems mark-all-read — no undo (kills 50 unread states irrecoverably)
- ProfilePage saves — 3s "Saved" hint, no undo, no rollback
- KeyLinksEditor delete — single-click, no undo
- File attachment delete — no confirm, no undo
- Calendar feed delete — single-click
- ProjectComments / inline Archive single-row uses different mutation than bulk Archive (mismatch — single-row writes `status:'done', completed:1` while bulk writes `delete` action / `deleted_at`)

### T10. Inline edit gaps (Rule 3 — "every editable field shows ▾")
- UnifiedMyTasks: NO inline edit on any field in any view (status/priority/due/assignee/project all open drawer instead)
- TaskDetailDrawer (Today): no inline edit for due/priority/assignee/title in drawer
- ProjectDetail: title `<h1>` is read-only despite short_name being editable (asymmetric)
- Meetings list: title + date read-only
- ProfilePage fields: bare `<input>` with no `▾` affordance, no focus ring (`outline-none` strips browser default)

### T11. No virtualization on long lists
- TodayPage `TaskGroup` — renders all 200+ tasks per group
- UnifiedMyTasks all 3 views — no `useVirtualizer` despite legacy MyTasks having it
- Manuscripts main table + Pipeline Idea column unbounded
- ProjectDetail Tasks tab — flex column for 600+ tasks possible
- Personal Activity feed
- MyItems notifications — no pagination
- AskTheLab questions list — no pagination
- Calendar week view 50-event conference week breaks

### T12. Brand primitives ignored (Rule 29)
- **CategoryIcon** (lungs/flask/heartbeat/cap): ProjectDetail header, Manuscripts category dots, Today task tags, Search results, Calendar event icons, Lab Overview ProjectHealthRow, MyItems source icons — all use raw spans/lucide icons instead
- **HermesMark**: AskTheLab PageHeader (`HelpCircle`), HermesSuggestsCard (`<span>✨</span>`), MeetingDetail Generate Agenda (lucide `Sparkles`), Hermes Notifications, Hermes Search results — none use the primitive
- **HeartbeatLine/HeartbeatDivider**: only TodayPage header. Should be section dividers on ProfilePage / ProjectDetail / Meetings
- **EmptyStateArt**: downgraded to generic `EmptyState` on InsightsPage, MyItems, MyTasks, CalendarPage

### T13. Token discipline drift
- Hardcoded `#fff` instead of `var(--ink-bright)` (Rule 14): TodayPage 6 sites, ProjectDetail 3 sites, MyItems StatCards, etc.
- Hardcoded hex outside the 5-accent constant set on Today/MyTasks
- Inline `<style>` blocks (TodayPage:207-223; should be CSS module)
- 8+ alpha values across the codebase when 4-tier system documented (0.03/0.06/0.10/0.15)
- borderRadius 3 + 5 not in tokens (Rule "Borders & Spacing")
- Animation durations 120ms/220ms not in token system (5 durations exist: instant/fast/normal/moderate/slow)
- `--gold` text on `--gold-active`/`--gold-emphasis` bg violates Rule 42 (`--gold-on-emphasis` required) — ProjectDetail header agenda button, AskTheLab project pill, ProfilePage role pill
- `--stage-fill-*` tokens missing on Manuscripts stage progress dots (uses `--teal`), PipelineCard, AskTheLab status pills
- Compound opacity violations (Rule 43): MyItems CompletedCard, multiple "dimmed card" patterns

### T14. Saved views / filters underpowered
- SearchPage: type-filter only. No people / date / scope filters.
- UnifiedMyTasks SavedViewsMenu missing rename UI / "default view" / "save changes to current view"; uses light-mode tokens in dark-first page; mentee filter not URL-restored
- InsightsPage: zero filters (no category, no severity, no time horizon)
- AskTheLab: only Open/Resolved; no tags/categories
- Manuscripts PI filter hardcoded to Nick + Nate (silently excludes future PIs)

### T15. realtimeBus / WebSocket wiring inconsistent (Rule 52)
- AskTheLab questions: 60s poll, no WS. Hermes responses lag.
- MyItems notifications: 30s poll, no PartySocket subscription
- InsightsPage: 5min cache, no realtime invalidation on project_update events
- CalendarPage: no polling trigger (visiting page bookmark stays stale 15min)
- AskTheLab: no presence (`usePresence`), no typing indicator on a "I'm asking the lab" surface

### T16. Keyboard nav inconsistent
- TodayPage: zero shortcuts (no J/K, no D for done, no space for promote, no F for focus)
- AskTheLab: no J/K, no Space peek, no Enter to expand
- SearchPage: no `/` to focus from anywhere
- Calendar: arrow keys exist, T-for-today partial
- Manuscripts Pipeline view: no keyboard nav (read-only mosaic)

### T17. ProjectDetail Activity tab is broken
ProjectActivity renders `<ProjectUpdateFeed>` AND `<ProjectComments>` AND ProjectDecisions AND ProjectDependencies AND ActionItems — duplicate feeds with the Notes/Comments tabs, no merged temporal log, no system events ("Nick changed stage to Writing"), no sticky day headers (T-22 was supposed to ship), no audit log capability. The "Activity tab as audit log" promise is unfulfilled.

### T18. Mobile fidelity gaps
- BottomSheet compose pattern (Rule 55) only on ProjectDetail — not on MyItems / AskTheLab / others that need it
- Manuscripts mobile stacked card has NO stage progress dots
- ProjectDetail stage strip overflows at <400px (7 nowrap labels + dots)
- Calendar week view at 360w → 7 columns × 50px → titles illegible (icon-only)
- MyItems / Personal touch targets 32-36px (below Phase 36c 44px floor)
- Profile photo URL is `type="text"` not `type="url"` (mobile keyboard wrong)

### T19. Stale metrics / wrong math
- Manuscripts `daysInStage()` uses `project.updated_at` — ANY field edit resets the stalled counter. Metric lies.
- Lab Overview WeeklyProgress trend skips Wed/Thu (uses days[0..2] vs days[4..6])
- InsightsPage SQL `weekday 1` returns NEXT Monday → labels say "this week" but data is LAST week (especially on Mondays)
- TodayPage `focusMin = plannedIds × 30` — meaningless
- TodayPage Lab Health: linear formula no floor protection. 25 overdue → 0/100 forever.
- Lab Overview `Stats.totalCitations = 2626` hardcoded constant
- Lab Overview YourWeek "Meetings this week" is actually "Meetings in next 7 days"

### T20. Audit-log / system-event gaps
No `activity_log` capture for: stage changes, PI changes, assignee changes, project rename, meeting cancellation, role assignment. So Activity feed across the Hub can't show "what changed" — only "who said what." This blocks T17 fix.

---

## P0 Ship-Blockers (fix this week, before next sprint)

| # | Bug | Location | Fix | Effort |
|---|-----|----------|-----|--------|
| **P0-1** | AskTheLab accept-answer dead UI + zero server auth | `AskTheLab.tsx:366` + `api/routes/questions.ts:209` | Replace `'ningraha'` with `useAuth().isPi`. Add `isPiRequest()` gate server-side. | S |
| **P0-2** | Lab Overview hardcoded fake data (T4) | StatsCard:70 / UpcomingCard:17-53 / GrantTimelineCard:7-13 / ActivityFeedCard:81-87 | One PR: delete fake fixtures, wire real APIs OR remove cards. | M |
| **P0-3** | `/api/meetings/process-transcript` doesn't exist | `MeetingNotesPage.tsx:227` | Either build (Hermes via ai-requests) OR hide modal + replace with paste-to-notes pass-through. | M |
| **P0-4** | Decorative compose surfaces on Today (morning-thought + Right Now chat) | `TodayPage.tsx:237-244`, `RightNowCard.tsx:67-71` | Replace with `<SmartCompose>`. Cmd+Enter routes by prefix `@hermes` / `note:` / default `task:`. | M |
| **P0-5** | TaskDetailDrawer subtask checkbox decorative | `TaskDetailDrawer.tsx:114` | Wire `useToggleSubtask` mutation. | S |
| **P0-6** | UnifiedMyTasks Rule 18 cache-subscribe violation | `TaskDrawer.tsx`, `InlineDetail.tsx` | Replace with `<TaskDetailPanel taskId={id}>` (closes 7 P0/P1 in one move). | M |
| **P0-7** | InlineDetail Archive ≠ bulk Archive | `InlineDetail.tsx:78` vs `index.tsx:167` | Single-row should call `bulkUpdate({ ids:[id], action:'delete' })` to soft-delete consistently. | S |
| **P0-8** | TodayPage cross-surface state drift on completion | `useTodayState.ts` `state.done` localStorage | Derive `done[id]` from `tasks.find(t => t.id === id).completed === 1` (cache, not LS). | M |
| **P0-9** | ProfilePage `rawRow` query has no `queryFn` — invalidate is no-op | `ProfilePage.tsx` | Replace ad-hoc `setQueryData` with real `useQuery({ queryKey: ['team-raw'], queryFn })`. | S |
| **P0-10** | iCal events not on CalendarPage | `CalendarPage.tsx` | Add `useUserCalendarEvents()` to merge into `events` array. Add `type:'personal'` color. | S |
| **P0-11** | InsightsPage SQL labels lie ("this week" data is last week) | `api/routes/insights.ts:342-343` | Fix `weekday 1, -7 days` → `weekday 0, -6 days` (Sun-Sat) OR relabel "Last week's tasks." | S |
| **P0-12** | Personal Regulatory strip shows lab-wide items to non-PI users | `Personal.tsx:637-641` | Filter `useExpiringRegulatory` by `responsible_slug = currentUser` (PI sees all). | S |

**Estimated P0 batch effort: 1.5 weeks for one engineer.**

---

## Phase A — Foundations Sprint (2 weeks, after P0)

Cross-cutting infrastructure that unblocks page-level work in Phase B.

### A1. Universal SmartCompose
Wire `<SmartCompose>` into every compose surface (T1, T2). Single PR, ~12 sites:
- TodayPage morning thought
- TodayPage Right Now chat
- TaskDetailDrawer compose
- MeetingDetail action item form (replaces `AddActionItemForm`)
- MeetingDetail notes editor (replaces bare textarea)
- ProjectDetail Overview bottom compose
- ProjectUpdateFeed (replace bespoke compose)
- ProjectComments (already works, just standardize)
- AskTheLab question composer
- AskTheLab answer form

**Side effect**: closes T1, half of T2, and the @hermes-not-assisted complaint everywhere.

### A2. Hermes maturity pass
- Replace literal `"Thinking about this..."` placeholder with `<HermesPending>` component (HermesMark pulse, elapsed time, 5min timeout → retry)
- Wire `realtimeBus` subscription on AskTheLab + ProjectComments + MeetingDetail for `{type:'ai-request-completed', source_id}` → cache invalidate
- Centralize `/@(hermes|claude)\b/i` regex into `src/lib/hermes.ts` (currently duplicated 4+ places)
- Rename HermesSuggestsCard → "Today's Focus" (drop ✨) OR wire actual ai_request (1×/day cached)
- Add `<HermesMark>` to: AskTheLab PageHeader, MeetingDetail Generate Agenda, ProjectDetail "Ask Hermes" row button, Manuscripts row "Ask Hermes about this paper" button, all Hermes-authored notifications
- Build (or formally cancel) AskHermes coach (T-35) — currently CLAUDE.md lies

### A3. realtimeBus wiring sweep (Rule 52)
- AskTheLab: subscribe to `['questions']` invalidation
- MyItems: subscribe to `['notifications']` invalidation
- InsightsPage: subscribe to project_update events → invalidate `['insights-dashboard']`
- CalendarPage: trigger iCal poll on visit (currently 15min stale)
- Profile: presence on team_member to warn "editing on another device"

### A4. Brand primitives adoption sweep (Rule 29)
- `CategoryIcon`: ProjectDetail header, Manuscripts dots (5 sites), Today task tags, Search results, Calendar event icons, Lab Overview ProjectHealthRow, MyItems source icons
- `HermesMark`: AskTheLab PageHeader, HermesSuggestsCard, MeetingDetail Generate Agenda, all Hermes-authored content (notifications, search results, comments)
- `HeartbeatDivider`: ProfilePage section dividers, ProjectDetail tab/content boundary, Meetings detail boundary
- `EmptyStateArt`: InsightsPage stalled empty, MyItems all-clear, MyTasks empty, CalendarPage empty agenda

### A5. Token discipline pass
- Replace `#fff` literals with `var(--ink-bright)` (T13) — codemod
- `--gold-on-emphasis` swap on gold-on-gold pills (Rule 42) — ProjectDetail agenda, AskTheLab project pill, ProfilePage role pill
- `--stage-fill-*` swap on Manuscripts stage dots, PipelineCard bars, all stage emphasis bgs (Rule 41)
- Animation durations to token system (5 durations)
- Inline `<style>` blocks → CSS modules (TodayPage, etc.)
- borderRadius 3/5 → tokens

### A6. Cache-subscribe pattern enforcement (Rule 18)
- Document `qc.getQueryCache().subscribe(...)` pattern in CLAUDE.md as the standard
- Replace UnifiedMyTasks bespoke drawer/inline with `<TaskDetailPanel taskId={id}>` (closes T8 partial)
- Audit for any other detail panel taking full row as prop

### A7. activity_log emit on shared-field changes (T20)
Add server-side activity_log writes for: stage change, PI change, assignee change, project rename, meeting cancel, role assignment, manuscript stage advance. Format: `{ entity_type, entity_id, actor_slug, change_type, old_value, new_value, created_at }`. Unblocks T17 (real Activity tab).

### A8. Page identity decision (Rule 57 enforcement, T6)
**Brainstorm with Nick first** — see Open Questions. Options:
- **Option A**: Retire `/portal/personal`. Distribute (RecentActivity → Today rail; QuickCapture → already in FAB; Onboarding → toast/profile; Regulatory → Lab Overview PI-only; RoleSelector → Settings). MyItems renamed to "Inbox."
- **Option B**: Keep Personal, prune duplicates (kill TodayHero, MyTasksColumn, QuickStats, QuickActions); leave RecentActivity + Onboarding + Regulatory.
- **Option C**: Merge MyItems into Personal as a tab.

---

## Phase B — Page-Level Tier 1 (3-4 weeks)

After Phase A foundations, surface-specific high-leverage moves. Order by user-visible impact × cost.

### B1. TodayPage — operating-day depth (1 week)
- Live "now" line on Timeline (1px abs-positioned, updates every 60s)
- Proportional time-block meeting rendering (15min=24px, 60min=96px) — uses iCal start/end already there
- OverlapBand implementation (currently null at line 25-30)
- Meeting "Join" button when `meeting_url` present
- Persist meetingNotes (currently component state — refresh = dataloss)
- Persist dismissedMeetings (same problem)
- Group collapse + virtualize (P1)
- Add due-date + priority + assignee cells to TaskRow (currently row carries title + project + planned chip only — operating-day surface w/o urgency cue is broken)
- Drop fake `focusMin`. Drop fake Lab Health math. Hide non-PI `syncHours`.
- Keyboard shortcuts: J/K, D=done, Space=promote, F=focus, ?=help
- Right rail mobile order: rail above task list (currently buried below)
- Auto-promote re-fires after user marks Right Now done with empty queue

### B2. UnifiedMyTasks — feature parity (1 week)
- Replace TaskDrawer with `<TaskDetailPanel taskId>` (covered in P0/A6)
- Restore inline editing (status / priority / assignee / due / project) on List view minimum, ideally Columns/Lanes too
- Drag-to-reclassify in Columns + Lanes (writes `group_override` — schema v50 already exists)
- Virtualize all 3 views
- Swipe-to-complete on mobile (Rule 56 — wrap row in motion.div w/ useSwipeAction)
- Saved views v1.5: rename UI, "default view," "save changes" affordance, dark-themed menu
- Single-row Complete button (currently must select-then-bulk)
- BulkBar Snooze loops single mutations on 50 tasks → fires 50 API calls. Add `action:'snooze'` to bulk endpoint.
- `useTasks(undefined)` race fixes (`enabled: !!userSlug`)

### B3. ProjectDetail — Activity + cohesion (1 week)
- Real merged Activity feed (T17 + T20): notes + comments + task status changes + stage changes + assignment changes + system events. Sticky day headers. Drop duplicate ProjectUpdateFeed/ProjectComments embed.
- Strip Overview tab below the landing card: move Strategic Context / Stage strip / Details / Key Documents / InsightPanel / ConferencePrep into "Project Info" disclosure or sidebar at >1440w
- Tab system: URL write-back (`?tab=`), keyboard nav (`role="tablist"` + arrow keys), counts on Comments/Files/Activity/Literature, lazy-load tab data
- Tasks tab inherits `<TaskGridView>` (closes T11, brings inline editing for free)
- Header: archive/delete/duplicate ellipsis menu, title h1 inline-editable, CategoryIcon prepended to category InlineSelect
- Header stage `InlineSelect` routes through `confirmStageChange` (currently bypasses confirmation that strip uses)
- Comments: `getPersonInfo(comment.author_slug)` not `comment.author_name` raw
- Notes/Comments banner dismissible (currently shows forever)
- Files: render uploader name + timestamp, delete confirms with undo
- Mobile stage strip overflow fix (truncate labels or collapse to current+Move)

### B4. Hermes pages (AskTheLab + Insights) — AI-flavor authenticity (1 week)
- AskTheLab:
  - Fix accept-answer auth (P0-1)
  - HermesMark on PageHeader
  - SmartCompose / MentionInput on question composer + answer form (covered in A1)
  - Tags + filters (Unanswered, Awaiting Hermes, Resolved-by-Hermes)
  - Real Hermes pending state + realtimeBus delivery (covered in A2)
  - Hermes answers searchable as 15th entity type
- Insights:
  - Refresh button + last-computed timestamp
  - `?week=` param wired (currently API ignores it — historical view impossible)
  - Sparklines on hero cards (brief required, never shipped)
  - Use shared `MetricCard` not bespoke `MetricHero`
  - Wire Connections engine onto the page (`/api/insights/connections` exists, only used in Lab Overview card — promote)
  - Hermes "Tell me more" + "What should I do?" round-trip
  - Make heatmap rows / funnel bars / scatter dots clickable (currently 5 of 7 surfaces zero CTA)
  - Surface unused `tasksPerPerson.distribution` payload as bar chart panel

### B5. Lab Overview — Rule 57 enforcement (3 days)
- Kill the lies (P0-2)
- Move personal cards (ProactiveBrief, QuickWins, MyItems, EmailDrafts, Pomodoro, YourWeek) → either retire or move to Today
- Promote LabHealthScore from sidekick to centerpiece (88px hero card with reason list + drill-throughs); drop StatusLine
- Flip TeamPulse + Insights + Grants(real) + ActivityFeed(real) to defaultVisible: true
- Refresh ROLE_DEFAULTS — fellow currently gets only 3 cards
- Replace IIFE-rendered chrome with `<DashboardHeader>` component
- Editorial cards (CLIF Mini, Topic Bubbles) move to public `/pulse` or `/network`

### B6. Calendar — schedule, not date list (1 week)
- iCal merge (P0-10)
- Time-aware Week view (hour-grid rows, proportional event blocks, now-line)
- Default view = Agenda (operating-day mental model)
- Persist view choice to LS
- Make every event clickable to source (tasks→panel, milestones→deadlines, iCal→meeting URL Join)
- "+ New" button in PageHeader actions
- Meeting URL Join button (covered in T5)
- CategoryIcon + source-tinting per Rule 59

---

## Phase C — Page-Level Tier 2 (3-4 weeks)

Polish, depth, edge cases. Order TBD with Nick.

### C1. Manuscripts
- Click-to-advance stage dots (~30 min change, weekly action)
- Active Submissions widget at top of List view
- Pipeline view drag-and-drop between stages (`@dnd-kit` already installed)
- Auto-link Published manuscripts to Publications row
- `stage_entered_at` schema column (replaces broken `daysInStage` math)
- Hermes "Summarize R2 reviewer comments" button
- PI filter derived from data not hardcoded
- Trophy view: real journal logos OR fix `(p as any).journal_name || ...` triple-fallback

### C2. ProfilePage
- Photo upload via R2 (infra exists from Phase 28)
- Notification preferences panel (digest_time, mentions_email, weekly_digest_email, today_summary_email)
- "What people see" preview (live `<TeamMemberCard>` next to form)
- Calendar 7-day preview strip below feeds list
- PI admin overlay for editing other team members (Rule 66 supports server-side)
- `auto_created` PENDING REVIEW badge visible to self
- Slug visible (`@nick-ingraham` muted code)
- Bio char counter + markdown preview
- scholar_id format hint + URL extraction

### C3. MyItems → Inbox rename + maturity
- Rename to Inbox (URL `/portal/inbox` with `/portal/my-items` redirect)
- Filter chips: All / Mentions / Assignments / Deadlines / Hermes
- Per-row actions (snooze, dismiss, archive) on hover
- Mark-all-read undo
- Pagination at 50, "Older" collapse for >30d
- Sidebar avatar unread badge wire-up (`useUnreadCount` already exists)
- Commitments tracker: `to_slug` schema fix, mark-done UI, `useToggleCommitment` mutation, "+ Add commitment" button
- Hermes notifications branded with HermesMark

### C4. Meetings — full lifecycle
- MeetingPrep interactive (toggle previous actions, add agenda from prep, "carry these forward" bulk action)
- Live "happening now" indicator on today's 3pm CT meeting
- Meeting cancellation (`cancelled_at` column, filter on list)
- Inline edit title + date
- "My meetings" filter chip (attendees CONTAINS me)
- URL state for selected meeting (`?m={id}`)
- Audio upload pipeline OR kill the tab (Workers AI Whisper ~$0.06/hr)
- Per-action-item file association

### C5. SearchPage
- Snippets with match highlighting (matched body field, `<mark>` wrap)
- Sticky input + chips bar
- "Top results" mixed list view (preserves cross-type score) + "By type" + "Timeline" view picker
- People + date + scope filters (second chip row)
- Type-specific row rendering (assignee avatar on tasks, journal pill on pubs, FY on grants)
- Saved searches via `useSavedViews(page='search')` — extends Rule 53
- FTS5 virtual tables on D1 for narrative content (long-term)
- Recent searches: save on Enter (not on every prefix), per-chip remove, bump cap to 10
- Person search (15th entity type)
- Hermes-augmented search ("Hermes synthesizes from these results")

### C6. CalendarPage finishing
- Multi-day events as bars across cells
- All-day vs timed visual distinction
- Cancelled events (cross-link with C4 meeting cancellation)
- Filters (Meetings | Tasks | Milestones | Personal)
- iCal export improved (DTSTART;TZID for timed events, escape line breaks)
- Mobile Week view → Agenda fallback at 360w

### C7. InsightsPage
- Mentee progress / Publication velocity / Anomaly flagging insight categories
- Per-member drill-down on heatmap click (currently inert)
- Quadrant overlay on scatter (healthy / abandoned / overloaded / critical)
- Stalled registry: InlineDatePicker + UndoToast + "snooze" / "dismiss" affordance
- Filters (category, severity, time horizon — currently zero)
- Past-week archive UI (after `?week=` ships)
- Hermes-suggested follow-up dates

---

## Sequencing recommendation

| Phase | Duration | Outcome |
|-------|----------|---------|
| **P0 batch** | 1.5 weeks | 12 hard bugs closed; trust restored on Lab Overview; security gate plugged on AskTheLab; iCal-on-Calendar + InsightsPage data-correctness shipped |
| **Phase A — Foundations** | 2 weeks | SmartCompose universal; Hermes infrastructure mature; brand primitives + tokens swept; cache-subscribe enforced; activity_log emit; Page Identity decided |
| **Phase B — Tier 1** | 3-4 weeks | Today/MyTasks/ProjectDetail/Hermes/LabOverview/Calendar each leveled up to spec |
| **Phase C — Tier 2** | 3-4 weeks | Manuscripts/Profile/Inbox/Meetings/Search/Calendar/Insights polished |

**Total**: ~10-12 weeks of focused work to fully close the audit. P0 + Phase A alone (~3.5 weeks) closes the most embarrassing gaps and unblocks everything downstream.

**Parallelization**: P0 can run in parallel branches. Phase A items 1-3 (SmartCompose, Hermes, realtimeBus) interact, do sequentially. A4-A7 can run parallel. Phase B items independent — split across branches.

---

## Top Open Questions for Nick (decide before starting Phase A)

1. **Page identity (T6, A8)**: retire Personal entirely (Option A), prune duplicates (Option B), or merge into MyItems (Option C)? My recommendation: **A** — Personal's only differentiated content (Onboarding, Regulatory PI-strip, RecentActivity, RoleSelector) absorbs cleanly into Today/Settings/Profile. Cuts a 1163-line page.

2. **Hermes pending-state UX (A2)**: when `@hermes` is invoked, does the user see (a) a stub answer card with HermesPending pulse + elapsed time, (b) a "Hermes is thinking" banner above the question, or (c) nothing until the response lands? Currently the literal string sits as a fake answer. Pick a shape.

3. **Today's morning-thought routing (P0-4)**: prefix-routed (`@hermes`, `note:`, default `task:`) or explicit toggle UI? Time-aware (auto-pivot to "Plan tomorrow" after 5pm)?

4. **AskHermes coach (T3)**: ship (M effort — guided "improve my prompt" modal) or formally cancel (XS — remove from CLAUDE.md)?

5. **Transcript pipeline (P0-3)**: Hermes-via-ai-requests (async, ~30s) or Workers AI sync? Audio support (Whisper ~$0.06/hr) ship in same PR or stay paste-only?

6. **Manuscripts → Publications auto-link (C1)**: when stage flips to Published, auto-create publications row + link? Or keep parallel surfaces with manual cross-link?

7. **Inline editing on UnifiedMyTasks (B2)**: List view minimum, or Columns + Lanes too? Columns kanban-with-inline-edit is uncommon but feasible.

8. **Activity tab as audit log (B3, T17)**: full audit log requires `activity_log` emit on stage/PI/assignee/etc. changes (A7). Worth the schema-write churn or stay merged-feeds-only?

9. **iCal events on CalendarPage (P0-10)**: render as `type:'personal'` color (current plan), OR distinct visual band (e.g., personal events in their own row above team events)? Privacy concern — does the user want iCal events visible to other team members on Calendar? (They aren't in the API today.)

10. **Saved-views v2 (C5)**: D1-backed (cross-device) or stay localStorage? Hub roadmap mentioned this.

11. **Lab Overview audience (B5)**: PI-only after Rule 57 enforcement (merge into PIAnalytics), or stay everyone-facing with 6-8 lab-wide cards?

12. **Rule 24 sidebar avatar destination**: stays at MyItems (Nick's preference), or routes to Profile / Inbox after rename? Affects T6 + C3.

---

## What this audit did NOT cover

Other portal routes not audited (out of scope, but each likely has surface-level findings):
- `/portal/projects` (Projects list)
- `/portal/tasks` (Tasks team-wide)
- `/portal/grants`
- `/portal/deadlines`
- `/portal/decisions`
- `/portal/ideas`
- `/portal/activity`
- `/portal/team` + `/portal/team/:slug`
- `/portal/publications`
- `/portal/network`
- `/portal/digest`
- `/portal/narratives`
- `/portal/sessions`
- `/portal/mentee-milestones`
- `/portal/deadline-cascade`
- `/portal/analytics` + `/portal/pi-analytics`
- `/portal/settings`
- Pulse Kiosk + public marketing pages

Recommend a Phase D round on these after Phase B completes — likely smaller-volume since most are Phase 26b-era data pages that haven't drifted as far from spec.

---

## Per-page report locations

Each agent produced a ≥1500 word deep audit. Report agentIds (resumable via SendMessage):
- TodayPage: `ada0fed73eacd7a94`
- UnifiedMyTasks: `a0d8996ab785d4527`
- ProjectDetail: `a2ab1fd7fa0eb0947`
- ProfilePage: `a9c1b17464cd16eec`
- Lab Overview: `afd283d613db17c97`
- Manuscripts: `ac45891930848b39b`
- MyItems/Personal: `a10ac983f69362a73`
- Meetings: `a60bf713f7436c529`
- SearchPage: `ad3cda758d0e83d59`
- AskTheLab: `a30f082566ec3d9a3`
- CalendarPage: `ad359154c94b999be`
- InsightsPage: `a54538b57bbc42c06`

Resume any agent with `SendMessage(to: '<agentId>', prompt: '...')` to drill deeper on a specific finding.

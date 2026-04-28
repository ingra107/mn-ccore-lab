# Decisions Resolved — 2026-04-28

> Walked the decision queue with Nick via AskUserQuestion. All 31 decisions answered. This file is the single source of truth for the fix phase.
>
> **Format**: D# — question summary | answer | implications.

---

## Resolved decisions

### D1 — AskTheLab accept-answer auth
**Answer**: Asker-can-accept-too (Stack Overflow model).
- Server-side: gate is `isPiRequest() OR userSlug === question.asked_by`
- UI-side: same logic, button shows for PI OR asker
**Unblocks**: ATL-01, ATL-02

### D2 — Lab Overview hardcoded fake data
**Answer**: Wire all 4 cards to real APIs (no killing).
- LO-1 → Build `/api/citations` endpoint (see D2-followup)
- LO-2 → Wire UpcomingCard deadlines list to `useDeadlines()` / `useGrants()`
- LO-3 → Wire GrantTimelineCard to `useGrants()` data already fetched
- LO-4 → Wire ActivityFeedCard to `/api/activity` (drop hardcoded "CLIF expanding" copy)
**Unblocks**: LO-1, LO-2, LO-3, LO-4

### D2-followup — Citations source
**Answer**: Aggregate from `publications.citation_count` column.
- One-time backfill: scrape Semantic Scholar API per pub.id, populate `publications.citation_count`
- API endpoint: `GET /api/citations` returns `SUM(citation_count)` from publications
- Recurring: nightly cron refreshes citation counts (or per-pub on edit)

### D3 — `/api/meetings/process-transcript`
**Answer**: Hermes-async via ai_requests queue.
- Build endpoint that creates `ai_requests` row with `intent='summarize-meeting'`
- `hub_ai_listener.py` (home laptop) processes; writes back via existing pattern
- Returns immediately with pending response; UI polls or subscribes via realtimeBus
**Unblocks**: MTG-01

### D4 — Retire `/portal/personal`?
**Answer**: Merge MyItems INTO Personal as a tab.
- See D4+D5-followup for tab architecture
- `/portal/my-items` redirects to `/portal/personal?tab=inbox`
- Sidebar avatar still routes to `/portal/personal` (footer convention preserved)
**Unblocks**: MI-01, MI-05, MI-19, MI-20, MI-21

### D5 — Lab Overview Rule-57 sweep
**Answer**: Move personal cards to Personal page (now has Inbox tab per D4).
- Personal cards (your-week, quick-wins, proactive-brief, my-items, email-drafts, pomodoro-stats) move from Lab Overview CARD_REGISTRY → Personal "Cards" tab
- Lab Overview becomes lab-wide cards only (ProjectHealth, Pipeline, TeamPulse, Insights, Activity, Stats, Grants, FileActivity)
- Drop StatusLine (redundant w/ LabHealthScore)
- 4-tab IA decision deferred (will resolve when Lab Overview lands; Customize alone may be enough)
**Unblocks**: LO-6, LO-8 (StatusLine), partial LO-7

### D4+D5-followup — Personal page architecture
**Answer**: 3-tab layout: Workspace | Inbox | Cards.
- **Workspace tab** (default): RecentActivity + QuickStats + QuickCapture + Onboarding
- **Inbox tab** (was MyItems): notifications + commitments + meeting action items
- **Cards tab**: 6 personal cards from Lab Overview in RGL grid (your-week, quick-wins, proactive-brief, my-items, email-drafts, pomodoro-stats)
- URL: `?tab=workspace|inbox|cards`. Default = workspace.

### D6 — MyItems → Inbox rename
**Answered by D4**: MyItems becomes the "Inbox" TAB inside Personal. No standalone rename. Legacy `/portal/my-items` URL redirects to `/portal/personal?tab=inbox`.

### D7 — `projects.stage_entered_at` column
**Answer**: Schema bump + cross-repo coordination per Rule R10.
- Add `projects.stage_entered_at` column to D1 schema (v54)
- Coordinate with brain.db: `Context/Decisions/2026-MM-DD-stage-entered-at.md` decision doc
- Update `enums.py` if applicable
- Update `shared-schema-registry.md`
- Backfill from latest `activity_log` stage-change emit (depends on D22 shipping first)
- New stage changes write `stage_entered_at = NOW()` on the same UPDATE
**Unblocks**: M-03

### D8 — Tags on `lab_questions`
**Answer**: Add `tags TEXT` column, curated 7-tag taxonomy.
- Tags: `statistics`, `methods`, `data-access`, `writing`, `clinical`, `process`, `general`
- Stored as comma-separated string (CSV) in `lab_questions.tags`
- Cross-repo coordination check: verify if brain.db mirrors `lab_questions` (likely not — Hub-native)
- UI: multi-select chip input on composer + filter pills on list
- Hermes can route by tag (future)
**Unblocks**: ATL-06

### D9 — `commitments.to_slug` column
**Answer**: Add to_slug column.
- Schema migration: `ALTER TABLE commitments ADD COLUMN to_slug TEXT`
- Cross-repo coordination check: verify if brain.db mirrors commitments (likely not — Hub-native)
- Backfill from existing `to_whom` via best-effort name lookup (LUT first, fuzzy match second)
- Future commitments capture slug at write-time
- `getPersonInfo(commitment.to_slug)` replaces fragile last-name parse
**Unblocks**: MI-07, MI-13

### D10 — Regulatory user-scoping
**Answer**: Audit schema first. Filter if `responsible_slug` exists; PI-gate if not.
- Step 1: query `regulatory_items` schema. Look for `responsible_slug` / `assigned_to` / `owner_slug`
- If exists: `useExpiringRegulatory(60, currentUserSlug)` filters by column
- If absent: gate the entire strip via `useUserRole().isPi`
- Don't add column for this alone (D5 puts regulatory on Lab Overview anyway)
**Unblocks**: MI-06

### D11 — Today morning-thought routing
**Answer**: Prefix-routed + time-aware.
- `@hermes ...` → posts to `ai_requests` with `entity_type='daily_thought'`
- `note: ...` → drops into a `daily_thoughts` log (new table OR appended JSON in `today_state_*`)
- Default (no prefix) → creates a task via `useCreateTask` w/ `assignee=userSlug`, default group from preferences
- After 5pm: prompt swaps to "Plan tomorrow's first move…" — task is created with `due_date=tomorrow`, auto-pinned to tomorrow's planned strip
**Unblocks**: TP-01

### D12 — `state.done` architecture
**Answer**: Drop `state.done` from LS, derive from cache.
- TaskRow reads `tasks.find(t => t.id === task.id)?.completed === 1`
- Single source of truth (React Query cache)
- Eliminates rollback bug (TP-06) too — closes both findings in one move
- `useTodayState` shape simplifies; persisted LS no longer carries `done` map
**Unblocks**: TP-04, TP-06

### D13 — Timeline meeting-notes persistence
**Answer**: Piggyback `task_updates` with `entity_type='meeting'`.
- No new schema
- Reuses existing storage + sync infra
- Searchable via Rule 51 (search index includes task_updates)
- Durable across devices
- Schema check: `task_updates` may need `entity_type` column expanded if currently scoped to tasks only
**Unblocks**: TP-05

### D14 — SmartCompose universal sweep
**Answer**: Bundle into one Phase A foundations PR.
- 8 surfaces: ProjectDetail Overview compose / ProjectUpdateFeed / ProjectComments / MeetingDetail action items / MeetingDetail notes / AskTheLab composer + answer / TodayPage morning-thought / Right Now chat
- Each is mechanical (drop in `<SmartCompose>` with appropriate props)
- Single review pass; all fixes ship together
**Unblocks**: PD-6, MTG-02, MTG-03, ATL-05, TP-01 (component side), TP-02

### D15 — Today Timeline now-line
**Answer**: Ship 1px now-line in Phase B.
- Single 1px horizontal line at `(currentTime - dayStart) / dayLength` of section height
- Updates every 60s via `setInterval`
- Coral if user is in a meeting (compute from event.start <= now <= event.end)
- Gold otherwise
- Proportional time-blocks deferred — bundles with D28 Calendar work
**Unblocks**: TP-09

### D16 — Today token sweep
**Answer**: Migrate everything to design tokens.
- All `#fff` literals → `var(--ink-bright)` (Rule 14)
- All `rgba(255,255,255,0.0X)` → `var(--surface-N)` tokens
- All hardcoded `#0a0f15`, `#0b1017` → tokens
- The 5 ACCENT constants in `constants.ts` stay hex-pinned (Rule 32 Pulse-Kiosk-style exemption acceptable for accent constants only)
- Inline `<style>` blocks moved to CSS modules
**Unblocks**: TP-13

### D17 — Hermes Suggests rename
**Answer**: Rename + drop sparkle now, wire later in Phase A.
- Stage 1 (today): rename "Hermes Suggests" → "Today's Focus", drop ✨ icon
- Stage 2 (Phase A Hermes maturity): wire 1×/day cached `ai_request` for real
**Unblocks**: TP-14

### D18 — Today icon vocabulary
**Answer**: Extend CategoryIcon vocabulary.
- Add new variants: manuscript, grant, meeting, sync, etl, deep-work, quick-win, mentee, blocker
- Replace 9-emoji vocab in PillStrip + GROUP_META + tagForTask with `<CategoryIcon kind="..."/>`
- Brand-coherent across all surfaces
**Unblocks**: TP-15

### D19 — focusMin tile (PB integration!)
**Answer**: Wire to existing PB session data — combine, don't drop.
- `usePBSessionStats` already exists (used in `PomodoroStatsCard.tsx`)
- TodayPage's PulseCard.focusMin should read TODAY's actual focus minutes from PB sessions
- Drop `plannedIds × 30` fake math
- Bonus: if PB sessions exist, the metric becomes a real productivity signal
**Unblocks**: TP-16

### D20 — Lab Health tile math
**Answer**: Sigmoid scaling + tooltip.
- New formula: `score = 100 / (1 + e^(0.05 * overdue + 0.02 * stalled))`
- Smooth degradation; never hits hard 0
- Hover tooltip explains formula + lists current reasons ("4 overdue tasks · 1 IRB renewal in 60d · ...")
**Unblocks**: TP-17

### D21 — ProjectsCard "relevant today" heuristic
**Answer**: All signals + show-all toggle.
- Default filter: projects with (tasks due today OR overdue) OR (planned-today tasks) OR (last-7d activity)
- "Show all" toggle expands to full active list (71+)
- Persist toggle to LS
**Unblocks**: TP-19

### D22 — Activity tab as audit log
**Answer**: Build real audit log + emit events.
- Activity tab renders merged temporal feed (notes + comments + system events) sorted desc
- Sticky day headers (round-5 T-22 spec)
- Add `activity_log.emit()` calls on 6 transitions:
  1. Stage change (also writes `projects.stage_entered_at` per D7)
  2. PI change
  3. Status change
  4. Assignee change (project-level)
  5. Project rename
  6. Meeting cancel (depends on `cancelled_at` column)
- Drop duplicate `<ProjectUpdateFeed>` + `<ProjectComments>` from `ProjectActivity.tsx`
**Unblocks**: PD-3, partial M-03

### D23 — ProjectDetail Tasks tab
**Answer**: Reuse `<TaskGridView>` filtered by project.
- Replace card-stack render with `<TaskGridView projectFilter={slug}>`
- Cuts ~80 lines
- Inherits column-resize + inline-edit + multi-select + saved-views + virtualization
**Unblocks**: PD-5

### D24 — SmartCompose adoption
**Answered by D14**: bundled with universal sweep.

### D25 — Active Submissions widget
**Answer**: New widget at top of Manuscripts List view.
- Above category chips, below NeedsAttentionDashboard
- Horizontal scroll of submission-event mini-cards (last 30d)
- Reuses `<SubmissionTimeline>` component
- Server: `GET /api/manuscripts/submissions?days=30` returns events ordered by date
**Unblocks**: M-12

### D26 — Pipeline drag-and-drop
**Answer**: Yes, wire `@dnd-kit`.
- Already in lockfile
- Drag card between stage columns → fires `inlineUpdate({stage})` with optimistic + undo
- Pipeline becomes real kanban
**Unblocks**: M-13

### D27 — Manuscripts PI filter dynamic
**Answer**: Derive from data.
- Replace `PI_OPTIONS` constant with `[...new Set(projects.map(p => p.pi).filter(Boolean))]`
- Look up display names from `team.ts` `getPersonInfo()`
- New PIs auto-appear
**Unblocks**: M-14

### D28 — Calendar time-aware (Phase B!)
**Answer**: Ship time-aware now (Phase B).
- Schema migration v55: `meetings.start_time` (HH:mm) + `meetings.end_time` (HH:mm)
- Hub UI: hour-grid Week view (rows 7am-8pm by default, overflow scroll)
- Now-line (1px, updates every 60s)
- Proportional event blocks (15min=24px, 60min=96px)
- Cross-repo coordination per Rule R10 (brain.db meetings table)
- Bundles with TP-09 (Today Timeline now-line + proportional blocks)
**Unblocks**: C-03, C-06

### D29 — Calendar "+ New" button
**Answer**: Chooser (Meeting / Task / Deadline).
- Dropdown menu opens 3 paths
- Pre-fills date from currently-selected calendar cell
- Matches TodayPage's compose-anywhere pattern
**Unblocks**: C-07

### D30 — InsightsPage scope
**Answer**: Ship full archive UI + Connections panel now.
- `?week=YYYY-WW` URL param (server + client)
- Week-prev/week-next chevrons in PageHeader
- Archive list: dropdown showing last 8 weeks with click-to-load
- Connections panel between funnel + scatter
- Each connection has "Schedule sync" CTA (creates meeting linking both projects)
**Unblocks**: INS-04, INS-10

### D31 — RoleSelector
**Answer**: Move to Settings → Lab tab.
- Remove from `Personal.tsx` header
- Add to `SettingsPage.tsx` Lab tab
- Low-frequency action; doesn't belong in daily-use header
**Unblocks**: MI-23

---

## Implications cascade

### Schema migrations queued (Cross-repo coordination per Rule R10)
1. `projects.stage_entered_at` (D7) — coordinated with brain.db
2. `lab_questions.tags` (D8) — verify brain.db mirror status first
3. `commitments.to_slug` (D9) — verify brain.db mirror status first
4. `meetings.start_time` + `meetings.end_time` (D28) — coordinated with brain.db
5. (Possibly) `regulatory_items.responsible_slug` (D10) — pending audit
6. (Possibly) Activity log table additions (D22) — verify schema currently

### Server endpoints to build
1. `/api/citations` (D2-followup)
2. `/api/meetings/process-transcript` (D3)
3. `/api/manuscripts/submissions?days=N` (D25)
4. `/api/insights/dashboard?week=YYYY-WW` (D30 — extend existing)
5. Pages handlers for any new schemas

### Major UI rebuilds
1. **Personal page** (D4 + D5 + D4+D5-followup): 3-tab layout, MyItems-as-Inbox-tab, 6 personal cards as third tab
2. **Lab Overview** (D2 + D5 + D17 + D20): wire 4 cards to real data, drop personal cards, drop StatusLine, sigmoid Lab Health, rename Hermes Suggests
3. **Calendar** (D28 + D29): time-aware Week view, hour grid, now-line, "+ New" chooser
4. **Insights** (D30): ?week= param, Connections panel, archive UI
5. **TodayPage** (D11 + D12 + D13 + D15 + D16 + D19): morning thought, state.done, meeting notes, now-line, token sweep, focusMin from PB

### Phase A foundations (cross-cutting)
1. **SmartCompose universal** (D14) — 8 sites, one PR
2. **CategoryIcon vocabulary extension** (D18) — adds primitives, then migrate Today
3. **Brand primitives sweep** — HermesMark on AI surfaces (multiple findings touch this)
4. **Activity log emit** (D22) — server-side hooks on 6 transitions
5. **Token discipline** (D16, others) — `--gold-on-emphasis` swap, `--stage-fill-*` migration

---

## Dispatch plan (next session)

Bundles below are sized for parallel agents. Each bundle = 1 PR (or sub-PR for big bundles).

**Bundle A — P0 quick wins** (1 agent, fast):
- ATL-01 + ATL-02 (auth fix + asker-can-accept)
- TP-03 (subtask checkbox onChange)
- MT-03 (subtask checkbox onChange — same fix, different file)
- MTG-05 (emailToSlug instead of split)
- M-01 (Status/Stage stopPropagation)

**Bundle B — Lab Overview lies** (1 agent):
- LO-3 (wire GrantTimelineCard to useGrants — easiest, data already fetched)
- LO-4 (wire ActivityFeedCard to /api/activity)
- LO-2 (wire UpcomingCard to useDeadlines, drop fake list)
- LO-1 deferred (needs `/api/citations` endpoint built first — see Bundle G)

**Bundle C — Phase A SmartCompose universal** (1 agent, M effort):
- D14 — 8-site sweep

**Bundle D — Brand sweep** (1 agent):
- ATL-09 (Avatar variant gold→ice)
- ATL-11 (context panel color)
- ATL-07 (gold-on-emphasis swap)
- PD-9 (gold-on-emphasis swap)
- PD-8 (CategoryIcon on category pill)
- M-15 (CategoryIcon on dots)
- INS-07 (EmptyStateArt swap)
- MI-08 (token swap on StatCards)

**Bundle E — Token discipline** (1 agent):
- D16 — TodayPage migration

**Bundle F — Tab system + small UI fixes** (1 agent):
- PD-2 (tab URL write-back)
- PD-4 (Notes-Comments banner dismiss)
- PD-7 (archive/delete/duplicate menu)
- PD-10 (title h1 inline-editable)
- PD-11 (tab role + keyboard nav)
- PD-12 (tab counts)
- PD-13 (file uploader name + timestamp)
- PD-14 (file delete confirm/undo)
- PD-15 (stage strip mobile)
- PD-16 (tab strip overflow)
- PD-17 (Comments getPersonInfo)
- PD-18 (Hermes ReactionBar inside gold card)

**Bundle G — Server endpoints** (1 agent or split):
- `/api/citations` (D2-followup)
- Wire StatsCard.totalCitations
- LO-1 closes after this

**Bundle H — UnifiedMyTasks foundation** (1 big agent or staged):
- MT-01 through MT-19 — replace TaskDrawer with TaskDetailPanel composition + restore inline editing + virtualize

**Bundle I — Coordinated schema work** (NOT auto-dispatched — needs Nick git workflow):
- D7 stage_entered_at + D22 activity_log emit (cross-repo, decision doc, lockstep)
- D8 tags + D9 to_slug + D10 regulatory column audit (cross-repo)
- D28 meetings.start_time / end_time (cross-repo)

**Bundle J — Personal page rebuild** (Phase B work):
- D4 + D5 + D4+D5-followup — 3-tab layout, MyItems-as-Inbox-tab, 6 cards as third tab

**Bundle K — TodayPage cleanup** (Phase B):
- TP-01 + TP-02 (morning thought + Right Now chat — depends on Bundle C SmartCompose)
- TP-04 + TP-06 (state.done architecture — D12)
- TP-05 (meeting notes piggyback — D13, depends on task_updates schema)
- TP-08 (virtualize TaskGroup)
- TP-09 (1px now-line — D15)
- TP-10 (meeting Join button)
- TP-11 (OverlapBand)
- TP-12 (due-date + priority cells on TaskRow)
- TP-13 (token sweep — Bundle E)
- TP-14 (Hermes Suggests rename — D17)
- TP-15 (CategoryIcon swap — D18, depends on extended vocabulary)
- TP-16 (focusMin from PB — D19)
- TP-17 (Lab Health sigmoid — D20)
- TP-18 (NeedsAttention overflow link)
- TP-19 (ProjectsCard relevant-today — D21)

**Bundle L — Calendar time-aware rebuild** (Phase B, depends on Bundle I schema):
- D28 + D29 — full rebuild after meetings.start_time ships

**Bundle M — InsightsPage feature pass** (Phase B):
- D30 — full archive UI + Connections panel
- INS-01 (SQL fix) + INS-02 (InlineDatePicker) + INS-03 (refresh button) + INS-05 (sparklines) + INS-06 (MetricCard) + INS-08 (clickable surfaces) + INS-09 (tasksPerPerson distribution)

**Bundle N — Manuscripts feature pass** (Phase B):
- M-04 (useLabPrefs threshold)
- M-05 (usePageMeta race)
- M-06, M-07 (stage dots tokens + clickable)
- M-08 (intermediate breakpoint)
- M-09 (NeedsAttention split)
- M-10 (auto-expand)
- M-11 (Trophy view canonical journal field)
- M-12 (Active Submissions widget — D25)
- M-13 (Pipeline DnD — D26)
- M-14 (PI filter dynamic — D27)
- M-17 + M-18 (aria-controls)

**Bundle O — Search + AskTheLab** (Phase B):
- All S-* findings (16 items)
- ATL-03 + ATL-04 (Hermes pending state + realtimeBus)
- ATL-06 (tags — depends on Bundle I schema)
- ATL-08, ATL-10 (a11y)

---

Recommended dispatch order:
1. **Bundles A + B + C + D + F** (all independent + safe + parallel) — fire 5 agents in parallel
2. **Bundles E + G** — sequential after first wave settles
3. **Bundle H** — UnifiedMyTasks rebuild (biggest single PR)
4. **Bundle I** — coordinated schema work (Nick involved)
5. **Bundles J + K + L + M + N + O** — Phase B work, after foundations land

Estimated wall-clock: P0+Phase-A (Bundles A-G) = 1.5-2 weeks. Phase B (Bundles H-O) = 4-6 weeks.

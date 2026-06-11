# MN-CCORE Lab Hub — Reference Guide

Detailed tables, API endpoints, key files, and feature inventory.
Moved from CLAUDE.md to reduce session context load. Read on demand.

## Routing (post-Phase 37, 2026-04-21)

All gated routes live under `/portal/*`. `src/constants/paths.ts` is
the single source of truth (`PATHS.dashboard`, `PATHS.project(slug)`,
etc.). `tests/helpers/paths.ts` mirrors it for tests. Legacy root
paths (`/dashboard`, `/projects/:slug`, ...) redirect via `<Navigate>`
shims in `src/App.tsx` placed outside `RequireAuth`.

| Category | Path pattern | Notes |
|---|---|---|
| **Gated (portal)** | `/portal/*` | CF Access + `RequireAuth` + `PortalLayout` chrome. 27 canonical routes. |
| Today (Phase 38) | `/portal/dashboard` | `TodayPage.tsx` — operating-day surface (Right Now / timeline / 5 task groups / right rail) |
| Lab Overview (Phase 38) | `/portal/overview` | `Dashboard.tsx` (was `/portal/dashboard` pre-Phase-38) — weekly-planning card grid |
| Tasks | `/portal/tasks`, `/portal/my-tasks`, `/portal/my-items` | `/portal/tasks` redirects → `/portal/my-tasks`. `/portal/my-tasks` = `UnifiedMyTasks.tsx` (Phase 38 — 3 views, shared toolbar). `/portal/my-tasks-legacy` still mounted (retire overdue since 2026-05-02 — removal tracked in WORKPLAN "Codex 5-pass review" T2' DEL). |
| Projects | `/portal/projects`, `/portal/projects/:slug` | — |
| Data | `/portal/manuscripts`, `/portal/deadlines`, `/portal/deadline-cascade`, `/portal/ideas`, `/portal/decisions`, `/portal/grants`, `/portal/publications` | — |
| Meetings | `/portal/meetings`, `/portal/meetings/:id`, `/portal/meeting-prep`, `/portal/meeting-notes` | — |
| Calendar | `/portal/calendar` | — |
| Analytics | `/portal/analytics`, `/portal/pi-analytics`, `/portal/personal` | — |
| Team (portal) | `/portal/team/:slug`, `/portal/team/:slug/trajectory` | Phase 36c — keeps chrome for logged-in users |
| Other | `/portal/settings`, `/portal/search`, `/portal/activity`, `/portal/narratives`, `/portal/sessions`, `/portal/ask`, `/portal/digest`, `/portal/mentee-milestones` | `/portal/pb` retired 2026-06-10 (IA-1) |
| **Public (marketing)** | `/`, `/team`, `/team/:slug`, `/team/:slug/trajectory`, `/nick`, `/nate`, `/publications`, `/publications/:id`, `/network`, `/contact`, `/pulse` | Layout chrome — no auth |
| **Redirects** | `/dashboard`, `/projects/:slug`, ... → `/portal/...` | `<Navigate>` shims; outside `RequireAuth` so bookmarks bounce pre-auth |

**API routes** (`/api/*`) are NOT gated by CF Access. Auth enforced
server-side via X-API-Key + `REQUIRE_AUTH` + JWT verify.

## D1 Tables (76 — sqlite_master, excl. sqlite_/internal; schema v76)

| Table | Rows | Purpose |
|-------|------|---------|
| bug_reports | 0+ | Bug Squasher queue (schema v76, 2026-06-10): status open/resolved/dismissed + resolved_at + context cols; mirrors /api/bug-report GitHub issues. GET /api/bug-reports?status= + POST /api/bug-reports/:id/status (PI/API-key). |
| team_members | 19 | Lab personnel + roles + `email` column (schema v43). Slugs use `preferred_name-last_name` format post Phase 36b. |
| projects | 64 | Research projects with stages + `deleted_at` (schema v45) + indexed `title` (v46). |
| publications | 100+ | PubMed-sourced publications |
| grants | 10+ | Active and pending grants |
| milestones | 30+ | Project milestones + deadlines |
| meetings | 20+ | Biweekly meetings + agendas |
| agenda_items | dynamic | Per-meeting agenda items |
| action_items | 50+ | Legacy action items (pre-task system) |
| project_updates | dynamic | Per-project status updates (FROZEN 2026-06-10 — projection over activity_entries) |
| project_comments | dynamic | Threaded project comments (FROZEN 2026-06-10 — projection over activity_entries) |
| research_digest | 152+ | Weekly paper digests |
| notifications | dynamic | In-app notification feed |
| commitments | dynamic | Team commitments tracker |
| collaboration_network | dynamic | Inter-member collaboration links |
| tasks | 601 | Unified task system (+ key_link_1/2/3 + _desc columns, schema v37; composite index `(completed, due_date, created_at DESC)` v46). |
| ideas | dynamic | Research ideas board with voting |
| activity_entries | dynamic | **v77 unified timeline (2026-06-10)** — ALL task/project human messages + completions/system events; ONE write path `postActivityEntry()` (CLAUDE.md Rule 70) |
| task_comments | FROZEN (0 rows) | direct writes dead 2026-06-10 — old endpoints are projections over activity_entries; physical drop = Phase 2 |
| task_updates | FROZEN (3 rows backfilled) | direct writes dead 2026-06-10 — projections over activity_entries; physical drop = Phase 2 |
| lab_settings | 7 | Key-value settings store (includes `pi_emails` JSON, schema v44) |
| workflow_templates | 3+ | Custom project stage templates |
| email_drafts | dynamic | Email draft status synced from brain.db (schema v37) |
| file_activity_daily | dynamic | Aggregated daily file activity from brain.db (schema v37) |
| daily_plans | RETIRED 2026-06-10 | code path removed (IA-1; plan = tasks.planned_for/plan_slot/plan_rank); table drop pending 24h dogfood (decision: PB `Context/Decisions/2026-06-10-daily-plans-retirement.md`) |
| pomodoro_sessions | dynamic | Focus sessions synced from brain.db |
| daily_reflections | RETIRED 2026-06-10 | retired with daily_plans (1 row; drop pending the same 24h dogfood) |
| dispatch_queue | dynamic | Claude action items from Hub |
| pb_sessions | dynamic | Claude Code session history synced from brain.db |
| inbox | dynamic | Quick Capture entries (FAB + Ctrl+I); synced nightly to PB Inbox/*.md (Phase 32) |

## API Endpoints (231 registered routes via Hono v4.12 — count pinned by the route-contract snapshot test; 239→231 on the 2026-06-10 daily-plan retirement, +1 project activity)

> Route table is `api/index.ts` (Hono declarative). Route handlers live in
> `api/routes/*.ts` and are untouched by the Hono migration. Middleware
> chain: OPTIONS → test-mode swap → API-key → authed-user → PI gate
> (`/api/pb/*` GET) → REQUIRE_AUTH (POST/PUT) → version-bump-on-success.
> Never add routes via `url.pathname === ...` — always use
> `app.get/post('/api/...')`.

### Meta + auth
- GET /api/version — current data version (React Query invalidator)
- GET /api/health — D1 + realtime binding runbook ([docs/OBSERVABILITY.md](docs/OBSERVABILITY.md))
- GET /api/auth/me — `{authenticated, email, name, isPi}` (Phase 36: adds `isPi` + awaits JWT verify)

### Core Data
- GET /api/team, /api/projects, /api/publications, /api/grants
- GET /api/milestones, /api/meetings, /api/digest
- GET /api/notifications, /api/commitments

### Project Operations
- POST /api/projects/:id/comments, /api/projects/:id/updates
- GET /api/projects/health (real 4-factor scoring algorithm)

### Meeting Operations
- POST /api/meetings/:id/agenda, /api/meetings/:id/action-items
- POST /api/meetings/:id/decisions, /api/meetings/:id/notes

### Task System
- GET /api/tasks (7 filters, `include_deleted=1` surfaces soft-deletes for sync)
- POST /api/tasks (accepts `key_link_1/_desc/2/3` + `status`), POST /api/tasks/:id, POST /api/tasks/:id/status
- POST /api/tasks/:id/acknowledge (accepts `body.slug` override for server-side / API-key callers)
- GET /api/tasks/:id/comments, POST /api/tasks/:id/comments — **projection over activity_entries since v77** (shape byte-preserved; writes via postActivityEntry)
- **GET /api/task-comments/recent?since=&since_id=&limit=** — projection; compound (created_at,id) cursor since 2026-06-10 (PB collector adopted)
- GET /api/tasks/:id/updates, POST /api/tasks/:id/updates — projection over activity_entries (kind='update')
- GET /api/tasks/:id/activity — **the unified v77 feed** (all kinds, visibility-gated, newest-first)
- GET /api/projects/:slug/activity — whole-picture project feed (project rows ∪ task rows by project_id)
- POST /api/tasks/sync-bulk (brain.db bulk load)
- blocked_by field for task dependencies

### Ideas Board
- GET /api/ideas, POST /api/ideas, POST /api/ideas/:id, POST /api/ideas/:id/vote

### Decisions (Enhanced Phase 19)
- GET /api/decisions (?tag= filter), POST /api/decisions
- POST /api/decisions/:id/update, POST /api/decisions/:id/outcome
- GET /api/decisions/tags (unique tags with counts)
- GET /api/decisions/similar?context=, GET /api/decisions/similar-by-id?id=

### Trainee Trajectories (Phase 19)
- GET /api/team/:slug/trajectory (publications, projects, tasks, activity, milestones)

### PI Analytics (Phase 19)
- GET /api/analytics/pi-dashboard
- GET /api/analytics/mentee-velocity
- GET /api/analytics/response-time
- GET /api/analytics/team-engagement
- GET /api/team/by-expertise?tag=

### Calendar & Activity
- GET /api/calendar/events, /api/activity/heatmap?slug=&days=

### Search & Settings
- GET /api/search?q=, /api/settings, /api/workflow-templates
- POST /api/settings, /api/workflow-templates

### Notifications
- GET /api/notifications, GET /api/notifications/count
- POST /api/notifications/:id/read, /api/notifications/read-all (stamps `read_at` — Phase 35)

### Questions (Ask the Lab)
- GET /api/questions, GET /api/questions/:id (with nested answers)
- **GET /api/questions/:id/answers** — dedicated list endpoint (Phase 35)
- POST /api/questions, POST /api/questions/:id/answers, POST /api/answers/:id/accept

### Manuscript Revisions
- GET /api/revisions?project_id=, GET /api/revisions/active
- **GET /api/projects/:slug/revisions** — slug-aware convenience alias (Phase 35)
- POST /api/revisions (accepts `project_id` OR `project_slug`, `reviewer_comments` alias for `notes`)
- POST /api/revisions/:id, POST /api/revisions/:id/comments

### Email Drafts (Phase 29)
- GET /api/email-drafts (?status=draft filter), /api/email-drafts/pending
- POST /api/email-drafts/sync-bulk (brain.db push)

### Proactive Brief (Phase 29)
- GET /api/proactive-brief (overdue, due-today, stale projects, milestones, suggested focus, bullets)

### File Activity (Phase 29)
- GET /api/file-activity/heatmap?days=90 (daily aggregates + per-project)
- POST /api/file-activity/sync (brain.db push)

### Quick Capture Inbox (Phase 32)
- POST /api/inbox — insert capture entry (text, tag, project_id, author)
- GET /api/inbox — list entries (?limit=N&unsynced=1)
- POST /api/inbox/sync — mark IDs synced (called by PB pull script)

### IRB / Regulatory (Phase 32)
- GET /api/regulatory/:id/ics — calendar invite (.ics) for IRB renewal deadline

### Meeting Agenda Generation (Phase 32)
- GET /api/meetings/:id/generate-agenda — auto-composes agenda markdown from carried-forward + urgent + stalled + regulatory items

### Daily Digest Cron (Phase 32)
- POST /api/digest-email/daily — daily coordinator digest (code ready; awaits Resend API key)

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/api.ts` | Typed D1 API client |
| `src/hooks/useApiData.ts` | 20+ TanStack Query hooks |
| `src/hooks/useMutations.ts` | 10+ mutation hooks with optimistic updates |
| `src/hooks/useTaskKeyboardShortcuts.ts` | Task-specific shortcuts (J/K/Space/S/X/B/Z/A/Enter/Esc) |
| `src/lib/dateUtils.ts` | Shared date formatters (6 exports) |
| `src/data/team.ts` | Team members + `getPersonInfo()` |
| `src/components/Avatar.tsx` | Photo/initials avatar |
| `src/components/MentionInput.tsx` | @slug autocomplete |
| `src/components/NotificationBell.tsx` | Nav bell + dropdown |
| `src/components/CommandPalette.tsx` | Cmd+K fuzzy search |
| `src/components/GlobalQuickAdd.tsx` | Todoist-style NLP task creation |
| `src/lib/parseQuickAdd.ts` | NLP parser: @person, #project, p1-p3, dates |
| `src/components/tasks/TaskDetailPanel.tsx` | Slide-over detail panel |
| `src/components/tasks/TaskBoardView.tsx` | Drag-drop kanban with swimlanes + column collapse |
| `src/components/tasks/TaskGridView.tsx` | Columnar table with inline editing |
| `src/components/PageHeader.tsx` | Standardized page header |
| `src/components/EmptyState.tsx` | Consistent empty states |
| `src/components/LoadingSkeleton.tsx` | Table/Card/Text skeleton loaders |
| `src/components/InlineAssigneePicker.tsx` | Avatar dropdown for assignee editing |
| `src/components/InlineDatePicker.tsx` | Date editing with overdue detection |
| `src/components/CollapsibleSection.tsx` | Progressive disclosure sections |
| `src/pages/ProjectDetail.tsx` | Project editing, comments, updates |
| `src/pages/portal/Grants.tsx` | SVG Gantt timeline (2023-2033) |
| `src/pages/portal/Personal.tsx` | Personal Hub bento grid |
| `src/pages/portal/AnalyticsPage.tsx` | Lab Analytics |
| `src/pages/TrajectoryPage.tsx` | Trainee development trajectory |
| `src/pages/portal/PIAnalytics.tsx` | Evidence-based PI dashboard |
| `src/pages/portal/DecisionsPage.tsx` | Decision log with replay/tags/outcomes |
| `api/index.ts` | Cloudflare Worker — all endpoints + cron |
| `api/routes/trajectory.ts` | Trajectory API |
| `api/routes/pi-dashboard.ts` | PI analytics API |
| `api/routes/decision-replay.ts` | Similar decisions API |
| `functions/api/[[route]].ts` | Pages Function catch-all |
| `src/components/ScrollToTop.tsx` | Floating scroll-to-top button (all portal pages) |
| `src/components/dashboard/WeeklyProgressCard.tsx` | 7-day completion bar chart with trend |
| `src/components/dashboard/QuickWinsCard.tsx` | Top 4 actionable tasks by urgency score |
| `src/hooks/useAuth.ts` | JWT auth hook (replaces manual parsing) |
| `src/hooks/useFavicon.ts` | Canvas favicon with notification badge overlay |
| `src/hooks/useProjectKeyboardNav.ts` | Project list keyboard nav (J/K/P/Enter) |
| `src/components/PublicationLibrary.tsx` | Horizontal scrolling journal cover cards |
| `src/components/ShortcutHelp.tsx` | Keyboard shortcut reference (?, 6 categories) |
| `src/components/tasks/detail/TaskUpdateFeed.tsx` | Append-only task notes with type badges |
| `src/components/tasks/detail/TaskActivityFeed.tsx` | Merged temporal timeline (notes+comments+system) |
| `src/components/FileUpload.tsx` | R2 file upload with drag-drop |
| `src/components/RichTextEditor.tsx` | Tiptap rich text editor for task descriptions |
| `src/hooks/useRealtimeSync.ts` | WebSocket (DO) + polling + BroadcastChannel sync |
| `src/hooks/useMutations.ts` | Optimistic mutations for tasks/projects/manuscripts |
| `api/routes/uploads.ts` | R2 file upload API |
| `api/lib/email.ts` | Resend email integration (ready, needs API key) |
| `src/components/dashboard/PomodoroStatsCard.tsx` | Focus hours/streak/top project dashboard card (Phase 29) |
| `src/components/dashboard/EmailDraftsCard.tsx` | Pending email draft count + Gmail links (Phase 29) |
| `src/components/dashboard/ProactiveBriefCard.tsx` | Overdue/due-today/focus suggestion intelligence card (Phase 29) |
| `src/components/dashboard/SystemHealthMiniCard.tsx` | Green/amber/red sync health indicator (Phase 29) |
| `src/components/dashboard/FileActivityCard.tsx` | GitHub-style calendar heatmap of file activity (Phase 29) |
| `src/components/QuickCaptureBar.tsx` | Dashboard capture trigger → opens the canonical GlobalQuickAddModal (shortcut `q`; Ctrl+N retired 2026-06-10 — browser-reserved, never fired) |
| `api/routes/email-drafts.ts` | Email draft sync + pending count API (Phase 29) |
| `api/routes/proactive-brief.ts` | Computed intelligence: overdue, stale, focus suggestion (Phase 29) |
| `api/routes/file-activity.ts` | File activity heatmap + sync API (Phase 29) |
| `api/schema-v37.sql` | Key link columns + email_drafts + file_activity_daily tables |
| `api/schema-v41.sql` | team_members `full_name` + `preferred_name` (Phase 35) |
| `api/schema-v42.sql` | projects key_link_1/2/3 + _desc (Phase 35) |
| `api/schema-v43.sql` | team_members.email column + slug-derived backfill (Phase 36) |
| `api/schema-v44.sql` | lab_settings.pi_emails JSON seed (Phase 36) |
| `api/schema-v45.sql` | projects.deleted_at soft-delete column (Phase 36) |
| `api/schema-v46.sql` | 7 missing indexes — activity_log, comments, milestones, task_updates, projects.title, notifications composite, tasks composite (Phase 36c) |
| `scripts/rename-team-slugs.sql` | Phase 36b: 19 team_members slug rename to preferred_name-last_name (~2300 row updates across 30+ tables) |
| `scripts/phase36b-slug-cleanup.sql` | Phase 36c follow-up: 13 leftover slugs + 4 commitments display-name fix |
| `scripts/test-residue-cleanup.sql` | Phase 36c: ~160 test_delete_* rows wiped from 6 tables that lack soft-delete |
| `scripts/fix-nick-email-and-pi-list.sql` | Phase 36b: real UMN address (`ingra107@umn.edu`) replaces wrong guesses |
| `src/components/QuickCaptureInbox.tsx` | Universal Quick Capture FAB + slide-up sheet (455 lines, Phase 32) |
| `src/components/dashboard/LabHealthScore.tsx` | Composite lab health metric card (~205 lines, Phase 32) |
| `src/hooks/useLabHealthSignals.ts` | Health signal aggregation hook (Phase 32) |
| `src/components/MobileTabBar.tsx` | Mobile bottom tab bar (md:hidden, safe-area, Phase 32) |
| `src/components/HeartbeatLine.tsx` | Animated ECG brand motif; live/slow/static variants, configurable BPM (Phase 36d) |
| `src/components/HeartbeatDivider.tsx` | Quiet section-divider wrapper around HeartbeatLine (Phase 36d) |
| `src/components/HermesMark.tsx` | Mercury alchemical glyph for AI assistant; replaces lucide Sparkles (Phase 36d) |
| `src/components/CategoryIcon.tsx` | Lungs/flask/heartbeat/cap glyphs for CLIF/Lab/Nate/Mentee (Phase 36d) |
| `src/components/EmptyStateArt.tsx` | 8 lab-aesthetic line illustrations for empty states (Phase 36d) |
| `src/components/PhaseReleaseBanner.tsx` | Dismissible "what shipped" banner with heartbeat thread (Phase 36d) |
| `src/components/RequireAuth.tsx` | Branded sign-in splash, extracted from App.tsx (Phase 36d) |
| `src/components/pulse/PulseScene.tsx` + `PulseMetric.tsx` + `PulseSparkline.tsx` | Cinematic kiosk primitives (Phase 36d) |
| `functions/og/[type]/[slug].ts` | Per-route SVG share-card generator (project/team/meeting/default, edge-cached 1h, Phase 36d) |
| `public/_headers` | Forces `image/svg+xml` content-type on `/og/*` (Phase 36d) |
| `scripts/claude-design-brief.txt` | Brand brief for Claude Design — tokens, motif SVG path, ethos (Phase 36d) |
| `tests/capture-for-design.spec.ts` + `playwright.config.design-capture.ts` | Full-page screenshots with pre-scroll, 41 hero + 6 mobile surfaces (Phase 36d → round-4) |
| `tests/capture-focus-asks.spec.ts` | Round-specific spot captures (Quick Add, row focus, ▾ density) |
| `tests/capture-scroll-chunks.spec.ts` | 12 long pages × viewport chunks (round-4 addition 2026-04-23) |
| `tests/capture-theme-light.spec.ts` | Light-mode variants via `colorScheme: 'light'` (round-4 addition) |
| `tests/capture-rich-states.spec.ts` | Network WebGL multi-state + 6 modals + pubs carousel + customize (round-4 addition) |
| `tests/capture-interactions.spec.ts` + `playwright.config.interactions-capture.ts` | 15 signature interactions as WebM + PNG keyframes (Phase 36d) |
| `tests/helpers/capture-auth.ts` | Fake `CF_Authorization` JWT cookie injector — bypasses `RequireAuth` splash for captures (round-4) |
| `scripts/regen-design-bundle.sh` | One-shot 7-step Claude Design bundle. `BASE_URL=<preview>` env required post-launch to bypass CF Access. |
| `migrations/inbox-table.sql` | inbox table + idx_inbox_synced + idx_inbox_created indices |
| `scripts/seed-test-data.sql` | 104 rows across 9 tables for DB_TEST seeding |
| `scripts/cleanup-test-data.sql` | FK-ordered DELETE for test_delete_ prefix |
| `tests/test-seed.ts` | globalSetup: seeds DB_TEST via API before Playwright runs |
| `scripts/run-tests.sh` | Test runner (4 modes: quick/ui/sync/all) |
| `scripts/inspection-scanner.py` | Feature scanner (15 patterns, registry cross-ref) |
| `scripts/setup-mnccore-protocol.reg` | Windows registry for mnccore:// protocol handler |
| `scripts/mnccore-handler.bat` | Opens local folders/scripts from Hub links |
| `tests/feature-registry.json` | 353 interactive elements mapped with test coverage |
| `TESTING.md` | Testing guide — suites, runner, conventions |

## Portal Features (80+ shipped)

**Core:** Task System (5 views: Grid/Board/StandUp/Timeline + detail panel + comments + subtasks + bulk actions + peek), Personal Hub, Deadlines, Manuscripts, Ideas Board (voting + sort), Calendar (4 views + keyboard nav), Lab Analytics (velocity + age + workload charts), Activity Feed (person + type filters), Settings (theme preview + reset), AI Meeting Notes, Smart Search (FTS + recent searches), Lab Pulse (kiosk).

**Navigation:** Cmd+K (fuzzy search + task/project counts), Keyboard Shortcuts (G+key + task J/K/S/X/B/Z/A/Space/Enter + project P pin + calendar arrows/T), Focus Mode (F key), Route Progress Bar, Dynamic Favicons (notification badge), ScrollToTop, Ctrl+. theme cycle.

**Task UX (Phase 17+26b+27):** Space bar peek overlay, inline assignee/date/priority editing (with relative date labels + quick presets), hover row actions, completion animation, status color transitions, loading skeletons, progressive disclosure, board swimlanes + column collapse, snooze (+1d/3d/1w/2w), bulk snooze, 5-tab TaskDetailPanel (Overview/Notes/Comments/Activity/Details), prev/next navigation, copy link, task age badge, task notes/updates feed, Tiptap rich text descriptions.

**MyTasks (Phase 26b → superseded by Phase 38 UnifiedMyTasks at `/portal/my-tasks`).** Phase 26b version preserved one-sprint at `/portal/my-tasks-legacy`, retiring 2026-05-02.

**UnifiedMyTasks (Phase 38, 2026-04-25; rebuilt by Bundle H 2026-04-28 audit-wave):** Three views (Columns / Lanes / List) sharing one toolbar — view picker far-left of filter row, persists to `localStorage.mt_view`. Filters: Group / Priority / Project / **Mentee** (researchTeam slugs). QuickViews: All / Today / Overdue / Waiting on / Stale (10d threshold). Bulk bar (real handlers): Plan today / Snooze +1d / Status → / Reassign / Priority / ✓ Complete / Archive — all with inline popover pickers (no native window.prompt). InlineDetail (Card/Lanes) + List view drawer compose `<TaskDetailPanel>` (Bundle H replaced bespoke `TaskDrawer.tsx` with composition — file deleted). Action bar: ▶ Work on this / 📌 Plan today / Snooze / ✓ Complete / Archive (soft-delete via bulkUpdate) / **Move →** (group_override). List view virtualized via `useVirtualizer` (Bundle H MT-04). Inline editing on Status / Priority / Due / Owner / Project (Bundle H MT-05/MT-19). DD-2 saved views via `<SavedViewsMenu>`. List view `j/k/e/x` keyboard nav. FilterChip typeahead at ≥5 options (Bundle H MT-12). Tag glyph + 📍 group_override indicator on rows. Mobile Columns gets visible scrollbar + right-edge fade gradient.

**TodayPage / Today B2 (Phase 38, 2026-04-25):** `/portal/dashboard`. Pill strip (overdue / stalled / planned / meetings / done + Lab Health). Right Now hero (compact, gold glow, ▶ Work + ✓ Done buttons + LinkRow). Auto-promotes longest-overdue task on first load. Timeline with between-N drop zones (drag tasks into gaps between meetings). Five task groups (Deep work / Priorities / Quick / PB / ETL) with planned→active→done sort. TaskDetailDrawer with ▶ Work on this now / 📌 Plan / Unplan / Move → (group_override) + Why callout + subtasks/blocks/Recent updates from `/api/tasks/:id/detail`. Right rail: HermesSuggests (focus + 3 bullets from real signal) / Needs Attention / Projects (with derived nextAction) / Pulse (FOCUS / SYNC / Mentees). SmartCompose for task notes (real @mention + emoji picker + R2 attach via presigned URL).

**Cross-repo group_override (schema v50 / brain.db migration 037, 2026-04-25):** Move → button on Today TaskDetailDrawer or UnifiedMyTasks InlineDetail / List view drawer (TaskDetailPanel composition post-Bundle-H) writes `tasks.group_override` (one of `'deep' | 'priorities' | 'quick' | 'pb' | 'etl' | NULL`). `getGroupForTask()` checks override first. Syncs to brain.db; `generate_today_markdown.py` honors it for next-morning TODAY.md bucketing. 📍 chip indicates the override is set. Decision doc: `Context/Decisions/2026-04-25-tasks-group-override.md` (PB repo).

**Dashboard (Phase 26b → renamed Lab Overview at `/portal/overview` in Phase 38):** Time-of-day greeting, WeeklyProgressCard (7-day chart), QuickWinsCard (top 4 tasks), overdue alert banner, today's progress summary.

**Data (Phase 18):** Blocker flagging (blocked_by + B shortcut), project health (4-factor algorithm + colored bars), dashboard card badges, saved named views.

**Differentiation (Phase 19):** Trainee development trajectories (pub curve + velocity + metrics + heatmap), decision replay (tags + similar search + outcomes + timeline), evidence-based PI dashboard (commitment scorecard + response time + engagement + mentee velocity + copy report + print), expertise tags on profiles.

**Copy/Export:** Copy bibliography (Publications), Copy Reading List (Digest), Copy Summary (MeetingDetail), Copy Report (PIAnalytics, Analytics), Copy as Text (CVPage), Export .ics (Deadlines), Export CSV (Analytics), Print (MeetingPrep, PIAnalytics, CVPage).

**Dynamic Page Titles:** Tasks, MyTasks, Ideas, Decisions, Deadlines, Manuscripts, Projects — show counts/status in browser tab.

**Search Filters Added (Phase 26b):** AskTheLab, SessionHistory, Narratives, MeetingNotes, Decisions (all with inline search input).

**Other:** Quick Capture, GlobalQuickAdd (NLP), Grants SVG Gantt (with days remaining), CV Export (with word count), Density Toggle, Meeting Icebreakers, Reactions, @Mentions, Network stats bar, Team activity dots, Publication year chart.

**Phase 32 Additions:** Universal Quick Capture Inbox (FAB + slide-up sheet + Ctrl+I, every portal page), Lab Health Score (composite Dashboard metric), Mentee Risk Radar (silence detection badges), Mobile bottom tab bar, Page transitions (AnimatePresence 150ms cross-fade), Keyboard chord navigation (g+key), Generate Agenda (MeetingDetail Sparkles button), IRB .ics download, PWA basics (manifest + theme-color + safe-area), CSS a11y frontier (forced-colors/prefers-contrast/prefers-reduced-transparency).

## Phase History (1-32 COMPLETE, 630+ commits)

Phases 1-8: Public website, D1 backend, team portal, sync, API, digest, migration, notifications.
Phase 9: LabSync parity — task system, 10+ portal pages, Cmd+K, keyboard shortcuts.
Phase 10: UX polish — GlobalQuickAdd, focus mode, density toggle, OG meta, dark mode fixes.
Phase 11: Hard features — task peek, subtasks, bulk actions, search ranking, dashboard pinning.
Phase 12: PB Sector v2 — daily planner, dispatch queue, 4 new D1 tables.
Phase 13: Visual polish — TaskDetailPanel custom controls, --border-subtle system.
Phase 14: Design ethos pivot — palette, containers, inline editing, fonts, monospace, colors.
Phase 15: Project detail → tabbed workspace.
Phase 16: Foundation + table overhaul — dark deepening, TaskGridView, columnar tables.
Phase 17: UX interaction layer — PageHeader, keyboard shortcuts, peek, inline editing, board enhancements, skeletons.
Phase 18: Functional depth — blocker flagging, project health, dashboard badges.
Phase 19: Differentiation — trainee trajectories, decision replay, PI dashboard, expertise tags.
Phase 20: HoverCards, context menu, toast system, heatmap, stagger animations, role-based dashboard.
Phase 20.5-20.6: Mobile responsive, portal font fixes.
Phase 21: Visual perfection — spring physics, progressive disclosure, fontFamily purge, loading skeletons.
Post-21: Inline subtasks, meeting NLP, accessibility, dashboard 6-card, meeting dedup.
Phase 22: Design research — transition constants, calculations row, status badge pills, CSS polish.
Phase 23: UX depth — clickable titles everywhere, undo everywhere, TaskDetailPanel on all views, a11y.
Phase 24: Database alignment — brain.db ↔ D1 full sync (537 tasks, field-level LWW).
Phase 25: Academic workflow — virtual scrolling, paper revision tracker, mentee milestones, deadline cascade, IRB tracking.
Phase 26: LabSync UX audit — 14 issues fixed, 4-tab TaskDetailPanel, publication library.
Phase 26b-aq: Feature sprint — 44 commits across all pages. Dashboard cards, MyTasks smart features, snooze, keyboard shortcuts, dynamic titles, search filters, copy/export buttons, theme controls, network stats, calendar nav.
Phase 27: Task notes/updates + activity tab — schema v36, 5-tab TaskDetailPanel, task_updates table.
Phase 28: Next-gen upgrade — optimistic mutations, R2 file uploads, Tiptap rich text, WebSocket real-time (DO), smart polling, Resend email (ready), design polish, InlineSelect portal fix.
Phase 29: Office of Inspection + brain.db features — 546 tests, feature registry, 5 dashboard cards, QuickCaptureBar, key links, 6 sync handlers, schema v37.
Phase 30: Visual QA marathon — true achromatic dark, 222 border token fixes, column resize/reorder, multi-sort, batch ops, DnD, Recharts charts, email digest, project document links.
Phase 31: Token compliance — z-index hierarchy, borderRadius 100%, spacing migration, semantic rgba tokens, ~1,062 total replacements. Avatar size tiers.
Phase 31.5: Expert-driven polish — dashboard compression, typography recession, Personal two-column, Meetings split-panel, TableControls, sidebar 3→3 sections, breadcrumbs, status bar, mobile hamburger, ARIA grid/listbox/combobox, cold start fix (10s→473ms warm).
Phase 32: Final Launch Polish — 7 fix rounds, 9.44/10 aggregate (+2.26), QA GO for April 21. Quick Capture Inbox, Lab Health Score, Mentee Risk Radar, Mobile Tab Bar, page transitions, keyboard chords, IRB .ics, generate agenda, PWA basics, a11y frontier. CLS master fix across 8+ files.

## Implementation Notes

api/index.ts split into 15+ route modules: `api/routes/{tasks,projects,meetings,publications,team,digest,ideas,notifications,search,settings,reactions,calendar,activity,subtasks,trajectory,decisions,decision-replay,pi-dashboard}.ts`.

## API Conventions

Discovered during the 2026-04-17/18 deep-audit. Canonical, non-obvious patterns worth documenting before the next contributor re-learns them the hard way.

### HTTP verbs
- **POST, not PATCH, for updates.** Both `/api/tasks/:id` and `/api/projects/:slug` use `POST` to update. PATCH returns 405. Expressed explicitly in `scripts/deep-audit/harness.ts` via `apiPatchTask()` / `apiPatchProject()` shims.
- **POST `/api/projects/:slug/delete`, not `DELETE /api/projects/:slug`.** The DELETE verb returns 405 here too. Same pattern for other soft-delete endpoints.

### URL param resolution (slug vs id)
- Project URL params accept **either `slug` or `id`** — handlers use `WHERE id = ? OR slug = ?`. Canonical storage is against `projects.id`; the comment+update handlers resolve the URL param first then store using the canonical id. Use `apiGetProjectFromList()` in audits rather than a nonexistent `GET /api/projects/:slug`.
- Task URL params use `id` only (no slug concept on tasks).

### Single-entity GET endpoints
- **`GET /api/tasks/:id` EXISTS** (added post-mechanic-I5; registered after the `/:id/<sub>` routes so Hono matches specifics first). Sub-resources: `/:id/comments`, `/:id/files`, `/:id/updates`, `/:id/activity`, `/:id/subtasks`, `/:id/handoffs`. The deep-audit harness `apiGetTaskFromList()` predates it and still list-filters — fine.
- **There is no `GET /api/projects/:slug`** either — list + sub-resources only.
- **Questions:** answers are embedded inside `GET /api/questions/:id` (as `data.answers[]`). **`GET /api/questions/:id/answers`** also exists as a dedicated list endpoint (Phase 35).

### Enum validation (Hub ↔ brain.db R10 taxonomy)
- `POST /api/projects/:slug` now rejects unknown `status`/`stage`/`category` values with HTTP 400 + list of valid values. Canonical values matched against PB's `scripts/db/enums.py`.
- Task `POST /api/tasks` + `POST /api/tasks/:id` + batch `assign` action validate `assignee` exists in `team_members.slug` (exception: `claude-ai` for Hermes AI pipeline). Unknown slugs → 400.
- `project_id` on task create/update is resolved to canonical form; truly unknown refs are coerced to NULL (task remains, link cleared).

### Write payload shapes — non-obvious fields
- **POST `/api/tasks`** requires `description` + `assignee`. `title` is optional (defaults to description). CreateTaskModal always sends both so UI users don't notice.
- **POST `/api/tasks/:id/comments`** takes `{ content, author_slug? }`. `source_id` in resulting notifications references the **task id** (not the comment row id) — link is `/tasks?open=${taskId}` so clicking lands on the correct task.
- **POST `/api/questions/:id/answers`** takes `{ content, author_slug? }`. Body field is `content`, not `answer`.
- **POST `/api/revisions`** takes `{ project_id | project_slug, round?, submitted_at?, response_due?, status?, journal?, notes | reviewer_comments? }`. Accepts either id or slug; `reviewer_comments` is an alias for `notes`. Convenience GET: `/api/projects/:slug/revisions`.
- **POST `/api/tasks/:id/handoffs`** uses SBAR format: `{ to_slug, situation, background?, assessment?, recommendation? }`. `situation` is required.
- **POST `/api/digest/:id/status`** toggles save/dismiss. Not `POST /api/digest/:id` directly.

### Read-only on the Hub
- Grants — no POST. Grants flow in via `scripts/db/sync_d1_*.py` from brain.db. Hub only updates status via `POST /api/grants/:id`.
- Publications — read-only. Sourced from PubMed.
- Milestones — writable, but typically authored via the grant timeline UI which uses a dedicated endpoint set.

### Mutation → client update flow
1. Mutation hits the API via wrapped handler `withVersionBump`.
2. `withVersionBump` runs `bumpVersion(env.DB)` + `notifyClients(env, 'data')` on any 2xx response from a non-GET.
3. `notifyClients` tries to `fetch()` the NOTIFICATION_HUB durable object. **Currently no-op** because wrangler.toml lacks the service binding — tracked as follow-up.
4. All clients poll `/api/version` every 15s (`useRealtimeSync`, `refetchIntervalInBackground: true`). On version change → `invalidateQueries` on all non-`_version` keys → React Query refetches active queries → UI updates.
5. `BroadcastChannel('mnccore-sync')` + `notifyLocalTabs()` provide instant same-device cross-tab sync for locally-initiated mutations.

### Notification schema (2026-04-18)
- `source_id` points at the entity the user cares about (task id / project id), **not** the comment/note row id.
- `link` is a deep-link to that entity — e.g. `/tasks?open=<taskId>` opens the detail panel directly, not a generic list.
- `read` is an int (0/1), not a timestamp. Mark-read endpoint: `POST /api/notifications/:id/read`.

### Deep-audit harness
`scripts/deep-audit/` holds lifecycle audits (create → update-every-field → readback → UI reload verify → delete → cleanup). Eleven suites cover the surface. Run individually: `npx tsx scripts/deep-audit/01-task-lifecycle.ts` etc. Shared helpers in `harness.ts`. See `Projects/mn-ccore-lab-hub/plans/april-21-launch-readiness.md` for the suite catalog + findings history.

Suites:
- `01-task-lifecycle.ts` — create via API, edit every field, status flow, key_links, delete
- `02-project-lifecycle.ts` — create, edit, enum guards, key_links, comment, delete
- `03-content-entities.ts` — meetings, grants, questions, revisions, digest
- `04-mentions-notifications.ts` — @mention fan-out, deep-links, notification source_id
- `05-subtasks-handoffs.ts` — subtask CRUD + order, SBAR handoff, acknowledge
- `06-sync-pipeline.ts` — Hub ↔ brain.db round-trip via PB's `scripts/db/sync/` module (`python scripts/db/sync.py pull/push` — replaced legacy `sync_d1_pull/push` 2026-04-21)
- `07-realtime-multitab.ts` — WebSocket broadcast + 15s polling cross-tab verification
- `08-overlap-traps.ts` — duplicate slugs, dangling refs, orphan cleanup, enum validation
- `10-misc-surfaces.ts` — reactions, search, ideas vote, activity, stats, key_links
- `11-extended-surfaces.ts` — team/settings/narratives/inbox/cascade/pomodoro/dispatch/trajectory/PI/publications/conferences/sessions/bug-report

### Response-shape quirks worth knowing
A few endpoints break the `{ data: ... }` convention. Noted here so client code doesn't assume:
- `POST /api/inbox` returns the inserted record **directly** (not wrapped). `GET /api/inbox` returns `{ data: [...] }` wrapped. Asymmetric.
- `GET /api/search` returns `{ data: [...] }` flat array (not `{ data: { results: [...] } }`).
- `POST /api/inbox` tags are whitelisted: `note | idea | decision | follow-up | meeting-note` — anything else → 400.
- `POST /api/questions/:id/answers` body field is `content`, not `answer`.
- Questions list answers inside `GET /api/questions/:id` (as `data.answers[]`) — no dedicated `/answers` GET.
- `POST /api/tasks/:id/handoffs` uses SBAR shape: `{ to_slug, situation, background?, assessment?, recommendation? }`. `situation` is required.
- `POST /api/digest/:id/status` (not `/api/digest/:id`) toggles save/dismiss.
- `/api/team-members` does **not** exist — use `/api/team`.
- `/api/calendar` does **not** exist — use `/api/calendar/events`.
- `/api/pomodoro` does **not** exist; `/api/pb/pomodoro/start`+`/complete` were RETIRED 2026-06-10 (Daily Plan substrate — their only caller was the PBSector timer). Pomodoro telemetry still flows via `POST /api/pb/sessions`/`/bulk` (PB push) + `GET /api/pb/sessions/stats` (TodayPage reads).
- `/api/dispatch` does **not** exist — use `/api/pb/dispatch/pending` + `/api/pb/dispatch/add` + `/complete`.
- `/api/sessions` does **not** exist — use `/api/pb/sessions`.
- `/api/grants` is **read + status only**. POST /api/grants does not exist; grants flow in via brain.db sync.

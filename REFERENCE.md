# MN-CCORE Lab Hub — Reference Guide

Detailed tables, API endpoints, key files, and feature inventory.
Moved from CLAUDE.md to reduce session context load. Read on demand.

## D1 Tables (59 — schema v37 + inbox)

| Table | Rows | Purpose |
|-------|------|---------|
| team_members | 12 | Lab personnel + roles |
| projects | 25+ | Research projects with stages |
| publications | 100+ | PubMed-sourced publications |
| grants | 10+ | Active and pending grants |
| milestones | 30+ | Project milestones + deadlines |
| meetings | 20+ | Biweekly meetings + agendas |
| agenda_items | dynamic | Per-meeting agenda items |
| action_items | 50+ | Legacy action items (pre-task system) |
| project_updates | dynamic | Per-project status updates |
| project_comments | dynamic | Threaded project comments |
| research_digest | 152+ | Weekly paper digests |
| notifications | dynamic | In-app notification feed |
| commitments | dynamic | Team commitments tracker |
| collaboration_network | dynamic | Inter-member collaboration links |
| tasks | 546+ | Unified task system (+ key_link_1/2/3 + _desc columns, schema v37) |
| ideas | dynamic | Research ideas board with voting |
| task_comments | dynamic | Per-task discussion threads |
| task_updates | dynamic | Per-task notes/progress entries (schema v36) |
| lab_settings | 6 | Key-value settings store |
| workflow_templates | 3+ | Custom project stage templates |
| email_drafts | dynamic | Email draft status synced from brain.db (schema v37) |
| file_activity_daily | dynamic | Aggregated daily file activity from brain.db (schema v37) |
| daily_plans | dynamic | PB Sector daily plans (star/focus/quick/evening tasks) |
| pomodoro_sessions | dynamic | Focus sessions synced from brain.db |
| daily_reflections | dynamic | End-of-day reflections |
| dispatch_queue | dynamic | Claude action items from Hub |
| pb_sessions | dynamic | Claude Code session history synced from brain.db |
| inbox | dynamic | Quick Capture entries (FAB + Ctrl+I); synced nightly to PB Inbox/*.md (Phase 32) |

## API Endpoints (180+)

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
- GET /api/tasks (7 filters), POST /api/tasks, POST /api/tasks/:id, POST /api/tasks/:id/status
- GET /api/tasks/:id/comments, POST /api/tasks/:id/comments
- GET /api/tasks/:id/updates, POST /api/tasks/:id/updates (notes/progress entries)
- GET /api/tasks/:id/activity
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
- POST /api/notifications/:id/read, /api/notifications/read-all

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
| `src/components/tasks/TaskPeekOverlay.tsx` | Space bar peek panel (Linear-style) |
| `src/components/tasks/TaskGridView.tsx` | Columnar table with inline editing |
| `src/components/PageHeader.tsx` | Standardized page header |
| `src/components/EmptyState.tsx` | Consistent empty states |
| `src/components/LoadingSkeleton.tsx` | Table/Card/Text skeleton loaders |
| `src/components/InlineAssigneePicker.tsx` | Avatar dropdown for assignee editing |
| `src/components/InlineDatePicker.tsx` | Date editing with overdue detection |
| `src/components/CollapsibleSection.tsx` | Progressive disclosure sections |
| `src/pages/ProjectDetail.tsx` | Project editing, comments, updates |
| `src/pages/Grants.tsx` | SVG Gantt timeline (2023-2033) |
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
| `src/components/QuickCaptureBar.tsx` | Dashboard top input, Ctrl+N, idea: prefix parsing (Phase 29) |
| `api/routes/email-drafts.ts` | Email draft sync + pending count API (Phase 29) |
| `api/routes/proactive-brief.ts` | Computed intelligence: overdue, stale, focus suggestion (Phase 29) |
| `api/routes/file-activity.ts` | File activity heatmap + sync API (Phase 29) |
| `api/schema-v37.sql` | Key link columns + email_drafts + file_activity_daily tables |
| `src/components/QuickCaptureInbox.tsx` | Universal Quick Capture FAB + slide-up sheet (455 lines, Phase 32) |
| `src/components/dashboard/LabHealthScore.tsx` | Composite lab health metric card (~205 lines, Phase 32) |
| `src/hooks/useLabHealthSignals.ts` | Health signal aggregation hook (Phase 32) |
| `src/components/MobileTabBar.tsx` | Mobile bottom tab bar (md:hidden, safe-area, Phase 32) |
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

**MyTasks (Phase 26b):** QuickFilter pills (Today/This Week/Overdue/No Date), Focus Next smart scoring (urgency×priority×freshness), completion streak counter, status distribution bar, StandUp view.

**Dashboard (Phase 26b):** Time-of-day greeting, WeeklyProgressCard (7-day chart), QuickWinsCard (top 4 tasks), overdue alert banner, today's progress summary.

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

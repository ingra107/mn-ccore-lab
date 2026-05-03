# CLAUDE.md History — Archived 2026-05-03

These sections were moved out of `CLAUDE.md` per the codeburn-driven token diet (2026-05-03 baseline = $9K/30d, 98% Opus, Hub session avg $75-99). The Hub CLAUDE.md was 979 lines / ~116KB and auto-loaded into every Hub session — these historical sections are still useful reference but no longer load-bearing for fresh work.

Original location: `mn-ccore-lab/CLAUDE.md`. Restored to history-only via `git log --follow`.

---

## Component Coverage (verified 2026-04-15 Everything Sprint v2)

**Re-verified via Playwright runtime + source audit (2026-04-15).** Journey B's 2026-04-13 "false claim" warning was incorrect — all rows are TRUE. N-key works on both Ideas + Decisions (`DecisionsPage.tsx:834`). Copy bibliography works on Publications (`Publications.tsx:234`). Only stale item was CVPage (removed — page was deleted per `project_hub-cv-removed.md`).

| Component | Coverage | NOT Used On |
|-----------|----------|-------------|
| LoadingSkeleton | ALL 19 portal pages | -- |
| EmptyState | 15 pages (Tasks, MyTasks, Deadlines, Decisions, Ideas, Activity, Calendar, Search, Grants, MeetingNotes, Narratives, AskTheLab, Manuscripts, Digest, Settings) | Analytics, PBSector, Personal, PIAnalytics |
| PageHeader | 17 of 19 portal pages (all with aria-live on count/subtitle) | PBSector (custom PlannerHeader) |
| J/K keyboard nav | 11 pages (Tasks, Projects, Meetings, Ideas, Decisions, Deadlines, Manuscripts, Grants, Search, MeetingNotes, Narratives) | Calendar (arrow keys), Analytics, Settings |
| HoverCard | 8 surfaces (TaskDetail, TaskPeek, MeetingDetail, AssigneePicker, ProjectHealth, MenteeDashboard, Projects list, Activity) | Team (cards already detailed) |
| UndoToast | ALL task surfaces (TaskGridView, StandUp, Timeline, Board, Detail, Tasks, MyTasks, Personal, Deadlines, Dashboard ActionBoard, MeetingDetail, ProjectDetail, MyItems, Meetings) + Ideas, Manuscripts, Decisions, Grants (R10) | Settings (uses saved indicator) |
| Stagger animations | 12 pages (Projects, Personal, Ideas, Decisions, Deadlines, Meetings, MeetingPrep, MeetingNotes, Search, Calendar, Analytics, PIAnalytics, Settings) | -- |
| InlineSelect | Tasks (grid), Projects (list+detail), Manuscripts, Ideas, Decisions, Deadlines, **Grants (R10 — status only)** | Grants (title / dates / agency / PI still not inline) |
| Focus trapping | ALL 6 modals (CreateTask, CreateProject, CreateIdea, CreateQuestion, CreateDecision, TranscriptModal) | -- |
| Escape key close | ALL 6 modals + CommandPalette + GlobalQuickAdd + ShortcutHelp | -- |
| Dynamic page title | 7 pages (Tasks, MyTasks, Ideas, Decisions, Deadlines, Manuscripts, Projects) | Other portal pages use static usePageMeta |
| Search/filter input | 8 pages (Tasks, AskTheLab, SessionHistory, Narratives, MeetingNotes, Decisions, Search, Digest) | -- |
| N-key create | Ideas, Decisions | Tasks uses C key |
| Copy to clipboard | PIAnalytics, Publications, Digest, MeetingDetail, AnalyticsPage | -- |
| ScrollToTop | All portal pages (via PortalLayout) | Public pages |
| Draggable + resizable grid cards | Dashboard (R9-9 via react-grid-layout v1.5.3, drag handle + SE resize, per-user localStorage) | -- |


---

## Everything Sprint v2 (2026-04-15) — R11/R12 + Miniflare

Single-day sprint closing R11 interaction gaps + R12 mobile + replacing X-Test-Mode with Miniflare local test harness + prod dogfood seeding.

**R11 fixes shipped:**
- R11-4 Deadlines: `InlineDatePicker` on due_date cells (task rows; milestones stay read-only)
- R11-5 Manuscripts: `InlineSelect` on PI + Category cells (Avatar preserved as sibling for visual parity)
- R11-6 Ideas: `expandedId` + inline detail panel (DecisionsPage already had the pattern; Ideas now matches)
- R11-8 Grants: `expandedId` + inline detail panel (rows were inert — no Link nav, no onClick, fixed with role=button + Enter/Space keyboard open)

**R12 mobile fixes shipped:**
- R12-H3 typography floor 10→11px via `@media (max-width: 767px)` on `--text-micro`/`--text-caption` + utility-class override
- R12-H4 Calendar prev/next: raised to 44×44 hit target (were 30×44 — width gap caught by Playwright runtime, source audit had missed the existence entirely)
- R12-H2 Dashboard grip + Customize pin button: raised to 44×44
- R12-H2 MyTasks focus-row pin button: raised to 44×44
- R12-H5 MobileTabBar: added "More" overflow drawer exposing 18 portal routes grouped Work/Research/Lab

**Phase 0 prod seed**: ~90 `test_delete_*` rows across 13 tables via `scripts/seed/phase0-seed.ts` (API path) + `scripts/seed/phase0-direct-sql.ts` (grants/milestones/manuscript_revisions/research_digest). Cleanup SQL at `scripts/seed/phase0-cleanup.sql`, verifier at `scripts/seed/phase0-verify.ts` — both gate deploy.

**Phase 3 Miniflare harness**: Replaces `X-Test-Mode` header with local workerd + local D1 + `tests/local/data-validation.spec.ts` + schema-drift CI. Shipped on `miniflare/local-test-infra` branch by a parallel subagent, merged into main for Phase 4. See `TESTING.md` for the local-first flow.

**Plan corrections discovered during audit** (for future reference):
- R11-6 "model after DecisionsPage" — correct. DecisionsPage.tsx already has the pattern; source audit searched wrong filename (`Decisions.tsx` doesn't exist).
- R12-H4 Calendar buttons — EXISTED at CalendarPage.tsx:153-165, not missing. Real gap was size, not existence.
- CLAUDE.md "false claims" — both `N-key on Decisions` and `Copy bibliography on Publications` are actually TRUE features. Only stale item was `CVPage` reference (removed earlier).
- R11-8 Grants — rows were inert, not `<Link>` navigators. Bug was worse than the plan said.


---

## Next Session Playbook — April 21 Launch Readiness

**Living plan:** `Projects/mn-ccore-lab-hub/plans/april-21-launch-readiness.md` (PB repo) — the single checklist for everything remaining. Each session checks off items + adds new todos discovered during work.

**2 sessions remaining:**
1. ~~**Session 1 (Apr 16-17):** Miniflare interactions audit~~ DONE (2026-04-16 overnight). 6 journey specs green. R13 Digest comments shipped. Hermes polling reduced 20s->60s. Deployed at `bc51305`.
2. **Session 2 (Apr 18-19):** Prod data population + full pipeline validation — seed real data, watch sync chain flow through brain.db -> Airtable -> mobile. Verify the whole system works.
3. **Session 3 (Apr 20 Mon):** MNCCORE agenda prep + final polish + last deploy.

**Nick must do (CF dashboard):** CF Access @umn.edu, RESEND_API_KEY, GitHub secrets. Checklist in the living plan.

**System state (2026-04-17 evening):** Hub deployed at `b9644c75`. D1 schema v42 applied (projects.key_link_1/_desc..._3/_desc added). Schema v41 applied earlier (team_members.full_name + preferred_name). Dogfood 14/14 page health, 0 console errors. Workers Paid. Audit framework live (see below). Hermes polling 60s.


---

## Audit Infrastructure (2026-04-17)

**Canonical interaction audit.** Every interaction the Hub must support is
enumerated in `Projects/mn-ccore-lab-hub/HUB-AUDIT-CHECKLIST.md` (PB repo).
The audit script `scripts/hub-audit.ts` mirrors that checklist — each section
exercises real user actions (click, type, select) with `test_delete_` prefixed
content, screenshots every state, asserts inline updates without page reload,
and cleans up via API at the end.

**Usage:**
```bash
npx tsx scripts/hub-audit.ts                    # full run (14 sections, ~8 min)
npx tsx scripts/hub-audit.ts --section=tasks    # single section
npx tsx scripts/hub-audit.ts --cleanup          # delete test_delete_* rows
npx tsx scripts/hub-audit.ts --list             # list sections
```

**Output:** `review/audit/YYYYMMDDTHHMM/` per run — per-section screenshots +
findings.md with PASS/FAIL/FRICTION/INFO tagging.

**Trajectory (7 runs, 2 days):** 40% pass → 75% → 90% → 95% → 30+ asserted
flows → UX bug found + fixed → key_link editor shipped. Four real product bugs
fixed through the audit: Decisions Ctrl+Enter stale-closure (`76b1c15`),
InlineCellSelect scroll-close race (`3901300`), InlineAssigneePicker missing
ARIA (`9abd563`), sync_d1_push reading wrong task_key_link column (PB commit
`aaaaecdc`).

**Next-steps roadmap** (Tiers A-E with scope + time estimates) is maintained in
the checklist's "Next-steps roadmap" section. A session opening this cold can
pick any tier and ship it.


---

## Test Results (2026-04-15, post-Everything Sprint v2)

**213+ inspection passed, 0 failed, 1 skipped. All 14 pages load with 0 console errors.**

| Suite | Config | Status |
|-------|--------|--------|
| inspection.spec.ts | playwright.config.prod.ts | 213+ passed (post-sprint, all 6 regressions fixed) |
| data-validation.spec.ts | playwright.config.local.ts (Miniflare) | 5/5 passed |
| dogfood-phase0.spec.ts | playwright.config.dogfood.ts | 14/14 page health, 0 console errors |

**Testing infrastructure:** Miniflare local harness replaces X-Test-Mode (which routed to empty DB_TEST). `npm run test:local` boots wrangler dev + runs local specs. `npm run test:prod` runs smoke + inspection against prod. See `TESTING.md`.

### Known Issues
| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 1 | ~~Project slugs with parentheses break routing~~ | RESOLVED 2026-04-19 | D1 has 0 paren slugs; `POST /api/projects` sanitizes on create. |
| 2 | Subtasks, ideas, decisions are Hub-only | BY DESIGN | No brain.db sync needed |

### Sync Pipeline Field Coverage (all bidirectional)
| Field | brain.db | D1 | Push | Pull |
|-------|----------|-----|------|------|
| Title | `name` | `title` | yes | yes |
| Notes | `notes` | `description` | yes | yes (create) |
| Due date | `due_date` | `due_date` | yes | yes |
| Status | `status`+`completed` | `status`+`completed` | yes (smart null) | yes |
| Priority | `priority` | `priority` | yes (priority > effort > null) | yes |
| Assignee | `assignee` | `assignee` | yes | yes |
| Key links | `task_key_link_*` | `key_link_*` | yes | yes |
| Project | `project_id` (recXXX) | `project_id` (slug) | yes (slug map) | yes (reverse map) |

### D1 Schema Versions Applied
v1-v16 (original), v18 (handoffs), v21 (decision_log, project_dependencies, task_subtasks), v22 (lab_questions/answers column renames)


---


## Roadmap — Completed Phases 14-36 (archived 2026-05-03)

Original location: `mn-ccore-lab/CLAUDE.md` Roadmap section. Pulled out of always-loaded context per token diet. Each phase has full detail in `CHANGELOG.md` and git log.

**Phase 15: COMPLETE** (1 commit). Project detail → tabbed workspace.

**Phase 16: COMPLETE** (10 commits). LabSync parity push — foundation + tables:
- Dark bg deepened #0b1017, text softened #e2e8f0, body weight 400
- TaskGridView: columnar table (Title|Assignee|Due|Status|Priority) with inline editing
- Deadlines + Ideas: converted to columnar tables
- SectionHeader, ToggleButton, MetricCard, BentoCard: lighter weights
- Undo toast system, workload visibility, task click bug fix
- CLAUDE.md: 9 design principles from LabSync + UX research

**Phase 20: COMPLETE** (12 commits + simplify). UX polish & interaction:
- HoverCard: preview cards on hover (project/member/task), wired to 6 surfaces
- TaskContextMenu: right-click for quick actions with submenus
- Toast system: success confirmations for 8 key mutations + timeout cleanup
- ActivityHeatmap on MemberPage, stagger animations (Dashboard + Projects)
- J/K keyboard nav on Projects page, role-based dashboard views (PI/Fellow/Coordinator)
- Design ethos enforcement: heading weights fixed across 57 files
- Simplify: shared constants (lib/taskConstants.ts, lib/animations.ts), memoized Personal.tsx

**Phase 20.5: Mobile Responsive** (1 commit from home laptop, d65d71c):
- Stacked card layout on mobile, columnar grid on desktop (Projects, Manuscripts, Deadlines, Ideas)
- InlineSelect larger touch targets, global CSS 36px min touch targets

**Phase 20.6: Quick Fixes** (2026-04-03):
- Fixed: Portal h1 fonts changed from Fraunces to DM Sans (Dashboard, Projects)
- Fixed: Duplicate action item empty states on Meetings page

**Phase 21: COMPLETE** (13 commits + expert playbook). Visual perfection:
- Blocks 0-5: Spring physics, progressive disclosure (F key), column sort, empty states, transition constants, welcome banner, meeting prep view
- Tier 1.5: TaskDetailPanel split, Sidebar perf, dynamic import cleanup, fontFamily purge (1107 across 131 files), loading skeletons (9 pages), taskConfig consolidation, inline editing expansion, undo toast expansion, J/K nav (5 pages), HoverCards (6 surfaces), stagger animations (4 pages)
- Hardcoded white audit: confirmed correct (white-on-accent), no changes needed

**Post-Phase 21: Showcase Features** (2026-04-04, 5 deploys):
- **Inline subtask expand/collapse** (81da23b): Linear-style chevrons on TaskGridView. AnimatePresence expand with progress bar, inline toggle, add input. Keyboard: → expand, ← collapse (directional, not toggle). Auto-focus input on expand.
- **Meeting NLP action items** (ce04ebf): Inline quick-add on MeetingDetail. Type `@nick Review draft p2 Friday` → parses assignee, priority, due date, project via `parseQuickAddInput`. Token preview chips. Creates task linked to meeting with `meeting_id`. Invalidates meeting query for instant refresh.
- **Accessibility** (be80679): CommandPalette focus trapping + aria-modal. CreateTaskModal focus trapping + aria-modal. UndoToast `role="status"` + `aria-live="polite"`. ShortcutHelp spring animation + aria-modal.
- **Dashboard 6-card default** (b502053): Default role showed 2 cards (upcoming+stats). Now shows 6 (action-board, upcoming, project-health, pipeline, activity, stats). localStorage version key resets stale preferences.
- **Meeting dedup** (6a1fd06): API dedup by date+title before INSERT. UNIQUE index on meetings(date, title). Cleaned 123 duplicates from D1 (139→16).

**Phase 23: COMPLETE** (14 commits, 2026-04-06). UX depth + a11y + undo-everywhere sprint:
- **Clickable task titles everywhere**: clicking title opens TaskDetailPanel on Tasks, MyTasks, Personal, Deadlines, ProjectDetail
- **Undo on EVERY status change**: TaskGridView, TaskStandUpView, TaskDetailPanel, Tasks, MyTasks, Personal, Deadlines, Dashboard ActionBoard, MeetingDetail, ProjectDetail, MyItems, Meetings
- **TaskDetailPanel wired to all views**: Grid, Board, StandUp, Timeline views on both Tasks and MyTasks pages, plus Personal, Deadlines, ProjectDetail
- Hover actions moved to own grid column (no longer overlaps priority)
- Project notes system: Notes section reads from project_updates table (timestamped, auto-author)
- Deadlines: InlineSelect for task status, clickable task titles, TaskDetailPanel
- Focus trapping + Escape key on all 6 modals
- J/K keyboard nav on 5 more pages (Grants, Search, MeetingNotes, Narratives + Enter on Search)
- Stagger animations on Analytics, PIAnalytics, Settings
- EmptyState on Settings workflow templates
- PageHeader: aria-live on count/subtitle for screen readers
- Success toasts on task creation, idea capture, answer submission
- Removed 366 redundant fontFamily declarations across 77 files
- TaskStandUpView: separated status circle from title click with undo
- TaskTimelineView: bar click opens detail panel instead of cycling status

**Phase 24: COMPLETE** (database alignment, 2026-04-06). brain.db ↔ D1 full sync:
- **Phase A** (bulk load): 537 brain.db tasks → D1 via `POST /api/tasks/sync-bulk`. `scripts/sync-brain-tasks.ts` with `--api`/`--sql` modes. recXXX IDs preserved. `assignee` column added to brain.db.
- **Phase B** (ongoing sync): schema-v22 (`updated_at` + `deleted_at`), all 5 write paths set `updated_at`, batch delete → soft-delete, `updated_since` delta filter. `sync_d1_push.py` and `sync_d1_pull.py` rewritten for field-level LWW from main tasks table. `crdt.py` monotonic constraint relaxed for task reopening.
- **Sync flow:** `/process` runs push+pull. Scheduled 2:35 AM push, 2:40 AM pull. Delta sync via `updated_at` timestamps.
- **Admin endpoint:** `POST /api/admin/migrate` for schema changes without wrangler D1 access.

**Phase 25: COMPLETE** (2026-04-06). Showcase + academic workflow features:
- Virtual scrolling on TaskGridView (@tanstack/react-virtual) — 537 tasks performant
- AI autofill on CreateTaskModal — heuristic project/priority/assignee suggestions
- **Paper Revision Tracker** (schema-v23): per-round reviewer comments, progress bars, ProjectDetail tab
- **Mentee Milestone Dashboard** (schema-v24): /mentee-milestones page, MemberPage integration, PI overview
- **Deadline Cascade View** (schema-v25): dependency graph, impact simulation, /deadline-cascade page
- **Paper Submission Lifecycle** (schema-v26): submission events timeline, active submissions widget
- **IRB/Regulatory Tracking** (schema-v27): regulatory items, expiration alerts on Personal page

**Phase 26: COMPLETE** (2 commits, 2026-04-07). UX audit from LabSync comparison — 14 issues:
- Dark mode sidebar logo fix (filter + dark SVG variant)
- Remove "Join" nav tab, rethink hero pathway cards (Collaborate→/network, Meet Our Team→/team)
- Default task sort changed from priority → due_date (TaskGridView + MyTasks)
- MyTasks: showCompleted toggle, useAuth() hook (replaces manual JWT parsing)
- --muted opacity raised 0.4→0.55, dark mode contrast audit across 22 files
- Sidebar compactness: py-2, 12px font, tighter group gaps
- Task click fix in MyTasks grouped view (virtualizer minHeight)
- Projects: PI + Group columns inline-editable (InlineSelect), sortable column headers
- Projects: stage group headers only show when sorted by stage
- All Tasks: "My Tasks" filter toggle
- **TaskDetailPanel**: restructured to 4-tab layout (Overview/Details/Files/Comments)
- **Link Paper to Project**: search modal on ProjectLiterature with publication picker
- **Publication Library View**: horizontal scrolling journal cover cards (scroll-snap)

**Phase 26b-aq: COMPLETE** (44 commits, 2026-04-07/08). Massive feature sprint across all pages:

*Interaction & Keyboard:*
- Keyboard shortcuts: Z (snooze +1d), A (assign), P (pin project), N (new idea/decision), T (calendar today), arrow keys (calendar nav)
- Task context menu: snooze submenu (+1d/+3d/+1w/+2w), open in new tab
- Bulk action toolbar: snooze button (+1 day)
- InlineDatePicker: relative labels ("2d ago", "in 3d"), quick presets (Today/Tomorrow/Next Mon/+1 Week/Clear)
- Command palette: task/project counts in footer, Due Today quick filter, Log Decision action
- ShortcutHelp: updated with all new shortcuts (P pin, calendar section, N decisions)
- N key opens create modal on Ideas + Decisions pages

*Dashboard & Personal:*
- Time-of-day greeting, today's progress summary
- WeeklyProgressCard: 7-day bar chart with trend indicator
- QuickWinsCard: top 4 actionable tasks scored by urgency
- Overdue alert banner on Dashboard
- CURRENT_DEFAULTS_VERSION bumped to 4 (6 default cards)
- Personal: quick actions row, priority distribution bar, weekly completion count

*Task System:*
- MyTasks: QuickFilter pills (Today/This Week/Overdue/No Date), Focus Next smart scoring, completion streak counter, status distribution bar, StandUp view, prev/next in detail panel
- TaskDetailPanel: copy link button, task age badge, source/recurrence chips, prev/next navigation (Alt+Up/Down)
- TaskGridView: calculations row shows completion percentage
- Dynamic page titles on Tasks, MyTasks, Ideas, Decisions, Deadlines, Manuscripts, Projects

*Data Pages:*
- Projects: task count badges, "Needs Attention" filter (health < 50), dynamic title
- Manuscripts: category filter (CLIF/Lab/Mesfin/Mentee), sortable columns, stage progress dots, dynamic title
- Ideas: sort toggle (Newest/Most Voted/A-Z), vote bounce animation, N-key create
- Decisions: search filter, N-key create, dynamic title
- Deadlines: urgent countdown banner, Export to .ics, dynamic title
- Grants: days remaining on progress bars, maroon when >80% elapsed

*Analytics & PI:*
- AnalyticsPage: 8-week task velocity chart, task age histogram, workload per person, lab health summary, Copy Report button
- PIAnalytics: Copy Report + Print buttons

*Activity & Search:*
- ActivityPage: person filter dropdown, "Most active: X" in subtitle
- SearchPage: recent searches (localStorage, max 5, click to re-search, clear all)
- SessionHistory: search filter on summaries

*Meetings & Digest:*
- Meetings: action item completion rate in subtitle
- MeetingDetail: Copy Summary button (markdown to clipboard)
- MeetingPrep: Print button, meeting countdown badge
- MeetingNotes: search filter, 20 results
- Digest: reading progress bar, Copy Reading List export

*Publications & Network:*
- Publications: year distribution mini-chart (clickable), Copy bibliography button
- Network: stats bar (author count, connections, avg, hub node)

*Team & Member:*
- Team: member count + active-this-week count, green activity dots on directors
- CVPage: Copy as Text button, word count badge

*Settings & Infrastructure:*
- Settings: theme preview cards (light/dark), Reset Dashboard + Clear Searches buttons
- Narratives: search filter on arc titles/projects/topics
- ScrollToTop: floating button on all portal pages
- Favicon: notification badge overlay (red circle with count)
- Sidebar: next meeting countdown hint
- CalendarPage: keyboard arrow nav, T for today
- Print CSS: enhanced @media print rules
- Ctrl+. theme cycle on PortalLayout

*Pending:* ~~Schema v35 migration (recurrence + recurrence_parent_id) — planned but not yet needed. No code depends on it.~~ **Removed 2026-04-21** during schema-drift reconciliation — migration file deleted from repo since it was never applied to prod and no code depended on it.

**Phase 27: COMPLETE** (4 commits, 2026-04-08). Task notes/updates + activity tab:
- **Schema v36**: `task_updates` table (mirrors `project_updates` pattern) with task_id, author_slug, content, update_type, created_at
- **TaskUpdateFeed**: append-only notes with type badges (progress/blocker/result/question/session), textarea input, reactions
- **TaskActivityFeed**: merged temporal timeline of notes + comments + system events with visual delineation (teal=notes, gold=comments, dot=system)
- **TaskDetailPanel restructured** to 5 tabs: Overview | Notes | Comments | Activity | Details
- Files tab merged into Details as CollapsibleSection
- Status click bug fixed: guard against clicking already-active status pill
- API: GET/POST /api/tasks/:id/updates with @mention notifications and activity logging

**Phase 28: COMPLETE** (6 commits, 2026-04-08). Next-gen infrastructure + polish:
- **Optimistic mutations** (`useMutations.ts`): instant UI for task/project/manuscript updates, rollback on error
- **R2 file uploads** (`FileUpload.tsx`, `api/routes/uploads.ts`): drag-drop file attachments with R2 storage
- **Tiptap rich text** (`RichTextEditor.tsx`): rich text editor for task descriptions (bold/italic/headings/lists/links)
- **WebSocket real-time** (`useRealtimeSync.ts`): PartySocket → Durable Object at `hub-realtime.nicholas-ingraham.workers.dev`, with polling fallback + BroadcastChannel tab sync
- **Smart polling**: 60s with WS, 10s without, version-based invalidation
- **Resend email** (`api/lib/email.ts`): email integration ready, needs API key
- **Design polish**: dark bg contrast improvements, text softening
- **InlineSelect portal fix**: dropdown renders via `createPortal` to escape table overflow, z-index resolved
- **Version bump fix**: Pages Functions must await async work directly (no ctx)

**Phase 22: COMPLETE** (5 commits, 5 deploys, 2026-04-05). Design research + polish:
- Transition standardization: 10 inline durations → 150ms/250ms constants
- CreateProjectModal: focus trapping + aria-modal (a11y gap closed)
- Mobile responsive TaskGridView: stacked card layout below 768px
- Button secondary variant: CSS vars for light mode compat
- Calculations row: Notion-style count/status summary on Tasks, Projects, Deadlines tables
- Status badge pills: 12% opacity tinted backgrounds (Kraken/Notion pattern, STATUS_BG map)
- CSS polish (Linear/Raycast research): luminance-stepping elevation, +0.01em dark letter-spacing, --muted 4th opacity tier, semi-transparent white borders
- Design patterns reference saved: `Projects/mn-ccore-lab-hub/design-patterns-reference.md`

**Phase 19: COMPLETE** (4 commits). Differentiation features:
- Trainee Development Trajectories: per-member page with pub curve, project velocity, task metrics, activity heatmap
- Decision Replay System: tags, similar decisions search, outcomes tracking, project linking, timeline view
- Evidence-Based PI Dashboard: commitment scorecard, response time, team engagement, mentee pub velocity, grant pipeline
- Expertise tags on team profiles (teal pills, clickable, filterable on Team page)

**Phase 18: COMPLETE** (2 commits). Functional depth:
- Blocker flagging: blocked_by field, Link2 chain icons, B keyboard shortcut, auto-status
- Project Health: real algorithm (activity/velocity/overdue/milestones), colored bars, health dots
- Dashboard card type badges, view toggle standardization

**Phase 17: COMPLETE** (7 commits). UX interaction layer + visual consistency:
- PageHeader: standardized across all 18 portal pages (LabSync Pattern 3)
- EmptyState: consistent empty states with icon+title+subtitle+CTA
- LoadingSkeleton: Table/Card/Text skeletons replacing all loading spinners
- Task keyboard shortcuts: J/K nav, Space peek, S status cycle, X select, Enter detail
- TaskPeekOverlay: Linear-style right-side panel (400px, slide-in) — *removed 2026-04-23 during /simplify sweep; was 0-caller*
- InlineAssigneePicker: avatar dropdown for assignee editing in grid
- InlineDatePicker: date editing with overdue detection
- CollapsibleSection: progressive disclosure in TaskDetailPanel
- Board enhancements: column collapse + swimlanes (group by status/priority/assignee)
- Status color transitions (150ms), task completion animation (Todoist-style)
- Hover row actions (Edit/Archive/Add to Meeting ghost buttons)
- Portal heading weights reduced (h1:600, h2:500, h3:400)
- Card hover stabilized (no layout-shifting translateY)
- Density toggle verified across data pages


---

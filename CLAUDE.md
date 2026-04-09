# MN-CCORE Lab Hub -- Claude Operating Guide

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** -- where research gets managed, meetings get run, and information flows between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev |
| Repo | github.com/ingra107/mn-ccore-lab (530+ commits) |
| Deploy | `cd /c/Users/ingra/mn-ccore-lab && npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab` |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript |
| Data | TanStack Query v5 + Cloudflare D1 (44 tables, 182+ endpoints) -- ALL LIVE |
| D1 database | `b8453e9b-7c5f-4029-b07d-dd89c05d00cf` (ENAM) |
| D1 tables | 44 |
| Deploy mode | Manual via wrangler -- NO auto-deploy |
| PB project | `Projects/mn-ccore-lab-hub/` -- PROJECT.md, living plan, future ideas |
| Reference | `REFERENCE.md` in this repo -- D1 tables, API endpoints, key files, feature list |

## Design System

### Design Ethos: Operational, Not Editorial (Decision: 2026-04-01)

The Hub is a **research operations center**, not a magazine. Every design choice prioritizes usability and data clarity over decoration. Read `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md` (PB repo) for full rationale.

**Core principles (NEVER violate):**
1. **Dark-first design.** Dark bg is deep neutral (#0b1017), NOT blue-tinted. Text is #e2e8f0 (not pure white — less glare). Light mode secondary.
2. **Columnar tables, not card stacks.** Data pages use fixed-column tables with headers (Title|Assignee|Due|Status|Priority). Cards are for dashboards only. Fixed row height for vertical scanning.
3. **Inline editability with visible affordance.** Every editable field shows "▾" dropdown indicator. Click cell → dropdown/picker by type. Auto-save on blur. No explicit save button. (Research: Pattern 4)
4. **Typography: light weight, three opacity tiers.** Body font-weight: 400. Active text: 100% opacity. Normal: 70% (--ink = #e2e8f0). Muted: 55% (--muted = `rgba(148,163,184,0.55)`). NEVER use opacity below 0.5 on readable text in dark mode. NEVER 500+ weight for body text. Weight hierarchy: body=400, label/subtitle=500, card metrics=700, heading h1=600.
5. **One accent color per view.** Teal for interactive. Everything else neutral. Max 2 non-neutral colors per view.
6. **More info, more readable.** Density ≠ clutter. LabSync puts 20 sidebar items that are MORE readable than our 17. The secret: font-weight 400, grouped sections with rhythm, consistent icon opacity.
7. **Zero monospace in content.** JetBrains Mono for `<kbd>` only. ALL other text is DM Sans.
8. **Optimistic UI + undo.** State changes are instant. Undo toast for 5 seconds. Never show spinners for actions. (Research: Pattern 9)
9. **Click targets must be precise.** Clicking a task row opens detail panel. ONLY clicking the status circle changes status. Hover actions hidden until hover (pointer-events:none at opacity:0).

### Fonts
- **Portal titles:** DM Sans (clean, operational)
- **Public website titles:** Fraunces (editorial, brand voice)
- **Body text:** DM Sans everywhere
- **Code only:** JetBrains Mono
- **CSS:** `--font-sans` and `--font-body` both resolve to DM Sans. `--font-display` = Fraunces (public pages only).

### Palette
- **Light:** bg white `#ffffff` / ink `#0f1923` / slate `#2c3e50`
- **Dark:** bg `#0b1017` / ink `#e2e8f0` / slate `#94a3b8` (neutral, not blue-tinted)
- **Accents:** gold `#c9a84c` / teal `#2d8a8a` / maroon `#7a0019` / orange `#c2410c` / green `#16a34a`
- **Containers:** light `#f5f5f5` / dark `#111820`
- Category dots: 6px, 0.7 opacity -- maroon=CLIF, teal=Lab, gold=Mesfin

### Table Pattern (apply to ALL data pages)
- Bordered container with subtle border and small radius
- Column headers: uppercase, 11px, 0.5 opacity, 0.06em letter-spacing
- Stage group headers: quiet uppercase labels with extending rule line
- Row hover: gold-tinted `rgba(201, 168, 76, 0.06)`, active at `0.10`
- Inline controls: status/priority dropdowns editable in-row
- Ghost-style action buttons (outline, not filled)

### Micro-interactions (standardize to 2 constants)
- `--transition-fast: 150ms` — hover, toggle, status change, row highlight
- `--transition-panel: 250ms` — sidebar, detail panel, modal, card shadow
- Card hover: -1px lift.
- Inline durations standardized to 150ms (fast) / 250ms (panel) as of 2026-04-05.

### Sidebar
- Font-weight 400 for nav items, 500 for active only
- Active: teal bg fill, no left border. Inactive: --slate color, icon opacity 0.7.
- Section labels: 9px uppercase, opacity 0.5. Divider lines between groups.
- Row height: py-2 (compact). Font: 12px. Group gap: 4px. Section divider margin: 6px/8px.
- Logo: mark uses CSS filter for dark mode (`invert(1) brightness(1.5)`), text logo swaps to dark variant.

### Borders & Spacing
- `--border-light` (gold tint) = semantic. `--border-subtle` (neutral) = structural. Don't mix.
- Spacing: 4, 8, 12, 16, 20, 24, 32px grid. No off-grid values.

### UX Research Patterns (from task-management-ux-patterns-research.md)

Must-reference before building ANY new feature. Key implementable patterns:
- **Pattern 4 (Inline Editing):** Click any field → edit mode by type (dropdown/picker/text). Auto-save on blur.
- **Pattern 7 (List View):** Fixed row height. Column headers. Grouping with collapsible headers. Density toggle.
- **Pattern 9 (Optimistic UI):** Instant state changes. Undo toast for 5 seconds. Never show spinners.
- **Pattern 10 (Micro-interactions):** Completion animation. Status color transitions. Progressive disclosure.
- **Pattern 3 (Three depth levels):** Peek (Space) → Side Panel (click) → Full Page (Enter). Decision tree in research doc.

Reference: `Projects/mn-ccore-lab-hub/task-management-ux-patterns-research.md` (PB repo)
Competitive reference: LabSync (JC Rojas) — friend, learn from, never compete.

### Shared Utilities
- `src/lib/dateUtils.ts` (formatters), `src/data/team.ts:getPersonInfo()`, `formatBrandName()` from BrandName.tsx

## Architecture

```
Airtable ←CRDT→ brain.db ←LWW→ D1 (mnccore-lab) ←API→ React + TanStack Query
                   ↑                    ↑
            Nick's CLI              Team's Hub
          (single user)          (20+ team members)
```

- **Data:** TanStack Query v5 → D1 API (prod), static TS fallback (dev)
- **API:** Cloudflare Worker, 110+ endpoints, auth-gated writes
- **Auth:** Open now. Cloudflare Access for April 21 launch (@umn.edu)
- **Email:** Worker cron + SendGrid (dormant -- needs API key)
- **Sync:** `sync_d1_push.py` / `sync_d1_pull.py` in PB, scheduled + /process-triggered

### Sync Architecture (Decision: 2026-04-06)

brain.db is the **sync hub**. Airtable and D1 never talk directly — changes propagate through brain.db.

**Sync model:** Field-level last-write-wins (LWW) with timestamps. Both D1 and brain.db are authoritative — whoever changed a field last wins. Conflicts logged to `sync_log`.

**Sync triggers:**
- /process: push to D1 (step 4b) + pull from D1 (step 0c)
- Scheduled: 2:35 AM push, 2:40 AM pull, 12:05 PM push+pull
- Machine swap: Airtable only (not D1)

**Key rules:**
- Brain.db tasks use `recXXX` IDs (Airtable). Hub-created tasks use hex IDs. Both coexist.
- Hub-created tasks pull to brain.db but do NOT push to Airtable (Airtable is Nick-only).
- `notes` (brain.db) is private. `description` (D1) is team-visible. They do NOT sync bidirectionally.
- Task deletion uses soft-delete (`deleted_at` column) to prevent zombie re-creation.
- `completed` field is bidirectional — Hub can reopen tasks, brain.db accepts it.

**Implementation:** See plan at `~/.claude/plans/graceful-meandering-thimble.md`
**Peripheral Brain sync scripts:** `scripts/db/sync_d1_push.py`, `sync_d1_pull.py`

## Critical Rules

1. **Content visible by default.** `.fade-in-up` starts at opacity:1. NEVER hide content behind animations.
2. **Hero cards use `<a>` tags**, not React Router `<Link>`. AnimatePresence + useCountUp conflict.
3. **initialData as factory functions.** `initialData: () => data`, never `initialData: data`.
4. **Avatar:** Container `overflow-hidden`, img `w-full h-full`.
5. **`getPersonInfo()` from `src/data/team.ts`** -- never create local copies.
6. **Date formatting from `src/lib/dateUtils.ts`** -- never create local formatters.
7. **@mentions use `MentionInput`** -- not raw `<textarea>`.
8. **Dedup action items** -- normalize "[Carried forward]" prefix.
9. **NEVER deploy from a worktree.** Commit to branch + PR only.
10. **ONE deploy per session.** KV free tier limit. Batch all work, deploy once.
11. **`formatBrandName()`** for any text that might contain "MNCCORE".
12. **Tailwind v4:** `@import` syntax, not `@tailwind`. No `group-hover:` with arbitrary values -- use CSS rules.

## Roadmap

**Phases 1-13: COMPLETE** (360+ commits). See `REFERENCE.md` for details.

**Phase 14: COMPLETE** (7 commits). Design ethos pivot — palette, containers, inline editing, fonts, monospace, colors.

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

*Pending:* Schema v35 migration (recurrence + recurrence_parent_id) — planned but not yet needed. No code depends on it.

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
- TaskPeekOverlay: Linear-style right-side panel (400px, slide-in)
- InlineAssigneePicker: avatar dropdown for assignee editing in grid
- InlineDatePicker: date editing with overdue detection
- CollapsibleSection: progressive disclosure in TaskDetailPanel
- Board enhancements: column collapse + swimlanes (group by status/priority/assignee)
- Status color transitions (150ms), task completion animation (Todoist-style)
- Hover row actions (Edit/Archive/Add to Meeting ghost buttons)
- Portal heading weights reduced (h1:600, h2:500, h3:400)
- Card hover stabilized (no layout-shifting translateY)
- Density toggle verified across data pages

## Meeting Cadence

Biweekly Tuesdays 3pm CT. Anchor: Apr 21, May 5. Automation runs Monday mornings.

## Component Coverage (Verified 2026-04-08)

| Component | Coverage | NOT Used On |
|-----------|----------|-------------|
| LoadingSkeleton | ALL 19 portal pages | -- |
| EmptyState | 15 pages (Tasks, MyTasks, Deadlines, Decisions, Ideas, Activity, Calendar, Search, Grants, MeetingNotes, Narratives, AskTheLab, Manuscripts, Digest, Settings) | Analytics, PBSector, Personal, PIAnalytics |
| PageHeader | 17 of 19 portal pages (all with aria-live on count/subtitle) | PBSector (custom PlannerHeader) |
| J/K keyboard nav | 11 pages (Tasks, Projects, Meetings, Ideas, Decisions, Deadlines, Manuscripts, Grants, Search, MeetingNotes, Narratives) | Calendar (arrow keys), Analytics, Settings |
| HoverCard | 8 surfaces (TaskDetail, TaskPeek, MeetingDetail, AssigneePicker, ProjectHealth, MenteeDashboard, Projects list, Activity) | Team (cards already detailed) |
| UndoToast | ALL task surfaces (TaskGridView, StandUp, Timeline, Board, Detail, Tasks, MyTasks, Personal, Deadlines, Dashboard ActionBoard, MeetingDetail, ProjectDetail, MyItems, Meetings) + Ideas, Manuscripts, Decisions | Settings (uses saved indicator) |
| Stagger animations | 12 pages (Projects, Personal, Ideas, Decisions, Deadlines, Meetings, MeetingPrep, MeetingNotes, Search, Calendar, Analytics, PIAnalytics, Settings) | -- |
| InlineSelect | Tasks (grid), Projects (list+detail), Manuscripts, Ideas, Decisions, Deadlines | Grants (no editable status) |
| Focus trapping | ALL 6 modals (CreateTask, CreateProject, CreateIdea, CreateQuestion, CreateDecision, TranscriptModal) | -- |
| Escape key close | ALL 6 modals + CommandPalette + GlobalQuickAdd + ShortcutHelp | -- |
| Dynamic page title | 7 pages (Tasks, MyTasks, Ideas, Decisions, Deadlines, Manuscripts, Projects) | Other portal pages use static usePageMeta |
| Search/filter input | 8 pages (Tasks, AskTheLab, SessionHistory, Narratives, MeetingNotes, Decisions, Search, Digest) | -- |
| N-key create | Ideas, Decisions | Tasks uses C key |
| Copy to clipboard | PIAnalytics, CVPage, Publications, Digest, MeetingDetail, AnalyticsPage | -- |
| ScrollToTop | All portal pages (via PortalLayout) | Public pages |

## Accessibility Requirements

Currently good: aria-hidden on icons, aria-label on interactive elements, aria-pressed on toggles, skip-to-content link, focus-visible styling, prefers-reduced-motion in 5 locations, all modals have focus trapping + Escape key + aria-modal.

**All major gaps closed as of Phase 23:**
- ~~UndoToast needs `role="alert"` and `aria-live="polite"`~~ DONE (be80679)
- ~~CommandPalette needs focus trapping~~ DONE (81da23b)
- ~~CreateTaskModal needs focus trapping~~ DONE (be80679)
- ~~CreateProjectModal needs focus trapping~~ DONE
- ~~CreateIdeaModal, CreateQuestionModal, CreateDecisionModal, TranscriptModal need focus trapping~~ DONE (Phase 23)
- ~~No `aria-live` regions for dynamic content updates~~ DONE — PageHeader count/subtitle have aria-live
- ~~Toast notifications not announced to screen readers~~ DONE — UndoToast container has role="status" + aria-live, success toasts share same container

## Known Gotchas

| Problem | Fix |
|---------|-----|
| Hero cards render loop | Use `<a>` tags, not Router Link |
| initialData flash | Use factory functions: `() => data` |
| Meeting ID collision | IDs include random suffix. API dedup by date+title prevents duplicates. UNIQUE index enforced. |
| Tailwind v4 group-hover | Use CSS rule in index.css, not arbitrary value |
| --border-light vs --border-subtle | Gold=semantic, Neutral=structural. Don't mix. |
| TaskCard status cycling | todo→in_progress→done (skips blocked) |
| Network chunk 1.3MB | Expected (three.js). Code-split via React.lazy |
| CF Access blocks all | Restrict to portal paths only |
| Duplicate action items | Dedup by normalizing "[Carried forward]" |

## Peripheral Brain Connection

- **Project folder:** `Projects/mn-ccore-lab-hub/` -- PROJECT.md + hub-future-ideas.md (88 features tracked)
- **Research:** `Projects/mn-ccore-lab-hub/competitive-landscape-lab-management-2026.md` + `task-management-ux-patterns-research.md`
- **Design decision:** `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md`
- **Memory:** `memory/project_mnccore-website-redesign.md`
- **Sync scripts:** `scripts/db/sync_d1_push.py` / `sync_d1_pull.py` -- push/pull brain.db ↔ D1
- **Sync plan:** `~/.claude/plans/graceful-meandering-thimble.md` -- full database alignment (Phase 24)
- **CRDT engine:** `scripts/db/crdt.py` -- field-level LWW for Airtable sync (extend to D1)
- **Meeting automation:** `scripts/scheduled/meeting_automation.py`
- **Archived plans:** `Projects/mn-ccore-lab-hub/_archived/` + `Archive/Scratch/hub-plans-consolidated/`

## Pending Sync
<!-- When this session ends, the SessionEnd hook syncs this to Peripheral Brain. -->


## Known Bugs — Test-Verified (2026-04-09 full audit, 4 test suites)

**Test results:** 377 passed, 49 failed, 5 skipped across 431 tests (87.5% pass rate)

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| inspection.spec.ts | 183 | 15 | 0 |
| inspection-workflows.spec.ts | 131 | 25 | 5 |
| daily-superuser.spec.ts | 43 | 6 | 0 |
| sync-pipeline.test.py | 20 | 3 | 0 |

### CRITICAL (blocks launch or crashes)
| # | Bug | Test | Fix |
|---|-----|------|-----|
| C1 | MeetingDetail page CRASHES (React #310, hook order in sortable) | `PAGE: Meeting Detail renders without crash` | Fix conditional hook call in MeetingDetail.tsx sortable section |
| C2 | `pub_date` column missing from publications table | `publications table has pub_date column` | Run ALTER TABLE or update queries to use `year`. Affects: PI Dashboard, Trajectory, Narratives, Contributions |
| C3 | Decision creation 500 — `linked_projects` column missing | `API POST: Create decision` | Run schema-v21+ migration on D1 |
| C4 | Question creation 500 | `API POST: Create question` | Same schema migration — questions table missing columns |
| C5 | `/api/narratives` returns 500 | `API GET Research narratives` | Fix narratives route handler (likely schema/query issue) |
| C6 | `/api/analytics/pi-dashboard` returns 500 | `API GET PI dashboard analytics` | Fix — depends on pub_date column (C2) |
| C7 | Project Detail page crashes | `PAGE: Project Detail renders` | React error on project detail page |

### API ENDPOINTS — Missing or 500 (new from test run)
| # | Endpoint | Method | Status | Fix |
|---|----------|--------|--------|-----|
| A1 | `/api/tasks/:id/subtasks` | POST | 500 | Add subtask creation handler or fix schema |
| A2 | `/api/notifications/read-all` | POST | 500 | Fix bulk notification handler |
| A3 | `/api/tasks/batch` | POST | 500 | Fix batch update handler |
| A4 | `/api/pb/capture` | POST | 500 | Fix PB capture handler |
| A5 | `/api/dependencies` | POST | 500 | Fix dependency creation handler |
| A6 | `/api/expertise` | POST | 500 | Fix expertise tag handler |
| A7 | `/api/tasks/:id/handoffs` | POST | 500 | Fix handoff creation handler |
| A8 | `/api/paper-links` | POST | 500 | Fix paper-link handler |
| A9 | `/api/reactions` | POST | 500 | Fix emoji reaction handler |
| A10 | `/api/expertise/suggest` | GET | 500 | Fix expertise suggestion route |
| A11 | `/api/team/:slug/trajectory` | GET | 500 | Fix trajectory route (likely pub_date dep) |
| A12 | `/api/team/:slug/contributions` | GET | 500 | Fix contributions route |
| A13 | `/api/analytics/contributions` | GET | 500 | Fix contributions analytics route |
| A14 | `/api/deadline-cascade/impact` | GET | 500 | Fix impact analysis route |

### MEDIUM (UX/visual issues)
| # | Bug | Test | Fix |
|---|-----|------|-----|
| M1 | Global h1 font-weight 800 (index.css:190) | `VISUAL: No fontWeight 800 on portal h1s` | Change to 600. Remove inline 800 from 7 portal pages. Keep 800 on public pages. |
| M2 | Ctrl+K command palette not opening | `UX: Ctrl+K opens command palette` | Check keyboard event handler registration |
| M3 | Enter key doesn't open TaskDetailPanel | `UX: Enter opens TaskDetailPanel` | Fix keyboard shortcut handler for Enter on focused task |
| M4 | Dashboard horizontal overflow at all breakpoints | `VISUAL: dashboard at mobile/tablet/desktop` | Fix layout overflow — something extends past viewport |
| M5 | Projects page overflow at tablet (768px) | `VISUAL: projects at tablet` | Fix responsive layout at 768px |
| M6 | Dashboard horizontal overflow at 375px mobile | `MOBILE: Dashboard at 375px — single column` | Same root cause as M4 |
| M7 | /my-items page crashes or errors | `ROUTE: My Items renders` | Fix My Items page render |
| M8 | CV page (/team/:slug/cv) crashes | `ROUTE: CV Page renders` | Fix CV page — may depend on pub_date (C2) |
| M9 | Create Task modal strict mode violation | `VISUAL: Create Task modal all fields visible` | Use more specific locators (test fix), but modal may have duplicate "Title" text |
| M10 | Keyboard shortcuts fire in search input | manual audit | Add activeElement guard to keyboard listeners |
| M11 | "Press F" tooltip clips on mobile | manual audit | Hide below md: breakpoint |
| M12 | WebSocket 400 on handshake — console spam | manual audit | Fix DO or set VITE_WS_HOST='' in build env |
| M13 | QA test data in D1 | manual audit | Delete INSPECTION/EDGE/SYNC/JOURNEY test tasks/ideas/decisions |
| M14 | F key doesn't trigger focus mode (sidebar doesn't collapse) | `daily: Focus mode (F key) hides sidebar` | F key handler not firing or sidebar width unchanged |
| M15 | ScrollToTop button blocked by FAB quick-add button | `daily: ScrollToTop appears after scrolling` | FAB (bottom-right +) z-index overlaps ScrollToTop — reposition or z-index fix |
| M16 | Dashboard task card links don't navigate on click | `daily: Dashboard → click task → navigates` | Links in Tasks bento card not wired or wrong element type |
| M17 | Dashboard Customize modal — toggles not found or not rendering | `daily: Customize dashboard cards` | Customize button click doesn't open modal or toggle count is 0 |
| M18 | Board view "To Do" column header not matching expected text | `daily: Board view Kanban columns` | Column header text mismatch (case or label) |
| M19 | Filter panel (F key on Tasks) — fires focus mode instead of filter toggle | `daily: F key toggles filter panel` | F key has dual binding conflict — focus mode vs filter toggle |

### SYNC PIPELINE BUGS (brain.db ↔ D1 real round-trip tests)
| # | Bug | Test | Severity | Fix |
|---|-----|------|----------|-----|
| SP1 | effort→priority mapping not pushed (Quick→low) — D1 gets None | `test_04: effort push` | HIGH | sync_d1_push.py not including effort→priority in payload |
| SP2 | Hub-created tasks don't appear in brain.db after pull | `test_07: hub create pull` | CRITICAL | sync_d1_pull.py not picking up new hex-ID tasks from D1 |
| SP3 | Push is NOT idempotent — double push adds ~10 duplicate tasks | `test_21: idempotent push` | HIGH | sync-bulk ON CONFLICT not deduplicating; IDs may differ between runs |
| SP4 | Hub completion doesn't reach brain.db (completed stays 0 after pull) | `test_15: status round-trip` | CRITICAL | Pull not syncing D1 completed=1 → brain.db completed=1 |
| SP5 | Hub due date change doesn't reach brain.db after pull | `test_17: due date round-trip` | HIGH | Pull not applying D1 due_date changes to brain.db |
| SP6 | Hub note/update not synced to brain.db (task_updates has no pull handler) | `test_10: note pull` | CRITICAL | No pull handler for /api/tasks/:id/updates → brain.db (also P1) |

### D1 API SYNC FAILURES (Playwright API round-trip tests)
| # | Bug | Test | Fix |
|---|-----|------|-----|
| S1 | Task creation returns no `data.id` (response shape issue) | ALL sync tests + journey lifecycle | Fix POST /api/tasks response — must return `{ data: { id } }` |
| S2 | Status change not persisting or readback fails | `SYNC: Status change round-trip` | Fix POST /api/tasks/:id/status or GET filter |
| S3 | Priority change not persisting | `SYNC: Priority change round-trip` | Fix POST /api/tasks/:id field update |
| S4 | Assignee change + filter not working | `SYNC: Assignee change round-trip` | Fix assignee filter in GET /api/tasks |
| S5 | Batch status update fails | `SYNC: Batch update verify all changed` | Fix POST /api/tasks/batch (also A3) |
| S6 | Comment/note persistence broken | `SYNC: Comment and note readback` | Fix — cascades from S1 (task create) |

### SYNC PIPELINE CODE (PB scripts)
| # | Bug | Severity | Fix |
|---|-----|----------|-----|
| P1 | task_updates table has NO sync handler | CRITICAL | Add pull handler to sync_d1_pull.py for /api/tasks/:id/updates (=SP6) |
| P2 | Push state not updated on sync-bulk failure | HIGH | Fix sync_d1_push.py:365-378 |
| P3 | No try/except around resp.json() in push | HIGH | Wrap sync_d1_push.py:368 in try/except |
| P4 | Hub-created tasks can get NULL project_id | MEDIUM | Log warning when slug_map misses |
| P5 | Pull silently returns [] on network error | MEDIUM | Add explicit failure logging |

### LOW (nice-to-have)
| # | Bug | Fix |
|---|-----|-----|
| L1 | No GET /api/tasks/:id or /api/projects/:slug | Add single-resource endpoints |
| L2 | Project Health card shows 0s | Check dashboard card data binding |
| L3 | Schema migration gap (v21+ not applied) | Run pending migrations — ROOT CAUSE of C2, C3, C4, C5, C6, A10-A14 |

## Session Notes
<!-- COO writes session updates here. Synced by SessionEnd hook or Start Day backup. -->


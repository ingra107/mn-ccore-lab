# MN-CCORE Hub: Next 50 Improvements

> **Session: March 28-29, 2026**
> 34 commits, 27 deploys. This document captures what was done and what's next.
> Top 15 items will be executed autonomously. No Nick input needed.

---

## What We Built (This Session)

| # | Feature | Files |
|---|---------|-------|
| 1 | Progressive disclosure (Tasks/MyTasks) | Tasks.tsx, MyTasks.tsx |
| 2 | Customizable Dashboard (toggle cards, localStorage) | Dashboard.tsx |
| 3 | Error boundaries on all 25 routes (with recovery) | App.tsx |
| 4 | PI-only per-person analytics | AnalyticsPage.tsx |
| 5 | Settings inline help text | SettingsPage.tsx |
| 6 | ProjectDetail section anchor nav | ProjectDetail.tsx |
| 7 | "Why This Matters Now" PI context (D1 v10) | ProjectDetail.tsx, schema-v10.sql |
| 8 | Quick reactions on updates (D1 v11) | ProjectUpdateFeed.tsx, schema-v11.sql |
| 9 | Cmd+K hint in sidebar | Sidebar.tsx |
| 10 | Quick Actions on Dashboard (auto-open modals) | Dashboard.tsx |
| 11 | User profile in sidebar footer | Sidebar.tsx |
| 12 | Week navigator on Analytics | AnalyticsPage.tsx |
| 13 | "All caught up!" positive empty states | AnalyticsPage.tsx, MyTasks.tsx |
| 14 | Chip-style filter pills (all pages) | TaskFilters.tsx, all portal pages |
| 15 | Inline task filters with title | Tasks.tsx |
| 16 | Command palette: Actions + Quick Filters | CommandPalette.tsx |
| 17 | Group By + Sort By on My Tasks | MyTasks.tsx |
| 18 | Task form UX improvements | CreateTaskModal.tsx |
| 19 | Theme picker (Light/Dark/System) | useDarkMode.ts, PortalLayout.tsx |
| 20 | Report a Bug link | Sidebar.tsx |
| 21 | Color-coded workflow template pills | SettingsPage.tsx |
| 22 | AI Meeting Context in Settings | SettingsPage.tsx |
| 23 | Ideas status flow legend | Ideas.tsx |
| 24 | Manuscripts stage flow summary | Manuscripts.tsx |
| 25 | Keyboard shortcuts C (task) + N (idea) | useKeyboardShortcuts.ts |
| 26 | Auto-open create modals via URL params | Tasks.tsx, Ideas.tsx |
| 27 | Centered search hero page | SearchPage.tsx |
| 28 | Digest inline search | Digest.tsx |
| 29 | Context-aware Personal Hub subtitle | Personal.tsx |
| 30 | Sidebar live badges (notifications + overdue) | Sidebar.tsx |
| 31 | Grants funding summary stats | Grants.tsx |
| 32 | Calendar "Today" button + event count | CalendarPage.tsx |
| 33 | Dark mode fix on Search page | SearchPage.tsx |
| 34 | Show/Hide completed tasks toggle | Tasks.tsx |

---

## Next 50 Improvements (Priority Order)

### Tier 1: Execute Now (1-15) — No Nick needed

| # | Improvement | Why | How | Est |
|---|-------------|-----|-----|-----|
| 1 | **Extract FilterChip component** | 6 pages duplicate the same chip-style select CSS. One change = 6 files to update. | Create `src/components/FilterChip.tsx` wrapping the rounded-full + teal-active pattern. Replace in all pages. | 20min |
| 2 | **Skeleton loading states** | "Loading..." text looks unfinished. Skeleton placeholders feel professional. | Create `src/components/Skeleton.tsx` with card/text variants. Replace all "Loading..." divs. | 30min |
| 3 | **Remove dead code** | EnhancedCollaborationNetwork.tsx (655 lines) appears unused. Bloats bundle. | Grep for imports, confirm unused, delete. | 5min |
| 4 | **Publications page inline search** | 63 papers with no search within page. Digest has it, Publications should too. | Add search input + client-side filter by title/author/journal, same pattern as Digest. | 15min |
| 5 | **Page subtitle consistency** | Meetings, Team pages have static subtitles. Others are dynamic. | Add live counts: "34 meetings tracked", "19 team members". | 10min |
| 6 | **Breadcrumbs on detail pages** | ProjectDetail and MeetingDetail feel disconnected from parent. | Add "Projects > [Project Name]" breadcrumb above the back link. | 15min |
| 7 | **Task priority color dots** | Task list doesn't visually distinguish priorities at a glance. | Add small colored dot (maroon=urgent, orange=high, gold=medium, gray=low) before each task title. | 15min |
| 8 | **Keyboard shortcut [ to toggle sidebar** | Sidebar toggle requires mouse click. Power users want keyboard. | Add `[` handler in useKeyboardShortcuts, dispatch collapse toggle. | 10min |
| 9 | **Deduplicate ViewDropdown** | ViewDropdown component is copy-pasted in MyTasks.tsx. Should be shared. | Move to `src/components/ViewDropdown.tsx`, import in both pages. | 10min |
| 10 | **"Copy link" on ProjectDetail** | No way to share a project URL without manual copying. | Add copy-to-clipboard button next to project title. | 10min |
| 11 | **Notification grouping by day** | Notifications in bell dropdown are a flat list. Grouping by day improves scan. | Group by date in NotificationBell.tsx, add "Today" / "Yesterday" headers. | 20min |
| 12 | **Empty states audit** | Some pages may still show blank space instead of helpful guidance. | Check every portal page for zero-data state. Add icon + message + CTA where missing. | 20min |
| 13 | **Mobile sidebar auto-close** | Clicking a nav link on mobile should auto-close the sidebar overlay. | Add onClick handler in Sidebar nav links that calls onToggle on mobile. | 10min |
| 14 | **Print-friendly Dashboard** | No print styles. Dashboard printed = mess. | Add `@media print` CSS hiding sidebar, expanding content, removing animations. | 15min |
| 15 | **Tooltip on Quick Stats** | Personal Hub quick stats (Active Tasks, Overdue) don't explain what they count. | Add title attributes with explanatory text on each QuickStat. | 5min |

### Tier 2: High Impact (16-30)

| # | Improvement | Why | How |
|---|-------------|-----|-----|
| 16 | **Split api/index.ts** | 3000+ lines in one file. Hard to maintain. | Extract into api/routes/tasks.ts, projects.ts, meetings.ts, etc. Use worktree for safety. |
| 17 | **Split useApiData.ts** | 17K lines combining 12+ hooks. | Split into hooks/useTasks.ts, useProjects.ts, etc. Re-export from index for compatibility. |
| 18 | **Split useMutations.ts** | 14K lines combining 7 mutations. | Split by domain. Same re-export pattern. |
| 19 | **Add Playwright smoke tests** | No automated testing. Manual verification only. | Create test script hitting all 18 portal routes, verifying page titles load. |
| 20 | **Improve Cmd+K dark mode** | Command palette card may need dark mode background fix. | Audit and fix backgroundColor references. |
| 21 | **Add "Recently viewed" on Personal Hub** | Users can't quickly get back to what they were looking at. | Track last 5 page visits in localStorage, show as chips on Personal Hub. |
| 22 | **Project card hover animations** | Project cards in pipeline view feel static. | Add subtle scale + shadow on hover using Framer Motion. |
| 23 | **Meeting agenda item reordering** | Agenda items can't be reordered after creation. | Add @dnd-kit sortable to agenda items list. |
| 24 | **CSV export on Analytics** | Analytics data can't be exported for reports. | Add "Export CSV" button generating task/activity data as downloadable CSV. |
| 25 | **Improve mobile touch targets** | Some buttons may be below 44px on mobile. | Audit all interactive elements, enforce min 44px touch target. |
| 26 | **Add "Focus mode"** | Full sidebar is distracting during deep work. | Add hotkey (F) that minimizes sidebar to icons only and hides header. |
| 27 | **Favicon per section** | Browser tab always shows same favicon. | Use page-specific emoji or icon as dynamic favicon. |
| 28 | **Add page transition loading bar** | Page transitions show no progress indicator. | Add thin teal progress bar at top during route transitions. |
| 29 | **Improve search results ranking** | FTS returns results by type, not relevance. | Weight results by recency + type (tasks > projects > activity). |
| 30 | **Add "Pin" on dashboard cards** | Users can show/hide cards but can't pin favorites to top. | Add pin state to localStorage card preferences. |

### Tier 3: Nice to Have (31-50)

| # | Improvement | Why | How |
|---|-------------|-----|-----|
| 31 | Task subtasks/checklists | Complex tasks need breakdown | Add subtasks table + UI |
| 32 | Bulk task actions | Multi-select + floating toolbar | Add checkbox column + batch status/assignee change |
| 33 | Quick Add with token parsing | "@casey p1 Apr 15" inline parsing | Parse tokens in task title input |
| 34 | Peek preview (Space bar) | Read-only overlay without context switch | Add Space key handler on task/project lists |
| 35 | Density modes | Comfortable/compact toggle | CSS variable-based spacing adjustment |
| 36 | Named/saved views | Save filter+sort configurations | Store view configs in localStorage |
| 37 | Task due date reminders | No proactive reminder before due | Add reminder_days field + highlight |
| 38 | Project status timeline | No visual history of stage changes | Log stage transitions, show timeline |
| 39 | Meeting attendance tracking | No record of who attended | Add attended field on meeting members |
| 40 | Publication impact metrics | No citation tracking per paper | Add citations field, show trend |
| 41 | Team member activity sparklines | No visual per-person activity trend | Mini sparkline chart on team cards |
| 42 | Offline support (PWA) | Hub doesn't work offline | Add service worker + manifest |
| 43 | Email notification preferences | Can't control what emails you get | Add per-type toggles in Settings |
| 44 | Recurring task templates | Common tasks recreated manually | Add template with recurrence pattern |
| 45 | File attachments on tasks | Can't attach files to tasks | Add file upload to D1 + R2 storage |
| 46 | Calendar integration (inbound) | Can't subscribe to external calendars | Add ICS URL subscription in Settings |
| 47 | Cover image upload | Lab branding customization | Add image upload in Settings |
| 48 | Protocols page | No SOP tracking | New page mirroring Ideas structure |
| 49 | Lab Management unified page | JC's 5-tab admin dashboard | New page aggregating stats |
| 50 | API rate limiting | No protection against abuse | Add rate limit middleware in Worker |

---

## Execution Log

*Top 15 items executed autonomously. Each marked DONE when shipped.*

- [ ] 1. Extract FilterChip component
- [ ] 2. Skeleton loading states
- [ ] 3. Remove dead code (EnhancedCollaborationNetwork)
- [ ] 4. Publications page inline search
- [ ] 5. Page subtitle consistency (Meetings, Team)
- [ ] 6. Breadcrumbs on detail pages
- [ ] 7. Task priority color dots
- [ ] 8. Keyboard shortcut [ to toggle sidebar
- [ ] 9. Deduplicate ViewDropdown
- [ ] 10. "Copy link" on ProjectDetail
- [ ] 11. Notification grouping by day
- [ ] 12. Empty states audit
- [ ] 13. Mobile sidebar auto-close
- [ ] 14. Print-friendly Dashboard
- [ ] 15. Tooltip on Quick Stats

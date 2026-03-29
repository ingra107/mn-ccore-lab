# MN-CCORE Lab Hub: Epic Build Session Log
**Date:** March 28-29, 2026
**Duration:** ~6 hours autonomous building
**Commits:** 46 to mn-ccore-lab, 5 to Peripheral Brain
**Deploys:** 36 to production (mn-ccore-lab.pages.dev)

---

## Phase 1: Strategic Assessment & Planning

**Started with:** Nick asked for an honest assessment of the Hub — what works, what's over-engineered, what to focus on. He corrected my framing: the Hub is NOT a meeting-gap filler. It's a **research operating system** — the team's peripheral brain.

**Key decisions made:**
- Every page must pass the "5-second test" (purpose clear, primary action obvious)
- Customizable over role-based (users choose their own dashboard)
- Benchmark is LabSync's intuitiveness (JC Rojas's work — a friend, not a competitor)
- Features trimmed from 30 to ~12 on active roadmap, rest moved to "Consider Later"

---

## Phase 2: UX Clarity Pass (Commits 1-6)

### 1. Progressive Disclosure on Tasks + MyTasks
**Files:** `src/pages/portal/Tasks.tsx`, `src/pages/portal/MyTasks.tsx`
- List view as default (most universally useful)
- Board/By Person/Timeline moved behind "More views" dropdown
- "Stand Up" renamed to "By Person" (immediately understandable)
- Active filter count badge when filters applied
- Empty state with icon + guidance + CTA

### 2. Customizable Dashboard
**File:** `src/pages/Dashboard.tsx`
- Card visibility toggles with "Customize" button
- 6 primary cards visible by default, 4 secondary behind "Show more"
- Preferences persisted in localStorage
- Card registry pattern for clean add/remove

### 3. Error Boundaries on All 25 Routes
**File:** `src/App.tsx`
- ErrorBoundary class component wrapping every route
- Recovery options: "Try again" (primary) + "Go to Dashboard" (secondary)
- Collapsible error detail for debugging
- SVG alert icon, styled consistently with design system

### 4. PI-Only Per-Person Analytics
**File:** `src/pages/portal/AnalyticsPage.tsx`
- Per-person completion metrics gated to PI email addresses
- Non-PIs see team-level aggregate ("14 tasks completed this week")
- Based on SDT research — controlling feedback destroys intrinsic motivation

### 5. Settings Inline Help Text
**File:** `src/pages/portal/SettingsPage.tsx`
- Added `hint` prop to SettingsField component
- Every field now has explanatory text: "Shown in sidebar and page titles"
- Workflow Templates subtitle improved

### 6. ProjectDetail Section Navigation
**File:** `src/pages/ProjectDetail.tsx`
- Anchor nav bar: Overview | Updates | Action Items | Comments
- IntersectionObserver highlights current section
- Smooth scroll on click, scroll-margin-top prevents header overlap

---

## Phase 3: Research OS Features (Commits 7-9)

### 7. "Why This Matters Now" — PI Strategic Context
**Files:** `api/schema-v10.sql`, `api/index.ts`, `src/pages/ProjectDetail.tsx`, `src/data/types.ts`, `src/lib/api.ts`
- D1 schema v10: `pi_context TEXT` column on projects table
- Gold-bordered callout at top of ProjectDetail
- PIs can edit inline with Ctrl+Enter save
- Placeholder: "2-3 sentences: What's the strategic context?"

### 8. Quick Reactions on Project Updates
**Files:** `api/schema-v11.sql`, `api/index.ts`, `src/components/ProjectUpdateFeed.tsx`
- D1 schema v11: `reactions` table with unique constraint
- API: GET/POST toggle endpoints
- ReactionBar component: 👍👀❤️ emoji picker
- Optimistic UI with TanStack Query rollback
- Grouped counts with tooltip showing who reacted

### 9. Cmd+K Search Hint in Sidebar
**File:** `src/components/Sidebar.tsx`
- Search link with `Ctrl+K` keyboard hint badge
- Platform-aware: shows ⌘ on Mac, Ctrl on Windows

---

## Phase 4: LabSync Exploration & Inspired Improvements (Commits 10-25)

**Full exploration of JC Rojas's LabSync** using Playwright browser automation. Every page visited, every form opened, every setting inspected, dark mode tested.

### 10. Quick Actions on Dashboard
**File:** `src/pages/Dashboard.tsx`
- "New Task", "Schedule Meeting", "Submit Idea" action buttons
- Links to /tasks?create=true and /ideas?create=true for auto-open

### 11. User Profile in Sidebar Footer
**File:** `src/components/Sidebar.tsx`
- Authenticated user's avatar, name, and email
- Links to their team member profile page

### 12. Week Navigator on Analytics
**File:** `src/pages/portal/AnalyticsPage.tsx`
- Previous/Next week buttons with date range display
- "This Week" button appears when navigated away
- All stats recompute relative to selected week

### 13. "All Caught Up!" Positive Empty States
**Files:** `src/pages/portal/AnalyticsPage.tsx`, `src/pages/portal/MyTasks.tsx`
- Green checkmark + "All caught up!" when no overdue tasks
- "No overdue tasks. Keep up the momentum." guidance
- Replaces blank/negative empty states

### 14. Chip-Style Filter Pills (All Pages)
**Files:** `src/components/tasks/TaskFilters.tsx`, all portal pages with selects
- Rounded-full pill-style dropdowns with teal active state
- Custom dropdown caret SVG
- Replaced ALL rectangular select boxes in the portal (verified with grep)

### 15. Inline Task Filters with Title
**File:** `src/pages/portal/Tasks.tsx`
- Filter chips moved inline with page title (compact header)
- Separate filter row eliminated

### 16. Command Palette: Actions + Quick Filters
**File:** `src/components/CommandPalette.tsx`
- Actions section: Create Task (C), Submit Idea (N), Schedule Meeting (M)
- Quick Filters: Completed Tasks, In Progress, High Priority, Overdue
- Live counts from D1 data on each filter
- Category renamed: "Navigation" → "Go To"

### 17. Group By + Sort By on My Tasks
**File:** `src/pages/portal/MyTasks.tsx`
- Group By: Due Date (Overdue/Today/This Week/Later), Priority, Project, Status
- Sort By: Priority, Due Date, Title
- Color-coded section dots and task counts per group
- Group by Due Date is default

### 18. Task Creation Form UX Improvements
**File:** `src/components/tasks/CreateTaskModal.tsx`
- Domain-specific placeholder: "e.g., Complete BMI subgroup analysis..."
- "Assignee" renamed to "Owner (responsible)"
- Project label: "(optional)" explicitly marked
- Helper text: "Tasks can also be created from meetings and project pages"

### 19. Theme Picker: Light / Dark / System
**Files:** `src/hooks/useDarkMode.ts`, `src/components/PortalLayout.tsx`
- 3-option dropdown menu replaces simple toggle
- System mode listens to OS preference changes in real-time
- Migrates old boolean localStorage value automatically
- Checkmark on active option

### 20. Report a Bug Link
**File:** `src/components/Sidebar.tsx`
- Mailto link in sidebar footer (ningraha@umn.edu)
- Bug icon from Lucide

### 21. Color-Coded Workflow Template Stage Pills
**File:** `src/pages/portal/SettingsPage.tsx`
- Templates display in 2-column grid
- Each stage gets a color from rotating palette: teal→gold→maroon→green→blue→purple
- Stage count shown below each template

### 22. AI Meeting Context in Settings
**File:** `src/pages/portal/SettingsPage.tsx`
- Per-member expertise notes section
- Team avatars, roles, and input fields
- Info note explaining how AI uses the context for speaker recognition

### 23. Activity Page Polish
**File:** `src/pages/portal/ActivityPage.tsx`
- Filter upgraded from toggle buttons to chip-style dropdown
- "Yesterday" day grouping label
- Improved empty state with context-aware message
- Activity limit increased from 100 to 200

### 24. Ideas Status Flow Legend
**File:** `src/pages/portal/Ideas.tsx`
- Visual status lifecycle: New → Under Review → Approved → Parked
- Color-coded pills matching existing status colors

### 25. Manuscripts Stage Flow Summary
**File:** `src/pages/portal/Manuscripts.tsx`
- Stage counts per pipeline stage below title
- Color-coded pills matching stage colors

---

## Phase 5: Keyboard & Interaction Polish (Commits 26-30)

### 26. Keyboard Shortcuts: C (Task), N (Idea)
**Files:** `src/hooks/useKeyboardShortcuts.ts`, `src/components/ShortcutHelp.tsx`
- Press C anywhere → navigate to Tasks + auto-open create modal
- Press N anywhere → navigate to Ideas + auto-open create modal

### 27. Auto-Open Create Modals via URL Params
**Files:** `src/pages/portal/Tasks.tsx`, `src/pages/portal/Ideas.tsx`
- `?create=true` URL param triggers modal open
- Param cleared after opening to keep URL clean
- Completes the keyboard shortcut → modal flow

### 28. Centered Search Hero Page
**File:** `src/pages/portal/SearchPage.tsx`
- Hero layout when no query entered: centered title + prominent input
- Category pills (tasks, projects, meetings, ideas, comments, activity)
- "Powered by D1 full-text search" attribution
- Transitions to standard layout when typing

### 29. Context-Aware Personal Hub Subtitle
**File:** `src/pages/portal/Personal.tsx`
- Dynamic subtitle: shows overdue count, active tasks, or "All caught up"

### 30. Sidebar Live Badges
**File:** `src/components/Sidebar.tsx`
- Unread notification count badge on "My Hub"
- Overdue task count badge on "My Tasks"
- Badges only appear when counts > 0

---

## Phase 6: Final Polish (Commits 31-34)

### 31. Grants Funding Summary Stats
**File:** `src/pages/Grants.tsx`
- 4 stat cards: Active Awards, Proposed, Total Funding, Mechanisms
- Title changed: "Grant Timeline" → "Grants & Funding"
- Mechanism pills with color coding

### 32. Calendar "Today" Button
**File:** `src/pages/portal/CalendarPage.tsx`
- "Today" button appears when navigated away from current date
- Event count in subtitle

### 33. Dark Mode Fix on Search Page
**File:** `src/pages/portal/SearchPage.tsx`
- Search input background changed from var(--cream) to var(--ice)

### 34. Show/Hide Completed Tasks Toggle
**File:** `src/pages/portal/Tasks.tsx`
- Green toggle button: "Show X done" / "Hide X done"
- Completed tasks hidden by default
- Applies to all views

---

## Phase 7: Autonomous Building (Commits 35-42)

Nick went to bed. Continued building autonomously.

### 35. NEXT-50 Roadmap + FilterChip + Keyboard [
**Files:** `NEXT-50.md`, `src/components/FilterChip.tsx`, keyboard shortcuts
- Comprehensive 50-item improvement roadmap
- Reusable FilterChip component (DRY extraction)
- Keyboard shortcut `[` toggles sidebar

### 36. Meetings Subtitle + QuickStat Tooltips
**Files:** `src/pages/Meetings.tsx`, `src/pages/portal/Personal.tsx`
- Meetings: dynamic "{count} meetings tracked" subtitle
- QuickStat: title attributes explaining what each metric counts

### 37. Copy Link on ProjectDetail + Mobile Sidebar Auto-Close
**Files:** `src/pages/ProjectDetail.tsx`, `src/components/Sidebar.tsx`, `src/components/PortalLayout.tsx`
- Copy-to-clipboard button with checkmark feedback next to project title
- Mobile sidebar auto-closes when clicking any nav link

### 38. Skeleton Loading States (Wired In)
**Files:** `src/pages/portal/Tasks.tsx`, `src/pages/portal/MyTasks.tsx`, `src/pages/portal/Ideas.tsx`
- Inline "Loading..." text replaced with animated skeleton placeholders
- Pulse animation, card/list variants

### 39. Print-Friendly CSS
**File:** `src/index.css`
- Hides sidebar, navigation, action buttons when printing
- Forces light mode colors
- Full-width content, no animations
- Bento cards linearized for print

### 40. Breadcrumbs on ProjectDetail
**File:** `src/pages/ProjectDetail.tsx`
- "Projects / [Project Name]" trail above back link

### 41. Consistent Filter Chips (Final Verification)
**Files:** `src/pages/portal/Manuscripts.tsx`, `src/pages/portal/Ideas.tsx`
- Last 2 old-style rectangular selects upgraded to chip-style pills
- Verified zero old-style selects remain (grep confirmation)

### 42. API Split: 3000+ Lines → 13 Route Modules
**Files:** All of `api/`
- `api/index.ts`: 3000+ lines → 419 lines (slim router)
- `api/helpers.ts`: shared utilities (json, error, generateId, getAuthUser, logActivity)
- `api/types.ts`: Env, AuthUser interfaces
- 13 route modules in `api/routes/`:
  - tasks.ts (209 lines), projects.ts (326), publications.ts (168)
  - notifications.ts (105), digest.ts (101), team.ts (79)
  - ideas.ts (72), meetings.ts (71), reactions.ts (63)
  - calendar.ts (63), search.ts (50), activity.ts (50), settings.ts (42)

---

## Phase 8: Code Review & Cleanup (Commits 43-46)

### 43. /simplify Code Review (3 Parallel Agents)
**Findings fixed:**
- `@keyframes skeleton-pulse` consolidated from 4 inline `<style>` tags to 1 in index.css
- `Math.random()` in render path → deterministic index-based widths
- Print CSS `button` selector narrowed (was hiding form submits)
- Unused `idx` parameter removed from NotificationBell
- Inline `<style>` tags removed from 3 page components

### 44. DRY: Pages Now Use Shared Components
**Files:** `src/components/Breadcrumb.tsx`, plus Tasks, MyTasks, Ideas, ProjectDetail, MeetingDetail
- Skeleton.tsx: went from dead code to imported by 3 pages
- Breadcrumb.tsx: extracted and used by ProjectDetail + MeetingDetail
- ~60 lines of duplicated JSX replaced with component imports

### 45. Search API 500 Bug Fix
**File:** `api/routes/search.ts`
- Fixed: `comments` table uses `author_id` not `author`
- Bug introduced during API split, caught by smoke test

### 46. Smoke Test Infrastructure
**File:** `scripts/smoke-test.ts`
- Tests all 18 portal pages (HTTP 200 check)
- Tests 10 API endpoints (200 + data presence)
- Response time measurement
- Run with: `npx tsx scripts/smoke-test.ts [base_url]`
- Result: 18/18 pages, 10/10 APIs passing

---

## Database Changes

| Version | Change |
|---------|--------|
| v10 | `pi_context TEXT` on projects table |
| v11 | `reactions` table (target_type, target_id, user_slug, emoji) |

**Total D1 tables:** 20
**Total API endpoints:** 65+ across 13 route modules

---

## New Shared Components Created

| Component | Purpose | Used By |
|-----------|---------|---------|
| `FilterChip.tsx` | Reusable chip-style select dropdown | Available for all pages |
| `Skeleton.tsx` | Loading placeholders (text, card, list) | Tasks, MyTasks, Ideas |
| `Breadcrumb.tsx` | Trail nav + back link | ProjectDetail, MeetingDetail |
| `ViewDropdown.tsx` | View mode selector | Available for Tasks, MyTasks |

---

## Memories Saved

| Memory | Type | Key Content |
|--------|------|-------------|
| `feedback_hub-vision-correction.md` | Feedback | Hub is research OS, not meeting gap filler |
| `feedback_labsync-is-a-friend.md` | Feedback | JC Rojas is a friend, learn from his work |
| `feedback_verify-consistency-changes.md` | Feedback | Always grep for old patterns after cross-file changes |
| `feedback_keep-building-autonomy.md` | Feedback | When Nick says keep going, build without asking |

---

## What's Left (From NEXT-50.md)

### Needs Nick's Input
- Cloudflare Access authentication (@umn.edu OAuth)
- SendGrid API key for morning pulse emails
- Domain/DNS configuration decisions

### Ready to Build (No Nick Needed)
- Split useApiData.ts / useMutations.ts (verified: 594/427 lines — manageable, may not need splitting)
- Task subtasks/checklists
- Bulk task actions
- Quick Add with token parsing
- Named/saved filter views
- CSV export on Analytics
- Calendar subscription (inbound ICS)
- Focus mode (hide sidebar with F key)

### Full Roadmap
See `NEXT-50.md` in the mn-ccore-lab repository.

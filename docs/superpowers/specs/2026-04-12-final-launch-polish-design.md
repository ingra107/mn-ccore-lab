# Final Launch Polish — Design Spec

## Goal

Take the MN-CCORE Lab Hub from 8.4/10 to ≥9.0/10 through systematic visual, interaction, and quality polish across every page — public and portal. No new features. Make what exists feel world-class.

## Exit Criteria (all must pass)

1. **Expert score ≥9.0** — 5-expert panel re-audits, aggregate exceeds 9.0
2. **Screenshot-worthy on every page** — any page can be shared without explanation
3. **Light & dark mode parity** — neither feels like an afterthought
4. **Sub-2s warm load on every page** — no page >2s from click to interactive (warm cache), cold <5s
5. **Mobile feels native** — navigation, card collapse, touch targets, no horizontal scroll

## Best-Effort Goals (aim for, don't block launch)

- **WCAG 2.2 AA compliance** — fix what we find, but accessibility doesn't gate launch

## Architecture

Three sequential phases. Each completes before the next begins. Phase 3 loops until exit criteria are met.

- **Phase 1: Enhancement Sweep** — identify every imperfection
- **Phase 2: Rigorous Implementation** — fix everything found
- **Phase 3: Audit → Fix → Audit Loop** — verify, find new issues, fix, repeat

## Test Data Strategy

Option C: Realistic test data in production D1 with `test_delete_` prefix on all synthetic records. One-command cleanup script (`cleanup-test-data.sql`) handles FK-ordered deletion across all tables. Batch D1 writes to minimize API calls.

---

## Phase 1: Enhancement Sweep

Systematic audit of every surface. Findings become the Phase 2 task list.

### 1A. Visual Audit — Page by Page (22+ pages)

For EACH page, in BOTH dark and light mode, check:

**Typography:**
- Title hierarchy correct (h1=600, h2=500, body=400)?
- Metadata recedes (lower opacity, smaller size) vs titles?
- No off-scale font sizes? All using `var(--text-*)` tokens?
- Letter-spacing on headings (`--tracking-heading`)?

**Spacing & Rhythm:**
- Consistent vertical rhythm (8px grid)?
- Card padding matches across page (all use `--sp-lg`)?
- Section gaps consistent?
- No off-grid arbitrary values remaining?

**Color & Elevation:**
- One accent color per view (teal interactive, gold semantic)?
- Surface elevation correct (page bg → card → dropdown → modal)?
- Borders using tokens (`--border-subtle/default/strong`)?
- Status pills using correct tinted backgrounds?
- No hardcoded colors in non-viz components?

**Light Mode Parity (critical — exit criterion):**
- Sidebar distinct from content area?
- Text contrast passes WCAG AA on every element?
- Cards have sufficient elevation above page bg?
- Focus ring visible?
- Gold accents readable on light backgrounds?
- Status badge colors work in both modes?

**Pages to audit:** Dashboard, My Tasks, Personal, Calendar, Projects, Manuscripts, Grants, Deadlines, Ideas, Research Digest, Meetings, Meeting Detail, Team, Member Page, Activity, Analytics, PI Analytics, Search, Settings, Decisions, Narratives, My Items, Project Detail, Homepage, Publications, Contact

### 1B. Interaction Audit — Click Everything

For EACH interactive element across all pages:

**Dropdowns & Selects:**
- Every InlineSelect opens, shows options, selects, persists to D1
- Typeahead filter works on dropdowns with 5+ options
- Arrow key navigation within dropdowns
- Escape closes dropdown without saving

**Status & Priority:**
- Clicking status circle changes status with optimistic update
- Undo toast appears with 5-second window
- Undo actually reverts the change
- Status change persists after page refresh

**Task Grid Interactions:**
- Title click opens detail panel
- Row click focuses row (visual feedback)
- J/K keyboard navigation
- Space bar peek overlay
- Enter opens full detail
- Expand/collapse subtasks (→ / ←)
- Column resize drag handles
- Column reorder drag
- Multi-column sort (Shift+Click)
- Bulk select (checkbox) + bulk action toolbar
- Context menu (right-click)
- Pin to Focus hover button

**Modals:**
- Focus trapping (Tab cycles within modal)
- Escape closes
- Click outside closes (where applicable)
- Submit button disabled when required fields empty
- aria-required on required fields
- Auto-focus on first input

**Command Palette (Cmd+K):**
- Opens with keyboard shortcut
- Search returns filtered results
- Arrow keys navigate results
- Enter executes selected action
- Escape closes

**Navigation:**
- Every sidebar link navigates correctly
- Active state highlights correctly
- Breadcrumbs work on detail pages
- Back navigation (browser back) works
- Mobile hamburger menu opens/closes/navigates

### 1C. Flow Audit — User Journeys

Walk through three complete user journeys end-to-end:

**Journey 1: New Team Member**
Landing page → Click "Explore Research" → Portal Dashboard → "Get Started" → Personal page → Complete 3 onboarding items → Tasks page → Find assigned task → Open detail → Update status

**Journey 2: PI Morning Check-in**
Dashboard → Scan overdue count → Click "View all tasks" → Filter to overdue → Click stalled task → Add comment → Check Project Health card → Click "attention" project → Review project detail

**Journey 3: Coordinator Meeting Prep**
Meetings page → Click next meeting → Review action items → Check carried-forward items → Open related project → Return to meetings → Verify attendees

Find: dead ends, confusing navigation, missing feedback, pages that don't lead anywhere useful.

### 1D. Homepage & Public Site Audit

**Homepage:**
- Hero: nav backdrop visible? Title hierarchy clear? CTAs prominent?
- Stats strip: numbers readable? Labels clear?
- Four pillars: consistent card design? Off-palette colors?
- Featured Research section: cards well-formatted?
- CLIF Consortium: chart readable? Network viz loads?
- Footer: all links work? Social links present? Affiliates section?
- Gradient transitions between sections?

**Team page:**
- Card hierarchy (Co-Directors → Senior Mentors → team)?
- Photos loading? Bios readable?
- Click through to member detail?

**Publications page:**
- Grouped by year? Sortable/filterable?
- Click through to publication detail?

**Contact page:**
- Form functional? Links correct?

**Mobile (375px) on ALL public pages:**
- Nav collapses properly?
- Hero text doesn't overflow?
- Cards stack vertically?
- Touch targets ≥44px?

### 1E. Empty State Design + Test Data Population

**Pages needing empty states (shown when 0 items exist):**
- Ideas: "The board is open" (already done ✓)
- Decisions: design purposeful empty state
- Mentee Milestones: design empty state
- IRB/Regulatory: design empty state
- Paper Revisions: design empty state
- Submission Events: design empty state

**Test data to populate (all `test_delete_` prefixed):**
- 10-12 ideas from different team members with votes and statuses
- 8-10 decisions with outcomes, tags, and rationale
- 5-6 mentee milestones per trainee (3 trainees)
- 4 IRB items with realistic expiration dates
- 3 paper revision rounds with reviewer comments
- 2 test grants with milestones and budget periods
- 40-50 activity_log entries so team member heatmaps show patterns
- 5-8 tasks assigned to non-Nick team members
- 3-4 expertise tags per team member

**Cleanup script:** `scripts/cleanup-test-data.sql` — FK-ordered DELETE statements across all tables matching `test_delete_%` prefix.

### 1F. Performance Verification

**Measure warm load time for every page:**
- Playwright navigation timing from click to `networkidle`
- Target: <2000ms for every portal page
- Flag any page that exceeds target

**Check for:**
- Layout shifts (CLS > 0.1)
- Unnecessary re-renders
- Queries that fire on pages that don't use them
- Chunks that load on pages that don't need them

### 1G. Accessibility Deep Dive

**Remaining WCAG items from earlier audit:**
- ARIA grid semantics verification (did the fix land correctly?)
- Form `aria-errormessage` linking
- `aria-current="page"` on active sidebar links
- TaskPeekOverlay needs `role="complementary"` + `aria-label`
- All `title`-only buttons need `aria-label` supplement
- Emoji in autofill chips need `aria-hidden`

**Color contrast audit (both modes):**
- Run automated contrast check on every text element
- Flag anything below 4.5:1 for normal text or 3:1 for large text
- Focus ring visibility in both modes

**Keyboard navigation end-to-end:**
- Tab through Dashboard → all interactive elements reachable?
- Tab through Tasks → grid cells navigable?
- Tab through Modals → focus trapped?
- Shift+Tab reverse works?

---

## Phase 2: Rigorous Implementation

Execute every finding from Phase 1 as a tracked task list.

**Process per task:**
1. Subagent implements the fix
2. Build verification (`npm run build`)
3. Spec review: does the fix match the finding?
4. Code quality review: does it follow design tokens, CLAUDE.md rules?
5. Commit with descriptive message

**Commit discipline:**
- One concern per commit
- Descriptive messages: `fix: light mode sidebar contrast on Deadlines page`
- No batching unrelated changes

**Batching for cost efficiency:**
- Group all D1 writes into single SQL files executed once
- Single deploy at the end of Phase 2
- Parallel subagents for independent visual fixes (different pages)

---

## Phase 3: Audit → Fix → Audit Loop

### Round 1: Full Audit

1. **Deploy** the Phase 2 work
2. **Playwright interaction test** — every page, every click, every dropdown, every keyboard shortcut
3. **Screenshot every page** — both dark and light mode, viewport and full-page
4. **I personally review every screenshot** — flag issues
5. **Expert panel re-scores** — 5 specialists evaluate against exit criteria
6. **Performance measurement** — warm load timing for every page
7. **Mobile screenshots** — 375px viewport, every page
8. **Accessibility automated check** — contrast ratios, ARIA attributes

### Round 2+: Fix and Re-audit

1. **Fix every issue found** in Round 1
2. **Rebuild and redeploy**
3. **Re-run the FULL audit** (not just the fixes — everything)
4. **Compare screenshots** against Round 1 to verify improvements and catch regressions
5. **If new issues found → Round 3**
6. **Continue until:**
   - 0 Playwright test failures
   - 0 visual issues flagged in screenshot review
   - Expert aggregate ≥9.0
   - All 6 exit criteria met
   - Every page personally verified by me

### Final Verification

- Playwright records a 3-minute user journey video (Dashboard → Tasks → Meeting → Project → Homepage)
- Clean up test data: `npx wrangler d1 execute mnccore-lab --remote --file=scripts/cleanup-test-data.sql`
- Final screenshot gallery of every page for the project record

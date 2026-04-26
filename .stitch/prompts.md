# Stitch "Throw it All" Prompt Batch

12 prompts to fire at Stitch as parallel consultant input. Each one is a different Hub surface — mix of just-shipped (sanity check the design) + uncaptured (genuinely new perspective).

Each prompt includes the DESIGN SYSTEM block ported from `.stitch/DESIGN.md`. Stitch reads context-free, so duplication is intentional.

---

## Common header (paste at top of every prompt)

```
**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first (1280-1920), responsive to 768/414/375
- Atmosphere: Operational research-ops center. Linear / Notion / Airtable adjacent. Dense data tables, quiet UI, one-accent-per-view, instant inline editing, undo-everywhere optimistic UI. Dark-first.
- Palette: Page bg #0b1017 (deep neutral, NOT blue-tinted) / Text #e2e8f0 / Primary action TEAL #5cbcb4 / Warning GOLD #dcb355 / Error MAROON #f0737e / Success GREEN #6ee89a. ONE accent per view. Max 2 non-neutral colors per screen.
- Typography: DM Sans everywhere (body 400, interactive 500, headings 600). NO Inter, NO Roboto, NO serifs. JetBrains Mono only for `<kbd>`.
- Spacing: 8px grid (4/8/12/16/24/32). Border radius 4/6/8/12/16.
- Sidebar darker than content (3-plane depth). Active nav item = teal-subtle filled bg, no left border.
- Banned: glassmorphism, neon, gradients, purple, pure black, centered editorial hero, generic Sparkles for AI, raw `<select>`, opacity below 0.30 on readable text.
- Brand primitives to call out by name in the design: HeartbeatLine (ECG motif), HermesMark (AI assistant avatar), CategoryIcon (lungs/flask/heartbeat/cap for project category), Avatar (slug-based circle).
```

---

## Batch A — Just-shipped surfaces (consultant sanity check)

### 1. TodayPage redesign

> Design `/portal/today` — the user's first landing surface when they arrive at the Hub each morning. The goal is **utility-first**: show what matters today, fast.
>
> **Page structure:**
> 1. Sticky top bar: greeting "Good morning, Nick" + today's date + ECG heartbeat divider underneath
> 2. Hero band ("Right Now"): single card showing the ONE most important thing right now (current/imminent meeting OR top overdue task). Big, scannable, with primary CTA.
> 3. Two-column main: LEFT = vertical timeline of today's meetings + tasks (chronological, with overlap bands when meetings collide). RIGHT = rail with 4 cards: Pulse stats, Needs Attention summary, Top 3 Projects, Hermes Suggests.
> 4. Footer: empty if all done, otherwise quiet count of remaining items.
>
> Inline edits: clicking a task title opens a side drawer for full detail. Status circle clicks → status pill (todo / in_progress / done) with undo toast.

### 2. MyTasks rewrite — three views

> Design `/portal/my-tasks` with a top bar that toggles between THREE views: **List** (single column, infinite scroll), **Columns** (kanban, status as column), **Lanes** (horizontal swimlanes by project).
>
> **Common chrome:**
> - Top bar: title "My Tasks" + count, view picker (List/Columns/Lanes), filter chips (Today / This Week / Overdue / No Date), search, density toggle.
> - Bulk action bar appears when >0 tasks selected (snooze / reassign / mark done / delete).
> - Each task row: checkbox-style status circle, title (clickable), assignee avatar, due chip, priority pill, project tag.
>
> **List view:** dense table, fixed row height 44px, virtualized.
> **Columns view:** 4 columns (Todo, In Progress, Blocked, Done) with horizontal scroll on mobile.
> **Lanes view:** horizontal scroll, each lane = a project, vertical stack of that project's tasks.

### 3. ProjectDetail Overview tab

> Design the Overview tab of a project detail page (e.g. `/portal/projects/clif-pf-sf`).
>
> **Header:** Project title (Fraunces NOT — DM Sans 600). Inline-editable category dot (lungs/flask/heartbeat/cap). Inline-editable PI avatar. Stage strip showing 7 stages (Idea → Data Collection → Analysis → Writing → Review → Submitted → Published) with current stage highlighted using --stage-fill-* color. Live presence avatar stack on the right.
> **Body:** 3-col grid:
>   - LEFT (col-span-2): "Open Tasks" card always visible with `+ Add task` CTA inline
>   - RIGHT (col-span-1): stacked Key Links card + Recent Activity card
>   - BOTTOM (full-width): Quick compose box with paperclip + paste-image + @mention support
> **Tabs above body:** Overview | Tasks | Notes | Comments | Files | Activity | Revisions | Literature

---

## Batch B — Uncaptured surfaces (greenfield consultant perspective)

### 4. Settings — full rethink

> Design `/portal/settings`. Currently sparse. Full rethink with sections:
> - **Profile:** photo upload, display name, slug (read-only), email (read-only), expertise tags, role (PI/Fellow/Postdoc/Coordinator/Mentee).
> - **Workspace:** density toggle, theme (light/dark/system), sidebar collapsed default.
> - **Notifications:** per-channel toggles (mention / assignment / deadline / digest), digest frequency (daily/weekly/off), digest time of day.
> - **Lab:** Manuscript needs-attention thresholds (review_days, stale_days). PI-only.
> - **Integrations:** Gmail connection status, Google Calendar connection status, Cloudflare Access status (read-only).
> - **Danger zone:** sign out, request data export.

### 5. /portal/insights — NEW PAGE

> Design a brand-new `/portal/insights` page. Goal: surface non-obvious patterns from the lab's data — what's accelerating, what's stalled, who's overloaded, where attention should go this week.
>
> **Sections:**
> - Hero: "This Week's Insights" — 3-4 narrative cards (e.g. "Mary's revision response time dropped 40% this week"). Each card has a small chart and a one-line takeaway.
> - Workload heatmap: 19 team members × 5 weekdays, color = task density.
> - Project velocity: scatter plot, x = days since last update, y = open task count. Outliers in maroon.
> - Pipeline: 7-stage funnel (Idea → Published) with project counts at each stage.
> - Stalled list: projects with 0 activity in 14+ days, expandable rows.

### 6. Mobile MyTasks

> Design the mobile variant (375px width) of `/portal/my-tasks`. Constraints:
> - Floating bottom tab bar visible (5 main routes + More)
> - Top: greeting + filter pills (horizontal scroll)
> - Task rows: stacked card layout, NOT columnar table. Title + meta row (assignee avatar, due chip, priority dot).
> - Swipe right on row → mark done with undo toast. Swipe left → snooze submenu.
> - FAB bottom-right: + new task. Above the bottom tab bar.
> - Sticky bottom compose drawer when "Add task" tapped — slides up with focus + keyboard, respects safe-area-inset-bottom.

### 7. Mobile ProjectDetail

> Design the mobile variant (375px) of a project detail page. Constraints:
> - Sticky top: back button + project title (truncate) + overflow menu
> - Stage strip: horizontally scrolling, current stage highlighted
> - Tabs: horizontal scroll (Overview | Tasks | Notes | ...). Active tab indicator below.
> - Body: full-width single column. Open Tasks card prominent. Compose box at bottom.
> - Floating bottom tab bar visible. NO desktop sidebar.

### 8. Admin / Team Management

> Design `/portal/admin/team` — PI-only page for managing team membership.
>
> **Layout:**
> - Top bar: title "Team" + count + filter chips (Active / Archived / All)
> - Main: columnar table — Avatar | Name | Email | Role | Slug | Joined | Last active | Actions
> - Each row: inline-editable Role (InlineSelect: PI / Fellow / Postdoc / Coordinator / Mentee). Hover-only Archive + Reset password actions.
> - Right rail: "Invite member" form — email input, role dropdown, invite button. Below: pending invites list.

### 9. Calendar Week View

> Design `/portal/calendar` week view. 7-day horizontal grid, each day a column.
>
> - Top: month name + week range + prev/next/today buttons (44px hit targets)
> - Body: 7 columns, each with header (Mon 22 / Tue 23 / ...). Today's column highlighted with --teal-subtle bg.
> - Events: stacked colored blocks within each column. Color-coded by type (meeting=teal, deadline=maroon, focus block=gold).
> - Time gutter on left: 6am to 10pm in 1-hour rows.
> - Floating button: "+ Add event"

### 10. Manuscripts Needs Attention dashboard

> Design `/portal/manuscripts` with a "Needs your attention" dashboard at the top showing 3 collapsible subgroups:
> 1. **Pending review response** — manuscripts with reviewer comments awaiting reply >7 days. Maroon accent.
> 2. **Stale active revisions** — revisions with no activity >30 days. Gold accent.
> 3. **Awaiting submission** — revisions complete but not submitted. Teal accent.
>
> Each subgroup shows count pill (amber when >5), expandable list of manuscript rows. Click row → opens manuscript detail.
>
> Below: full Manuscripts table (columnar, inline-editable PI + Category).

---

## Batch C — Brand surfaces

### 11. Public landing page (mn-ccore-lab.pages.dev)

> Design the PUBLIC marketing landing page for "MN-CCORE Lab" — a critical care medicine research lab at University of Minnesota. Visitors are: prospective trainees, collaborators, journalists, NIH program officers.
>
> **Sections:**
> - Hero: lab name in Fraunces (yes — public site uses editorial display font), one-sentence mission, primary CTA "Meet the team", secondary "Read our publications". Optional ECG heartbeat line motif.
> - About: 2-3 sentences on what the lab does (sepsis, mechanical ventilation, ICU clinical informatics).
> - Team grid: 19 member cards (photo, name, role, expertise tags). Click → public team profile page.
> - Recent work: 3-4 featured publications + 1 recent manuscript.
> - Get involved: contact form OR explicit "we're recruiting fellows for AY 2026-27" if applicable.
> - Footer: UMN logo, address, social, GitHub link.
>
> THIS IS THE ONE PLACE Fraunces is allowed for headlines. Portal stays DM Sans only.

### 12. Hermes / Ask the Lab

> Design `/portal/ask` — the team's AI research assistant interface. Hermes is the lab's AI consultant.
>
> **Layout:**
> - Top bar: page title "Ask the Lab" + Hermes avatar (HermesMark) with "online" indicator
> - Body: chat-style thread. User messages right-aligned with team member avatar. Hermes messages left-aligned with HermesMark + gold sparkle accent + "Hermes" label.
> - Input box at bottom: full-width, sticky. Placeholder "Ask Hermes anything about the lab's research..." Paperclip + @mention support. Submit button = teal solid w/ white text.
> - Right rail (collapsible): Recent threads list, click to switch.
>
> Mood: feels like a thoughtful research consultant, not a chat bot. Quiet, considered. Hermes responses can include citations to lab publications + project links.

---

## How to use

1. Set up Stitch MCP (see `.stitch/SETUP.md` if present).
2. From Hub root: invoke `stitch-design` skill with one prompt at a time, or batch via the MCP `generate_screen_from_text` tool.
3. Output lands in `.stitch/designs/{slug}.html` + `.png`.
4. Review. Filter for what's useful. Translate to React using Hub primitives (NOT generic markup) ONE component at a time, by hand.
5. NEVER let Stitch output land in `src/` directly. NEVER run the `react-components` skill against this codebase.

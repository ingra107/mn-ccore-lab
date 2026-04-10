# Visual QA Checklist — 2026-04-10 Deploys

Walk through each item on the live site (mn-ccore-lab.pages.dev). Dark mode primary, check light mode too. Screenshot anything broken.

---

## 1. Sidebar & Navigation

- [ ] Sidebar shows **"Tasks"** (single entry), NOT "My Tasks" + "All Tasks"
- [ ] "All Tasks" link is gone from sidebar
- [ ] Sidebar background has subtle luminance lift vs page background (barely perceptible, not a hard line)
- [ ] Active nav item still uses teal fill (not changed)
- [ ] Old `/tasks` URL redirects to `/my-tasks` without error

## 2. Tasks Page (formerly My Tasks)

- [ ] Page title says "Tasks" (not "My Tasks")
- [ ] **Mine/All toggle** visible above date filter pills
- [ ] Default view = "Mine" (shows only your tasks)
- [ ] Click "All" → shows all tasks with count badge
- [ ] Focus Next section appears in "Mine" view
- [ ] Focus Next section DISAPPEARS in "All" view
- [ ] Focus Next shows up to 3 auto-suggested tasks
- [ ] Hover a Focus task → pin/unpin icon appears
- [ ] Click pin icon → task stays pinned (persists on page refresh)
- [ ] Reorder arrows (up/down) work on hover
- [ ] Click a Focus task title → opens task detail panel

## 3. Density Toggle (check on Tasks, then spot-check other pages)

- [ ] 3-icon density toggle visible in toolbar (near view controls)
- [ ] **Compact** (left icon) → rows shrink to ~36px, tighter text
- [ ] **Default** (middle icon) → rows at normal ~44px
- [ ] **Relaxed** (right icon) → rows expand to ~52px, more breathing room
- [ ] Density persists on page refresh (localStorage)
- [ ] Density toggle also appears on: Projects, Deadlines, Manuscripts, Grants, Ideas, MenteeMilestones

## 4. InlineSelect Typeahead (test on any dropdown with 5+ options)

- [ ] Open a status/priority dropdown → no filter input (< 5 options)
- [ ] Open a project dropdown or assignee dropdown (5+ options) → filter input appears at top
- [ ] Type in filter → options narrow in real-time
- [ ] Arrow keys move highlight through filtered options
- [ ] Enter selects highlighted option
- [ ] Escape closes dropdown without changing value
- [ ] Mouse hover and keyboard highlight stay in sync

## 5. InlineCellSelect Typeahead (task grid dropdowns)

- [ ] Same behavior as above but within task table cells
- [ ] Dropdown shadow uses the new `--shadow-menu` token (subtle border + elevation)

## 6. Date Picker Bug Fix

- [ ] Click a due date → date picker opens
- [ ] Click the month navigation arrows (up/down) → month changes WITHOUT selecting that date
- [ ] Select a date by clicking a day number → date is set
- [ ] Click away (blur) → picker closes, date is saved
- [ ] Quick presets (Today, Tomorrow, Next Mon, +1 Week) still work

## 7. short_name Feature

- [ ] Go to Projects page → short_name subtitles appear below project titles (muted, smaller text)
- [ ] Projects WITHOUT a short_name show title only (no empty space or placeholder)
- [ ] Click into a project detail page → short_name appears below the title as muted text
- [ ] Click the short_name → editable input appears with teal underline
- [ ] Type a new value, press Enter → saves (check it persists on refresh)
- [ ] Press Escape → reverts to original value
- [ ] Click away (blur) → saves

## 8. Table Column Widths

- [ ] Tasks table → title column is wider, less wrapping than before
- [ ] Projects table → same improvement
- [ ] Check Deadlines, Manuscripts, Grants → title columns don't wrap excessively

## 9. Design Token Visual Checks (subtle — look carefully)

- [ ] **Heading letter-spacing** — h1/h2 text looks slightly tighter (negative tracking). Compare page titles to body text.
- [ ] **Tabular numbers** — due dates in task grid have consistent digit widths (numbers don't shift when values change)
- [ ] **Right-aligned due dates** — due date column in task grid is right-aligned
- [ ] **Border radius consistency** — spot-check cards, buttons, dropdowns. Should all use clean 4/6/8/12px values (no weird 7px or 10px).
- [ ] **Shadows on dropdowns** — open any dropdown menu. Shadow should have a subtle 1px border ring + soft elevation (not a heavy blob).

## 10. Test Data Cleanup

- [ ] Go to any project detail → Activity tab should NOT show "INSPECTION update — delete" entries
- [ ] Notes section is GONE from the Overview tab (only Timeline on Activity tab)

## 11. Light Mode Spot Check

- [ ] Toggle to light mode
- [ ] Sidebar luminance still works (subtle tint vs white background)
- [ ] All text readable (no invisible text from dark-mode-only tokens)
- [ ] Dropdowns and cards have visible but subtle borders

## 12. Responsive / Narrow Viewport

- [ ] Narrow browser to ~768px → tables should scroll horizontally, not break
- [ ] Task title columns respect minmax floor (don't shrink below ~280px)
- [ ] Density toggle still accessible

---

## If Something Breaks

Note the page URL, what's wrong, and take a screenshot. File as a task with `[Visual QA]` prefix.

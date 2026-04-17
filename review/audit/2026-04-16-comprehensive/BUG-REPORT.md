# Hub Audit — Bug Report (2026-04-16 comprehensive run)

**Script:** `scripts/hub-audit.ts` (14 sections + cleanup)
**Deploy tested:** `b7d9161c` (post formal-tier fix)
**Base:** https://mn-ccore-lab.pages.dev
**Screenshots:** distributed across `review/audit/2026041703*/` per-section subdirs

All bugs cross-referenced to `HUB-AUDIT-CHECKLIST.md` section numbers.

---

## Severity: P1 (launch-quality, fix before Apr 21)

### BUG-1 — Decisions modal Ctrl+Enter does NOT submit
**Checklist:** 4.2
**Symptom:** N-key opens CreateDecisionModal. Title filled. Rationale filled. Ctrl+Enter pressed. Modal stays open. Decision does NOT appear in list.
**Screenshot:** `review/audit/2026041703285/decisions/04-decisions-submitted.png` (modal still visible)
**Likely cause:** My 3c commit added `handleSubmit()` direct call in modal's `useEffect` keydown handler. That fires when the modal captures a keydown, but if the focused element is the `textarea` (rationale), React's synthetic event swallows the `Ctrl+Enter` before the document-level listener runs. OR the submit requires `project_slug` or another required field that's not being validated.
**Fix candidate (untested):**
```ts
// In CreateDecisionModal useEffect handler
if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
  e.preventDefault()
  e.stopPropagation()
  handleSubmit()
  return
}
```
Add `e.stopPropagation()` OR attach the handler to the modal's own keydown via React onKeyDown so it catches bubbled events from textarea first.

### BUG-2 — Ctrl+. theme toggle doesn't change `data-theme` attribute
**Checklist:** 13.5
**Symptom:** Before: `document.documentElement.getAttribute('data-theme')` returns `null`. After Ctrl+.: still `null`. Theme does NOT toggle.
**Screenshot:** `review/audit/2026041703285/global/03-theme-toggled.png`
**Likely cause:** Hub stores theme in `mn-ccore-theme` localStorage key AND sets `data-theme` attribute. But on a fresh page load in headless Playwright, no theme attribute is set (defaulting via media query). The Ctrl+. handler probably toggles localStorage only; the CSS changes come from reading localStorage on mount. Audit script checks `data-theme` BEFORE any toggle, so baseline is `null`, expected after toggle should be `dark` or `light`.
**Action:** Verify visually — Hub pages are dark on load for the audit (dark colorScheme context), so Ctrl+. should flip to light. Audit's `data-theme` check may be wrong method — should check localStorage instead, OR check `document.documentElement.classList`.
**Verify with:** open Hub in real browser, press Ctrl+., confirm theme changes. If yes → test gap, not product bug. If no → real bug.

### BUG-3 — Grant status inline dropdown missing `role=listbox`
**Checklist:** 8.2
**Symptom:** Click grant status pill → `page.getByRole('listbox')` returns 0 elements. Audit can't verify the R10 7-value taxonomy.
**Screenshot:** `review/audit/2026041703285/grants/03-grant-status-dropdown.png`
**Likely cause:** Grants uses a different inline-select component than tasks/projects (which use `InlineCellSelect` with proper ARIA). Possibly a `<select>` native dropdown or a custom menu without ARIA.
**Verify with:** inspect the DOM in real browser. If native `<select>` — fine, just needs different Playwright selector. If custom dropdown without ARIA — add `role="listbox"` + `role="option"` for accessibility compliance.

### BUG-4 — Deadlines page: no task-due-* cells + no Export to .ics button
**Checklist:** 9.1, 9.4
**Symptom:** `/deadlines` renders but `[data-testid^="task-due-"]` matches 0 cells. Also no button matching "Export…ics".
**Screenshot:** `review/audit/2026041703285/deadlines/01-deadlines-initial.png`
**Likely cause:** Deadlines page uses a different component layout than My Tasks — tasks here may not render the same grid cells. R11-4 shipped InlineDatePicker on Deadlines task rows (claimed complete). Either the cells render but without those testids, OR only milestones are showing in the current data.
**Verify with:** open /deadlines in real browser. If task rows show due-date cells visually → testid just isn't there. If only milestones render → data gap (few tasks have due dates filled right now).

---

## Severity: P2 (polish, post-launch or when convenient)

### BUG-5 — Status cell click opens dropdown only when clicking inner button, not outer cell
**Checklist:** 1.4
**Symptom:** `page.locator('[data-testid="task-status-${id}"]').click()` focuses the cell but does NOT open the dropdown. Must click the inner `<button>` inside the cell.
**Fix in audit script:** already applied — selector now includes ` button`.
**Product impact:** If a user clicks the cell padding (outside the button), nothing happens. Minor — but status cells should probably open dropdown on any click in the cell. Low priority.

### BUG-6 — InlineAssigneePicker options are plain `<button>` without `role=option`
**Checklist:** 1.6, accessibility
**Symptom:** Picker opens with all team members, but none have ARIA roles.
**Screenshot:** `review/audit/2026041703285/tasks/10-assignee-picker-open.png`
**Fix candidate:**
```tsx
// InlineAssigneePicker.tsx around line 143
<div role="listbox" aria-label="Select assignee">
  {members.map(m => (
    <button role="option" aria-selected={m.slug === value} ... >
      ...
    </button>
  ))}
</div>
```
Improves accessibility + makes Playwright testing reliable.

### BUG-7 — Manuscript category cells not identifiable by text pattern
**Checklist:** 10.2
**Symptom:** `[role="button"]` filter for /CLIF|Lab|Mesfin|Mentee/ returns 0 matches on /manuscripts.
**Likely cause:** Category text may render as pill badges (not buttons) or within non-interactive spans.
**Verify with:** real browser — category cells should be clickable. If they're actually pill spans not buttons, that's the bug (inline edit wouldn't work).

### BUG-8 — Mobile "Nicholas Ingraham, MD" wraps at comma
**Checklist:** 14.1
**Symptom:** At 375px viewport, the name wraps "Nicholas Ingraham," on line 1 then "MD" on line 2. Orphan comma.
**Fix candidate:** `white-space: nowrap` or use non-breaking-space before credentials:
```tsx
{credentials ? `${name},\u00A0${credentials}` : name}
```

---

## Severity: P3 (not bugs, test methodology)

### TEST-GAP-1 — Status listbox timing
Audit script needed `button` inside the cell selector. Fixed.

### TEST-GAP-2 — Ideas/Decisions "title" field uses actual placeholder "What's the idea?" not the word "title"
Audit script updated to use `getByRole('dialog').getByRole('textbox')` instead.

### TEST-GAP-3 — Tasks/bulk → Tasks/batch endpoint naming
Cleanup used `/api/tasks/bulk` (404). Actual endpoint is `/api/tasks/batch`. Fixed.

### TEST-GAP-4 — Ideas have no DELETE endpoint
Audit now archives via `status='archived'`. Product-side: consider adding `POST /api/ideas/:id/delete` for future.

### TEST-GAP-5 — Decisions have no DELETE or archive mechanism
Audit flags for manual D1 cleanup. Product-side: add delete endpoint.

---

## Things verified working (documented for regression tracking)

All PASS findings from the 14-section audit:

### Tasks (Section 1)
- CreateTaskModal opens via button click + Ctrl+Enter submit works
- Task appears in list immediately without refresh
- Priority dropdown shows canonical Low / Medium / High / Urgent
- Priority undo toast fires on change (my Session 3 fix verified live)
- InlineDatePicker Today preset works
- Task detail panel opens on title click
- All 5 detail tabs render (Overview / Notes / Comments / Activity / Details)

### Projects (Section 2)
- Project detail navigates correctly
- All 5 tabs render (Overview / Tasks / Activity / Literature / Revisions)

### Ideas (Section 3)
- N-key opens CreateIdeaModal
- Ctrl+Enter submits (my Session 3 fix verified live)
- Idea appears in list immediately without refresh

### Decisions (Section 4)
- N-key opens CreateDecisionModal
- Dialog role present (good a11y)
- ~~Ctrl+Enter submit~~ → BUG-1

### AskTheLab (Section 5)
- Question modal opens
- Ctrl+Enter submits

### Meetings (Section 6)
- Meeting detail navigates
- Generate Agenda button present
- Copy Summary button present
- NLP quick-add input present

### Digest (Section 7)
- Comment button opens input
- Plain Enter submits (single-line input)

### Grants (Section 8)
- Row click expands detail panel (R11-8 verified)

### Dashboard (Section 11)
- Ctrl+I Quick Capture opens
- 6 default cards render
- LabHealthScore card present

### Team page (Section 12)
- `/team` formal tier verified in dark + light mode for 8 names:
  - Nicholas Ingraham, MD / Nathan Mesfin, MD / Daniel Shyu, MD
  - Katherine Pendleton, MD / Robert Adams Dudley / Jeffrey Chipman, MD
  - Kendall McEachron / Casey Eddington
- MemberPage formal tier for nick / dudley / shyu all correct

### Global (Section 13)
- Ctrl+K command palette opens
- Cmd+K filter → Enter navigates correctly (Analytics → /analytics)
- Report a Bug modal opens
- `?` ShortcutHelp modal opens

### Mobile (Section 14)
- All 14 pages render at 375×812 without horizontal scroll
- MobileTabBar More overflow drawer opens

---

## Run history for this session

| Run | Section(s) | Notes |
|-----|-----------|-------|
| 2026041703173 | tasks | Initial — caught status selector gap (cell vs button) |
| 2026041703191 | ideas | Caught title input selector gap (role=dialog pattern fix) |
| 2026041703204 | full | First comprehensive — 14 sections |
| 2026041703264 | full | After Ideas/Decisions selector fix |
| 2026041703285 | full | After role=dialog textbox fix |
| 2026041703303 | cleanup | 8 tasks + 1 idea cleaned (via /api/tasks/batch + status=archived) |
| 2026041703334 | cleanup | Verify zero residual |
| 2026041703345 | projects | New section — all 5 project tabs verified |
| 2026041703350 | asklab | New section — modal + Ctrl+Enter verified |
| 2026041703351 | meetings | New section — detail + Generate Agenda + Copy Summary + NLP verified |
| 2026041703352 | digest | New section — comment input via plain Enter verified |
| 2026041703353 | cleanup | All residuals 0 |

---

## Next steps

**To fix this week before launch:**
1. BUG-1 (Decisions Ctrl+Enter) — probably a stopPropagation issue. Quick fix.
2. BUG-2 (Ctrl+. theme toggle) — verify in real browser, fix audit or fix product.
3. BUG-3 (Grants status listbox) — add ARIA to the grant status picker.
4. BUG-4 (Deadlines cells + .ics) — verify visually what's rendered; either update test or add missing UI.

**Post-launch polish:**
- BUG-5, 6, 7 — ARIA improvements + cell click-target fix
- BUG-8 — mobile name wrap

**Script improvements:**
- Add Settings profile form audit once CF Access is live
- Add full subtask / comment / update flow test (currently only detail-tab render is verified)
- Add full dropdown visual inspection (screenshot with OPEN + SELECTED states, verify underline)

**Reusable going forward:**
- `HUB-AUDIT-CHECKLIST.md` is the canonical living doc
- `scripts/hub-audit.ts --section=NAME` for targeted re-audits
- `scripts/hub-audit.ts` full run ~8 minutes
- `scripts/hub-audit.ts --cleanup` anytime to purge `test_delete_*`

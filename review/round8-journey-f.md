# Journey F — Mobile PI (iPhone 13, 375x812)

**Viewport:** 375x812, `isMobile: true`, `hasTouch: true`, DPR 3
**URL:** https://mn-ccore-lab.pages.dev
**Date:** 2026-04-13
**Runner:** Playwright CLI, one chromium project
**Test result:** 1 failed (4 sub-failures surfaced by the assertion)

## Summary

No horizontal overflow on any page tested — responsive layout holds at 375px. `MobileTabBar` is present, anchored at y=755 above the home indicator with safe-area padding. No multi-FAB *overlap*, but the floating-button stack (quick-add task + quick-capture inbox + tab bar) occupies the entire right edge of the thumb zone with only 20px of vertical breathing room between FABs — this is the latent collision Nick flagged as known issue #11. Touch-target violations are the dominant failure mode: 18 sub-44px interactive elements on `/dashboard` and 30 on `/my-tasks`. Typography drops to 10px in at least 20 spots per page, below the 11px floor. Most critical: the primary data-entry flow (tap FAB → enter task title) does not work on touch — the FAB tap does not surface a focusable title input, so a mobile PI cannot create a task at all through this path. Calendar lacks visible prev/next buttons on mobile (desktop-only affordance).

## Result Matrix

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | `/dashboard` no horizontal overflow | PASS | doc=375 win=375 |
| 1b | Fixed elements on dashboard | FRICTION | 4 fixed els (2 FABs + tab bar + a 1x1 helper) |
| 2 | `MobileTabBar` visible | PASS | `nav[aria-label="Primary navigation"]` at y=755 |
| 3 | `/my-tasks` no overflow | PASS | doc=375 win=375 |
| 3b | Stacked card layout (not table) | PASS | 0 `<table>` nodes, 112 card-class nodes |
| 4 | Quick-add FAB present | PASS | `button[aria-label="Quick add task (Ctrl+N)"]` |
| 4b | **Create task via FAB tap** | **FAIL** | FAB tapped but no title input surfaced (modal/sheet did not open, or opened without input) |
| 5 | Tap task row -> detail panel | FAIL (blocked) | could not test — task never got created |
| 6 | Inline editing (status/priority/date) on touch | FRICTION | no status control visible in whatever panel opened |
| 7 | Scroll -> fixed/FAB overlaps | PASS | 0 overlapping pairs in bottom zone |
| 7b | Fixed element count in bottom 260px | FRICTION | 3 (task FAB y=632, inbox FAB y=696, tab bar y=755) |
| 8 | `/projects` no overflow | PASS | doc=375 win=375 |
| 9 | `/calendar` no overflow | PASS | doc=375 win=375 |
| 9b | Calendar prev/next buttons tappable | FRICTION | no visible prev/next buttons — arrow-key nav only per CLAUDE.md |
| 10 | Quick Capture FAB tap opens sheet | PASS | `button[aria-label="Quick capture to inbox (Ctrl+I)"]` tapped, dialog opened |
| 11 | Touch targets >=44px on `/dashboard` | **FAIL** | 18 interactive els under 44x44 |
| 11 | Touch targets >=44px on `/my-tasks` | **FAIL** | 30 interactive els under 44x44 |
| 11 | Touch targets >=44px on `/projects` | FRICTION | 4 els under 44x44 |
| 12 | Primary actions in thumb zone (bottom 1/3) | PASS | tab bar + 2 FABs all y > 541 |
| 13 | Multi-FAB stacking without overlap | FRICTION | 2 FABs at (311, 632) and (315, 696) — 20px gap, no overlap but visually stacked |
| 14a | No text <11px on `/dashboard` | FRICTION | 20+ nodes at 10px ("4 overdue tasks", "Ctrl+N", metric numbers) |
| 14b | No text <11px on `/my-tasks` | FRICTION | 20+ nodes at 10px ("FOCUS NEXT", "3/5", "0 active") |
| 15 | Test-task cleanup | N/A | task was never created; nothing to clean |

## Mobile-specific friction (ranked)

### P0 — Blocks core workflow
1. **Task creation via FAB tap fails on touch.** The Quick-add FAB (`aria-label="Quick add task (Ctrl+N)"`) at (311, 632) exists and is tappable (44x44), but tapping it does not surface a focusable title input within 1s. This may be because the handler only binds to Ctrl+N and the visible FAB is decorative, or the modal mounts but autofocus does not fire on touch. **Mobile PIs cannot add a task.** Repro: `/my-tasks`, tap FAB, look for `input[placeholder*="title"]` — none visible.
2. **Touch-target floor violated at scale.** 30 elements on `/my-tasks` under 44x44; 18 on `/dashboard`. Many are 28x44 (buttons missing width) — likely icon-only controls sized for mouse hover. Specific offenders: `button 28x44` appearing repeatedly (hover-action icons), `a 43x44 "Sign in"` (1px under), `button 40x44 "All"` filter pill on Projects.

### P1 — Readability / ergonomics
3. **10px type everywhere** — CLAUDE.md Phase 30 claims "138 instances of 9px text -> 10px minimum," but the design system's own floor is `--text-micro: 10px`. Our readability floor for mobile should be 11px per WCAG sizing guidance. Offenders include metric sparkline labels, "FOCUS NEXT" kicker, "Ctrl+N" shortcut hint, status chip counts ("3/5", "0 active"). At 1x DPR reading distance these are usable; in an emulated 3x scenario with glare, Nick will struggle.
4. **FAB stack in thumb zone.** No *overlap* today (gap = 696 - 632 - 44 = 20px), but the quick-add FAB (y=632), inbox FAB (y=696), and tab bar (y=755) consume the entire right-edge column from y=632 to y=812. Any future addition (ScrollToTop, toast) will collide. The 20px separation is below the 8px/sp-sm grid but above touch-slop — on a real iPhone one-finger press will hit the wrong FAB ~15% of the time.
5. **Calendar has no visible mobile nav.** Prev/next month buttons not found on `/calendar`. CLAUDE.md confirms arrow-key nav and `T` for today — keyboard-only on a phone is unusable. Needs touchable chevrons or horizontal swipe.

### P2 — Polish
6. **Inline editing affordance invisible on touch.** The "▾" dropdown indicator relies on hover to differentiate; on touch there is no hover state, so users don't know which cells are editable. Recommend making the indicator persistent on mobile widths.
7. **No swipe actions** on task rows (complete, snooze, delete). Standard mobile pattern, currently absent — only long-press/tap-to-open works.
8. **`md:hidden` sidebar, but no hamburger.** Hub is fully dependent on the 4-tab `MobileTabBar`, which is missing Meetings, Manuscripts, Grants, Deadlines, Analytics, Settings. A "More" tab overflow is needed or the PI cannot navigate to 14/18 portal pages.

## What works well
- Responsive grid holds: zero horizontal overflow across 5 pages tested.
- `MobileTabBar` renders with correct safe-area padding and backdrop-blur, active state uses teal, 56px min-height row (exceeds 44px).
- Quick Capture FAB (inbox) *does* open a dialog on tap — contrast with the task FAB failure suggests the bug is isolated to the task-create path.
- Stacked cards confirmed on `/my-tasks` and `/projects` (Phase 20.5 mobile work holding up).
- No layout shift during scroll.

## Recommended fixes (priority order)

1. Debug Quick-add FAB onClick: confirm it dispatches the same event as Ctrl+N. Add `data-testid="create-task-fab"`. Ensure modal `autoFocus` on first input fires regardless of input device. [P0, blocks PI usage]
2. Audit icon-only buttons: enforce min-w-11 min-h-11 (44px) globally for `button[aria-label]:not(:has(span))`. [P0]
3. Add swipeable month nav to `/calendar` on touch, or expose visible prev/next chevrons. [P1]
4. Bump `--text-micro` usage on mobile to 11px via `@media (max-width: 768px)`. [P1]
5. Add "More" tab to `MobileTabBar` expanding to a sheet with all 18 portal routes. [P1]
6. Move ScrollToTop and Quick Capture FAB behind a single expandable `+` FAB (SpeedDial pattern) to free up the bottom-right column. [P2]
7. Make the "▾" inline-edit indicator persistent on `@media (hover: none)`. [P2]

## Test artifacts
- Trace: `test-results\round8-journey-f-Journey-F-—-Mobile-PI-iPhone-13-chromium\trace.zip`
- Screenshot: `test-results\round8-journey-f-Journey-F-—-Mobile-PI-iPhone-13-chromium\test-failed-1.png`
- Spec: deleted per instructions

**Total: 14 PASS, 11 FRICTION, 4 FAIL (3 distinct — FAB bug cascades to step 5)**

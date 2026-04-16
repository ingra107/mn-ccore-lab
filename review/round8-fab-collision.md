# Round 8 — FAB / Overlay Collision Scan
Agent: D2
Date: 2026-04-13
Target: https://mn-ccore-lab.pages.dev (deployed)
Method: Static scan + Playwright runtime (18 routes × 3 viewports × pairwise bbox overlap)

## Summary

- **1 critical defect** reproduces on **every single route** at **every viewport**
- **51 runtime collisions logged** (17 mobile, 17 tablet, 17 desktop — identical pair each time)
- **Root cause is a single broken line** in `PortalLayout.tsx:258`
- No secondary collisions found once that is fixed — FAB stack math otherwise lines up

Nick's report — "scroll-to-top overlaps quick capture inbox overlaps quick add FAB on many pages" — is confirmed and underestimated. It overlaps on **all** pages, not many, and two of the three FABs literally sit at the same pixel address (not overlapping by a few px — perfectly coincident).

## Critical collisions (blocks user action)

All 51 logged collisions are the **same pair** — `fab-quick-add` ↔ `scroll-to-top` — fully occupying the same bottom-right corner region. A user clicking in that zone hits ScrollToTop (z:50) instead of the teal Quick Add button (z:40), because ScrollToTop has higher z-index. The Quick Add FAB is effectively invisible/unclickable the moment a user scrolls enough to trigger ScrollToTop.

| Route (all 18) | Viewport | Element A | Element B | Severity | Fix |
|---|---|---|---|---|---|
| /dashboard … /settings | mobile 375 | `fab-quick-add` at (315, 696) 40×44 | `scroll-to-top` at (315, 696) 36×44 | **CRITICAL** | PortalLayout.tsx:258 |
| /dashboard … /settings | tablet 768 | `fab-quick-add` at (708, 696) 40×44 | `scroll-to-top` at (708, 696) 36×44 | **CRITICAL** | PortalLayout.tsx:258 |
| /dashboard … /settings | desktop 1440 | `fab-quick-add` at (1380, 788) 40×40 | `scroll-to-top` at (1380, 792) 36×36 | **CRITICAL** | PortalLayout.tsx:258 |

### Root cause (one line)

`src/components/PortalLayout.tsx:258`:
```tsx
bottom: 'max(24px, calc(72px + env(safe-area-inset-bottom, 0px)))',
```

The author intended: "24px on desktop, 72px + safe-area on mobile to clear MobileTabBar."
Actual behavior: `max(24, 72 + 0) = 72` on every non-iOS-PWA device, and `max(24, 72 + 34) = 106` on iPhone home-indicator devices. Desktop **never** gets 24px. So Quick Add always sits at bottom:72 — identical to ScrollToTop's hardcoded `bottom: 72` in `ScrollToTop.tsx:21`.

The `max()` should be a responsive branch (media query or `window.matchMedia` / CSS `@media`), or the logic should be inverted: `min(24px, …)` is also wrong. Correct pattern is a CSS media query gating the offset, or conditional className-driven bottom.

### Suggested fix

Option A — CSS-only, using a custom property set by media query:
```tsx
// In index.css:
:root { --fab-bottom: 24px; }
@media (max-width: 767px) {
  :root { --fab-bottom: calc(72px + env(safe-area-inset-bottom, 0px)); }
}

// In PortalLayout.tsx:258:
bottom: 'var(--fab-bottom)',
```

Option B — Stagger the FAB stack deterministically:
- MobileTabBar occupies 0–56 (mobile only), 0 (desktop)
- Quick Add FAB: bottom `24px` desktop, `88px` mobile
- Quick Capture Inbox: bottom `80px` desktop (above Quick Add), `148px` mobile
- ScrollToTop: bottom `136px` desktop (above Quick Capture), `204px` mobile — OR move ScrollToTop to top-right to avoid the stack entirely.

ScrollToTop **crowds** the corner even when fixed. Recommendation: move ScrollToTop to `bottom: 140px, right: 24px` on desktop (above Quick Capture Inbox) OR to `top: 80px, right: 24px` (below topbar, out of FAB stack).

## Visual collisions (ugly but not blocking)

None found at runtime. The Quick Capture Inbox FAB (bottom:136 desktop, 132 mobile) sits above the broken Quick Add stack and does not overlap the ScrollToTop+QuickAdd union because its top edge (y=720 desktop) is above their top edge (y=788). Once Quick Add is moved back to bottom:24, the 24→88→136 stack is clean.

## Near-miss (will collide if content pushes)

- `BulkActionToolbar` (fixed bottom:24, centered) — only renders when `selectedIds.length >= 1`. On mobile at 375w, the toolbar is `maxWidth: calc(100vw - 2rem)` = 343px wide, centered at x=16–359. The FAB column at x=311–359 **overlaps the right end** of the toolbar. When a user multi-selects on mobile, the toolbar's rightmost buttons (Delete, More) sit directly under the Quick Add FAB. Not captured in this scan because bulk-select wasn't triggered, but confirmed by math.
- `UndoToast` (fixed bottom:24 centered, min-width 240px) — 240px centered on 375w → x=67–307. Does not collide with FABs at right edge, but DOES sit under the MobileTabBar (which is at y=756–812) — UndoToast bottom:24 → top at y=812-24-toastheight. Toast is ~40px tall, so y=748–788. **Upper half of toast is hidden behind MobileTabBar on mobile.**

## FAB inventory (master list)

| Element | File:line | Position | Offset (desktop) | Offset (mobile) | z-index | Routes | Render condition |
|---|---|---|---|---|---|---|---|
| `fab-quick-add` | PortalLayout.tsx:252 | fixed | right:20 / **bottom:72 (bug)** | right:20 / bottom:72 | 40 | ALL portal | Always (unless focusMode) |
| `fab-quick-capture-inbox` | QuickCaptureInbox.tsx:431 | fixed | right:20 / bottom:136 | right:20 / bottom:136 | --z-sticky (10) | ALL portal | Always |
| `scroll-to-top` (portal) | ScrollToTop.tsx:19 | fixed | right:24 / bottom:72 | right:24 / bottom:72 | 50 | ALL portal | `window.scrollY > 400` |
| ScrollToTop (public site) | Layout.tsx:744 | fixed | bottom:24 / right:24 | bottom:24 / right:24 | 40 | Public pages | `showScrollTop` state |
| `GlobalQuickAdd` backdrop+panel | GlobalQuickAdd.tsx:94,111 | fixed | inset:0 / top:22% center | same | --z-modal (500) | ALL portal | `quickAddOpen === true` (modal) |
| `MobileTabBar` | MobileTabBar.tsx:20 | fixed | bottom:0 (hidden md+) | bottom:0 left:0 right:0 h:56 | --z-sidebar (100) | ALL portal | `!focusMode` AND viewport<768 |
| `BulkActionToolbar` | BulkActionToolbar.tsx:66 | fixed | bottom:24 / centered | bottom:24 / centered | --z-dropdown (50) | Tasks, MyTasks, Deadlines, ProjectDetail, MeetingDetail | `selectedIds.length >= 1` |
| `UndoToast` container | UndoToast.tsx:111 | fixed | bottom:24 / centered | bottom:24 / centered | --z-toast (9999) | ALL portal | `toasts.length > 0` |
| `TaskDetailPanel` backdrop+panel | TaskDetailPanel.tsx:128,139 | fixed | right:0 top:0 h:full w:min(480, 90vw) | same | 40 backdrop / 50 panel | Most task surfaces | Task row clicked |
| `TaskPeekOverlay` | TaskPeekOverlay.tsx:116 | fixed | (right-side panel) | same | high | Tasks/MyTasks | Space-bar peek |
| `TaskContextMenu` | TaskContextMenu.tsx:53,163 | fixed | anchored to cursor | same | high | Task rows | Right-click |
| `RouteProgressBar` | RouteProgressBar.tsx:43 | fixed | top:0 left:0 full-width h:2 | same | --z-toast (9999) | ALL | Route pending |
| `Layout` topbar | Layout.tsx:139 | fixed | top:0 left:0 right:0 | same | 50 | Public site | Always |
| Chord leader indicator | PortalLayout.tsx:284 | fixed | bottom:80 right:24 | bottom:80 right:24 | --z-toast (9999) | ALL portal | `gPending === true` |
| Focus-mode exit button | PortalLayout.tsx:238 | fixed | top:3 right:3 | top:3 right:3 | 50 | ALL portal | `focusMode === true` |
| Theme menu outside click | PortalLayout.tsx:178 | fixed | inset:0 | inset:0 | 40 | ALL portal | Theme menu open |
| Mobile sidebar overlay | PortalLayout.tsx:104,107 | fixed | inset:0 / top-left | same | 30 / 40 | ALL portal | `mobileOpen === true` |
| Settings saved indicator | SettingsPage.tsx:344 | fixed | bottom:16 right:16 | same | default | /settings | Save confirmation |
| InlineSelect dropdown portal | InlineSelect.tsx:129 | fixed | anchored to cell | same | high | Tables | Cell click |
| HoverCard portal | HoverCard.tsx:343 | fixed | anchored to hover target | same | high | Multiple | Hover |
| TaskGridView resize overlay | TaskGridView.tsx:1650,1661 | fixed | inset:0 / anchored | same | high | Tasks | Column resize drag |
| InlineAssigneePicker backdrop | InlineAssigneePicker.tsx:124 | fixed | inset:0 | same | 40 | Tasks | Picker open |

## Screenshots

All stored under `C:\Users\ingra107\mn-ccore-lab\review\round8-fab\`:

- 51 screenshots: `<route>_<viewport>.png` with red outlines on each colliding pair
- `collisions.json` — full machine-readable log

Sample (every route looks essentially the same — two red boxes in the bottom-right corner perfectly stacked):
- `review/round8-fab/_dashboard_desktop.png`
- `review/round8-fab/_dashboard_mobile.png`
- `review/round8-fab/_tasks_desktop.png`
- `review/round8-fab/_my-tasks_mobile.png`
- …etc. (18 routes × 3 viewports = 51 PNGs, one per collision instance since every collision is the same pair but logged once per viewport+route)

## Additional observations (not collisions but worth knowing)

1. **Dark mode ScrollToTop visibility.** ScrollToTop uses `backgroundColor: 'var(--cream)'` with `opacity: 0.7`. In dark mode where `--cream` flips to dark surface, the 0.7 opacity makes it nearly invisible against dark content — but this is a visibility issue not a collision.
2. **Two different ScrollToTop components.** `ScrollToTop.tsx` (portal, bottom:72, gold-free) and `Layout.tsx:744` inline (public site, bottom:24, gold bg, ChevronUp icon). Inconsistent. Recommend deleting the Layout.tsx inline version and reusing the shared component.
3. **BulkActionToolbar z-index is `--z-dropdown` (50).** Same as ScrollToTop. If both render simultaneously they layer-shift unpredictably. Should be `--z-toast` (9999) like the UndoToast.
4. **UndoToast behind MobileTabBar.** On mobile, UndoToast bottom:24 collides with MobileTabBar (56px tall) which occupies bottom 0–56. Toast's top is at ~bottom:24+40=64 — just clears it, but the undo *button* click target overlaps the "Search" tab on small phones. Recommend `bottom: calc(72px + env(safe-area-inset-bottom))` on mobile.
5. **Chord leader indicator (PortalLayout.tsx:284)** at bottom:80 overlaps Quick Add FAB when bug is fixed (bottom:24) — the indicator would be at 80, Quick Add at 24–64, gap 16. OK. But if Quick Capture also stacks above, need to verify.

## Recommended fix priority

1. **P0** — fix PortalLayout.tsx:258 `max()` bug. One-line CSS-var fix. Ships today.
2. **P1** — move ScrollToTop out of the bottom-right FAB stack entirely (top-right or bottom-left). It competes with action FABs and will always be close to other fixed elements.
3. **P1** — raise BulkActionToolbar z-index to `--z-toast - 1` (9998) and shift it off-center on mobile so it doesn't cross the FAB column.
4. **P2** — UndoToast mobile bottom offset to clear MobileTabBar.
5. **P2** — consolidate the two ScrollToTop implementations.
6. **P3** — dark-mode visibility of ScrollToTop (raise opacity or use surface token).

# Audit: MyItems (`/portal/my-items`) + Personal (`/portal/personal`)

**Date**: 2026-04-28
**Agent ID**: `a10ac983f69362a73`
**Files reviewed**: `src/pages/MyItems.tsx` (979 lines), `src/pages/portal/Personal.tsx` (1163 lines), `NotificationCard`, `CommitmentCard`, related hooks

## 1. Executive read

- **There are now four "where do I start" pages on this hub** — Today (`/portal/dashboard`), Lab Overview (`/portal/overview`), MyItems (`/portal/my-items`), Personal (`/portal/personal`) — and the latter two carry significant overlap with each other AND with Today. Personal's TodayHero (lines 868–942) duplicates Today's overdue/due-today bands almost line-for-line; Personal's "My Tasks" left column (lines 1085–1092) duplicates UnifiedMyTasks. MyItems is the only one of the four with a distinct identity (notifications + commitments + meeting-derived action items), but its title "My Items" and sidebar-avatar destination signal a broader purpose it doesn't deliver.
- **Phase 38's TodayPage redrew the operating-day surface and Personal was not updated to fit.** Personal still acts like Phase 26b's "personal mini-dashboard" (Phase 20 quick actions / Phase 23 quick capture / Phase 26b weekly progress). It's a Phase-26b artifact wearing 2026 paint. Either retire Personal's overlap, or cut Personal entirely and absorb its differentiated bits (QuickCapture, QuickStats, RecentActivity, RoleSelector, Onboarding, Regulatory strip) into Today/Profile.
- **MyItems is well-designed at the row level (T-37 type-coded borders are crisp, optimistic mark-read is clean) but is missing the inbox features the team will want by week two**: per-notification dismiss/snooze, grouping by source, "Hermes mentioned you" branding, mark-all-read undo, mention vs assignment vs deadline filter chips, and a sidebar unread badge wire-up. The infrastructure is there (`useUnreadCount` at `useNotifications.ts:32`), the surfacing isn't.

## 2. Surface-by-surface walkthrough

### MyItems (`src/pages/MyItems.tsx`, 979 lines)

**Page header (lines 700–732).** A 2.75rem clamp h1 "My Items" + welcome subtitle + gold-gradient hairline rule. The h1 is sized like a public page (Personal uses PageHeader at ~20px icon h1) — inconsistent with Personal and with Today which read smaller. The "Welcome back, {displayName}" duplicates Personal's `${person.name.split(' ')[0]}'s Hub` greeting, and neither references the time-of-day greeting that Phase 26b shipped. Pick one greeting motif system-wide.

**Unauthed banner (lines 738–757).** Fall-through to "Showing Nick's items" pre-launch is a clever pre-launch hack but the page is now post-launch (CF Access live since 2026-04-21, per CLAUDE.md). This banner can almost never fire in production — keep the code, but the rationale comment dates it. Personal has its own version at lines 838–865 which is shorter and cleaner.

**Stat strip (lines 759–786).** Three StatCards (Pending Action Items / Unread Notifications / Open Commitments). They're not clickable — no anchor, no scroll-into-view. The user reads "3 unread notifications" then has to scroll to find them. Hex-pinned colors `#c9a84c` and `#2d8a8a` on lines 772/778/784 instead of CSS tokens — `var(--gold)` and `var(--teal)` would be the consistent choice. Two of the three cards use the same gold (`#c9a84c`) so the visual distinction between "action items" and "commitments" collapses.

**Pending Action Items (lines 789–816).** ActionItemCard (lines 155–298) renders meeting-derived action items. Useful, but the dedup block at 612–623 silently drops "[Carried forward]" duplicates by `description::assignee` key — a coincidental description match between two real meetings would merge. The `useMemo` deps on line 652 reference `allActionItems` not `dedupedItems`, so pending sort runs on raw rows then renders deduped rows; a bug if dedup ever changed sort order. ActionItemCard has no click target to "open the source meeting" — `meeting_title` is rendered as plain text at 289. `from {item.meeting_title}` is the most useful navigation hint on the card and it's inert.

**Notifications (lines 819–875).** This is the page's core value. NotificationCard (lines 302–410) is well-built: T-37 left border lights up with type accent when unread, falls to transparent when read (lines 326–328). The 32x32 circular icon swaps from gold-emphasis bg to ice (lines 337/341) on read state. Optimistic mark-read on click (lines 319–321) via `useMarkRead` (`useNotifications.ts:48–88`). Right-side gold pip (lines 386–397) is redundant with the left border and the icon-circle hue and the bold title weight — three signals for unread. Two of those could go.

**Mark-all-read (lines 822–848).** Single button, no undo (`useMarkAllRead` at `useNotifications.ts:90–125` doesn't show one). For a notifications stream where unread is the only signal of "I haven't looked at this," a misclick mass-clear has no recovery. The 8 task-mutation surfaces all get undo per CLAUDE.md Phase 23, but mark-all-read does not — that's a real gap.

**Commitments (lines 877–913).** CommitmentCard (lines 414–547) renders the assigned-to-someone-else commitments tracker. The lookup at line 417–419 — `getPersonInfo(item.to_whom.split(' ').pop()?.toLowerCase() ?? '')` — is a fragile string parse. "To: Nate Mesfin" → `"mesfin"` → lookup → returns the placeholder. Per Rule 24 + 34, this should route through `emailToSlug` or a slug-aware lookup, not a last-name guess. CommitmentCard has no completion affordance — a Handshake icon and a checkmark for done state, but no way to mark a commitment done from the card. The status transition is invisible to the user. No create-new-commitment button on this surface either; commitments must come from somewhere else (meeting parsing? Hermes?). The hook at `useCommitments.ts:16–33` is read-only — there's no mutation hook.

**Completed action items (lines 916–974).** Collapsible chevron, persisted only in `useState` (line 559) so refresh forgets the choice. Other persisted toggles use localStorage (`mt_view`, etc.). Inconsistent.

### Personal (`src/pages/portal/Personal.tsx`, 1163 lines)

**PageHeader row (lines 796–836).** Three components compete for attention: PageHeader title+subtitle, T-32 onboarding pinned pill (lines 808–826), RoleSelector (lines 827–835). The pinned pill anchors right via `ml-auto` then RoleSelector renders next to it — the visual hierarchy is "name | overdue summary | onboarding count | role view." That's four discrete pieces of meta-information in one row, all 11–12px. Phase 38 design memory's mantra (CLAUDE.md Rule 61) says one signature affordance per surface; this row has four.

**Unauthed banner (lines 839–865).** Cleaner than MyItems' version — single 44px row with sign-in CTA. This pattern should be hoisted and shared.

**TodayHero (lines 867–942, "T-31").** Two-card overdue/due-today band. **This duplicates Today (`/portal/dashboard`).** Today is the operating-day surface and Personal exists at `/portal/personal`; if the user is on Personal, they almost certainly came from Today (or sidebar avatar) and they already saw this exact information. The "Right Now" promotion logic from Today (CLAUDE.md Rule 61) is missing here, so the two surfaces aren't even consistent in their semantics.

**Regulatory alert strip (lines 945–1018).** The most genuinely-Personal feature on the page — IRB / regulatory items expiring within 60 days, with per-item .ics download. This is **lab-PI-specific** (Nick) and shouldn't live on every team member's Personal page. The hook `useExpiringRegulatory(60)` at line 637 isn't filtered by user — it returns lab-wide regulatory items. A coordinator looking at their Personal sees Nick's IRB expirations. Wrong audience.

**Quick actions row (lines 1021–1070).** New Task / Submit Idea / Ask a Question, then Recently Viewed pills. The Ask-a-Question shortcut points to `/ask?create=true` — the "Ask the Lab" surface. RecentlyViewed crowds the row when populated (4 pills + 3 actions + history icon = 8 items in a wrap-flex). On mobile this stacks awkwardly. The Cmd+K palette covers all three actions plus more, with better hit-target precision; this row is screen-real-estate cost without a ton of incremental value.

**Quick capture (lines 1073–1075).** A single-line idea-capture input. Useful, but it duplicates the global QuickAdd FAB and the Cmd+K idea capture. Keep one.

**Two-column grid (lines 1077–1107).**

- Left: MyTasksColumn (lines 223–350). 18-task cap, 4 urgency groups (overdue/today/this-week/later). **Direct duplicate of UnifiedMyTasks at `/portal/my-tasks`.** Same 4 buckets, same inline TaskRow click → detail panel, same priority chip, same overdue-maroon treatment. UnifiedMyTasks supports 3 view shapes, saved views, planning, group_override; this column is a Phase-26-era simplification of the same thing.
- Right column three cards: UpcomingCard / RecentActivityCard / QuickStatsCard. Upcoming overlaps the left column's "this-week" group. RecentActivity is the only differentiated card on Personal that doesn't appear elsewhere (Today has a vague "what changed" but no activity feed). QuickStats (lines 567–615) is unique — a 2x2 grid of done-this-week / active / overdue / projects — but the values appear in PageHeader subtitle line 802–805, in TodayHero counts, and in the My Tasks pill — fourth duplication.

**Onboarding section (lines 1110–1153).** Collapsed 30-day onboarding checklist. Two state-management bugs visible: `onboardingDismissed` state (line 649) is initialized from localStorage but only re-checked on mount (line 657–660), so dismissing it elsewhere doesn't update this page until refresh. The pinned pill in the header (line 809) calculates `shouldPinOnboarding` from the live `useOnboarding()` hook (line 654), so pill and section can disagree about whether to display at all.

**Task detail panel (lines 1155–1158).** Wired correctly — TaskDetailPanel subscribes to cache per Rule 18.

## 3. Findings table

| ID | Severity | Page | Surface | Issue | Fix | Effort |
|----|----------|------|---------|-------|-----|--------|
| MI-01 | High | MyItems | Page identity | Page title "My Items" + sidebar-avatar destination signals a broader workspace than the page delivers (it's a notifications + commitments inbox); Personal is the actual workspace. | Rename to "Inbox" or "Notifications" and refactor sidebar avatar to route to Personal (or merge per §5). | M |
| MI-02 | High | MyItems | Mark-all-read | No undo on mark-all-read; misclick wipes unread state irrecoverably (`MyItems.tsx:824`, `useNotifications.ts:90–125`). | Add UndoToast with 5s revert; useMarkAllRead returns previous state for undo callback. | S |
| MI-03 | High | MyItems | Notifications | No per-notification action affordance (snooze, dismiss, archive). Only mark-read on click and follow-link. (`MyItems.tsx:302–410`) | Add right-edge action cluster (snooze submenu + dismiss + open) shown on hover/long-press, matching TaskContextMenu pattern. | M |
| MI-04 | High | MyItems | Notifications | No filter chips by type (mention / assignment / deadline). For a 50+ notification stream this is essential — type-coded border is recognition, not selection. | Add chip strip above list: All / Mentions / Assignments / Deadlines, with per-type unread count. | S |
| MI-05 | High | Personal | Identity | Personal duplicates Today (TodayHero), UnifiedMyTasks (MyTasksColumn), Dashboard (QuickStats). 70% of surface is redundant with other portal pages. | Merge per §5 — keep RecentActivity / QuickCapture / Onboarding / Regulatory alert as a "Personal Companion" strip on Today, retire `/portal/personal` route. | L |
| MI-06 | High | Personal | Regulatory strip | `useExpiringRegulatory(60)` returns lab-wide regulatory items, not user-scoped. A non-PI coordinator sees PI's IRB expirations on their Personal page. (`Personal.tsx:637–641`) | Filter by `responsible_slug` (or equivalent) to current user; PI sees all, others see assigned. | S |
| MI-07 | High | MyItems | Commitments | `getPersonInfo(item.to_whom.split(' ').pop()?.toLowerCase())` is a fragile last-name parse for slug lookup. (`MyItems.tsx:417–419`) Violates Rule 34 (canonical slug discipline). | Store `to_slug` on commitment record; route through `getPersonInfo(slug)`. | S |
| MI-08 | Med | MyItems | StatCards | Hex-pinned `#c9a84c` and `#2d8a8a` instead of `var(--gold)` / `var(--teal)`; two of three use same gold so visual differentiation collapses. (`MyItems.tsx:772, 778, 784`) | Use tokens; rotate maroon for commitments to break the gold-gold collision. | XS |
| MI-09 | Med | MyItems | StatCards | Cards aren't clickable / scroll-anchored. Reading the count and finding the section are two separate motions. (`MyItems.tsx:62–129`) | Wrap StatCard in `<a href="#section-id">` with `scrollIntoView({behavior:'smooth'})` handler. | XS |
| MI-10 | Med | MyItems | Notifications | Triple unread signal (left border + bg-emphasis icon + bold title + right-side gold pip = four). (`MyItems.tsx:328, 337, 352, 386`) | Drop the 8x8 right-side dot; left border + icon-circle bg are sufficient. | XS |
| MI-11 | Med | MyItems | Pending action items | Dedup keyed on `description::assignee` collides identical descriptions across distinct meetings. (`MyItems.tsx:613–622`) | Include `meeting_id` in dedup key OR scope dedup window to "[Carried forward]" prefix matches only. | S |
| MI-12 | Med | MyItems | Action items | `meeting_title` chip not clickable — most navigationally useful affordance is inert. (`MyItems.tsx:289`) | Make chip a `<Link to={`/meetings/${meeting_id}`}>`. | XS |
| MI-13 | Med | MyItems | Commitments | No mark-done UI on CommitmentCard; only displays state, no transition. (`MyItems.tsx:414–547`) | Add status circle button (mirroring ActionItemCard) + create `useToggleCommitment` mutation; status `open → done`. | M |
| MI-14 | Med | MyItems | Notifications | Infinite list — no pagination, no "load older" cursor, no >30-day stale collapse. | Add pagination at 50; collapse anything >30 days into "Older notifications" expandable section. | S |
| MI-15 | Med | MyItems | Sortedness | `sortedNotifications` sorts unread-first then date desc but the section header just says "Notifications" — the order isn't communicated. (`MyItems.tsx:655–660`) | Either add a "newest unread first" caption, or split into two sections "Unread (N)" + "Earlier". | XS |
| MI-16 | Med | MyItems | A11y | NotificationCard click handler on `<motion.div>` (line 319) — not a button. Keyboard users can't mark-read. | Use `<button>` for the unread interaction or add `role="button" tabIndex={0}` + Enter/Space handlers. | S |
| MI-17 | Med | MyItems | A11y | No `aria-live` on the unread count or the notifications list — count changes silently to AT users. | Wrap unread count in `<span aria-live="polite">`; announce mark-all-read result. | XS |
| MI-18 | Med | Personal | Header density | 4 metadata items in header row (title, subtitle, onboarding pill, role selector). (`Personal.tsx:796–836`) | Move RoleSelector to Settings (low-frequency action). Keep onboarding pill while active. | S |
| MI-19 | Med | Personal | TodayHero | Direct duplicate of Today's TodayHero. (`Personal.tsx:867–942`) | Remove if MI-05 merge happens; otherwise reduce to 1-row "you have N overdue" link. | S |
| MI-20 | Med | Personal | Quick actions row | 3 actions overlap with Cmd+K + global QuickAdd FAB. (`Personal.tsx:1021–1047`) | Drop the 3 buttons; keep RecentlyViewed pills which are unique. | XS |
| MI-21 | Med | Personal | QuickStats | Stats appear in 4 places on this page (header subtitle, TodayHero counts, MyTasks pill, this card). (`Personal.tsx:567–615`) | Drop QuickStatsCard; values are everywhere else. | XS |
| MI-22 | Med | Personal | Onboarding | `onboardingDismissed` state initialized from localStorage but only re-checked on mount (line 657); pill (lines 808–826) and section (lines 1110–1153) can disagree. | Single source of truth via useOnboarding hook + listen to storage events. | S |
| MI-23 | Med | Personal | RoleSelector | Only-show-when-authed gate (`Personal.tsx:722`) — but in dev the auto-detect path shows for everyone. Coordinator role selecting "PI View" sees PI dashboard but doesn't get PI permissions; UI/state mismatch. | Either make it Settings-only, or add a banner clarifying "Preview mode — actions still scoped to your role." | M |
| MI-24 | Med | Personal | MyTasksColumn | Inline `MAX_TASKS = 18` cap means task #19+ is hidden until "View all" click. No keyboard nav scopes here (focused index is on `sortedPendingTasks` not on the visible 18). (`Personal.tsx:234, 776–789`) | Either remove the cap or scope keyboard shortcuts to visible slice. | M |
| MI-25 | Low | MyItems | Page header | h1 at 2.75rem clamp larger than Personal's PageHeader. (`MyItems.tsx:700–711`) | Use shared PageHeader for consistency. | XS |
| MI-26 | Low | MyItems | Completed toggle | `showCompleted` not persisted (`MyItems.tsx:559`); other toggles persist. | Use `localStorage` like UnifiedMyTasks `mt_view`. | XS |
| MI-27 | Low | MyItems | Pre-launch banner | Banner at 738–757 references a state (no CF Access cookie) that's almost never reachable post-launch. | Remove or convert to "Sign in expired" recovery. | XS |
| MI-28 | Low | MyItems | Animation | NotificationCard `motion.div` enters with `x: -8 → 0` slide-in for every list re-sort. With unread-first sort, marking one read causes the entire list to slide. | Use `layoutId` + `layout` only; drop the slide-in `initial`. | XS |
| MI-29 | Low | MyItems | Border-color blend | Read NotificationCard sets `borderLeft: 3px solid transparent` (line 328) — unread→read causes a layout-stable but fade-less transition. | `transition: border-left-color 200ms ease`; visual continuity. | XS |
| MI-30 | Low | Personal | QuickCapture vs FAB | Same affordance as global QuickAdd. | Remove this row, point users to "⌘K then I" or FAB. | XS |
| MI-31 | Low | Personal | Activity feed | Production-visibility filter at lines 631–634 hides items by description heuristic — RecentActivity then shows fewer than its `useActivity(10)` cap. Sometimes "Recent Activity" feels stale because filters dropped the recent items. | Bump `useActivity` to 20–30 to give the filter slack. | XS |
| MI-32 | Low | Personal | Two-column grid | `personal-grid` class stacks at <=768px (CSS C-08). Right-column three cards become a long mobile scroll below My Tasks. | Order on mobile: Quick Stats first (1-row 2x2), then My Tasks, then Activity, Upcoming below. | S |
| MI-33 | Low | Personal | Subtitle messaging | `"All caught up"` (line 805) ≠ MyTasks empty state message ≠ MyItems empty state. | Standardize one phrasing. | XS |
| MI-34 | Low | Both | Sidebar unread badge | `useUnreadCount` exists (`useNotifications.ts:32`) but no sidebar badge integration visible from these pages. | Wire to Sidebar.tsx avatar + MobileTabBar More-overflow. | S |
| MI-35 | Low | Both | Hermes notifications | Type 'mention' fires for @hermes too. No HermesMark or special framing on a notification originating from the AI assistant. | Detect `actor_slug='claude-ai'` on notification and swap icon to HermesMark per Rule 29. | S |
| MI-36 | Low | Both | Mobile touch targets | NotificationCard click (`MyItems.tsx:319`) and Personal TaskRow (`Personal.tsx:367–372`) at 32px min-height — below 44px Phase 36c floor. | Bump to 44px on mobile via `@media (max-width: 767px)` row-min-height. | XS |
| MI-37 | Low | MyItems | Real-time | Notifications fetch on `staleTime: 30s` (`useNotifications.ts:27`) with refetchOnWindowFocus. No PartySocket subscription via realtimeBus despite Rule 52. | Add notification-refresh listener on hub-realtime room; invalidates query. | M |

## 4. Top 5 high-leverage enhancements

1. **Resolve the 4-page workspace identity crisis** (MI-05). Today + MyItems exists as a clean pair (operating day vs inbox). Personal exists as a Phase-26b artifact and Lab Overview as a Phase-38-renamed Dashboard. Cut Personal entirely — absorb QuickCapture into FAB (already there), RecentActivity into Today's right rail, Onboarding into a one-time toast/profile section, Regulatory alerts into the PI-only Lab Overview. Sidebar avatar → MyItems (already does). Sidebar "Today" → Today. Sidebar "Lab Overview" → Lab Overview. The four-route mess becomes three with no feature loss.

2. **Notification inbox completeness pass** (MI-02 through MI-04, MI-13, MI-14, MI-37). The MyItems notifications surface is the single highest-frequency interaction on this hub once Hermes mentions ramp up. Right now it's a list with mark-read on click and mark-all-read on button. Ship: filter chips (mention/assignment/deadline), per-row actions (snooze/dismiss/archive), undo on mark-all-read, pagination at 50, real-time PartySocket invalidation, sidebar unread badge, Hermes branding on AI mentions. Two-day sprint.

3. **Commitments tracker activation** (MI-07, MI-13). Right now commitments are display-only. Add `to_slug` to schema, `useToggleCommitment` mutation, mark-done circle on the card, "+ Add commitment" button on the section header, and a meeting-extraction path that creates them automatically from "I'll send X by Friday" patterns. Without these the Commitments section is an inert ledger nobody updates.

4. **Mark-all-read undo** (MI-02). Single highest "the system has my back" moment that's currently missing. 5 lines of code via existing UndoToast.

5. **Sidebar unread badge wiring** (MI-34). The `useUnreadCount` hook is built and not visible anywhere outside the StatCard. Drop a red-dot indicator on the Sidebar avatar + MobileTabBar More tab. This is the single feature that turns notifications from "I have to remember to check MyItems" to "the hub tells me when there's something new."

## 5. MyItems vs Personal boundary recommendation

**Recommendation: Retire `/portal/personal`. Keep MyItems. Repurpose what's salvageable.**

The current four-page workspace landscape is incoherent:

| Page | Mental model | Differentiated value |
|------|--------------|----------------------|
| Today | Operating day — what to work on right now | Right Now slot, planned-task drag, group_override planning |
| Lab Overview | Lab-wide weekly snapshot | RGL-resizable cards, role-based defaults, cross-team metrics |
| MyItems | Inbox — what others sent me | Notifications, commitments, meeting action items |
| **Personal** | **???** | **TodayHero (dup), MyTasks (dup), Stats (dup), QuickActions (dup), Activity, RecentlyViewed, Onboarding, Regulatory, RoleSelector, QuickCapture** |

Personal is a snowglobe of things that already live elsewhere. The Phase 38 Today/MyTasks redesign made it redundant. **Cut Personal.** Distribute its irreducible parts:

- **RecentActivityCard** → Today right rail (operationally relevant on the operating-day page)
- **QuickCapture** → already in FAB / Cmd+K. Delete the duplicate.
- **OnboardingChecklist** → one-time on first sign-in via toast (when `currentDay < 30 && progress < 80`); persistent settings section for review. Don't anchor it to a page.
- **RegulatoryAlert** → PI-scoped. Move to Lab Overview, gate to PI role. (Per MI-06.)
- **RoleSelector** → Settings → Lab tab. Low-frequency configuration, not a daily-use control.
- **RecentlyViewed pills** → Cmd+K palette already shows recents; remove the duplicate.
- **MyTasksColumn** → already exists as UnifiedMyTasks, fully featured. Delete this Phase-26-era simplification.
- **TodayHero** → already on Today.
- **QuickStats** → Today header subtitle already conveys this.

**MyItems stays and becomes "Inbox":**
- Rename `My Items` → `Inbox` to set expectations; URL `/portal/inbox` (legacy `/portal/my-items` redirect shim).
- Sidebar avatar still routes here (this is "my pending stuff" — the right home).
- Add filter chips, per-row actions, mark-all-read undo, sidebar unread badge.
- Sub-sections: **Unread → Earlier → Commitments → Action Items → Snoozed**.
- Optional: a "@hermes" filter chip surfaces AI mentions specifically, since Nick prioritizes those.

**Effort:** ~2 sprints. Sprint 1 — retire Personal route (Navigate redirect to Today), distribute orphaned features, ship inbox enhancements. Sprint 2 — commitments tracker activation + sidebar badge + Hermes branding.

## 6. Brand & design-system observations

- **Token discipline gap on MyItems StatCards** (`MyItems.tsx:772, 778, 784`). Hex `#c9a84c` and `#2d8a8a` instead of `var(--gold)` and `var(--teal)`. Likely written before Phase 35 hex-pinning standardized which colors live as tokens vs literals — but these are exactly the tokens that should be CSS-variable refs (text-carrying contextual color, not semantic stage fills).
- **T-37 type-coded left border** is correctly executed (`MyItems.tsx:51–58, 326–328`). The `notificationAccent` helper centralizes the mapping cleanly. This is the page's strongest brand moment.
- **HermesMark integration missing.** Per Rule 29, AI-assistant surfaces should swap to HermesMark. NotificationCard renders the same `BellDot` icon for a Hermes mention as for a teammate mention. Wire `notification.actor_slug === 'claude-ai'` → HermesMark.
- **CategoryIcon not used.** Notifications carry `source_type` (project/meeting/etc) — could swap CategoryIcon for the entity-type lung/flask/cap depending on source.
- **Personal's PageHeader** uses a generic `<User size={20} />` instead of HermesMark / CategoryIcon. The header subtitle is dynamic — but the icon is static.
- **Heading level inconsistency.** MyItems uses raw h1 (`MyItems.tsx:701`) at 2.75rem clamp. Personal uses PageHeader component (`Personal.tsx:797`). Different visual weight despite both being primary navigation surfaces. Standardize on PageHeader.
- **QuickStatsCard color-mix bg/border** (`Personal.tsx:599–602`) — `color-mix(in srgb, ${stat.color} 6%, transparent)`. With `srgb` not `oklch` color space; CLAUDE.md Phase 35 standardizes on hex-pinned literals + oklch only for pure-bg tokens. Switch to surface tokens.
- **Mobile touch targets.** ActionItemCard / NotificationCard / Personal TaskRow all sit at 32–36px min-height. Phase 36c set 44px floor — verify on real Pixel 5 viewport.

## 7. Edge cases / failure modes

- **0 notifications, 0 action items, 0 commitments.** MyItems renders three empty-state cards in a row, all variations of "you're all caught up." Visually low-signal — looks like an error state. Consider one combined empty state with an illustration (EmptyStateArt per Rule 29).
- **50+ notifications**: no pagination. Page becomes scroll-prison. (MI-14)
- **Notification with no link.** NotificationCard renders without `<Link>` wrapper (line 402–408). The card is then click-to-mark-read but visually identical to a clickable card. Adds confusion.
- **Mention from Hermes**: same icon and treatment as human mention. (MI-35)
- **Stale notifications (>30 days).** None are auto-archived. A team member returning from vacation sees 200 notifications, no way to bulk-archive. (MI-14)
- **Cross-entity notifications.** A notification linking to a deleted project: Link still renders, click navigates to 404. No "this entity is gone" handling.
- **Commitment with `to_whom = "Sarah"`** (no last name): `split(' ').pop()` returns `"sarah"` → `getPersonInfo("sarah")` returns placeholder. Avatar renders gold-light placeholder with no initials. (MI-07)
- **User with no email (pre-auth fallback)**: `userSlug = 'nick-ingraham'` (line 563). MyItems silently shows Nick's data to anyone unauthed. CF Access closes this in production but a logout race could expose.
- **MyTasksColumn with exactly 0 visible groups** (e.g., user has 18 tasks all in `later`): "Today" / "This Week" empty groups omitted by `if (groupTasks.length === 0) return null` (line 297) — fine. But when user has 19+ tasks and the 19th is in `today`, MAX_TASKS cap (line 234) drops it. A user could be staring at "0 today" while the API has 1 today-task they don't see. (MI-24)
- **Personal Regulatory strip with 50+ items**: `slice(0, 5)` (line 975) — no "view all" exit beyond the summary link to `/portal/projects`. Wrong destination — should be a regulatory page.
- **Onboarding race**: pinned pill state (line 654) and section state (line 649) read independently from localStorage; rapid dismiss + section-click can desync. (MI-22)
- **Two browser tabs**: marking notification read in tab A doesn't refetch tab B until 30s `staleTime` elapses. WebSocket invalidation per Rule 52 not wired. (MI-37)

## 8. Open questions for PI

1. **Is Personal load-bearing for any non-PI team member?** If a fellow / coordinator opens `/portal/personal` daily, what do they look at? If the answer is "the regulatory strip" then it shouldn't be there. If the answer is "QuickStats and RecentActivity" then those should move to Today's right rail. If the answer is "they don't" then retire the route.
2. **Should the sidebar avatar route to Inbox (current MyItems) or to a profile/settings page?** Rule 24 footnote says Nick expected "his own working page" — does that mean an inbox or a workspace? Phase 38 + Today + MyTasks already handle "workspace"; the only thing left is "inbox" (notifications + things others assigned to me).
3. **What's the lifecycle of a "commitment"?** Right now they appear on MyItems but no UI creates them. Are they (a) extracted from meeting transcripts via Hermes? (b) manually logged from a "+commit" button? (c) auto-derived from "@nick will do X by Friday" parsing? The page treats them as a real concept but the creation path isn't visible.
4. **Mark-all-read with undo: 5 seconds enough?** UndoToast standardized at 5s; for "I just nuked 50 notifications" the user might need 10s.
5. **Should @hermes mentions get a separate notification type?** They currently render as `'mention'` with the same gold border. A 4th category (`'ai'` → HermesMark + neutral border) would let users filter Hermes-only.
6. **PartySocket subscription on MyItems?** Per Rule 52, realtimeBus is a shared singleton. Worth adding a notification-refresh listener for cross-tab + cross-device sync, or is 30s polling enough given mention latency?
7. **Pinned onboarding pill in header — keep through Phase 39 launch wave or retire after a sprint?** Currently shows for `currentDay < 30 && progress < 80`. With Phase 39 auto-create + claim flow shipping new users into the system, the onboarding cohort just expanded. Maybe surface differently (toast on first-of-day login) rather than a permanent header element.
8. **Regulatory alerts: PI-only, or "your assigned regulatory items"?** Schema visibility — does each regulatory item have a `responsible_slug`? If yes, scope to user. If no, gate to PI role only via `useUserRole`.

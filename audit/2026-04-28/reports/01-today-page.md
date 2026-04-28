# TodayPage Deep Audit — `/portal/dashboard`

**Date**: 2026-04-28
**Agent ID**: `ada0fed73eacd7a94` (resumable via SendMessage)
**Files reviewed**: `src/pages/portal/TodayPage.tsx` (313 lines), 11 components in `src/components/today/`, `src/hooks/useTodayState.ts`, `src/components/SmartCompose.tsx` (selectively). Cross-referenced against CLAUDE.md rules 57-63 + design ethos.

---

## 1. Executive read

- **What's working.** The core operating-day mental model is honored. Click semantics (rule 58) are correct: row body = expand drawer (`TaskRow.tsx:27`), drag handle ⋮⋮ = plan (`TaskRow.tsx:36`), explicit ▶ button promotes (`TaskDetailDrawer.tsx:65`). Right Now is a real promoted slot with auto-promotion on first load (`TodayPage.tsx:72-89`), gold restraint is preserved (only place with the glow, `RightNowCard.tsx:34`), and group sort planned→active→done is implemented correctly (`TaskGroup.tsx:15-20`). State persists per-day via `today_state_${YYYY-MM-DD}` key with sane trim semantics that survive the loading race (`useTodayState.ts:52-62`). Phase 38 closure ships actual mutations, not stubs.
- **The biggest gap.** This page has **two non-functional surfaces sitting in the highest-attention slots**: (a) the morning-thought "🧠 Morning thought, quick capture, or @hermes to delegate…" input under the pill strip (`TodayPage.tsx:237-244`) is a bare HTML `<input>` with NO submit handler, NO state, NO keybind — typing `⌘ ⏎` does nothing; (b) the Right Now expand "💬 Chat with Claude about this task…" input (`RightNowCard.tsx:67-71`) is similarly inert. Both visually promise an action surface but silently swallow keystrokes. This is the single highest-severity issue on the page — it's design-as-fiction in the most prominent UI slot.
- **The boldest swing.** Wire **time-blocking + a live "now indicator" line into the Timeline**. Today's timeline already merges iCal events (rule 64) but it's a rigid list of meetings + drop zones — there's no clock, no "you're 12 minutes into a 30-minute meeting" cue, no time-ruler, no current-time bar. The operating-day surface should *look* like an operating day. Pair that with making the planned-task drop zones into actual time slots (e.g. drop into `9:00-10:30` instead of `between-1`), and `focusMin` becomes a real number instead of `plannedIds × 30` (`TodayPage.tsx:147`).

---

## 2. Surface-by-surface walkthrough

### 2a. Page header — `TodayPage.tsx:226-233`
**What it does well.** Greeting + HeartbeatLine + date is brand-correct. `formatTodayDate()` returns the long form ("Monday, April 27, 2026") which sets the operating-day mood. h1 weight 600 + letter-spacing -0.03em is restrained and right.
**Falls short.**
- `color: '#fff'` is hardcoded (`TodayPage.tsx:227`) — the design system has `--ink-bright` for exactly this case (Rule 14: "white in BOTH modes"). Same hardcoded `#fff` appears 6 more times in this file (`TodayPage.tsx:227, 258`, `RightNowCard.tsx:38`, `RightNowCard.tsx:44 transitively`, `Timeline.tsx:62`, `TaskGroup.tsx:27`, `PulseCard.tsx:23`). Token violation.
- The "Click a task to expand · drag ⋮⋮ to plan · click a meeting for notes." (`TodayPage.tsx:232`) is **always-visible chrome** — costs vertical space, dies of its own weight after week 1, and reads as instructional like a beta tutorial. This should auto-fade after first interaction or live behind a `?` icon.
- No greeting personalization. "Today" alone is anonymous. Phase 26b shipped a time-of-day greeting on the old Dashboard; Today threw it away.

### 2b. PillStrip — `PillStrip.tsx`
**What it does well.** Six clickable counts that scrollIntoView smooth their target — that's the right primitive for a long page. Lab Health pill at far right is well-sized (the 18px tabular-nums numeral makes it the visual anchor). Color choices follow rule 59 (coral overdue, orange stalled, gold planned, teal meetings, green done).
**Falls short.**
- **No empty-state suppression.** When `counts.overdue === 0`, the pill still shows "0 overdue" with full coral styling (`Pill` doesn't dim on count=0). Visually a clean slate looks like a fire. Should fade to `INK_DIM` border + low-emphasis fill at zero.
- **Lab Health math is naive.** `100 - overdue×4 - stalled×2` (`PillStrip.tsx:16`) — a lab with 25 overdue tasks (very plausible) gets 0/100 forever. No floor protection beyond `Math.max(0, …)`. Replace with something monotonic/log-scaled, OR remove the metric — there's no on-page legend explaining what 73 means.
- **Lab Health tooltip is the count, not the formula.** `title="Lab Overview"` (`PillStrip.tsx:30`) is wrong copy — the real value to a user is "click to investigate", not the destination's name.
- **Six pills is one too many.** Done-today is interesting but it's already shown at the bottom of the page with full detail. The pill is redundant.
- **Emoji icons (🔴 🕰 📌 📅 ✓) violate the brand-primitive ethos** (Rule 29). Should be `CategoryIcon`/lucide stroke icons matched to accent color. Emoji font rendering also drifts wildly between OSes — Win 11 emoji Bell ≠ macOS Bell.

### 2c. Morning thought / quick capture — `TodayPage.tsx:237-244` 🚨 P0
A bare `<input>` with placeholder "Morning thought, quick capture, or @hermes to delegate…" + a `⌘ ⏎` `<kbd>` chip. **No state. No onSubmit. No onKeyDown. No store hook.** It's a literal decorative input with a shortcut hint that does nothing. This is the single most prominent input on the page and it's vapor.

What it should do:
- Cmd+Enter should fire one of three paths: (a) `@hermes …` → posts to `ai_requests` async pipeline; (b) `note: …` → drops into a daily-thoughts log; (c) plain text → creates a task in the user's chosen default group via `useCreateTask`.
- This is the natural home for **"plan tomorrow"** at the end of the day (5pm onward, prompt swaps to "Plan tomorrow morning's first move…").
- Use `SmartCompose` (already imported in the drawer) with `boxed={false}`. It has the file/emoji/@-mention infra wired.

### 2d. Right Now hero — `RightNowCard.tsx`
**What it does well.** Compact horizontal pill + queue strip beneath. Gold-only glow. The auto-promote in TodayPage (`TodayPage.tsx:72-89`) means the empty state is rare in practice — the user almost always sees a real task here. Queue swap pills (`RightNowCard.tsx:50-58`) are a clean affordance: one-click swap, no drag needed.
**Falls short.**
- **The `▶ Work` button just sets `expanded` to true** (`RightNowCard.tsx:42`) — it doesn't promote (it can't, it's already promoted), it doesn't start a timer, it doesn't focus the chat input, it just expands the box. The semantic load of "Work on this now" is wasted on UI affordance. Should at minimum (a) start a focus timer, (b) auto-focus the chat input on expand, (c) optionally enter a "focus mode" full-bleed view.
- **Chat input is decorative** (`RightNowCard.tsx:67-71`). Same as 2c — bare `<input>`, no handler. Should embed `<SmartCompose taskId={task.id} />` so @hermes works.
- **No description preview when collapsed.** A user has to expand to see context. The first 60 chars of `task.description` should sit under the title at low opacity.
- **No due-date / age signal.** Right Now is the most prominent slot and it tells you nothing about urgency. If the Right Now task is 8 days overdue, the gold glow says "calm focused work" while the data says "panic".
- **"queueTasks" pill labels are full title** (`RightNowCard.tsx:54`, `maxWidth: 220`). With 4-5 in queue these wrap to 2 rows of pills + horizontal overflow. Truncate to first 30 chars with title attr.
- **Empty-state copy is informational, not motivational** (`RightNowCard.tsx:23`): "No planned tasks. Drag ⋮⋮ up or click a task to promote." No greeting, no streak, no "you're early — what's your one thing?" voice. The brand voice opportunity is wasted.
- **No keyboard shortcut to mark Right Now done.** Power users will want `D` or space-to-complete on the focused slot.

### 2e. Timeline — `Timeline.tsx`
**What it does well.** Drop zones interleaved between meetings (`Timeline.tsx:75-105`) is the right primitive for "drag a task into the gap." The "Restore N hidden" link (`Timeline.tsx:65`) is a thoughtful undo affordance. The "Planned today · no specific time" strip (`Timeline.tsx:131-166`) catches the practical case of "I want to do this today but don't care when".
**Falls short.**
- **No live "now" line.** Today is a timeline; users want to see their current position on it. A single absolutely-positioned 1px gold/coral line at `(currentTime - dayStart) / dayLength` of the section height would make this surface feel ALIVE.
- **Meetings have no time visualization.** They're rendered as a flat list (`MeetingRow.tsx:15-32`) showing time as text. There's no proportional-to-duration block — a 15-min standup looks the same height as a 2-hour grant review. Visual time-density is the entire point of a timeline.
- **OverlapBand is a TODO.** `OverlapBand.tsx:25-30` — returns null. Two meetings at 10am with 0 visual cue. iCal events ship with `start + end`, so the data is THERE — only the rendering is missing.
- **DropZone spam.** With 4 meetings on the calendar, the user sees 5 dashed drop zones (`Timeline.tsx:84, 114`). That's noisy. They should be hidden until a drag starts (use a global `dragging` state via `dragstart`/`dragend` or PartySocket if cross-tab).
- **Drop zone label "drop a task here · before {meeting title}"** (`Timeline.tsx:84`) wraps badly with long meeting names. Truncate.
- **Meeting notes don't persist.** `meetingNotes` state lives in `useState` (`Timeline.tsx:51`) — refresh and the note is gone. The spec implies these should write to `meetings.notes` or `task_updates` via API. Currently a dataloss bug if used.
- **Dismissed meetings don't persist either.** `dismissedMeetings` state (`Timeline.tsx:50`) is component-local. Refresh = un-dismissed. Should at minimum be in `today_state_${day}` localStorage; ideally a per-user preference.
- **No "join meeting" button on iCal events.** ics-parser extracts Zoom/Teams/Meet URLs (rule 64) but `EventRow` (`MeetingRow.tsx`) doesn't render a join-link button. This is a 2-line addition with massive utility — current state forces users to swivel back to their calendar app.

### 2f. TaskGroup + TaskRow — `TaskGroup.tsx`, `TaskRow.tsx`
**What it does well.** `getGroupForTask` (`constants.ts:83-102`) checks `group_override` first, then PB heuristics, then ETL, then priority — that's the right precedence and matches rule 63. Sort planned→active→done is correct (`TaskGroup.tsx:15-20`). Drag handle is a separate stop-propagation column from the row body (`TaskRow.tsx:28-38`) so click semantics stay clean. 📍 chip on `group_override` (`TaskRow.tsx:44-46`) makes the Hub-authored bucket choice visible.
**Falls short.**
- **No virtualization.** A user with 200 open tasks renders 200 rows × every state change. Phase 28 shipped `@tanstack/react-virtual` on `TaskGridView`; TodayPage rendering 5 groups of 40+ tasks each will jank. Especially because every TaskRow subscribes to the entire `state` object via prop drilling and re-renders on any plan/done change.
- **Empty groups disappear silently** (`TaskGroup.tsx:22`). If "Quick" has 0 tasks the header doesn't render. Probably correct UX — but means a user who expects 5 sections sees 3 and wonders if buckets broke. Consider rendering a 1-row empty state header at low opacity ("⚡ Quick · clean").
- **No group collapse.** With ~50 tasks per group, vertical scroll is brutal. Collapsed-by-default would make this scannable; a 3-state toggle (expanded / preview-3 / collapsed) would be better.
- **The tag glyph (`tagForTask`)** uses literal emoji (`constants.ts:111-124`) — same brand-primitive violation as 2b. `🔬` for CLIF should be `<CategoryIcon kind="lungs">`, etc.
- **No due-date column / cell.** Each row shows title + project + planned/scheduled chip — but NOT the due date. A task due in 2 hours and a task due in 2 weeks render identically. Only the drawer reveals due_date. This is a regression vs. `TaskGridView` and an active liability for the operating-day mental model.
- **No priority cell.** Same — priority lives in `getGroupForTask` (urgent/high → priorities) but isn't shown on rows. A user can't distinguish urgent from high inside the same group.
- **No assignee column.** Today is filtered to the user's own tasks already (`TodayPage.tsx:46`), so this is fine — but if a PI uses Today to scan delegated work, the absence is felt.
- **`isDone ? state.uncheck : state.markDone`** on the checkbox is correct, but `state.markDone` calls `updateStatus.mutate({ status: 'done' })` (`useTodayState.ts:87`) — which means the API write only happens through `markDone`. **Status changes from any other surface (UnifiedMyTasks, TaskDetailPanel) won't be reflected in `state.done`** because that's a localStorage Map. So if a user completes a task on `/portal/my-tasks` then comes back to `/portal/dashboard`, the row stays "active" instead of "done" until the next page load. Cross-surface state drift.
- **`group_override` fall-through after schema check** in `getGroupForTask` (`constants.ts:85-87`) — the array `['deep','priorities','quick','pb','etl']` is fine but the `as const` + `.includes()` pattern is a TS nuisance. Consider a `Set<GroupKey>` constant.

### 2g. TaskDetailDrawer — `TaskDetailDrawer.tsx`
**What it does well.** Action bar with ▶ Work / 📌 Plan / Move → / Unplan + LinkRow + project breadcrumb is the right toolset. Why-card (`TaskDetailDrawer.tsx:101-106`) using gold accent is on-brand. Subtasks + Recent updates 2-col grid is a sensible split (left = work, right = context). SmartCompose at the bottom is a real handler (Cmd+Enter, mentions, files). Move → popover writes `group_override` (`TaskDetailDrawer.tsx:50-54`) and the +UndoToast is a real mutation.
**Falls short.**
- **Subtask checkbox is `defaultChecked` only** (`TaskDetailDrawer.tsx:114`) — clicking it does NOTHING. No `onChange`, no mutation. Decorative. Same class of bug as 2c.
- **Blocks list is read-only.** Useful info but no "remove this block" or "convert to task" action. Dead-end UI.
- **No edit-in-drawer for due/priority/assignee/title.** This is the canonical inline-editing surface (rule 4) and it has zero inline-editable fields. A user wanting to change due date must navigate to `/portal/my-tasks` or open `TaskDetailPanel` from elsewhere. Shipping `InlineDatePicker` + `InlineSelect` here is table stakes.
- **No reactions on the task itself.** ReactionBar exists for `task_update` rows (`TaskDetailDrawer.tsx:144`) but the task itself can't be reacted-to — usual lab pattern is "PI 👀 on this task means I noticed".
- **No "open in side panel"** affordance to escape the inline drawer for a long task. A button that opens the existing `TaskDetailPanel` (rule 18) for full editing would bridge the drawer→panel→page progressive disclosure (Pattern 3).
- **No Hermes mark on Hermes updates.** Detection is done by `u.who === 'claude-ai'` (`TaskDetailDrawer.tsx:132`) and the gold "Hermes" string label — but `<HermesMark>` (rule 29) is the brand primitive. Replace string with the icon.
- **`task.description` first paragraph is the Why fallback** (`TaskDetailDrawer.tsx:30`). Reasonable, but if no `detail.why` exists the Why card always shows the description's first line — which means the card duplicates content already visible elsewhere. Hide when fallback === description's first line.

### 2h. "All today's tasks" header + groups — `TodayPage.tsx:257-277`
- **The `📋` emoji prefix on the h2** (`TodayPage.tsx:258`) violates the same brand-primitive rule as 2b.
- **The "click to expand · ⋮⋮ to plan · ▶ to promote" hint** (`TodayPage.tsx:259`) duplicates the page-level hint in `TodayPage.tsx:232`. One of these is enough.
- **`TableSkeleton`** (`TodayPage.tsx:264`) is the columnar-table skeleton, which doesn't match this surface's actual layout (5 grouped sections). CLS is real here — first paint is a 6-row table skeleton, then suddenly 5 grouped sections appear.

### 2i. Completed today section — `TodayPage.tsx:279-301`
**What it does well.** Collapsible. Strikethrough rendering is consistent with rule 62.
**Falls short.**
- **Two sources of truth merged inline.** Lines 282-283: `(doneTodayDetail.length + Object.values(state.done).filter(Boolean).length)`. If a task is BOTH `completed === 1` from API and `state.done[id]` from localStorage, it's counted twice. (Probably hits when `markDone` mutates D1 + sets `state.done` simultaneously.)
- **No undo on completion.** Once it's in this section, no quick way to reopen. Should have an `↺` button per row.
- **No timestamp in this section.** "Completed today" — but at what time? "10:14 AM" against each row would be a tiny but real win for the standup-prep use case.

### 2j. Right rail — Hermes / NeedsAttention / Projects / Pulse — `rail/*.tsx`
**HermesSuggestsCard.**
- **Not actually Hermes.** It's heuristic JS (`HermesSuggestsCard.tsx:20-52`) with no LLM call — the file even admits "Real Hermes requires async (60s listener poll); defer to a follow-up". Calling it "Hermes suggests" with the ✨ icon when there's no LLM is brand fraud. Either rename to "Today's focus" with no AI iconography, or actually wire it to `ai_requests`.
- **Bullets repeat data already on the page.** "Tackle '{title}' — Xd overdue" is already in NeedsAttention card 100px below it. Wasted vertical.

**NeedsAttentionCard.**
- **Top 5 truncation with no "+N more" link.** A lab with 18 overdue tasks shows 5 + nothing. Add a "5 of 18 · see all" link to `/portal/my-tasks?filter=overdue`.
- **No clickable task titles.** Rows are inert text. Click should open `TaskDetailPanel` or jump to the row in the main panel.

**ProjectsCard.**
- **Lists ALL active projects, not "today's relevant projects".** A 71-project lab fills this card with noise. Should default to "projects with tasks due today/overdue OR planned-today tasks" and offer a "show all" toggle.
- **Search input is the only filter.** No category filter (CLIF / Lab / Mentee / Nate). One-line addition.
- **No task count per project.** Just `nextAction` truncated to 80 chars (`TodayPage.tsx:135`). A small "(3)" badge for open-task count would be informational.

**PulseCard.**
- **`focusMin` is fake.** `plannedIds().length × 30` (`TodayPage.tsx:147`). A user planning 4 tasks sees "FOCUS: 120 min" regardless of task complexity. This is a metric that lies; better to have no metric. Either compute from real Pomodoro data or drop the tile.
- **`syncHours` is a brain.db cue most team members don't care about.** Rule 59 says coral if >24h. But for a non-Nick user who never runs sync, this number is always Infinity, displayed as "—h" — useless tile. Hide for non-PI users.
- **Mentees list never empty-states.** `mentees.length > 0` always — `researchTeam.map` returns one entry per team member, even if their `next === '—'`. So the card always renders 4 mentees with `—`. Should filter out users with no due tasks before truncating.

### 2k. Layout — `TodayPage.tsx:206-223`
- **`<style>` tag injected into the page** (`TodayPage.tsx:207-223`) for grid + hover states. Two violations: (a) inline `<style>` in component body re-injects on every render (React inserts it once but the text node is always present in the tree); (b) the `.b2-*` class names live OUTSIDE the design system. Should move to a CSS module or Tailwind v4 component layer.
- **`min-width: 0`** on `.b2-main` is correct flex hygiene — but the right rail has no `min-width` cap, so a very long project name in `ProjectsCard` will widen the rail past 340px on some browsers (340px is `grid-template-columns`, fixed — actually fine, but worth noting `ProjectsCard` truncation is doing the work).
- **Mobile breakpoint at 1024px** matches the data-page convention (rule per CLAUDE.md). Good. But on mobile, the right rail stacks BELOW the main panel (`TodayPage.tsx:220-222`) — which means a phone user has to scroll past the entire task list to see Hermes Suggests / Needs Attention / Pulse. That's exactly inverted from priority. On mobile, the rail content should live above the timeline (or in horizontal scroll cards as the comment suggests but DOESN'T implement: "rail collapses to 220px tall horizontal scroll cards" — code does plain stack).

### 2l. State machine — `useTodayState.ts`
**What it does well.** Single-day localStorage scoping (`today_state_${todayKey()}`) with auto-roll. The `allTaskIds.length === 0` skip in the trim effect (`useTodayState.ts:53`) is correctly guarded against the "wipe planned during initial load" bug. `markDone` writes through to D1 (`useTodayState.ts:87`).
**Falls short.**
- **`uncheck` writes status='todo'** (`useTodayState.ts:96`) — but if the task was originally `in_progress` or `blocked`, it's silently demoted to `todo`. Lossy.
- **No optimistic rollback on D1 failure.** `state.done[id] = true` is set, then `updateStatus.mutate(...)` fires fire-and-forget (no `onError` handler). If the API write fails, localStorage shows done but D1 says todo, and there's no UI signal. Optimistic UI without rollback is data-loss UI.
- **`state` is the dep of every callback** (`useTodayState.ts:64, 89` etc.) — every state change creates new function identities for every consumer, defeating React.memo. Should bind via `useRef` or split state into refs+setters.
- **No cross-tab sync.** Two browser tabs on Today both write `today_state_*` to localStorage. Each tab caches its own snapshot in React state. The `BroadcastChannel` infra exists in Phase 28 — reuse it here.
- **`promote` slots planned with `slot: 'strip'`** by default (`useTodayState.ts:69`) — fine, but a task that was previously `between-2` keeps its slot. Consistent — but worth a comment.

### 2m. Auto-promote effect — `TodayPage.tsx:72-89`
**What it does well.** `autoPromotedRef` ensures it fires once. Cascade of fallbacks (overdue → urgent → high → first task) is sensible.
**Falls short.**
- **Runs on every render where `tasks` or `state` changes** because of the deps array — but `state` is the entire api object and `state` identity changes on every render of `useTodayState` (since `plannedIds` is `useCallback([state])` and that keeps the callback fresh). Suspect: this effect re-evaluates oftener than intended; the `autoPromotedRef.current` guard catches it but still allocates the closure.
- **Doesn't re-promote after user explicitly unplans Right Now.** If user unplans → empty hero → that's the user's intent (don't auto-fill). Good. But the comment says "user's explicit unplan keeps Right Now empty" — verify by reading `unplan`: yes, sets `rightNow=null` only if it WAS the right now. So if user marks Right Now done and there's nothing planned, auto-promote is blocked because `autoPromotedRef.current === true` already. That's correct but creates a "dead" Right Now hero post-completion until refresh. Should re-arm `autoPromotedRef` on user-initiated `markDone` of right-now AND empty queue.
- **Auto-promote ignores the user's plan.** If the user has `state.planned` populated but no `rightNow`, the early-return (`TodayPage.tsx:76`) skips auto-promote — but doesn't promote the FIRST planned task. So the user lands on a page with a 4-task queue but empty Right Now hero. Should promote the first planned-id when `state.rightNow === null && plannedIds.length > 0`.

---

## 3. Findings table

| ID | Severity | Surface | Issue | Proposed fix | Effort |
|---|---|---|---|---|---|
| TP-01 | **P0** | Morning thought input | Decorative `<input>` w/ no submit / no state / no @hermes wiring (`TodayPage.tsx:237-244`) | Replace with `<SmartCompose boxed={false}>` + Cmd+Enter routes to {task / note / @hermes} based on prefix | M |
| TP-02 | **P0** | Right Now expanded chat | Same decorative pattern (`RightNowCard.tsx:67-71`) — typing does nothing | Embed `<SmartCompose taskId={task.id}>` here | S |
| TP-03 | **P0** | TaskDetailDrawer subtasks | `defaultChecked` w/ no `onChange` (`TaskDetailDrawer.tsx:114`) — checkbox toggles ARE NOT PERSISTED | Wire `useUpdateSubtask` mutation | S |
| TP-04 | **P0** | Cross-surface state drift | `state.done` localStorage doesn't reflect status changes from MyTasks/TaskDetailPanel; row stays "active" until refresh | Listen to React Query cache for `['tasks']` invalidations, sync `state.done[id]` from `task.completed===1` | M |
| TP-05 | P0 | Timeline meeting notes | `meetingNotes` is component state (`Timeline.tsx:51`) — refresh = dataloss | Persist to API or `today_state_*` LS bucket | S |
| TP-06 | P0 | Optimistic markDone | No rollback if D1 write fails (`useTodayState.ts:87`) | Add `onError` revert + toast | S |
| TP-07 | P1 | Right rail mobile order | On ≤1024w, rail stacks BELOW task list — Hermes/Attention buried | Move rail above timeline on mobile, OR implement the promised 220px horizontal-scroll cards | M |
| TP-08 | P1 | No virtualization on groups | 200+ tasks render 200+ rows | Wrap each `TaskGroup` body in `useVirtualizer` (already a dep) | M |
| TP-09 | P1 | No live "now" line on Timeline | The single feature that would make it FEEL like a timeline is missing | 1px abs-positioned line at `(now - dayStart) / dayLength`; updates via `setInterval(60_000)` | M |
| TP-10 | P1 | Meeting join link missing | iCal events ship Zoom/Teams URLs (rule 64) but `EventRow` doesn't render a button | Surface URL as a `🔗 Join` chip on `EventRow` | S |
| TP-11 | P1 | OverlapBand is null | Two meetings at 10am render with zero collision cue (`OverlapBand.tsx:29`) | Detect overlap by `start < other.end && end > other.start`; render dashed-bordered side-by-side band | M |
| TP-12 | P1 | TaskRow has no due date / priority | Row carries title + project + planned chip — that's it. Operating-day surface w/o urgency cue is broken | Add tabular-nums due-date cell (right-aligned) + 4px priority dot (left) | S |
| TP-13 | P1 | Token violations: `#fff`, `#0a0f15`, hardcoded hex | Many sites (`TodayPage.tsx:215, 217, 227, 258`, etc.) | Migrate to `--ink-bright`, `--surface-1`, etc. — Today's 5 accent constants are fine, but structural colors should use tokens | M |
| TP-14 | P1 | "Hermes suggests" w/o real Hermes | Heuristic JS branded as AI (`HermesSuggestsCard.tsx`) | Either rename to "Today's focus" + drop ✨, or wire a 1×/day cached `ai_request` | M |
| TP-15 | P1 | Decorative emoji icons | `🔴 🕰 📌 📅 ✓` in PillStrip + `🎯 ✅ ⚡ 🧠 🔧` in GROUP_META | Replace with lucide stroke icons or `CategoryIcon` primitive | S |
| TP-16 | P1 | PulseCard `focusMin` is fake | `planned × 30` is meaningless (`TodayPage.tsx:147`) | Drop tile OR wire to actual focus-session timer | S |
| TP-17 | P1 | Lab Health math is naive | Linear formula with no floor — 25 overdue = 0/100 forever | Log/sigmoid scaling, or kill the tile | S |
| TP-18 | P1 | NeedsAttention top-5 truncation | No "+N more" overflow link | Add link to `/portal/my-tasks?filter=overdue` | S |
| TP-19 | P1 | ProjectsCard renders all 71 projects | Noise; defeats the operating-day frame | Default to "projects relevant today" + show-all toggle | M |
| TP-20 | P2 | Mentees never empty-states | All researchTeam.map → '—' fallback always rendered (`TodayPage.tsx:151-161`) | Filter to mentees with `next !== '—'` BEFORE slice | S |
| TP-21 | P2 | Auto-promote skips planned queue | If `rightNow=null && plannedIds.length>0`, hero stays empty | Promote first planned-id when right now is empty | S |
| TP-22 | P2 | DropZone spam | 5 dashed zones always visible; noisy at idle | Render only during active drag (`dragstart`/`dragend` listener) | S |
| TP-23 | P2 | Dismissed meetings don't persist | Refresh = un-dismissed (`Timeline.tsx:50`) | Persist to `today_state_*` | S |
| TP-24 | P2 | "Click a task to expand…" hint | Always-visible; reads as beta tutorial | Behind `?` icon, OR auto-fade after first interaction | S |
| TP-25 | P2 | Completed-today double count | Tasks both `completed===1` AND `state.done[id]` counted twice | De-duplicate by id | S |
| TP-26 | P2 | uncheck downgrades to `todo` | Loses original `in_progress` / `blocked` (`useTodayState.ts:96`) | Cache pre-done status in `state.prevStatus[id]` | S |
| TP-27 | P2 | TableSkeleton mismatched | Page is 5 grouped sections, skeleton is columnar table | Custom skeleton matching 5-group shape | S |
| TP-28 | P2 | No keyboard shortcuts | Hub has J/K nav on every list page; Today has none. No `D` for done, no `space` for promote, no `F` for focus | Wire Today shortcuts: `J/K` row-nav, `D` done, `space` promote-to-Right-Now, `?` shortcut help | M |
| TP-29 | P2 | Timestamp missing on completed-today | "Completed today" w/o time | Add `HH:MM` to each row | S |
| TP-30 | P2 | No description preview on Right Now | Have to expand to get context | Show 60-char description preview at low opacity | S |
| TP-31 | P2 | Task.description first-line === why fallback dup | Why card duplicates description when no real why exists (`TaskDetailDrawer.tsx:30`) | Hide Why card when fallback equals description's first line | S |
| TP-32 | P2 | Cross-tab state sync | Two tabs maintain independent today_state | Use existing `BroadcastChannel` infra to sync | M |
| TP-33 | P2 | No reduced-motion respect on `b2pulse` | The Right Now dot pulses 1.6s linear (`TodayPage.tsx:208`) — should respect `prefers-reduced-motion` | Add `@media (prefers-reduced-motion: reduce) { .b2pulse { animation: none } }` | S |
| TP-34 | P2 | No aria-live on Right Now changes | Promote/done changes Right Now silently for screen readers | `role="status"` + `aria-live="polite"` on the Right Now container | S |
| TP-35 | P2 | Inline `<style>` block | `TodayPage.tsx:207-223` — should be a real CSS module / global stylesheet | Move to `src/styles/today.css` or Tailwind component layer | S |
| TP-36 | P3 | Empty state for "Right Now" lacks brand voice | Informational, not motivational | Voice pass with PI | S |
| TP-37 | P3 | Page header `Today` heading w/o time-of-day greeting | Old Dashboard had this, regression | Add "Good morning, Nick · …" pattern from Phase 26b | S |
| TP-38 | P3 | Bullet 1 of HermesSuggestsCard duplicates NeedsAttention top-1 | Same datum surfaced twice | De-dupe: if HermesSuggests bullet 1 === NeedsAttention top-1, skip the bullet | S |
| TP-39 | P3 | No "tomorrow planning" mode | After 5pm, page should pivot to "plan tomorrow morning" | Time-aware morning thought input + "carry forward" affordance | L |
| TP-40 | P3 | No focus timer / Pomodoro | Operating-day surface w/o time-blocking | 25/50min timer attached to Right Now | L |
| TP-41 | P3 | No end-of-day reflection | "What shipped today / what blocked you" prompt missing | Modal at 5pm w/ 1-line text → posts to `task_updates` for active tasks | L |

---

## 4. Top 5 high-leverage enhancements

### E1. Wire the morning-thought input into the daily flow (P0 — fixes TP-01 + opens new use cases)
**What.** Replace bare `<input>` at `TodayPage.tsx:237-244` with a multi-modal `SmartCompose` that routes by prefix:
- `@hermes <question>` → posts to `ai_requests` with `entity_type='daily_thought'`, returns to a "Hermes is thinking…" inline card.
- `note: <text>` → posts to a new `daily_thoughts` table or appends to a `today_log` JSON in `today_state_*`.
- `task: <text>` (or no prefix) → creates a task via `useCreateTask` w/ `assignee=userSlug`, default group from preferences.
- After 5pm: prompt swaps to "Plan tomorrow's first move…" — task is created with `due_date=tomorrow`, auto-pinned to tomorrow's planned strip.

**Where.** `TodayPage.tsx:237-244` + new `src/components/today/MorningThought.tsx`. Reuse `SmartCompose`'s mention/file/emoji infra.

**Why.** Today is the operating-day surface; the most prominent input slot promising "delegate to Hermes" being inert is the highest-severity UX defect on the page. Fixing this also unlocks the tomorrow-planning use case the page is currently missing entirely.

**Expected impact.** Reduces context-switching to `/portal/ask-the-lab` and `/portal/tasks` (both 1 click + scroll away). Closes the "I had a thought, where do I put it" gap that drives Slack DMs to PI.

### E2. Live "now" line + proportional time blocks on Timeline (P1 — TP-09 + TP-12)
**What.** Two changes:
1. Add a 1px gold/coral horizontal line at `(currentTime - 7AM) / 12hr` of the timeline section's height. Updates every minute via `setInterval`. Coral if user is currently in a meeting; gold otherwise.
2. Render meetings as proportional-height blocks (15min = 24px, 60min = 96px) rather than uniform list rows. Use the iCal `start + end` already plumbed.

**Where.** `Timeline.tsx:74-130` — wrap `visibleMeetings.map` in a relative-positioned container with absolute children.

**Why.** A "timeline" surface that's actually a flat list is fiction. The whole brand promise of "operating day" requires the user to FEEL where they are in the day. This is a 60-line addition that transforms the surface.

**Expected impact.** Visual orientation cost drops to zero. Time-blocking becomes intuitive — drag a 90min task into a 90min slot. Makes the FOCUS metric meaningful (it could be sum-of-block-heights in min).

### E3. Real cross-surface state for completion (P0 — TP-04)
**What.** Replace `state.done` localStorage map with a derivation from the React Query cache. `state.done[id]` becomes `tasks.find(t => t.id === id)?.completed === 1` (already what's in the cache after `useUpdateTaskStatus` invalidates).

**Where.** `useTodayState.ts:30-37` — drop `done` from the persisted shape; consumers read from props.

**Why.** Currently a task completed on `/portal/my-tasks` doesn't show as completed on `/portal/dashboard` until full page reload. The bug is a class violation of rule 18 ("detail panels must subscribe to cache, not parent state") applied to the wrong surface.

**Expected impact.** Eliminates an entire class of "I completed it but it's still showing as open" reports. Makes Today truly real-time.

### E4. Group collapse + virtualization (P1 — TP-08)
**What.**
1. Add `collapsedGroups: Record<GroupKey, boolean>` to `today_state_*`. Default: `priorities` + `pb` expanded, `deep` + `quick` + `etl` collapsed-with-3-preview-rows.
2. Wrap each TaskGroup body in `useVirtualizer` from `@tanstack/react-virtual` with 44px estimated row height.

**Where.** `TaskGroup.tsx:31-43` virtualization; new `useTodayState` field for collapse.

**Why.** A real lab member has 80-200 open tasks. Today renders all of them. Page becomes 4000-9000px tall scroll-bomb. Linear/Notion/Asana all default to 5-line preview + expand.

**Expected impact.** First-paint TTI drops from ~600ms to ~150ms with 200 tasks. Mobile becomes usable.

### E5. Timeline meetings: persist notes + add "Join" + render overlap (P1 — TP-05, TP-10, TP-11)
**What.** A combined Timeline upgrade:
1. Persist `meetingNotes` to a new `meeting_quick_notes` D1 table (or piggyback `task_updates` w/ `entity_type='meeting'`). Auto-save on blur. Currently a dataloss bug.
2. Surface the `meeting_url` field that ics-parser extracts (rule 64) as a `🔗 Join` button in `EventRow`, `target="_blank"`.
3. Implement `OverlapBand` — detect via `start < other.end && end > other.start`, render a dashed wrapper around colliding events with side-by-side grid.

**Where.** `Timeline.tsx:50-51` (persistence), `MeetingRow.tsx:23-32` (join button), `OverlapBand.tsx:25-30` (rendering).

**Why.** Three integrations that should already be wired given the iCal infrastructure exists. They're each independent ~30-line changes. Notes-don't-persist is a data-integrity bug that's been silently shipped; Join-link is a 5-min friction-killer; overlap-band is a calendar-correctness must-have.

**Expected impact.** Meetings tile becomes worth using. Currently it's "static list of titles I already saw on my calendar".

---

## 5. Brand & design-system observations

- **Token violations are pervasive.** Hardcoded `#fff`, `#0a0f15`, `#0b1017`, `#0f1923`, `#5cbcb4`, `#dcb355`-equivalents litter this tree. The 5 accent constants in `constants.ts` (`ACCENT_GOLD/TEAL/CORAL/ORANGE/GREEN` + `INK*` + `PAGE_BG/PANEL_BG`) are the only sanctioned palette. The Pulse Kiosk page (rule 32) has a documented exception; TodayPage doesn't, but ships like it does. Every `#fff` should be `var(--ink-bright)` (rule 14). Every `rgba(255,255,255,0.0X)` should be a `--surface-N` token. Phase 31's z-index hierarchy says all zIndex must use tokens — `TaskDetailDrawer.tsx:76` uses `zIndex: 30`, plain integer.
- **Brand primitive reuse gaps (rule 29).**
  - `HermesMark` is the canonical AI-assistant icon. `HermesSuggestsCard` uses `<span>✨</span>` (`HermesSuggestsCard.tsx:57`). Wrong.
  - `CategoryIcon` (lungs/flask/heartbeat/cap) is the canonical project-category indicator. `tagForTask` uses raw emoji (`constants.ts:111-124`). Wrong.
  - `HeartbeatLine` IS used in the page header (`TodayPage.tsx:228`) — but only static variant. Missed opportunity to use animated variant on Right Now hero (a heartbeat is the lab's literal motif and a Right Now hero is conceptually a heartbeat).
- **Accent mis-assignment.** Rule 59 says gold = user action / Right Now / Hermes / planned. The Right Now hero correctly uses gold (`RightNowCard.tsx:34`). But the `b2pulse` keyframe (`TodayPage.tsx:208`) animates opacity 1→0.4→1 — that's the GOLD dot pulsing. **Mount-animations must be transform-only (rule 44, rule 10)**. Use `transform: scale()` instead of `opacity:` to stay AA-stable + axe-clean.
- **Animation timing is not from the design tokens.** The `transition: 'all 120ms'` in DropZone (`Timeline.tsx:33`), `'background 220ms'` in TaskRow (`TaskRow.tsx:26`), `'all 150ms'` in Pill, etc. — all hand-tuned numbers. Design system ships 5 durations: `--duration-instant/fast/normal/moderate/slow`. None are used. 220ms doesn't snap to any of them.
- **Inline styles are the norm here.** The entire Today tree is style-prop driven. This is fine for prototyping but every `style={{ ... }}` literal allocates a new object on render and disables Tailwind's design-system enforcement. The audit-framework tokens (Phase 31) can't catch violations in `style={{}}` literals.
- **Letter-spacing inconsistency.** `-0.03em` on h1 (`TodayPage.tsx:227`), `-0.02em` on h2 (`TodayPage.tsx:258`), `-0.01em` on h3 (`Timeline.tsx:62`). That's a step pattern but no token. Define once.
- **Font-weight discipline.** `fontWeight: 600` (heading), `500` (ui), `700` (700 should be metric-only per ethos). `'b2-rail'` heading uppercases at `fontWeight: 700` — that's metric-tier weight on a category label. Should be 500. Same on `TaskGroup.tsx:27` (700 on h4).
- **No JetBrains Mono violations** — confirmed clean. The `<kbd>` at `TodayPage.tsx:243` correctly uses `--font-mono`. Good.

---

## 6. Edge cases / failure modes uncovered

- **User has 0 tasks total.** `tasks.length === 0` → auto-promote skips → empty Right Now → 5 empty TaskGroups (each renders null due to `tasks.length === 0` short-circuit at `TaskGroup.tsx:22`) → Timeline renders meetings if any → "Completed today" section is empty. The middle of the page is just one dashed `Right now · empty` card and a timeline. No empty-state hero. A new team member's first day = "is this thing on?".
- **User has tasks but ALL have completed=1 / status='done'.** Tasks filter at `TodayPage.tsx:52` strips them — same as 0-task case.
- **Right Now task gets reassigned away from current user.** `useTasks({ assignee: userSlug })` no longer returns it → `tasks.find(t => t.id === state.rightNow)` returns undefined → `rightNowTask = null` → empty hero. But `state.rightNow` is still the orphaned id in localStorage. Next render auto-promote refuses to fire (autoPromotedRef.current is true), so user stares at empty hero. No cleanup path.
- **Right Now task gets deleted on another surface.** Same as above — `rightNow` points to id no longer in `tasks`. The trim effect in `useTodayState.ts:58-59` clears `state.rightNow` ONLY if `allTaskIds` includes the id. But `allTaskIds` is `tasks.map(t => t.id)` — completed tasks already removed. So the effect WILL clear orphaned right now. Good. **But** `autoPromotedRef.current` is now `true`, so no replacement is auto-promoted. Empty hero stays.
- **User's iCal feed has 50 events today (long conference day).** Timeline becomes a 50-item flat list. No virtualization. CPU jank on scroll.
- **User opens Today at 11:55 PM.** `todayKey()` returns today's date. At 12:01 AM, `todayKey()` flips to tomorrow's date — but `useTodayState` doesn't re-key. New tab on the new day = fresh state; original tab still on yesterday's snapshot. No visual indicator that the day rolled over.
- **`@mention` of someone who left the lab.** Not a Today bug per se, but `SmartCompose`'s mention list comes from `team` query, which still shows a left team member. Out of scope for this page but worth noting.
- **`b2pulse` animation never stops on `prefers-reduced-motion`.** Design-system rule: respect reduced motion globally. Today's keyframe injection (`TodayPage.tsx:207-223`) doesn't gate on the media query.
- **Drag-and-drop on touch devices.** `draggable` HTML5 doesn't work on iOS/Android. Drop zones are dead on mobile. UnifiedMyTasks ships swipe gestures (rule 56) — Today doesn't.
- **Deleting a task while drawer is open.** Drawer subscribes via `useTaskDetail(task.id)` (`TaskDetailDrawer.tsx:27`) but the parent `task` prop is passed in by id from the cached `tasks` array. If `task` is removed from cache, parent re-renders with `task` undefined → drawer crashes. Need defensive null check.
- **Move → popover stays open during drag.** No close on drag-start. Cosmetic but jarring.
- **Two users on the same task, one promotes to Right Now.** `state.rightNow` is per-user localStorage — fine, no cross-user conflict. But if Right Now also gets a presence indicator someday (it should — Pattern 49 says presence is entity-scoped), this needs design.

---

## 7. Open questions for PI (Nick)

1. **Should "Right Now" persist across days?** Currently each new day starts with `rightNow=null` and auto-promote picks fresh. Is that the intent, or should the user explicitly carry forward yesterday's Right Now if they didn't finish?
2. **`group_override` UX — single bucket or stacked?** Current Move → writes ONE override. Should a task be allowed in multiple buckets (e.g. "deep" AND "priorities")? Today's data model says no, but the operating-day mental model sometimes wants both.
3. **Tomorrow-planning mode — explicit toggle or time-aware?** E2 above proposed time-aware (auto-pivot at 5pm). Cleaner UX but you might want an explicit "Plan Tomorrow" button so the pivot doesn't surprise users on a 9pm finish.
4. **"Hermes suggests" — hard-rename or wire it for real?** A 1×/day cached `ai_request` is doable in <1 day. Or rename to "Today's focus" if you don't want the LLM in the loop here.
5. **`focusMin` — drop or wire to real timer?** No visible value as-is. A real Pomodoro timer attached to Right Now (E5 above) would solve it but adds surface area.
6. **PulseCard `syncHours` — PI-only?** This is a brain.db cue. Other team members never run sync; their tile is always "—h". Hide the tile for non-PI?
7. **5 task groups — correct? too many?** Linear / Notion default to 3 (Today / Upcoming / Backlog). Five buckets feel right for your specific workflow but the cognitive overhead is real, especially mobile.
8. **Right rail mobile order — rail-above or task-list-above?** Current: list above rail. My take: rail above on mobile (Hermes Suggests + NeedsAttention are higher-leverage on a phone glance). But you may disagree.
9. **End-of-day reflection prompt — do you want it?** "What shipped today / what blocked you" at 5pm pushes notes into `task_updates` for active tasks. It's the operating-day-close ritual but it's also a notification you might not want.
10. **Should the "morning thought" input default to creating a task or a daily-log entry?** Different default = different muscle memory. Current placeholder hints @hermes; my proposal hints task. Pick one and commit.

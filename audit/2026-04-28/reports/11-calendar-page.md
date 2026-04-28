# CalendarPage Audit — `/portal/calendar`

**Date**: 2026-04-28
**Agent ID**: `ad359154c94b999be`
**Files reviewed**: `src/pages/portal/CalendarPage.tsx`, `api/routes/calendar.ts`, `api/lib/ics-parser.ts`, `src/components/CalendarFeedsPanel.tsx`, `src/hooks/useApiData.ts:702`+`:1523`, `src/lib/api.ts:380`

## 1. Executive read

- **The big finding is structural, not visual: this Calendar does not show iCal events.** `useCalendarEvents` (`useApiData.ts:702`) hits `/api/calendar/events`, which queries `meetings`, `tasks`, and `milestones` only (`api/routes/calendar.ts:10-17`). `user_calendar_events` (Phase 39 schema v52) lives behind a separate `/api/integrations/calendar/events` endpoint feeding `useUserCalendarEvents` (`useApiData.ts:1523`), and *nothing in `CalendarPage.tsx` imports it*. The Phase 39 spec said "Today timeline merges these with team meetings" — that promise is fulfilled on TodayPage but the page literally called "Lab Calendar" remains a Hub-only surface. For a user who just pasted their iCal URL into `/portal/profile`, this is the most violated mental model in the Hub.
- **The grid is a calendar but not a schedule.** All four views key on `e.date` (a `YYYY-MM-DD` string from `tasks.due_date`, `meetings.date`, `milestones.target_date`). There is no time component anywhere — no "3pm CT", no proportional time blocks, no now-line, no overlap rendering. Week view is just seven adjacent month-cells stacked vertically (`CalendarPage.tsx:402-441`). For a Tuesday 3pm meeting + a Tuesday 11am meeting they render in arbitrary array order with identical visual weight. This is a calendar of *dates*, not a calendar of *time*, and Phase 39's iCal events arrive with full DTSTART timestamps the parser already resolved to ISO-8601. The infrastructure is upstream of the rendering by ~6 months.
- **View density is inverted from intent.** Month view crushes events to 20-char truncation in 80px-tall cells with a 3-event ceiling (`CalendarPage.tsx:351-368`). Week view is the *most generous* layout (300px tall cells, 32-char titles) but is identical to month-view-zoomed. Day view is the only one that surfaces assignee + meeting link, and Agenda is the only useful planning surface but excludes everything before today (`CalendarPage.tsx:511`). For a research lab the Agenda view is the answer; the page defaults to Month.

## 2. View-by-view walkthrough

### Month view (`CalendarPage.tsx:257-343`, `DayCellRender:347-372`)

Standard 7×N grid. Sun-first week start (US convention; the lab is US-based so fine). `eventsByDate` map computed once per render — good. The dense-week toggle (P3-08, lines 287-323) collapses event-less weeks to a one-liner — clever but rare-utility; for the typical research week with 2-3 events per row it never fires. Today highlight uses `--teal-hover` cell bg + `--teal-solid` round badge for the date number (`DayCellRender:351-353`) — clean, on-brand.

Three problems:

1. **3-event cap with `+N more`** (line 366) but `+N more` is a `<span>`, not a button. There is no way to expand it. On a conference week with 8 events on Wednesday, five are silently lost.
2. **Title truncation at 20 chars + `...`** (line 362) is hardcoded character math, not CSS `text-overflow`. "MNCCORE Biweekly Sync" → "MNCCORE Biweekly Syn..." which kills the recognizable brand glyph. The wrapping `Wrapper` already has `truncate` (line 361) — the JS slice is double-trimming.
3. **Only meetings are clickable.** Tasks and milestones render as `<div>` (line 358). Clicking `R01 Specific Aims due` does nothing — no detail panel, no nav to `PATHS.task(id)`, no nav to `PATHS.deadlines`. This is the single highest-friction bug on the page.

### Week view (`CalendarPage.tsx:376-441`)

7 columns wide × 300px min-height each. Same `eventsByDate` map. Today gets a teal border + teal-tinted background. Each event is a tiny pill with icon + 32-char title.

This is **not a week view as the term is understood in calendar software.** No time axis, no hour rows, no event durations. A 9am-10am Zoom and an all-day deadline render with identical visual weight. There is no current-time line. Two events at the same wall-clock time render stacked in `dayEvents` array order, with no visual indication they overlap. Mobile collapses 7 columns into a horizontal scroll — at 360w a column is ~50px, which makes the icon visible and the title illegible.

The 300px min-height is empty whitespace 95% of the time. A typical Wednesday for a faculty member has 4 events; the cell renders them in ~80px and leaves 220px of dead space.

### Day view (`CalendarPage.tsx:445-501`)

Best-designed of the four. Each event is a 60px-tall row with a 40px tinted icon square, full title, type pill, assignee chip. Renders meetings as `<Link>`, tasks/milestones as `<div>` (same partial-clickability problem as Month). Empty state is a friendly `EmptyState` component ("A quiet day"), which is on-tone for the Hub.

But: still no time component. A day has `n` events listed in arbitrary order, no `9:00 AM | meeting` prefix. For a faculty user this is a flat list of "things on Tuesday" sorted by D1 row order. That's not a day view.

### Agenda view (`CalendarPage.tsx:505-566`)

Group-by-date list with stagger animation, today highlighted with teal vertical bar. **This is the only view that's actually fit for purpose** for the lab's actual use case ("what's coming up across the team"). It's also the only view that filters out past events (`if (e.date < today) continue`, line 511). For meeting prep + deadline awareness this is the right shape. It should be the default.

Bug: same partial-clickability problem — meetings link, tasks/milestones don't.

## 3. Findings table

| ID | Severity | Surface | Issue | Fix | Effort |
|---|---|---|---|---|---|
| C-01 | **P0** | All views | iCal personal events from `user_calendar_events` are never rendered. The page that says "Lab Calendar" excludes the user's actual calendar. | Add `useUserCalendarEvents()` to CalendarPage; merge into events array with `type: 'personal'`; add `eventColors.personal` token; legend entry. | M (3h) |
| C-02 | **P0** | Month view | Tasks + milestones render as non-interactive `<div>` (line 358). Clicking does nothing. | Wrap as `<Link>` for tasks → `PATHS.task(id)` (or open TaskDetailPanel); milestones → `PATHS.deadlines` filtered. | S (1h) |
| C-03 | **P0** | All views | Page renders calendar dates but ignores time. Two 3pm meetings + one 9am render in DB order. iCal events have full ISO timestamps the parser already resolved. | Add `time` field (HH:mm) to CalendarEvent; sort within day; render as left-prefix in Day/Agenda; add hour-grid in Week view. | L (1-2 days) |
| C-04 | **P1** | Month view | "+N more" is a `<span>`, not interactive. Events 4-N are silently dropped. | Convert to button → opens DayView for that date OR popover with full list. | S (1h) |
| C-05 | **P1** | All views | View choice not persisted. Reload always lands on Month. | localStorage key `calendar-view`. Pattern already in place for `denseWeek`. | XS (15m) |
| C-06 | **P1** | All views | No "now" line on Week/Day. No way to anchor "where am I in the day". | Once C-03 ships, add horizontal red line at current minute. | S (2h) |
| C-07 | **P1** | All views | No way to create events from CalendarPage. User must navigate to /meetings → New Meeting. | "+ New" button in PageHeader actions; opens existing CreateMeetingModal pre-filled with date. | S (2h) |
| C-08 | **P2** | Month view | 20-char title slice (line 362) double-trims with CSS `truncate` and hard-cuts the formatBrandName output. "MNCCORE..." loses the brand glyph. | Drop the JS slice; let CSS `text-overflow: ellipsis` handle it. Keep `title=` for hover. | XS (5m) |
| C-09 | **P2** | Week view | 300px min-height per cell is dead space 95% of the time on 4-event days. | Once Week view is rebuilt around hour-rows (C-03), this collapses naturally. Pre-C-03: shrink to fit-content with min 120px. | XS |
| C-10 | **P2** | Mobile | Week view at 360w → 7 columns of ~50px each = title illegible, icon-only. | Mobile (`<768px`) Week view should fall back to Agenda layout. | M (3h) |
| C-11 | **P2** | All views | No filter by event source. Can't say "show only tasks" or "hide team meetings". | Add chip-row filter (Meetings | Tasks | Milestones | Personal) above grid. | S (2h) |
| C-12 | **P2** | Day/Agenda | Meeting URL chip from iCal (Zoom/Teams/Meet links the parser already extracts) is invisible. | After C-01: add "Join" button when `event.meta?.meetingUrl` present. | S (1h) |
| C-13 | **P2** | Agenda | Past events excluded (line 511). User can't review last week. | Add "Past 7d" toggle in Agenda. | XS (30m) |
| C-14 | **P3** | All views | iCal export (line 111-125) only emits `DTSTART;VALUE=DATE:` — no times even when source had them. | Once C-03: also emit DTSTART;TZID= for timed events. | S (1h) |
| C-15 | **P3** | All views | `aria-label="Previous month"` (line 182) is wrong for week/day views. Says "month" regardless. | Dynamic label: `Previous ${view}`. | XS (5m) |
| C-16 | **P3** | All views | Header label button (line 188-194) is a `<button>` with no onClick. Looks clickable, isn't. | Make it the "go to today" trigger, OR strip button semantics. | XS (10m) |
| C-17 | **P3** | All views | Hardcoded `rgba(45,138,138,0.2)` in `boxShadow` for today (line 351). Off-design-system. | Use `--teal` with `color-mix`. | XS (5m) |
| C-18 | **P3** | Day view | `e.type === 'meeting' ? Link : 'div'` typed as `as any` (lines 358, 468, 536). | Single `<EventLink>` component that resolves the wrapper. | S (1h) |
| C-19 | **P3** | All views | `formatBrandName` called inline in IIFE three times per render (lines 362, 427, 478). | Compute once, pass as prop. Trivial perf, code clarity. | XS |
| C-20 | **P2** | All views | No cancelled-event handling. Phase 39 parser drops `STATUS=CANCELLED`, but Hub `meetings` has no equivalent — a cancelled biweekly stays on the grid. | Add `cancelled_at` to meetings + filter; or strikethrough render. | M (4h, schema change) |
| C-21 | **P2** | All views | No overlap rendering. Two 3pm meetings = stacked in array order. Per Rule 59, coral is the warning color. | Once C-03: detect overlap, render side-by-side with coral border. | M |
| C-22 | **P3** | Mobile | Mobile prev/next per R12-H4 are 44px (line 184) — good. But the today-label button (line 188-194) is 44px tall × 180px wide and looks like a clickable header. Touch target is bigger than intent. | Strip button if non-interactive (see C-16). | XS |
| C-23 | **P3** | All views | No rendering of multi-day events. iCal can have 3-day conferences (DTSTART=Mon, DTEND=Wed). Parser preserves endAt. CalendarEvent type drops endAt. | Extend CalendarEvent shape with optional `endDate`; render as bar spanning cells. | M |
| C-24 | **P3** | All views | No rendering of all-day vs timed events. Parser sets `isAllDay` boolean. CalendarEvent type drops it. | After C-01: distinct visual treatment (all-day = banner across top of day; timed = positioned by hour). | M |

## 4. Top 5 high-leverage enhancements

1. **Wire iCal events into CalendarPage (C-01).** This is a 3-hour change that fulfills the Phase 39 promise. The data is in D1 (`user_calendar_events`), the API is live (`/api/integrations/calendar/events`), the React hook exists (`useUserCalendarEvents`). The CalendarPage just doesn't subscribe. Until this lands, the value prop "private iCal feed merges with team calendar" is a half-truth that only Today honors.
2. **Make the Calendar a schedule, not a date list (C-03).** This is the rebuild that earns the page real estate. Add hour-grid Week view (rows from 7am-8pm by default, with overflow), proportional event blocks, now-line. iCal events arrive with full timestamps the parser resolved through `Intl.DateTimeFormat` — the time data is sitting unused. Hub `meetings.date` is currently only `YYYY-MM-DD` so step 1 is a schema migration to add `start_time`/`end_time`.
3. **Default view = Agenda + persist choice (C-05 + reorder views).** For a 19-person research lab the operating-day question is "what's coming up across the team this week" not "what does April 2026 look like as a grid". Agenda answers the first; Month answers the second. Reorder toggle to `agenda | week | day | month` and default to agenda for first-time users.
4. **Make every event clickable to its source (C-02 + C-12).** Tasks → TaskDetailPanel (consistent with TodayPage / UnifiedMyTasks behavior). Milestones → grant detail. iCal events with meeting URLs → "Join" button (the parser already extracts Zoom/Teams/Meet links from DESCRIPTION — `ics-parser.ts:247-269`). This is the lowest-effort UX uplift on the page.
5. **Add CategoryIcon + source tinting per Rule 29.** Right now Meeting is teal Users icon, Task is gold CheckSquare, Milestone is maroon Diamond. Personal iCal events should land as `--teal-subtle` (per Rule 59 teal = system/meeting category) and use `CategoryIcon` for category-keyed source (lab/clif/personal). Currently the page uses lucide directly — swap to brand primitives.

## 5. Calendar source merge observations

What `/api/calendar/events` merges (`api/routes/calendar.ts:10-17`):
- Hub `meetings` table (id, date, title, type) — no time, no location, no Zoom URL
- Hub `tasks.due_date` where `completed = 0` — assignee + status + priority included as `meta`
- Hub grant `milestones.target_date` — mechanism + grant_title in title

What it does NOT merge:
- `user_calendar_events` (Phase 39 v52, the iCal personal feed payload)
- Task `due_date` for *completed* tasks (line 13 hardcodes `completed = 0`) — fine for "what's left" but breaks Agenda "past 7d" if added
- `regulatory_items.expiration_date` (Phase 25 schema v27) — IRB/COI expirations should be on the calendar
- `manuscript_revisions` review-due dates (Phase 25 schema v23) — referee-due dates are real deadlines
- `paper_submissions.event_date` (Phase 25 schema v26) — submission events have explicit dates
- `nih_grants.deadline` — grant deadlines are missed if not also a milestone row
- Nick's recurring `mnccore_biweekly` (Tuesday 3pm CT cadence) — this only lives in the convention "every other Tuesday" not as future row inserts

What the page UI implies should be merged but isn't:
- The legend says "Meetings · Task Due · Milestones" (line 246). No mention of Personal. So users don't know iCal events should show up. The bug is hidden by the legend.
- The empty state says "Meetings, deadlines, and milestones stream in here as the team books them" (line 561) — explicitly omits "your personal calendar".
- The subtitle is dynamically `${events.length} events · ${todayCount} today` (line 134-138). For a user with a busy iCal feed but a quiet Hub, this reads "0 events today" when their Google Calendar shows 4. Worse than missing — actively misleading.

The simplest patch to the merge problem is *one new SELECT* in `handleCalendarEvents` reading `user_calendar_events` for the current user, mapped to `type: 'personal'`. Time component can be ignored at first since the rest of the page ignores time anyway.

## 6. Brand & design-system observations

- **Mostly token-clean.** Borders use `--border-subtle` consistently. Backgrounds use `--cream` / `--teal-hover` / `--surface-1`. Text uses `--ink` / `--slate`. Type scale uses `text-[10px]` literals which violate Rule 38 (`--text-micro`/`--text-caption` tokens exist) — 11 occurrences in this file. Should be `text-micro` utility class.
- **Hardcoded violations:**
  - Line 351: `boxShadow: 'inset 0 0 0 2px rgba(45,138,138,0.2)'` — should be `color-mix(in srgb, var(--teal) 20%, transparent)`.
  - Lines 19-23: `eventColors` map uses `var(--teal)`, `var(--gold)`, `var(--maroon)` directly — these are the *theme-flipping* tokens per Rule 41. White text on `var(--gold) 12%` background is fine since it's just a tint, but if anyone bumps opacity above ~20% the dark-mode AA breaks. Pin to `--stage-fill-*` if the bg ever becomes solid.
- **Brand primitive miss (Rule 29):** Page uses lucide `Users` / `CheckSquare` / `Diamond` for event icons. Per Rule 29 the lab has its own `CategoryIcon` (lungs / flask / heartbeat / cap) — for project-derived tasks, that icon should map. Hermes-scheduled meetings should use `HermesMark`. None of these are wired.
- **Heartbeat motif missing.** The lab's signature is the ECG line. Calendar is a perfect surface for `<HeartbeatDivider>` between weeks in Agenda view, or as a section break between past/future. Currently uses a plain border-l (line 531).
- **Animation discipline correct.** Day + Agenda use `staggerContainer` / `staggerItem` from `lib/animations.ts` (transform-only, per Rule 44). Month view doesn't animate, which is correct — content visible by default per Rule 1.
- **Today highlight is two-system (Rule 28 violation).** The today cell in Month gets `boxShadow: inset 0 0 0 2px rgba(45,138,138,0.2)` AND a teal-solid round badge for the date. Two emphasis treatments compete. Pick one: badge OR ring. Linear/Notion both use the badge alone.
- **`aria-current` missing.** Today's cell carries no `aria-current="date"`. Screen reader users navigating the month grid have no signal which day is today (the visual round badge means nothing to AT). Per Rule 28 sidebar precedent, this needs `aria-current`.
- **Legend density.** Legend (line 241-249) renders three colored dots + labels in a flex row. Fine on desktop, wraps awkwardly on 360w. Should be collapsible on mobile.

## 7. Edge cases / failure modes

- **Empty week.** Month view renders empty cells (good). Week view renders 7 cells with "—" placeholder (line 433). Day view gets EmptyState. Agenda hides the day entirely. Inconsistent — Day's pattern is the friendliest.
- **50-event week (conference).** Month caps at 3/day with non-interactive "+N more". Week stacks all 50 in a 300px cell with no scroll = visual breakdown. Day fits ~10 before scroll feels long. Agenda is the only viable view; should be the default during conference weeks.
- **Recurring events.** Hub `meetings` is row-per-occurrence — no recurrence concept. iCal RRULE expansion happens server-side in the parser (`ics-parser.ts:455-513`). For an iCal-recurring event, every occurrence in the polling window arrives as a separate `user_calendar_events` row. Once C-01 wires those in, the calendar will correctly show all occurrences.
- **All-day vs timed events.** iCal parser sets `isAllDay` boolean. CalendarEvent shape drops it. All-day appears identical to a 3pm meeting. C-24.
- **Multi-day events.** iCal parser preserves `endAt`. CalendarEvent shape drops it. A 3-day conference renders only on its start day. C-23.
- **Cancelled events.** iCal parser drops `STATUS=CANCELLED` master events and skips RRULE instances overridden as cancelled. Hub `meetings` has no equivalent — a cancelled biweekly stays on the calendar with no signal. C-20.
- **Declined events.** Parser filters `PARTSTAT=DECLINED` per `ownerEmail`. Good — but assumes the polling endpoint passes `ownerEmail`. Need to verify in `calendar-feeds.ts` that this is wired.
- **Timezone correctness.** Parser resolves TZID via `Intl.DateTimeFormat` correctly (`ics-parser.ts:351-384`). Outlook's non-IANA TZIDs ("Eastern Standard Time") fall back to UTC — a known parser limitation, comment at line 379-383 acknowledges. For a US lab on America/Chicago this matters less since Google + Apple emit IANA names; Outlook users will see ±5h drift.
- **DST transition.** `composeIso` resolves offset per-instant via `Intl.DateTimeFormat`, so a meeting on March 9 vs March 10 (US DST jump) computes correctly. Cache key (line 352) is hour-granularity — fine for offset stability.
- **Date string `< today` comparison (line 511).** Works because both are ISO `YYYY-MM-DD`. But `e.date` for an iCal event is currently undefined (would be ISO-8601 timestamp). Once C-01 lands, this comparison breaks. Need to normalize.
- **Daily render under React Query staleTime 5min.** Page changes month → triggers `start`/`end` recalculation → new query key → fresh fetch. Good. But the `events` array is filtered by `isProductionVisible` on every parent re-render (line 58-61) — wrapped in `useMemo` so OK.
- **Production filter.** `isProductionVisible(e.title)` (line 59) filters out `_TEST_DELETE_*` and `test_delete_*` rows. Correct, applies before view-rendering.
- **iCal export sanitizes `,;\\` from title (line 115)** — correct per RFC 5545 §3.3.11. But doesn't escape line breaks (`\n` → `\\n`). For multi-line task titles the output is invalid ICS.

## 8. Open questions for PI

1. **Should CalendarPage merge the user's iCal feed?** Phase 39 spec said "Today timeline merges these with team meetings" — does that imply CalendarPage should too? Or is iCal intentionally Today-only and CalendarPage stays "team-only Hub data"?
2. **Does the lab actually want a time-aware calendar, or is "date-of" enough for research ops?** Faculty already live in Google/Outlook for time. Hub Calendar could deliberately be the "deadline + milestone" surface and stay date-only. C-03 is a 1-2 day rebuild; cheaper to keep as-is if the answer is "Google handles the schedule, Hub handles the deadlines".
3. **Default view = Month or Agenda?** I'd argue Agenda for the operating-day mental model (consistent with TodayPage). But Month is the convention.
4. **Should completed tasks render on Calendar (in past)?** Currently filtered out (`completed = 0` in SQL line 13). For "what did I ship last week" review, you'd want them visible with strikethrough.
5. **Cancelled meetings (C-20) — soft-delete or hide?** Per Rule 22 project delete cascades; meetings have no `cancelled_at` column. Worth adding for parity with iCal `STATUS=CANCELLED`.
6. **iCal multi-day events (C-23) — render as a bar across days, or as N copies?** Bar is the standard; copies are simpler.
7. **Should "+ New" on Calendar create a meeting, a task, or open a chooser (C-07)?** TodayPage's compose-anywhere pattern suggests chooser; Calendar's primary purpose is meetings, suggests meeting-only.
8. **Per Rule 64, polling is 15-min stale on Today page load. CalendarPage doesn't trigger polling at all.** Should viewing Calendar also count as a poll trigger? Otherwise a user who lands on `/portal/calendar` directly (bookmark) sees stale iCal events for up to 15 min until they visit `/portal/dashboard`.

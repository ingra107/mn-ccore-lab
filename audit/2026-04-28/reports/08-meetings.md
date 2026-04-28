# MN-CCORE Lab Hub — Meetings Surface Audit

**Date**: 2026-04-28
**Agent ID**: `a60bf713f7436c529`
**Files reviewed**: `src/pages/Meetings.tsx`, `src/pages/MeetingDetail.tsx`, `src/pages/MeetingPrep.tsx`, `src/pages/portal/MeetingNotesPage.tsx`, `src/lib/parseQuickAddInput.ts`, related API routes

## 1. Executive read

- **The Meetings list is fundamentally sound but the detail page is the lab's single most-important surface and it's the most underbuilt of the four.** `MeetingDetail.tsx:1-1380` packs in agenda, action items, decisions, files, notes, attendance, presence, drag-reorder, NLP quick-add, and batch select — but compose surfaces are decorative (the @ button just appends a literal '@' to the input via `appendCharToInput` at L1145; the emoji button appends ':' at L1154). No SmartCompose, no Hermes wiring, no real @mention picker. For a research-ops surface this is a Tier-1 gap.
- **The Transcript pipeline is a Potemkin feature.** `MeetingNotesPage.tsx:227` POSTs to `/api/meetings/process-transcript` which **does not exist** in `api/routes/meetings.ts` — every "Process with AI" click falls into the silent regex-fallback at L240-247 ("filter lines containing 'action'"). Nick has been live-with-team for 7 days and this is one of the four sidebar entry-points to meetings. Ship it or kill it.
- **Hermes is missing from the meeting surface entirely**, even though Rule 29 says "Brand primitives — use them, don't reinvent" and the Hermes section of CLAUDE.md says team @mentions `@hermes` in task comments and project comments trigger the AI listener. Meeting notes + agenda items + decisions are the highest-value Hermes surfaces (auto-summarize transcript, draft action items, surface stale decisions) and not one of those flows is wired. The `Generate Agenda` button (`MeetingDetail.tsx:283-313`) ships data through a non-Hermes pipeline (`/api/meetings/:id/generate-agenda`) and just copies markdown to clipboard — it doesn't post to the meeting, doesn't @mention Hermes, doesn't write back.

## 2. Page-by-page walkthrough

### Meetings list — `/portal/meetings` (`Meetings.tsx`)

**Architecture:** Split-panel per Rule 17 dashboard-page taxonomy. Left rail 240px fixed, right pane meeting detail + global pending-actions queue. Mobile collapses to single-column with `mobileShowDetail` flag (L410, L1003-1015) and a back button.

**What works:**
- `meeting_id`-attached pending action items render below the selected meeting's detail (L842-878), giving a single screen "what's open across all meetings" view that's stronger than most lab tools.
- The carry-forward dedup at L455-471 is sophisticated — normalizes the `[Carried forward]` prefix per Critical Rule 8, computes a `carryCount` for the badge, and keeps only the most-recent occurrence per (assignee, normalized title). The `carried-count-badge` × N visual on L862 is exactly the "N times this got punted" signal a PI needs.
- Cadence callout (`L688-720`) correctly leads with a single-line top reason and tucks supporting reasons inside a `<details>` element so a 5-stat callout doesn't overwhelm. Good progressive disclosure.
- Search (L745-749) hits title + notes + agenda + decisions + action item descriptions joined.
- Subtitle shows action-item completion rate per Phase 26b spec (L577-582): `"{N}% complete · {M} pending"`.

**What's broken / soft:**
- **Title and date are NOT editable** in the right-pane `MeetingDetail` sub-component (`Meetings.tsx:171-176`). They render as read-only `<h2>` + `<p>`. Inline editability is Rule 3 of the design ethos and Rule 17's data-page contract — Meetings is dashboard-taxonomy so this is borderline, but title misspellings happen and there's no surface to fix them on the list page.
- **`handleAddMeeting` at L528-540 issues a raw `fetch` and does `window.location.reload()`.** No optimistic mutation, no cache invalidation, no toast, no error handling, no auth header. That means every new meeting flashes a full page reload — undermining Rule 8 (optimistic + 5s undo). Replace with `useCreateMeeting` mutation.
- **Selection state is local-only.** `selectedMeetingId` is `useState` (L408), not URL-synced. Hit refresh and you lose context. With `?m={id}` in the URL the link is shareable (Slack DMs, email).
- **`toggleWithUndo` posts the toggle then calls the same `toggleMutation.mutate(id)` on undo** (L420-422). That's a roundtrip flip-back, not a true optimistic undo — if the network fails, the user sees the wrong state. Fine for now but document it.
- **Filter pills "All / Decisions / Actions" have no way to filter to "my meetings."** A user with 3 meetings/week can't quickly see "what was decided in things I attended" — needs an `attendees CONTAINS me` chip.
- **List skeleton (L756-773) is hand-rolled** rather than reusing `LoadingSkeleton`. Fine, but the skeleton doesn't respect the 240px column constraint and at narrow widths it overflows slightly.
- **Empty state (L807-813) is a single muted line.** No CTA, no `EmptyState` component (Rule 29 "use EmptyStateArt for empty-state slots"). Someone landing here for the first time sees "No meetings found." with no nudge to record one.

### MeetingDetail — `/portal/meetings/:id` (`MeetingDetail.tsx`)

**Architecture:** Long-form scrollable single-column layout (`content-container`). Top: status pill + Watch + Presence + Prep View link + Copy Summary + Generate Agenda. Then h1 + facilitator + attendance + projects-discussed chips. Then 2-col agenda+action items (action items first on mobile per L471-473 `order-1 lg:order-2`). Then decisions, files, notes.

**What works:**
- **Rules-of-Hooks compliance is correct** — useState/useMemo all declared at L92-148 BEFORE the early returns at L227 (loading) and L236 (not-found). Per the explicit comment at L98 + L123 the bug Phase 31.5 introduced has been fixed.
- **Action item Cartesian dedup** (L127-140) by normalized title + assignee + due, newest `updated_at` wins. Mirrors MyItems.tsx:678 per the comment. This is the right place for it — joins from `meetings + action_items` produce duplicates and dedup belongs at the consumer.
- **j/k/n/x/Enter keyboard nav on action items** (L171-199) with refs-not-state for the listener so it doesn't rebuild on every focus move (the explicit comment at L165-166 documents this). Solid.
- **Drag-to-reorder** via `@dnd-kit` for both agenda items (L507-514) and pending action items (L587-593). Action item handle is hidden until row hover (`opacity: 0 group-hover/action:opacity-100` L891) to avoid visual clutter — good. Pointer + Touch sensors both wired (L213-216) with a 250ms touch-delay so scroll isn't hijacked.
- **Multi-select + batch complete** (L201-211) appears when ≥2 selected. Single Undo Toast for the batch instead of N individual ones. Good.
- **Presence + intent broadcast** (L107-110): viewerSlugs from `usePresence('meeting', id)`, plus `meetingSelfIntent` flips between `'viewing'` and `'commenting'` based on `meetingHasCompose`. PresenceAvatars wired at L332. Per Rule 49 entity-scoped + WS-room-global.
- **Notes editor** (L750-797) has `Ctrl+Enter` save + `Escape` cancel + autoFocus + edit-on-empty-click (L805-808). Hover-only Edit button revealed via `group:hover` (L810-816).
- **Attendance toggle** (`AttendanceSection` L1307-1379) is inline-editable with the `+ Edit` toggle (L1338-1343). Single attendee tap toggles via `fetch /api/meetings/:id` POST (L1320-1325).

**What's broken / soft:**
- **The compose toolbar buttons are decorative** (`AddActionItemForm` L1133-1167). The @ button appends a literal '@' character (L1145 `appendCh('@')`). The emoji button appends a ':' character (L1154 `appendCh(':')`). There is no SmartCompose, no MentionInput, no emoji picker. Compare to ProjectDetail / TaskDetailPanel where Phase 38 closure (`cf285b6`) wired SmartCompose with real mention via MentionInput, real emoji picker, real attach via R2. Meeting compose is one revision behind.
- **No SmartCompose for the notes textarea** (L752-779). Plain `<textarea>` with no markdown preview, no @mention, no Hermes hook. For a "decisions happen here" surface this is a Tier-1 miss.
- **Hermes is not wired anywhere on this page.** No `@hermes` detection, no auto-summarize button next to the notes, no "Hermes synthesize action items" pass over the transcript text. Generate Agenda (L283-313) calls `/api/meetings/:id/generate-agenda` which is a non-Hermes deterministic endpoint. The output goes to the clipboard — it does NOT post the agenda back to the meeting as `agenda_items` rows. That is a 70%-built feature.
- **"Copy Summary" button (L387-403)** silently swallows errors via the surrounding `.then()` chain — there's no `.catch`. If clipboard access is denied (Safari sometimes refuses outside a user-gesture chain) the user sees nothing.
- **"Projects discussed" chips (L441-468)** derive project slugs from `actionItems.filter(a => a.project_id)` — no manual override, no way to add a project that was discussed but didn't generate an action item. Slug-to-title rendering at L463 is a naive `slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())` — won't show actual project titles, will show `"Pf V Sf Oxygenation Severity"` instead of the canonical title. Should use `getProject(slug).title` from the projects index.
- **`handleAgendaDragEnd` (L257-271) fire-and-forgets** the `/api/meetings/:id/agenda/reorder` POST with no error handling. If the reorder fails the local state is already shuffled but the server state isn't.
- **Decision form (L641-708) is not the same code as the Meetings.tsx Decision form (`Meetings.tsx:128-144`)** — duplicate logic with subtle drift. Both call `useCreateDecision` with `meeting_id`, but the inline-form button uses `var(--gold)` fill with `#0f1923` text (L695) while `Meetings.tsx:373` uses the canonical `--stage-fill-analysis` + white per Rule 41/r7-2026-04-22 fix. Detail page is a contrast regression — `--gold` light on dark text fails ~2.46:1 in dark mode per the comment at Meetings.tsx:369-371 and the same hazard exists here.
- **Files section (L727-739)** uses generic `FileUpload entityType="meeting"` — no per-file association with action items, no way to say "this PDF supports Decision #2." For a research lab where every meeting produces 3-5 figures or analysis dumps, this matters.
- **The status pill at L324-327** uses `STATUS_COLORS[meeting.status]` with a hardcoded `'rgba(34,197,94,0.12)'` fallback for completed (L80) — bypasses the design tokens. `'in-progress'` and `'completed'` aren't part of any documented meeting status taxonomy in the meetings table; status comes from API and there's no validation guard.
- **No "live indicator" for today's meeting.** The right-rail in `Meetings.tsx` shows a "Next meeting" pill but the detail page doesn't surface "this meeting is happening right now (3:00pm CT today)" — would let `usePresence` peers join in real time.
- **No deletion / cancellation path.** No way to cancel a scheduled meeting, no way to mark cancelled. Per Phase 39's iCal handling that filters STATUS=CANCELLED for personal cal events, the parallel for Hub meetings doesn't exist.

### MeetingPrep — `/portal/meeting-prep/:id` (`MeetingPrep.tsx`)

**Architecture:** 3-column read-only "facilitator prep sheet". Left = previous meeting's pending + completed actions. Center = suggested agenda (overdue first, then team-added, then carry-forwards). Right = upcoming deadlines (14d) + recent activity (14d). Print button + countdown badge top.

**What works:**
- **`/api/meetings/:id/prep`** server-side aggregates everything: previous meeting, prev actions, recent activity, upcoming deadlines, overdue, agenda items. Single round-trip. Good architecture.
- **The 4-stat top row** (Overdue / Pending from last / Deadlines 14d / Recent activity, L142-145) — value flips to color when > 0, neutral slate when 0. Perfect at-a-glance facilitator orientation.
- **Print button** (L100-108) calls `window.print()`. Per Phase 26b shipped notes. And there's a `print` CSS hook that should already be in `index.css` from Phase 26.
- **Countdown badge** (L111-131) — `days > 0 ? "Nd Nh until meeting"` etc. Color flips teal on day-of, gold otherwise.
- **Suggested agenda assembly** is opinionated: overdue tasks → team-added → carry-forwards. That's the right ordering for a 60-min biweekly.

**What's broken / soft:**
- **MeetingPrep is read-only.** From this page the facilitator cannot: check off a previous action item as already-done, add a new agenda item, or annotate. They have to bounce to MeetingDetail and lose their place. For a "prep" surface the read-only choice ships against intent — a facilitator sweeping the page Monday morning wants to triage.
- **No "Generate prep from history" Hermes button.** Hermes is the natural fit for "summarize what's happened since last meeting in 1 paragraph" — exactly the prep step Nick does manually. The `mnccore-agenda` PB skill runs Mondays but its output goes to email, not into the Hub prep page.
- **Recent activity tile actor parsing** at L281: `act.actor?.split('@')[0] || ''`. That's the deprecated email-prefix-as-slug derive that Rule 34 explicitly bans (`emailToSlug` is the canonical). For `nicholas.ingraham@gmail.com` this would render as `nicholas.ingraham` literally — `getPersonInfo` returns `{name: 'nicholas.ingraham'}`. Visible on prod for any non-LUT actor.
- **No "carry these forward" button.** The carry-forward section at L223-241 lists them but doesn't let the facilitator one-click them into the upcoming meeting. The action of carrying forward should be an explicit click — currently it requires the facilitator to manually re-add each one.
- **Upcoming deadlines + recent activity slice limits** (8 + 10) are silent — no "show all" expand. With a 19-person lab those caps will hit often.
- **No facilitator handoff link.** If Nick is sick the page can't be re-pointed to Nate; facilitator comes from `getMeetingFacilitator(date)` which is a deterministic rotation. No override.

### MeetingNotes — `/portal/meeting-notes` (`MeetingNotesPage.tsx`)

**Architecture:** Page header + 4 stat cards (Processed / With Notes / Pending / Total) + collapsible "How transcripts work" 4-step explainer + search + recent meetings list (20 cap) → click → MeetingDetail. Plus the Transcript modal.

**What works:**
- **HowTo panel auto-collapses after 3+ transcripts exist** (L51 `collapsedByDefault={processedCount >= 3}`). Smart progressive disclosure — explainer for first-time users, hidden once you've used the feature.
- **localStorage persistence on the HowTo expanded state** (`HOWTO_STORAGE_KEY`, L19-33). Respects user choice across sessions.
- **Modal has focus trap + Escape** (L206-219). Per Phase 23 a11y discipline.

**What's broken / soft:**
- **`/api/meetings/process-transcript` does not exist.** Confirmed via grep across `api/routes/`. The POST at L227-234 will 404 in production, fall into the catch at L248, and render the static fallback summary. The regex fallback at L240-247 is "lines containing 'action' or 'todo' or 'follow up'" → garbage output. This is the page Nick advertises in the Sidebar — it is a non-functional feature.
- **Audio upload mode** (L289-302, L336-352) shows a yellow disclaimer pill: "Audio upload requires AI API key — use 'Paste Transcript' for now". The button still toggles to that mode and accepts file drops with no upload handler. Should be either fully shipped or hidden.
- **`InlineSelect` for "Link to Meeting"** (L309-318) — option labels include the date in parens `${m.title} (${formatMediumDate(m.date)})`. With 50+ meetings the dropdown becomes unscannable. Needs a typeahead pattern (Pattern 4 — Airtable-style).
- **20-meeting cap** at L148 is hardcoded. No "show more" or pagination.
- **Page metadata**: 4 stat cards but `Processed Meetings` and `With Notes` show the *same* number (both `processedCount`, L120-121). Visual duplication.
- **No actual full-text search.** The search at L82-89 hits `m.title + m.notes + m.date` — but `notes` only loads from `useMeetingsApi` which probably returns the meeting list shape, not the full notes blob. Confirm via the data hook. If notes is omitted from list payload, "search transcripts" silently misses matches and the page name lies to you.
- **Subtitle says "Transcription, summaries, and action items"** but the only feature actually shipping is "Click into a meeting to see notes" — and that's the same flow as the Meetings page.

## 3. Findings table

| ID | Severity | Page | Surface | Issue | Fix | Effort |
|---|---|---|---|---|---|---|
| MTG-01 | P0 | MeetingNotes | Transcript modal | `/api/meetings/process-transcript` endpoint doesn't exist; modal silently 404s into a regex fallback | Either build the endpoint (Hermes-driven via `claude-ai` listener) or kill the modal and replace with a "Paste notes" pass-through that posts to `meeting.notes` | M (build) / S (kill) |
| MTG-02 | P0 | MeetingDetail | Compose toolbar | `@` button literally appends '@' char, `:` button literally appends ':' char — no real mention picker, no real emoji picker | Replace `AddActionItemForm` compose with `SmartCompose` (already shipped Phase 38) | M |
| MTG-03 | P0 | MeetingDetail | Notes editor | Plain `<textarea>` with no @mention, no Hermes hook, no markdown preview | Swap textarea for SmartCompose / RichTextEditor + wire `@hermes` regex into the save mutation per CLAUDE.md Hermes section | M |
| MTG-04 | P1 | MeetingDetail | Generate Agenda | Output goes to clipboard only — doesn't post agenda items back to meeting | After generation, optionally bulk-create `agenda_items` rows via existing `useAddAgendaItem` mutation | S |
| MTG-05 | P1 | MeetingPrep | Recent activity | `act.actor?.split('@')[0]` — banned by Rule 34, breaks for non-LUT emails | Replace with `emailToSlug(act.actor)` from `src/lib/emailSlug.ts` | XS |
| MTG-06 | P1 | Meetings list | Add Meeting | Raw `fetch` + `window.location.reload()` — full page reload, no optimistic UI | Use `useCreateMeeting` mutation + cache invalidation + toast | S |
| MTG-07 | P1 | MeetingDetail | Decisions inline button | Uses `var(--gold)` bg with `#0f1923` text — fails contrast (~2.46:1 dark) per Rule 41 | Swap to `var(--stage-fill-analysis)` + `#fff` text matching Meetings.tsx:373 | XS |
| MTG-08 | P1 | MeetingDetail | Projects discussed | Slug-to-title is naive `replace(/-/g, ' ').toUpperCase()`, mangles "PF V SF" titles | Use `getProject(slug).title` from project index | XS |
| MTG-09 | P1 | MeetingNotes | Search | Searches `m.notes` but list payload likely omits notes blob — silent miss | Confirm payload + either include notes in list OR add server-side `?q=` search across notes | S |
| MTG-10 | P2 | Meetings list | Selection | `selectedMeetingId` is local state, not URL-synced, links not shareable | Sync to `?m={id}` via `useSearchParams` | XS |
| MTG-11 | P2 | MeetingDetail | Title/date | Read-only — no inline edit | Add inline-edit for title via existing inline-edit pattern (rule 18 cache-subscribe) | S |
| MTG-12 | P2 | MeetingDetail | Status pill | Hardcoded RGBA fallback at L80, no status taxonomy validation | Define `MEETING_STATUS_VALUES` set, add to API guard, use `--stage-fill-*` tokens | S |
| MTG-13 | P2 | MeetingPrep | Carry forward | Lists pending items but no "carry these to next meeting" button | Add bulk `carry-forward` action that creates new action_items with `[Carried forward]` prefix on next meeting_id | S |
| MTG-14 | P2 | MeetingPrep | Read-only | Facilitator can't toggle previous actions / add agenda from prep — has to bounce | Make rows interactive (toggle, add) using same mutations as MeetingDetail | M |
| MTG-15 | P2 | MeetingDetail | Live indicator | No "happening now" badge for today's 3pm CT meeting | When `meeting.date == today && currentTime ∈ [3pm-4pm CT]`, show coral pulse badge (Rule 59 — overdue/system color) | XS |
| MTG-16 | P2 | MeetingNotes | Stat duplication | "Processed Meetings" and "With Notes" both render `processedCount` | Differentiate (Processed = transcript-uploaded, WithNotes = notes != null) or merge | XS |
| MTG-17 | P2 | MeetingDetail | Cancellation | No way to cancel a meeting, no STATUS=CANCELLED handling | Add `cancelled_at` column + cancel button + filter on list | M |
| MTG-18 | P2 | Meetings list | "My meetings" filter | No way to filter to meetings I attended | Add 4th filter pill: All / Decisions / Actions / Mine (uses current user slug) | XS |
| MTG-19 | P2 | MeetingDetail | Agenda reorder | Fire-and-forget POST, no error handling | Wrap reorder in mutation with rollback-on-error | S |
| MTG-20 | P3 | MeetingDetail | Decision form | Duplicate code with Meetings.tsx — drift hazard | Extract `<LogDecisionForm meetingId={...} />` shared component | S |
| MTG-21 | P3 | MeetingNotes | Audio upload mode | Toggles to mode that doesn't work, shows yellow disclaimer | Hide tab until pipeline ships, or implement | S |
| MTG-22 | P3 | MeetingPrep | Activity slice | 8 + 10 silent caps with no "show more" | Add expand toggle | XS |
| MTG-23 | P3 | All | Hermes | No Hermes presence on any meeting surface (per CLAUDE.md Hermes section) | Wire `@hermes` regex on notes save + on action item create + add explicit "Ask Hermes to summarize" button on MeetingDetail | M |
| MTG-24 | P3 | MeetingDetail | Files | Generic FileUpload — no per-action-item or per-decision file association | Allow `parent_id` linkage to action_item_id or decision_id within file_attachments | M |
| MTG-25 | P3 | Meetings list | Empty state | Single muted line, no CTA, no `EmptyState` component | Use `EmptyStateArt` per Rule 29 + "Record your first meeting" CTA | XS |
| MTG-26 | P3 | MeetingDetail | Watch button | Wired but no notification preview shown | Tooltip explaining what watching subscribes to | XS |
| MTG-27 | P3 | MeetingDetail | Copy Summary | Swallows clipboard errors silently | `.catch()` with toast feedback | XS |
| MTG-28 | P3 | MeetingDetail | Drag handle | Visible only on hover via `group-hover/action:opacity-100` — not keyboard discoverable | `:focus-visible` selector to reveal handle on Tab | XS |
| MTG-29 | P4 | MeetingNotes | "20 results" cap | Hard limit, no pagination | Cursor pagination | M |
| MTG-30 | P4 | MeetingDetail | iCal merge | Phase 39 iCal events render in Today timeline but not in Meetings list | Decide: merge personal cal events into list, or keep separate forever | M |

## 4. Top 5 high-leverage enhancements

1. **Wire Hermes into MeetingDetail.** The 3 highest-value Hermes hooks are: (a) "Summarize this meeting" button next to Notes that posts a summary back into the notes field; (b) `@hermes` detection in notes save → spawns a task in `ai-requests` queue; (c) "Generate agenda from prep" button on MeetingPrep that creates `agenda_items` rows instead of clipboard markdown. Effort: 1-2 sessions. Impact: turns the meeting page into the lab's institutional memory in a way no other lab tool has.
2. **Replace `AddActionItemForm` with SmartCompose.** The Phase 38 closure (`cf285b6`) already shipped a SmartCompose component for ProjectDetail / TaskDetailPanel / MeetingDetail comments — Meetings is the one detail surface that didn't get it. This pulls real `@mention` (MentionInput), real emoji, real R2 attach behind one component. Closes MTG-02 and MTG-03 in one PR.
3. **Build `/api/meetings/process-transcript`.** Either (a) Hermes endpoint that fans transcript text → ai-requests row → home laptop processes → returns summary+actions+decisions to Hub; or (b) deterministic regex+LLM pipeline. Without this MeetingNotes is a sidebar entry-point to a broken modal. Cleanest fix: make it a wrapper around the Hermes /api/ai-requests pipeline with an `intent='summarize-meeting'` field.
4. **Make MeetingPrep interactive.** A facilitator should one-click carry-forwards into the upcoming meeting and toggle previous actions inline. Currently they have to ping-pong to MeetingDetail. The 3-col layout already loads everything via `/prep` — wire toggle + carry-forward mutations and the prep sheet becomes the canonical Monday-morning surface for facilitators.
5. **Live "happening now" indicator + auto-promote.** When today is 3pm CT Tuesday and the user opens `/portal/meetings`, automatically select the active meeting + show a coral pulse badge + show TypingIndicator + bump presence visibility. This would make the surface feel alive during the actual meeting and is a 30-line change in `effectiveSelectedId` derivation + a `useNow()` hook.

## 5. Meeting workflow gaps

The full meeting lifecycle is **{prep → meet → decide → assign → follow-up}** and the Hub covers ~60% of it:

- **Pre-meeting (Mon morning):** ✅ MeetingPrep page covers it but is read-only. ❌ No Hermes-generated 1-paragraph "since last week" summary. ❌ The PB-side `mnccore-agenda` skill outputs to email, not Hub agenda_items — that's a missing handoff.
- **During meeting (Tue 3pm):** ✅ Notes textarea exists. ❌ No SmartCompose. ❌ No live presence cue ("3 people viewing now"). ❌ No auto-select of today's meeting. ❌ No transcript ingestion (Otter / Zoom / Google Meet → Hub). ❌ No "decision made" hotkey that pops the inline decision form.
- **Decision capture:** ✅ Inline decision form exists but renders twice (Meetings.tsx + MeetingDetail.tsx). ❌ Decisions don't link to a project automatically — facilitator must manually thread.
- **Action item assignment:** ✅ NLP quick-add works (`parseQuickAddInput`). ❌ Inline @ chip is decorative only. ❌ No bulk "from this transcript, here are 5 action items — Hermes proposes them, facilitator approves with checkboxes".
- **Post-meeting follow-up:** ✅ Action items show on assignee's MyTasks + Today. ✅ Carry-forward dedup works. ❌ No "minutes" emit (markdown / PDF / Slack post / Resend digest). ❌ No way to close out the meeting officially — it stays "in_progress" forever.
- **Search across history:** ✅ `/portal/search` covers 14 entity types per Rule 51. ❌ MeetingNotes search is title-only (or possibly notes-only — unclear from list payload).

The biggest gap is **transcript ingestion + Hermes summarization**. Lab teams record meetings via Otter / Zoom / Google Meet — the lift to "Hub becomes the canonical post-meeting record" is auto-import + auto-summarize. Without it the Hub is a manual bulletin board, not an operating surface.

## 6. Brand & design-system observations

**Token discipline is mostly good but slipping in places:**
- `Meetings.tsx:373` correctly uses `var(--stage-fill-analysis)` + `#fff` per Rule 41 fix r7-2026-04-22 with the documenting comment. Good.
- `MeetingDetail.tsx:695` uses raw `var(--gold)` + `#0f1923` for the same Save button. Inconsistent — same context, different token. Drift between the two files.
- `MeetingDetail.tsx:80` defines a hardcoded `'rgba(34, 197, 94, 0.12)'` for completed status — should be `var(--green-hover)`. Not catastrophic but bypasses the theme.
- `MeetingDetail.tsx:160-166` "month/day chip" uses `var(--gold-light)` bg + `var(--gold)` text. With `--ink-bright`-aware background this is fine, but the day digit at L166 is `var(--ink)` (theme-flipping) on a gold panel — light mode `--ink` is dark and stands out, dark mode `--ink` is light and blends with the warm gold. Audit-worthy.
- **No HermesMark anywhere.** Per Rule 29, AI-assistant surfaces should use HermesMark. There's a `Sparkles` icon for "Generate Agenda" (L400) instead. That's a brand miss — a generic lucide sparkle.
- **No CategoryIcon for meeting types.** `meeting.type` ("biweekly" / etc.) is rendered as plain text at L329. With the lab's CLIF/Lab/Mentee/Nate categorization Rule 29 says use lungs/flask/heartbeat/cap.
- **Carry-forward badge** styles defined inline at Meetings.tsx:996-1001 — should be in `index.css` so it's reusable. Currently lives in a `<style>` block scoped to Meetings.tsx — duplicated in MeetingDetail.tsx via `parseCarriedForward` consumption but the badge style isn't shared.
- **`mtg-section-label`** class defined at Meetings.tsx:991-995 is page-scoped. Used 5+ times in this one file but the design pattern (uppercase 10px 0.06em letter-spacing) is the same one used as `ColumnHeader` typography elsewhere. Should be a shared utility class.

## 7. Edge cases / failure modes

- **0 meetings (fresh tenant):** List shows "No meetings found" with no CTA. PageHeader count = 0. Pending actions box renders empty. Cadence callout suppressed (L688 `recommendation !== 'no_upcoming'`). Acceptable but bleak.
- **50+ meetings:** No pagination on list — uses `filteredMeetings` array directly. With 100+ meetings list scroll becomes long. Skeleton shows 10 placeholders only.
- **Today's 3pm meeting in progress:** No live indicator. `isNextMeeting()` (L568-574) returns true but only for the listing left-rail border-left + "Next meeting" label; the detail page shows no live state.
- **Past meeting reopened:** Opening an old meeting allows editing notes, attendees, agenda — no protection. Consider read-only past meetings unless explicit "Reopen" toggle.
- **Cancelled meeting:** No path. Phase 39 iCal STATUS=CANCELLED filter applies only to user calendar feeds, not Hub meetings.
- **Recurring biweekly:** Each Tue 3pm is a separate `meetings` row with random-suffix ID per Rule "Meeting ID collision". `R10-5 normalizeMeetingTitle()` collapses whitespace before dedup compare — correct. But there's no "series view" — you can't see "all biweeklies in 2026" as one strand.
- **Long agenda (50+ items):** No virtualizer. SortableContext rebuilds on every drag.
- **No transcript:** `meeting.notes` is null. MeetingDetail renders "No notes yet. Click to add." Acceptable. MeetingNotesPage stat shows it as "Pending."
- **NLP edge case: `@nick` resolves but `@nicholas` doesn't:** `parseQuickAdd.ts:50-54` indexes by slug + first-name + last-name. `nicholas` → `nicholas` matches by full first-name. But `@nicholas-ingraham` won't — slug not in index, and parser likely tokenizes by whitespace so the hyphen-joined slug is one token. Worth a unit test.
- **NLP edge case: priority `p4`:** Parser only knows p1/p2/p3. `p4` becomes plain text in title. Fine but undocumented.
- **NLP edge case: `tomorrow` at 11:59pm:** `parseQuickAddInput` likely uses `new Date()` — no tz handling. A user typing at 11pm CT for a "tomorrow" task may get +1 day off depending on UTC rollover. Need a unit test and explicit America/Chicago anchor.
- **Drag while keyboard nav active:** No conflict observed but the `isFocused` outline + drag overlay could visually clash.
- **Mobile portrait, list scroll → tap detail → back:** `mobileShowDetail` flips false but list scroll position is preserved. Good. But the right-pane scroll position is reset on detail change (L836 `key={selectedMeeting.id}`). May or may not be desired.
- **Dual-author race on agenda reorder:** Two facilitators dragging at once — last write wins on the server but client state can diverge. PartySocket realtime invalidation will eventually reconcile but there's a visible flicker.

## 8. Open questions for PI

1. **Transcript pipeline ownership:** Should `process-transcript` be a Hermes route (via ai-requests queue, home laptop processes async ~30s) or a synchronous Workers AI / Anthropic call from Cloudflare? The async path matches the rest of Hermes; the sync path is faster but burns Workers CPU.
2. **Cancelled meetings:** Add a `cancelled_at` column + filter, or rely on convention (rename title "[Cancelled]")? Phase 39 iCal already has the precedent.
3. **MeetingPrep interactivity:** Should the prep page be a true "control surface" (toggle-actions, add-agenda from here) or stay a printable read-only briefing? Current spec leans read-only; lab usage suggests control would be more useful.
4. **Carry-forward UX:** Manual button-click per item, or auto-carry on each new meeting until completed/dismissed? Auto-carry is what the dedup logic implies but currently no creation path enforces it.
5. **iCal merge:** Phase 39 brings personal calendar events into Today timeline. Should those merge into Meetings list view too? Or stay separate (Hub meetings = team commitments, iCal = personal cal)?
6. **Audio upload:** Ship the audio→transcript pipeline (Workers AI Whisper, ~$0.06/hour) or kill the audio tab? Current state (yellow disclaimer pill) is the worst-of-both.
7. **Hermes default behavior on @mention in notes:** Auto-summarize whole meeting? Reply only to the @-anchored question? Decision shapes the API contract.
8. **"Meeting ended" lifecycle:** Should there be an explicit "End meeting" button that emits a digest (action items + decisions to Slack / Resend) and locks the meeting from further edits? Currently meetings are eternally open.
9. **Series view for biweekly:** Worth building a "all 2026 MNCCOREs" view that shows decision/action density over time? Each biweekly is currently siloed.
10. **`notes` field in list payload:** Confirm whether `useMeetingsApi` returns full notes blob or omits it. If omitted, MeetingNotes search is silently broken — needs server-side search endpoint.

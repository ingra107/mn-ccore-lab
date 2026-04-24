# Round 6 triage — Nick's decisions on DD-1 through DD-7 + T-29

**Date:** 2026-04-23 (night)
**Source docs:**
- `docs/design-briefs/DESIGN-DIRECTION.md` (CD's proposals)
- `docs/specs/t-29-manuscripts-attention.md` (CD's T-29 spec)
- Chat: implementation agent's pushback + Nick's response

---

## Per-item decisions

### DD-3 — Status-line chip row
**Status:** **SHIPPED** (commits `6d2a2710` + `e4f09c05`, deploy `8bfd5b09`).
Option C (chip row) live. CD's 2 tweaks applied: `● Live` stays as bare leading dot (not a chip); zero-count chips render muted (`--surface-2` bg, `--slate` text, 0.55 opacity, non-interactive `span`) so row width stays stable. Empty "All clear" teal chip prepends when all four are zero.

### DD-6 — Display-number typography on hero stat cards
**Status:** **QUEUE for round 6 (first after DD-3).** No pushback. 0.5 sprint.
CD's order was DD-5 first; swap to DD-6 first per agent recommendation — PI-dashboard brand moment > banner cleanup for same effort. Screenshot-to-chair impact.

### DD-5 — Kill Welcome banner + version-keyed "This week" ribbon
**Status:** **QUEUE for round 6.** No pushback. 0.5 sprint.
Day-1 users still see a Welcome variant per CD spec; Nick-case (576 completed) stops getting nagged.

### DD-4 — Presence with intent (narrowed)
**Status:** **QUEUE for round 6, narrowed scope.**
**Keep:** intent dots (green viewing / orange editing / blue commenting) on existing presence avatar surfaces.
**Drop:** page-wide "Nick is typing…" broadcast. T-51 inline-by-compose typing indicator (shipped round 5) already handles the collision-prevention case at the actual collision point. Page-level typing for a 19-person lab is ambient noise without proportional value.
**Effort:** 0.5 sprint (down from CD's 1 sprint).

### T-29 — Manuscripts "Needs your attention"
**Status:** **SCHEMA CHECK FIRST, then ship skip-it (~2hr) in round 6, full spec round 7.**
Agent must verify `manuscripts.revision_requested_at` + `manuscripts.reviewer_assigned_slug` fields exist before queuing the 3-subgroup UI. If missing, schema-v50 pre-work. Skip-it version (rename "Action items" → "Needs your attention" + add count badge + sort by urgency score) uses existing fields and ships this week.

### DD-7 — Mobile parity (5 of 6)
**Status:** **QUEUE for round 6, drop haptics.**
Ship 5 of the 6 fixes:
1. Search in top-bar (not More menu)
2. Compose bottom-sheet above keyboard
3. Swipe-left-archive / swipe-right-done on rows (extends T-49 primitive)
4. Pull-to-refresh on every list
5. Long-press → action sheet

**Drop:** Haptics on destructive actions. Web Vibration API is Android-only reliable; iOS Safari PWA doesn't support it. Over-promises native feel the web platform can't deliver.
**Effort:** 2 sprints (shared infra: bottom-sheet primitive, swipe-gesture hook, long-press hook).

### DD-2 — Saved cross-surface views (**aim: replace TODAY.md**)
**Status:** **QUEUE for round 6-7, AMBITION = full TODAY.md replacement.**

Nick's framing (2026-04-23 night): **shoot** for making TODAY.md obsolete — don't treat saved-views as parallel-forever. The goal is replacement. But guard the actual swap behind a proof: saved-views must match or exceed TODAY.md on these vectors before CLI generation shuts off.

**Parity requirements for TODAY.md retirement (all must hold):**

1. **Interactivity** — inline status change, inline due-date edit, inline assignee change, all without leaving the view. No modal dialogs, no navigation round-trips. TODAY.md has this via `/process` — saved-views must match on the web surface.
2. **Friction-free** — keyboard-first (j/k/Enter/x), undo toast on every mutation, optimistic UI. No spinner states. Measured: first-to-complete-task time from open ≤ TODAY.md.
3. **Customizability** — user can shape columns, filter predicates, sort order, grouping, and save as a pinned URL. TODAY.md sections are scripted; saved-views should let Nick author sections as filter recipes.
4. **Agent interaction** — inline comment field per row that dispatches to the agent (equivalent to `@claude` tag in TODAY.md). Click row → comment `@hermes summarize` → agent runs via `hub_ai_listener.py` → response appears inline. Same dispatch semantics as TODAY.md's row comments.
5. **Morning-triage dogfood** — Nick uses saved-views as his morning flow for 4+ weeks without reaching for TODAY.md. If he reaches for TODAY.md even once a day, the parity isn't real.

**Rollout gates:**
- Sprint 1: `/portal/views` route + "Save as view" action + URL serialization. Sidebar pinning. Infinite feed renderer. **TODAY.md still generates daily.**
- Sprint 2: Inline interactivity + agent comment dispatch. **TODAY.md still generates daily.** Nick opts into "dogfood week" — uses saved-views exclusively, logs friction.
- Sprint 3: close the 4-week dogfood window. If parity holds, disable `scripts/generate-today.py` cron. TODAY.md file retired, archived to `Context/archived/TODAY-retired-YYYY-MM-DD.md`.

**Do NOT disable TODAY.md generation before sprint 3 dogfood proves parity.** Follow the substrate-swap rule in CLAUDE.md (twin-file grep, state-transition coverage, 24h dogfood window extended to 4 weeks, handoff sweep before retiring the code path).

**Effort:** 3 sprints (inflated from CD's 2+ sprints to account for full-parity interactivity + agent dispatch + dogfood gate).

### DD-1 — Now/Data split
**Status:** **QUEUE LATE, pilot 1 surface only (MyTasks).**
**Pushback accepted:** pilot MyTasks only for 4 weeks, NOT MyTasks + Projects together. If pilot fails, 2+ sprints of rollout saved.
**Concern to reconcile before sprint:** Now-view hero strips contradict density work shipped in round 5 (TodayHero is already a "Now" view on MyTasks). Either TodayHero becomes the "Now" view (no new component) or the Now view redesigns TodayHero. Don't double-invest.
**Effort:** 1 sprint pilot (down from CD's 2+ sprints), then evaluate before rolling to other 8 surfaces.

---

## Refined adoption order (Nick-approved 2026-04-23)

1. **DD-3 tweaks** — ✓ DONE
2. **DD-6** display-number typography — 0.5 sprint — PI-dashboard brand moment
3. **DD-5** Welcome banner swap — 0.5 sprint — banner lifecycle fix
4. **DD-4** presence intent dots (narrowed) — 0.5 sprint — no page-wide typing
5. **T-29 skip-it** — ~2hr — rename + urgency sort with existing schema
6. **DD-7** mobile parity (5 of 6) — 2 sprints — drop haptics
7. **T-29 full** — schema-v50 + 3-subgroup UI — only if schema check passes
8. **DD-2** saved views (TODAY.md replacement ambition) — 3 sprints — gated dogfood
9. **DD-1** Now/Data pilot (MyTasks only) — 1 sprint — evaluate before rolling

**If capacity-tight:** DD-3 (done) + DD-6 + DD-5 + T-29 skip-it. Ship the 0.5-sprint wins first, earn runway for DD-2 and DD-7.

## Next-session queue (for auto-mode)

The tactical round-5 punch list is done. Next session ticket queue:

- **Batch G:** DD-6 (display-number StatCard variant) + DD-5 (Welcome banner → release ribbon). Two 0.5-sprint tickets, same deploy.
- **Batch H:** T-29 skip-it (rename + count badge + urgency sort). 2 hours.
- **Batch I:** DD-4 narrowed (intent dots on PresenceAvatars). 0.5 sprint. Reuse existing ws channel; 3 new message types (viewing/editing/commenting).
- **Batch J:** DD-7 mobile parity infra — bottom-sheet primitive + swipe-hook generalized + long-press hook. Sprint 1. Individual surface rollout in batch K.

DD-2 + DD-1 + T-29 full are multi-sprint, not auto-mode. Supervised sessions.

## Dependencies / blockers to resolve

- **T-29 schema check** — agent: grep `manuscripts` table schema for `revision_requested_at` / `reviewer_assigned_slug` or equivalent. Report before queuing T-29 full.
- **DD-2 schema** — new `saved_views` table + `saved_view_pins` join. Design doc in round 6 kickoff session.
- **DD-4 WebSocket** — verify `hub-realtime` Durable Object supports 3 new message types (`intent-viewing`, `intent-editing`, `intent-commenting`) without schema change.

---

## Context for round 6 kickoff prompt back to CD

When asking CD for round 6 tickets, include this triage doc + note:

1. DD-3 shipped with their 2 tweaks.
2. DD-6 + DD-5 + DD-4 (narrowed) + T-29 skip-it queued for round 6 auto-mode.
3. DD-2 ambition = TODAY.md replacement, NOT parallel-forever. Need round-6 spec expansion: inline interactivity, agent comment dispatch, parity matrix.
4. DD-7 minus haptics queued. Round-6 spec can skip haptic details.
5. DD-1 scope-reduced to MyTasks pilot. Round-6 spec for MyTasks only; 8-surface rollout is post-pilot.
6. T-29 schema check pending; if field missing, schema piece ships first.

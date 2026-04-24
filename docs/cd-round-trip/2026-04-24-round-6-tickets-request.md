# Prompt — Round 6 tickets request (paste into Claude Design project)

**Status:** Ready to paste after Nick triages round 6 queue.
**Purpose:** Get CD to generate round-6 tactical tickets aligned with
Nick's DD triage (in `docs/cd-round-trip/2026-04-23-round-6-triage.md`).

---

```
Round 6 kickoff. Triage on DD-1..7 and T-29 complete.

## Triage outcomes (full doc at docs/cd-round-trip/2026-04-23-round-6-triage.md)

**DD-3 status-line:** SHIPPED (commits 6d2a2710 + e4f09c05, deploy 8bfd5b09).
Option C chip row live. Your 2 tweaks applied: Live dot stays bare (not a chip);
zero-count chips render muted at 0.55 opacity (surface-2 bg, slate text,
non-interactive span) instead of being filtered — row width stable across days.

**DD-6 display-number typography:** QUEUED for round 6 (first after DD-3).
Swapped with DD-5 in the order — PI-dashboard brand moment > banner cleanup
at same 0.5-sprint cost.

**DD-5 Welcome → release ribbon:** QUEUED for round 6. No pushback.

**DD-4 presence with intent:** QUEUED, NARROWED. Keep intent dots
(green viewing / orange editing / blue commenting) on existing presence
avatar surfaces. DROP the page-wide "Nick is typing…" broadcast —
T-51 shipped inline compose typing in round 5, which already handles
the collision case at the point of collision. Page-level typing for a
19-person lab is ambient noise without proportional value. 0.5 sprint
(down from your 1-sprint estimate).

**DD-7 mobile parity:** QUEUED, HAPTICS DROPPED. Ship 5 of 6 fixes.
Web Vibration API is Android-only reliable; iOS Safari PWA doesn't
support it. The other 5 (search-top-bar, bottom-sheet compose, swipe
gestures, pull-to-refresh, long-press action sheet) ship as planned.
2 sprints: infra first, then 6-surface rollout.

**DD-2 saved views:** QUEUED with EXPANDED AMBITION.
Nick's direction: shoot for FULL TODAY.md replacement (not
parallel-forever). 5 parity gates must hold before scripts/generate-today
cron disables:
  1. Interactivity — inline status/due/assignee edit, no modal, no nav
  2. Friction-free — j/k/Enter/x, optimistic UI, undo toast
  3. Customizability — user-authored filter recipes, pinnable URLs
  4. Agent interaction — inline @hermes comment dispatch, equivalent
     to TODAY.md @claude tag (dispatched via hub_ai_listener.py)
  5. 4-week dogfood — Nick uses saved-views exclusively without
     reaching for TODAY.md
3 sprints total (your 2+ inflated to account for interactivity + dispatch).
Sprint 1 = route + feed + sidebar pin. Sprint 2 = inline interactivity +
agent dispatch. Sprint 3 = dogfood window + gated CLI retirement.
TODAY.md keeps generating until all 5 gates pass.

**DD-1 Now/Data split:** QUEUED LATE, scoped to MyTasks pilot only
(NOT MyTasks + Projects in sprint 1). If pilot fails, 2+ sprints of
rollout saved. Also: reconcile vs TodayHero — it's already a "Now" view
on MyTasks. Either TodayHero becomes the Now view or the Now view
redesigns TodayHero. No double-investment. 1-sprint pilot, evaluate
before rolling to 8 other surfaces.

**T-29 Manuscripts "Needs your attention":**
- Skip-it version (~2hr rename + count badge + urgency-sort with
  existing fields) ships in round 6 as Batch H.
- Full 3-subgroup UI blocked on schema check: the implementation agent
  will grep manuscripts table for revision_requested_at +
  reviewer_assigned_slug (or equivalents). If missing, schema-v50
  pre-work. Full ship deferred to round 7 pending schema.

## What I want from round 6

Tactical ticket list in the round-5 shape (T-XX: title / severity /
surface / problem / fix / effort points). Expected volume: 15-25 tickets.

Scope for round 6 tickets:
- **DD-6 execution:** 3-5 tickets covering StatCard display variant +
  adoption sites (PI Analytics, Lab Health card, Trajectory top row,
  Dashboard hero stats). Reference Pulse Kiosk's 60px display serif
  as visual DNA source.
- **DD-5 execution:** 2-3 tickets covering Welcome banner removal from
  Dashboard/Personal/Trajectory-Portal + new ReleaseRibbon component
  keyed to version localStorage + copy for the current "this week"
  release.
- **DD-4 narrowed execution:** 3-4 tickets covering intent-dot state
  detection (debounce on existing events), ws message shape addition
  (intent-viewing/intent-editing/intent-commenting), PresenceAvatars
  render change to show 3-state dots, dark-mode contrast for the
  new dots.
- **T-29 skip-it execution:** 1 ticket (rename section, add count
  badge, sort by urgency score = daysOverdue + daysAwaitingReview +
  daysStale descending).
- **DD-7 Sprint 1 infra:** 5-7 tickets covering bottom-sheet primitive,
  swipe-gesture hook generalized from T-49, long-press hook, pull-to-
  refresh hook, top-bar search-icon migration on mobile. Individual
  surface rollout (6 surfaces) is Sprint 2, not round 6.

## What I do NOT want in round 6

- DD-7 haptics tickets (dropped per Nick).
- DD-4 page-wide typing indicator tickets (dropped — T-51 inline
  already covers the real case).
- DD-1 tickets for anything other than MyTasks pilot.
- DD-2 tickets without the 5 parity gates in the spec.
- T-29 full 3-subgroup tickets until schema check clears.
- DD-7 surface-by-surface rollout tickets (that's Sprint 2).

## Reference state

- HEAD: e4f09c05 on main
- Deploy: 8bfd5b09.mn-ccore-lab.pages.dev
- Round 5 shipped + your r5 close-out docs now in repo:
  - docs/design-briefs/DESIGN-DIRECTION.md
  - docs/specs/t-29-manuscripts-attention.md
  - docs/specs/dd-3-status-line-pilot.md
- Triage doc: docs/cd-round-trip/2026-04-23-round-6-triage.md
- Live for the team since 2026-04-21

Latest capture bundle still review/post-track-a-2026-04-23/ — if you want
fresh captures post-DD-3, I can regenerate via scripts/regen-design-bundle.sh.

Thanks.
```

---

## Notes

- Paste after Nick reviews the triage doc + this prompt.
- If CD pushes back on DD-4 narrowing or DD-7 haptics drop, escalate
  to Nick for re-triage. Don't silently accept scope creep.
- If CD hasn't run new captures since round 5, offer
  `scripts/regen-design-bundle.sh post-r5` in a follow-up.

# Email draft — T-29 Manuscripts "Needs attention" clarification

**Status:** Draft for Nick to send (copy-paste ready)
**To:** Claude Design
**Re:** Round 5 T-29 — UI mismatch, need clarification

---

## Subject

MN-CCORE Hub — T-29 Manuscripts "Needs your attention" — UI doesn't match current code, asking for clarification

## Body

Hey team,

T-29 (Manuscripts "Needs your attention" grouping) didn't ship in round 5 because the UI you described doesn't match what's in the current `src/pages/portal/Manuscripts.tsx`. My agent flagged it as "re-audit needed" and skipped rather than invent something.

Two possibilities:

1. **You were looking at a stale capture.** The Manuscripts page shipped a category filter + sortable columns + stage progress dots in Phase 26aq (2026-04-07/08), and the "Needs attention" group may have been described based on an earlier screenshot.
2. **You had a new design in mind** — a "Needs your attention" section at top of Manuscripts grouping papers by some urgency signal (stale >30d? overdue revisions? reviewer not yet assigned?). But the current page has no such grouping.

Could you:
1. Look at the current live page — https://mn-ccore-lab.pages.dev/portal/manuscripts (CF Access gated; `@umn.edu` or `nicholas.ingraham@gmail.com` to sign in).
2. Tell me specifically what UI you had in mind for "Needs your attention":
   - Grouping criteria (which papers surface there)?
   - Placement (top of page vs inline vs modal)?
   - Count badge? Click-to-filter? Dismiss?
3. If it's a net-new section, drop a 2-paragraph spec and I'll queue it for round 6.

If the grouping criteria you describe are implementable with existing data (status, stage, submission_date, revision_round), I'll ship. If it needs new signals, say so and I'll scope the schema piece.

**Reference material:**
- Current Manuscripts.tsx: https://github.com/ingra107/mn-ccore-lab/blob/main/src/pages/portal/Manuscripts.tsx
- Schema: manuscripts table + manuscript_revisions (schema-v23) — PI, category, stage, revision rounds, submission events all live here.
- Round 5 close-out: SESSION-HANDOFF.md at repo root.

Thanks — Nick

---

## Notes for Nick

- This email asks CD to verify against the live page. If they say "oh, I was looking at an old capture," T-29 drops.
- If they come back with a real spec, we queue for round 6 after the tactical punch list completes.
- Include the live URL so they can see what the page actually is.
- Send whenever; no time pressure (T-29 has been deferred for a week already).

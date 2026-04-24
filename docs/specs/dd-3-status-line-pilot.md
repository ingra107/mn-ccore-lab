# Spec — DD-#3 Status-Line Pilot on Dashboard

**Status:** Draft, awaiting Nick approval before build
**Ticket:** DD-#3 (Claude Design direction items)
**Builds on:** T-30 shipped 2026-04-23 (Dashboard greeting shrunk 600wt→500wt, 1.4rem→14px — already operational-toned foundation)
**Scope:** Replace Dashboard "Good morning, Nick" greeting with an operational status line (e.g. "3 overdue · 2 deadlines this week · 1 IRB renewal").

---

## Why

Per the 2026-04-23 first-landing brief §Underlying vision, the Hub is **operational, not editorial**. A "Good morning, Nick" greeting is editorial (magazine-style). A status line tells the user what's going on at a glance without a single click — canonical guardrail GR1 ("landing pages must be immediately actionable").

T-30 already dropped the greeting from display-size Fraunces to 14px operational. This takes the logical next step: replace greeting content entirely with the data that's currently spread across 6 dashboard cards below it.

## Three candidate layouts

Pick one; spec continues with the chosen layout.

### Option A — Single line, dot-separated

```
3 overdue  ·  2 deadlines this week  ·  1 IRB renewal  ·  4 done today
```

- Least chrome. Densest. Reads like a terminal prompt.
- Breaks on narrow viewports (<640px) — needs collapse to 2-line or wrap.
- Colors: maroon for overdue, gold for upcoming, slate for completed. Uses `--stage-fill-*` tokens to stay axe-AA.

### Option B — Two-line: stats row + context

```
3 overdue  ·  2 due this week  ·  1 IRB renewal
Last 24h: 4 tasks done · 2 notes posted · 1 meeting
```

- Line 1 = things that need attention.
- Line 2 = ambient activity so user knows what the team did.
- More vertical space but more informative.

### Option C — Chip row

```
[⚠ 3 overdue] [📅 2 this week] [🏥 1 IRB] [✓ 4 done]
```

- Chips = clickable, each navigates to the filtered view.
- Matches the chip-strip pattern now used on SearchPage + ActivityPage.
- Biggest implementation: needs click handlers + filter targets.

**Recommendation:** **Option C** (chip row). Matches design-system convention, turns status-at-a-glance into actionable click targets, and extends Rule 16 (data pages taxonomy) naturally.

---

## Edge cases

- **Empty state** (no overdue, no deadlines, 0 done today): collapse to one chip `[✓ All clear]` in teal. Never show "0 overdue".
- **PI vs fellow view:** PI sees team-wide counts; fellow sees own counts. Wire to `useUserRole()` same as WeeklyProgressCard.
- **Before data loads:** skeleton chip row (3 placeholder chips, pulse-shimmer) — avoids CLS vs empty→populated flip.
- **Mobile <640px:** horizontal scroll with `max-[640px]:overflow-x-auto` (matches MyTasks quickFilter pattern).
- **Exceeds 4 items:** truncate to top 4 by urgency, add `+N more →` chip linking to `/portal/my-tasks`.

## Data sources

All already-live API endpoints, no schema change:
- `overdue` = `GET /api/tasks?assignee=<user>` filter `due_date < today && !completed`
- `dueThisWeek` = same endpoint, filter `due_date <= today+7 && !completed`
- `irbExpiring` = `useExpiringRegulatory(60)` (already wired into Personal)
- `doneToday` = `/api/tasks` filter `completed_at >= today`

## Files (when building)

- `src/pages/portal/Dashboard.tsx` — replace the greeting block (near top, look for current `Good morning` string or T-30 shrink)
- `src/components/dashboard/StatusLine.tsx` — NEW. Chip row + click handlers.
- Reuse: `useTasks`, `useExpiringRegulatory`, `useUserRole`, `InlineSelect` chip styling from SearchPage/ActivityPage.
- Tokens: `--stage-fill-*` for chip fills (axe-AA), `--teal` for "done" accent, `--maroon` for overdue.

## Tests

- Dashboard inspection spec: `tests/inspection.spec.ts` — add `[data-testid="dashboard-status-line"]` check.
- Visual: r7 audit captures Dashboard, should include status line.
- Empty state: needs a test account with zero tasks; can snapshot.

## Rollout

- Ship behind no flag — it's a visible replacement. Don't gate.
- Deploy when green. If team pushes back, cheap revert.
- Announce in next meeting ("replaced greeting with operational status at a glance").

## Risk

- PIs who liked the greeting — small. Mitigation: keep greeting copy in a tooltip if you hover the chip row? Probably not worth it. Ship clean.
- Status line becomes cluttered as more signals are added — hard cap at 4 chips, `+N more →` spillover.

## Out of scope

- Click-to-drill-down with inline panel (too big for pilot; chips just navigate).
- Per-user customization of which chips show (wait for usage data).
- Wiring to Hermes ambient suggestions (separate decision; if shipped later, add chip `[🪄 2 suggestions]`).

## Acceptance

- Dashboard opens. Above-the-fold is immediately scannable.
- 4 chips max, each with count + short label + click target.
- Zero spinner frames — skeleton until data ready.
- Mobile layout readable without pinch-zoom.
- Passes `/tests/inspection.spec.ts` dashboard suite + axe.

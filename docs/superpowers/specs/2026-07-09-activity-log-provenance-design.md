# Activity-log provenance (lifecycle activity entries) — design

**Issue:** GitHub #93 / backlog #358 · **Date:** 2026-07-09 · **Status:** design (awaiting review)

## Problem

The unified activity timeline (`activity_entries`, schema-v77) only ever shows
human messages — comments, notes, and Hermes replies. It never records the
*lifecycle* of a task or project: who **created** it and **how** (manually, from
an email, from a meeting), who **completed** it, and who **changed** its key
fields. Nick (issue #93): *"every time a task or project is created … shouldn't
that be an activity to say who did it, if it was manual how was it created (was
it an email derived task, was it from a meeting) … same when something is
completed or something is changed/updated … these would be manipulation
activities … you could filter off if … cluttering."*

The infrastructure to hold these already exists but has **zero live writers**:
- `activity_entries.kind` already includes `'completion'` and `'system'`
  (`shared/activityKinds.ts`).
- `TaskActivityFeed` already has a **System** filter pill
  (`filterMatchesKind` → shows `completion || system`), so it renders empty today.
- The provenance signals already live on the `tasks` row: `source` (already
  normalized to `'meeting'`/`'manual'`/`'mobile'`/`'meeting_approval'` at
  create, `tasks.ts:439`), `meeting_id`, `email_link`, `source_thread_id`,
  `inbox_event_id`, `assigned_by`, `completed_by`.

So this is a pure **additive** feature: emit `system`/`completion` rows through
the existing `postActivityEntry()` primitive at the write chokepoints. **No
schema migration, no new columns, no pb-schema bump, no PB coordination.**

## Decisions (Nick, 2026-07-09)

1. **Events:** Created · Completed/Reopened · key state changes — **status,
   assignee, project move, due-date/deadline, priority**. NOT every field edit
   (avoids the clutter Nick flagged; **title, description, short_title, effort**
   edits are *not* tracked in this build).
2. **Default view:** visible by default in the "All" feed; the existing **System**
   filter pill isolates them.
3. **Entities:** tasks **and** projects. Project events: created (with category),
   stage change, status change / marked done / published.
4. **Line voice:** terse system-log style — `Created · from a meeting — nick`,
   `Status: todo → in progress — will` — not narrative prose (keeps it distinct
   from comments).
5. **Marker:** a quiet **typed glyph per event**, muted: `＋` created · `⇄`
   changed · `✓` completed · `↻` reopened (project stage/status use `⇄`). Faster
   event-type recognition than a uniform dot, still recessive.
6. **Bursts:** one line per change (no same-actor folding this build). A
   "fold consecutive changes" collapse is a possible fast-follow if it proves
   noisy in practice — NOT in scope here.

## Architecture

### Write chokepoints (one place each, all origins covered)

Every task/project create routes through `applyMutation → applyInsert`
(`mutations.ts:553`); every update through `applyMutation → applyPatch`
(`mutations.ts:1220`). This is true for **all** origins — Hub UI
(`handleCreateTask`), mobile PWA (`handleMobileTasksToHub`, `tasks.ts:1352`),
Apps Script email tasks, meeting-approval, and PB sync push. Hooking these two
functions catches everything in one spot.

Emit from **`applyMutation`** after a successful insert/update (it already holds
`user`, the mutation, and reads `current` before dispatching), via a new helper:

```
emitLifecycleActivity(env, mut, user, before, after)
  // before = null for insert; the pre-image row for patch
```

- placed **after** the dispatch returns `accepted` and only for
  `mut.table ∈ {'tasks','projects'}`;
- dedup-adoption paths (`dedupAccepted`) return earlier, so a merge never emits a
  spurious "Created";
- wrapped in try/catch that logs and swallows — a lifecycle-entry failure must
  **never** fail the underlying mutation (activity is a side effect, like the
  existing mention-notification `try/catch` in `postActivityEntry`).

### What each event emits

All rows: `visibility='team'`, `fireSideEffects=false` (no @mention parse / owner
re-notify / Hermes on an auto-generated line), `actorSlug` = the resolved caller,
`metadata_json` = structured detail for future rich rendering.

**Tasks**
| Event | kind | body | metadata |
|---|---|---|---|
| Created | `system` | `Created this task` + origin qualifier | `{event:'created', origin}` |
| Completed (status→done) | `completion` | `Completed` | `{event:'completed'}` |
| Reopened (done→not-done) | `system` | `Reopened` | `{event:'reopened'}` |
| Status (other transitions) | `system` | `Status: todo → in progress` | `{event:'status', from, to}` |
| Assignee | `system` | `Assigned to @will` / `Reassigned @nick → @will` / `Unassigned` | `{event:'assignee', from, to}` |
| Project | `system` | `Moved to <Project>` / `Removed from project` | `{event:'project', from, to}` |
| Due/deadline | `system` | `Due date set to Jul 15` / `changed to …` / `cleared` | `{event:'due', field, from, to}` |
| Priority | `system` | `Priority: medium → high` | `{event:'priority', from, to}` |

The leading **glyph is derived from the event** at render (see Rendering):
`created→＋`, `completed→✓`, `reopened→↻`, everything else `→⇄`. It is NOT stored
— only `kind` + `metadata_json.event` are.

Origin qualifier (creation only), derived from the row:
- `meeting_id` set, or `source ∈ {meeting, meeting_approval}` → ` (from a meeting)`
- `email_link` / `source_thread_id` / `inbox_event_id` set, or `source='email'`
  → ` (email-derived)`
- `source ∈ {mobile, pwa}` → ` (via mobile)`
- else (`manual`/unknown) → no qualifier.

**Projects**
| Event | kind | body |
|---|---|---|
| Created | `system` | `Created this project` + ` (<Category>)` |
| Stage | `system` | `Stage: analysis → writing` |
| Status (→done) | `completion` | `Marked done` |
| Status (other) | `system` | `Status: active → waiting_external` |

Completion is a *special-cased status transition* — one line, never both a
"Completed" and a "Status: … → done" for the same change.

### Idempotency

`postActivityEntry` supports `sourceTable`/`sourceId` with `INSERT OR IGNORE` on a
`UNIQUE(source_table, source_id)` partial index. Key each lifecycle row on the
**mutation id + event**:

```
sourceTable = 'lifecycle'
sourceId    = `${mut.mutation_id}:${event}`   // e.g. 'mut_01K…:status'
```

Each mutation is one accepted action; replays (Bug-Y race, sync re-push) carry the
**same** `mutation_id` → no duplicate row. A genuinely new transition is a new
mutation → a new row. **Confirmed** the v77 index is generic:
`CREATE UNIQUE INDEX idx_ae_source ON activity_entries (source_table, source_id)
WHERE source_table IS NOT NULL` (`api/schema-v77-activity-entries.sql:63`) — it
covers **any** `source_table`, so `'lifecycle'` idempotency works with **no schema
change**.

### Actor resolution

`actorSlug` = `actorSlug(user?.email)` (the authenticated caller who performed the
write). For PB-sync-originated writes this resolves to the PB service user
(`nick-ingraham`), which correctly reflects who pushed the change. `assigned_by`
(create) / `completed_by` (complete) are available as fallbacks/metadata.

### Rendering — quiet system chrome, NOT a message (Nick, 2026-07-09)

Lifecycle rows must be **visually distinct from comments** and deliberately
recessive: *"more minimal in nature and timestamped … italicized text or
something that is not overbearing and distracting but easily digestible among
comments."* So a lifecycle row is a **quiet interstitial line**, not an
attributed message card:

- **single line, small, italic, muted** — `font-style: italic`, muted color via
  the `--muted` / `--ink-muted` token (NOT a raw low opacity — must stay AA per
  the opacity policy; italic-muted reads as de-emphasized while remaining legible);
- **a subtle typed leading glyph** derived from the event (`＋` created · `⇄`
  changed · `✓` completed · `↻` reopened), in a low-emphasis muted accent
  (created→gold-muted, completed→green-muted, else teal-muted); if rendered as a
  lucide icon rather than a text glyph, size per Rule 74 (`ICON_PROPS`, ≤20px,
  `strokeWidth 1.5 absoluteStrokeWidth`);
- **inline timestamp with hover-to-absolute** (Nick 2026-07-09) — every lifecycle
  line's time is a `<time dateTime="<utc-iso>" title="<full viewer-local date +
  time>">`, so hovering the relative time reveals the exact local datetime
  ("hover over the 1d shows the date and time in local time = absolute best").
  The **Created** line shows an **absolute local date + time inline** (e.g.
  `Jul 6, 2:14 PM`), *not* just relative — creation time is the anchor provenance
  fact. All other lifecycle lines show the relative form (`3d`) and reveal the
  absolute on hover. Absolute string via `formatLocal()` (lib/time.ts); relative
  via the existing `dateUtils` relative formatter; both viewer-local and
  traveler-aware per the time discipline;
- **NO avatar, NO comment bubble/surface, NO hover actions, tighter vertical
  rhythm** than a comment row — comments keep their author avatar + name +
  surface; lifecycle lines recede between them.

Example, interleaved in the "All" feed:

```
● Created (from a meeting) — nick · 3d ago            ← italic, muted, one line
┌───────────────────────────────────────────┐
│ 🙂 Will Parker                              │        ← comment keeps its card
│ let's push this to Friday          · 2d ago │
└───────────────────────────────────────────┘
● Status: todo → in progress — will · 1d ago         ← italic, muted, one line
● Completed — will · 4h ago
```

`TaskActivityFeed` (task) and `ActivityStream` (project) already render
`activity_entries` rows and already have the filter taxonomy, but they have never
rendered a `system`/`completion` row (zero in prod), so both need an explicit
**lifecycle render branch** keyed on `kind ∈ {system, completion}` that produces
the minimal italic line above — rather than falling through to the comment
renderer. Factor the branch into ONE shared presentational component
(`LifecycleActivityLine`) consumed by both feeds so the two surfaces can't drift.
No new filter UI needed (System pill exists; default "All" shows them per
decision 2).

## Non-goals (YAGNI / explicit follow-ups)

- Title/description/priority/short_title/other field edits (decision 1).
- A "hide system by default" toggle (decision 2 = visible; revisit only if it gets
  noisy in practice).
- Backfilling historical lifecycle events (forward-only; the one-time
  activity_log completion backfill from 2026-06-10 already recovered 30 real
  completions).
- Any PB-side writer or schema change (Hub is the sole writer; pull-to-brain.db is
  read-only and automatic).

## Testing

`npm run test:api` (vitest), new cases:
- create → one `system` row, correct origin qualifier per source signal;
- complete → one `completion` row; reopen → `system`;
- tracked field change (status/assignee/project/due) → one `system` row with
  from→to; **untracked** edit (priority/title) → **no** row;
- idempotency: replaying the same `mutation_id` inserts no second row;
- project create/stage/marked-done;
- lifecycle-emit failure does not fail the mutation (throw in the helper → mutation
  still `accepted`).

Then `npx tsc -b --noEmit` + `npm run build`, deploy `npm run deploy:pages:gated`,
post-deploy probe on a live create.

## Risk / blast radius

- Additive only; existing feeds already tolerate the kinds. Worst case a
  lifecycle row renders plainly — no corruption, no mutation impact (try/catch).
- One extra `INSERT` (+ existence SELECT) per create/complete/tracked-change.
  Acceptable; `applyInsert`/`applyPatch` already run several statements.
- No cross-repo lockstep; no migration. Reversible by deleting the helper call.

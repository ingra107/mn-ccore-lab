# M5 Phase 2 — Brainstorm-lite (scoping + decision points)

**Date:** 2026-06-10 · **Status:** PROPOSAL — needs Nick's calls on the 4 decision points below.
**Parent spec:** `docs/superpowers/specs/2026-06-10-activity-entries-unified-timeline-design.md`
(Phase-2 section). **Riders:** PB `Docs/tech-debt-backlog.md` 2026-06-10 feed items.

## Ground truth (live prod D1, queried this session)

| Fact | Evidence |
|---|---|
| `activity_log` 22,220 rows decompose to: `project_update` 10,266 (auto "Updated project fields: …", actor=anonymous) · `pb_session` 7,421 · `task` 1,945 (completions/bulk-deletes) · `sync` 960 · `comment` 198 · `task_update` 107 · long tail | type×related_type GROUP BY + random samples |
| The "human" rows are NOT recoverable content: `comment` rows store the body-less stub "Commented on task" (real bodies lived in `task_comments`, 0 rows — cascade-wiped); `task_update` rows are dominated by `SYNCTEST-*` / `INSPECTION TEST` / `AUDIT TEST` artifacts | random samples of both types |
| 55 projects carry `[YYYY-MM-DD]` dated description lines; `comments`=2, `project_updates`=0, `activity_entries`=3 | counts query |
| Dated lines are STILL being written: PB `BrainDB` appends `[date.today()] …` to project/task `notes` (query.py:1960 complete-with-note, :2001 project breadcrumb, :2084 reopen, :2650) and project `notes` syncs to Hub `description` (hub.py:3165 rename lane) | PB grep |
| Mirror-table disposition (spec Phase-2 line item) is ALREADY DONE — PB `779bcfbf` archived-then-dropped `d1_task_*` mirrors (mig-104) | PB git log |
| `descriptionLog.ts` already parses the dated-line format deterministically (it's the display transform shipped 2026-06-10) | file read |

## Recommended slices

### P2-A — Project composer retarget (Hub-only, self-contained, do FIRST)
Retarget the ProjectDetail composer writes (`comments` table via projects.ts) through
`postActivityEntry()`; backfill `comments` (2 rows) + `project_updates` (0 rows) with
`source_table/source_id` idempotency; converge the 3rd copy of @hermes dispatch + @mention
policy in `projects.ts:23-40+944-1010` / `questions.ts` into the primitive (tech-debt M-L item —
watch the `aiPrompt>5` guard + mention self-filter for behavior parity). Ride-alongs while in the
feeds: unify TaskActivityFeed/ActivityStream row renderers into ONE shared `ActivityEntryItem`
(the ~200-line fork; badge/config/EntryTime already shared in `activityRender.tsx`), optional
`filterMatchesKind()` + LinkChip extraction. Wire-contract impact: none (no PB payload change),
but the composer write path gets the WRITE-path smoke per the arc-4 lesson.

### P2-B — Description split (cross-repo; the only slice needing PB lockstep)
1. **One-shot deterministic migration** of the 55 projects' dated lines → `activity_entries`
   (`kind='update'`, actor from line context else `nick-ingraham`, `source_table='description_line'`,
   `source_id=<project>:<hash>`), strip migrated lines from `description`, snapshot-gated
   (export + restore drill per M5 A1 doctrine). The existing `parseDescriptionLog()` IS the parser.
2. **Kill the writer class**: retarget PB's breadcrumb appends (query.py 4 sites) to post activity
   entries Hub-first instead of mutating `notes` — PB-session work, handoff doc needed.
3. `descriptionLog.ts` deleted ONLY after (2) lands and one sync cycle shows no new dated lines.

### P2-C — Physical drops (quick, substrate-swap gated)
`task_comments` + `task_updates` are write-frozen and the legacy endpoints serve projections over
`activity_entries` — confirm zero direct table readers (grep + one alias-traffic check), snapshot,
DROP, REFERENCE.md sweep. Same shape as the daily_plans drop.

## Decision points for Nick

1. **SKIP the legacy `activity_log` backfill entirely?** Recommend **YES** — the 22K rows are
   machine telemetry + body-less stubs + test artifacts; there is no human content to import.
   `activity_log` stays compat-read-only (as today), eventual archival is a separate cheap call.
   This deletes the scariest Phase-2 line item for free.
2. **Haiku vs deterministic parse for the description migration?** Recommend **deterministic**
   (`parseDescriptionLog()` already exists and the format is machine-written); LLM only for any
   unparseable residue, output reviewed before write. The spec's "nightly Haiku" framing predates
   knowing the writer is PB's own breadcrumb code.
3. **Nightly sweep vs PB writer retarget for ongoing dated lines?** Recommend **retarget**
   (primitive kills the class; a nightly sweep is a compensating control that runs forever).
4. **Order:** P2-A → P2-C → P2-B (A is self-contained value now; B needs a PB-session pairing).

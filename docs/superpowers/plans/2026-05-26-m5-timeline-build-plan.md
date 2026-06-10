# M5 — Activity-Timeline + Comments (Increment 2) Build Plan

> **🚨 STOP — READ `Scratch-handoff/2026-06-10-HUB-SESSION-BRIEF.md` FIRST (2026-06-10).** This plan
> now has a sibling design (`task_messages` handoff, same date) that targets the SAME source tables
> with a DIFFERENT store — the brief carries the collision analysis, the codex referee ruling on the
> target store, Nick's binding 2026-06-10 requirements (also in the ADDENDUM below), and the
> staleness list (this plan was verified vs 5/26 HEAD; P2-5 ActivityStream, descriptionLog.ts, v75/v76
> shipped since — re-grep every citation before edit). Do not execute this plan standalone.

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Dispatch domain specialists per task: **hub-backend** (`api/routes/*.ts`, `mutations.ts`, D1, wrangler deploy), **hub-frontend** (`src/**/*.tsx`, composer/feed UI), **builder** (PB `scripts/db/*`, outbox/hub.py/query.py/hub_payload.py, migrations, lint). Builder cannot edit Hub `.ts` directly — those steps return "next: dispatch hub-backend/hub-frontend" to the COO.

**Goal:** Collapse the four overlapping per-item text surfaces (`description` / `notes` / `comments` / `updates`) into a clean two-part model — a stable **Description** body plus a unified **Activity timeline** (system events + human comments) with a frictionless `@`-mention composer — without ever breaking the live team's description reads.

**Architecture:** Hub-first cross-repo lockstep. Extend the existing `activity_log` table (do NOT create a new `timeline` table), add an authenticated Activity write transport, dual-read the unified feed, backfill the 5 source tables idempotently, switch composers to the existing `SmartCompose`/`MentionInput`, switch writes to Activity, THEN remove every `notes`→`description` sync/create/pull leak (PB + Hub), THEN manually clean conflated descriptions LAST under a snapshot. Body model: **plain `description` is canonical**; `description_json` is a generated cache (reject JSON-only writes — derive plain + write both). Rich-text-canonical is a SEPARATE later migration, out of scope.

**Tech Stack:** TypeScript + Hono v4.12 + Cloudflare D1 (Hub `api/routes/`), React 19 + Vite (Hub `src/`), Vitest (`api/**/*.test.ts`), Python 3.10+ (PB `scripts/db/`), SQLite (`data/brain.db`), pytest (`tests/sync/`, `tests/db/`), wrangler (deploy + D1 export/import).

**Verified against:** PB HEAD `77d74578`, Hub HEAD `d8ef5979` (this session, 2026-05-26). Every file:line below was re-grepped against HEAD per the writing-plans pre-write rule. Codex's audit citations (`docs/superpowers/plans/2026-05-26-m5-codex-audit.md`) were already verified; this re-cite confirms them and corrects path drift. See "Verified citation spine + drift" appendix.

**Source documents:**
- Codex audit (verified backbone): `docs/superpowers/plans/2026-05-26-m5-codex-audit.md`
- Design spec: `docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md` (Model A)
- Reconciliation: `docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md` (§2 Increment 2, §3 invariants)

---

## Cross-plan invariants (reconciliation §3 — NEVER violate)

1. **NEVER combine the timeline `description` migration with the LWW timestamp migration** — two independent data-risk axes in one rollback is forbidden. Separate snapshots, separate windows. (Increment 1A forward-primitive shipped; the `client_ts` cutover is done — `Context/Decisions/2026-05-23-increment-1A-timestamp-utc-cutover.md`. M5 starts only after that.)
2. **The timeline cutover (this plan) follows Increment 1's `client_ts` cutover** — they edit the same `outbox.py`/`hub.py`/`mutations.ts`; overlapping lockstep windows = half-migrated inconsistency. **GATE: confirm Increment-1A Tasks 1-7+10 are merged on both repos before starting Phase A.**
3. **Cross-repo lockstep is HUB FIRST** (Nick, locked 2026-05-26): Hub `activity_log` schema extend + Activity write transport → PB emits markers to Activity → remove PB notes→description leaks → remove Hub PWA/direct leaks → manual body cleanup LAST. Failure mode if order is wrong (codex synthesis §"Cross-repo lockstep"): if PB stops notes→description before Activity exists, done/reopen/retire markers disappear from team-visible history; if Hub switches readers before backfill, comments/updates vanish from feeds; if Hub keeps PWA notes fallback after PB cleanup, new tasks keep polluting `description`.
4. **Never clean `description` before all current readers are protected.** Read sites that must keep working throughout (codex §"Safe-ordering"): task API `description` (`tasks.ts:20,71`), why-callout first paragraph (`tasks.ts:540-546`), Today drawer fallback (`TaskDetailDrawer.tsx:32-33`), global search (`search.ts:150-158`), meeting agenda (`meetings.ts:170-177`), ProjectDetail save/render (`ProjectDetail.tsx:513-516,1720-1722`), `/portal/activity` legacy render (`ActivityPage.tsx:234-242`).
5. **Body model:** reject JSON-only `description` writes. If an editor submits `description_json`, server derives plain text and writes BOTH in the same mutation. Plain `description` stays canonical for M5. Every risky live read consumes plain text (`tasks.ts:20-31`, `tasks.ts:540-546`, `search.ts:149-158`, `meetings.ts:170-177`, `ProjectDetail.tsx:515-516,1720-1722`); `description_json` is only an accepted/selected field today (`tasks.ts:200,239`), not a coherent canonical body.

## Snapshot doctrine (the two Risk-C steps are snapshot-gated)

Only TWO steps in this plan are Risk-C; both are snapshot-gated:
- **Task A1 (initial D1 export + brain.db snapshot).** Named failure: irreversible body/timeline split without source rows. The backfill (Phase B) and the manual body cleanup (Phase E) both consume rows that, if mis-handled, are unrecoverable in place.
- **Task E2 (manual body cleanup of active descriptions).** Named failure: destructive in-place rewrite of conflated `description` values. Codex §1 + reconciliation §0 confirm: marker patterns overlap real prose, so a global auto parse-split would lose data. Cleanup is archive-first + manual on the active set only.

This is a SEPARATE snapshot from Increment 1A's (invariant 1). Deliverable: **`scripts/restore-m5-snapshot.*` runbook (both repos)** — see Phase A Task A1 + the Deliverables section. Snapshot validity: the *initial export* (A1) is the durable backfill source (kept until Phase E completes); the *Phase E pre-cleanup snapshot* is snapshot→clean→watch→discard-or-restore-fast (hours), since restoring a stale description snapshot clobbers real team edits.

---

## File Structure

**Hub (`~/mn-ccore-lab/`):**
- Create: `api/schema-vNN.sql` — `activity_log` column extension migration (next version after current high-water; confirm via `ls api/schema-v*.sql`).
- Modify: `api/helpers.ts:215-226` — `logActivity` writes new columns (keep legacy columns populated).
- Modify: `api/routes/activity.ts:12-46` — visibility-gate comment/body entries (authenticated entity-scoped, not just PB-category exclusion); add entry_type filter support.
- Create/Modify: Activity write transport — either `POST /api/activity/entries` (new authenticated route) OR register `activity_log` in `mutations.ts` `ALLOWED_TABLES` (`:28-33`) + `TABLE_FIELDS` (`:198`). **Decision in Task A3.**
- Modify: `api/routes/search.ts:159-186` — unify the 5 source-table reads into Activity reads (Phase D, after backfill).
- Modify: `api/routes/tasks.ts` — comment write (`:493-495`), update write (`:983-985`) → Activity; remove `notes` from `TASK_ALLOWED_FIELDS` (`:239`) + create payload (`:421`) + PWA map (`:1063,:1116`); fix `handleToggleTask` `SELECT *` leak (`:226`).
- Modify: `api/routes/projects.ts` — comment write (`:809-811`), update write (`:869-871`) → Activity.
- Modify: `api/routes/mutations.ts:204` — remove `notes` from `TABLE_FIELDS.tasks` whitelist.
- Modify: Hub feed/composer UI — `src/components/tasks/detail/{TaskComments,TaskUpdateFeed,TaskActivityFeed}.tsx`, `src/components/{ProjectUpdateFeed,ProjectComments}.tsx`, `src/pages/ProjectDetail.tsx` (banner `:1858-1877`), `src/pages/portal/ActivityPage.tsx:234-242`.
- Reuse (do NOT rebuild): `src/components/SmartCompose.tsx` (already wraps `MentionInput`, `:297-306`; already has Custom mode for project composers, `:9-14`), `src/components/MentionInput.tsx`, `src/hooks/useMentionAutocomplete.ts` (exports `useTeamSlugs`, `:8-18`).
- Create: snapshot/restore runbook `scripts/restore-m5-d1-snapshot.ts` (or `.sh`) + `scripts/export-m5-d1-snapshot.sh`.
- Create: `api/routes/activity.entries.test.ts`, backfill test fixtures.

**PB (`~/Peripheral-Brain/`):**
- Modify: `scripts/db/query.py` — re-point markers: `complete_task` (`:1326-1329`), `uncomplete_task` (`:1553-1561`), `retire_local_duplicate` (`:1876-1883`) to emit Activity `system` entries (Phase A→B, after transport exists); remove create-leaks `create_project` (`:815`), `create_task` (`:977`) (Phase C).
- Modify: `scripts/db/outbox.py:292-301` — remove `notes`→`description` from `_LOCAL_TO_HUB_FIELD_MAP` for tasks + projects (Phase C).
- Modify: `scripts/db/sync/drivers/hub.py:1350-1353` — remove `description`→`notes` pull-back (Phase C).
- Modify: `scripts/db/sync/hub_payload.py` — remove create-leak (`:563-566`), task pull-create map (`:598`), project pull-create map (`:664`) (Phase C).
- Create: Activity-emit helper (PB-side) for marker `system` entries that POSTs to the Hub Activity transport (Phase A Task A4).
- Create: `Context/Decisions/2026-05-26-m5-activity-timeline-notes-boundary.md` — decision doc (supersedes the OPEN `2026-05-23-notes-description-privacy-boundary.md` Model-A stub with the as-built design).
- Create: `data/shared/hub-schema-changes.jsonl` handoff line (Hub-first; filed before PB stops sending the old format).
- Modify: `Context/Topics/shared-schema-registry.md` — register the `notes` local-only boundary + Activity entry contract.
- Create: snapshot helper `scripts/db/snapshot_brain_db.py` (or reuse Increment-1A's if present) for the brain.db side of A1.

**Snapshot artifacts (gitignored, machine-local):**
- `data/snapshots/2026-05-26-m5/` — brain.db copy + `-wal`/`-shm` + D1 export of `activity_log`, `task_comments`, `task_updates`, `comments`, `project_updates`, `tasks`, `projects`.

---

## Phase / Task map (5 phases, 18 tasks)

| Task | Phase | Repo | Owner | Ship-risk | Depends on | Relay-confirm |
|---|---|---|---|---|---|---|
| A0 | A Foundation | — | COO | A | Inc-1A merged | yes (gate) |
| A1 | A Foundation | Hub+PB | hub-backend + builder | **C** | A0 | **YES** |
| A2 | A Foundation | Hub | hub-backend | A | A1 | no |
| A3 | A Foundation | Hub | hub-backend | A | A2 | no |
| A4 | A Foundation | PB | builder | A | A3 | no |
| B1 | B Backfill+dual-read | Hub | hub-frontend | B | A3 | no |
| B2 | B Backfill+dual-read | Hub | hub-backend | B | A3 | YES (idempotent rerun) |
| B3 | B Backfill+dual-read | PB | builder | B | A4, B2 | no |
| C1 | C Composer+writes | Hub | hub-frontend | B | B1 | no |
| C2 | C Composer+writes | Hub | hub-backend | B | B2, C1 | no |
| C3 | C Composer+writes | Hub | hub-backend | B | C2 | no |
| D1 | D Leak removal (Hub) | Hub | hub-backend | B | C3 | no |
| D2 | D Leak removal (Hub) | Hub | hub-backend | B | C3 | no |
| D3 | D Leak removal (PB) | PB | builder | B | A4, D1 | **YES** (lockstep) |
| D4 | D Leak removal (PB) | PB | builder | B | D3 | YES (lockstep) |
| D5 | D Leak removal (PB) | PB | builder | B | D3 | YES (lockstep) |
| E1 | E Cleanup | Hub | hub-backend | A | D2, D5 | no |
| E2 | E Cleanup | Hub+PB | hub-backend + builder | **C** | E1 | **YES** |

Maps to codex §"Migration runbook" 12 steps: A1=step1, A2=step2, A3=step3, B1=step4, B2/B3=step5, C1=step6, C2/C3=step7, D3=step8, D4=step9 (create-leaks), D5=step10 (pull-back), D1/D2=step11 (Hub leaks + whitelist), E2=step12. (E1 = the search-unify + banner removal split out from step 7/11 for clean ownership.)

---

## Phase A — Hub foundation (schema + transport + PB marker-emit)

### Task A0 — Gate: confirm Increment 1A is merged on both repos
- [ ] **Change:** Verification gate only. Confirm Increment-1A `client_ts` cutover (Tasks 1-7+10) is merged on PB HEAD and Hub HEAD. Reconciliation §3 invariant 2 forbids overlapping the shared-file (`outbox.py`/`hub.py`/`mutations.ts`) lockstep windows.
- **File:line:** check `git log --oneline --grep="increment-1A" --grep="client_ts"` on both repos; confirm `Context/Decisions/2026-05-23-increment-1A-timestamp-utc-cutover.md` exists and `scripts/db/sync/operations.py:EXPECTED_MIN_MIGRATION` reflects the 1A migration.
- **Test:** `python scripts/db/sync.py status` clean; no pending 1A migration; both repos' working trees clean of 1A WIP.
- **Ship-risk:** A. Owner: COO. Rollback: n/a (gate).
- **Relay-confirm:** YES — peer machine must confirm it is also on a post-1A HEAD before any M5 shared-file edit. Use `cross-machine-relay` skill (Migration section).

### Task A1 — Snapshot + count BOTH stores (codex step 1)
- [ ] **Change:** Export D1 tables `activity_log`, `task_comments`, `task_updates`, `comments`, `project_updates`, `tasks`, `projects` (`wrangler d1 export mnccore-lab --remote --table ...` per table, or full export filtered). Snapshot PB `data/brain.db` + `-wal`/`-shm` to `data/snapshots/2026-05-26-m5/`. Record row counts + actual column lists (do NOT trust `api/bootstrap-schema.sql` — it self-declares "NOT THE CURRENT PRODUCTION SCHEMA", `api/bootstrap-schema.sql:3-6`; `activity_log` legacy shape is at `:86-94`). Ship the restore runbook (`scripts/restore-m5-d1-snapshot.*` + brain.db restore) as part of this task — a snapshot without a tested restore is fake durability (ethos #2).
- **File:line:** `api/bootstrap-schema.sql:3-6` (schema warning), `:86` (activity_log DDL start), `:100` (`comments.author_id` FK to team_members).
- **Test:** restore drill — restore the D1 export into a throwaway D1/local SQLite and the brain.db snapshot into a temp path; diff row counts vs live; confirm restore script runs clean end-to-end. (Artifact: row-count manifest + restore-drill log.)
- **Ship-risk:** **C.** Named failure mechanism: irreversible body/timeline split without source rows — backfill (B2/B3) and manual cleanup (E2) consume these rows; if lost, unrecoverable in place. Rollback: this IS the rollback substrate; the snapshot + tested restore script are the deliverable.
- **Owner:** hub-backend (D1 export + restore script) + builder (brain.db snapshot + restore).
- **Relay-confirm:** **YES** — both machines quiescent during export; peer confirms no in-flight writes. Snapshot is the M5-specific rollback substrate, separate from Inc-1A's (invariant 1).

### Task A2 — Extend `activity_log` (codex step 2)
- [ ] **Change:** Add columns to `activity_log`: `entity_type`, `entity_id`, `entry_type` (`'system'|'comment'`), `body`, `actor_slug`, `mentions_json`, `source_table`, `source_id`. Add a UNIQUE idempotency index on `(source_table, source_id)`. **Keep legacy columns** (`type`, `description`, `actor`, `related_id`, `related_type`, `timestamp`) populated so existing readers don't break: `logActivity` insert (`api/helpers.ts:223-225`), `/api/activity` `SELECT *` ordered by `timestamp` (`api/routes/activity.ts:16,37`), `/portal/activity` legacy render (`src/pages/portal/ActivityPage.tsx:234-242`), search activity read (`api/routes/search.ts:170-172`). Update `logActivity` (`api/helpers.ts:215-226`) to also write the new columns (entity_type/entity_id from related_type/related_id, entry_type='system', body=description, actor_slug=actorSlug(actor)).
- **File:line:** `api/bootstrap-schema.sql:86-94`, `api/helpers.ts:215-226`, `api/routes/activity.ts:16,37`, `src/pages/portal/ActivityPage.tsx:234-242`.
- **Test:** Vitest — old `/api/activity` still returns rows with legacy columns intact; new columns nullable+populated on new `logActivity` calls; unique index rejects duplicate `(source_table, source_id)`. Migration applies clean against a D1 export copy.
- **Ship-risk:** A (pure additive — new columns nullable, legacy path unchanged; ships on green). Rollback: revert migration (no data depends on new columns yet); if backfill already ran, restore from A1.
- **Owner:** hub-backend.

### Task A3 — Add Activity write transport (codex step 3)
- [ ] **Change:** `/api/mutations` rejects `activity_log` today — it's not in `ALLOWED_TABLES` (`api/routes/mutations.ts:28-33`) and unknown tables hard-reject (`:358-360`). **Decision:** add a dedicated authenticated `POST /api/activity/entries` (preferred — keeps Activity off the A3 outbox/seq-hash machinery, which is built for canonical task/project fields, not append-only log rows). Validate: authenticated create, reject unauthorized, reject unknown entity (entity_id must resolve to a live task/project), entry_type in `('system','comment')`, optional `source_table`/`source_id` for idempotent backfill. Visibility on READ stays per Task B1.
- **File:line:** `api/routes/mutations.ts:28-33` (ALLOWED_TABLES, no activity_log), `:358-360` (unknown-table reject).
- **Test:** Vitest `api/routes/activity.entries.test.ts` — create comment entry, create system entry, reject unauthenticated, reject unknown entity_id, reject bad entry_type, idempotent insert on duplicate `(source_table, source_id)` returns existing (no dup).
- **Ship-risk:** A (new endpoint, independent path; legacy comments/updates still work). Rollback: revert endpoint; nothing depends on it until B/C.
- **Owner:** hub-backend.

### Task A4 — PB marker-emit helper + re-point markers to Activity (codex cross-repo §2)
- [ ] **Change:** Add a PB helper that POSTs a `system` Activity entry to the Hub transport (httpx + `env_bootstrap.load_secrets()` per sync-and-machines rule — CF WAF 1010 on urllib). Re-point the three marker appenders to ALSO emit an Activity `system` entry (keep the local `notes` append for now — removal of the notes→description SYNC is Phase D; the local append stays until then so nothing is lost mid-migration): `complete_task` (`scripts/db/query.py:1326-1329`), `uncomplete_task` (`:1553-1561`), `retire_local_duplicate` (`:1876-1883`). **`retire_local_duplicate` is outbox-bypassed by design** (`:1872-1875` `anti-pattern-allowed`) — it may emit a local-only marker but MUST NOT push a Hub mutation that re-echoes the deletion to the winner (reconciliation §2: "retire_local_duplicate stays local-only — do NOT emit a Hub entry"). So: complete/reopen emit Activity; retire stays local-only (no Hub Activity entry).
- **File:line:** `scripts/db/query.py:1326-1329` (complete), `:1553-1561` (reopen), `:1876-1883` (retire — local-only, no Hub emit).
- **Test:** pytest `tests/db/` — `complete_task` emits one Activity POST (mock transport) + still appends local note; `uncomplete_task` same; `retire_local_duplicate` emits NO Hub Activity; transport failure is logged loud, not swallowed (ethos #3).
- **Ship-risk:** A (additive emit; local behavior unchanged; transport already validated in A3). Rollback: revert the emit calls; markers fall back to notes-only.
- **Owner:** builder.

---

## Phase B — Backfill + dual-read

### Task B1 — Dual-read unified feed (codex step 4)
- [ ] **Change:** Make the task/project/global feeds read new `activity_log` entries PLUS old tables until backfill completes. The task feed already merges updates/comments/activity client-side (`src/components/tasks/detail/TaskActivityFeed.tsx:65-72`) — extend it (and `ProjectUpdateFeed`/`ProjectComments` render) to include Activity entries, de-duped by `source_table`/`source_id` so a backfilled row and its origin row don't double-render. Add the All / Activity(system) / Discussion(comments) filter toggle (entry_type) — YAGNI: only these three filters (reconciliation §2 defers collapse-runs + advanced filters).
- **File:line:** `src/components/tasks/detail/TaskActivityFeed.tsx:65-72`.
- **Test:** Playwright/Vitest — existing task updates + comments still appear; backfilled Activity rows don't double with their origin rows; filter toggle returns correct subsets.
- **Ship-risk:** B (sequenced after A3 — reads new + old; no data risk, but feed regression is visible to team). Rollback: revert feed to read only the existing `TaskActivityFeed`/`ProjectUpdateFeed`/`ProjectComments` sources.
- **Owner:** hub-frontend.

### Task B2 — Backfill 5 source tables into Activity (codex step 5 + §"Backfill plan")
- [ ] **Change:** Backfill `activity_log` (existing), `task_comments`, `task_updates`, `comments`, `project_updates` into the unified Activity shape. Sources are the 5 distinct searchable surfaces proven at `api/routes/search.ts:166-186`. Idempotent on UNIQUE `(source_table, source_id)`. Mappings: legacy `activity_log` → use existing `id`, `description`→`body`, `timestamp`→`created_at`, `actor`→`actor_slug` (normalize via `actorSlug`, `api/helpers.ts:266-269`); comments/updates → preserve `created_at`, content→body, author fields. **`comments.author_id` is a team-member id, NOT a slug** (`api/bootstrap-schema.sql:100`) — join `team_members` like the existing comments read (`api/routes/projects.ts:802-804`) to resolve to slug. **Do NOT parse `tasks.description` wholesale** — historical marker text already reached description via notes sync (`scripts/db/outbox.py:292-301`) and may duplicate `logActivity` system events. Description-marker extraction is deferred to E2 (archived body only, synthetic `source_id` = `description_marker:<entity_id>:<hash>`, only when no same-entity/same-day/same-type Activity row exists).
- **File:line:** `api/routes/search.ts:166-186` (5 sources), `api/bootstrap-schema.sql:100` (author_id is member id), `api/routes/projects.ts:802-804` (member→slug join pattern), `api/helpers.ts:266-269` (actorSlug).
- **Test:** Vitest — backfill against the A1 export copy; rerun inserts ZERO duplicates (idempotency); row counts: Activity comment/system count == sum of source rows; `comments.author_id` resolved to correct slugs; no row sourced from `tasks.description`.
- **Ship-risk:** B (writes to new columns only; idempotent; A1 snapshot protects). Rollback: `DELETE FROM activity_log WHERE source_table IN ('task_comments','task_updates','comments','project_updates') OR (source_table='activity_log' AND ...)`; restore from A1 if needed.
- **Owner:** hub-backend.
- **Relay-confirm:** YES — run backfill once on the canonical D1; idempotent rerun is safe but coordinate so two operators don't run concurrently.

### Task B3 — PB-side mirror reconciliation note (codex §5 open item)
- [ ] **Change:** The PB mirrors `d1_task_updates` (160 rows) and `d1_project_updates` (23 rows) exist; `d1_task_comments` is inert (0 rows) — verified this session. **Do NOT delete these mirror tables or the old Hub update tables** until mirror consumers are named (codex §"What's missing" #3, reconciliation §5). This task: grep PB for readers of `d1_task_updates`/`d1_project_updates`; document the consumer set (or confirm none) in the decision doc. If zero live consumers, mark them retire-eligible for a FOLLOW-UP plan (not M5).
- **File:line:** PB `Grep d1_task_updates`, `d1_project_updates` across `scripts/`.
- **Test:** grep output captured in decision doc; row counts recorded (160 / 23 / 0).
- **Ship-risk:** B (read-only audit; no deletion). Rollback: n/a.
- **Owner:** builder.

---

## Phase C — Composer + writes switch

### Task C1 — Switch composers to SmartCompose/MentionInput (codex step 6)
- [ ] **Change:** Replace the raw task comment `<input>` (`src/components/tasks/detail/TaskComments.tsx:117-124`) and the raw task-update `<textarea>` (`src/components/tasks/detail/TaskUpdateFeed.tsx:68-88`) with the existing `SmartCompose` (which already wraps `MentionInput`, `src/components/SmartCompose.tsx:297-306`). **Do NOT build a new composer or a second mention parser** (CLAUDE.md Critical Rule #7; codex §"Do not build a new composer"). **Amendment to codex (verified this session):** `SmartCompose` already has a "Custom mode" used by `ProjectUpdateFeed`, `ProjectComments`, and ProjectDetail compose (`SmartCompose.tsx:9-14`) — so the project-side composers are likely ALREADY on MentionInput; confirm via grep and skip if so. The scope is primarily the two TASK-side raw inputs. Autocomplete uses `useTeamSlugs` → `/api/team/slugs` (`src/hooks/useMentionAutocomplete.ts:8-18`).
- **File:line:** `src/components/tasks/detail/TaskComments.tsx:117-124`, `src/components/tasks/detail/TaskUpdateFeed.tsx:68-88`, `src/components/SmartCompose.tsx:9-14,297-306`, `src/hooks/useMentionAutocomplete.ts:8-18`.
- **Test:** Playwright — Enter posts, Shift+Enter newline (or Cmd+Enter per SmartCompose mode); `@` autocomplete from `/api/team/slugs`; optimistic append; mention token inserts. No raw textarea/input remaining in task comment/update surfaces.
- **Ship-risk:** B (UI swap; old write endpoints still live). Rollback: revert UI to raw input/textarea.
- **Owner:** hub-frontend.

### Task C2 — Switch comment/update WRITES to Activity (codex step 7)
- [ ] **Change:** Point the write endpoints at the Activity transport (Task A3). Current writes: task comments → `INSERT task_comments` (`api/routes/tasks.ts:493-495`), task updates → `INSERT task_updates` (`:983-985`), project comments → `INSERT comments` (`api/routes/projects.ts:809-811`), project updates → `INSERT project_updates` (`:869-871`). Each becomes ONE Activity `comment` (or `system`) row. **Decide compatibility-mirror policy:** either stop writing old tables entirely (clean) OR dual-write to old tables during a transition window. Recommend clean (Activity-only) since dual-read (B1) + backfill (B2) cover historical rows. Mentions notify via the existing notification path (`projects.ts:816-841`, `tasks.ts:991-994`) — keep that wiring, source it off the Activity entry.
- **File:line:** `api/routes/tasks.ts:493-495` (comment), `:983-985` (update); `api/routes/projects.ts:809-811` (comment), `:869-871` (update).
- **Test:** Vitest — posting a comment creates exactly ONE Activity row (not an old-table row, unless mirror intentionally kept); mentions create notifications; @hermes still triggers AI listener as a comment entry. No orphaned old-table inserts.
- **Ship-risk:** B (write redirect; backfill + dual-read protect history). Rollback: revert write endpoints to old-table inserts.
- **Owner:** hub-backend.

### Task C3 — @hermes/@claude listener continuity (codex step 7 detail)
- [ ] **Change:** Confirm the @hermes path (`handleClaudeMention`, called from `projects.ts:850` + the task comment path) still fires when comments are Activity entries. The AI listener consumes the mention; ensure its source reference points at the Activity entry id, not the old `task_comments`/`comments` row id.
- **File:line:** `api/routes/projects.ts:848-853` (`handleClaudeMention` call), task comment equivalent (`api/routes/tasks.ts` near `:497`).
- **Test:** Vitest — @hermes comment creates AI request + placeholder Activity comment; listener resolves the entry.
- **Ship-risk:** B (continuity of existing feature). Rollback: revert to old-row reference.
- **Owner:** hub-backend.

---

## Phase D — Leak removal (Hub leaks first, then PB leaks — Nick's locked order step 3-4)

> **Order within Phase D (Nick locked 2026-05-26): D1/D2 (Hub) before D3/D4/D5 (PB)?** NO — re-read: Nick's lockstep is "remove PB notes→description leaks → remove Hub PWA/direct leaks". So PB leak removal (D3-D5) comes BEFORE Hub leak removal (D1-D2). The table's task IDs are renumbered to honor this: execute **D3 → D4 → D5 → D1 → D2**. (D-numbering is label-only; the dependency column + this note are authoritative on order.)

### Task D3 — Remove PB notes→description PUSH map (codex step 8)
- [ ] **Change:** Remove `"notes": "description"` from `_LOCAL_TO_HUB_FIELD_MAP` for both `tasks` and `projects` (`scripts/db/outbox.py:292-301`). Verify `translate_patch_for_hub` (`:524`, rename applied `:549`) no longer emits `description` for a `notes` patch. **Only after** Task A4's Activity marker path exists (so done/reopen markers still reach team-visible history). File the Hub handoff line to `data/shared/hub-schema-changes.jsonl` FIRST (Hub-first lockstep).
- **File:line:** `scripts/db/outbox.py:292-301`, `:524`, `:549`.
- **Test:** pytest `tests/sync/` — update local task notes, flush; Hub task `description` UNCHANGED. Same for projects. `check_sync_antipatterns.py` clean.
- **Ship-risk:** B. Rollback: restore map entries; A1 snapshot protects data.
- **Owner:** builder. **Relay-confirm:** **YES** — cross-repo lockstep; peer machine must pull the outbox change before either sends a notes patch.

### Task D4 — Remove PB create-leaks (codex step 9)
- [ ] **Change:** Stop `create_project` (`scripts/db/query.py:815` `"description": notes`) and `create_task` (`:977` `"description": notes`) from seeding Hub description from local notes. Also remove the `hub_payload.py` create-leak `translate_project_for_hub` (`scripts/db/sync/hub_payload.py:563-566`, `fields["description"] = desc` from notes/next_action when `not is_existing`) — **codex amendment: the spec's Increment-2 removal list missed this.** New PB-created task/project gets empty/explicit body; local notes stay local.
- **File:line:** `scripts/db/query.py:815`, `:977`; `scripts/db/sync/hub_payload.py:563-566`.
- **Test:** pytest — new PB-created task and project push with no/explicit `description`; local notes never reach Hub. `tests/db/test_a3_outbox_field_translation.py` (or equivalent) updated.
- **Ship-risk:** B. Rollback: restore the three payload mappings.
- **Owner:** builder. **Relay-confirm:** YES (lockstep with D3).

### Task D5 — Remove PB pull-back into local notes (codex step 10)
- [ ] **Change:** Remove the Hub `description`→local `notes` pull-back: existing-row pull (`scripts/db/sync/drivers/hub.py:1350-1353`) and the create-pull maps in `hub_payload.py` — `translate_task_from_hub` (`:598` `"notes": item.get("description")`) and `translate_project_from_hub` (`:664` same). **Codex amendment: reconciliation §2 missed these CREATE-pull paths.** After removal, a Hub body edit does not overwrite PB local notes.
- **File:line:** `scripts/db/sync/drivers/hub.py:1350-1353`; `scripts/db/sync/hub_payload.py:598`, `:664`.
- **Test:** pytest `tests/sync/` — Hub `description` edit pulled; local `notes` UNCHANGED on both existing-row and new-row pull. Build a fixture from real data (test-coverage ≠ prod-correctness on sync layer, per `feedback_test-coverage-not-equal-production-correctness.md`).
- **Ship-risk:** B. Rollback: restore pull mappings.
- **Owner:** builder. **Relay-confirm:** YES (lockstep with D3/D4).

### Task D1 — Remove Hub PWA/direct notes→description leaks (codex step 11)
- [ ] **Change:** PWA create: stop `description = pwaTask.description || pwaTask.notes || title` (`api/routes/tasks.ts:1063`) from falling back to `notes`; stop writing Hub `notes` in the PWA payload (`:1116`). Direct create: remove `notes` from the create payload (`:421`) and the create-body type (`:359`) — or explicitly quarantine if a non-Nick capture surface still needs it (confirm via grep of PWA/Apps-Script callers first). Net: new tasks get body only from explicit `description` or a blank-body policy; Hub `notes` is no longer written.
- **File:line:** `api/routes/tasks.ts:1063` (PWA fallback), `:1116` (PWA notes write), `:421` (direct create notes), `:359` (create body type).
- **Test:** Vitest — mobile sync creates body from explicit description only (or blank); Hub `notes` not populated. Existing PWA dedup logic (`:1083-1091`) unaffected.
- **Ship-risk:** B. Rollback: revert the Hub route changes.
- **Owner:** hub-backend.

### Task D2 — Remove Hub `tasks.notes` from write allowlists (codex §"What's missing" #4 + §"Hub task update")
- [ ] **Change:** Remove `notes` from `TASK_ALLOWED_FIELDS` (`api/routes/tasks.ts:239`) and from the mutation whitelist `TABLE_FIELDS.tasks` (`api/routes/mutations.ts:204`). `notes` is already read-redacted via `TASK_SELECT_COLS` (`tasks.ts:19-32`, omission note `:31`) but is still WRITABLE — contradicts "Hub notes unused/local-only." Also fix the `handleToggleTask` `SELECT *` response leak (`tasks.ts:226`) — it returns `SELECT * FROM ${table}` (which includes `notes`) despite `TASK_SELECT_COLS` deliberately excluding it; replace with an explicit column list. **Codex amendment: this `SELECT *` leak is in the same privacy cleanup.**
- **File:line:** `api/routes/tasks.ts:239` (TASK_ALLOWED_FIELDS notes), `:226` (SELECT * leak), `:19-32` (TASK_SELECT_COLS), `:31` (notes omission note); `api/routes/mutations.ts:204` (TABLE_FIELDS notes).
- **Test:** Vitest — `POST /api/tasks/:id` with `notes` field is rejected (not silently dropped — keeps schema drift visible per the mutations.ts contract); mutation with `notes` rejected; `handleToggleTask` response contains no `notes` key. Existing PB pushes that previously sent `notes`→`description` already stopped at D3, so no regression.
- **Ship-risk:** B. Rollback: re-add `notes` to allowlists; revert SELECT.
- **Owner:** hub-backend.

---

## Phase E — Cleanup (manual body cleanup LAST, snapshot-gated)

### Task E1 — Unify search + remove "Notes vs Comments" banner (codex step 7/11 cleanup)
- [ ] **Change:** Now that all 5 sources are backfilled into Activity (B2) and writes go to Activity (C2), unify the search reads: the 5 separate source-table reads (`api/routes/search.ts:159-186`: comments `:166-169`, activity_log `:170-172`, project_updates `:173-178`, task_updates `:179-182`, task_comments `:183-186`) collapse into a single Activity `body`/`comment` search. Keep task/project `description` search (`:150-158`) — that's the clean body, still searched. Remove the obsolete "Notes vs Comments" product banner (`src/pages/ProjectDetail.tsx:1858-1877`) — notes are now local-only and the team surface is Activity.
- **File:line:** `api/routes/search.ts:150-158` (keep), `:159-186` (unify the 5 source reads), `src/pages/ProjectDetail.tsx:1858-1877` (remove banner).
- **Test:** Vitest — search returns comment/update bodies via Activity (no duplicate hits from old + new); description search intact. Playwright — banner gone.
- **Ship-risk:** A (read-path consolidation after backfill is complete; ships on green). Rollback: revert search to the 5 reads; restore banner.
- **Owner:** hub-backend (search) + hub-frontend (banner) — split or single hub-backend pass with frontend confirm.

### Task E2 — Manual cleanup of conflated active descriptions (codex step 12)
- [ ] **Change:** Archive current `tasks.description`/`projects.description` values, then clean the ACTIVE set BY HAND. **Do NOT global parse-split** — marker patterns overlap real prose from the PB appenders (`scripts/db/query.py:1326-1329`, `:1553-1561`, `:1876-1883`), so an auto-split loses data (codex §1, reconciliation §0). Optional: extract description-markers from the ARCHIVED body only, with synthetic `source_id` = `description_marker:<entity_id>:<hash>`, inserted to Activity only when no same-entity/same-day/same-type Activity row exists (de-dup against B2's backfill + `logActivity` history). This runs under a FRESH pre-cleanup snapshot (separate from A1's durable backfill snapshot).
- **File:line:** `scripts/db/query.py:1326-1329`, `:1553-1561`, `:1876-1883` (the appenders whose markers conflate description).
- **Test:** every live description read site that was nonempty stays nonempty (invariant 4 read sites: `tasks.ts:20,71,540-546`, `TaskDetailDrawer.tsx:32-33`, `search.ts:150-158`, `meetings.ts:170-177`, `ProjectDetail.tsx:1720-1722`, `ActivityPage.tsx:234-242`). No description-marker double-count vs Activity. Manual review log captured as artifact.
- **Ship-risk:** **C.** Named failure mechanism: destructive in-place rewrite of conflated descriptions; bad split = silent body data loss on a team-visible surface. Rollback: restore archived descriptions from the fresh pre-cleanup snapshot.
- **Owner:** hub-backend (D1 archive + cleanup) + builder (any PB-side marker-source coordination).
- **Relay-confirm:** **YES** — both machines quiescent; fresh snapshot first; short watch window; restore-fast-or-never.

---

## Body model (locked, Nick 2026-05-26)

Plain `description` is canonical for M5. `description_json` is a generated cache. Server rule (enforced where description is written — `api/routes/tasks.ts` update handler near `:239`/`mutations.ts` patch apply, `api/routes/projects.ts` update handler): **reject JSON-only writes** — if `description_json` is submitted without `description`, derive plain text from the JSON and write BOTH in the same mutation; explicit body edits write `description` and `description_json` is rebuilt from it. Rich-text-canonical (flipping ownership to `description_json`) is a SEPARATE later migration, out of M5 scope — it can only happen after all readers (`search.ts:149-158`, `meetings.ts:170-177`, `tasks.ts:540-546`, `ProjectDetail.tsx:1720-1722`) stop depending on plain text.

---

## Deliverables

1. **This plan:** `docs/superpowers/plans/2026-05-26-m5-timeline-build-plan.md`.
2. **Codex audit (tracked copy):** `docs/superpowers/plans/2026-05-26-m5-codex-audit.md`.
3. **Decision doc:** `~/Peripheral-Brain/Context/Decisions/2026-05-26-m5-activity-timeline-notes-boundary.md` (supersedes the OPEN `2026-05-23-notes-description-privacy-boundary.md` with the as-built Model-A design + the body-model lock).
4. **Snapshot/restore runbook (both repos):** Hub `scripts/export-m5-d1-snapshot.sh` + `scripts/restore-m5-d1-snapshot.*` (tested restore drill, Task A1); PB `scripts/db/snapshot_brain_db.py` (or reuse Inc-1A's) + documented brain.db restore. A snapshot without a tested restore is fake durability (ethos #2).
5. **Hub handoff line:** `~/Peripheral-Brain/data/shared/hub-schema-changes.jsonl` (filed before D3, Hub-first lockstep).
6. **Schema registry update:** `~/Peripheral-Brain/Context/Topics/shared-schema-registry.md` (notes local-only boundary + Activity entry contract).

**Commit (path-explicit, ingra107 identity, no Claude attribution):**
```
git commit -F <msgfile> -- docs/superpowers/plans/2026-05-26-m5-timeline-build-plan.md docs/superpowers/plans/2026-05-26-m5-codex-audit.md
```

---

## Verified citation spine + drift (re-grepped against HEAD this session)

PB HEAD `77d74578`, Hub HEAD `d8ef5979`. All codex citations re-validated; line numbers held, only path/name drift found.

**Path drift (codex cited bare filenames; real nested paths):**
- `TaskComments.tsx` → `src/components/tasks/detail/TaskComments.tsx` (`:117-124` ✓)
- `TaskUpdateFeed.tsx` → `src/components/tasks/detail/TaskUpdateFeed.tsx` (raw textarea `:68-88`; codex `:67-88` ✓)
- `TaskActivityFeed.tsx` → `src/components/tasks/detail/TaskActivityFeed.tsx` (`:65-72` ✓)
- `ActivityPage.tsx` → `src/pages/portal/ActivityPage.tsx` (`:234-242` ✓)
- `ProjectDetail.tsx` → `src/pages/ProjectDetail.tsx` (`:513-516` handleDescSave, `:1720-1722` render, `:1858-1877` banner ✓)
- `TaskDetailDrawer.tsx` → `src/components/today/TaskDetailDrawer.tsx` (`:32-33` ✓)
- `bootstrap-schema.sql` → `api/bootstrap-schema.sql` (`:3-6` warning, `:86-94` activity_log, `:100` author_id ✓)
- `SmartCompose.tsx` / `MentionInput.tsx` / `useMentionAutocomplete.ts` → `src/components/`, `src/hooks/` (SmartCompose `:297-306` ✓)

**Name drift:** `useMentionAutocomplete.ts:8-18` — line range exact; the exported hook is named `useTeamSlugs` (not `useMentionAutocomplete`).

**Line-span notes (all benign):**
- `TASK_SELECT_COLS` — codex `tasks.ts:8-32`; const is `:19-32`, doc comment `:8-18`. Both accurate.
- `_LOCAL_TO_HUB_FIELD_MAP` — codex `outbox.py:292-300` is current+correct (`:292-301`). The ORIGINAL SPEC's `:271-275`/`:270-278` is stale ~20 lines (reconciliation §4 warned of this).

**Exact-match confirmations (codex amendments, the load-bearing set):**
- `hub_payload.py:563-566` create-leak ✓ (guarded `if not is_existing`, `fields["description"] = desc`)
- `hub_payload.py:598` task pull-create `"notes": item.get("description")` ✓ (codex `:590-599`)
- `hub_payload.py:664` project pull-create `"notes": item.get("description")` ✓ (codex `:657-665`)
- `mutations.ts:204` `notes` in `TABLE_FIELDS.tasks` ✓; `mutations.ts:28-33` no `activity_log`; `:358-360` unknown-table reject ✓
- `tasks.ts:239` `notes` in `TASK_ALLOWED_FIELDS` ✓; `:226` `handleToggleTask SELECT *` leak ✓
- `outbox.py:292-301` map, `:524`/`:549` translate ✓; `hub.py:1350-1353` pull-back ✓
- `query.py:815` create_project, `:977` create_task, `:1326-1329`/`:1553-1561`/`:1876-1883` markers ✓

**New finding (amendment to codex):** `SmartCompose` already has a "Custom mode" consumed by `ProjectUpdateFeed`, `ProjectComments`, ProjectDetail compose (`SmartCompose.tsx:9-14`) — the project-side composers are likely ALREADY on MentionInput, reducing C1 scope to the two task-side raw inputs. Confirm via grep in Task C1.

**Mirror tables (PB, verified this session):** `d1_task_updates` 160 rows, `d1_project_updates` 23 rows, `d1_task_comments` 0 (inert) — matches spec; fate deferred to a follow-up plan (Task B3).


---

## ADDENDUM — Nick's requirements (2026-06-10, verbatim intent; fold into the build)

Nick independently re-derived this plan's core while live-reviewing ("this is a big class level thing that might require appropriate brainstorming"):
1. **Description = static one-time brief summary.** "when i think of description i think more of a onetime description of the project... not a running list of things we have done to move it along. i feel like that is activity." (= exactly Model A's split; the dated `[YYYY-MM-DD]` log lines currently appended into description are the mislabeled Activity.)
2. **Activity displays MOST-RECENT-FIRST.** Interim display fix shipped 2026-06-10 (`0609bb33`: `src/lib/descriptionLog.ts` parses lead-prose + dated entries, renders newest-first) — M5 replaces the parse-hack with real timeline rows.
3. **Task-level events feed PROJECT activity.** "if something in tasks happens shouldn't that show in the project activity because it helps see the whole picture?!" — the unified timeline must include task creates/completes/notes/comments for the project's tasks (visibility-gated per the spec).
4. **Nightly cleanup pass** ("a nice simple haiku task to comb through things and clean up those at night"): a janitor/Haiku job that migrates legacy dated-log lines OUT of `description` into timeline rows, leaving the static summary — the data-migration half of Model A, run incrementally at night rather than one big bang.
5. **Compact link chips are loved** — keep `LinkifiedText`/`classifyUrl` chip rendering (github.com pills, Obsidian pills) in timeline rows: "doesn't take up a bunch of space... so easy to click."

Run this build through brainstorming first (Nick's own call) — the spec + this addendum are the inputs.

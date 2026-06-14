# M5 Notes-Privacy — Final Design (as-built-aware)

**Date:** 2026-06-13
**Status:** APPROVED (Nick, brainstorming session 2026-06-13). Supersedes the notes-privacy / field-split portions of the stale `2026-05-26-m5-timeline-build-plan.md`.
**Owner:** builder (PB sync + brain.db migration) + hub-backend (1 Hub route line) + COO (relay/snapshot).
**Prior decisions:** `~/Peripheral-Brain/Context/Decisions/2026-05-23-notes-description-privacy-boundary.md` (RESOLVED → Model A); CLAUDE.md Rule 70 (activity_entries + `@me` visibility, 2026-06-10).

---

## Why this is small now (the discovery that reframed it)

The 2026-05-26 M5 plan assumed the timeline didn't exist yet. It does. Verified this session:

- **Activity timeline shipped** (`activity_entries` schema v77; 4 legacy message tables dropped v78). Comments + events already live there.
- **PB already emits markers to the timeline.** `complete_task` (`query.py:2098`), reopen (`:2223`), project breadcrumbs (`:2114`), project notes (`:3497`/`:3932`) all call `_post_hub_timeline_update` → Hub `activity_entries`, which *never* falls back to a notes append.
- **Therefore the dangerous lockstep precondition is already met** ("markers must reach team-visible history via Activity before severing notes→description"). Severing can no longer make team history disappear. The fragile ordering from the old plan is moot.

What remains is the narrow, originally-deferred privacy fix: **brain.db `notes` still crosses to team-visible `description`.**

---

## The problem in one paragraph

brain.db `notes` is **three jobs in one field**, which is why it's confusing:
1. **Creation body** — `create_task`/`create_project` (`query.py:1566`/`:1231`) put the task/project body in `notes`, which then pushes to Hub `description` (so `notes` is how team descriptions get set today).
2. **Append-only event log** — reopen (`:2195`), retire (`:3387`), completion notes (`:3519`/`:3528`) *append* dated lines onto `notes`.
3. **Mirror of the team description** — Hub `description` pulls back into `notes` (`hub.py:2258`).

Because `notes→description` is wired (the rename lives in `schema_dsl.LOCAL_TO_HUB_FIELD_MAP`), all three jobs leak into the team-visible `description`, turning it into a running log. Nick's intent: **`description` must be a static body — editable, never appended.**

## brain.db reality (verified)
- `tasks`: only `notes` (no `description` column).
- `projects`: `notes`, `next_action`, `journal` (no `description` column).
- Hub D1: `tasks.description`/`projects.description` (team body), plus a read-redacted `tasks.notes` column (never shown to team).

---

## Locked design — split the three jobs apart

**Field model: ONE clean body field, no separate private-notes field.**

1. **`description` = the single body field.** A static "what is this task/project" Nick edits deliberately from the CLI; syncs **both ways** with Hub `description`; **nothing ever auto-appends to it.** brain.db gains a real `description` column (tasks + projects), synced identity-mapped to Hub `description` (the `notes→description` rename ends).
2. **`notes` retired as a concept.** Its three jobs are split: event log → timeline (already done), body → `description`, anything private → an `@me` timeline entry. No separate brain.db private-notes field survives long-term.
3. **Auto-append sites stop touching the body.** Reopen/retire/completion already post to the timeline (canonical); they stop appending to the body field. (Local-only forensic breadcrumbs, if any are still wanted, must NOT live in `description`.)
4. **Comments + events + `@me` privacy → timeline, fully unchanged.** This work does not touch the timeline at all.
5. **Hub PWA fallback removed** — `tasks.ts:1356` `description = pwaTask.description || pwaTask.notes || title` stops falling back to `notes`.

**Privacy model:** there is no private body field to leak. `description` is *intended* team-visible (Nick edits it deliberately). Anything Nick wants private is an `@me` timeline entry (`visibility='author'`, SQL-gated, Rule 70). The leak is eliminated by construction, not by a guard.

---

## Implementation surface (current line numbers, re-grep before edit)

**PB (`~/Peripheral-Brain/`):**
- brain.db migration: add `description` column to `tasks` + `projects`. Backfill from `notes` (body portion) — see Migration below.
- `scripts/db/schema_dsl.py` — `LOCAL_TO_HUB_FIELD_MAP`: drop the `tasks`/`projects` `notes→description` rename; map local `description` ↔ Hub `description` identity. `notes` becomes brain.db-only (add to the BRAIN_DB_ONLY / non-wire set).
- `scripts/db/outbox.py` — consumers of the rename (`:343`, `:556`, `:642`, `:680`, `:706`) follow the DSL change automatically; verify `translate_patch_for_hub` no longer emits `description` from `notes`.
- `scripts/db/sync/drivers/hub.py:2258`, `:3254-3255` — pull-back now targets local `description` (not `notes`).
- `scripts/db/sync/hub_payload.py:706`/`:731` (create-leak), `:764`/`:867` (pull-create maps) — retarget to `description`; remove notes-sourced description seeding.
- `scripts/db/query.py` — `create_task` (`:1566`)/`create_project` (`:1231`) write the body to `description`; auto-append sites (`:2195`, `:3387`, `:3519`/`:3528`) stop writing the body field.
- TODAY.md generator + CLI surfaces — read `description` for the body.

**Hub (`~/mn-ccore-lab/`):**
- `api/routes/tasks.ts:1356` — drop the `|| pwaTask.notes` fallback.
- (Already done, verify: `notes` removed from `mutations.ts` `TABLE_FIELDS`; `SELECT *` leak fixed per `tasks.ts:291` comment; `notes` read-redacted in `TASK_SELECT_COLS`.)

---

## Migration (the only hard part)

Existing `notes` values are a mix of **body + appended dated event-lines + pulled team description**. On cutover:
- **Body text → `description`.** The lead prose (non-dated-line content) is the body.
- **Dated event lines** (`[YYYY-MM-DD] …`) → already on the timeline (or backfilled); they do NOT go into `description`.
- Do **NOT** auto-split destructively. Per Nick's addendum (2026-06-10): a **nightly Haiku janitor** combs dated-log lines out incrementally, leaving the static summary — the data-migration half, run as a slow background pass rather than one big bang.
- `notes` column is kept **frozen-local** during transition (not dropped) until the body migration is verified; drop is a later snapshot-gated cleanup.

---

## Risk / safety

- **Risk is much lower than the old plan** — no team-history-loss path (markers already on the timeline). No fragile cross-repo ordering.
- **brain.db snapshot before the column migration** (`scripts/db/snapshot_brain_db.py` or Inc-1A's).
- **Relay-confirm with the other machine** before the `schema_dsl` wire-contract change (the rename removal changes the PB↔Hub payload shape) — use `cross-machine-relay`.
- **Hub-first lockstep** for the wire change: file `data/shared/hub-schema-changes.jsonl` first; Hub PWA-fallback removal can ship independently (additive-safe).

## Out of scope (YAGNI)
- Rich-text-canonical `description_json` ownership flip (separate later migration).
- Comment-auto-changes-a-structured-field parsing (Nick: overengineering).
- Dropping the `notes` column (later snapshot-gated cleanup, after verification).
- Any timeline/comments/`@me` change — that substrate is done.

## Deliverables
1. This spec.
2. PB decision doc `~/Peripheral-Brain/Context/Decisions/2026-06-13-m5-notes-privacy-final.md` (supersedes the 2026-05-23 OPEN stub's pending parts with the as-built design).
3. `~/Peripheral-Brain/data/shared/hub-schema-changes.jsonl` handoff line (Hub-first).
4. Schema registry update (`Context/Topics/shared-schema-registry.md`): `notes` local-only, local `description` ↔ Hub `description` identity.
5. brain.db snapshot + restore runbook.

---

## CODEX AMENDMENTS (gpt-5.5 plan-audit, 2026-06-13)

**Verdict: AMEND** — "core direction is right; spec is not implementation-ready." Spot-checked #1 and #3 against code (both confirmed). Fold these into the implementation plan:

1. **[HIGH] Narrow the safety claim — `retire_local_duplicate` is the exception.** Complete/reopen/project-breadcrumbs/notes DO reach the timeline (`query.py:2095-2114`, `:2217-2223`, `:3487-3497`, `:3927-3932` → `postActivityEntry` `api/lib/activity-entry.ts:207/241`). But `retire_local_duplicate` (`query.py:3378-3395`) appends local `notes`, bypasses outbox, posts NO timeline entry (intentional per reconciliation §2 — retire stays local-only). So: "no team-history-loss" holds for all markers EXCEPT retire, which is deliberately local; state that explicitly.
2. **[HIGH] Cutover ordering — add+backfill `description` BEFORE any writer uses identity mapping.** A machine with identity-mapped `description` but unbackfilled local rows can send `description=NULL`/omit it on create → blanks Hub-visible bodies (`outbox.py:634-663` sends only non-None selected fields; Hub echoes canonical via `readCanonical` `mutations.ts:679`). Enforce a `description IS NOT NULL OR notes IS NULL` audit before the relay flip.
3. **[HIGH] Missed contract artifacts (generated) — VERIFIED.** The rename is also encoded in: `api/brain-db-schema-snapshot.json:7,11` (`"description":"notes"`), `pb-schema/.../field-authority.generated.ts`, and PB `generate_hub_schema_snapshot.py:39-47/155-164/277`. Deliverables MUST include pb-schema regen + Hub snapshot update + codegen outputs + tests asserting `description` identity / `notes` local-only.
4. **[HIGH] Atomic contract-version flip.** PB hashes touched fields under Hub names (`outbox.py:666-715`); Hub hashes incoming keys as-is (`mutations.ts:820-835/:1352-1365`). Flip `COLUMNS` + `LOCAL_TO_HUB_FIELD_MAP` + `HUB_TO_LOCAL` + pb-schema + Hub snapshot as ONE relay-gated contract version — a half-flip false-conflicts or unknown-field-rejects.
5. **[MED] Dead-letter janitor + records schema.** `janitor_dead_letters.py:87-99/178-188/263-271` has its own `description→notes` reverse map; `sync/records.py:247-270` admits both. Update alongside main sync.
6. **[MED] TODAY surfaces still read `notes`.** `scripts/today/sections.py:8-9/471-481/541-550/515-516/693-704` read `fields["Notes"]`. Name exact generator/formatter changes + the `description`→view-field mapping.
7. **[MED] Migration must be non-destructive.** Body + dated event-lines share one column (`query.py:2071-2079`, `:2193-2201`, `:3507-3520`; `schema.sql:105`). Do NOT let Haiku edit the only copy: write `description_candidate`, diff/review, snapshot, then promote. `[YYYY-MM-DD]` regex is insufficient — real prose can start with a date.
8. **[MED] State the privacy model honestly.** `@me` entries are server rows in `activity_entries` with `body` stored (`activity-entry.ts:207-217/231-241`); PI/API-key callers see all (`:430-436/461-463`); gating is SQL visibility, not encryption. If "never-synced local private text" is ever a hard requirement, that needs a local-only/encrypted field — `@me` is access-gated, not local-secret. (For Nick's single-user PB this is acceptable, but say so.)
9. **[LOW] PWA fallback** — confirmed (`tasks.ts:1327-1328/:1356/:1390-1397`); remove `|| pwaTask.notes`, decide title-only fallback.
10. **[LOW] Hub `notes` read-redaction already real** (`task-cols.ts:12-19/91-128`) — verification item, not work.

**Blind spots (what codex could NOT see):** live brain.db row state (it read schema, not data — so it couldn't validate how separable real body-vs-event-line content actually is); Hub D1 prod data; cross-machine sync state / the other laptop's HEAD; whether the nightly-janitor split is empirically clean on the real corpus. These are exactly the things the snapshot + a dry-run on real rows must de-risk during implementation.

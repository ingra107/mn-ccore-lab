# Time / Sync / Timeline — Reconciliation Design

> **Status:** DESIGN APPROVED by Nick 2026-05-23 (brainstorming session, after a 6-review wave).
> **Reconciles three interrelated plans into ONE coherent build sequence:**
> - Activity-Timeline + Comments (`docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md`, Hub repo)
> - LWW Timezone v2 (`~/Peripheral-Brain/Context/Decisions/2026-05-22-sync-lww-timezone-unification-v2.md`)
> - Canonical Time Discipline stub (`~/Peripheral-Brain/Context/Decisions/2026-05-23-canonical-time-discipline.md`)
> **Scope:** cross-repo (Hub `mn-ccore-lab` + PB `Peripheral-Brain`). brain.db + D1 + TODAY.md.
> **Next step:** `writing-plans` for **Increment 1** (this doc's terminal state). Increment 2 (timeline) is specced + amended but not yet planned-for-build.

---

## 0. How this design was produced (the 6-review wave)

Per Nick's reviews-before-code instruction (2026-05-23), each plan got an Opus specialist review (brainstorming discipline) + a `/codex-cli` plan-audit, plus an independent quick-win. Outputs (all verified against live code, file:line):
- `Scratch/reviews-2026-05-23/opus-timeline.md` — Opus, activity-timeline.
- `Scratch/reviews-2026-05-23/opus-lww.md` — Opus, LWW v2.
- `Scratch/reviews-2026-05-23/opus-timediscipline.md` — Opus, time-discipline design.
- `Scratch/codex-plan-audit-2026-05-23/passA/` + `$TEMP/codex-passA-20260523-last.md` — Codex, timeline.
- `Scratch/codex-plan-audit-2026-05-23/passB/` + `$TEMP/codex-passB-20260523-last.md` — Codex, LWW + time-discipline.
- Quick-win shipped: `66e5c9d0` (redact residual `tasks.notes` `SELECT *` leaks; 204 api tests; NOT yet deployed).

**Convergent verified findings** (drive everything below):
- LWW v2 is **~4/7 already shipped** in `61c53d78` — both PB decision docs falsely say "no code shipped" with line numbers stale by 80-150. Shipped: `to_utc_dt` (`outbox.py:202`), shadow module (`scripts/db/sync/lww_shadow.py`), freshness-guard fix (`hub.py:498-505`), `_lww_merge` fix (`outbox.py:1995`). Pending: pull-gate **enforce** (live gates still raw-string at `hub.py:1278/1861/2002`), LMM writer (`query.py:1185`), `client_ts` (`outbox.py:745/2045`), Hub `advanceProjectMovement` (`mutations.ts:784/798`).
- The **live Hub LMM churn bug is active now**: `advanceProjectMovement` raw-MAX-compares naive-CT `client_ts` vs UTC LMM (`mutations.ts:798`).
- The plan's `records.py` citations are wrong — real path `scripts/db/sync/records.py` (`normalize_local_to_utc_iso:104`, `apply_freshness_guard:131`).
- The **48h shadow gate is moot**: `data/logs/lww_zone_shadow.jsonl` does not exist / 0 rows on the work machine; sampler is divergence-only. "Wait until ~2026-05-25" is theatrical — the instrument never started where it can be reviewed.
- Time-discipline's "collapse" claim is **TRUE**: `to_utc_dt`'s zone-*guessing* branches (`_CT_COLUMNS`/`_CT_ORIGINS` localize) are **transitional scaffold**, deletable after an exhaustive legacy migration; its explicit-marker branch + `ZoneContractError` are **permanent**. Migration surface ≈ **91 Hub sites** vs **~2 PB sync writers**.
- Timeline core defect is **real**: `notes`→`description` push (`outbox.py:270-278`, applied `:470-507`) + pull-back (`hub.py:1321-1334`) + team-visible display — proven. But the spec was written green-field (below).

**The one contradiction, resolved against code:** Opus-LWW said *reject snapshot* (overwrites "recoverable" via `events`/`audit_log`/CRDT); Codex said *snapshot needed* (destructive in place). **Codex is correct.** Verified: `audit_log` stores only `payload_hash` (`query.py:314`); CRDT `field_timestamps` stores only `value_hash` + `ON CONFLICT DO UPDATE` (latest-only, `crdt.py:247-255`); `events` logs `new_value` but **not** `updated_at`/`last_meaningful_movement`. The exact columns the LWW flip arbitrates are **unrecoverable in place** → a snapshot is genuinely required as the rollback mechanism.

---

## 1. Governing principle (Nick-confirmed)

**Store every instant in UTC; display it in the viewer's local zone.** Two temporal types:
- **`Instant`** (UTC, "when X happened"): `created_at`, `updated_at`, `completed_at`, `last_meaningful_movement`, `client_ts`, comment/timeline times. **`completed_at` is NOT an exception** — it is a UTC instant displayed local, like everything else. (This overrides LWW v2's "leave `completed_at` CT-on-disk" shortcut, which only existed to dodge a migration.)
- **`CivilDate`** (date-only + viewer zone, "due May 25" / "today"): `due_date`, meeting `date`, the digest/TODAY anchor. The "rolled to tomorrow after 6pm" bugs came from treating a civil "today" as a UTC instant.

**Viewer-zone resolution:**
- **Hub (browser):** the browser's own timezone → **traveler-aware for free** (NY → Eastern, West Coast → Pacific, zero config).
- **Server-side (TODAY.md, CLI, cron):** the **rendering machine's OS-local timezone** — NOT a hardcoded `America/Chicago`, and NOT a stored config setting. Nick's laptop clock auto-updates when he travels, so TODAY.md generated on the work laptop in NY renders Eastern; the home laptop renders Central. Each is correct for where it runs. The hardcoded-Central helpers (`api/lib/ct-date.ts:ctToday`, any `localDateKey` Central assumption) become machine-local-zone resolution.
- **Known edge (digest email):** the Cloudflare Worker runs on the edge in UTC and has no human "machine zone." The digest renderer **defaults to Central** until per-recipient zones exist (later enhancement). This is the only server surface not auto-traveler-aware; it is low-stakes and Nick does not interact with it directly.

**Enforcement = a CI lint** (the real deliverable — executable contract, not a documented rule). Modeled on the shipped `Peripheral-Brain/scripts/db/check_sync_antipatterns.py` (regex + `anti-pattern-allowed:` allowlist) and `mn-ccore-lab/scripts/check-schema-versions.py` (stdlib, exit 0/1, in `schema-drift.yml`). Bans raw `new Date().toISOString()`, `.toISOString().split|slice`, `datetime.now()` (without `timezone.utc`), `datetime('now')` / `datetime('now','localtime')` outside the canonical helpers. Allowlist = the helper modules + classified identity/display writers. Ships **WARN first**, flips to **ERROR** after the migration. (Note: the stub's cited "sync-antipattern pre-commit hook" is NOT actually wired as a git hook today — it runs CI/manual; wiring it as a real pre-commit is an open item, Q below.)

---

## 2. The unified sequence

### Increment 1 — Time-discipline foundation + LWW correctness (P0′/P1), under ONE snapshot

Mission priority: serves daily-driver TRUST + cuts the #1 maintenance pain. All under a single snapshot umbrella so the legacy data migration is free.

1. **Canonical helpers + lint (WARN).** New `src/lib/time.ts` (Hub) + `scripts/db/timez.py` (PB, re-exporting `outbox.to_utc_dt`): `Instant`/`CivilDate` types, `nowInstant()`/`now_instant()` (UTC writers), `formatLocal(instant, viewerZone)`, `todayCivil(zone?)`, machine-OS-zone server resolution. Lint added in WARN mode. **Pure addition — ships on green, no flag.**
2. **Hub `advanceProjectMovement` read-modify-write normalizer** (`mutations.ts:784`, `:798-804`): normalize incoming `client_ts` AND existing stored LMM to UTC before the MAX; write the canonical UTC winner. **Kills the live churn bug. Independent Hub deploy.**
3. **Snapshot BOTH repos** (the LWW loop is bidirectional — brain.db-only can't roll back Hub corruption): PB full `data/brain.db` + `-wal`/`-shm`; Hub D1 export of `tasks`/`projects`/`processed_mutations` incl. `seq`/`last_mutation_id`/`updated_at`/`last_meaningful_movement`/tombstone columns. Snapshot is valid for **hours** — this is snapshot→flip→watch→discard-or-restore-fast, not snapshot-and-forget.
4. **Flip the 3 LWW pull-gates to origin-aware ENFORCE, fail-CLOSED** (`hub.py:1278` task, `:1861` project, `:2002` LMM): ambiguous/unparseable rows **skip, never apply** (the snapshot's safety property baked into the gate). Watch a short window; roll back from snapshot if a wrong overwrite appears.
5. **PB `client_ts` → explicit-UTC** (`outbox.py:745` AND `:2045` — both writers; the merged-retry writer was a Codex-found miss). Sequenced after #2 is live (Hub already normalizes, so this is rollback-safe). Cross-repo lockstep; file the Hub handoff spec (`data/shared/hub-schema-changes.jsonl`) first.
6. **One legacy data migration under the snapshot:** convert existing mixed-zone rows to UTC — LMM CT→UTC (~63 rows) + the 43 ISO-T `tasks.updated_at` rows + `completed_at` PB-CT→UTC — and flip those writers to UTC together (`query.py:1185` LMM, `:1236`/`:1341` the completion clock-split, `:1240` completed_at). Doing writer-flip + reader-contract-update + data-migration **atomically** resolves Opus's "Task 5 is internally contradictory" (R1): no window where the gate mis-reads on-disk data by 5h.
7. **Migrate display sites to viewer-local:** the ~91 Hub sites (`new Date().toISOString()` ×50, `.split|slice` ×41 — hot: `parseQuickAdd.ts`, `StatusLine.tsx`, `MyTasks/index.tsx`, `DeadlinesPage.tsx`) + server-side `scripts/generate_today_markdown.py` + `scripts/today/sections.py` to machine-OS-zone. `localDateKey()` already has 17+ correct adopters — this is "finish adopting + ban raw."
8. **Delete the `to_utc_dt` zone-guessing scaffold** (the `_CT_COLUMNS`/`_CT_ORIGINS` branches + the `local_time_is_localtime` path in `records.py:159-174`); keep explicit-marker parsing + `ZoneContractError`. Flip lint **WARN→ERROR**. Retire the shadow module.
9. **Hygiene + omitted hazards:** register the per-column zone contract in `~/Peripheral-Brain/Context/Topics/shared-schema-registry.md`; fix the second freshness-guard caller `operations.py:920` (latent Bug 2); quarantine `scripts/db/backfill_last_meaningful_movement.py` (it re-poisons LMM with CT after the UTC flip — guard or migrate it before any re-run).

### Increment 2 — Activity-Timeline + Comments (P2), later, amended

Build only after Increment 1's `client_ts` cutover (shared files: `outbox.py`/`hub.py`/`mutations.ts`). Per the timeline reviews:
- **Extend `activity_log`** (`bootstrap-schema.sql:85-94`), do NOT create a new `timeline` table — but **visibility-gate** the now-public `/api/activity` (`activity.ts`) + `/pulse` so comment entries don't leak. Add columns (`entity_type`, `entity_id`, `entry_type`, `body`, `actor_slug`, `mentions_json`, `source_table`, `source_id`); keep legacy columns populated.
- **Add a Hub Activity write transport** — `/api/mutations` does NOT allow `activity_log` (`mutations.ts:27-32`) and the activity route is read-only, so PB markers cannot ride existing sync. Add `POST /api/activity/entries` or register `activity_log` in the mutation registry + PB outbox.
- **Remove ALL `notes`→`description` paths** — not just the outbox map: also the **create-path leaks** (`query.py:736-744` `create_project`, `:900-917` `create_task`) and the PWA create map (`tasks.ts:1028-1116`) and the pull-back (`hub.py:1321-1334`). Removing the sync map alone leaves create-paths leaking.
- **Define the canonical task body** — editor writes `description_json` (`TaskDetailPanel.tsx:468-473`); search/meetings read plain `description`. Decide canonical-vs-generated, keep the other in sync.
- **Refactor the EXISTING composer** (`OverviewQuickAdd` in `TaskDetailPanel.tsx:~979`/`MentionInput` exists) — swap its raw `<textarea>` for `MentionInput` (Critical Rule #7). Do NOT build a parallel composer or a second mention parser.
- **Archive-first manual cleanup** of conflated `description` (no global auto parse-split — markers overlap real prose). Backfill idempotent on `source_table`/`source_id`. `retire_local_duplicate` stays local-only (do NOT emit a Hub entry — it bypasses outbox by design, `query.py:1653-1660`).
- YAGNI cuts: defer collapse-runs, advanced filters beyond all/discussion/system, email-notification expansion; no Hub private-notes feature; no comment-auto-sets-a-field.

---

## 3. Cross-plan invariants (never violate)

1. **NEVER combine the timeline `description` migration with the LWW timestamp migration** — two independent data-risk axes in one rollback. Separate snapshots, separate windows.
2. **The timeline cutover (Increment 2) must follow Increment 1's `client_ts` cutover** — they edit the same `outbox.py`/`hub.py`/`mutations.ts`; overlapping lockstep windows = half-migrated inconsistency.
3. **All LWW gate flips are fail-CLOSED** — ambiguous/unparseable → skip, never apply.
4. **Any shared-field change is cross-repo lockstep** (CLAUDE.md rule): decision doc + `enums.py` (if enums) + `shared-schema-registry.md` + ship both repos together; Hub handoff spec filed before PB stops sending the old format.

---

## 4. What Increment 1's `writing-plans` must produce

A task-by-task plan with, per task: file:line, change, test, A/B/C ship-risk classification + rollback, and relay-confirm points for the cross-machine/data-migration steps. MANDATORY `pre-review-grep-validate` first (re-cite every file:line against HEAD — the source plans' citations are 80-150 lines stale). Dispatch domain specialists (builder / hub-backend) per `writing-plans`. The snapshot/restore runbook (both repos) is a named deliverable. Sequencing within Increment 1 follows §2.1–9.

---

## 5. Open / deferred items

- **PB pre-commit wiring:** `check_sync_antipatterns.py` is NOT currently a git hook (only a `.ps1` non-ASCII check is). Wire the time-lint into a real pre-commit, or keep CI/manual? (Lean: wire it — executable contract.)
- **Digest per-recipient zones:** the Worker digest defaults to Central; per-recipient zone is a later enhancement (needs a `team_members` zone field).
- **Increment 2 missing pieces** (from reviews): production row-count snapshot of the 5 source tables; idempotency-key plan for backfill; auth rules for Activity create/read; the `d1_task_updates`/`d1_project_updates` mirror fate + the "team not writing updates in ~1mo" signal. Resolved when Increment 2 is planned.

---

## 6. References

- Source plans: timeline spec (Hub `docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md`); LWW v2 + time-discipline stub (PB `Context/Decisions/`).
- Review wave: `Scratch/reviews-2026-05-23/` (3 Opus) + `Scratch/codex-plan-audit-2026-05-23/` + `$TEMP/codex-pass{A,B}-20260523-last.md` (2 Codex).
- Verified-recoverability evidence: `query.py:314` (audit_log hash), `crdt.py:247-255` (CRDT hash + latest-only), `events` inserts (`query.py:1092/1285/1423`).
</content>
</invoke>

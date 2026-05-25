# Increment 1A Phase β — Task 8 v4 RE-AUDIT (run identically on work + home)

You are an independent reviewer doing the FIFTH pre-execution pass before an IRREVERSIBLE data migration. Prior passes: round 1 found 2 confirmed corruption bugs; round 2 (dual) found the amendment's value-cutoff fix was itself unsafe; round 3 (dual) BLOCKED v2 + Option B and converged on Option A + a partition assert + a negative-offset fix; round 4 (dual) VALIDATED the v3 design shape (Option A + partition assert + Python `_is_naive()` — double-shift, lost-update race, negative-offset all CLOSED) but returned an 8-item punch-list: NOT ship-as-written. The plan now carries **"Task 8 v4"** with **§v4-4** as the SOURCE OF TRUTH (every v4 banner forward-refs it). v4 resolves the 8 punch-list items:

**D1-side:**
1. (BLOCK) D1 canonicality invariant made LITERALLY TRUE — Step 8-D1 normalizes EVERY non-canonical D1 LMM (offset/Z rows re-rendered to UTC space-sep, naive-legacy-CT shifted, unprovable naive HARD-FAILS — no ineligible-skip), with a post-update assert proving 0 non-canonical rows remain.
2. D1 UPDATE is now CAS (`WHERE id=? AND last_meaningful_movement=?`) with changed-row==1 verification; 0 changed → re-audit (Hub raced the gap).
6. D1 provenance audit fetches `updated_at, last_mutation_id, slug, stale_active_since` + cross-refs `processed_mutations`; persists the classified PK/value/class table as a gitignored runbook artifact (`d1_lmm_provenance.json`).
7. Wrangler DB name resolved to `mnccore-lab` (binding `DB`, `../mn-ccore-lab/wrangler.toml:6-9`) everywhere; `pb-db` was wrong; post-update SELECT assert added.
8. Task 5 rollback snippet fixed — `tasks` export/restore no longer selects `last_meaningful_movement`/`stale_active_since` (those are projects-only per `mutations.ts:198-218`).

**Migration-side:**
3. `completed_at` partition gate added (`_COMPLETED_AT_SHIFT_ELIGIBLE_IDS`/`_INELIGIBLE_IDS` + assert + eligible-only loop) — a naive Hub-origin UTC `completed_at` can no longer be blanket CT-shifted.
4. Converter silent-None closed — a converter-success preflight runs every eligible row through `_freeze_ct_naive_to_utc`, hard-fails on any None, and asserts update-count == eligible-count.
5. Partition assert ↔ prose reconciled — coverage-only contract stated explicitly (cross-machine union semantics), `extra_classified` logged-non-fatal, true equality documented as an opt-in.
9. (nit) `_is_naive()` rejects lowercase `z`; converter accepts no-seconds (`HH:MM`).

Your job: validate that all 8 items are ACTUALLY closed in v4 §v4-4, that the D1 canonicality invariant is now literally true (not merely asserted), that the rollback snippet runs, AND catch anything STILL missed after four prior passes. Tasks 1-4 LIVE. Execution is DEFERRED — this is design validation, but be as rigorous as if it runs tomorrow.

## Hard rules
1. DO NOT run `rg --files`, `find .`, `Get-ChildItem -Recurse`. Orientation list is complete.
2. Read with `rg -n '^' <path>` ONLY (sandbox = Windows PowerShell; `cat -n` fails). Scoped `rg <pattern> <path>` on listed files is fine. One file per read.
3. Cite file:line for every concrete claim.
4. No politeness filter. Name what breaks. Do NOT rubber-stamp a validated-with-punch-list verdict — your job is to find where v4's RESOLUTION of each item is still wrong, incomplete, or introduces a new bug.
5. One pass: read, synthesize, stop.

## Scope
RUN codex from the Peripheral-Brain repo root (cwd). PB files cwd-relative (`scripts/...`); Hub files via `../mn-ccore-lab/...`. Resolves identically on work (ingra107) + home (ingra). No machine-absolute paths.

## Orientation files
- ../mn-ccore-lab/docs/superpowers/plans/2026-05-23-increment-1A-time-sync-foundation.md  (read the **Task 8 v4 §v4-4** section in FULL — it is the source of truth; the v4 banner lists exactly which v3 sub-sections it SUPERSEDES. Read v3 §v3-3 + Task 5 + Amendment B/C only for context; the superseded text is marked.)
- ../mn-ccore-lab/wrangler.toml  (the D1 binding/database_name — confirm `mnccore-lab`, NOT `pb-db`)
- ../mn-ccore-lab/api/routes/mutations.ts  (advanceProjectMovement :836-909; the atomic raw-lexical MAX compare :896-906; normalizeToUtcSpaceSep :157; ctOffsetMinutesAt :123; the :110-115 comment slated for the comment-only accuracy edit; TABLE_FIELDS tasks :198-211 vs projects :212-218; applyPatch verbatim write :914-918; completed_at accepted :201)
- scripts/db/sync/drivers/hub.py  (completed_at pulled from D1 :1349-1352; Task 6 gates + shadow :120-123; tombstone discriminators)
- scripts/db/query.py  (completion writers :1236-1240 / :1268-1273 — CT until Task 8; LMM :1185)
- scripts/db/outbox.py  (to_utc_dt, _freeze_ct_naive_to_utc converter, _is_naive, _UTC/_CT columns, origin=hub parser ~:251-253, client_ts writers ~:767/:2067)
- scripts/db/sync/operations.py  (EXPECTED_MIN_MIGRATION :43; schema gate :492-536)

## Converged audit evidence (the two round-4 audits this v4 answers)
- data/shared/codex-beta-v3-audit-work.md
- data/shared/codex-beta-v3-audit-home.md
(Both VALIDATED the v3 design shape but returned the 8-item punch-list. Confirm v4 §v4-4 actually closes each item the way those audits demanded — and that it did not introduce a NEW bug while doing so.)

## Questions
1. D1 CANONICALITY INVARIANT (§v4-4.1, item 1 BLOCK): is the invariant "0 non-canonical D1 LMM rows after Step 8-D1" now LITERALLY TRUE, not merely asserted? Does normalizing EVERY non-canonical row (offset/Z re-render to UTC space-sep + naive-legacy-CT shift + HARD-FAIL on unprovable naive, NO ineligible-skip) actually make the unchanged raw-lexical `<` compare (`mutations.ts:896-906`) safe? Trace a `Z`-shaped row and a `-05:00`-offset row through the re-render — do they land byte-identical canonical UTC space-sep? Is the post-update SQL `LIKE`-based invariant check at §v4-4.1 SOUND (does it catch every non-canonical shape: `T`, `Z`, `z`, `+`, fractional `.`, AND a trailing negative offset), or can a non-canonical value slip past those LIKE clauses? Is the HARD-FAIL-on-unprovable genuinely fail-closed, or is there a path where an unprovable naive D1 row proceeds?
2. D1 CAS (§v4-4.1, item 2): does `WHERE id=? AND last_meaningful_movement=?` + changed-row==1 verification actually close the audit→write race against a Hub-side mutation? Is reading `meta.changes` (vs `rows_written`) from the wrangler `--json` output the correct field, and does the assert correctly halt on 0? Any race still open (e.g. a Hub mutation between the post-update invariant SELECT and daemons resuming)?
3. completed_at PARTITION (§v4-4.3, item 3): does adding `_COMPLETED_AT_SHIFT_ELIGIBLE_IDS`/`_INELIGIBLE_IDS` + the partition assert + eligible-only loop fully close the naive-Hub-origin-UTC corruption path (`mutations.ts:201`,`:914-918` → `hub.py:1349-1352`)? Is retiring Amendment B's "blanket shift safe because Task 7 unshipped" claim (plan:1723) correct — i.e. is the Hub-pull path that populates naive completed_at live TODAY independent of Task 7? Does Step 1b-completed_at's provenance method (cross-ref last_mutation_id + created_at) genuinely distinguish PB-CT from Hub-UTC?
4. CONVERTER PREFLIGHT (§v4-4.4, item 4): does running every eligible row through `_freeze_ct_naive_to_utc` and hard-failing on None close the silent-skip? Is dropping the `if out is not None` loop guard for eligible rows SAFE given the preflight (could a row become unconvertible between preflight and loop within the stopped-world window — no, but confirm)? Is the update-count == `len(eligible ∩ candidates)` assert correct, and does intersecting with candidates (not raw `len(eligible)`) correctly handle the cross-machine extra-eligible case from §v4-4.2?
5. PARTITION CONTRACT (§v4-4.2, item 5): is the coverage-only contract (overlap hard-fail + unclassified hard-fail + extra-classified logged-non-fatal) the RIGHT call given per-machine audits + cross-machine union, or should it be strict equality? Does the prose now match the code? Does logging `extra_classified` (vs raising) create a real hole where a typo'd PK silently does nothing — and is the NOTE sufficient mitigation? Does the contract apply uniformly to all three columns?
6. _is_naive + CONVERTER (§v4-4.9, item 9): does `s[-1:].upper() == "Z"` correctly reject BOTH `Z` and `z` without breaking any other shape? Does the no-seconds fallback (`%Y-%m-%d %H:%M` → `:00`) correctly handle `2026-05-22T15:53`, and does it NOT mis-accept a malformed value? Is `_is_naive()` now correct for ALL offset shapes (`+00:00`, `-05:00`, `Z`, `z`, `+0000`, fractional seconds, no-seconds)? Do the migration loop, the preflight, AND the D1 provenance audit all use ONE identical classifier?
7. ROLLBACK SNIPPET (§v4-4.8, item 8): does the corrected Task 5 `tasks` export (`SELECT id, slug, updated_at, completed_at, completed, status, seq, last_mutation_id, deleted_at FROM tasks`) now run without a rejected-column STOP? Are those columns ALL real `tasks` columns (cross-check `mutations.ts:198-211`)? Does the corrected RESTORE.md `tasks` UPDATE match? Does the `projects` export still correctly capture `last_meaningful_movement` so it is a real rollback for the §v4-4.1 D1 CAS writes? Is `mnccore-lab` the correct DB name everywhere (no remaining `pb-db`)?
8. STILL-MISSED (5th pass): anything across Tasks 5-9 + v4 not yet caught after four prior passes — new correctness / data-loss / ordering / coordination / concurrency bug? Specifically: (a) does the Step 8-D1 CAS write sit correctly inside Amendment C's stop-the-world window with daemons stopped on BOTH machines, so no D1 push/pull races it AND no PB write re-dirties LMM after the invariant assert? (b) does the in-window ordering (D1 CAS first, then brain.db 088 apply — or reverse?) matter for the Task-6 fail-closed pull gate or for the rebuild-from-Hub path? (c) does §v4-4.1's offset/Z re-render use a converter that honors the offset correctly (the frozen `_freeze_ct_naive_to_utc` only handles NAIVE-CT — what computes the UTC for an OFFSET/Z D1 row? Confirm the runbook specifies an offset-honoring conversion, not the CT converter, for offset/Z rows — a CT converter applied to an offset value would double-shift). (d) does Option A leave any OTHER D1 reader (Hub UI, rebuild-from-Hub, other mutations) comparing raw stored LMM anywhere the invariant doesn't cover? (e) any cross-machine gap where one machine has applied the D1 CAS write and the other has not yet pulled the comment-only `mutations.ts` change (comment-only → deploy ordering inert — confirm)? (f) six frozensets now ship empty — does the assert ordering (overlap → unclassified → extra → converter preflight → loop → count) fail in the right order, and does any column's assert depend on another's state?
9. VERDICT: with v4 §v4-4 (all 8 punch-list items resolved + the D1 canonicality invariant made literally true + rollback snippet fixed), is the design safe to IMPLEMENT (builder ships 088 + tests; hub-backend ships the comment edit + runs the in-window CAS wrangler step) then execute under the stop-the-world window — or still issues?

## Output (in order)
- Verdict (1 para: design-sound-ship-it / implement-with-amendments / still-block)
- Per-item closure table: for EACH of the 8 punch-list items (+ nit 9), state CLOSED / PARTIALLY-CLOSED / NOT-CLOSED with the file:line that proves it
- D1 canonicality invariant analysis: is it LITERALLY true now (cite §v4-4.1 + mutations.ts:896-906); trace a Z row + an offset row + an unprovable-naive row
- Partition + converter-preflight validation (cite §v4-4.2/§v4-4.3/§v4-4.4 + the migration `_is_naive`/converter at plan §v4-4.9)
- Rollback snippet validation (cite §v4-4.8 + mutations.ts:198-218 + wrangler.toml:6-9)
- NEW findings, 5th pass (file:line + mechanism + fix) — including the §v4-4.1 offset/Z converter question (8c)
- Risk-ordered top issues
- Final guidance (1-2 para)

Begin by reading the plan's Task 8 v4 §v4-4 section fully, then wrangler.toml, then the round-4 audit evidence, then the cited code. Synthesize. Return the deliverable only.

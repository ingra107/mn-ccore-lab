# Increment 1A Phase β — Task 8 v3 RE-AUDIT (run identically on work + home)

You are an independent reviewer doing the FOURTH pre-execution pass before an IRREVERSIBLE data migration. Prior passes: round 1 found 2 confirmed corruption bugs; round 2 (dual) found the amendment's value-cutoff fix was itself unsafe; round 3 (dual) BLOCKED v2 + Option B — both audits independently converged on Option A + a partition assert + a negative-offset candidate fix. The plan now carries **"Task 8 v3"** with **§v3-3** as the SOURCE OF TRUTH (every v3 banner forward-refs it). v3 encodes the three converged corrections:
1. **Option A** for the D1 legacy-LMM blocker — one-time in-window `wrangler d1 execute --remote` UPDATE of the audited PKs, KEEPING `advanceProjectMovement`'s atomic single-UPDATE compare UNCHANGED; `mutations.ts:110-115` becomes a comment-only accuracy edit (`next: hub-backend`). Option B is DEAD.
2. **Partition-completeness assert** (replaces v2's "populated OR candidate-count==0") — ship a second audited `*_INELIGIBLE_IDS` set per column; assert `candidates == eligible ∪ ineligible`, no overlap, hard-fail on any unclassified candidate.
3. **Negative-offset fix** — candidate collection in Python via `_is_naive()`, NOT SQL `NOT LIKE '%+%' AND NOT LIKE '%Z'` (which misses `-05:00`-offset rows).

Your job: validate v3 §v3-3 AND catch anything STILL missed after three prior passes. Tasks 1-4 LIVE. Execution is DEFERRED — this is design validation, but be as rigorous as if it runs tomorrow.

## Hard rules
1. DO NOT run `rg --files`, `find .`, `Get-ChildItem -Recurse`. Orientation list is complete.
2. Read with `rg -n '^' <path>` ONLY (sandbox = Windows PowerShell; `cat -n` fails). Scoped `rg <pattern> <path>` on listed files is fine. One file per read.
3. Cite file:line for every concrete claim.
4. No politeness filter. Name what breaks. Do NOT rubber-stamp a converged decision — your job is to find the way it is still wrong.
5. One pass: read, synthesize, stop.

## Scope
RUN codex from the Peripheral-Brain repo root (cwd). PB files cwd-relative (`scripts/...`); Hub files via `../mn-ccore-lab/...`. Resolves identically on work (ingra107) + home (ingra). No machine-absolute paths.

## Orientation files
- ../mn-ccore-lab/docs/superpowers/plans/2026-05-23-increment-1A-time-sync-foundation.md  (read the **Task 8 v3 §v3-3** section in FULL — it is the source of truth; v2 + Amendment B + Option B are marked SUPERSEDED/DEAD, read them only for context)
- scripts/db/outbox.py            (to_utc_dt, _freeze_ct_naive_to_utc converter, _is_naive, _UTC/_CT columns, origin=hub parser ~:251-253, client_ts writers ~:767/:2067)
- scripts/db/query.py             (LMM/completed_at writers :1185/:1236/:1341 — still CT until Task 8)
- scripts/db/sync/drivers/hub.py  (Task 6 gates + shadow :120-123; tombstone discriminators)
- scripts/db/sync/operations.py   (EXPECTED_MIN_MIGRATION :43; schema gate :492-536)
- ../mn-ccore-lab/api/routes/mutations.ts  (advanceProjectMovement :836-909; the atomic MAX compare :896-906; normalizeToUtcSpaceSep :157; ctOffsetMinutesAt :123; the :110-115 comment slated for the comment-only accuracy edit)

## Converged audit evidence (the two round-3 audits this v3 answers)
- data/shared/codex-beta-v2-audit-work.md
- data/shared/codex-beta-v2-audit-home.md
(Both returned still-block on v2+Option B and converged on the three v3 corrections. Confirm v3 §v3-3 actually implements what those audits demanded — and that it did not introduce a NEW bug while doing so.)

## Questions
1. OPTION A SOUNDNESS (§v3-3.1): is the one-time in-window `wrangler d1 execute --remote` UPDATE of the audited PKs correct AND complete? Does keeping `advanceProjectMovement`'s atomic single-UPDATE compare UNCHANGED (`mutations.ts:896-906`) actually work post-migration — i.e. once every stored D1 LMM is canonical UTC space-sep, is the lexical `<` a correct AND race-safe temporal compare? Is the per-row provenance audit (classify in Python via `_is_naive()`, shift only proven pre-T4 legacy-CT) genuinely fail-closed? Any way an already-canonical or post-T4 D1 row enters the UPDATE allowlist? Is the Task-5 D1 export a sufficient rollback for this write? Is the `mutations.ts:110-115` comment-only edit accurate under Option A, and does leaving the CODE unchanged close finding 1 (double-shift) AND finding 2 (lost-update race) AND finding 3 (mixed arbiter) from round 3?
2. PARTITION ASSERT (§v3-3.2): does `candidates == eligible ∪ ineligible` (no overlap, hard-fail on unclassified) actually close the "partial allowlist silently leaves rows wrong" hole? Does it gate EVERY UPDATE path (updated_at AND LMM)? Can the migration apply with any unclassified candidate? Does it correctly handle the all-empty / zero-candidate case? Is consuming the ineligible set ONLY in the assert (not in the loop) sound, or does that create a drift class where the loop and the assert disagree? Are the four regression tests (a-d) sufficient?
3. NEGATIVE-OFFSET FIX (§v3-3.3): does computing candidates in Python via `_is_naive()` (instead of SQL `NOT LIKE '%+%' AND NOT LIKE '%Z'`) fully fix the `-05:00` misclassification (round-3 finding 5)? Is `_is_naive()` (`outbox.py` / the migration copy at plan:1302-1308) itself correct for ALL offset shapes (`+00:00`, `-05:00`, `Z`, `+0000`, fractional seconds, no-seconds)? Does the migration UPDATE loop and the preflight now use ONE identical classifier with no remaining divergence?
4. STILL-MISSED (4th pass): anything across Tasks 5-9 + v3 not yet caught — new correctness / data-loss / ordering / coordination / concurrency bug? Specifically: (a) does the Step 8-D1 wrangler write sit correctly inside Amendment C's stop-the-world window with daemons stopped on BOTH machines, so no D1 push/pull races it? (b) is the `completed_at` blanket-shift still correct under v3? (c) does the in-window D1 write + brain.db apply ordering (D1 first or brain.db first?) matter for the Task-6 fail-closed pull gate? (d) does Option A leave any OTHER D1 reader (Hub UI, rebuild-from-Hub, other mutations) comparing raw stored LMM anywhere? (e) is there any cross-machine gap where one machine applies Option A's D1 write and the other has not yet pulled the comment-only `mutations.ts` change (it is comment-only, so deploy ordering should be inert — confirm)?
5. VERDICT: with v3 §v3-3 (Option A + partition assert + Python `_is_naive()` candidate collection), is the design safe to IMPLEMENT (builder ships 088 + tests; hub-backend ships the comment edit + runs the in-window wrangler step) then execute under the stop-the-world window — or still issues?

## Output (in order)
- Verdict (1 para: design-sound-ship-it / implement-with-amendments / still-block)
- Option A soundness analysis (cite plan §v3-3.1 + mutations.ts :896-906/:110-115)
- Partition assert + candidate-collection validation (cite plan §v3-3.2/§v3-3.3 + the migration `_is_naive` at plan:1302-1308)
- Confirmation the three round-3 findings (double-shift, lost-update race, partial allowlist) are CLOSED — or, if not, exactly where they survive
- NEW findings (file:line + mechanism + fix)
- Risk-ordered top issues
- Final guidance (1-2 para)

Begin by reading the plan's Task 8 v3 §v3-3 section fully, then the round-3 audit evidence, then the cited code. Synthesize. Return the deliverable only.

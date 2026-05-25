# Increment 1A Phase β — Task 8 v2 RE-AUDIT (run identically on work + home)

You are an independent reviewer doing the THIRD pre-execution pass before an IRREVERSIBLE data migration. Round 1 found 2 confirmed corruption bugs; round 2 (dual) found the amendment's fix was itself unsafe + a missed D1 blocker. The plan now carries **"Task 8 v2"** (commit `3477133b`) which: replaced the LMM value-cutoff with an audited `_LMM_SHIFT_ELIGIBLE_IDS` allowlist + Step-1b provenance audit; added a preflight ASSERT (populated OR candidate-count==0); and chose **Option B** for the D1 legacy-LMM blocker — normalize the stored operand in `advanceProjectMovement` before the MAX compare (Hub already ships `normalizeToUtcSpaceSep`). Your job: validate v2 + Option B AND catch anything STILL missed after two prior passes. Tasks 1-4 LIVE. Execution is DEFERRED — this is design validation, but be as rigorous as if it runs tomorrow.

## Hard rules
1. DO NOT run `rg --files`, `find .`, `Get-ChildItem -Recurse`. Orientation list is complete.
2. Read with `rg -n '^' <path>` ONLY (sandbox = Windows PowerShell; `cat -n` fails). Scoped `rg <pattern> <path>` on listed files is fine. One file per read.
3. Cite file:line for every concrete claim.
4. No politeness filter. Name what breaks.
5. One pass: read, synthesize, stop.

## Scope
RUN codex from the Peripheral-Brain repo root (cwd). PB files cwd-relative (`scripts/...`); Hub files via `../mn-ccore-lab/...`. Resolves identically on work (ingra107) + home (ingra). No machine-absolute paths.

## Orientation files
- ../mn-ccore-lab/docs/superpowers/plans/2026-05-23-increment-1A-time-sync-foundation.md  (read the `## CODEX AMENDMENTS` + the **Task 8 v2** section in full; the v2 section is the source of truth, the cutoff is marked SUPERSEDED)
- scripts/db/outbox.py            (to_utc_dt, _freeze_ct_naive_to_utc converter, _UTC/_CT columns, client_ts writers)
- scripts/db/query.py             (LMM/completed_at writers :1185/:1236/:1341 — still CT until Task 8)
- scripts/db/sync/drivers/hub.py  (Task 6 gates + shadow :120-123)
- scripts/db/sync/operations.py   (EXPECTED_MIN_MIGRATION :43; schema gate :492-536)
- ../mn-ccore-lab/api/routes/mutations.ts  (advanceProjectMovement :836-909; normalizeToUtcSpaceSep :157; ctOffsetMinutesAt :123; MAX compare :896-906; the :110-115 comment about Task-8 migrating legacy LMM)

## Questions
1. v2 ALLOWLIST: is `_LMM_SHIFT_ELIGIBLE_IDS` + the Step-1b provenance audit a correct + complete replacement for the cutoff? Does the audit logic correctly classify pre-T4 vs post-T4 naive, and is the post-T4 path truly fail-closed (skip unless proven legacy)? Any way an UTC row enters the allowlist, or a legacy-CT row is silently dropped?
2. PREFLIGHT ASSERT: does "populated OR candidate-count==0" actually gate every UPDATE path (updated_at AND LMM)? Can the migration apply with an empty allowlist while candidates exist?
3. OPTION B (D1): is normalizing the stored operand in `advanceProjectMovement` before the MAX compare SOUND + COMPLETE? Does `normalizeToUtcSpaceSep` (mutations.ts:157) DST-correctly handle the legacy naive-CT stored values? Does normalize-on-compare actually kill the lexical-compare class, or are there read paths that still compare raw stored LMM? Does it leave D1 stored values mixed-format in a way that breaks anything else (rebuild-from-Hub, other readers)? Compare against Option A (one-time D1 row migration) — is B genuinely safe + sufficient?
4. STILL-MISSED (3rd pass): anything across Tasks 5-9 + v2 not yet caught — new correctness/data-loss/ordering/coordination bug? Is the `completed_at` blanket-shift still correct under v2? Does the 44-vs-43 ISO-T count or the empty `_ISO_T_SHIFT_ELIGIBLE_IDS` create a gap?
5. VERDICT: with v2 + Option B, is the design safe to IMPLEMENT (hub-backend writes Option B) then execute under the stop-the-world window — or still issues?

## Output (in order)
- Verdict (1 para: design-sound-ship-it / implement-with-amendments / still-block)
- v2 allowlist + preflight validation (cite plan v2 section + live code)
- Option B soundness analysis (cite mutations.ts)
- NEW findings (file:line + mechanism + fix)
- Risk-ordered top issues
- Final guidance (1-2 para)

Begin by reading the plan's Task 8 v2 section fully, then the cited code. Synthesize. Return the deliverable only.

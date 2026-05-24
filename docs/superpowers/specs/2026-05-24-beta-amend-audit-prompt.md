# Increment 1A Phase β — POST-AMENDMENT dual audit (run identically on work + home)

You are an independent reviewer doing the FINAL gate before an IRREVERSIBLE data migration. A first codex pass found two CONFIRMED data-corruption bugs; the plan now carries a `## CODEX AMENDMENTS (2026-05-24 ...)` section (A: Task 5 snapshot SQL, B: Task 8 LMM provenance cutoff guard, C: global stop-the-world). This SECOND pass: validate those fixes AND catch anything still missed. Tasks 1-4 are DONE + LIVE. About to execute Task 5 (dual snapshot) -> 6 (flip 3 LWW gates fail-closed) -> 7 (client_ts->UTC) -> 8 (one atomic CT->UTC migration; migration 088) -> 9 (delete scaffold). The snapshot is the ONLY rollback for Task 8.

## Hard rules
1. DO NOT run `rg --files`, `find .`, `Get-ChildItem -Recurse`. Orientation list is complete.
2. Read files with `rg -n '^' <path>` ONLY (sandbox = Windows PowerShell; `cat -n` fails). Scoped `rg <pattern> <path>` on listed files is fine. One file per read command.
3. Cite file:line for every concrete claim. No vibes.
4. No politeness filter. Name what breaks. Deletions are wins.
5. One pass: read, synthesize, stop.

## Scope
PB at ~/Peripheral-Brain. Hub at ~/mn-ccore-lab. Read via absolute path; reads need no --add-dir. (Your cwd is whichever repo you launched from — resolve the other by absolute path.)

## Orientation files
PLAN (read first, fully — INCLUDING the `## CODEX AMENDMENTS` section at the end):
- ~/mn-ccore-lab/docs/superpowers/plans/2026-05-23-increment-1A-time-sync-foundation.md
PB code:
- ~/Peripheral-Brain/scripts/db/sync/drivers/hub.py    (Task 6 gates :1278/:1861/:2002 + shadow blocks)
- ~/Peripheral-Brain/scripts/db/outbox.py              (to_utc_dt, now_instant/now_instant_wire, _UTC_COLUMNS/_CT_COLUMNS/_CT_ORIGINS, client_ts writers ~:767/:2067)
- ~/Peripheral-Brain/scripts/db/query.py               (Task 8 LMM/completed_at writers :1185/:1236/:1341)
- ~/Peripheral-Brain/scripts/db/sync/operations.py     (EXPECTED_MIN_MIGRATION :43; schema gate :492-532; Bug-2 :920)
- ~/Peripheral-Brain/scripts/db/timez.py
- ~/Peripheral-Brain/scripts/db/backfill_last_meaningful_movement.py
- ~/Peripheral-Brain/scripts/db/sync/records.py
Hub code:
- ~/mn-ccore-lab/api/routes/mutations.ts   (Task 4 normalizer + advanceProjectMovement :100-180/:777-909; TABLE_FIELDS :197-219; processed insert :1081-1085)
- ~/mn-ccore-lab/src/lib/time.ts

## Facts established by the COO (verify, do not just trust)
- Task 4 LIVE since 2026-05-23 19:22 UTC (commit d9398a83). It writes projects.last_meaningful_movement as NAIVE space-sep UTC (mutations.ts:178 -> "YYYY-MM-DD HH:MM:SS", no Z).
- last_meaningful_movement + stale_active_since are PROJECTS columns, not tasks (mutations.ts:217; brain.db PRAGMA).
- brain.db is .stglobalignore'd (per-machine; convergence is semantic via Hub D1, NOT Syncthing file-sync).

## Questions
1. AMENDMENT A: is the corrected Task 5 `tasks` export/restore SQL (drop last_meaningful_movement, stale_active_since) now valid against the real tasks schema/contract? Any OTHER plan SQL that references project-only columns on tasks (or vice-versa)?
2. AMENDMENT B (the critical one): is the LMM cutoff guard `_freeze_ct_naive_to_utc(lmm) <= "2026-05-23 19:22:00"` a SOUND separator of legacy-CT from Task-4-UTC LMM? Stress every edge: DST boundary, a legacy CT value written in the deploy minute, a Task-4 UTC value at/just after 19:22 UTC, NULL/empty, already-offset/Z, a value that is neither clean CT nor clean UTC. Does it EVER shift a true-UTC value (corruption) or skip a true-legacy-CT value (leaves mixed-format)? Is a value-based cutoff better/worse than an audited id allowlist here? Is `completed_at` correctly exempt (its UTC writer Task 7 ships inside the stopped window)?
3. AMENDMENT C: is global stop-the-world (both daemons stopped before any 088, both resume only after both verified) sufficient to close the shared-Hub-D1 race, or is there still a window?
4. STILL-MISSED: anything across Tasks 5-9 the amendments did NOT address — new correctness/data-loss/ordering bug? Are the Task 6 gate flips genuinely fail-closed on EVERY ambiguous/missing/unparseable path? Is `_ISO_T_SHIFT_ELIGIBLE_IDS` empty-by-default a problem (43 rows never migrate)?
5. VERDICT: with A/B/C applied, is it now safe to execute 5->9 tonight, or still block?

## Output (in order)
- Verdict (1 para: execute-as-amended / execute-with-further-amendments / still-block)
- Amendment validation (A / B / C — each: correct+complete? cite plan section + live code)
- LMM cutoff guard edge-case analysis (B — enumerate the edges, pass/fail each)
- NEW findings the amendments missed (file:line + mechanism + fix)
- Fail-closed completeness check (Task 6 gates)
- Risk-ordered top issues
- Final guidance (1-2 para)

Begin by reading the plan fully (incl. CODEX AMENDMENTS), then the cited code. Synthesize. Return the deliverable only — no progress narration.

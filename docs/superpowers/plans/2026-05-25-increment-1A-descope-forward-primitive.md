# Increment 1A — DESCOPE to the forward primitive (decision 2026-05-25)

> **Supersedes Tasks 8 + 9** of `2026-05-23-increment-1A-time-sync-foundation.md` (the historical-rewrite half). Decision: ship the forward controls, DROP the ~900-row historical migration. Basis: three independent reads converged — work codex strategic eval, home dual codex, COO. Evidence bundle: `~/Peripheral-Brain/Scratch/codex-1a-eval-2026-05-25/` (codex verdict archived: `~/tmp/codex-1a-eval-last.md`).

## Why (the evidence that broke the original model)
- **Step-0 live audit:** brain.db has **~900 naive candidates/machine**, NOT the 2-3 the v5 "hand-classify" model assumed (that was the D1 side). Counts: `completed_at` work 818 / home 731; `updated_at` (ISO-T) 45 / 66; `lmm` 64 / 1. The per-PK allowlist model can't scale; the partition assert hard-fails until every candidate is classified.
- **lmm is a phantom on the canonical store:** Hub D1 (canonical) = **3** non-null lmm; home = 2 (matches canonical, just stale); **work = 64, all `sync_status='synced'` but never pushed** — local `backfill_last_meaningful_movement.py` artifacts. `sync_status='synced'` is row/cache state, **not** field-level Hub parity. Migrating work's 64 = blessing local phantoms (work even has fewer projects than canonical: 80 < 93).
- **completed_at (~800)** is NOT in the LWW gates and is dominated by Airtable-era bulk-import duplicate stamps (176×, 67× identical) → rewriting it is ceremony with ~zero arbitration benefit.
- **Concern 3b:** the manual ineligible-classification is load-bearing and can silently leave a misclassified-CT row 5h-wrong AND pass the exact-shape invariant invisibly.
- **Codex verdict:** "Full 1A as built is over-engineered for the real primitive… trying to make historical dirt clean by ceremony. Keep the forward controls. Reconcile work. Migrate only genuinely canonical/arbitrating rows."

## KEEP / SHIP — the forward primitive (the real bleed-stop)
- **Task 4** — Hub `advanceProjectMovement` churn fix. **ALREADY SHIPPED to main.**
- **Task 6** — 3 LWW pull-gates fail-closed (branch `feature/inc1a-beta-pb` commit `cc9f777b`).
- **Task 7** — PB `client_ts` → explicit UTC (commit `c98d5c07`).
- **Pull-apply `now_instant` fix** — both `tasks.updated_at` write sites in `hub.py` (commit `9489d3d5`).
- **PB writer guard** — `update_project()` normalize-or-reject for LMM/stale (in branch `query.py`).
- **Hub `applyPatch` forward guard** — branch `feature/inc1a-hub-forward-guard` (`dfbb2c39`, NORMALIZE).
- **Task 10** backfill quarantine — **ALREADY on base** (`e2553799`).

## DROP
- **Task 8** — the 900-row historical migration: `088_normalize_timestamps_utc.py` + per-PK allowlists + manual classification + exact-shape invariant edifice. The migration file + its tests STAY on the branch as a record; **NOT merged**.
- **Task 9 AS-BUILT** — scaffold deletion + `_CT`→`_UTC` column move (commit `0a4a5fb7`).
  - 🛑 **Critical (codex): do NOT ship Task 9 without Task 8.** Task 9 deletes the CT-guessing scaffold and classifies `last_meaningful_movement`/`completed_at` as UTC, so a legacy naive-CT value would then parse **as UTC** (5h wrong) and arbitrate. "Drop-8-keep-9" is corrupt-by-design. Leave the scaffold + `_CT_COLUMNS` membership at status quo.

## DEPENDENCY CHECK — run BEFORE merging the keep-set
Verify **Task 6's gate flip** (`hub.py` `cc9f777b`) does NOT assume Task 8's `_CT`/`_UTC` column-set move is live. Read the gate's origin-aware compare + `outbox.py` `_CT_COLUMNS`/`_UTC_COLUMNS` membership; confirm Task 6 is correct against the **status-quo** classification (LMM/completed_at still in `_CT_COLUMNS`). If Task 6 implicitly requires the UTC classification, ship it WITH the gate-harden (below), not alone.

## FOLLOW-UP (separate tasks, not blocking the ship)
1. **Reconcile work brain.db → Hub canonical** (3-store playbook `Context/Topics/cross-machine-convergence-playbook.md`): work carries 64 phantom lmm + is behind on project pulls (80 < 93). Pull canonical, reconcile the 64 local lmm to Hub's 3. **Never force-push work over Hub.** Also investigate WHY the backfill's writes never pushed (raw-SQL bypass of the outbox? lmm not on the push field-set?) — that's a real sync-integrity gap.
2. **(Optional, principled) Gate-harden** — make `to_utc_dt` / the LWW gate fail-closed (reject/skip) on non-canonical naive **legacy** `last_meaningful_movement`/`completed_at`, so legacy rows can't mis-arbitrate. THIS is the safe way to eventually retire the zone-guessing scaffold WITHOUT a 900-row migration — the principled replacement for Tasks 8+9.

## Execution (fresh session)
- Run the dependency check, then cherry-pick the keep-set onto main (or re-apply as a clean small PR).
- Full integration suite green (two-pass).
- Keep the migration branch (`feature/inc1a-beta-pb`, tip `1748da73`) + the codex bundle as the record; do not delete.

## Provenance
- Original plan + audit history: `2026-05-23-increment-1A-time-sync-foundation.md` (Tasks 1-7 + 10 stand; Tasks 8-9 superseded here).
- Built branches: PB `feature/inc1a-beta-pb` @ `1748da73`; Hub `feature/inc1a-hub-forward-guard` @ `dfbb2c39`.
- This descope earned its keep: the dual-audit + the "are we over-engineering" step-back caught a risky 900-row migration aimed at phantom/artifact data before it ran against an irreversible store.

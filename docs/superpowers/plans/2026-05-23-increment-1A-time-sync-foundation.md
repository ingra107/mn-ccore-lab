# Increment 1A — Time/Sync Foundation (DATA-RISK CORE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch domain specialists per task: **builder** (PB `scripts/db/*`, migrations, lint) and **hub-backend** (`api/routes/mutations.ts`, deploy). Builder cannot edit `mutations.ts` directly — those steps return "next: dispatch hub-backend" to the COO.

**Goal:** Store every synced timestamp instant in UTC and enforce it with origin-aware LWW gates + a CI lint, so the live Hub LMM-churn bug dies, mixed-zone columns are migrated to UTC under one snapshot, and the `to_utc_dt` zone-guessing scaffold can be deleted.

**Architecture:** Build canonical time-helper chokepoints (PB `timez.py`, Hub `src/lib/time.ts`) + a WARN-mode CI lint; fix the Hub `advanceProjectMovement` read-modify-write normalizer (kills the live churn bug, independent deploy); snapshot BOTH stores; flip the 3 LWW pull-gates to fail-closed ENFORCE; cut PB `client_ts` to explicit-UTC; run ONE atomic legacy data migration (LMM + 43 ISO-T `updated_at` + `completed_at` CT→UTC) that flips the writers and reader-contract together; then delete the scaffold and flip the lint to ERROR. All data-risk steps run under a snapshot valid for hours, with relay-confirm gating both machines.

**Tech Stack:** Python 3.10+ (PB, `scripts/db/`), TypeScript + Hono v4.12 + Cloudflare D1 (Hub `api/routes/`), SQLite (`data/brain.db`), pytest (`tests/sync/`, `tests/db/`), Vitest (`api/routes/*.test.ts`), wrangler (deploy + D1 export).

**Verified against:** PB HEAD `d4036d7b`, Hub HEAD `799ee275` (this session, 2026-05-23). All file:line citations below were re-grepped against HEAD per the writing-plans pre-write rule; the source plans' citations were 80-150 lines stale and have been corrected. See "Verified citation spine" appendix.

**Post-review amendment (2026-05-23, Codex pre-execution review verdict: block-and-rework):** Tasks 4, 5, 6, 8 + four smaller findings were amended after re-verifying each against live code. The load-bearing corrections: (1) Task 8 migration now uses a FROZEN internal `ZoneInfo("America/Chicago")` converter (NOT the mutable `to_utc_dt` classifier — which would read historical CT as UTC post-flip and never shift it, the R1 trap) + a stopped-world Step 0 preflight; (2) Task 4 keeps the live ATOMIC single-UPDATE CASE compare (the original SELECT-then-write introduced a lost-update race), changing only the value to UTC-normalized; (3) Task 5 D1 export uses the REAL `processed_mutations` columns (`mutation_id, origin_machine, processed_at, outcome, table_name, record_id` — NOT the non-existent `last_mutation_id, seq`), full table (no LIMIT), scripted+rehearsed restore; (4) Task 6 task gate is now fail-closed on missing/unparseable local timestamp; (5) migration entrypoint is `def upgrade(conn)` (auto-runner contract) numbered `088` (high-water is 087, not 062); (6) the `now_instant_wire` circular import is resolved by defining the minters in `outbox.py` and re-exporting from `timez.py`; (7) Task 9 test now targets the real behavior-change (the `_CT_ORIGINS` client_ts branch deletion — an unknown column already raises today, and post-Task-8 the CT columns are in `_UTC_COLUMNS`, so neither captures the change); (8) Hub CI lint is a stdlib-only Hub-local mirror, not a `|| true` no-op against an absent PB checkout.

**Scope boundary (1A vs 1B):** This plan is the DATA-RISK CORE (spec §2.1-9). It does NOT migrate the ~91 Hub frontend display sites (`new Date().toISOString()` ×50, `.toISOString().split|slice` ×41) or the server-side `generate_today_markdown.py` / `scripts/today/sections.py` viewer-local conversion — those are Plan 1B, which consumes the helper API 1A defines (`formatLocal`, `todayCivil`, `format_local`, `today_civil`). 1A SHIPS those helpers but only adopts them at the sync-write sites.

---

## Cross-plan invariants (spec §3 — NEVER violate)

1. **All LWW gate flips are fail-CLOSED.** Ambiguous/unparseable timestamp on either side → SKIP the apply, never apply. A `ZoneContractError`/None from `to_utc_dt` is a skip signal, logged, never a silent guess.
2. **Cross-repo lockstep.** Hub handoff spec filed to `data/shared/hub-schema-changes.jsonl` BEFORE PB stops sending CT `client_ts`. Decision doc + `shared-schema-registry.md` updated in lockstep.
3. **NEVER combine this timestamp migration with the Increment 2 timeline `description` migration** — two independent data-risk axes in one rollback is forbidden. Separate snapshots, separate windows.
4. **Hub D1 is the synced-state arbiter; brain.db is local PB cache + PB-only fields.** Do not let the migration invent a brain.db field Hub doesn't accept (it would 400 at `/api/mutations`).

## Snapshot doctrine (spec §2.3, Codex-validated against Opus-LWW)

The single contradiction in the review wave was resolved AGAINST Opus-LWW's "reject snapshot": the LWW gate arbitrates exactly the columns (`updated_at`, `last_meaningful_movement`, `completed_at`) whose prior value is **unrecoverable in place** — `audit_log` stores only `payload_hash` (`query.py:314`), CRDT `field_timestamps` stores only `value_hash` + `ON CONFLICT DO UPDATE` latest-only (`crdt.py:185,253`), and `events` logs `new_value` but never the timestamp columns. So a snapshot IS the rollback mechanism for the data-migration step. It is **snapshot → flip → watch → discard-or-restore-fast** (valid for HOURS, not snapshot-and-forget): restoring a stale snapshot clobbers real team writes, so the watch window is short and the restore is fast-or-never.

BUT Opus-LWW's fail-toward-skip insight is adopted into the gate flip (Task 4) and the Hub normalizer (Task 2) as defense-in-depth: the gate fails closed and the Hub LMM compare is fixed by-construction (read-modify-write), so the snapshot is the backstop, not the only control.

---

## File Structure

**PB (`~/Peripheral-Brain/`):**
- Create: `scripts/db/timez.py` — canonical time chokepoint (re-exports `outbox.to_utc_dt` + `now_instant`/`now_instant_wire`; defines `format_local`, `today_civil`).
- Modify: `scripts/db/outbox.py` — Task 1: ADD `now_instant()`/`now_instant_wire()` defs (so `timez` re-exports + Task-7 writers call locally, no cycle). Task 7: `client_ts` writers (`:745`, `:2045`) to `now_instant_wire()`. Task 8: move `last_meaningful_movement`+`completed_at` to `_UTC_COLUMNS`, empty `_CT_COLUMNS`. Task 9: delete `_CT_COLUMNS`/`_CT_ORIGINS` guessing branches (`:160-172`, `:254-261`).
- Modify: `scripts/db/check_sync_antipatterns.py` — add time rules R20-R23 (NOT R10-R13; R10 already exists), reuse the `PB_LINT_MODE=warn|enforce` mechanism at `:631`; generalize the `:694` warn-summary label.
- Modify: `scripts/db/sync/drivers/hub.py` — flip 3 pull-gates (`:1278`, `:1861`, `:2002`) to origin-aware fail-closed enforce.
- Modify: `scripts/db/query.py` — LMM/completed_at writer flip (`:1185`, `:1236`, `:1341`, `:1240`; verify `:2922`).
- Modify: `scripts/db/sync/operations.py` — `:920` fix latent Bug-2 second freshness-guard caller; `:43` bump `EXPECTED_MIN_MIGRATION` to `088_normalize_timestamps_utc` (Task 8 commit).
- Modify: `scripts/db/backfill_last_meaningful_movement.py` — quarantine (refuse-to-run post-cutover guard).
- Modify: `scripts/db/sync/records.py:159-176` — delete `local_time_is_localtime` localtime path at the end.
- Create: `scripts/db/migrations/088_normalize_timestamps_utc.py` — the one legacy migration (entrypoint `def upgrade(conn)`; frozen internal CT→UTC converter, NOT `to_utc_dt`).
- Create: `scripts/db/restore_d1_snapshot.py` — scripted D1 rollback from the Task 5 JSON exports.
- Modify: `Context/Topics/shared-schema-registry.md` — register the per-column zone contract.
- Create: `data/shared/hub-schema-changes.jsonl` — Hub handoff spec (first line).
- Create: `Context/Decisions/2026-05-23-increment-1A-timestamp-utc-cutover.md` — decision doc.

**Hub (`~/mn-ccore-lab/`):**
- Create: `src/lib/time.ts` — `Instant`/`CivilDate` brands, `nowInstant`, `formatLocal`, `todayCivil`, server-OS-zone resolution.
- Modify: `api/routes/mutations.ts:780-808` — `advanceProjectMovement` read-modify-write normalizer.
- Modify: `api/routes/mutations.advance-project.test.ts` — churn-bug regression tests.
- Modify: `.github/workflows/schema-drift.yml` — add Hub-side time-lint step.

**Snapshot artifacts (gitignored, machine-local):**
- `data/snapshots/2026-05-23-increment-1A/` — brain.db copy + `-wal`/`-shm` + D1 export JSON.

---

## Phase / Task map (10 tasks)

| Task | Phase (spec §2) | Repo | Ship-risk | Depends on |
|---|---|---|---|---|
| 1 | §2.1 Canonical helpers (PB `timez.py`) | PB | A | — |
| 2 | §2.1 Canonical helpers (Hub `time.ts`) | Hub | A | — |
| 3 | §2.1 CI lint WARN mode (R20-R23) | PB + Hub | A | 1, 2 |
| 4 | §2.2 Hub `advanceProjectMovement` normalizer | Hub | B (deploy) | 2 |
| 5 | §2.3 Snapshot/restore runbook (both repos) | PB + Hub | C (relay) | — (run just before 6) |
| 6 | §2.4 Flip 3 LWW pull-gates to fail-closed ENFORCE | PB | C (relay) | 5 |
| 7 | §2.5 PB `client_ts` → explicit-UTC + Hub handoff spec | PB | B (lockstep) | 4 live, 5 |
| 8 | §2.6 ONE atomic legacy UTC migration (LMM + 43 rows + completed_at) | PB | C (relay, under snapshot) | 5, 6, 7 |
| 9 | §2.7 Delete zone-guessing scaffold + lint WARN→ERROR + retire shadow | PB | B (sequenced after 8) | 8 |
| 10 | §2.8 Hygiene/hazards (registry, operations.py:920, backfill quarantine) | PB | A (mostly) | — (interleave; backfill quarantine BEFORE 8) |

**Ship-risk legend:** **A** = independent, ship-on-green, no flag, pure addition. **B** = sequenced-after-X, rollback by revert. **C** = concrete data-risk staged under snapshot + relay-confirm, named failure mechanism + restore path.

**Relay-confirm points:** Task 5 (snapshot must exist on BOTH machines before any flip), Task 6 (both machines flip in the SAME sync generation, else one enforces and one doesn't → transient divergence), Task 8 (data migration — see below). Use the `cross-machine-relay` skill, Migration & state-change confirmation section, for all three.

> **Task 8 must NOT rely on passive "peer auto-applies at session-start" (Codex finding).** For a lossy data migration the code+contract can land on machine A and be live (writers flipped, column-set moved) while machine B's brain.db is still un-migrated until its next session-start runs `auto_run_migrations` — a window where B's gates read A-pushed UTC against B's still-CT on-disk data. Mitigations baked into Task 8: (a) `EXPECTED_MIN_MIGRATION` bump makes B's sync REFUSE against the un-migrated DB rather than corrupt (fail-safe direction); (b) each machine runs its OWN Step 0 stopped-world preflight + Step 7 rehearsal + applies under its OWN fresh snapshot; (c) explicit relay-confirm that BOTH machines have applied + converged (`sync.py status --verbose` diff = 0) BEFORE the WATCH window closes and snapshots are discarded. Do not let machine B silently catch up via passive session-start for this class.

---

## Task 1: PB canonical time chokepoint — `scripts/db/timez.py`

**Specialist:** builder. **Ship-risk: A** (pure addition; no caller yet; rollback = delete the file + the two outbox.py functions).

> **CIRCULAR-IMPORT SEQUENCING (Codex smaller finding):** because `timez.py` re-exports `now_instant`/`now_instant_wire` FROM `outbox.py` (the definitions must live in `outbox.py` so that `outbox.py`'s Task-7 writers can call them without importing `timez` — which would cycle), Task 1 MUST add those two function definitions to `outbox.py` in the SAME commit as creating `timez.py`. They are pure additions to `outbox.py` (no caller yet until Task 7), so this stays Ship-risk A. Do NOT defer the `outbox.py` definitions to Task 7 — the Task 1 `timez.py` re-export would `ImportError` at import time.

**Files:**
- Modify: `scripts/db/outbox.py` — ADD `now_instant()` + `now_instant_wire()` defs (near `to_utc_dt`). Pure addition.
- Create: `scripts/db/timez.py` (re-exports `to_utc_dt`, `ZoneContractError`, `now_instant`, `now_instant_wire` from `outbox.py`; defines `format_local`, `today_civil`).
- Test: `tests/db/test_timez.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/db/test_timez.py
from datetime import datetime, timezone
import re
from scripts.db import timez


def test_now_instant_is_utc_space_sep():
    s = timez.now_instant()
    # "2026-05-23 18:04:11" — UTC, space-sep, no tz suffix, matches updated_at on-disk shape
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", s), s
    # It must be ~now in UTC, not local.
    parsed = datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    delta = abs((datetime.now(timezone.utc) - parsed).total_seconds())
    assert delta < 5, f"now_instant drifted from UTC now by {delta}s"


def test_now_instant_wire_is_explicit_utc():
    s = timez.now_instant_wire()
    # "2026-05-23T18:04:11+00:00" — ISO-T, explicit offset (branch-1 honored downstream)
    assert s.endswith("+00:00"), s
    assert "T" in s


def test_to_utc_dt_reexported():
    # timez re-exports the canonical reader so there's one import surface.
    assert timez.to_utc_dt is not None
    got = timez.to_utc_dt("2026-05-23T16:11:46+00:00")
    assert got.tzinfo is not None
    assert got.utcoffset().total_seconds() == 0


def test_today_civil_default_zone():
    # YYYY-MM-DD in the machine's OS-local zone (server-side viewer zone).
    s = timez.today_civil()
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", s), s


def test_format_local_renders_instant_in_zone():
    # Instant (UTC) → human string in an explicit zone.
    out = timez.format_local("2026-05-23 18:04:11", zone="America/Chicago")
    assert "2026" in out
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/db/test_timez.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.db.timez'`.

- [ ] **Step 3: Write minimal implementation (TWO files)**

First, ADD to `scripts/db/outbox.py` (near `to_utc_dt`, so `timez` can re-export and the Task-7 writers can call locally — no cycle):

```python
# scripts/db/outbox.py — pure addition (no caller until Task 7)
def now_instant() -> str:
    """UTC instant, space-sep, no tz suffix: '2026-05-23 18:04:11'.

    Matches the on-disk updated_at shape (datetime('now') is UTC space-sep).
    The SOLE legal minter for new sync-write Instant columns.
    """
    return datetime.now(_timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def now_instant_wire() -> str:
    """UTC instant, ISO-T, explicit offset: '2026-05-23T18:04:11+00:00'.

    For wire/client_ts values: the explicit marker means to_utc_dt resolves it
    via branch 1 (honor offset) with no column/origin context needed.
    """
    return datetime.now(_timezone.utc).replace(microsecond=0).isoformat()
```

> Note `outbox.py` already imports `timezone as _timezone` (used by `to_utc_dt`); reuse it. If the alias differs at HEAD, match the existing import.

Then create `scripts/db/timez.py`:

```python
# scripts/db/timez.py
"""Canonical time chokepoint for the PB sync layer (Increment 1A).

Two temporal types (spec §1):
  - Instant (UTC): "when X happened" — created_at/updated_at/completed_at/
    last_meaningful_movement/client_ts. Written by now_instant()/now_instant_wire().
  - CivilDate (date + viewer zone): "due May 25"/"today" — via today_civil().

WRITE through now_instant()/now_instant_wire(); READ/PARSE through the
re-exported to_utc_dt() (the canonical origin/column-aware reader, defined in
outbox.py); DISPLAY through format_local()/today_civil(). The lint (R20-R23)
allowlists ONLY this module + the classified identity/display writers.

Server-side viewer zone (TODAY.md/cron): the rendering machine's OS-local zone
(NOT a hardcoded America/Chicago). Nick's laptop clock auto-updates on travel,
so each machine renders correct-for-where-it-runs.
"""
from __future__ import annotations

from datetime import datetime, timezone

# Re-export the canonical reader AND the Instant minters so there is ONE import
# surface for callers + the lint allowlist. All three physically live in
# outbox.py (to_utc_dt shipped there in 61c53d78; now_instant/now_instant_wire
# are DEFINED there in Task 7 to avoid a circular import — timez imports FROM
# outbox, so outbox must NOT import FROM timez). timez just re-exports.
from scripts.db.outbox import (  # noqa: F401
    to_utc_dt,
    ZoneContractError,
    now_instant,
    now_instant_wire,
)


def format_local(iso: str, zone: str | None = None) -> str:
    """Render an Instant (UTC) as a human string in the server/viewer zone.

    zone=None → the machine's OS-local zone (server-side viewer). Pass an
    explicit IANA zone for digest/per-recipient rendering.
    """
    dt = to_utc_dt(iso, column="updated_at")  # parse as UTC instant
    if dt is None:
        return str(iso)
    if zone is not None:
        try:
            from zoneinfo import ZoneInfo
            dt = dt.astimezone(ZoneInfo(zone))
        except Exception:
            dt = dt.astimezone()  # fall back to OS-local
    else:
        dt = dt.astimezone()  # OS-local
    return dt.strftime("%Y-%m-%d %H:%M:%S %Z").strip()


def today_civil(zone: str | None = None) -> str:
    """Today's civil date 'YYYY-MM-DD' in the server/viewer zone.

    zone=None → the machine's OS-local zone. Never round-trip a CivilDate
    through to_utc_dt — it is a date in a zone, not an instant.
    """
    if zone is not None:
        try:
            from zoneinfo import ZoneInfo
            return datetime.now(ZoneInfo(zone)).strftime("%Y-%m-%d")
        except Exception:
            pass
    return datetime.now().astimezone().strftime("%Y-%m-%d")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/db/test_timez.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/Peripheral-Brain && git status --short && git diff --cached --name-only
git commit -F <msgfile> -- scripts/db/timez.py scripts/db/outbox.py tests/db/test_timez.py
```
Message: `feat(time): PB canonical time chokepoint timez.py + now_instant minters in outbox.py (Increment 1A Task 1)`. Author = ingra107. No Claude attribution. (Note: `outbox.py` is in this commit only for the two pure-addition minter funcs — the `client_ts` writer flip is Task 7.)

---

## Task 2: Hub canonical time chokepoint — `src/lib/time.ts`

**Specialist:** hub-backend (builder is read-only on Hub TS). **Ship-risk: A** (pure addition; rollback = delete the file).

**Files:**
- Create: `src/lib/time.ts`
- Test: `src/lib/time.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/time.test.ts
import { describe, it, expect } from 'vitest';
import { nowInstant, formatLocal, todayCivil } from './time';

describe('time chokepoint', () => {
  it('nowInstant is explicit-UTC Z-marked ISO', () => {
    const s = nowInstant();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    expect(Math.abs(Date.now() - new Date(s).getTime())).toBeLessThan(5000);
  });

  it('todayCivil renders YYYY-MM-DD in an explicit zone', () => {
    const s = todayCivil('America/Chicago');
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('formatLocal renders a UTC instant in a viewer zone', () => {
    // 2026-05-23T02:30:00Z is 2026-05-22 (the prior day) in CT.
    const out = formatLocal('2026-05-23T02:30:00Z', { timeZone: 'America/Chicago' });
    expect(out).toContain('2026');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/mn-ccore-lab && npx vitest run src/lib/time.test.ts`
Expected: FAIL — `Cannot find module './time'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/time.ts
// Canonical time chokepoint (Increment 1A). Two branded temporal types:
//   Instant   — UTC, "when X happened". Written by nowInstant() (Z-marked).
//   CivilDate — date + viewer zone, "due May 25"/"today". Via todayCivil().
// Display via formatLocal(). Viewer zone = the browser's own zone by default
// (traveler-aware for free); pass an explicit zone for server-side rendering.

export type Instant = string & { readonly __brand: 'Instant' };
export type CivilDate = string & { readonly __brand: 'CivilDate' };

/** The single Instant minter — replaces raw new Date().toISOString(). */
export function nowInstant(): Instant {
  return new Date().toISOString() as Instant;
}

/** Instant (UTC) → viewer-local human string. */
export function formatLocal(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', opts);
}

/**
 * Today's civil date YYYY-MM-DD in the viewer zone.
 * Default zone = the browser's resolved zone (traveler-aware). Server callers
 * (digest Worker) pass the resolved machine/recipient zone explicitly.
 */
export function todayCivil(zone?: string): CivilDate {
  const tz = zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}` as CivilDate;
}

/** Instant → its civil day in a zone (for grouping by viewer-local day). */
export function civilFromInstant(iso: string, zone?: string): CivilDate {
  const tz = zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}` as CivilDate;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/mn-ccore-lab && npx vitest run src/lib/time.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify the build still compiles** (Critical Rule 13).

Run: `cd ~/mn-ccore-lab && npm run build`
Expected: build succeeds, 0 TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd ~/mn-ccore-lab && git status --short
git commit -F <msgfile> -- src/lib/time.ts src/lib/time.test.ts
```
Message: `feat(time): Hub canonical time chokepoint src/lib/time.ts (Increment 1A Task 2)`. Author = ingra107. No Claude attribution.

> NOTE: `localDateKey()` (`src/lib/dateUtils.ts:76`) and `ctToday()` (`api/lib/ct-date.ts:40`) are NOT changed in 1A — their adopter migration to `todayCivil()` is Plan 1B. 1A only ships the new chokepoint.

---

## Task 3: CI lint — time rules R20-R23 in WARN mode

**Specialist:** builder (PB lint) + hub-backend (Hub CI step). **Ship-risk: A** (WARN mode exits 0; rollback = revert rule additions).

> **SPEC GAP RESOLVED (load-bearing):** the spec calls these rules "R10-R13", but `check_sync_antipatterns.py:626` ALREADY defines a rule named `R10` (`sync_status='local_modified'`) and `HUB-R1`. Reusing "R10" would collide and corrupt `RULE_DESCS`. The time rules are therefore named **R20-R23**. The existing WARN/ENFORCE mechanism (`_R10_WARN_ONLY` at `:631`, env `PB_LINT_MODE=warn|enforce`) is REUSED — extend it to also gate R20-R23, do not build a second mode system.

**Files:**
- Modify: `scripts/db/check_sync_antipatterns.py` (rules at `:613` RULES list, `:616` RULE_DESCS, `:631` mode gate, `:687` warn/fail routing)
- Test: `tests/db/test_time_lint_rules.py`
- Modify: `.github/workflows/schema-drift.yml` (Hub CI step)

- [ ] **Step 1: Write the failing test**

```python
# tests/db/test_time_lint_rules.py
import subprocess, sys, os, textwrap
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def _run_lint(env_extra=None):
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    return subprocess.run(
        [sys.executable, "scripts/db/check_sync_antipatterns.py"],
        cwd=REPO, capture_output=True, text=True, env=env,
    )


def test_r20_r23_defined():
    txt = (REPO / "scripts/db/check_sync_antipatterns.py").read_text(encoding="utf-8")
    for r in ("R20", "R21", "R22", "R23"):
        assert f'"{r}"' in txt, f"{r} not registered in RULE_DESCS"


def test_time_rules_warn_only_by_default(tmp_path):
    # In WARN mode (default), a raw datetime.now() in a fixture sync file
    # produces a warning but exit 0. Verified by RULE_DESCS presence + the
    # _R10_WARN_ONLY routing covering R20-R23. (Full fixture-file scan is
    # exercised by the existing _files_to_scan harness.)
    res = _run_lint({"PB_LINT_MODE": "warn"})
    assert res.returncode == 0, res.stderr
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/db/test_time_lint_rules.py -v`
Expected: FAIL on `test_r20_r23_defined` (rules not yet registered).

- [ ] **Step 3: Add the rule scanners + registration**

Add four scanner functions following the existing `_scan_rN(path, lines) -> list[tuple[int, str, str]]` shape (see `_scan_r1` at `:132`). Insert after `_scan_r10`:

```python
import re as _re_time  # reuse module-level re; shown explicit for the block

_R20_RX = _re_time.compile(r"new Date\(\)\.toISOString\(\)")
_R21_RX = _re_time.compile(r"\.toISOString\(\)\.(?:split|slice)\s*\(")
# R22: datetime.now() NOT immediately scoped to timezone.utc on the same call.
_R22_RX = _re_time.compile(r"datetime\.now\(\s*\)(?!\s*\.astimezone)")
_R23_RX = _re_time.compile(r"datetime\(\s*['\"]now['\"]\s*,\s*['\"]localtime['\"]\s*\)")


def _scan_time_rule(path, lines, rx, rule_name):
    """Generic regex scanner for the time rules. Allowlist + comment-skip
    identical to the other rules."""
    out = []
    full = "\n".join(lines)
    for m in rx.finditer(full):
        lineno = full[:m.start()].count("\n") + 1
        if _allowlisted(lines, lineno):
            continue
        line_content = lines[lineno - 1] if lineno - 1 < len(lines) else ""
        stripped = line_content.lstrip()
        if stripped.startswith(("#", "--", "//", "*", "/*")):
            continue
        out.append((lineno, rule_name, line_content.strip()))
    return out


def _scan_r20(path, lines):  # Hub TS: raw UTC instant outside nowInstant()
    if path.suffix not in (".ts", ".tsx"):
        return []
    return _scan_time_rule(path, lines, _R20_RX, "R20")


def _scan_r21(path, lines):  # Hub TS: UTC civil-day extraction (rolled-tomorrow)
    if path.suffix not in (".ts", ".tsx"):
        return []
    return _scan_time_rule(path, lines, _R21_RX, "R21")


def _scan_r22(path, lines):  # PB: naive datetime.now() in a sync writer
    if path.suffix != ".py":
        return []
    return _scan_time_rule(path, lines, _R22_RX, "R22")


def _scan_r23(path, lines):  # PB: SQLite localtime write in a synced table
    if path.suffix not in (".py", ".sql"):
        return []
    return _scan_time_rule(path, lines, _R23_RX, "R23")
```

Then register them and add descriptions + mode gating:

```python
# at :613 — extend RULES
RULES = [_scan_r1, _scan_r2, _scan_r3, _scan_r4, _scan_r5,
         _scan_r6, _scan_r7, _scan_r8, _scan_r9, _scan_r10,
         _scan_r20, _scan_r21, _scan_r22, _scan_r23,
         _scan_hub_r1]

# at :616 — extend RULE_DESCS
    "R20": "raw new Date().toISOString() outside nowInstant() (use src/lib/time.ts)",
    "R21": "toISOString().split|slice — UTC civil-day (rolled-tomorrow bug); use todayCivil()/civilFromInstant()",
    "R22": "naive datetime.now() in a sync writer; use timez.now_instant()/now_instant_wire()",
    "R23": "datetime('now','localtime') write in a synced table; use UTC datetime('now')",

# at :631 — extend the WARN/ENFORCE gate to cover the time rules too.
# (Same env var; same mechanism — DO NOT add a second mode system.)
_TIME_RULES = ("R20", "R21", "R22", "R23")
# at :687 — extend the warn-routing tuple
                if rule in ("R10", "HUB-R1") + _TIME_RULES and _R10_WARN_ONLY:
                    warnings.append(msg)
```

Also update the warn-summary string at `:694-695` (currently hard-codes "R10/HUB-R1 warnings") so it isn't misleading once R20-R23 warn too:

```python
# at :694-695 — generalize the summary label
        print(f"[sync-antipatterns] OK ({len(files)} files), "
              f"{len(warnings)} WARN-mode hits (R10/HUB-R1/R20-R23, pre-cutover):",
              file=sys.stderr)
```

> **R22 false-negative note (Opus-timediscipline risk #4):** the regex catches the common `datetime.now()` form but not variable indirection (`d = datetime.now(); d.isoformat()`). This is a known backstop limit; the Hub ESLint AST rule (deferred to 1B) is the real net for the TS side. For the PB sync surface (only ~2 writers) the regex is sufficient. Document this in the rule docstring.

- [ ] **Step 4: Add the Hub CI lint step** (`.github/workflows/schema-drift.yml`, after the `audit:schema-contract` step at `:216-221`):

> **CRITICAL CORRECTION (Codex smaller finding, confirmed against `.github/workflows/schema-drift.yml:41-42` HEAD): the workflow does a SINGLE `actions/checkout@v4` — only the Hub repo. There is NO `../Peripheral-Brain/` checkout.** So `python3 ../Peripheral-Brain/scripts/db/check_sync_antipatterns.py || true` ALWAYS hits file-not-found → `|| true` swallows it → SILENT NO-OP forever. That is lint theater. The original plan's "if PB not checked out, gate on a path check" is exactly the theater. **DECIDED (not optional): ship a stdlib-only Hub-local mirror of the TS rules R20/R21** so the lint actually runs against the Hub tree without depending on a PB checkout. The PB R22/R23 (Python sync writers) remain PB-side; they don't apply to the Hub TS tree anyway.

Create `scripts/check-time-discipline.mjs` (stdlib Node, no deps — mirrors R20/R21 for the Hub TS tree):

```js
// scripts/check-time-discipline.mjs — Hub-local R20/R21 mirror (Increment 1A).
// Bans raw `new Date().toISOString()` (R20) and `.toISOString().split|slice`
// (R21) in src/ + api/ outside src/lib/time.ts. WARN mode by default (exit 0);
// CI flips to ERROR after the 1B display-site migration clears the backlog.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ENFORCE = process.env.TIME_LINT_MODE === 'enforce';
const ALLOW = new Set(['src/lib/time.ts']);
const R20 = /new Date\(\)\.toISOString\(\)/;
const R21 = /\.toISOString\(\)\.(?:split|slice)\s*\(/;
const hits = [];
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!/node_modules|dist|\.git/.test(p)) walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(p)) continue;
    const rel = p.replace(/\\/g, '/').replace(/^\.\//, '');
    if ([...ALLOW].some(a => rel.endsWith(a))) continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('*')) return;
      if (R20.test(line)) hits.push(`R20 ${rel}:${i + 1}: ${line.trim()}`);
      if (R21.test(line)) hits.push(`R21 ${rel}:${i + 1}: ${line.trim()}`);
    });
  }
}
['src', 'api'].forEach(d => { try { walk(d); } catch {} });
if (hits.length) {
  console.error(`[time-discipline] ${hits.length} hit(s):\n` + hits.join('\n'));
  process.exit(ENFORCE ? 1 : 0);
}
console.log('[time-discipline] OK');
```

```yaml
      - name: Time-discipline lint (Increment 1A R20/R21, WARN during migration)
        # Hub-local stdlib mirror — does NOT depend on a PB checkout. WARN mode
        # (exit 0) until the 1B display-site migration clears the backlog, then
        # set TIME_LINT_MODE=enforce here to hard-fail.
        env:
          TIME_LINT_MODE: warn
        run: node scripts/check-time-discipline.mjs
```

> No `|| true` — the script self-gates on `TIME_LINT_MODE` and exits 0 in WARN mode by design, so a real hit is VISIBLE in the log (not swallowed) while never red-failing the build during 1A. hub-backend ships `scripts/check-time-discipline.mjs` + the workflow step in one commit. The PB-side `check_sync_antipatterns.py` R20-R23 still run in PB's own pre-commit/CI for the PB tree.

- [ ] **Step 5: Run tests + lint**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/db/test_time_lint_rules.py -v && python scripts/db/check_sync_antipatterns.py`
Expected: tests PASS; lint prints `[sync-antipatterns] OK ... warnings (pre-cutover, WARN mode)` and exits 0.

- [ ] **Step 6: Commit (two repos, separately)**

```bash
cd ~/Peripheral-Brain && git commit -F <msgfile> -- scripts/db/check_sync_antipatterns.py tests/db/test_time_lint_rules.py
cd ~/mn-ccore-lab && git commit -F <msgfile> -- .github/workflows/schema-drift.yml
```
Messages describe the WARN-mode time lint. Author = ingra107. No Claude attribution.

---

## Task 4: Hub `advanceProjectMovement` read-modify-write normalizer

**Specialist:** hub-backend (builder Tier-2 escalates `mutations.ts`). **Ship-risk: B** (independent Hub deploy; kills the LIVE churn bug; rollback = revert + redeploy, churn returns but no corruption). **Batches with the already-committed redaction `66e5c9d0`.**

**Live bug (spec §0, R3):** `mutations.ts:784` `ts = mut.client_ts || new Date().toISOString()` — `client_ts` is naive-CT from brain.db today (e.g. `2026-05-22T16:11:46`); the raw SQL MAX at `:798-805` does a LEXICAL string compare against a stored UTC LMM (`2026-05-22 21:11:46`). Mixed-zone lexical compare picks the wrong winner → spurious "movement advanced" + pull-back flicker. Fix: normalize BOTH the incoming `ts` AND the stored LMM to UTC before MAX, write the canonical UTC winner.

**Files:**
- Modify: `api/routes/mutations.ts:780-808`
- Test: `api/routes/mutations.advance-project.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// api/routes/mutations.advance-project.test.ts — add cases
it('naive-CT client_ts that is the LATER real instant beats an earlier stored UTC LMM', async () => {
  // Stored LMM (UTC): 2026-05-22 21:00:00 == 16:00 CT.
  // Incoming naive-CT client_ts: 2026-05-22T16:30:00 == 21:30 UTC (LATER).
  // Raw lexical compare: '2026-05-22 21:00:00' < '2026-05-22T16:30:00' is FALSE
  //   ('2' vs 'T' at the separator → '2' < 'T' so 21:00 < 16:30T lexically),
  //   so the genuinely-later CT instant WRONGLY loses today. After the fix it wins.
  await seedProject(env, { id: 'proj_x', last_meaningful_movement: '2026-05-22 21:00:00' });
  await advanceProjectMovement(env, mutWith({ client_ts: '2026-05-22T16:30:00' }), currentTaskInProj_x);
  const row = await getProject(env, 'proj_x');
  // The stored value must now be the UTC normalization of the later instant.
  expect(row.last_meaningful_movement).toBe('2026-05-22 21:30:00');
});

it('explicit-UTC (Z) client_ts is honored verbatim', async () => {
  await seedProject(env, { id: 'proj_y', last_meaningful_movement: '2026-05-22 21:00:00' });
  await advanceProjectMovement(env, mutWith({ client_ts: '2026-05-22T21:30:00Z' }), currentTaskInProj_y);
  const row = await getProject(env, 'proj_y');
  expect(row.last_meaningful_movement).toBe('2026-05-22 21:30:00');
});

it('an earlier incoming instant does NOT overwrite a later stored LMM', async () => {
  await seedProject(env, { id: 'proj_z', last_meaningful_movement: '2026-05-22 22:00:00' });
  await advanceProjectMovement(env, mutWith({ client_ts: '2026-05-22T16:30:00' }), currentTaskInProj_z);
  const row = await getProject(env, 'proj_z');
  expect(row.last_meaningful_movement).toBe('2026-05-22 22:00:00'); // unchanged
});

it('concurrent completions never move LMM backward (no lost-update — Codex finding 2)', async () => {
  // Two completions race: an EARLIER instant and a LATER instant, fired
  // concurrently. The atomic single-UPDATE CASE compare guarantees the final
  // stored value is the LATER one regardless of arrival order. (A SELECT-then-
  // write read-modify-write would let the earlier write land after the later
  // one and move LMM backward — this test would catch that regression.)
  await seedProject(env, { id: 'proj_cas', last_meaningful_movement: '2026-05-22 20:00:00' });
  await Promise.all([
    advanceProjectMovement(env, mutWith({ client_ts: '2026-05-22T16:30:00' }), currentTaskInProj_cas), // 21:30 UTC (later)
    advanceProjectMovement(env, mutWith({ client_ts: '2026-05-22T15:00:00' }), currentTaskInProj_cas), // 20:00 UTC (earlier)
  ]);
  const row = await getProject(env, 'proj_cas');
  expect(row.last_meaningful_movement).toBe('2026-05-22 21:30:00'); // the LATER instant won; never moved backward
});
```

> Miniflare/D1 in vitest serializes statements per connection, so the `Promise.all` above exercises interleaving at the statement boundary. The atomic single-UPDATE structure means even true concurrency cannot regress — the test documents the contract and guards against a future refactor reintroducing a read-modify-write.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/mn-ccore-lab && npx vitest run --config vitest.config.api.ts api/routes/mutations.advance-project.test.ts`
Expected: FAIL — the lexical-MAX path mis-orders the naive-CT case.

- [ ] **Step 3: Implement the UTC-normalized MAX — preserve the atomic DB-side compare (replace only the `ts` line `:784` and the bound values; KEEP the single-UPDATE CASE structure `:796-808`)**

> **CRITICAL CORRECTION (Codex finding 2, confirmed against `mutations.ts:796-806` HEAD): the original plan's SELECT-existing → compute `shouldWrite` → unconditional CASE-write introduces a LOST-UPDATE race.** Two concurrent completions both SELECT the old LMM, both compute `shouldWrite` against that stale read, and the OLDER timestamp can land its UPDATE after the newer → LMM moves backward. The LIVE code is already race-safe: it does the compare INSIDE one atomic UPDATE (`last_meaningful_movement < ? THEN ?`). The bug is NOT the structure — it is the LEXICAL/mixed-zone compare. **THE FIX: keep the atomic single-UPDATE DB-side compare; only change `ts` to a UTC-normalized value so the `<` compare is apples-to-apples** (all on-disk LMM is UTC space-sep post-Task-8; the incoming value is normalized to UTC space-sep here). No SELECT, no read-modify-write, no lost-update window.

```ts
  // Normalize the incoming movement instant to canonical UTC space-sep.
  // Explicit-offset/Z is honored; a naive value is treated as legacy-CT
  // (the brain.db emit format pre-Increment-1A Task 7) and converted to UTC.
  // Fallback to server-now (already UTC) if client_ts is missing/unparseable.
  const tsUtc = normalizeToUtcSpaceSep(mut.client_ts)
    ?? nowInstant().replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');

  // ATOMIC MAX in UTC space — single UPDATE, DB-side CASE compare. Because both
  // sides are now canonical UTC space-sep, the lexical `<` IS a correct temporal
  // compare. This preserves the live code's lost-update safety (the compare and
  // write are one statement; concurrent completions can never move LMM backward)
  // while killing the mixed-zone wrong-winner bug. stale_active_since + updated_at
  // unconditional (movement = project unstale), matching prior behavior.
  await env.DB.prepare(`
    UPDATE projects
    SET last_meaningful_movement = CASE
        WHEN last_meaningful_movement IS NULL OR last_meaningful_movement < ?
        THEN ?
        ELSE last_meaningful_movement
      END,
      stale_active_since = NULL,
      updated_at = datetime('now')
    WHERE id = ? OR slug = ?
  `).bind(tsUtc, tsUtc, projectId, projectId).run().catch((e: Error) => {
    console.error('advanceProjectMovement: project update failed:', e.message);
  });
```

> **Invariant preserved:** the on-disk `last_meaningful_movement` MUST already be canonical UTC space-sep for the lexical `<` to be correct. Task 8 migrates all historical LMM to UTC; Task 7 makes new `client_ts` explicit-UTC; this normalizer makes the incoming value UTC. The ONE window where on-disk LMM could still be CT is BEFORE Task 8 — but Task 4 ships first (it kills the live churn independently). During that window the compare is `incoming-UTC < stored-CT`: stored CT is 5h-behind-its-real-instant, so a same-day comparison can still mis-order by up to 5h. This is ACCEPTABLE for the Task-4-before-Task-8 window because (a) it is strictly better than the pre-fix lexical-across-separator bug, and (b) Task 8 closes it. If a cleaner interim is wanted, normalize the STORED value too via a CAS: read `last_meaningful_movement`, compute both UTC, and `UPDATE ... WHERE (id=? OR slug=?) AND last_meaningful_movement IS <the-exact-value-read>` retrying on `meta.changes === 0`. Not required for correctness once Task 8 lands; documented as the belt-and-suspenders option.

Add the helper near the top of `mutations.ts` (or import from a shared module):

```ts
// Normalize a timestamp to canonical UTC 'YYYY-MM-DD HH:MM:SS'. Honors an
// explicit offset/Z; treats a naive value as legacy America/Chicago (the
// brain.db pre-1A emit zone). Returns null on unparseable input.
function normalizeToUtcSpaceSep(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const hasOffset = /[zZ]$/.test(ts) || /[+-]\d{2}:?\d{2}$/.test(ts.slice(10));
  // Naive → assume CT. Build a Date by appending the CT offset for the instant.
  let d: Date;
  if (hasOffset) {
    d = new Date(ts);
  } else {
    // Interpret the naive wall-clock as America/Chicago.
    const ctOffsetMin = ctOffsetMinutesAt(ts); // -300 (CDT) or -360 (CST)
    const sign = ctOffsetMin <= 0 ? '-' : '+';
    const abs = Math.abs(ctOffsetMin);
    const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
    d = new Date(ts.replace(' ', 'T') + off);
  }
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');
}
```

> `ctOffsetMinutesAt(ts)` resolves CDT/CST for the instant via `Intl.DateTimeFormat` with `timeZone: 'America/Chicago'` (Cloudflare Workers ship full ICU, so DST is correct). hub-backend implements it alongside; if `api/lib/ct-date.ts` already exposes an offset helper, reuse it. Import `nowInstant` from `src/lib/time.ts` (Task 2) — confirm the import path resolves in the Worker bundle (`api/` may need a relative import to `../../src/lib/time`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/mn-ccore-lab && npx vitest run --config vitest.config.api.ts api/routes/mutations.advance-project.test.ts`
Expected: PASS (all 3 new cases + existing cases green).

- [ ] **Step 5: Verify the cross-language hash contract is unaffected**

Run: `cd ~/mn-ccore-lab && npx vitest run --config vitest.config.api.ts api/routes/mutations.hash.test.ts`
Expected: PASS (this change does not touch `hashTouched`; confirm no regression).

- [ ] **Step 6: Build + deploy** (per Hub CLAUDE.md — Claude runs the deploy, batch with `66e5c9d0`).

Run: `cd ~/mn-ccore-lab && npx wrangler whoami && npm run deploy:pages:gated`
Then verify the live commit: `npx wrangler pages deployment list --project-name mn-ccore-lab` (Source column shows the deployed commit).

- [ ] **Step 7: Live verification**

Complete a task from brain.db that has a parent project; confirm via `npx wrangler d1 execute mnccore-lab --remote --command "SELECT id, last_meaningful_movement FROM projects WHERE id = '<proj>'"` that LMM advanced to the correct UTC instant (NOT +5h, NOT a spurious earlier value). Watch `npx wrangler tail` for the churn (repeated advance/revert) — it must be gone.

- [ ] **Step 8: Commit**

```bash
cd ~/mn-ccore-lab && git commit -F <msgfile> -- api/routes/mutations.ts api/routes/mutations.advance-project.test.ts
```
Message: `fix(sync): advanceProjectMovement UTC-normalize before MAX — kill LMM churn (Increment 1A Task 4)`. Author = ingra107. No Claude attribution.

**Rollback:** `git revert` the commit + redeploy. The live churn bug returns (wrong-winner, recoverable — not corruption). No data migration to undo.

---

## Task 5: Snapshot/restore runbook (BOTH repos) — NAMED DELIVERABLE

**Specialist:** builder. **Ship-risk: C** (relay-confirm; the snapshot itself is read-only but it is the gate for Tasks 6 + 8). Run this IMMEDIATELY before Task 6, and re-verify it is still fresh (< a few hours old) before Task 8.

**Why both repos:** the LWW loop is bidirectional — a brain.db-only snapshot cannot roll back Hub corruption and would re-push it (Opus-LWW R8). The snapshot must capture the LWW-arbitrated columns AND the seq/mutation-id cursors on BOTH sides so a restore does not desync.

**Files:**
- Create (gitignored): `data/snapshots/2026-05-23-increment-1A/` on EACH machine.

- [ ] **Step 1: Confirm both repos are at the expected HEAD on BOTH machines** (relay-confirm).

```bash
cd ~/Peripheral-Brain && git log --oneline -1
cd ~/mn-ccore-lab && git log --oneline -1
```
Expected: Tasks 1-4 commits present on both machines. If the peer machine is behind, relay-pull first (`cross-machine-relay` skill).

- [ ] **Step 2: Snapshot brain.db (PB side) — SQLite online backup, includes WAL**

```bash
cd ~/Peripheral-Brain
mkdir -p data/snapshots/2026-05-23-increment-1A
python -c "import sqlite3, pathlib; src=sqlite3.connect('data/brain.db'); dst=sqlite3.connect('data/snapshots/2026-05-23-increment-1A/brain.db'); src.backup(dst); dst.close(); src.close(); print('brain.db snapshot OK')"
# Capture the raw WAL/SHM too (belt-and-suspenders for in-flight pages):
python -c "import shutil, os; [shutil.copy2(f'data/brain.db{ext}', f'data/snapshots/2026-05-23-increment-1A/brain.db{ext}') for ext in ('-wal','-shm') if os.path.exists(f'data/brain.db{ext}')]; print('wal/shm copied if present')"
```

- [ ] **Step 3: Capture the outbox pending state** (so a restore does not replay/drop in-flight pushes — Opus-LWW §4)

```bash
cd ~/Peripheral-Brain
python -c "import sqlite3, json; c=sqlite3.connect('data/brain.db'); c.row_factory=sqlite3.Row; rows=[dict(r) for r in c.execute('SELECT mutation_id, table_name, record_id, op, base_seq, client_ts, issued_at, ack_at, dead_letter_at FROM outbox WHERE ack_at IS NULL')]; open('data/snapshots/2026-05-23-increment-1A/outbox_pending.json','w').write(json.dumps(rows, indent=2, default=str)); print(f'{len(rows)} pending outbox rows captured')"
```

- [ ] **Step 4: Export the FULL D1 (Hub) rollback artifact — corrected column lists, NO row limit (Codex finding 3)**

> **CRITICAL CORRECTION (Codex finding 3, confirmed against `mutations.ts:980-981` HEAD): `processed_mutations` has NO `last_mutation_id` or `seq` column.** Its real columns are `mutation_id, origin_machine, processed_at, outcome, original_response_json, table_name, record_id`. The original plan's `SELECT mutation_id, last_mutation_id, seq FROM processed_mutations` FAILS. The `seq`/`last_mutation_id` cursors live on the `tasks`/`projects` ROWS, not on `processed_mutations`. **Also REMOVED the `LIMIT 500`** — a partial export is not a rollback artifact. And **"if wrangler rejects a column, drop it" is REMOVED** — for a rollback artifact, a rejected column means STOP and fix the schema assumption, never silently ship a lossy snapshot. The exact export must be DRY-RUN rehearsed (Task 8 Step 7b) before any flip.

Use `--json` and capture FULL tables (these are small: ~hundreds of rows each). Verify each export's `results` array is non-empty before proceeding.

```bash
cd ~/mn-ccore-lab
mkdir -p ../Peripheral-Brain/data/snapshots/2026-05-23-increment-1A
# tasks: LWW columns + the per-row seq/last_mutation_id cursors live HERE.
npx wrangler d1 execute mnccore-lab --remote --json \
  --command "SELECT id, slug, updated_at, last_meaningful_movement, stale_active_since, completed_at, completed, status, seq, last_mutation_id, deleted_at FROM tasks" \
  > ../Peripheral-Brain/data/snapshots/2026-05-23-increment-1A/d1_tasks.json
# projects: LWW columns + cursors.
npx wrangler d1 execute mnccore-lab --remote --json \
  --command "SELECT id, slug, updated_at, last_meaningful_movement, stale_active_since, status, stage, category, seq, last_mutation_id, deleted_at FROM projects" \
  > ../Peripheral-Brain/data/snapshots/2026-05-23-increment-1A/d1_projects.json
# processed_mutations: REAL columns only, FULL table (idempotency ledger — a
# restore must not duplicate-apply, so we need the whole ledger, not a slice).
npx wrangler d1 execute mnccore-lab --remote --json \
  --command "SELECT mutation_id, origin_machine, processed_at, outcome, table_name, record_id FROM processed_mutations ORDER BY processed_at DESC" \
  > ../Peripheral-Brain/data/snapshots/2026-05-23-increment-1A/d1_processed_mutations.json
# Sanity: each export non-empty.
for f in d1_tasks d1_projects d1_processed_mutations; do
  python -c "import json; d=json.load(open('../Peripheral-Brain/data/snapshots/2026-05-23-increment-1A/$f.json')); n=len(d[0]['results']); print('$f rows:', n); assert n>0, '$f export EMPTY — STOP'"
done
```

> NOTE: column lists above are verified against `mutations.ts` (`processed_mutations` insert at `:980-981`) + the registered shared fields. If `wrangler d1 execute` rejects ANY column, **STOP** — do not "drop it and re-run". A rejected column means the schema assumption is wrong and the rollback artifact would be incomplete. Reconcile the schema first, record the actual columns in the runbook header, then re-export.

- [ ] **Step 5: Record the manifest + restore procedure**

Write `data/snapshots/2026-05-23-increment-1A/RESTORE.md` (gitignored) capturing: snapshot timestamp (UTC), both machines' HEAD SHAs, the row counts captured, and these RESTORE commands:

```
RESTORE (valid for HOURS only — restoring after real team activity clobbers good writes):
  PB:  stop all daemons (python scripts/utils/check_daemons.py --stop-all);
       copy data/snapshots/.../brain.db (+ -wal/-shm) back over data/brain.db;
       restart daemons.
  D1:  SCRIPTED from the JSON exports — never hand-type. A restore script
       (committed as scripts/db/restore_d1_snapshot.py, gitignored output)
       reads d1_projects.json / d1_tasks.json and, for each row, issues:
         UPDATE projects SET last_meaningful_movement=?, updated_at=?,
           stale_active_since=?, status=?, stage=?, category=?, seq=?,
           last_mutation_id=?, deleted_at=? WHERE id=?
         UPDATE tasks    SET updated_at=?, last_meaningful_movement=?,
           stale_active_since=?, completed_at=?, completed=?, status=?,
           seq=?, last_mutation_id=?, deleted_at=? WHERE id=?
       (seq/last_mutation_id are TASK/PROJECT row columns — NOT processed_mutations.)
  processed_mutations: it is an append-only idempotency ledger. A restore does
       NOT delete ledger rows (deleting them would let a replayed mutation
       double-apply). Leave processed_mutations as-is; its snapshot is for
       audit/diff only.
  Outbox: re-enqueue from outbox_pending.json ONLY mutations whose mutation_id
       is NOT present in the live processed_mutations ledger (else duplicate-apply).
```

> The restore script + the exact export commands MUST be DRY-RUN rehearsed (Task 8 Step 7b) on a scratch context before any flip. A rollback artifact that has never been exercised is not a rollback artifact.

- [ ] **Step 6: Verify the snapshot is complete + relay-confirm**

```bash
cd ~/Peripheral-Brain && python -c "import os; d='data/snapshots/2026-05-23-increment-1A'; assert os.path.exists(f'{d}/brain.db'); assert os.path.getsize(f'{d}/brain.db')>0; [print(f, os.path.getsize(os.path.join(d,f))) for f in os.listdir(d)]"
```
Expected: `brain.db`, `outbox_pending.json`, `d1_tasks.json`, `d1_projects.json`, `d1_processed_mutations.json`, `RESTORE.md` all present and non-empty.

**Relay-confirm:** the snapshot must exist on BOTH machines (each snapshots its own brain.db; the D1 export is shared since D1 is single-source). Confirm via the relay chat that both have a fresh snapshot dated within the same window BEFORE proceeding to Task 6. No commit (snapshots are gitignored).

---

## Task 6: Flip the 3 LWW pull-gates to origin-aware fail-closed ENFORCE

**Specialist:** builder. **Ship-risk: C** (relay-confirm; both machines flip in the SAME sync generation; rollback = revert the gates, non-destructive). Run AFTER Task 5 snapshot exists on both machines.

**The gates (verified against HEAD):**
- Task pull gate: `hub.py:1278` (`if d1_updated and brain_updated and d1_updated <= brain_updated: skip`), shadow `decision_new` already computed at `:1263-1277`.
- Project pull gate: `hub.py:1861` (`if not (hub_updated and hub_updated > brain_updated): skip`) → apply at `:1865`, shadow `:1847-1860`.
- LMM MAX gate: `hub.py:2002` (`if _lmm and (not _local_lmm or _lmm > _local_lmm): apply`), shadow `:1984-2001`.

The fix is to PROMOTE the shadow's already-coded `decision_new` (origin/column-aware via `to_utc_dt`) to live, with fail-closed on ambiguity.

**Files:**
- Modify: `scripts/db/sync/drivers/hub.py:1278`, `:1861`, `:2002`
- Test: `tests/sync/drivers/test_pull_lww_zone.py` (already shipped in `61c53d78`)

- [ ] **Step 1: Write the failing test (fail-closed + correct-winner cases)**

```python
# tests/sync/drivers/test_pull_lww_zone.py — add cases
def test_task_pull_gate_skips_on_unparseable_remote(driver, seeded_task):
    # Fail-CLOSED: an unparseable Hub updated_at must SKIP, never apply.
    seeded_task(brain_updated="2026-05-22 21:00:00")
    applied = driver._apply_one_task({"id": "task_x", "updated_at": "NOT-A-DATE"})
    assert applied is False  # skipped, local preserved


def test_task_pull_gate_skips_on_missing_local_updated_at(driver, seeded_task):
    # CODEX FINDING 5: an EXISTING local row with a missing/empty brain_updated
    # must SKIP (ambiguous), NOT fall through and apply. Spec §83.
    seeded_task(brain_updated="")  # existing row, blank local timestamp
    applied = driver._apply_one_task({"id": "task_x", "updated_at": "2026-05-22 21:00:00"})
    assert applied is False  # ambiguous local → fail-closed skip


def test_task_pull_gate_skips_on_unparseable_local(driver, seeded_task):
    seeded_task(brain_updated="GARBAGE")
    applied = driver._apply_one_task({"id": "task_x", "updated_at": "2026-05-22 21:00:00"})
    assert applied is False  # unparseable local → fail-closed skip


def test_project_pull_gate_skips_on_missing_remote(driver, seeded_project):
    # Fail-closed: existing local project, Hub sends no/empty updated_at → skip.
    seeded_project(brain_updated="2026-05-22 21:00:00")
    applied = driver._apply_one_project({"id": "proj_x", "updated_at": ""})
    assert applied is False


def test_lmm_gate_compares_in_utc_not_lexical(driver, seeded_project):
    # Stored brain LMM is CT 16:00 (== 21:00 UTC). Hub sends UTC 20:00.
    # Lexical raw compare '2026-05-22 20:00:00' > '2026-05-22 16:00:00' = apply (WRONG:
    # Hub 20:00 UTC is EARLIER than local 21:00 UTC). UTC-aware compare must SKIP.
    seeded_project(brain_lmm="2026-05-22 16:00:00")  # CT column
    applied = driver._apply_lmm({"id": "proj_x", "last_meaningful_movement": "2026-05-22 20:00:00"})
    assert applied is False  # Hub is actually earlier → skip


def test_lmm_gate_applies_when_no_local_lmm(driver, seeded_project):
    # The intended exception: no local LMM yet → apply the parseable Hub value.
    seeded_project(brain_lmm=None)
    applied = driver._apply_lmm({"id": "proj_x", "last_meaningful_movement": "2026-05-22 20:00:00"})
    assert applied is True  # local-missing apply is the documented exception


def test_lmm_gate_skips_on_unparseable_local_lmm(driver, seeded_project):
    # Fail-closed: local LMM exists but is unparseable → preserve local, skip.
    seeded_project(brain_lmm="GARBAGE")
    applied = driver._apply_lmm({"id": "proj_x", "last_meaningful_movement": "2026-05-22 20:00:00"})
    assert applied is False
```

> The exact test entry points (`_apply_one_task` / `_apply_lmm`) must match the real driver method seams — read `test_pull_lww_zone.py` at execution and mirror its existing fixture style. The CONTRACT under test: gate decision == `decision_new` (UTC-aware), fail-closed on None.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/sync/drivers/test_pull_lww_zone.py -v`
Expected: FAIL — the live gates still use raw-string compare.

- [ ] **Step 3: Flip the task gate (`hub.py:1278`)**

Replace the raw-string decision with the UTC-aware one + fail-closed. **CODEX FINDING 5 CORRECTION:** the live gate (`hub.py:1278`) only acts inside `if d1_updated and brain_updated`, so a row that EXISTS locally but whose `brain_updated` is empty/unparseable FALLS THROUGH and applies — violating spec §83 (ambiguous → skip). This gate is already inside `if existing:` (`hub.py:1256`), so the "row doesn't exist yet → apply new task" path is upstream and unaffected. The fix: for an EXISTING row, skip unless BOTH sides parse to UTC AND d1 is strictly newer.

```python
                # v2 Task 4 ENFORCE (Increment 1A): the live gate now uses the
                # origin/column-aware UTC compare. FAIL-CLOSED per spec §83:
                # because this is an EXISTING local row (we are inside `if existing:`),
                # an ambiguous/unparseable/missing timestamp on EITHER side must
                # SKIP — never apply over local state on a guess. (A genuinely new
                # task with no local row is handled upstream, before this gate.)
                _d1_utc = to_utc_dt(d1_updated, origin="hub") if d1_updated else None
                _brain_utc = to_utc_dt(brain_updated, column="updated_at") if brain_updated else None
                _apply_task = (_d1_utc is not None and _brain_utc is not None
                               and _d1_utc > _brain_utc)
                if not _apply_task:
                    log_decision(table="tasks", d1_id=d1_id, title=_title,
                                 decision="skipped_stale", local_pk=task_id,
                                 reason=("utc-aware fail-closed: d1 not strictly "
                                         f"newer or a side is ambiguous "
                                         f"(d1={d1_updated!r} brain={brain_updated!r})"))
                    stats.skipped_stale += 1
                    continue
```

Import `to_utc_dt` at the top of `hub.py` (already imported in the freshness-guard fix region `:498`; hoist to module scope if not already).

> **Why this is safe (not over-skipping real applies):** an existing local row always has a `brain_updated` (it was written by some prior sync/local edit), so `_brain_utc` is non-None in the normal case; the only time it is None is genuine corruption, where skipping (preserving local + the snapshot backstop) is exactly right. An incoming Hub row always carries `updated_at` (Hub writes `datetime('now')` on every mutation), so `_d1_utc` None means a malformed Hub payload → also correctly skipped.

- [ ] **Step 4: Flip the project gate (`hub.py:1861`)**

```python
                    _hub_utc = to_utc_dt(hub_updated, origin="hub") if hub_updated else None
                    _brain_utc = to_utc_dt(brain_updated, column="updated_at") if brain_updated else None
                    _apply = bool(hub_updated and brain_updated and _hub_utc is not None
                                  and _brain_utc is not None and _hub_utc > _brain_utc)
                    if not _apply:
                        log_decision(table="projects", d1_id=p.get("id", ""), title=title,
                                     decision="lww_pullback_skip_not_newer", local_pk=existing_pk,
                                     reason=f"utc-aware hub={hub_updated!r} brain={brain_updated!r}")
                    if _apply:
                        # ... existing apply block unchanged ...
```

- [ ] **Step 5: Flip the LMM MAX gate (`hub.py:2002`)**

```python
                            _lmm_utc = to_utc_dt(_lmm, origin="hub") if _lmm else None
                            _local_lmm_utc = to_utc_dt(_local_lmm, column="last_meaningful_movement") if _local_lmm else None
                            # Apply when Hub LMM is parseable AND (no local OR strictly newer in UTC).
                            if _lmm and _lmm_utc is not None and (not _local_lmm or (_local_lmm_utc is not None and _lmm_utc > _local_lmm_utc)):
                                patch["last_meaningful_movement"] = _lmm
```

> Fail-closed: if `_lmm_utc` is None (unparseable Hub value) → do not apply. If `_local_lmm` exists but is unparseable (`_local_lmm_utc is None`) → do not apply (preserve local). Note: while the LMM writer is still CT on-disk (until Task 8), `column="last_meaningful_movement"` correctly resolves it as CT — this is why the gate flip is safe BEFORE the migration.

- [ ] **Step 6: Run the full sync zone suite**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/sync/drivers/test_pull_lww_zone.py tests/sync/test_lww_timestamp_zone.py tests/sync/test_freshness_guard_zone.py -v`
Expected: PASS.

- [ ] **Step 7: Live convergence verification**

Run a `python scripts/db/sync.py pull` then `python scripts/db/sync.py status --verbose`. Diff a handful of recently-touched tasks/projects' `updated_at`/LMM against Hub via `wrangler d1 execute`. Expected: convergence, NO new divergence, no done→todo reverts.

- [ ] **Step 8: Commit + relay-confirm**

```bash
cd ~/Peripheral-Brain && git commit -F <msgfile> -- scripts/db/sync/drivers/hub.py tests/sync/drivers/test_pull_lww_zone.py
```
Message: `fix(sync): flip 3 LWW pull-gates to UTC-aware fail-closed ENFORCE (Increment 1A Task 6)`. Author = ingra107. No Claude attribution.

**Relay-confirm (REQUIRED):** both machines must run this commit + the next sync in the SAME generation. If one machine enforces while the other still raw-string-compares, a row touched on both produces transient divergence. Coordinate via the relay chat: confirm both at the new SHA, then both run `sync.py sync` once, then both verify status. **Rollback:** revert the gates to raw-string (shadow stays). Non-destructive — a wrong skip is recoverable (the next pull re-evaluates) and the snapshot (Task 5) backstops a wrong apply.

---

## Task 7: PB `client_ts` → explicit-UTC + Hub handoff spec

**Specialist:** builder. **Ship-risk: B** (cross-repo lockstep; rollback-safe because Hub already normalizes both forms after Task 4). Run AFTER Task 4 is LIVE and Task 5 snapshot exists.

**Cross-repo invariant:** file the Hub handoff spec to `data/shared/hub-schema-changes.jsonl` BEFORE PB stops sending naive-CT (spec §3.4, Opus-LWW Alteration 9). Because Task 4 made Hub normalize naive-as-CT AND honor explicit-UTC, the PB emit change is rollback-safe in either order — but the lockstep discipline is still honored.

**Files:**
- Modify: `scripts/db/outbox.py:745` and `:2045` (both `client_ts` writers)
- Create: `data/shared/hub-schema-changes.jsonl`
- Test: `tests/sync/test_outbox_client_ts_utc.py`

- [ ] **Step 1: File the Hub handoff spec FIRST**

```bash
cd ~/Peripheral-Brain
python -c "import json; open('data/shared/hub-schema-changes.jsonl','a').write(json.dumps({'spec_id':'1A-client-ts-utc','date':'2026-05-23','from':'builder','change':'PB outbox client_ts now emits explicit-UTC (+00:00) instead of naive-CT','hub_action':'advanceProjectMovement already normalizes both forms (Task 4); no Hub code change required — this is a heads-up + contract registration','verify':'new outbox rows carry +00:00; mutations.advance-project tests still green','status':'filed'}, default=str)+chr(10)); print('handoff filed')"
```

- [ ] **Step 2: Write the failing test**

```python
# tests/sync/test_outbox_client_ts_utc.py
import sqlite3
from datetime import datetime, timezone
from scripts.db.outbox import OutboxWriter  # adjust import to real writer entry


def test_enqueued_client_ts_is_explicit_utc(tmp_brain_db):
    conn = sqlite3.connect(tmp_brain_db)
    with OutboxWriter(conn=conn) as ob:
        ob.enqueue(table="tasks", record_id="task_x", op="update",
                   patch={"status": "done"}, base_seq=0, base_row_hash=None)
    row = conn.execute("SELECT client_ts FROM outbox WHERE record_id='task_x'").fetchone()
    client_ts = row[0]
    assert client_ts.endswith("+00:00"), client_ts  # explicit-UTC marker
    # And it must be aware-UTC ~now.
    dt = datetime.fromisoformat(client_ts)
    assert dt.tzinfo is not None
    assert abs((datetime.now(timezone.utc) - dt).total_seconds()) < 5
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/sync/test_outbox_client_ts_utc.py -v`
Expected: FAIL — current emit is naive `datetime.now().isoformat()` (no offset).

- [ ] **Step 4: Flip both client_ts writers (NO new import — `now_instant_wire` lives in `outbox.py`)**

> **CIRCULAR-IMPORT FIX (Codex smaller finding — resolved in the executable step, option (b)).** `timez.py` imports `to_utc_dt` FROM `outbox.py` (Task 1). If `outbox.py` then imported `now_instant_wire` FROM `timez.py`, that is a cycle. **Resolution (DECIDED, not optional): `now_instant_wire` (and `now_instant`) are DEFINED in `outbox.py`, and `timez.py` RE-EXPORTS them** alongside its re-export of `to_utc_dt`. One source of truth, no cycle, and `outbox.py` uses its own local function with no import. Task 1 is amended to match (see Task 1 Step 3 note). The PB-side public surface is still `timez` (callers import `now_instant`/`now_instant_wire`/`to_utc_dt` from `scripts.db.timez`); only the physical definition lives in `outbox.py`.

At `outbox.py:745` and `:2045`, change (these writers are in the same module that DEFINES `now_instant_wire`, so just call it directly):

```python
        mutation_id = _mint_mutation_id()
        now = now_instant_wire()  # explicit-UTC '...+00:00'; branch-1 honored downstream
```

Define near the top of `outbox.py` (next to `to_utc_dt`):

```python
def now_instant() -> str:
    """UTC instant, space-sep, no tz suffix: '2026-05-23 18:04:11'."""
    return datetime.now(_timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def now_instant_wire() -> str:
    """UTC instant, ISO-T, explicit offset: '2026-05-23T18:04:11+00:00'."""
    return datetime.now(_timezone.utc).replace(microsecond=0).isoformat()
```

No new import is added to `outbox.py`. `timez.py` re-exports both (Task 1 Step 3).

- [ ] **Step 5: Run the test + the LWW merge suite**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/sync/test_outbox_client_ts_utc.py tests/sync/test_outbox_lww_timestamp_compare.py -v`
Expected: PASS. `_lww_merge` (`outbox.py:1995`, `to_utc_dt(local_ts, origin="client_ts")`) now resolves the marked value via branch 1 (honor offset) — confirm no regression.

- [ ] **Step 6: Commit + relay-confirm**

```bash
cd ~/Peripheral-Brain && git commit -F <msgfile> -- scripts/db/outbox.py tests/sync/test_outbox_client_ts_utc.py data/shared/hub-schema-changes.jsonl
```
Message: `fix(sync): emit explicit-UTC client_ts from both outbox writers (Increment 1A Task 7)`. Author = ingra107. No Claude attribution.

**Relay-confirm (REQUIRED, ordering-safe):** both machines should land this so both emit `+00:00`. Ordering-safe because Hub (Task 4) treats naive as CT and explicit as honored — a half-flipped fleet is still correct. In-flight naive-CT outbox rows enqueued before the flip drain correctly (Hub normalizes them). **Rollback:** revert to `datetime.now().isoformat()`; Hub still normalizes naive-as-CT.

---

## Task 8: ONE atomic legacy UTC migration (under the snapshot)

**Specialist:** builder. **Ship-risk: C** (DATA-RISK; under the Task 5 snapshot; relay-confirm; named failure mechanism + restore). Run AFTER Tasks 5, 6, 7 are live and the snapshot is fresh (< a few hours). **PRE-REQUISITE: Task 10 backfill quarantine MUST be done first** (else a re-run re-poisons LMM).

**Why atomic (resolves Opus-LWW R1):** the LMM writer flip (CT→UTC) and the historical LMM rewrite (CT→UTC) MUST happen together. Flipping the writer alone while leaving historical CT and moving LMM to `_UTC_COLUMNS` would make the gate read still-CT historical rows as UTC (mis-order by 5h). Keeping LMM in `_CT_COLUMNS` while flipping the writer double-shifts new UTC writes. The only consistent state is: flip the writers + rewrite historical data + move the column-set classification, all in one migration. No window where the gate mis-reads on-disk data.

> **CRITICAL CORRECTION (Codex pre-exec review, confirmed against `outbox.py:257-261` HEAD): the original "atomic" framing was FALSE and is the R1 trap recurring.** The auto-runner imports the migration via `spec.loader.exec_module(mod)` (`.claude/hooks/startup/sync.py:355`), so the migration runs against **live** `outbox.py`. Live `to_utc_dt` resolves a column's zone by its **current** `_CT_COLUMNS`/`_UTC_COLUMNS` membership at runtime (`outbox.py:257-261`), NOT by the membership at the time the data was written. The instant the Task 8 commit lands, `last_meaningful_movement`/`completed_at` are in `_UTC_COLUMNS` and `_CT_COLUMNS` is empty — so a migration that calls `to_utc_dt(lmm, column="last_meaningful_movement")` reads historical CT values as **UTC and does NOT shift them** → permanent 5h-wrong data. A source-code comment claiming "this runs before the flip" is worthless: there is no "before" in a single committed file that the runner exec's whole. **THE FIX (mandatory):** the migration MUST freeze the legacy CT→UTC conversion INTERNALLY with a standalone `ZoneInfo("America/Chicago")` converter defined inside the migration module — it must NEVER call `to_utc_dt` for the legacy rewrite. AND the rewrite must run **stopped-world** (Step 0 preflight below stops sync + daemons; no gate may read the new reader-contract until the rewrite succeeds and is verified). See Step 4 (frozen converter) and the new Step 0.

> **ENTRYPOINT CORRECTION (confirmed against `.claude/hooks/startup/sync.py:357-386` HEAD): the migration must define `def upgrade(conn):`, NOT `def run(conn):`.** The auto-runner ONLY recognizes `upgrade(conn)` or `run_migration()`; any other entrypoint (including `run`) hits the fail-loud `AttributeError` at `:379` ("no recognized entrypoint") and ABORTS session-start. The original plan's `def run(conn)` would never apply and would hard-fail every session-start until renamed. All migration code + tests below use `upgrade(conn)`.

> **MIGRATION NUMBER CORRECTION (confirmed against on-disk `scripts/db/migrations/` + `sync/operations.py:43` HEAD): high-water is `087_stage3_deleted_at`, NOT 062.** The new migration is `088_normalize_timestamps_utc.py`. The original plan's "current high-water is migration 062" was ~25 migrations stale. After landing 088, bump `EXPECTED_MIN_MIGRATION` in `operations.py:43` to `088_normalize_timestamps_utc` in the SAME commit (else a peer sync against the un-migrated DB refuses — which is actually the safe direction, but the constant must reflect the new dependency).

**The three data classes (re-verify counts at execution):**
1. `projects.last_meaningful_movement` CT → UTC (writer was `query.py:1185`/`:1236`/`:1341`; default-caller `:2922`).
2. `tasks.updated_at` legacy ISO-T rows → UTC space-sep — **CONFIRMED-CT-PROVENANCE rows ONLY** (the "43-row" class is STALE; RE-COUNT at HEAD via Step 1). **DANGER (Codex finding 4):** a naive ISO-T value like `2026-05-22T21:00:00` may already be UTC (e.g. minted by a post-cutover writer or a Hub-origin echo), in which case parsing it as CT and shifting −5h CORRUPTS it. The shift is allowed ONLY for rows whose legacy-CT provenance is confirmed per-row (see Step 1b provenance guard). A row that cannot be proven legacy-CT is LEFT UNTOUCHED.
3. `tasks.completed_at` PB-CT → UTC (governing principle §1: completed_at is a UTC instant displayed local, NOT a CT exception). Same provenance caution as class 2 if any `completed_at` value already carries an explicit offset/Z or is provably post-cutover — leave those untouched.

**Files:**
- Modify writers: `scripts/db/query.py:1185` (LMM default), `:1236`+`:1341` (split completion clock: CT→UTC for LMM, UTC for completed_at), `:1240` (completed_at), verify `:2922` (covered by `:1185` default).
- Modify column-set: `scripts/db/outbox.py:160-163` move `last_meaningful_movement` + `completed_at` from `_CT_COLUMNS` → `_UTC_COLUMNS` (`:151-153`).
- Create: `scripts/db/migrations/088_normalize_timestamps_utc.py` (high-water is `087_stage3_deleted_at`; confirm via `git ls-files scripts/db/migrations/*.py scripts/db/migrations/*.sql | sort | tail`). Entrypoint MUST be `def upgrade(conn):` (auto-runner contract, `sync.py:357`).
- Modify: `scripts/db/sync/operations.py:43` — bump `EXPECTED_MIN_MIGRATION = "088_normalize_timestamps_utc"` in the SAME commit.
- Test: `tests/db/test_migration_normalize_timestamps_utc.py`

- [ ] **Step 0: STOPPED-WORLD PREFLIGHT (mandatory — Codex "hard preflight" requirement)**

The data rewrite is a stopped-world migration. NOTHING may write the affected columns or read the new reader-contract until the rewrite succeeds and is verified. Before applying (on EACH machine, under its own fresh Task-5 snapshot):

```bash
cd ~/Peripheral-Brain
# 1. Stop all daemons + any scheduled sync (pomodoro, telegram, file_watcher, hub_ai_listener, sync cron).
python scripts/utils/check_daemons.py --stop-all   # confirm 0 holders of the shared lock
# 2. Confirm no sync is mid-flight and the outbox is drained (no in-flight client_ts being minted).
python -c "import sqlite3; c=sqlite3.connect('data/brain.db'); print('pending outbox:', c.execute('SELECT COUNT(*) FROM outbox WHERE ack_at IS NULL').fetchone()[0])"
# 3. Confirm the Task-5 snapshot is FRESH (< a few hours) — re-run Task 5 if not.
```
Expected: 0 daemon holders, 0 (or fully-understood) pending outbox rows, fresh snapshot present. If sync runs DURING the rewrite, a half-migrated column can be read by a gate and propagated — the whole point of stopped-world is to deny that. The Task 8 commit (writers + column-set + migration) MUST land and the migration MUST complete before sync/daemons restart. Re-order so the `_CT_COLUMNS`/`_UTC_COLUMNS` membership change in `outbox.py` does NOT take effect in any live process until the rewrite is done — achieved by (a) the frozen internal converter (Step 4, the rewrite does not depend on `_CT_COLUMNS` at all) and (b) daemons stopped so no live process re-reads the flipped `outbox.py` mid-rewrite.

- [ ] **Step 1: Re-count the legacy data at HEAD (Opus-LWW A5/Alteration 11 — provenance must be re-verified)**

```bash
cd ~/Peripheral-Brain && python -c "
import sqlite3; c=sqlite3.connect('data/brain.db')
isoT = c.execute(\"SELECT COUNT(*) FROM tasks WHERE updated_at LIKE '%T%'\").fetchone()[0]
isoT_offset = c.execute(\"SELECT COUNT(*) FROM tasks WHERE updated_at LIKE '%T%' AND (updated_at LIKE '%+%' OR updated_at LIKE '%Z')\").fetchone()[0]
lmm  = c.execute('SELECT COUNT(*) FROM projects WHERE last_meaningful_movement IS NOT NULL').fetchone()[0]
comp = c.execute('SELECT COUNT(*) FROM tasks WHERE completed_at IS NOT NULL').fetchone()[0]
print(f'tasks.updated_at ISO-T rows: {isoT} (of which {isoT_offset} carry an explicit offset/Z and need NO shift)')
print(f'projects.lmm non-null: {lmm}'); print(f'tasks.completed_at non-null: {comp}')
"
```
Record the ACTUAL counts in the migration docstring. **The "43" is STALE — re-count is mandatory.** ISO-T rows carrying an explicit offset/Z are already-resolvable and must NEVER be CT-shifted.

- [ ] **Step 1b: Build the per-row legacy-CT provenance allowlist (Codex finding 4 — block double-shift of already-UTC naive ISO-T)**

A naive ISO-T `updated_at` with no offset is AMBIGUOUS: it could be legacy-CT (pre-1A brain.db emit) OR already-UTC (a post-cutover or Hub-origin value that happens to be ISO-T). Shifting an already-UTC value −5h corrupts it permanently. Before the rewrite, classify each naive-ISO-T row's provenance and shift ONLY confirmed-legacy-CT rows:

```bash
cd ~/Peripheral-Brain && python -c "
import sqlite3; c=sqlite3.connect('data/brain.db')
# Confirmed-CT iff: naive (no offset/Z), ISO-T, AND created BEFORE the 1A client_ts cutover
# AND not a Hub-origin row. Cross-ref last_mutation_id (Hub-applied rows carry one) and
# created_at. A row we cannot PROVE is legacy-CT is left UNTOUCHED (fail-closed).
rows = c.execute('''SELECT id, updated_at, last_mutation_id, created_at FROM tasks
                    WHERE updated_at LIKE \"%T%\"
                      AND updated_at NOT LIKE \"%+%\" AND updated_at NOT LIKE \"%Z\"''').fetchall()
print(f'naive ISO-T candidates: {len(rows)}')
for r in rows: print(r)
"
```
Decision rule (encode in the migration as an explicit allowlist, NOT a blanket `LIKE '%T%'`): a row is shift-eligible iff naive ISO-T AND its `created_at`/last-write predates the Task-7 `client_ts` cutover commit AND it is not a Hub-origin echo. If the candidate set is small (expected ~dozens), hand-audit and embed the explicit `id` allowlist in the migration. **Add a regression test (Step 2) for an already-UTC naive ISO-T row that MUST NOT be shifted.**

- [ ] **Step 2: Write the failing test**

```python
# tests/db/test_migration_normalize_timestamps_utc.py
import sqlite3
from scripts.db.migrations import _088_normalize_timestamps_utc as mig  # module loaded by stem; see note

# The migration's per-row eligibility (Step 1b) is parameterized on a
# provenance allowlist. The tests pass an explicit shift-eligible id set so
# the already-UTC cases are NOT shifted regardless of string shape.

def test_lmm_ct_converted_to_utc(seeded_db):
    c = sqlite3.connect(seeded_db)
    c.execute("INSERT INTO projects (id, last_meaningful_movement) VALUES ('proj_a', '2026-05-22 16:00:00')")  # CT
    c.commit()
    mig.upgrade(c)
    out = c.execute("SELECT last_meaningful_movement FROM projects WHERE id='proj_a'").fetchone()[0]
    assert out == "2026-05-22 21:00:00"  # +5h (CDT) → UTC


def test_iso_t_updated_at_normalized_when_provenance_confirmed(seeded_db):
    c = sqlite3.connect(seeded_db)
    # Legacy-CT ISO-T row: naive, predates cutover, no last_mutation_id (PB-origin).
    c.execute("INSERT INTO tasks (id, updated_at, created_at) VALUES ('task_a', '2026-05-22T16:00:00', '2026-05-01 00:00:00')")
    c.commit()
    mig.upgrade(c)
    out = c.execute("SELECT updated_at FROM tasks WHERE id='task_a'").fetchone()[0]
    assert out == "2026-05-22 21:00:00"  # space-sep UTC


def test_already_utc_naive_iso_t_NOT_shifted(seeded_db):
    # CODEX FINDING 4: a naive ISO-T value that is ALREADY UTC must NOT be
    # shifted −5h. Provenance guard (no proven legacy-CT) → leave untouched.
    c = sqlite3.connect(seeded_db)
    # e.g. a post-cutover or Hub-echo value that happens to be naive ISO-T.
    c.execute("INSERT INTO tasks (id, updated_at, last_mutation_id, created_at) VALUES "
              "('task_utc', '2026-05-22T21:00:00', 'mut_hub_x', '2026-05-23 12:00:00')")
    c.commit()
    mig.upgrade(c)
    out = c.execute("SELECT updated_at FROM tasks WHERE id='task_utc'").fetchone()[0]
    # MUST be unchanged (not 2026-05-22 16:00:00). At most normalized T→space, never shifted.
    assert out in ("2026-05-22T21:00:00", "2026-05-22 21:00:00"), out
    assert "16:00:00" not in out, f"double-shifted an already-UTC value: {out}"


def test_iso_t_with_explicit_offset_NOT_shifted(seeded_db):
    c = sqlite3.connect(seeded_db)
    c.execute("INSERT INTO tasks (id, updated_at) VALUES ('task_off', '2026-05-22T21:00:00+00:00')")
    c.commit()
    mig.upgrade(c)
    out = c.execute("SELECT updated_at FROM tasks WHERE id='task_off'").fetchone()[0]
    assert "16:00:00" not in out  # explicit-UTC honored, never CT-shifted


def test_migration_idempotent_no_double_shift(seeded_db):
    c = sqlite3.connect(seeded_db)
    c.execute("INSERT INTO projects (id, last_meaningful_movement) VALUES ('proj_b', '2026-05-22 16:00:00')")
    c.commit()
    mig.upgrade(c); mig.upgrade(c)  # twice
    out = c.execute("SELECT last_meaningful_movement FROM projects WHERE id='proj_b'").fetchone()[0]
    assert out == "2026-05-22 21:00:00"  # NOT shifted twice


def test_already_utc_space_sep_untouched(seeded_db):
    c = sqlite3.connect(seeded_db)
    c.execute("INSERT INTO tasks (id, updated_at) VALUES ('task_c', '2026-05-22 21:00:00')")  # already UTC space-sep
    c.commit()
    mig.upgrade(c)
    out = c.execute("SELECT updated_at FROM tasks WHERE id='task_c'").fetchone()[0]
    assert out == "2026-05-22 21:00:00"  # unchanged
```

> **Module import note:** the migration file is `088_normalize_timestamps_utc.py`. A leading digit is not a legal Python identifier, so the test imports it by an underscore-prefixed alias OR loads it via `importlib.util.spec_from_file_location` (mirror the pattern in `tests/db/test_migration_030.py`). The auto-runner loads it the same way (`sync.py:353`).
>
> **Idempotency mechanism:** the migration records itself in `schema_migrations` and is keyed to run-once. The per-row guard is NOT a blanket `LIKE '%T%'` — it is the Step-1b provenance allowlist (only confirmed-legacy-CT rows shift; offset/Z and unproven-naive rows are untouched). For LMM/completed_at: the writers are flipped in the SAME commit so post-migration writes are already UTC, and a value already carrying an offset/Z is honored (never CT-shifted). A re-run with the migration recorded in `schema_migrations` is a no-op.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/db/test_migration_normalize_timestamps_utc.py -v`
Expected: FAIL — migration module not yet written.

- [ ] **Step 4: Write the migration**

```python
# scripts/db/migrations/088_normalize_timestamps_utc.py
"""Increment 1A Task 8: one-time legacy timestamp UTC migration.

Converts CONFIRMED-LEGACY-CT rows to canonical UTC, committed in the SAME
change as the writer flip (query.py) and the column-set reclassification
(outbox.py).

R1 TRAP AVOIDANCE (Codex pre-exec review): this migration MUST NOT call
to_utc_dt for the legacy rewrite. to_utc_dt resolves a column's zone by its
CURRENT _CT_COLUMNS/_UTC_COLUMNS membership at runtime (outbox.py:257-261), and
the auto-runner exec's THIS file against LIVE outbox.py — by which point
last_meaningful_movement/completed_at are already in _UTC_COLUMNS. Calling
to_utc_dt(column="last_meaningful_movement") would then read historical CT as
UTC and NOT shift it → permanent 5h-wrong data. So legacy CT→UTC is FROZEN
INTERNALLY here with a standalone ZoneInfo("America/Chicago") converter that
does not depend on any mutable classifier.

PROVENANCE GUARD (Codex finding 4): naive ISO-T updated_at is ambiguous — it
may already be UTC. We shift ONLY rows whose legacy-CT provenance is confirmed
(Step 1b allowlist). Rows carrying an explicit offset/Z, or that cannot be
proven legacy-CT, are LEFT UNTOUCHED.

Actual row counts + the audited shift-eligible id allowlist at migration time:
see commit body. Idempotent: recorded in schema_migrations; per-row provenance
guard + offset/Z skip prevent double-shift on re-run.

ENTRYPOINT: def upgrade(conn) — the auto-runner contract (sync.py:357). NOT run().
"""
import sqlite3
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

MIGRATION_NAME = "088_normalize_timestamps_utc"
_CT = ZoneInfo("America/Chicago")

# Audited allowlist of task ids whose naive ISO-T updated_at is confirmed
# legacy-CT (built in Step 1b). EMPTY here — fill from the Step-1b audit before
# applying. An empty allowlist means NO updated_at row is shifted (fail-closed).
_ISO_T_SHIFT_ELIGIBLE_IDS: frozenset[str] = frozenset({
    # "task_...",  # populate from Step 1b provenance audit
})


def _freeze_ct_naive_to_utc(s: str) -> str | None:
    """Convert a naive wall-clock string KNOWN to be America/Chicago to UTC
    space-sep. DST-correct per-instant via ZoneInfo. Returns None on
    unparseable input. Does NOT consult any column/origin classifier — this is
    the frozen legacy converter, independent of outbox.py membership."""
    s = (s or "").strip()
    if not s:
        return None
    s_norm = s.replace("T", " ")
    # If it already carries an offset/Z it is NOT naive-CT — caller must skip.
    try:
        # Parse as naive (strip any offset defensively; caller guarantees naive).
        dt = datetime.strptime(s_norm[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    aware_ct = dt.replace(tzinfo=_CT)
    return aware_ct.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _is_naive(s: str) -> bool:
    """True iff the string carries NO explicit offset/Z (so it is wall-clock)."""
    s = (s or "").strip()
    if s.endswith("Z"):
        return False
    # Offset in the time portion, e.g. +00:00 / -05:00.
    return not (("+" in s[10:]) or ("-" in s[10:]))


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    # Guard: if already recorded, no-op (idempotent).
    try:
        if cur.execute("SELECT 1 FROM schema_migrations WHERE name = ?",
                       (MIGRATION_NAME,)).fetchone():
            return
    except sqlite3.OperationalError:
        pass  # test fixtures may lack schema_migrations

    # 1. tasks.updated_at — legacy ISO-T (CT) → UTC space-sep, ALLOWLIST ONLY.
    #    Naive-ISO-T rows NOT in the allowlist are LEFT UNTOUCHED (may be UTC).
    #    Offset/Z rows are skipped (already resolvable).
    for (tid, ua) in cur.execute(
        "SELECT id, updated_at FROM tasks WHERE updated_at LIKE '%T%'"
    ).fetchall():
        if not _is_naive(ua):
            continue  # explicit offset/Z → already UTC-resolvable, never shift
        if tid not in _ISO_T_SHIFT_ELIGIBLE_IDS:
            continue  # unproven provenance → fail-closed, leave untouched
        out = _freeze_ct_naive_to_utc(ua)
        if out is not None:
            cur.execute("UPDATE tasks SET updated_at = ? WHERE id = ?", (out, tid))

    # 2. projects.last_meaningful_movement CT → UTC (frozen converter; naive only).
    for (pid, lmm) in cur.execute(
        "SELECT id, last_meaningful_movement FROM projects WHERE last_meaningful_movement IS NOT NULL"
    ).fetchall():
        if not _is_naive(lmm):
            continue  # already carries offset/Z → leave (post-cutover value)
        out = _freeze_ct_naive_to_utc(lmm)
        if out is not None:
            cur.execute("UPDATE projects SET last_meaningful_movement = ? WHERE id = ?", (out, pid))

    # 3. tasks.completed_at PB-CT → UTC (frozen converter; naive only).
    for (tid, ca) in cur.execute(
        "SELECT id, completed_at FROM tasks WHERE completed_at IS NOT NULL"
    ).fetchall():
        if not _is_naive(ca):
            continue
        out = _freeze_ct_naive_to_utc(ca)
        if out is not None:
            cur.execute("UPDATE tasks SET completed_at = ? WHERE id = ?", (out, tid))

    # The auto-runner records schema_migrations itself (sync.py:388-393), but
    # record here too for direct-call idempotency in tests / manual apply.
    try:
        cur.execute("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)",
                    (MIGRATION_NAME,))
    except sqlite3.OperationalError:
        pass
    conn.commit()
```

> **CRITICAL ordering within the migration (corrected):** the rewrite uses the FROZEN internal `_freeze_ct_naive_to_utc` — it does NOT consult `_CT_COLUMNS`/`_UTC_COLUMNS` at all, so it is immune to the runtime-membership trap regardless of when the column-set flip in `outbox.py` takes effect. The writers (query.py) and column-set move (outbox.py) ship in the SAME commit so post-migration WRITES are UTC, but the historical REWRITE no longer depends on classifier state. Combined with the Step 0 stopped-world preflight (daemons stopped, no live process re-reads flipped `outbox.py` mid-rewrite), this is the genuinely-atomic state the original plan only claimed. **Note on `schema_migrations.applied_at`:** the column has a `DEFAULT (datetime('now','localtime'))` (`sync.py:164`) — the original plan's explicit `INSERT ... (name, applied_at) VALUES (?, datetime('now'))` is dropped in favor of `INSERT OR IGNORE (name)` to match the auto-runner's own insert and avoid a column-list mismatch.

- [ ] **Step 5: Flip the writers (SAME commit as the migration)**

`query.py:1236` — split the single CT `now_iso` into a UTC instant for everything that is an Instant:

```python
        from scripts.db.timez import now_instant
        now_iso = now_instant()  # UTC space-sep — used for completed_at AND LMM
        patch = {
            "completed": 1,
            "status": "done",
            "completed_at": now_iso,   # now UTC (governing principle §1)
            "completed_by": "nick-ingraham",
        }
```

`query.py:1185` — flip the LMM default to UTC (covers the `:2922` set_project_state caller which passes no ts):

```python
        from scripts.db.timez import now_instant
        ts = ts_iso or now_instant()  # UTC, not _dt.now() CT
```

`query.py:1341` — `now_iso` is now UTC, so `self._advance_project_movement(parent_project_id, now_iso)` passes UTC. No line change needed beyond the `:1236` flip, but VERIFY.

`outbox.py:151-163` — move both columns to UTC:

```python
_UTC_COLUMNS: frozenset[str] = frozenset({
    "updated_at",
    "last_meaningful_movement",  # flipped UTC in Increment 1A Task 8 (writer + data migrated atomically)
    "completed_at",              # governing principle §1: UTC instant, displayed local
})
_CT_COLUMNS: frozenset[str] = frozenset()  # emptied — all sync columns are UTC post-1A
```

> Circular-import guard: `query.py` importing `now_instant` from `timez` which imports from `outbox` — `query.py` already imports from `outbox` heavily, so the chain `query → timez → outbox` is fine (no cycle back into query). Confirm at execution.

- [ ] **Step 6: Verify writers + column-set + migration tests pass**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/db/test_migration_normalize_timestamps_utc.py tests/db/test_a3_outbox.py tests/sync/test_lww_timestamp_zone.py -v`
Expected: PASS.

- [ ] **Step 7: REHEARSE on a COPY first — migration + a real wrangler export DRY-RUN (Codex "rehearsal" requirement)**

The migration is rehearsed on a copied brain.db; the D1 export/restore is dry-run rehearsed BEFORE touching live state (this also exercises the Task-5 fix to the `processed_mutations` column list).

```bash
cd ~/Peripheral-Brain
# 7a. Migration rehearsal on a COPY (load by file path; leading-digit module name).
cp data/snapshots/2026-05-23-increment-1A/brain.db /tmp/rehearsal.db
python -c "
import importlib.util, sqlite3
spec = importlib.util.spec_from_file_location('mig088', 'scripts/db/migrations/088_normalize_timestamps_utc.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
c = sqlite3.connect('/tmp/rehearsal.db')
before_iso = c.execute(\"SELECT COUNT(*) FROM tasks WHERE updated_at LIKE '%T%'\").fetchone()[0]
m.upgrade(c)
after_iso = c.execute(\"SELECT COUNT(*) FROM tasks WHERE updated_at LIKE '%T%'\").fetchone()[0]
print(f'rehearsal applied; naive-ISO-T allowlisted shifted; ISO-T-with-offset preserved. before={before_iso} after={after_iso}')
print('spot-check 5 LMM:', c.execute('SELECT id, last_meaningful_movement FROM projects WHERE last_meaningful_movement IS NOT NULL LIMIT 5').fetchall())
"
```
Expected: only allowlisted naive-ISO-T rows shifted; offset/Z rows untouched; LMM values now +5h (CDT) from their prior CT; no exceptions.

```bash
# 7b. D1 export/restore DRY-RUN with the CORRECTED column lists (Task 5 fix).
cd ~/mn-ccore-lab
npx wrangler d1 execute mnccore-lab --remote --json --command \
  "SELECT mutation_id, origin_machine, processed_at, outcome, table_name, record_id FROM processed_mutations ORDER BY processed_at DESC" \
  | python -c "import sys,json; d=json.load(sys.stdin); print('processed_mutations export OK rows:', len(d[0]['results']))"
```
Expected: the export succeeds with the REAL `processed_mutations` columns (no `last_mutation_id`/`seq` — those don't exist on that table). If this dry-run fails, STOP — the rollback artifact is invalid; do not flip.

- [ ] **Step 8: Apply for real (stopped-world, under the fresh snapshot) + verify**

Step 0 preflight must already have stopped daemons/sync. Land the Task 8 commit, then apply the migration via the auto-runner OR a direct call (do NOT use `migrate.py` — that is the legacy Airtable bootstrap, it has no `--status`/`upgrade` runner). Direct apply:
```bash
cd ~/Peripheral-Brain && python -c "
import importlib.util, sqlite3
spec = importlib.util.spec_from_file_location('mig088', 'scripts/db/migrations/088_normalize_timestamps_utc.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
c = sqlite3.connect('data/brain.db'); m.upgrade(c); print('applied')
print('schema_migrations:', c.execute(\"SELECT name FROM schema_migrations WHERE name='088_normalize_timestamps_utc'\").fetchone())
"
python -c "import sqlite3; c=sqlite3.connect('data/brain.db'); print('naive ISO-T left (should equal the count NOT in the allowlist):', c.execute(\"SELECT COUNT(*) FROM tasks WHERE updated_at LIKE '%T%' AND updated_at NOT LIKE '%+%' AND updated_at NOT LIKE '%Z'\").fetchone()[0])"
python scripts/db/health.py
```
Expected: migration recorded; allowlisted rows shifted; no row became "stale forever"; health clean. Only THEN restart daemons/sync (still inside the WATCH window below).

- [ ] **Step 9: Update schema.sql (R12 parity) + commit**

Run `python scripts/db/check_schema_sql_parity.py`; if the migration changes any DEFAULT or column shape, update `schema.sql` in the same commit.

```bash
cd ~/Peripheral-Brain && git commit -F <msgfile> -- scripts/db/migrations/088_normalize_timestamps_utc.py scripts/db/query.py scripts/db/outbox.py scripts/db/sync/operations.py tests/db/test_migration_normalize_timestamps_utc.py
```
(Includes `operations.py` for the `EXPECTED_MIN_MIGRATION = "088_normalize_timestamps_utc"` bump — same commit so the dependency is declared atomically.)
Message: `feat(sync): atomic UTC migration — LMM + ISO-T updated_at + completed_at CT→UTC, flip writers + column-set (Increment 1A Task 8)`. Author = ingra107. No Claude attribution.

**Relay-confirm (REQUIRED):** the peer machine auto-applies routine `*.py` migrations at session-start (`auto_run_migrations`), BUT this is identity-adjacent / high-blast-radius data migration → use the `cross-machine-relay` Migration & state-change confirmation section. Both machines apply under their OWN fresh snapshot, BOTH under their own Step 0 stopped-world preflight. Confirm both converged via `sync.py status --verbose` diff.

**WATCH WINDOW (Codex "concrete watch window" requirement) — post-apply, before discarding the snapshot:**

After daemons/sync restart, run the following diff queries every ~15 min for a 2-hour window (decision deadline: 2h post-apply). The acceptable count for each is **0**:

```bash
cd ~/Peripheral-Brain
# (a) No project LMM should disagree with Hub by ~5h after convergence.
python scripts/db/sync.py pull && python scripts/db/sync.py status --verbose
# (b) Spurious LMM churn (advance→revert) — must be silent in wrangler tail.
cd ~/mn-ccore-lab && npx wrangler tail --format pretty   # watch for repeated advanceProjectMovement on the same project
# (c) No done→todo reverts since apply:
cd ~/Peripheral-Brain && python -c "import sqlite3; c=sqlite3.connect('data/brain.db'); print('recently-reopened (investigate if >0):', c.execute(\"SELECT COUNT(*) FROM tasks WHERE status!='done' AND completed_at IS NOT NULL AND updated_at > datetime('now','-2 hours')\").fetchone()[0])"
# (d) No row stale-forever: LMM that is now in the FUTURE vs UTC now (a sign of a wrong +5h on an already-UTC row).
python -c "import sqlite3; c=sqlite3.connect('data/brain.db'); print('LMM in the future (should be 0):', c.execute(\"SELECT COUNT(*) FROM projects WHERE last_meaningful_movement > datetime('now','+10 minutes')\").fetchone()[0])"
```

**Acceptable: every count = 0, no churn in tail, convergence clean. Decision deadline: 2 hours post-apply.** If ANY count is non-zero and not explained within the window → **RESTORE TRIGGER:** restore brain.db from the Task 5 snapshot per `RESTORE.md` (the snapshot is valid for HOURS only — restoring after the window clobbers real team writes, so restore-fast-or-never). **Rollback:** restore brain.db from the Task 5 snapshot (no clean SQL down for a lossy rewrite). D1 was not modified by this migration; D1 restore is needed ONLY if a wrong push propagated despite the fail-closed Task 6 gate — in that case use the Task-5 D1 export + scripted restore.

---

## Task 9: Delete zone-guessing scaffold + lint WARN→ERROR + retire shadow

**Specialist:** builder. **Ship-risk: B** (sequenced strictly AFTER Task 8 is live + converged on both machines; rollback = revert). Per Opus-timediscipline §5: the `_CT_COLUMNS`/`_CT_ORIGINS` localization branches are TRANSITIONAL scaffold, deletable once no live write produces a naive-CT sync value AND legacy data is migrated. Keep `to_utc_dt` branch 1 (honor marker) + `ZoneContractError` (permanent).

**Files:**
- Modify: `scripts/db/outbox.py` — delete `_CT_COLUMNS` branch (`:260-261`), `_CT_ORIGINS` branch (`:254-255`), `_ct_naive_to_utc` (`:175-199`) if no remaining caller; keep branch 1 (`:246-248`) + `ZoneContractError`.
- Modify: `scripts/db/sync/records.py:159-176` — delete the `local_time_is_localtime` localtime path; keep the function (callers pass `=False` post-migration).
- Modify: `scripts/db/check_sync_antipatterns.py` — default `PB_LINT_MODE` flip OR document the ENFORCE cutover.
- Modify: `scripts/db/sync/drivers/hub.py:82-152` + delete `scripts/db/sync/lww_shadow.py` — retire the shadow module (its job ended when the gates flipped).
- Test: existing `tests/sync/drivers/test_pull_lww_zone.py`, `tests/sync/test_records.py`.

- [ ] **Step 1: Confirm no live caller produces a naive-CT sync value**

Run: `cd ~/Peripheral-Brain && python scripts/db/check_sync_antipatterns.py` with `PB_LINT_MODE=enforce` — R22/R23 must report ZERO hits in the sync path (the writers were all flipped in Tasks 7+8). If any hit remains, fix it before deleting the scaffold.

- [ ] **Step 2: Write the test asserting ZoneContractError on a naive value with no marker**

> **STALE-TEST CORRECTION (Codex smaller finding, confirmed against `outbox.py:254-263` HEAD).** Two facts the original test got wrong:
> 1. An UNKNOWN column ALREADY raises `ZoneContractError` at HEAD (`:263`) — a test using `column="some_unknown_column"` PASSES before AND after the scaffold deletion, so it captures NO behavior change.
> 2. After Task 8, BOTH `last_meaningful_movement` and `completed_at` are in `_UTC_COLUMNS` (not `_CT_COLUMNS`, which Task 8 emptied). So `to_utc_dt(naive, column="last_meaningful_movement")` resolves as UTC (branch 2c) — it does NOT raise. The column-side scaffold is already dead by Task 8.
>
> The genuine behavior change THIS task (9) introduces is on the **`_CT_ORIGINS` side**: after Task 7, `client_ts` emits explicit-UTC (honored via branch 1), so the `_CT_ORIGINS` branch (`:254-255`) is dead code. Task 9 DELETES `_CT_ORIGINS`. The observable change: a *naive* value tagged `origin="client_ts"` (a shape that no longer occurs post-Task-7 but a test can construct) resolves as CT BEFORE deletion and RAISES after (client_ts is no longer in `_CT_ORIGINS`, not in `_UTC_ORIGINS`, no column → raise). Test THAT.

```python
# tests/sync/test_records.py — add
import pytest
from scripts.db.outbox import to_utc_dt, ZoneContractError


def test_unknown_column_raises_today_and_after():
    # Baseline guard: an unknown column ALREADY raises at HEAD (outbox.py:263).
    # Unchanged by this task — kept to pin the no-guess contract.
    with pytest.raises(ZoneContractError):
        to_utc_dt("2026-05-22 16:00:00", column="some_unknown_column")


def test_naive_client_ts_origin_raises_after_ct_origins_deleted():
    # THE behavior change: pre-deletion, origin="client_ts" is in _CT_ORIGINS
    # and a NAIVE value CT-converts (branch 2b). Post-deletion (this task),
    # _CT_ORIGINS is gone, so a naive client_ts with no UTC context RAISES.
    # (Post-Task-7 client_ts is explicit-UTC and honored via branch 1, so this
    # naive shape no longer occurs in production — the test constructs it.)
    with pytest.raises(ZoneContractError):
        to_utc_dt("2026-05-22 16:00:00", origin="client_ts")


def test_explicit_marker_still_honored():
    got = to_utc_dt("2026-05-22T21:00:00+00:00")
    assert got.utcoffset().total_seconds() == 0


def test_post_task8_utc_column_still_resolves():
    # Guard: LMM/completed_at are in _UTC_COLUMNS post-Task-8, so a naive value
    # tagged with that column resolves as UTC (NOT raise). This must remain true
    # after the scaffold deletion — only the CT branches are removed.
    got = to_utc_dt("2026-05-22 21:00:00", column="last_meaningful_movement")
    assert got.utcoffset().total_seconds() == 0
```

- [ ] **Step 3: Run to verify the RIGHT test fails.** `test_unknown_column_raises_today_and_after` + `test_post_task8_utc_column_still_resolves` PASS already (guards). `test_naive_client_ts_origin_raises_after_ct_origins_deleted` FAILS today (the `_CT_ORIGINS` branch still CT-converts client_ts) and PASSES after Step 4 deletes that branch.

Run: `cd ~/Peripheral-Brain && python -m pytest tests/sync/test_records.py::test_naive_client_ts_origin_raises_after_ct_origins_deleted -v`
Expected: FAIL pre-deletion, PASS post-deletion.

- [ ] **Step 4: Delete the CT-guessing branches**

In `outbox.py:to_utc_dt`, remove branch 2b (`_CT_ORIGINS`) and 2d (`_CT_COLUMNS`) so naive values resolve only via `_UTC_ORIGINS`/`_UTC_COLUMNS` or raise `ZoneContractError`. Delete `_ct_naive_to_utc` and the now-empty `_CT_COLUMNS`/`_CT_ORIGINS` frozensets. In `records.py:159-176`, delete the `if local_time_is_localtime:` block (callers now pass `=False`).

- [ ] **Step 5: Retire the shadow module**

Delete the `_shadow_pull_gate` calls + helper (`hub.py:82-152`) and remove `scripts/db/sync/lww_shadow.py`. The gates now apply `decision_new` directly (Task 6); the shadow's observe-only job is done.

- [ ] **Step 6: Flip the lint to ERROR**

Set the default in `check_sync_antipatterns.py:631` (or wire the CI/pre-commit env) so R20-R23 hard-fail. Confirm: `PB_LINT_MODE=enforce python scripts/db/check_sync_antipatterns.py` exits 0 (no remaining hits in scope).

- [ ] **Step 7: Run the full sync + db suites**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/sync/ tests/db/ -q && python scripts/db/check_sync_antipatterns.py`
Expected: PASS; lint clean in ENFORCE mode.

- [ ] **Step 8: Commit**

```bash
cd ~/Peripheral-Brain && git rm scripts/db/sync/lww_shadow.py
git commit -F <msgfile> -- scripts/db/outbox.py scripts/db/sync/records.py scripts/db/sync/drivers/hub.py scripts/db/check_sync_antipatterns.py scripts/db/sync/lww_shadow.py tests/sync/test_records.py
```
Message: `refactor(sync): delete CT zone-guessing scaffold, retire shadow, lint→ERROR (Increment 1A Task 9)`. Author = ingra107. No Claude attribution.

**Rollback:** revert the commit (restores the scaffold + shadow). Safe because the migrated data is already UTC — the scaffold being present again is harmless (its CT branches just never fire).

---

## Task 10: Hygiene + omitted hazards

**Specialist:** builder. **Ship-risk: A** (mostly independent), EXCEPT the backfill quarantine which is a **BLOCKING pre-req for Task 8**.

**Files:**
- Modify: `scripts/db/backfill_last_meaningful_movement.py` (quarantine) — DO THIS BEFORE TASK 8.
- Modify: `scripts/db/sync/operations.py:920` (latent Bug-2).
- Modify: `Context/Topics/shared-schema-registry.md` (register zone contract).
- Create: `Context/Decisions/2026-05-23-increment-1A-timestamp-utc-cutover.md`.

- [ ] **Step 1: Quarantine the backfill script (BLOCKING for Task 8 — Opus-LWW R4/A3)**

`backfill_last_meaningful_movement.py` writes CT-sourced LMM via raw `UPDATE` (`:213-217`) with a raw-string `new_ts <= cur_ts` skip-guard (`:208`). After Task 8 flips LMM to UTC, a re-run re-poisons the column. Add a refuse-to-run guard at the top of `main()`:

```python
    # Increment 1A: LMM is UTC post-Task-8. This backfill computes CT-sourced
    # MAX and would re-poison the column. Refuse unless explicitly overridden
    # with UTC-normalized sources.
    if not args.allow_post_utc_cutover:
        print("REFUSED: backfill_last_meaningful_movement re-poisons UTC LMM "
              "post-Increment-1A. Its sources (completed_at, client_ts) must be "
              "UTC-normalized before re-running. Pass --allow-post-utc-cutover "
              "only after auditing the sources.", file=sys.stderr)
        return 2
```
Add the `--allow-post-utc-cutover` argparse flag (default False).

- [ ] **Step 2: Test the quarantine**

```python
# tests/db/test_backfill_lmm_quarantine.py
import subprocess, sys
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]

def test_backfill_refuses_without_override():
    res = subprocess.run([sys.executable, "scripts/db/backfill_last_meaningful_movement.py", "--dry-run"],
                         cwd=REPO, capture_output=True, text=True)
    assert res.returncode == 2
    assert "REFUSED" in res.stderr
```
Run: `cd ~/Peripheral-Brain && python -m pytest tests/db/test_backfill_lmm_quarantine.py -v` — expect FAIL pre-fix, PASS post-fix.

- [ ] **Step 3: Fix the latent second freshness-guard caller (`operations.py:920`)**

The stub-fallback path `LWWResolver(local_time_is_localtime=True)` localizes UTC `record.updated_at` as CT (latent Bug-2; dead today because Hub has `apply_pull`, but lands if a future remote lacks it). Change to `local_time_is_localtime=False` (the resolver's `record.updated_at` is UTC by contract) AND add an assertion/comment pinning it:

```python
        # Increment 1A: record.updated_at is UTC by contract; do NOT localize.
        # (Was =True — latent Bug-2 that would localize a UTC value as CT if a
        # future remote lacks apply_pull. Hub has apply_pull so this path is
        # dead today, but pin it correct.)
        resolver_ = resolver or LWWResolver(local_time_is_localtime=False)
```

- [ ] **Step 4: Register the zone contract in `shared-schema-registry.md`**

Add a "Timestamp zone contract (Increment 1A, 2026-05-23)" subsection documenting: all synced Instant columns (`updated_at`, `last_meaningful_movement`, `completed_at`, `client_ts`) are UTC on-disk/on-wire; CivilDate columns (`due_date`, meeting `date`) are date+viewer-zone; the canonical helpers (`timez.py`, `src/lib/time.ts`); and the lint rules R20-R23. Update the existing `last_meaningful_movement` row at `:229` to note UTC (was CT pre-1A).

- [ ] **Step 5: Write the decision doc**

Create `Context/Decisions/2026-05-23-increment-1A-timestamp-utc-cutover.md` capturing: governing principle (store UTC, display local), the snapshot doctrine (Codex-correct vs Opus-LWW), the atomic-migration rationale (R1 resolution), the R20-R23 lint, and the relay-confirm points. Cross-link the design spec + the three Opus reviews.

- [ ] **Step 6: Commit (interleaved — quarantine before Task 8; the rest any time)**

```bash
cd ~/Peripheral-Brain && git commit -F <msgfile> -- scripts/db/backfill_last_meaningful_movement.py tests/db/test_backfill_lmm_quarantine.py scripts/db/sync/operations.py Context/Topics/shared-schema-registry.md Context/Decisions/2026-05-23-increment-1A-timestamp-utc-cutover.md
```
Message: `chore(sync): Increment 1A hygiene — quarantine backfill, fix operations.py:920 Bug-2, register zone contract`. Author = ingra107. No Claude attribution.

---

## Self-Review (writing-plans checklist)

**Spec coverage (§2.1-9):** §2.1 helpers+lint → Tasks 1,2,3. §2.2 advanceProjectMovement → Task 4. §2.3 snapshot → Task 5. §2.4 gate flip → Task 6. §2.5 client_ts → Task 7. §2.6 atomic migration → Task 8. §2.7 delete scaffold + lint ERROR → Task 9. §2.8 hygiene/hazards → Task 10. All 9 phases mapped. 1B exclusions (91 display sites, TODAY.md viewer-local) explicitly out of scope.

**Cross-plan invariants:** fail-closed baked into Task 6 (`ZoneContractError`/None → skip). Cross-repo lockstep in Task 7 (handoff spec filed first). Never-combine-with-timeline noted in the invariants block. Relay-confirm points: Tasks 5, 6, 8.

**Type/name consistency:** `now_instant`/`now_instant_wire`/`format_local`/`today_civil` (PB) and `nowInstant`/`formatLocal`/`todayCivil`/`civilFromInstant` (Hub) used consistently across tasks. `now_instant`/`now_instant_wire` are DEFINED in `outbox.py` and re-exported from `timez.py` (cycle-free; Task 1 + Task 7). `to_utc_dt(value, *, column, origin)` signature matches HEAD. The R10-name collision is resolved to R20-R23 throughout. `_CT_COLUMNS`/`_UTC_COLUMNS` references match `outbox.py:151-163` at HEAD (pre-Task-8); Task 8 moves `last_meaningful_movement`+`completed_at` into `_UTC_COLUMNS` and empties `_CT_COLUMNS`. Migration entrypoint is `def upgrade(conn)` (auto-runner contract, `sync.py:357`), file `088_normalize_timestamps_utc.py`.

**Known plan-internal risks flagged inline:** circular-import RESOLVED by defining minters in `outbox.py` + re-export from `timez.py` (Task 1 Step 3, Task 7 Step 4); R22 regex false-negative on variable indirection (Task 3); Hub CI is a stdlib-only Hub-local mirror, NOT a `|| true` no-op (Task 3 Step 4); re-count + per-row provenance allowlist before lossy rewrite (Task 8 Steps 1, 1b); backfill quarantine is a BLOCKING pre-req for Task 8 (Task 10 Step 1).

**Codex pre-execution review resolution (block-and-rework → addressed):**
- **Finding 1 (Task 8 false atomicity / R1 trap):** migration now uses a FROZEN internal `ZoneInfo("America/Chicago")` converter, never `to_utc_dt`; + Step 0 stopped-world preflight (daemons/sync stopped, no gate read until migration succeeds + verified). Entrypoint `def upgrade(conn)`; numbered `088`; `EXPECTED_MIN_MIGRATION` bumped same commit.
- **Finding 2 (Task 4 lost-update race):** kept the live ATOMIC single-UPDATE CASE compare; only the value is UTC-normalized. Added a concurrent-completions CAS test.
- **Finding 3 (Task 5 unexecutable D1 snapshot):** corrected `processed_mutations` columns (`mutation_id, origin_machine, processed_at, outcome, table_name, record_id`), removed `LIMIT 500`, scripted+rehearsed restore (Task 8 Step 7b dry-run), seq/last_mutation_id sourced from task/project rows.
- **Finding 4 (Task 8 double-shift of already-UTC naive ISO-T):** per-row legacy-CT provenance allowlist (Step 1b); offset/Z rows + unproven-naive rows left untouched; tests for already-UTC naive-ISO-T and offset-bearing rows that must NOT shift.
- **Finding 5 (Task 6 task gate not fail-closed):** task gate skips unless BOTH sides parse to UTC (still inside `if existing:`, so new-task apply is unaffected); LMM "no local LMM" apply preserved; added fail-closed tests for missing/unparseable local and remote.
- **Smaller:** circular import resolved in the executable steps; migration high-water corrected (087, not 062); Task 9 test targets the real `_CT_ORIGINS` behavior change; Hub CI lint is now a real Hub-local mirror.
- **Added for safe execution:** concrete 2-hour WATCH window with diff queries (acceptable=0) + restore trigger (Task 8); stopped-world Step 0 preflight; fail-closed tests for missing timestamps; migration + D1 export/restore rehearsal on a COPY before live (Task 8 Step 7).

> **REMAINING EXECUTION-TIME GATE (not a plan defect, but load-bearing):** Task 8 Step 1b's provenance allowlist (`_ISO_T_SHIFT_ELIGIBLE_IDS`) ships EMPTY and MUST be populated from a hand-audit of the actual naive-ISO-T candidate rows at execution. An empty allowlist is fail-closed (shifts nothing) — that is the safe default, but it means the `updated_at` ISO-T normalization is a no-op until the audit fills it. Do the audit, fill the set, re-run the rehearsal, THEN apply.

---

## CODEX AMENDMENTS (2026-05-24, pre-execution re-audit against HEAD 4dc1484f / Hub current) — SOURCE OF TRUTH for dispatch

> The 2026-05-23 review verified against PB `d4036d7b`/Hub `799ee275`. Both repos advanced (Tasks 1-4 shipped + LIVE; PB at `4dc1484f`). A second codex pass (verified by COO against live code) found two CONFIRMED data-corruption bugs that the original plan would hit AS WRITTEN. These amendments supersede the cited steps. Verdict was **block-and-fix**; these are the fixes.

### Amendment A — Task 5 D1 `tasks` export/restore drops project-only columns (Codex finding 1; CONFIRMED)

`last_meaningful_movement` and `stale_active_since` are **`projects` columns, NOT `tasks`** — verified: brain.db `PRAGMA table_info(tasks)` lacks both; `mutations.ts:217` `TABLE_FIELDS` lists them under projects. The Task 5 `tasks` export (plan:783-785) and restore (plan:818-820) would error (`wrangler d1 execute ... SELECT last_meaningful_movement ... FROM tasks` → no such column) → **no rollback artifact**.

- **Export (plan:784):** change to
  `SELECT id, slug, updated_at, completed_at, completed, status, seq, last_mutation_id, deleted_at FROM tasks`
  (drop `last_meaningful_movement, stale_active_since`). The `projects` export (plan:788) keeps them — correct, they live there.
- **Restore (`restore_d1_snapshot.py` + plan:818-820):** the `tasks` UPDATE drops `last_meaningful_movement=?, stale_active_since=?`. The `projects` UPDATE keeps them.

### Amendment B — Task 8 LMM step needs the SAME provenance guard as `updated_at` (Codex finding 2; CONFIRMED — silent +5h corruption)

> **🛑 SUPERSEDED 2026-05-24 by "Task 8 v2" (below). The value-cutoff (`_LMM_CT_CUTOFF_UTC`) in this amendment is UNSAFE in BOTH directions and was BLOCKED by a second dual-codex audit (`data/shared/codex-beta-amend-audit-{work,home}.md`). Do NOT implement the `_LMM_CT_CUTOFF_UTC` cutoff. The diagnosis of the corruption *direction* below is retained for context; the *fix* is replaced by the audited allowlist in Task 8 v2.**
>
> Why the cutoff fails both ways (verified against live code): (1) **Corruption** — Task 4 stamps D1 LMM from `mut.client_ts` (`mutations.ts:862-878`), NOT deploy time, so a *delayed* pre-deploy mutation processed after Task 4 can write a true-UTC LMM whose value is **< the cutoff** → the cutoff shifts it +5h. (2) **Incompleteness** — PB `query.py:1185/1236/1341` still writes naive **local CT** until Task 8 ships, so any PB-local completion after `2026-05-23 14:22 CT` produces a legacy-CT LMM that converts-as-CT to **> the cutoff** → the cutoff SKIPS it, leaving mixed-format data. Provenance is not encoded in the value; it must be encoded per-row.

Task 4 is LIVE (deployed `2026-05-23 19:22 UTC`, commit `d9398a83`) and writes `projects.last_meaningful_movement` as **naive space-sep UTC** (`mutations.ts:178` `toISOString().replace('T',' ').replace(/\.\d+Z$/,'')` → `"2026-05-23 20:00:00"`, no Z; written at `:898-906`). The Task 8 LMM step (plan:1335-1343) shifts EVERY naive LMM CT→UTC with **no allowlist** (unlike the `updated_at` step at plan:1321-1333, which is allowlist-guarded). So any Task-4-written UTC LMM gets double-shifted **+5h**, silently (the watch query only catches future rows). Blast radius (work, now): 64/64 LMM naive, all pre-T4 → 0 at-risk *today on work* — but Hub D1 / home / any completion since 05-23 19:22 can hold post-T4 UTC LMM. The migration must be safe by construction.

**Fix — cutoff guard (self-contained, mirrors the `updated_at` fail-closed intent):** add to migration 088:
```python
# LMM provenance cutoff: Task 4 (advanceProjectMovement UTC writer) went LIVE
# 2026-05-23 19:22 UTC. EVERY legacy-CT LMM was written before that; EVERY
# Task-4 UTC LMM is an instant >= 19:22 UTC. So shift a naive LMM ONLY if
# converting-it-as-CT yields an instant <= the cutoff (provably legacy). A
# Task-4 UTC value (>= 19:22 UTC) converted-as-CT lands >= next-day 00:22 UTC
# (> cutoff) -> never shifted. Fail-toward-NOT-shifting (leaving a CT value is a
# comparison nuisance; shifting a UTC value is corruption).
_LMM_CT_CUTOFF_UTC = "2026-05-23 19:22:00"
```
LMM loop (replaces plan:1335-1343):
```python
    for (pid, lmm) in cur.execute(
        "SELECT id, last_meaningful_movement FROM projects WHERE last_meaningful_movement IS NOT NULL"
    ).fetchall():
        if not _is_naive(lmm):
            continue  # offset/Z -> already resolvable, never shift
        out = _freeze_ct_naive_to_utc(lmm)
        if out is None:
            continue  # unparseable -> fail-closed leave
        if out > _LMM_CT_CUTOFF_UTC:
            continue  # converts-as-CT to AFTER Task-4 deploy -> it is a Task-4 UTC
                      # value, NOT legacy CT. Leave untouched (corruption guard).
        cur.execute("UPDATE projects SET last_meaningful_movement = ? WHERE id = ?", (out, pid))
```
> **Why `completed_at` (plan:1345-1353) does NOT need this guard:** its UTC writer is Task 7 (`query.py:1236`), which ships INSIDE the stopped-world window with this migration. At migration time there are zero post-Task-7 (UTC) `completed_at` values — they only get written after the window reopens. So every `completed_at` at migration time is legacy CT; blanket-shift is correct there. The asymmetry is real: Task 4 (LMM) has been live ~28h; Task 7 (completed_at) has not shipped.
> **Step 7b rehearsal MUST now also dry-run the LMM cutoff** on a copied brain.db (count shifted vs left, eyeball 5 of each) before the live apply.

### Amendment C — global stop-the-world both machines before any 088 apply (Codex finding 5; sound)

The plan's relay-confirm is "confirm both converged AFTER apply" (plan:1466). Gap: the window where machine A applied 088 + resumed sync while machine B is still on pre-088 code (its `EXPECTED_MIN_MIGRATION` not yet bumped) — B happily syncs stale CT against the shared Hub D1. `brain.db` is per-machine (`.stglobalignore`'d), so the race is on Hub D1, not Syncthing. Strengthen the Task 8 relay protocol to:
1. **BOTH** machines stop sync daemons (`python scripts/utils/check_daemons.py --stop-all`) BEFORE either applies 088. Relay-confirm both stopped.
2. Both pull the Task 6/7/8 code commits (so `EXPECTED_MIN_MIGRATION`=088 + writers + gates are present on both).
3. Both take a FRESH snapshot (re-verify < hours old).
4. Both run Step 0 preflight + apply 088 + Step 7 verify.
5. Relay-confirm BOTH report 088 applied + `sync.py status --verbose` diff=0.
6. ONLY THEN both resume daemons. Neither resumes sync until both are at 088.

No Syncthing pause needed (brain.db not file-synced); the stop-the-world is on the sync daemons + Hub D1 push/pull, coordinated via this chat/relay.

### Unchanged-but-confirmed
- Citation drift (builder reads live code, edits by content not line#): `outbox.py` client_ts writers now `:767`/`:2067` (bound `:783`/`:2083`); `mutations.ts` Task-4 region `:777-909`, processed-insert `:1081-1085`; `backfill ...:226-229`. All hub.py gate/shadow + query.py citations still valid. `operations.py:920` Bug-2 already fixed (`e2553799`).
- Order unchanged: 5 → 6 → 7 → 8 → 9. Task 8 starts only after both machines stopped + snapshotted + Tasks 6/7 live on both + ~~LMM cutoff~~ **(replaced by Task 8 v2 dual-allowlist)** + `_ISO_T_SHIFT_ELIGIBLE_IDS` populated.

---

## Task 8 v2 (2026-05-24) — provenance-by-row, not provenance-by-value (REPLACES Amendment B; SOURCE OF TRUTH for Task 8 dispatch)

> **Verdict that triggered this:** a second dual-codex audit (`data/shared/codex-beta-amend-audit-work.md` + `-home.md`, both read in full) returned **still-block**. Amendment B's `_LMM_CT_CUTOFF_UTC` value-cutoff is unsafe both directions (banner above), and a LARGER miss was found: Hub D1 is the synced-state arbiter (plan:24) and still holds legacy LMM that Hub code itself says Task 8 normalizes (`mutations.ts:110-115`), but the planned Task 8 only touches brain.db (plan:1484). This section replaces Amendment B's LMM fix, adds the missing D1 normalization decision, and resolves the Task 6 + DST findings.
>
> **Builder live re-verification 2026-05-24 (HEAD: PB `4dc1484f`, Hub current). Do not trust, the numbers were re-measured:**
> - **work brain.db:** `projects.last_meaningful_movement` non-null = **64**, all 64 naive (no offset/Z), MAX value = `2026-05-22T15:53:50.793979` → **all pre-T4, 0 convert-as-CT past the 19:22 UTC mark → 0 ambiguous today.** `tasks.updated_at` ISO-T naive = **44** (the plan's "43" is stale; Step 1 re-count is mandatory anyway).
> - **Hub D1 `projects`:** LMM non-null = **3** → 2 legacy-CT naive ISO-T (`2026-05-22T15:53:50.793979`, `2026-05-22T15:53:48.535287` — old `_dt.now().isoformat()` shape, microseconds, no Z) + 1 already-canonical `…Z` (`2026-05-22T14:48:10.648260Z`). **0 ambiguous.**
> - **home brain.db: count pending** (relay-confirm at execution; the allowlist is built per-machine under Step 0).
> - **Net:** the real ambiguous set is ~empty on both stores today → a deterministic, enumerated, hand-audited allowlist is correct and complete. The allowlist is not a fallback; it is the right primitive (provenance lives in the row's history, never in the value).

### v2-1 — Replace the LMM value-cutoff with an audited `_LMM_SHIFT_ELIGIBLE_IDS` allowlist (mirrors `_ISO_T_SHIFT_ELIGIBLE_IDS`)

Delete `_LMM_CT_CUTOFF_UTC` and the `out > cutoff` branch entirely. Add a second allowlist beside `_ISO_T_SHIFT_ELIGIBLE_IDS` (plan:1278), built by an execution-time **Step 1b-LMM provenance audit** that classifies every naive LMM row: **pre-T4-naive = eligible (legacy CT); post-T4-naive = classify-or-skip (could be a delayed Task-4 UTC value or a PB-local CT value — leave UNTOUCHED unless proven legacy-CT).**

```python
# scripts/db/migrations/088_normalize_timestamps_utc.py — replaces _LMM_CT_CUTOFF_UTC

# Audited allowlist of PROJECT ids whose naive last_meaningful_movement is
# confirmed legacy-CT (built in Step 1b-LMM). EMPTY here — fill from the
# Step-1b-LMM provenance audit before applying. Empty == NO LMM row is shifted
# (fail-closed). Provenance is per-ROW, never inferred from the value: Task 4
# stamps D1 LMM from mut.client_ts (mutations.ts:862-878), not deploy time, and
# PB still writes naive local CT until this very commit — so no value cutoff can
# distinguish a true-UTC LMM from a legacy-CT LMM. Only the row's history can.
_LMM_SHIFT_ELIGIBLE_IDS: frozenset[str] = frozenset({
    # "proj_...",  # populate from Step 1b-LMM provenance audit (pre-T4-naive only)
})
```

LMM loop (replaces plan:1335-1343 AND Amendment B's plan:1705-1717 cutoff loop):

```python
    # 2. projects.last_meaningful_movement CT → UTC, ALLOWLIST ONLY (frozen
    #    converter; naive only). Mirrors the updated_at step's fail-closed shape:
    #    offset/Z rows skipped (already resolvable); unproven-naive rows left
    #    untouched (a post-T4 value may be true-UTC OR PB-local-CT — both are
    #    indistinguishable by value, so we require explicit per-row provenance).
    for (pid, lmm) in cur.execute(
        "SELECT id, last_meaningful_movement FROM projects WHERE last_meaningful_movement IS NOT NULL"
    ).fetchall():
        if not _is_naive(lmm):
            continue  # explicit offset/Z → already UTC-resolvable, never shift
        if pid not in _LMM_SHIFT_ELIGIBLE_IDS:
            continue  # unproven provenance → fail-closed, leave untouched
        out = _freeze_ct_naive_to_utc(lmm)
        if out is not None:
            cur.execute("UPDATE projects SET last_meaningful_movement = ? WHERE id = ?", (out, pid))
```

**Step 1b-LMM provenance audit (execution-time, mirrors plan:1137-1154 for `updated_at`):**

```bash
cd ~/Peripheral-Brain && PYTHONPATH=. python -c "
import sqlite3; c=sqlite3.connect('data/brain.db')
# Naive LMM candidates (no offset/Z). Classify each by provenance:
#   pre-T4-naive  → ELIGIBLE (legacy CT minted by query.py:1185 _dt.now()).
#   post-T4-naive → CLASSIFY-OR-SKIP. A naive LMM written after the 2026-05-23
#                   19:22 UTC Task-4 deploy could be (a) a delayed Task-4 UTC
#                   value pulled from Hub, or (b) a PB-local-CT value from
#                   query.py:1185 (still CT until THIS commit). Neither is
#                   distinguishable by value → default SKIP; include ONLY if a
#                   per-row audit (audit_log.captured_at / outbox.client_ts /
#                   d1_project_updates / sync provenance) proves legacy-CT.
rows = c.execute('''SELECT id, last_meaningful_movement FROM projects
                    WHERE last_meaningful_movement IS NOT NULL
                      AND last_meaningful_movement NOT LIKE \"%+%\"
                      AND last_meaningful_movement NOT LIKE \"%Z\"''').fetchall()
print(f'naive LMM candidates: {len(rows)}')
for r in rows: print(r)
"
```
Decision rule: a project is shift-eligible iff naive LMM **AND** its LMM instant (converted-as-CT) is provably pre-Task-4-deploy **AND** no post-T4 PB-local or Hub-echo write touched LMM since. With today's data (MAX LMM `2026-05-22`, all 64 pre-T4), every naive LMM is eligible → the allowlist is the full 64 PKs. If at execution any row's LMM converts to ≥ `2026-05-23 19:22:00 UTC`, that row needs hand-classification (or skip) before its PK enters the set. Embed the explicit PK allowlist in the migration. Build the SAME audit on home under its own Step 0.

> **Why an allowlist, not a cutoff (class-level):** the cutoff encodes provenance in the *value*; provenance actually lives in the row's *write history*. Task 4 uses `client_ts` (not deploy time) and PB writes CT until this commit — two independent reasons the value cannot carry provenance. The `updated_at` step already solved this exact class with `_ISO_T_SHIFT_ELIGIBLE_IDS`; LMM gets the symmetric treatment. This is the same primitive applied twice, not two mechanisms.

### v2-2 — Preflight ASSERT for BOTH allowlists ("populated OR candidate-count==0", hard-fail)

Both `_ISO_T_SHIFT_ELIGIBLE_IDS` and `_LMM_SHIFT_ELIGIBLE_IDS` shipping empty is fail-closed (shifts nothing) — but executing empty *knowingly leaves a non-empty candidate class unmigrated*, which is silent incompleteness. Make it a **hard pre-apply gate**: the migration refuses to proceed if there is a non-empty candidate set with an empty allowlist. Add to `upgrade(conn)` BEFORE any UPDATE (after the idempotency guard at plan:1314-1319):

```python
    # PREFLIGHT ASSERT (Codex finding 4 + finding from 2026-05-24 audit): each
    # allowlist must be POPULATED, OR its candidate count must be 0. An empty
    # allowlist against a non-empty candidate set is silent incompleteness —
    # hard-fail so the operator runs Step 1b/1b-LMM and fills the set. This is a
    # tested durability gate, not a comment (ethos #2/#7).
    iso_candidates = [r[0] for r in cur.execute(
        "SELECT id FROM tasks WHERE updated_at LIKE '%T%' "
        "AND updated_at NOT LIKE '%+%' AND updated_at NOT LIKE '%Z'"
    ).fetchall()]
    lmm_candidates = [r[0] for r in cur.execute(
        "SELECT id FROM projects WHERE last_meaningful_movement IS NOT NULL "
        "AND last_meaningful_movement NOT LIKE '%+%' "
        "AND last_meaningful_movement NOT LIKE '%Z'"
    ).fetchall()]
    if iso_candidates and not _ISO_T_SHIFT_ELIGIBLE_IDS:
        raise RuntimeError(
            f"088 preflight: {len(iso_candidates)} naive ISO-T updated_at candidates "
            f"but _ISO_T_SHIFT_ELIGIBLE_IDS is EMPTY. Run Step 1b, classify, fill the "
            f"allowlist, re-rehearse. Refusing to apply (fail-closed-but-incomplete)."
        )
    if lmm_candidates and not _LMM_SHIFT_ELIGIBLE_IDS:
        raise RuntimeError(
            f"088 preflight: {len(lmm_candidates)} naive LMM candidates but "
            f"_LMM_SHIFT_ELIGIBLE_IDS is EMPTY. Run Step 1b-LMM, classify, fill the "
            f"allowlist, re-rehearse. Refusing to apply (fail-closed-but-incomplete)."
        )
```

> This converts the "REMAINING EXECUTION-TIME GATE" warning (plan:1672) from prose into an executable contract. The rehearsal on the COPY (Step 7) will trip this assert first if the allowlists weren't filled — surfacing the gate loudly before the live apply, exactly when it's cheap to fix. Add a regression test: empty allowlist + ≥1 candidate → `RuntimeError`; populated allowlist OR 0 candidates → proceeds.

### v2-3 — Hub D1 legacy LMM normalization (the biggest miss; Hub is the arbiter)

**Contradiction to resolve:** `mutations.ts:110-115` (the helper-block note) and `mutations.ts:896-906` (the inline `advanceProjectMovement` note) both assert that legacy non-canonical stored D1 LMM "self-resolves once Task 8 migrates it." But Task 8 (plan:1484) explicitly says "D1 was not modified by this migration." Since Hub D1 is the synced-state arbiter (plan:24), leaving 2 mixed-format legacy rows there means the canonical store stays mixed while brain.db is clean — an asymmetric-path bug (ethos #6) and a doc-contradicts-code bug (ethos #10).

The MAX gate at `mutations.ts:898-906` is:
```sql
UPDATE projects SET last_meaningful_movement = CASE
    WHEN last_meaningful_movement IS NULL OR last_meaningful_movement < ?   -- raw lexical compare vs STORED legacy
    THEN ? ELSE last_meaningful_movement END, ...
```
The **incoming** operand is already normalized (`normalizeToUtcSpaceSep(mut.client_ts)`, `:877`); the **stored** operand is compared raw. With the 2 D1 rows being ISO-T (`2026-05-22T…`), a future space-sep UTC value on the SAME date would lexically mis-order (`T` (0x54) sorts after space (0x20)) → wrong-winner / stuck-stale LMM display.

**Two options — RECOMMENDATION: Option B (normalize the stored operand), flagged `next: hub-backend`.**

- **Option A — stopped-world D1 normalization step (wrangler, under the snapshot, hub-backend executes).** Add a Task 8 sub-step that, inside Amendment C's stop-the-world window, runs `UPDATE projects SET last_meaningful_movement = <normalized> WHERE id IN (<2 audited PKs>)` against D1 via `wrangler d1 execute --remote`, after the same per-row provenance audit (the 2 naive ISO-T rows are confirmed pre-T4 legacy-CT → shift to `…Z`-equivalent UTC space-sep). Mirrors the brain.db rehearsal/rollback discipline (Task 5 D1 export is the rollback artifact). **Cost:** a second hand-audited allowlist + a live D1 write inside the window; correct but adds a stopped-world mutation to a 2-row problem.
- **Option B (RECOMMENDED) — normalize the stored operand in `advanceProjectMovement` before the MAX compare.** Hub **already ships** `normalizeToUtcSpaceSep` (`mutations.ts:157`) + `ctOffsetMinutesAt` (`:123`, Intl/ICU DST-correct). The fix is to make the CASE compare against the **normalized** stored value, so legacy mixed-format rows are temporally compared correctly AND lazily rewritten to canonical on the next movement — no stopped-world D1 write, no second allowlist, and it permanently kills the *class* (any future legacy/mixed value self-heals on next write). Sketch (hub-backend owns the exact SQL/JS — D1 has no SQL function for this, so normalize in JS by reading-then-writing OR push the canonical value unconditionally when the incoming instant is newer):

  ```ts
  // advanceProjectMovement (mutations.ts ~896-906) — normalize the STORED operand.
  // Read current LMM, normalize BOTH sides in JS (normalizeToUtcSpaceSep already
  // exists), compare as canonical UTC, write canonical. Keeps lost-update safety
  // by scoping to a single project row; if true atomicity vs concurrent
  // completions is required, keep the single-UPDATE but compare against a
  // normalized expression. NOTE: D1/SQLite has no UDF, so the JS read-modify-write
  // is the straightforward path; hub-backend decides read-modify-write vs a
  // CASE that tolerates the 2 known legacy shapes. Either way the STORED side is
  // no longer compared raw-lexically against a normalized incoming value.
  ```

  **This is a `mutations.ts` edit → out of Builder's Tier-1 scope. Flag: `next: hub-backend`.** Builder owns the brain.db edge of the contract; the Hub-side MAX-gate normalization is a Hub-backend specialist change requiring the cross-language-hash-contract lens and Codex review. Pair it with deleting/correcting the false `mutations.ts:110-115` + `:896-906` "self-resolves once Task 8 migrates it" comments (they describe a brain.db-only migration that never touches D1).

**Resolution of the plan:1484 ↔ mutations.ts:110-115 contradiction:** adopt Option B → update plan:1484 to state "D1 legacy LMM is normalized lazily by the Task-4 writer's stored-operand normalization (hub-backend follow-up), NOT by 088; 088 is brain.db-only by design," and update the `mutations.ts` comments to match (remove "migrated by Task 8"). If Nick/hub-backend prefer Option A, plan:1484 instead documents the in-window D1 `UPDATE` step + its 2-PK allowlist + the Task-5 D1 export as rollback. Either way the contradiction is closed; the doc and code agree.

### v2-4 — Task 6 uses the DIRECT fail-closed snippets, NOT `_shadow_pull_gate` reuse

Both audits flagged: do NOT "promote the shadow decision." `_shadow_pull_gate` (`hub.py:82-152`) is SHADOW-only and, on an unparseable side, **mirrors `decision_old`** (`hub.py:120-123`) — that is NOT fail-closed (it inherits the live raw-string gate's decision, which is exactly the ambiguous-apply bug Task 6 fixes). Task 6's direct snippets (plan:924-942 task gate, plan:952-961 project gate, plan:967-972 LMM gate) ARE fail-closed (skip unless BOTH sides parse to UTC AND Hub strictly newer; LMM preserves the "no local LMM → apply" exception). **Task 6 is already written correctly in the plan** — this note pins it: implement Steps 3/4/5 of Task 6 as the direct `to_utc_dt(...) is not None and _d1_utc > _brain_utc` snippets; the shadow helper stays SHADOW until Task 9 retires it. Do not refactor Task 6 to call `_shadow_pull_gate`.

### v2-5 — Harden the DST gap in `_freeze_ct_naive_to_utc` (converter, plan:1283-1299)

The frozen converter does `aware_ct = dt.replace(tzinfo=_CT)` (plan:1298). `ZoneInfo` makes the *offset* DST-correct, but `replace(tzinfo=...)` does **not** reject a nonexistent spring-forward wall time (02:00–02:59 CST→CDT) nor disambiguate a fall-back fold (01:00–01:59 occurs twice). For the affected columns, the only realistic boundary is the 2026 spring-forward (Mar 8 02:00) / fall-back (Nov 1 02:00) — none of today's 64+44+2 rows land there (all `2026-05-22`), so the LIVE risk is zero. But the converter is a frozen primitive that future migrations may reuse, so harden OR document explicitly:

```python
def _freeze_ct_naive_to_utc(s: str) -> str | None:
    s = (s or "").strip()
    if not s:
        return None
    s_norm = s.replace("T", " ")
    try:
        dt = datetime.strptime(s_norm[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    # DST hardening: fold=0 picks the FIRST (DST/earlier-offset) occurrence on a
    # fall-back ambiguous hour; nonexistent spring-forward times resolve forward
    # via ZoneInfo's documented behavior. For a one-time legacy rewrite this is
    # a deterministic, documented choice. The affected rows (all 2026-05-22) are
    # nowhere near a DST boundary, so this is belt-and-suspenders. If a future
    # reuse must handle a boundary row exactly, classify it by hand.
    aware_ct = dt.replace(tzinfo=_CT, fold=0)
    return aware_ct.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
```
Add a regression test asserting the converter is deterministic on a fall-back ambiguous time (`2026-11-01 01:30:00` → fixed UTC via fold=0) and does not raise on a spring-forward nonexistent time (`2026-03-08 02:30:00`). Document the ±1h boundary semantics in the migration docstring.

### v2 — wiring into the existing Task 8 steps (no step renumbering)

- **Step 1b** (plan:1137) — keep for `updated_at`; ADD **Step 1b-LMM** (the LMM provenance audit above) to build `_LMM_SHIFT_ELIGIBLE_IDS`.
- **Step 4 / the migration body** (plan:1237-1363) — apply edits v2-1 (allowlist + loop), v2-2 (preflight assert), v2-5 (converter hardening). Delete `_LMM_CT_CUTOFF_UTC`.
- **Step 2 tests** (plan:1156-1226) — keep all; ADD: (a) empty-allowlist + ≥1-candidate → `RuntimeError` (×2, ISO-T and LMM); (b) LMM allowlisted CT row shifts +5h, LMM non-allowlisted naive row UNTOUCHED, LMM offset/Z row untouched; (c) converter determinism on the two DST-boundary inputs.
- **Step 7 rehearsal** (plan:1409) — the rehearsal now trips the preflight assert FIRST if allowlists are empty; fill from Step 1b/1b-LMM, then re-rehearse. Eyeball: count shifted vs left for BOTH allowlists.
- **Step 8 live apply** (plan:1440) — unchanged shape; the preflight assert is the new hard gate.
- **Step 9 commit** (plan:1461) — unchanged pathspec for the brain.db side. The `mutations.ts` Option-B edit is a SEPARATE hub-backend commit (`next: hub-backend`), NOT in Builder's 088 commit.
- **Amendment C stop-the-world** (plan:1722) — still required; if Option A is chosen, the D1 `UPDATE` step lands inside that window. If Option B, no D1 write in the window (the lazy normalization is a code deploy, sequenced like Tasks 6/7).

### v2 — ready for re-audit (do NOT execute)

This is **DESIGN + DRAFT only.** Nothing was executed: migration 088 not run, `EXPECTED_MIN_MIGRATION` not bumped live, no D1 write, no daemons touched, no allowlist populated (both ship EMPTY by design — the preflight assert is the gate). Open decision for the re-audit / Nick / hub-backend: **Option A vs Option B for the D1 legacy LMM** (Builder recommends B — it kills the class, reuses an existing primitive, and needs no stopped-world D1 write; it costs one `mutations.ts` hub-backend edit + Codex review). After the re-audit signs off and Option A/B is chosen, populate both allowlists from the live Step 1b/1b-LMM audits on EACH machine, re-rehearse on a copy (the preflight assert will catch an unfilled allowlist), then apply under Amendment C's stop-the-world protocol.

> **DECISION 2026-05-24 (Nick): Option B chosen for the D1 legacy-LMM blocker** — normalize the stored operand in `advanceProjectMovement` before the MAX compare (Hub already ships `normalizeToUtcSpaceSep`). Option A (one-time wrangler D1 row migration) is the rejected fallback. The `mutations.ts` edit is `next: hub-backend`, gated behind the v2 re-audit (`docs/superpowers/specs/2026-05-24-beta-v2-reaudit-prompt.md`). Execution deferred to a fresh window.

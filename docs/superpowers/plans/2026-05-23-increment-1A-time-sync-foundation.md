# Increment 1A — Time/Sync Foundation (DATA-RISK CORE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch domain specialists per task: **builder** (PB `scripts/db/*`, migrations, lint) and **hub-backend** (`api/routes/mutations.ts`, deploy). Builder cannot edit `mutations.ts` directly — those steps return "next: dispatch hub-backend" to the COO.

**Goal:** Store every synced timestamp instant in UTC and enforce it with origin-aware LWW gates + a CI lint, so the live Hub LMM-churn bug dies, mixed-zone columns are migrated to UTC under one snapshot, and the `to_utc_dt` zone-guessing scaffold can be deleted.

**Architecture:** Build canonical time-helper chokepoints (PB `timez.py`, Hub `src/lib/time.ts`) + a WARN-mode CI lint; fix the Hub `advanceProjectMovement` read-modify-write normalizer (kills the live churn bug, independent deploy); snapshot BOTH stores; flip the 3 LWW pull-gates to fail-closed ENFORCE; cut PB `client_ts` to explicit-UTC; run ONE atomic legacy data migration (LMM + 43 ISO-T `updated_at` + `completed_at` CT→UTC) that flips the writers and reader-contract together; then delete the scaffold and flip the lint to ERROR. All data-risk steps run under a snapshot valid for hours, with relay-confirm gating both machines.

**Tech Stack:** Python 3.10+ (PB, `scripts/db/`), TypeScript + Hono v4.12 + Cloudflare D1 (Hub `api/routes/`), SQLite (`data/brain.db`), pytest (`tests/sync/`, `tests/db/`), Vitest (`api/routes/*.test.ts`), wrangler (deploy + D1 export).

**Verified against:** PB HEAD `d4036d7b`, Hub HEAD `799ee275` (this session, 2026-05-23). All file:line citations below were re-grepped against HEAD per the writing-plans pre-write rule; the source plans' citations were 80-150 lines stale and have been corrected. See "Verified citation spine" appendix.

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
- Create: `scripts/db/timez.py` — canonical time chokepoint (re-exports `outbox.to_utc_dt`; adds `now_instant`, `now_instant_wire`, `format_local`, `today_civil`).
- Modify: `scripts/db/check_sync_antipatterns.py` — add time rules R20-R23 (NOT R10-R13; R10 already exists), reuse the `PB_LINT_MODE=warn|enforce` mechanism at `:631`.
- Modify: `scripts/db/sync/drivers/hub.py` — flip 3 pull-gates (`:1278`, `:1861`, `:2002`) to origin-aware enforce.
- Modify: `scripts/db/outbox.py` — `client_ts` writers (`:745`, `:2045`) to explicit-UTC; delete `_CT_COLUMNS`/`_CT_ORIGINS` guessing branches (`:160-172`, `:254-261`) at the end.
- Modify: `scripts/db/query.py` — LMM/completed_at writer flip (`:1185`, `:1236`, `:1341`, `:1240`; verify `:2922`).
- Modify: `scripts/db/sync/operations.py:920` — fix latent Bug-2 second freshness-guard caller.
- Modify: `scripts/db/backfill_last_meaningful_movement.py` — quarantine (refuse-to-run post-cutover guard).
- Modify: `scripts/db/sync/records.py:159-176` — delete `local_time_is_localtime` localtime path at the end.
- Create: `scripts/db/migrations/NNN_normalize_timestamps_utc.py` — the one atomic legacy migration.
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

**Relay-confirm points:** Task 5 (snapshot must exist on BOTH machines before any flip), Task 6 (both machines flip in the SAME sync generation, else one enforces and one doesn't → transient divergence), Task 8 (peer auto-applies the migration via session-start runner; both machines must converge under the snapshot umbrella). Use the `cross-machine-relay` skill, Migration & state-change confirmation section, for all three.

---

## Task 1: PB canonical time chokepoint — `scripts/db/timez.py`

**Specialist:** builder. **Ship-risk: A** (pure addition; no caller yet; rollback = delete the file).

**Files:**
- Create: `scripts/db/timez.py`
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

- [ ] **Step 3: Write minimal implementation**

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

# Re-export the canonical reader so there is ONE import surface for the lint
# allowlist. to_utc_dt physically stays in outbox.py (where it shipped in
# 61c53d78) to avoid a churning move-commit; timez just re-exports it.
from scripts.db.outbox import to_utc_dt, ZoneContractError  # noqa: F401


def now_instant() -> str:
    """UTC instant, space-sep, no tz suffix: '2026-05-23 18:04:11'.

    Matches the on-disk updated_at shape (datetime('now') is UTC space-sep).
    The SOLE legal minter for new sync-write Instant columns.
    """
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def now_instant_wire() -> str:
    """UTC instant, ISO-T, explicit offset: '2026-05-23T18:04:11+00:00'.

    For wire/client_ts values: the explicit marker means to_utc_dt resolves it
    via branch 1 (honor offset) with no column/origin context needed.
    """
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


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
git commit -F <msgfile> -- scripts/db/timez.py tests/db/test_timez.py
```
Message: `feat(time): PB canonical time chokepoint timez.py (Increment 1A Task 1)`. Author = ingra107. No Claude attribution.

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

> **R22 false-negative note (Opus-timediscipline risk #4):** the regex catches the common `datetime.now()` form but not variable indirection (`d = datetime.now(); d.isoformat()`). This is a known backstop limit; the Hub ESLint AST rule (deferred to 1B) is the real net for the TS side. For the PB sync surface (only ~2 writers) the regex is sufficient. Document this in the rule docstring.

- [ ] **Step 4: Add the Hub CI lint step** (`.github/workflows/schema-drift.yml`, after the `audit:schema-contract` step at `:216-221`):

```yaml
      - name: Time-discipline lint (Increment 1A, WARN during migration)
        # R20-R23: bans raw new Date().toISOString() / toISOString().split
        # in Hub src+api outside src/lib/time.ts. WARN mode (exit 0) until the
        # 1B display-site migration clears the backlog, then flip to ERROR.
        env:
          PB_LINT_MODE: warn
        run: python3 ../Peripheral-Brain/scripts/db/check_sync_antipatterns.py || true
```

> If the PB repo is not checked out alongside Hub in CI, gate this step on a path check or move the lint into a Hub-local copy. Flag for hub-backend at execution: confirm the CI runner has both repos OR ship a stdlib-only Hub-local mirror of R20/R21. WARN mode + `|| true` means a missing PB checkout never red-fails the build during 1A.

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/mn-ccore-lab && npx vitest run --config vitest.config.api.ts api/routes/mutations.advance-project.test.ts`
Expected: FAIL — the lexical-MAX path mis-orders the naive-CT case.

- [ ] **Step 3: Implement the read-modify-write normalizer** (replace `:784` and the raw SQL block `:796-808`)

```ts
  // Normalize the incoming movement instant to canonical UTC space-sep.
  // Explicit-offset/Z is honored; a naive value is treated as legacy-CT
  // (the brain.db emit format pre-Increment-1A Task 7) and converted to UTC.
  const tsUtc = normalizeToUtcSpaceSep(mut.client_ts) ?? nowInstant().replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');

  // Read-modify-write MAX in UTC space: SELECT existing, normalize, compare,
  // write tsUtc only if it is strictly later. stale_active_since + updated_at
  // unconditional (movement = project unstale), matching the prior behavior.
  const existing = await env.DB.prepare(
    `SELECT last_meaningful_movement AS lmm FROM projects WHERE id = ? OR slug = ? LIMIT 1`
  ).bind(projectId, projectId).first<{ lmm: string | null }>();
  const existingUtc = existing?.lmm ? normalizeToUtcSpaceSep(existing.lmm) : null;
  const shouldWrite = !existingUtc || (tsUtc > existingUtc);
  await env.DB.prepare(`
    UPDATE projects
    SET last_meaningful_movement = CASE WHEN ? THEN ? ELSE last_meaningful_movement END,
        stale_active_since = NULL,
        updated_at = datetime('now')
    WHERE id = ? OR slug = ?
  `).bind(shouldWrite ? 1 : 0, tsUtc, projectId, projectId).run().catch((e: Error) => {
    console.error('advanceProjectMovement: project update failed:', e.message);
  });
```

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

- [ ] **Step 4: Export the D1 (Hub) LWW columns + cursors**

```bash
cd ~/mn-ccore-lab
mkdir -p ../Peripheral-Brain/data/snapshots/2026-05-23-increment-1A
npx wrangler d1 execute mnccore-lab --remote --json \
  --command "SELECT id, slug, updated_at, last_meaningful_movement, stale_active_since, completed_at, completed, status, seq, last_mutation_id, deleted_at FROM tasks" \
  > ../Peripheral-Brain/data/snapshots/2026-05-23-increment-1A/d1_tasks.json
npx wrangler d1 execute mnccore-lab --remote --json \
  --command "SELECT id, slug, updated_at, last_meaningful_movement, stale_active_since, status, stage, category, seq, last_mutation_id, deleted_at FROM projects" \
  > ../Peripheral-Brain/data/snapshots/2026-05-23-increment-1A/d1_projects.json
npx wrangler d1 execute mnccore-lab --remote --json \
  --command "SELECT mutation_id, last_mutation_id, seq FROM processed_mutations ORDER BY seq DESC LIMIT 500" \
  > ../Peripheral-Brain/data/snapshots/2026-05-23-increment-1A/d1_processed_mutations.json
```

> NOTE: column lists above are verified against the registered shared fields + `schema-version-snapshot.json`. If `wrangler d1 execute` rejects a column (schema drift), drop it and re-run; record the actual columns in the runbook header.

- [ ] **Step 5: Record the manifest + restore procedure**

Write `data/snapshots/2026-05-23-increment-1A/RESTORE.md` (gitignored) capturing: snapshot timestamp (UTC), both machines' HEAD SHAs, the row counts captured, and these RESTORE commands:

```
RESTORE (valid for HOURS only — restoring after real team activity clobbers good writes):
  PB:  stop all daemons (python scripts/utils/check_daemons.py --stop-all);
       copy data/snapshots/.../brain.db (+ -wal/-shm) back over data/brain.db;
       restart daemons.
  D1:  for each corrupted row, UPDATE the LWW columns + seq + last_mutation_id
       back to the snapshot values via:
       wrangler d1 execute mnccore-lab --remote --command
         "UPDATE projects SET last_meaningful_movement=?, updated_at=?, seq=?, last_mutation_id=? WHERE id=?"
       (script this from d1_projects.json / d1_tasks.json — do NOT hand-type).
  Outbox: re-enqueue from outbox_pending.json ONLY mutations not in the
       restored D1 processed_mutations (else duplicate-apply).
```

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


def test_lmm_gate_compares_in_utc_not_lexical(driver, seeded_project):
    # Stored brain LMM is CT 16:00 (== 21:00 UTC). Hub sends UTC 20:00.
    # Lexical raw compare '2026-05-22 20:00:00' > '2026-05-22 16:00:00' = apply (WRONG:
    # Hub 20:00 UTC is EARLIER than local 21:00 UTC). UTC-aware compare must SKIP.
    seeded_project(brain_lmm="2026-05-22 16:00:00")  # CT column
    applied = driver._apply_lmm({"id": "proj_x", "last_meaningful_movement": "2026-05-22 20:00:00"})
    assert applied is False  # Hub is actually earlier → skip
```

> The exact test entry points (`_apply_one_task` / `_apply_lmm`) must match the real driver method seams — read `test_pull_lww_zone.py` at execution and mirror its existing fixture style. The CONTRACT under test: gate decision == `decision_new` (UTC-aware), fail-closed on None.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/sync/drivers/test_pull_lww_zone.py -v`
Expected: FAIL — the live gates still use raw-string compare.

- [ ] **Step 3: Flip the task gate (`hub.py:1278`)**

Replace the raw-string decision with the UTC-aware one + fail-closed:

```python
                # v2 Task 4 ENFORCE (Increment 1A): the live gate now uses the
                # origin/column-aware UTC compare (the value the shadow logged
                # as decision_new). Fail-CLOSED: an unparseable side SKIPS.
                _d1_utc = to_utc_dt(d1_updated, origin="hub") if d1_updated else None
                _brain_utc = to_utc_dt(brain_updated, column="updated_at") if brain_updated else None
                if d1_updated and brain_updated:
                    if _d1_utc is None or _brain_utc is None or _d1_utc <= _brain_utc:
                        log_decision(table="tasks", d1_id=d1_id, title=_title,
                                     decision="skipped_stale", local_pk=task_id,
                                     reason="utc-aware: d1 not strictly newer or ambiguous")
                        stats.skipped_stale += 1
                        continue
```

Import `to_utc_dt` at the top of `hub.py` (already imported in the freshness-guard fix region `:498`; hoist to module scope if not already).

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

- [ ] **Step 4: Flip both client_ts writers**

At `outbox.py:745` and `:2045`, change:

```python
        mutation_id = _mint_mutation_id()
        now = now_instant_wire()  # explicit-UTC '...+00:00'; branch-1 honored downstream
```

Add the import at the top of `outbox.py`: `from scripts.db.timez import now_instant_wire`.

> WARNING (circular-import check): `timez.py` imports `to_utc_dt` from `outbox.py`, and now `outbox.py` would import `now_instant_wire` from `timez.py`. To avoid a cycle, EITHER (a) inline `datetime.now(timezone.utc).replace(microsecond=0).isoformat()` directly at the two writers (the value `now_instant_wire` produces), OR (b) define `now_instant_wire` in `outbox.py` and have `timez.py` re-export it. RECOMMENDED: (b) — keep one definition in `outbox.py`, re-export from `timez.py`, so there is no cycle and one source of truth. Update Task 1 accordingly if (b) is chosen at execution.

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

**The three data classes (re-verify counts at execution):**
1. `projects.last_meaningful_movement` CT → UTC (writer was `query.py:1185`/`:1236`/`:1341`; default-caller `:2922`).
2. `tasks.updated_at` legacy ISO-T rows → UTC space-sep (the "43-row" class — RE-COUNT at HEAD, do NOT trust the stale number).
3. `tasks.completed_at` PB-CT → UTC (governing principle §1: completed_at is a UTC instant displayed local, NOT a CT exception).

**Files:**
- Modify writers: `scripts/db/query.py:1185` (LMM default), `:1236`+`:1341` (split completion clock: CT→UTC for LMM, UTC for completed_at), `:1240` (completed_at), verify `:2922` (covered by `:1185` default).
- Modify column-set: `scripts/db/outbox.py:160-163` move `last_meaningful_movement` + `completed_at` from `_CT_COLUMNS` → `_UTC_COLUMNS` (`:151-153`).
- Create: `scripts/db/migrations/NNN_normalize_timestamps_utc.py` (NNN = next number; current high-water is migration 062 per the registry — confirm with `python scripts/db/migrate.py --status`).
- Test: `tests/db/test_migration_normalize_timestamps_utc.py`

- [ ] **Step 1: Re-count the legacy data at HEAD (Opus-LWW A5/Alteration 11 — provenance must be re-verified)**

```bash
cd ~/Peripheral-Brain && python -c "
import sqlite3; c=sqlite3.connect('data/brain.db')
isoT = c.execute(\"SELECT COUNT(*) FROM tasks WHERE updated_at LIKE '%T%'\").fetchone()[0]
lmm  = c.execute('SELECT COUNT(*) FROM projects WHERE last_meaningful_movement IS NOT NULL').fetchone()[0]
comp = c.execute('SELECT COUNT(*) FROM tasks WHERE completed_at IS NOT NULL').fetchone()[0]
print(f'tasks.updated_at ISO-T rows: {isoT}'); print(f'projects.lmm non-null: {lmm}'); print(f'tasks.completed_at non-null: {comp}')
"
```
Record the ACTUAL counts in the migration docstring. If the ISO-T count differs materially from the assumed 43, investigate provenance (cross-ref `last_mutation_id`/`audit_log`) before the lossy rewrite — a row that is actually UTC-ISO-T must NOT be double-shifted −5h.

- [ ] **Step 2: Write the failing test**

```python
# tests/db/test_migration_normalize_timestamps_utc.py
import sqlite3
from scripts.db.migrations import NNN_normalize_timestamps_utc as mig  # adjust


def test_lmm_ct_converted_to_utc(seeded_db):
    c = sqlite3.connect(seeded_db)
    c.execute("INSERT INTO projects (id, last_meaningful_movement) VALUES ('proj_a', '2026-05-22 16:00:00')")  # CT
    c.commit()
    mig.run(c)
    out = c.execute("SELECT last_meaningful_movement FROM projects WHERE id='proj_a'").fetchone()[0]
    assert out == "2026-05-22 21:00:00"  # +5h (CDT) → UTC


def test_iso_t_updated_at_normalized(seeded_db):
    c = sqlite3.connect(seeded_db)
    c.execute("INSERT INTO tasks (id, updated_at) VALUES ('task_a', '2026-05-22T16:00:00')")  # legacy ISO-T (CT)
    c.commit()
    mig.run(c)
    out = c.execute("SELECT updated_at FROM tasks WHERE id='task_a'").fetchone()[0]
    assert out == "2026-05-22 21:00:00"  # space-sep UTC


def test_migration_idempotent_no_double_shift(seeded_db):
    c = sqlite3.connect(seeded_db)
    c.execute("INSERT INTO projects (id, last_meaningful_movement) VALUES ('proj_b', '2026-05-22 16:00:00')")
    c.commit()
    mig.run(c); mig.run(c)  # twice
    out = c.execute("SELECT last_meaningful_movement FROM projects WHERE id='proj_b'").fetchone()[0]
    assert out == "2026-05-22 21:00:00"  # NOT shifted twice


def test_already_utc_space_sep_untouched(seeded_db):
    c = sqlite3.connect(seeded_db)
    c.execute("INSERT INTO tasks (id, updated_at) VALUES ('task_c', '2026-05-22 21:00:00')")  # already UTC space-sep
    c.commit()
    mig.run(c)
    out = c.execute("SELECT updated_at FROM tasks WHERE id='task_c'").fetchone()[0]
    assert out == "2026-05-22 21:00:00"  # unchanged
```

> **Idempotency mechanism:** the migration records itself in `schema_migrations` and is keyed to run-once; the per-row guard is "only convert rows whose shape marks them legacy" — for `updated_at`: `LIKE '%T%'` (ISO-T) only; for LMM/completed_at: the migration sets a sentinel (e.g. a `schema_migrations` row) AND the writers are flipped in the SAME commit so post-migration writes are already UTC. A re-run with the migration recorded is a no-op.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Peripheral-Brain && python -m pytest tests/db/test_migration_normalize_timestamps_utc.py -v`
Expected: FAIL — migration module not yet written.

- [ ] **Step 4: Write the migration**

```python
# scripts/db/migrations/NNN_normalize_timestamps_utc.py
"""Increment 1A Task 8: one-time legacy timestamp UTC migration.

Converts mixed-zone rows to canonical UTC, atomically with the writer flip
(query.py) and the column-set reclassification (outbox.py). Resolves the R1
contradiction: writer + reader-contract + data move together.

Actual row counts at migration time (re-counted at HEAD): see commit body.
Idempotent: recorded in schema_migrations; per-row shape guards prevent
double-shift on re-run.
"""
import sqlite3
from scripts.db.timez import to_utc_dt

MIGRATION_NAME = "NNN_normalize_timestamps_utc"


def run(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    # Guard: if already recorded, no-op.
    try:
        done = cur.execute(
            "SELECT 1 FROM schema_migrations WHERE name = ?", (MIGRATION_NAME,)
        ).fetchone()
        if done:
            return
    except sqlite3.OperationalError:
        pass  # test fixtures may lack schema_migrations

    # 1. tasks.updated_at legacy ISO-T (CT) → UTC space-sep.
    for (tid, ua) in cur.execute(
        "SELECT id, updated_at FROM tasks WHERE updated_at LIKE '%T%'"
    ).fetchall():
        dt = to_utc_dt(ua, column="last_meaningful_movement")  # legacy ISO-T was CT
        if dt is not None:
            cur.execute("UPDATE tasks SET updated_at = ? WHERE id = ?",
                        (dt.strftime("%Y-%m-%d %H:%M:%S"), tid))

    # 2. projects.last_meaningful_movement CT → UTC.
    for (pid, lmm) in cur.execute(
        "SELECT id, last_meaningful_movement FROM projects WHERE last_meaningful_movement IS NOT NULL"
    ).fetchall():
        dt = to_utc_dt(lmm, column="last_meaningful_movement")  # CT on-disk
        if dt is not None:
            cur.execute("UPDATE projects SET last_meaningful_movement = ? WHERE id = ?",
                        (dt.strftime("%Y-%m-%d %H:%M:%S"), pid))

    # 3. tasks.completed_at PB-CT → UTC.
    for (tid, ca) in cur.execute(
        "SELECT id, completed_at FROM tasks WHERE completed_at IS NOT NULL"
    ).fetchall():
        dt = to_utc_dt(ca, column="completed_at")  # CT on-disk
        if dt is not None:
            cur.execute("UPDATE tasks SET completed_at = ? WHERE id = ?",
                        (dt.strftime("%Y-%m-%d %H:%M:%S"), tid))

    try:
        cur.execute("INSERT INTO schema_migrations (name, applied_at) VALUES (?, datetime('now'))",
                    (MIGRATION_NAME,))
    except sqlite3.OperationalError:
        pass
    conn.commit()
```

> **CRITICAL ordering within the migration:** rewrite the DATA using the OLD column-set classification (LMM/completed_at still resolve as CT via `column=`), THEN — in the SAME commit — flip the writers (query.py) and move the column-set (outbox.py `_CT_COLUMNS`→`_UTC_COLUMNS`). The data rewrite uses `column="last_meaningful_movement"`/`"completed_at"` which are STILL in `_CT_COLUMNS` at the moment `to_utc_dt` runs, so CT resolution is correct. After this commit, those columns are UTC on-disk AND in `_UTC_COLUMNS`, so future reads resolve them as UTC. Atomic.

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

- [ ] **Step 7: Apply the migration on a COPY first (dry-run rehearsal under the snapshot)**

```bash
cd ~/Peripheral-Brain && cp data/snapshots/2026-05-23-increment-1A/brain.db /tmp/rehearsal.db
python -c "import sqlite3; from scripts.db.migrations import NNN_normalize_timestamps_utc as m; c=sqlite3.connect('/tmp/rehearsal.db'); m.run(c); print('rehearsal applied'); print('ISO-T left:', c.execute(\"SELECT COUNT(*) FROM tasks WHERE updated_at LIKE '%T%'\").fetchone()[0])"
```
Expected: ISO-T count → 0 on the rehearsal copy; no exceptions.

- [ ] **Step 8: Apply for real (under the fresh snapshot) + verify**

Run via the migrate runner: `cd ~/Peripheral-Brain && python scripts/db/migrate.py --status` then apply. Verify post-apply:
```bash
python -c "import sqlite3; c=sqlite3.connect('data/brain.db'); print('ISO-T left:', c.execute(\"SELECT COUNT(*) FROM tasks WHERE updated_at LIKE '%T%'\").fetchone()[0])"
python scripts/db/health.py
```
Expected: ISO-T → 0; health clean; no row became "stale forever" (spot-check a few LMM values are now +5h from their prior CT).

- [ ] **Step 9: Update schema.sql (R12 parity) + commit**

Run `python scripts/db/check_schema_sql_parity.py`; if the migration changes any DEFAULT or column shape, update `schema.sql` in the same commit.

```bash
cd ~/Peripheral-Brain && git commit -F <msgfile> -- scripts/db/migrations/NNN_normalize_timestamps_utc.py scripts/db/query.py scripts/db/outbox.py tests/db/test_migration_normalize_timestamps_utc.py
```
Message: `feat(sync): atomic UTC migration — LMM + ISO-T updated_at + completed_at CT→UTC, flip writers + column-set (Increment 1A Task 8)`. Author = ingra107. No Claude attribution.

**Relay-confirm (REQUIRED):** the peer machine auto-applies routine `*.py` migrations at session-start (`auto_run_migrations`), BUT this is identity-adjacent / high-blast-radius data migration → use the `cross-machine-relay` Migration & state-change confirmation section. Both machines apply under their OWN fresh snapshot. Confirm both converged via `sync.py status --verbose` diff. **Rollback:** restore brain.db from the Task 5 snapshot (no clean SQL down for a lossy rewrite); D1 was not modified by this migration, so no D1 restore needed unless a wrong push propagated (Task 6 gate is fail-closed, so it shouldn't).

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

```python
# tests/sync/test_records.py — add
import pytest
from scripts.db.outbox import to_utc_dt, ZoneContractError


def test_naive_value_now_raises_without_ct_scaffold():
    # Post-1A: a naive value with no explicit marker AND no UTC column/origin
    # context must raise (the CT-guessing branch is gone). Only branch 1
    # (explicit marker) and the UTC-column branches survive.
    with pytest.raises(ZoneContractError):
        to_utc_dt("2026-05-22 16:00:00", column="some_unknown_column")


def test_explicit_marker_still_honored():
    got = to_utc_dt("2026-05-22T21:00:00+00:00")
    assert got.utcoffset().total_seconds() == 0
```

- [ ] **Step 3: Run to verify it fails** (the CT branch still exists, so the unknown-column case currently does NOT raise — it falls through; confirm the current behavior, then delete).

Run: `cd ~/Peripheral-Brain && python -m pytest tests/sync/test_records.py::test_naive_value_now_raises_without_ct_scaffold -v`

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

**Type/name consistency:** `now_instant`/`now_instant_wire`/`format_local`/`today_civil` (PB) and `nowInstant`/`formatLocal`/`todayCivil`/`civilFromInstant` (Hub) used consistently across tasks. `to_utc_dt(value, *, column, origin)` signature matches HEAD. The R10-name collision is resolved to R20-R23 throughout. `_CT_COLUMNS`/`_UTC_COLUMNS` references match `outbox.py:151-163`.

**Known plan-internal risks flagged inline:** circular-import guard (Task 7 Step 4, Task 8 Step 5); R22 regex false-negative on variable indirection (Task 3); Hub CI dual-repo-checkout assumption (Task 3 Step 4); re-count legacy data before lossy rewrite (Task 8 Step 1); backfill quarantine is a BLOCKING pre-req for Task 8 (Task 10 Step 1).

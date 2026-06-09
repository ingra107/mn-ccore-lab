#!/usr/bin/env python3
"""scripts/check-project-identity-gate.py — Hub-side Project-Identity Completeness Gate.

The Hub D1 half of the symmetric, fail-closed Project-Identity Completeness Gate
(Slice E of the Project-Identity Convergence north-star). PB owns the canonical
gate + both-store run (scripts/db/project_identity_gate.py); this self-contained
stdlib script is what Hub CI runs WITHOUT a PB checkout, against prod D1.

NORTH-STAR: ONE machine identity = typed `proj_*` PK everywhere INTERNAL
(storage, FK columns, kg composite keys, sync wire). Slug = a one-way human
projection resolved ONLY at the HTTP read boundary. Decision: PB
Context/Decisions/2026-06-05-project-identity-single-machine-identity.md.

SURFACE SSOT: scripts/project-identity-surfaces.json (the Hub copy; PB's
tests/db/test_project_identity_gate.py asserts it equals the PB canonical's
hub_d1 slice so the two repos can't drift).

CHECKS (all against prod D1, read-only):
  1. SCHEMA-INTROSPECTION (fail-closed): every %project%id% column on prod D1
     MUST be in surfaces.hub_d1. An UNKNOWN column = FAILURE.
  2. ASSERTIONS a-d: 0 typed-orphan kg nodes; 0 active rels touching an
     orphan/tombstoned node; active slug-form project: kg nodes == KEEP set;
     all typed_required FK columns hold ONLY typed proj_* (or NULL).
  3. TODAY'S LESSONS L1/L2: no active rel dangling to a missing typed kg node
     (except known_residues); no deleted_at-only project kg tombstone.

INVOCATION (CI): python3 scripts/check-project-identity-gate.py
  Uses `wrangler d1 execute mnccore-lab --remote --json --command "<sql>"`.
  In CI the D1-scoped CLOUDFLARE_API_TOKEN/ACCOUNT_ID env is set by the workflow
  (same as the schema-drift dump step). The .githooks raw-d1 ban exempts
  .github/workflows/, and this script is only invoked from CI.

  --self-test : run the assertion logic against an in-memory SQLite fixture (no
  network) so the script's SQL is exercised offline (used by a unit step / local).

EXIT: 0 = all hard checks PASS (WARN-only residues allowed); 1 = hard failure;
2 = could not run (wrangler/auth).
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
SURFACES_JSON = _HERE / "project-identity-surfaces.json"
STORE_KEY = "hub_d1"
DB = "mnccore-lab"

_PROJECT_ID_COL = re.compile(r"project.*id", re.IGNORECASE)
_TYPED_PREFIX = "proj_"

# Hub D1 kg is a DETACHED store post-P4 (2026-06-05/09): there is NO steady-state
# brain.db -> Hub kg propagation path (PB `upsert_kg_entity` is event-first/no-
# outbox; the Lane-3 kg pull is gated OFF under PB_BRAIN_EVENT_LOGS=on;
# mutations.ts' kg rail is unfed; reenqueue_brain_to_hub is rollback-only).
# Cross-machine kg now syncs home<->work via the brain event log, NOT via Hub.
# PB cannot repair Hub-only kg drift through its normal write path, so HARD-gating
# Hub kg integrity is a maintenance trap (codex 2026-06-09 Q3). The kg graph-
# integrity checks (a/b/c/L1/L2) are therefore WARN-only on Hub: drift stays
# VISIBLE in the report but never blocks Hub CI. The fail-closed introspection +
# d_fk_typed (live, PB-repairable FK/storage identity surfaces: projects.id,
# tasks.project_id, ...) stay HARD. Decision: PB
# Context/Decisions/2026-06-09-slice-d-project-dependencies-historical-disposition.md
# + Docs/ld_brain_sync.md §6 ④. Keep in lockstep with PB project_identity_gate.py::_demote_hub_kg.
_KG_CHECK_SEVERITY = "warn"


def load_surfaces() -> dict:
    return json.loads(SURFACES_JSON.read_text(encoding="utf-8"))


# ─────────────────────────────────────────────────────────────────────────────
# D1 query (CI) — direct wrangler subprocess; CI env carries D1-scoped creds.
# ─────────────────────────────────────────────────────────────────────────────
def _wrangler_cmd() -> list[str]:
    """Resolve a wrangler invocation. CI installs it globally (`wrangler` on
    PATH); locally fall back to the repo-local node_modules bin (mirrors
    scripts/wrangler_d1.py::_wrangler_cmd) so the live path is testable offline-
    from-PATH."""
    import shutil
    for name in ("wrangler.cmd", "wrangler"):
        cand = _HERE.parent / "node_modules" / ".bin" / name
        if cand.exists():
            return [str(cand)]
    for exe in ("wrangler", "wrangler.cmd"):
        if path := shutil.which(exe):
            return [path]
    raise RuntimeError("wrangler not found on PATH or repo node_modules")


def d1_query(sql: str) -> list[dict]:
    cmd = _wrangler_cmd() + ["d1", "execute", DB, "--remote", "--json",
                             "--command", sql]
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          cwd=str(_HERE.parent))
    if proc.returncode != 0:
        raise RuntimeError(f"wrangler d1 failed: {proc.stderr[-1500:]}")
    data = json.loads(proc.stdout)
    return data[0]["results"]


def _scalar(rows: list[dict]) -> int:
    return list(rows[0].values())[0]


# ─────────────────────────────────────────────────────────────────────────────
# Engine — runs against any callable `query(sql) -> list[dict]` (D1 or sqlite).
# ─────────────────────────────────────────────────────────────────────────────
def _active(alias: str = "") -> str:
    p = f"{alias}." if alias else ""
    return f"{p}deleted_at IS NULL AND {p}valid_until IS NULL"


def run_checks(query, surfaces: dict, *, table_exists) -> list[dict]:
    results: list[dict] = []
    ns = surfaces["kg_namespace"]
    keep = set(surfaces["keep_slug_kg_nodes"])
    listed = surfaces["surfaces"][STORE_KEY]

    def add(name, ok, severity, detail, data=None):
        results.append({"name": name, "ok": ok, "severity": severity,
                        "detail": detail, "data": data})

    # 1. INTROSPECTION (fail-closed).
    discovered = {(r["tbl"], r["col"]) for r in query(
        "SELECT m.name AS tbl, p.name AS col FROM sqlite_master m "
        "JOIN pragma_table_info(m.name) p WHERE m.type='table' "
        "AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%' "
        "AND m.name <> 'd1_migrations' AND lower(p.name) LIKE '%project%id%' "
        "ORDER BY m.name, p.name")}
    listed_pid = {(s["table"], s["column"]) for s in listed
                  if _PROJECT_ID_COL.search(s["column"])}
    unknown = sorted(discovered - listed_pid)
    add("introspection_fail_closed", not unknown, "hard",
        f"discovered={len(discovered)} listed={len(listed_pid)} "
        f"unknown={unknown if unknown else 0}", {"unknown": unknown})

    # a. typed-orphan kg nodes.
    if table_exists("kg_entities"):
        like = " OR ".join(f"id LIKE '{p}'" for p in ns["typed_orphan_patterns"])
        in_clause = ", ".join("'" + i.replace("'", "''") + "'"
                              for i in ns["test_orphan_ids"])
        n = _scalar(query(f"SELECT COUNT(*) n FROM kg_entities WHERE {_active()} "
                          f"AND (({like}) OR id IN ({in_clause}))"))
        add("a_active_typed_orphan_kg_nodes", n == 0, _KG_CHECK_SEVERITY,
            f"active typed-orphan project kg nodes = {n}")

    # b. relations touching orphan/tombstoned node.
    if table_exists("kg_relations"):
        oc = " OR ".join(
            [f"r.source_id LIKE '{p}'" for p in ns["typed_orphan_patterns"]]
            + [f"r.target_id LIKE '{p}'" for p in ns["typed_orphan_patterns"]])
        n = _scalar(query(
            f"SELECT COUNT(*) n FROM kg_relations r WHERE {_active('r')} "
            f"AND (({oc}) OR EXISTS (SELECT 1 FROM kg_entities e WHERE "
            f"e.id=r.source_id AND (e.deleted_at IS NOT NULL OR e.valid_until "
            f"IS NOT NULL)) OR EXISTS (SELECT 1 FROM kg_entities e WHERE "
            f"e.id=r.target_id AND (e.deleted_at IS NOT NULL OR e.valid_until "
            f"IS NOT NULL)))"))
        add("b_active_rels_touching_orphan_or_tombstoned", n == 0, _KG_CHECK_SEVERITY,
            f"active relations -> typed-orphan or tombstoned node = {n}")

    # c. slug-form kg nodes == KEEP set.
    if table_exists("kg_entities"):
        found = {r["id"] for r in query(
            f"SELECT id FROM kg_entities WHERE id LIKE 'project:%' "
            f"AND id NOT LIKE 'project:proj_%' AND {_active()}")}
        extra = sorted(found - keep)
        add("c_slug_form_kg_nodes_eq_keep_set", not extra, _KG_CHECK_SEVERITY,
            f"active slug-form project nodes={len(found)} (KEEP={len(keep)}); "
            f"unexpected={extra if extra else 0}", {"extra": extra})

    # d. typed_required FK columns hold only typed proj_*.
    for s in listed:
        if s["policy"] != "typed_required" or s["kind"] not in ("fk", "storage_pk"):
            continue
        t, col = s["table"], s["column"]
        if not table_exists(t):
            add(f"d_fk_typed::{t}.{col}", True, "info", "table absent")
            continue
        n = _scalar(query(
            f"SELECT COUNT(*) n FROM \"{t}\" WHERE \"{col}\" IS NOT NULL "
            f"AND \"{col}\" NOT LIKE '{_TYPED_PREFIX}%'"))
        add(f"d_fk_typed::{t}.{col}", n == 0, "hard",
            f"non-typed stored values = {n}")

    # L1. kg-node existence vs projects-table + dangling relation.
    if table_exists("kg_entities") and table_exists("projects"):
        orphan_nodes = _scalar(query(
            f"SELECT COUNT(*) n FROM kg_entities e WHERE e.id LIKE 'project:proj_%' "
            f"AND {_active('e')} AND NOT EXISTS (SELECT 1 FROM projects p "
            f"WHERE 'project:' || p.id = e.id)"))
        missing: set[str] = set()
        if table_exists("kg_relations"):
            for r in query(
                f"SELECT r.source_id, r.target_id FROM kg_relations r "
                f"WHERE {_active('r')} AND ((r.source_id LIKE 'project:proj_%' "
                f"AND NOT EXISTS (SELECT 1 FROM kg_entities e WHERE e.id=r.source_id)) "
                f"OR (r.target_id LIKE 'project:proj_%' AND NOT EXISTS "
                f"(SELECT 1 FROM kg_entities e WHERE e.id=r.target_id)))"):
                for end in (r["source_id"], r["target_id"]):
                    if end and end.startswith("project:proj_") and not _scalar(
                            query(f"SELECT COUNT(*) n FROM kg_entities WHERE id='{end}'")):
                        missing.add(end)
        known = (surfaces.get("known_residues", {}).get(STORE_KEY, {})
                 .get("L1_kg_node_vs_table", {}).get("dangling_rel_missing_node", []))
        known_nodes = {e["missing_node"] for e in known}
        unexpected = sorted(n for n in missing if n not in known_nodes)
        tracked = sorted(n for n in missing if n in known_nodes)
        hard_ok = (orphan_nodes == 0 and not unexpected)
        # Hub kg is detached-legacy → warn-only (see _KG_CHECK_SEVERITY); drift
        # stays visible in `ok`/`data` but never CI-blocks.
        severity = _KG_CHECK_SEVERITY
        ok = hard_ok and not tracked
        add("L1_kg_node_vs_table", ok, severity,
            f"typed kg nodes with no live project row = {orphan_nodes}; "
            f"dangling rels to missing node = {len(missing)} "
            f"(unexpected={unexpected if unexpected else 0}; "
            f"tracked={tracked if tracked else 0})",
            {"orphan_nodes": orphan_nodes, "unexpected": unexpected,
             "tracked": tracked})

    # L2. tombstones co-set valid_until.
    if table_exists("kg_entities"):
        ent = _scalar(query(
            "SELECT COUNT(*) n FROM kg_entities WHERE id LIKE 'project:%' "
            "AND deleted_at IS NOT NULL AND valid_until IS NULL"))
        rel = 0
        if table_exists("kg_relations"):
            rel = _scalar(query(
                "SELECT COUNT(*) n FROM kg_relations WHERE (source_id LIKE "
                "'project:%' OR target_id LIKE 'project:%') AND deleted_at "
                "IS NOT NULL AND valid_until IS NULL"))
        add("L2_tombstone_co_sets_valid_until", ent == 0 and rel == 0, _KG_CHECK_SEVERITY,
            f"deleted_at-only project kg tombstones: entities={ent} relations={rel}")

    return results


# ─────────────────────────────────────────────────────────────────────────────
# Live D1 run.
# ─────────────────────────────────────────────────────────────────────────────
def _live_table_exists_factory():
    cache = None

    def table_exists(table: str) -> bool:
        nonlocal cache
        if cache is None:
            cache = {r["name"] for r in d1_query(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' "
                "AND name <> 'd1_migrations'")}
        return table in cache
    return table_exists


def _report(results: list[dict]) -> int:
    print("=" * 78)
    print("PROJECT-IDENTITY COMPLETENESS GATE — Hub D1 (CI, fail-closed)")
    print("=" * 78)
    hard_fail = False
    for c in results:
        if c["ok"]:
            mark = "PASS"
        elif c["severity"] == "hard":
            mark, hard_fail = "FAIL", True
        else:
            mark = c["severity"].upper()
        print(f"  [{mark:4s}] {c['name']}: {c['detail']}")
    print("-" * 78)
    print(f"RESULT: {'FAIL' if hard_fail else 'PASS'}")
    return 1 if hard_fail else 0


def _self_test() -> int:
    """Exercise run_checks against an in-memory SQLite fixture (no network)."""
    surfaces = load_surfaces()
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        "CREATE TABLE projects (id TEXT, slug TEXT, deleted_at TEXT);"
        "CREATE TABLE kg_entities (id TEXT, deleted_at TEXT, valid_until TEXT);"
        "CREATE TABLE kg_relations (source_id TEXT, target_id TEXT, "
        "  relation_type TEXT, deleted_at TEXT, valid_until TEXT);"
        "CREATE TABLE tasks (id TEXT, project_id TEXT);")
    pk = "proj_ST00000000000000000000000001"
    conn.execute("INSERT INTO projects VALUES (?,?,?)", (pk, "st", None))
    conn.execute("INSERT INTO kg_entities VALUES (?,?,?)", (f"project:{pk}", None, None))
    conn.execute("INSERT INTO tasks VALUES (?,?)", ("t1", pk))
    for node in surfaces["keep_slug_kg_nodes"]:
        conn.execute("INSERT INTO kg_entities VALUES (?,?,?)", (node, None, None))
    conn.commit()

    def query(sql):
        return [dict(r) for r in conn.execute(sql).fetchall()]

    def table_exists(t):
        return conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (t,)).fetchone() is not None

    results = run_checks(query, surfaces, table_exists=table_exists)
    rc = _report(results)
    # In self-test the fixture is clean -> expect PASS.
    return rc


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Hub-side Project-Identity Gate (CI).")
    ap.add_argument("--self-test", action="store_true",
                    help="run against an in-memory fixture (no network).")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    if args.self_test:
        return _self_test()

    surfaces = load_surfaces()
    try:
        results = run_checks(d1_query, surfaces,
                             table_exists=_live_table_exists_factory())
    except Exception as e:  # noqa: BLE001 — run boundary
        print(f"::error::Project-identity gate could not run: {e}")
        return 2
    if args.json:
        print(json.dumps(results, indent=2))
        return 1 if any((not c["ok"]) and c["severity"] == "hard"
                        for c in results) else 0
    return _report(results)


if __name__ == "__main__":
    sys.exit(main())

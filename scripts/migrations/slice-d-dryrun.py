#!/usr/bin/env python
"""
Slice D dry-run — local-D1 faithful rehearsal of the project_dependencies re-key.
================================================================================
READ-ONLY against prod D1 (uses `wrangler d1 export --remote`, never --execute).
Applies scripts/migrations/slice-d-dep-rekey.sql to a LOCAL SQLite copy of prod
under PRAGMA foreign_keys = ON and asserts the fail-closed interlock + post-state.

FAIL-CLOSED INTERLOCK (aborts before applying if violated):
  Every one of the 8 prod project_dependencies rows MUST be a DOUBLE-ORPHAN —
  neither from_slug NOR to_slug resolves to ANY project (live or deleted) by
  projects.id or projects.slug. If ANY row resolves to a real project, a genuine
  edge exists and the "drop all" assumption is FALSE → ABORT (non-zero exit).

POST-STATE ASSERTIONS (after applying the migration to the local copy):
  - project_dependencies row count == 0
  - PRAGMA foreign_key_check == 0 violations
  - new DDL present: from_project_id / to_project_id columns, FK to projects(id),
    UNIQUE(from_project_id,to_project_id), CHECK(from<>to); old from_slug/to_slug
    columns GONE.

USAGE:
  python scripts/migrations/slice-d-dryrun.py
  python scripts/migrations/slice-d-dryrun.py --skip-export PATH   # reuse a prior export

This script NEVER writes to prod. The prod apply is a separate, Nick-gated step
documented in scripts/migrations/RUNBOOK-slice-d-dep-rekey.md.
"""

import argparse
import subprocess
import sqlite3
import sys
import tempfile
from pathlib import Path

HUB_REPO = Path(__file__).resolve().parents[2]
D1_DB_NAME = "mnccore-lab"
MIGRATION_SQL = HUB_REPO / "scripts" / "migrations" / "slice-d-dep-rekey.sql"


def export_prod_to_local(tmp_dir: Path) -> Path:
    """wrangler d1 export (read-only) -> local binary SQLite. Returns its path."""
    sql_dump = tmp_dir / "slice_d_fresh.sql"
    sqlite_path = tmp_dir / "slice_d_fresh.sqlite"
    print(f"[INFO] Exporting prod D1 (read-only) -> {sql_dump} ...")
    r = subprocess.run(
        f'npx wrangler d1 export {D1_DB_NAME} --remote --output "{sql_dump}"',
        capture_output=True, text=True, cwd=str(HUB_REPO), shell=True,
    )
    if r.returncode != 0 or not sql_dump.exists():
        print(f"[ERROR] export failed:\n{r.stderr}\n{r.stdout}", file=sys.stderr)
        sys.exit(1)
    print(f"[OK] dump: {sql_dump} ({sql_dump.stat().st_size // 1024} KB)")
    raw = sql_dump.read_bytes().replace(b"\x00", b" ").decode("utf-8", errors="replace")
    conn = sqlite3.connect(str(sqlite_path))
    try:
        conn.executescript(raw)
        conn.commit()
    finally:
        conn.close()
    print(f"[OK] local SQLite: {sqlite_path}")
    return sqlite_path


def assert_all_double_orphan(conn: sqlite3.Connection) -> None:
    """Fail-closed interlock: every dep row must be a double-orphan."""
    n = conn.execute("SELECT COUNT(*) FROM project_dependencies").fetchone()[0]
    print(f"[INFO] prod project_dependencies row count: {n}")
    # A row is a double-orphan iff NEITHER endpoint resolves to any project
    # (by id OR slug). Surface any row that resolves to a real project.
    resolves = conn.execute(
        """
        SELECT from_slug, to_slug FROM project_dependencies d
        WHERE EXISTS (SELECT 1 FROM projects p WHERE p.id = d.from_slug OR p.slug = d.from_slug)
           OR EXISTS (SELECT 1 FROM projects p WHERE p.id = d.to_slug   OR p.slug = d.to_slug)
        """
    ).fetchall()
    if resolves:
        print(
            f"[ABORT] {len(resolves)} project_dependencies row(s) RESOLVE to a real "
            "project — NOT a double-orphan. The 'drop all' assumption is FALSE. "
            "A genuine edge exists; do NOT proceed.",
            file=sys.stderr,
        )
        for fr, to in resolves:
            print(f"  RESOLVES: from_slug={fr!r} to_slug={to!r}", file=sys.stderr)
        sys.exit(1)
    print(f"[OK] fail-closed interlock: all {n} rows are double-orphans (none resolve to a live or deleted project).")


def apply_and_verify(conn: sqlite3.Connection) -> None:
    """Apply the migration under FK=ON; assert post-state."""
    conn.execute("PRAGMA foreign_keys = ON")
    print("[INFO] Applying scripts/migrations/slice-d-dep-rekey.sql to local copy ...")
    conn.executescript(MIGRATION_SQL.read_text(encoding="utf-8"))
    conn.commit()
    conn.execute("PRAGMA foreign_keys = ON")  # migration ends ON; be explicit

    failures: list[str] = []

    # 1. Row count == 0
    n = conn.execute("SELECT COUNT(*) FROM project_dependencies").fetchone()[0]
    print(f"  project_dependencies row count: {n} (expect 0)")
    if n != 0:
        failures.append(f"row count {n} != 0")

    # 2. foreign_key_check == 0
    fk = conn.execute("PRAGMA foreign_key_check").fetchall()
    print(f"  PRAGMA foreign_key_check: {len(fk)} violations (expect 0)")
    if fk:
        failures.append(f"foreign_key_check: {len(fk)} violations: {fk[:5]}")

    # 3. DDL shape
    ddl = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='project_dependencies'"
    ).fetchone()[0]
    cols = {row[1] for row in conn.execute("PRAGMA table_info(project_dependencies)").fetchall()}
    print(f"  columns: {sorted(cols)}")
    for required in ("from_project_id", "to_project_id", "id"):
        if required not in cols:
            failures.append(f"missing column {required}")
    for gone in ("from_slug", "to_slug"):
        if gone in cols:
            failures.append(f"old column {gone} still present")
    fks = conn.execute("PRAGMA foreign_key_list(project_dependencies)").fetchall()
    fk_targets = {(row[2], row[3], row[4]) for row in fks}  # (table, from, to)
    print(f"  foreign keys: {fk_targets}")
    if not any(t[0] == "projects" for t in fk_targets):
        failures.append("no FK to projects")
    if "UNIQUE" not in ddl.upper() or "from_project_id, to_project_id" not in ddl.replace("\n", " "):
        # tolerate spacing differences
        if "UNIQUE (from_project_id, to_project_id)" not in ddl:
            failures.append("UNIQUE(from_project_id,to_project_id) not found in DDL")
    if "CHECK (from_project_id <> to_project_id)" not in ddl:
        failures.append("CHECK(from<>to) not found in DDL")

    if failures:
        print("[ABORT] post-state assertions FAILED:", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        sys.exit(1)

    print("\n[PASS] Slice D dry-run: interlock + migration + post-state all GREEN.")
    print("  Prod D1 was NOT modified. Prod apply is the Nick-gated runbook step.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Slice D local-D1 dry-run (read-only against prod).")
    ap.add_argument("--skip-export", type=Path, default=None,
                    help="Reuse an existing local SQLite copy instead of re-exporting.")
    args = ap.parse_args()

    print("=" * 70)
    print("Slice D dry-run — project_dependencies re-key (LOCAL copy; prod read-only)")
    print("=" * 70)

    with tempfile.TemporaryDirectory(prefix="slice_d_dryrun_") as td:
        tmp = Path(td)
        local = args.skip_export if args.skip_export else export_prod_to_local(tmp)
        conn = sqlite3.connect(str(local))
        try:
            conn.execute("PRAGMA foreign_keys = ON")
            assert_all_double_orphan(conn)
            apply_and_verify(conn)
        finally:
            conn.close()


if __name__ == "__main__":
    main()

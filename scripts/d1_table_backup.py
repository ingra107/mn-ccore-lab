#!/usr/bin/env python
"""Back up whole Hub D1 tables before a DROP TABLE, and turn the backup back into SQL.

Grants phase 2 (schema-v134 drops grants, grant_milestones, nih_grants and
milestones.grant_id). The nightly PB `backup_d1.py` export is the long-tail
layer; this is the targeted one, taken by hand right before the drop, so the
dropped rows sit in one small, named, cross-machine file next to the D1 Time
Travel bookmark of the moment they were read.

    take         Record the Time Travel bookmark, then for each table its
                 CREATE TABLE and CREATE INDEX text (sqlite_master) and every
                 row, plus (--column TABLE.KEY.COL) the key and value of one
                 column about to be dropped from a surviving table. Writes
                 JSON, reads it back, and refuses unless every table's row
                 count equals SELECT COUNT(*). Never overwrites a file.
    restore-sql  Emit the SQL that puts the tables back: each recorded CREATE
                 TABLE and CREATE INDEX, then one INSERT per row; for a
                 --column entry, the UPDATEs that refill it (its ADD COLUMN is
                 written by hand from the migration's ROLLBACK note).
    verify       Re-read a backup and compare it with live D1 (tables still
                 present): every row equal.

Coverage (ethos #9): the named tables and columns only, as of the bookmark.
Everything else, and any write after the bookmark, is D1 Time Travel (30 days,
in-account) and the nightly export (out-of-account).

Read-only on D1: SELECTs and `time-travel info`, through the sanctioned
wrangler_d1.run_d1 (env-stripped OAuth). Run from the repo root.

Usage (grants phase 2):
    python scripts/d1_table_backup.py take --db mnccore-lab \
        --tables grants,grant_milestones,nih_grants --column milestones.id.grant_id \
        --out ~/PB-State/data/shared/backups/legacy-grants-2026-10-12.json
    python scripts/d1_table_backup.py verify <backup.json> --db mnccore-lab
    python scripts/d1_table_backup.py restore-sql <backup.json>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
FORMAT = "d1-table-backup/1"


def _ident(name: str) -> str:
    if not _IDENT.match(name):
        raise ValueError(f"not a plain SQL identifier: {name!r}")
    return name


def _lit(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def _default_run_d1() -> Callable:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from wrangler_d1 import run_d1  # noqa: E402  (sibling module)
    return run_d1


def _select(run_d1: Callable, db: str, sql: str) -> list[dict]:
    res = run_d1(["execute", db], json=True, command=sql, timeout=180)
    payload = res.json
    if not isinstance(payload, list) or not payload or not payload[0].get("success", True):
        raise RuntimeError(f"d1 SELECT on {db} did not succeed: {str(payload)[:500]}")
    return list(payload[0].get("results") or [])


def _bookmark(run_d1: Callable, db: str) -> str:
    res = run_d1(["time-travel", "info", db], remote=False, json=True, timeout=120)
    mark = (res.json or {}).get("bookmark") if isinstance(res.json, dict) else None
    if not mark:
        raise RuntimeError(f"time-travel info for {db} returned no bookmark: {res.stdout[-500:]}")
    return str(mark)


def _parse_column(spec: str) -> tuple[str, str, str]:
    parts = spec.split(".")
    if len(parts) != 3:
        raise ValueError(f"--column wants TABLE.KEY.COLUMN, got {spec!r}")
    return tuple(_ident(p) for p in parts)  # type: ignore[return-value]


def take(*, db: str, tables: list[str], columns: list[str], out: Path,
         run_d1: Callable | None = None) -> dict:
    """Take the backup. Returns the manifest written. RAISES on any mismatch."""
    tables = [_ident(t) for t in tables]
    cols = [_parse_column(c) for c in columns]
    if not tables and not cols:
        raise ValueError("name at least one table or column")
    if out.exists():
        raise FileExistsError(f"{out} exists; a backup is never overwritten")
    run_d1 = run_d1 or _default_run_d1()

    mark = _bookmark(run_d1, db)
    taken_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest: dict = {"format": FORMAT, "db": db, "time_travel_bookmark": mark,
                      "taken_at": taken_at, "tables": [], "columns": []}
    for t in tables:
        ddl = _select(run_d1, db, f"SELECT type, name, sql FROM sqlite_master "
                                  f"WHERE tbl_name = '{t}' AND sql IS NOT NULL ORDER BY type DESC, name")
        create = [r["sql"] for r in ddl if r["type"] == "table"]
        if len(create) != 1:
            raise RuntimeError(f"{db}.{t}: no table (already dropped?)")
        others = [r for r in ddl if r["type"] != "table"]
        if any(r["type"] != "index" for r in others):
            raise RuntimeError(f"{db}.{t}: a trigger or view rides on it; back that up by hand: "
                               f"{[r['name'] for r in others]}")
        rows = _select(run_d1, db, f"SELECT * FROM {t} ORDER BY rowid")
        count = _select(run_d1, db, f"SELECT COUNT(*) AS n FROM {t}")[0]["n"]
        if len(rows) != count:
            raise RuntimeError(f"{db}.{t}: fetched {len(rows)} rows but COUNT(*) = {count}")
        manifest["tables"].append({"table": t, "create": create[0],
                                   "indexes": [r["sql"] for r in others],
                                   "row_count": count, "rows": rows})
    for t, key, col in cols:
        rows = _select(run_d1, db, f"SELECT {key}, {col} FROM {t} WHERE {col} IS NOT NULL ORDER BY {key}")
        count = _select(run_d1, db, f"SELECT COUNT(*) AS n FROM {t} WHERE {col} IS NOT NULL")[0]["n"]
        if len(rows) != count:
            raise RuntimeError(f"{db}.{t}.{col}: fetched {len(rows)} rows but COUNT(*) = {count}")
        manifest["columns"].append({"table": t, "key": key, "column": col,
                                    "non_null": count, "rows": rows})

    body = json.dumps(manifest, indent=1, ensure_ascii=True) + "\n"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("x", encoding="utf-8", newline="\n") as fh:
        fh.write(body)
    back = json.loads(out.read_text(encoding="utf-8"))
    if back != manifest:
        raise RuntimeError(f"{out}: read-back does not match what was fetched")
    manifest["sha256"] = hashlib.sha256(out.read_bytes()).hexdigest()
    return manifest


def load(path: Path) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("format") != FORMAT:
        raise ValueError(f"{path}: not a {FORMAT} file")
    for t in data["tables"]:
        if len(t["rows"]) != t["row_count"]:
            raise ValueError(f"{path}: {t['table']} has {len(t['rows'])} rows but row_count {t['row_count']}")
    return data


def restore_sql(data: dict) -> str:
    lines = [f"-- restore from {data['db']} backup taken {data['taken_at']} "
             f"(Time Travel bookmark {data['time_travel_bookmark']})"]
    for t in data["tables"]:
        name = _ident(t["table"])
        lines.append(t["create"].rstrip().rstrip(";") + ";")
        lines += [ix.rstrip().rstrip(";") + ";" for ix in t["indexes"]]
        for row in t["rows"]:
            names = [_ident(c) for c in row]
            lines.append(f"INSERT INTO {name} ({', '.join(names)}) VALUES "
                         f"({', '.join(_lit(row[c]) for c in row)});")
    for c in data["columns"]:
        t, key, col = _ident(c["table"]), _ident(c["key"]), _ident(c["column"])
        lines.append(f"-- {t}.{col}: re-add the column first (see the migration's ROLLBACK note)")
        for row in c["rows"]:
            lines.append(f"UPDATE {t} SET {col} = {_lit(row[col])} WHERE {key} = {_lit(row[key])};")
    return "\n".join(lines) + "\n"


def compare(data: dict, live: Callable[[str], list[dict]]) -> list[str]:
    """Every backed-up row vs live(sql). [] = equal."""
    problems: list[str] = []
    for t in data["tables"]:
        got = live(f"SELECT * FROM {_ident(t['table'])} ORDER BY rowid")
        if got != t["rows"]:
            problems.append(f"{t['table']}: backup {len(t['rows'])} rows != live {len(got)} rows "
                            f"(or a value differs)")
    for c in data["columns"]:
        t, key, col = _ident(c["table"]), _ident(c["key"]), _ident(c["column"])
        got = live(f"SELECT {key}, {col} FROM {t} WHERE {col} IS NOT NULL ORDER BY {key}")
        if got != c["rows"]:
            problems.append(f"{t}.{col}: backup {len(c['rows'])} rows != live {len(got)}")
    return problems


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("take")
    t.add_argument("--db", required=True)
    t.add_argument("--tables", default="", help="comma-separated")
    t.add_argument("--column", action="append", default=[], help="TABLE.KEY.COLUMN (repeatable)")
    t.add_argument("--out", required=True)
    r = sub.add_parser("restore-sql")
    r.add_argument("backup")
    v = sub.add_parser("verify")
    v.add_argument("backup")
    v.add_argument("--db", required=True)
    args = ap.parse_args(argv)

    if args.cmd == "take":
        out = Path(args.out).expanduser()
        m = take(db=args.db, tables=[x for x in args.tables.split(",") if x],
                 columns=args.column, out=out)
        counts = {t["table"]: t["row_count"] for t in m["tables"]}
        counts.update({f"{c['table']}.{c['column']}": c["non_null"] for c in m["columns"]})
        print(f"OK {m['db']}: rows {counts}, bookmark {m['time_travel_bookmark']}, sha256 {m['sha256']}")
        print(f"   -> {out}")
        return 0
    data = load(Path(args.backup).expanduser())
    if args.cmd == "restore-sql":
        sys.stdout.write(restore_sql(data))
        return 0
    run_d1 = _default_run_d1()
    problems = compare(data, lambda sql: _select(run_d1, args.db, sql))
    if problems:
        print(f"MISMATCH: {len(problems)}", *problems, sep="\n")
        return 1
    print(f"OK: every row matches live {args.db}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

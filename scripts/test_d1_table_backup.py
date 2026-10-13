"""d1_table_backup round trip: take from a database, drop, restore-sql, compare.

The fake run_d1 answers SELECTs from a real SQLite database, so the SQL the
script sends is the SQL that runs. The schema is prod's for the three legacy
grant tables (sqlite_master, read 2026-10-12) plus milestones.grant_id.

Run: python -m pytest scripts/test_d1_table_backup.py -q
"""
from __future__ import annotations

import importlib.util
import json
import sqlite3
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("d1_table_backup", HERE / "d1_table_backup.py")
mod = importlib.util.module_from_spec(spec)
sys.modules["d1_table_backup"] = mod
spec.loader.exec_module(mod)

SCHEMA = """
CREATE TABLE grants (id TEXT PRIMARY KEY, mechanism TEXT, title TEXT NOT NULL, agency TEXT, pi TEXT,
  start_date TEXT, end_date TEXT, proposed INTEGER DEFAULT 0, total_funding REAL,
  created_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'planning');
CREATE TABLE grant_milestones (id TEXT PRIMARY KEY, grant_id TEXT NOT NULL, milestone_type TEXT NOT NULL,
  title TEXT NOT NULL, due_date TEXT, completed_at TEXT, status TEXT DEFAULT 'upcoming', notes TEXT,
  created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX idx_grant_milestones_grant ON grant_milestones(grant_id);
CREATE TABLE nih_grants (project_number TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', study_section TEXT,
  is_lab_grant INTEGER NOT NULL DEFAULT 0);
CREATE INDEX idx_nih_grants_section ON nih_grants(study_section);
CREATE TABLE milestones (id TEXT PRIMARY KEY, title TEXT NOT NULL, grant_id TEXT REFERENCES grants(id));
INSERT INTO grants (id, mechanism, title, agency, pi, start_date, end_date, proposed, total_funding, status)
  VALUES ('k23', 'K23', 'Provider''s Practice', 'NHLBI', 'nick-ingraham', '2023-07-01', '2028-06-30', 0, NULL, 'funded'),
         ('r01', 'R01', 'ADHERE-LPV', 'NHLBI', 'nick-ingraham', '2027-07-01', '2032-06-30', 1, 1.5, 'in_preparation');
INSERT INTO grant_milestones (id, grant_id, milestone_type, title) VALUES ('gm1', 'k23', 'rppr', 'RPPR');
INSERT INTO milestones (id, title, grant_id) VALUES ('m1', 'x', 'k23'), ('m2', 'y', NULL);
"""


def _fake(con: sqlite3.Connection):
    con.row_factory = sqlite3.Row

    def run_d1(args, *, json=False, command=None, timeout=0, remote=True):
        if args[0] == "time-travel":
            return SimpleNamespace(json={"bookmark": "bm-1"}, stdout="")
        rows = [dict(r) for r in con.execute(command)]
        return SimpleNamespace(json=[{"success": True, "results": rows}], stdout="")
    return run_d1


def _live(con):
    return lambda sql: [dict(r) for r in con.execute(sql)]


def test_round_trip_restores_every_row_and_index(tmp_path):
    src = sqlite3.connect(":memory:")
    src.executescript(SCHEMA)
    out = tmp_path / "b.json"
    m = mod.take(db="d", tables=["grants", "grant_milestones", "nih_grants"],
                 columns=["milestones.id.grant_id"], out=out, run_d1=_fake(src))
    assert [t["row_count"] for t in m["tables"]] == [2, 1, 0]
    assert m["columns"][0]["rows"] == [{"id": "m1", "grant_id": "k23"}]
    data = mod.load(out)
    assert mod.compare(data, _live(src)) == []

    # the drop, as schema-v134 does it
    src.executescript("ALTER TABLE milestones DROP COLUMN grant_id; DROP TABLE grant_milestones; "
                      "DROP TABLE nih_grants; DROP TABLE grants;")
    src.executescript(mod.restore_sql(data).replace(
        "-- milestones.grant_id", "ALTER TABLE milestones ADD COLUMN grant_id TEXT;\n-- milestones.grant_id"))
    assert mod.compare(data, _live(src)) == []
    names = {r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    assert {"idx_grant_milestones_grant", "idx_nih_grants_section"} <= names


def test_refuses_to_overwrite_and_refuses_a_missing_table(tmp_path):
    src = sqlite3.connect(":memory:")
    src.executescript(SCHEMA)
    out = tmp_path / "b.json"
    out.write_text("{}")
    with pytest.raises(FileExistsError):
        mod.take(db="d", tables=["grants"], columns=[], out=out, run_d1=_fake(src))
    with pytest.raises(RuntimeError, match="already dropped"):
        mod.take(db="d", tables=["no_such"], columns=[], out=tmp_path / "c.json", run_d1=_fake(src))


def test_compare_sees_a_changed_value(tmp_path):
    src = sqlite3.connect(":memory:")
    src.executescript(SCHEMA)
    out = tmp_path / "b.json"
    mod.take(db="d", tables=["grants"], columns=[], out=out, run_d1=_fake(src))
    src.execute("UPDATE grants SET title = 'changed' WHERE id = 'k23'")
    assert mod.compare(mod.load(out), _live(src)) != []


def test_load_refuses_a_truncated_file(tmp_path):
    src = sqlite3.connect(":memory:")
    src.executescript(SCHEMA)
    out = tmp_path / "b.json"
    mod.take(db="d", tables=["grants"], columns=[], out=out, run_d1=_fake(src))
    data = json.loads(out.read_text())
    data["tables"][0]["rows"].pop()
    out.write_text(json.dumps(data))
    with pytest.raises(ValueError, match="row_count"):
        mod.load(out)

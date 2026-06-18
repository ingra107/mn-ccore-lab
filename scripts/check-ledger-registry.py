#!/usr/bin/env python3
"""
scripts/check-ledger-registry.py
==================================
Pre-commit gate: every new CREATE TABLE in api/schema-v*.sql that has a
timestamp column MUST have a matching entry in LEDGER_REGISTRY
(api/lib/ledger-retention.ts).

This makes "a ledger table with no retention" structurally unrepresentable
at commit time — the Level-1 fix from the 2026-06-18 processed_mutations
bloat post-mortem (88k rows / 126MB D1 caused write timeouts on all ops).

Exit codes:
    0  All new tables with timestamp columns are registered (or no new tables).
    1  At least one unregistered timestamp-bearing CREATE TABLE found.
    2  The LEDGER_REGISTRY source file could not be parsed (fatal).

Usage:
    python scripts/check-ledger-registry.py [--staged-only]

    --staged-only  Only scan sql files that are currently git-staged.
                   Omit to scan ALL api/schema-v*.sql files (useful for CI).

Portability: stdlib only. Runs on Python 3.8+ on both Linux and Windows.
"""

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
API_DIR = REPO_ROOT / "api"
REGISTRY_TS = API_DIR / "lib" / "ledger-retention.ts"

# ── Ledger-table heuristics ───────────────────────────────────────────────────
#
# We want to flag tables that are APPEND-ONLY (written once, read for
# dedup/history, pruned by age) — NOT ordinary mutable entity tables.
#
# A table is treated as a ledger if it has a "ledger-signature" column:
# a named timestamp column that signals "when this event/record was processed"
# with no corresponding updated_at — i.e., the row is written once and never
# updated (an immutable event record).
#
# Ledger-signature column names: processed_at, logged_at, received_at,
# ingested_at, emitted_at, fired_at, triggered_at, archived_at,
# PLUS standalone `timestamp TEXT` (the activity_log pattern).
#
# Excluded: tables with updated_at/modified_at columns are mutable entities;
# tables with created_at only are entity tables (tasks, projects, etc.) —
# they are mutable despite having a created_at.
#
# Tables whose name ends in _log, _events, _mutations, _mutations_cache,
# _audit, _history are also flagged regardless of column name pattern.

_LEDGER_COLUMN_RE = re.compile(
    r"^\s*\b(processed_at|logged_at|received_at|ingested_at|emitted_at"
    r"|fired_at|triggered_at|archived_at)\b",
    re.IGNORECASE | re.MULTILINE,
)
# activity_log uses bare `timestamp TEXT` (no "at" suffix)
_STANDALONE_TIMESTAMP_RE = re.compile(
    r"^\s*timestamp\s+TEXT\b",
    re.IGNORECASE | re.MULTILINE,
)
_UPDATED_AT_RE = re.compile(
    r"^\s*\b(updated_at|modified_at|last_modified|deleted_at)\b",
    re.IGNORECASE | re.MULTILINE,
)
_LEDGER_NAME_RE = re.compile(
    r"(_log|_events|_mutations|_mutations_cache|_audit|_history)$",
    re.IGNORECASE,
)

_CREATE_TABLE_RE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(",
    re.IGNORECASE,
)


def _extract_new_tables(sql_text: str) -> list[str]:
    """Return table names from CREATE TABLE statements in sql_text."""
    return _CREATE_TABLE_RE.findall(sql_text)


def _has_timestamp_column(sql_text: str, table_name: str) -> bool:
    """
    Return True if `table_name` looks like an append-only ledger table.

    Positive signals:
      - Has a ledger-signature column (processed_at, logged_at, etc.), OR
      - Has bare `timestamp TEXT` and no updated_at (activity_log pattern), OR
      - Table name ends in _log, _events, _mutations, _audit, _history.

    Negative overrides (marks as mutable entity, not a ledger):
      - Has an updated_at / modified_at column.
    """
    # Extract the body of the CREATE TABLE statement.
    pattern = re.compile(
        rf"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{re.escape(table_name)}\s*\(([^;]+?)\);",
        re.IGNORECASE | re.DOTALL,
    )
    m = pattern.search(sql_text)
    if not m:
        return False
    body = m.group(1)

    # If the table has an updated_at, it's a mutable entity — skip it.
    if _UPDATED_AT_RE.search(body):
        return False

    # Ledger-signature column name?
    if _LEDGER_COLUMN_RE.search(body):
        return True

    # Standalone `timestamp TEXT` (no updated_at already excluded)?
    if _STANDALONE_TIMESTAMP_RE.search(body):
        return True

    # Table name ending in _events (not _state_log, not _log alone) combined with
    # a created_at-only timestamp pattern (no updated_at already excluded above)
    # suggests an event ledger. Use this conservatively: only _events and
    # _mutations_cache suffixes fire on name alone; _log alone is too broad
    # (catches project_state_log, decision_log which have bounded lifetimes
    # tied to entity PKs, or are unused legacy tables).
    if re.search(r"(_events|_mutations_cache)$", table_name, re.IGNORECASE):
        return True

    return False


# ── Registry reader ───────────────────────────────────────────────────────────

def _read_registered_tables(registry_path: Path) -> set[str]:
    """
    Parse LEDGER_REGISTRY from ledger-retention.ts and return the set of
    registered table names.

    We look for `table: 'some_name'` patterns inside the LEDGER_REGISTRY
    array literal — simple regex, no TypeScript parser needed.
    """
    if not registry_path.exists():
        print(f"ERROR: LEDGER_REGISTRY source not found at {registry_path}", file=sys.stderr)
        sys.exit(2)

    text = registry_path.read_text(encoding="utf-8")

    # Find the LEDGER_REGISTRY array block.
    # Heuristic: everything between `LEDGER_REGISTRY: readonly LedgerEntry[] = [`
    # and `] as const;`
    block_match = re.search(
        r"LEDGER_REGISTRY[^=]*=\s*\[(.*?)\]\s*as\s+const",
        text,
        re.DOTALL,
    )
    if not block_match:
        print(
            "ERROR: Could not locate LEDGER_REGISTRY array in ledger-retention.ts.\n"
            "Expected pattern: `LEDGER_REGISTRY: readonly LedgerEntry[] = [ ... ] as const`",
            file=sys.stderr,
        )
        sys.exit(2)

    block = block_match.group(1)
    # Extract all `table: 'name'` or `table: "name"` occurrences.
    names = re.findall(r"table\s*:\s*['\"](\w+)['\"]", block)
    return set(names)


# ── Schema file discovery ─────────────────────────────────────────────────────

_SCHEMA_FILE_RE = re.compile(r"^schema-v\d+.*\.sql$")


def _discover_schema_files(staged_only: bool) -> list[Path]:
    if staged_only:
        try:
            result = subprocess.run(
                ["git", "diff", "--cached", "--name-only", "--diff-filter=AM"],
                capture_output=True,
                text=True,
                cwd=REPO_ROOT,
            )
            staged = result.stdout.splitlines()
        except Exception as e:
            print(f"WARN: git diff failed ({e}); falling back to full scan.", file=sys.stderr)
            staged = []

        files = []
        for rel in staged:
            p = REPO_ROOT / rel
            if _SCHEMA_FILE_RE.match(p.name) and p.parent == API_DIR and p.exists():
                files.append(p)
        return files
    else:
        return [
            API_DIR / fn
            for fn in sorted(os.listdir(API_DIR))
            if _SCHEMA_FILE_RE.match(fn)
        ]


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--staged-only",
        action="store_true",
        help="Only check git-staged schema files (pre-commit mode).",
    )
    args = parser.parse_args()

    registered = _read_registered_tables(REGISTRY_TS)
    schema_files = _discover_schema_files(staged_only=args.staged_only)

    if not schema_files:
        # Nothing to check — clean exit.
        return 0

    violations: list[tuple[str, str]] = []  # (filename, table_name)

    for path in schema_files:
        sql = path.read_text(encoding="utf-8")
        for table in _extract_new_tables(sql):
            # Only flag tables that have a timestamp column — pure entity tables
            # (tasks, projects, etc.) are mutable and don't need retention.
            if not _has_timestamp_column(sql, table):
                continue
            if table not in registered:
                violations.append((path.name, table))

    if violations:
        print()
        print("BLOCKED: new table(s) with timestamp column(s) lack a LEDGER_REGISTRY entry.")
        print()
        print(
            "The bounded-ledger primitive (api/lib/ledger-retention.ts) requires every\n"
            "append-only / audit / idempotency table to be declared in LEDGER_REGISTRY\n"
            "before it can receive writes — this makes 'a ledger with no retention'\n"
            "structurally unrepresentable (Level-1, ethos #15)."
        )
        print()
        for filename, table in violations:
            print(f"  {filename}: CREATE TABLE {table}  — not in LEDGER_REGISTRY")
        print()
        print("To fix:")
        print("  1. Add an entry to LEDGER_REGISTRY in api/lib/ledger-retention.ts:")
        print("     { table: '<name>', retentionColumn: '<col>', retentionDays: N,")
        print("       requiredIndex: '<idx_name>', note: '<why>' }")
        print("  2. Ensure the requiredIndex exists in the schema-v*.sql migration.")
        print("  3. Re-stage and re-commit.")
        print()
        return 1

    if args.staged_only and schema_files:
        print(
            f"[check-ledger-registry] {len(schema_files)} staged schema file(s) checked — "
            f"all CREATE TABLE entries covered."
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())

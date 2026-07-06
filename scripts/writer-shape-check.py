#!/usr/bin/env python
"""writer-shape-check.py — unknown-concurrent-writer detector (backlog #501b).

WHY THIS EXISTS
---------------
Born from the 2026-07-06 calendar outage post-mortem
(Peripheral-Brain/Context/Decisions/2026-07-06-calendar-outage-orphaned-test-worker.md).
An orphaned `--env test` worker held prod D1 + the hourly cron for a month and
wrote `user_calendar_events` with STALE June-7 code — a legacy 11-column
`INSERT OR REPLACE` racing the real worker's post-fix 12-column shape. Every
audit surface read the REPO; the orphan lived only in the ACCOUNT. After two
hours of wrong theories, the single command that named it was
`wrangler d1 insights` showing TWO live INSERT shapes on ONE table.

This script makes that reflex executable: derive the writer-set from the DB
ITSELF and diff it against what HEAD's Worker code emits. A DB-observed write
shape with no HEAD counterpart = an UNKNOWN WRITER (a stale deploy, an orphaned
env-copy, a foreign account actor).

PRECISION BIAS (read before extending)
--------------------------------------
A missed detection is acceptable; a noisy false-alarm tool gets deleted. Every
ambiguity resolves toward "known" (no alarm), NOT toward "unknown":
  * INSERT / REPLACE are fingerprinted by (table, column-SET) — the strongest,
    cleanest signal and the one that named the calendar orphan. Column lists are
    cleanly parenthesized in SQL, so this match is exact, not fuzzy.
  * UPDATE / DELETE are fingerprinted by (type, table) ONLY. Their column/WHERE
    shapes are built with too much dynamic SQL (COALESCE, subqueries, datetime())
    to fingerprint without false alarms. Consequence: an orphan that writes a
    KNOWN table with a novel UPDATE/DELETE shape is MISSED. Accepted tradeoff —
    the calendar orphan is caught by its INSERT regardless.
  * INSERT generic coverage is bounded EXACTLY. The only dynamic-table INSERT in
    HEAD is the A3 applier (`INSERT INTO ${mut.table}` in api/routes/mutations.ts),
    which is runtime-validated against TABLE_FIELDS from the pb-schema generated
    SSOT (the same import mutations.ts uses). So an INSERT to a TABLE_FIELDS table
    is "known" regardless of columns, while the calendar INSERT (static literal on
    a NON-synced table absent from TABLE_FIELDS) alarms. This exact bound is what
    keeps the incident detectable instead of being swallowed by the wildcard.
  * UPDATE/DELETE generic coverage is NOT bounded — HEAD's dynamic-table UPDATE/
    DELETE appliers (idempotent-delete.ts `${table}`, ledger-retention.ts
    `${entry.table}`) span open/multiple registries. So when a generic UPDATE (or
    DELETE) template exists — it does — ALL updates (deletes) are treated as
    known. e.g. `UPDATE tasks SET plan_slot=?,...` never alarms. Reinforces the
    INSERT-only teeth above.

HEAD source = every non-test `*.ts` under `api/` (routes + lib + index +
helpers) — the code the deployed Worker actually runs. `.sql` migrations and
`*.test.ts` are NOT prod Worker writers and are excluded.

EXIT CODES
----------
  0  clean — every observed write shape has a HEAD counterpart (+ per-table summary)
  1  UNKNOWN WRITER(S) found — offending fingerprint(s) + run counts printed
  2  tool/setup error (wrangler failed, generated SSOT missing, unparseable JSON)

USAGE
-----
  python scripts/writer-shape-check.py                    # default: 1d, top 100
  python scripts/writer-shape-check.py --time-period=7d --limit 200
  npm run audit:writer-shapes
"""
from __future__ import annotations

import argparse
import json as _json
import re
import sys
from pathlib import Path

# run_wrangler strips the shadowing CF_API_TOKEN/ACCOUNT_ID env vars and runs
# wrangler under OAuth (which has d1 scope). Import it — never call wrangler raw.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from wrangler_d1 import run_wrangler, WranglerD1Error  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "api"
GENERATED_FIELDS = (
    REPO_ROOT / "pb-schema" / "pb_schema" / "generated" / "field-authority.generated.ts"
)
DEFAULT_DB = "mnccore-lab"

# ${...} interpolation sentinel — marks a dynamically-built table name or column
# list, i.e. a shape whose exact form is not statically knowable. MUST be
# lowercase-invariant (parse_write lowercases table names): "§EXPR§".lower() would
# stop equalling the constant and silently break generic-template detection.
EXPR = "§expr§"

# Allowlist: D1/wrangler INTERNAL tables only. Writes to these are engine/
# framework churn, never application shapes, and must never alarm. App tables
# (incl. `_meta`, which api/lib/version.ts bumps) are deliberately NOT here — they
# classify normally against their HEAD literals so the summary stays transparent.
INTERNAL_TABLE_PREFIXES = ("_cf_", "sqlite_", "d1_", "_litestream")
INTERNAL_TABLE_EXACT = {"_cf_metadata", "_cf_kv"}


# ── SQL normalization + single-statement parsing ─────────────────────────────

def normalize_sql(s: str) -> str:
    """Collapse all whitespace to single spaces and strip trailing punctuation.

    D1 stores a prepared statement with its embedded newlines + indentation; the
    HEAD template literal carries the same. Collapsing both makes them comparable.
    """
    s = re.sub(r"\s+", " ", s).strip()
    return s.rstrip(";").strip()


def _mask_interpolations(s: str) -> str:
    """Replace ${...} template interpolations with the EXPR sentinel."""
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"\$\{[^{}]*\}", EXPR, s)
    return s


_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$", re.I)


def parse_write(sql: str):
    """Parse a normalized SQL string into a write fingerprint.

    Returns (wtype, table, cols) where:
      wtype  : 'INSERT' | 'UPDATE' | 'DELETE'  (INSERT OR REPLACE / REPLACE INTO
               all fold to 'INSERT' — same upsert semantics, same column list)
      table  : lowercased table name, or EXPR for a dynamic ${...} table
      cols   : frozenset of lowercased column names for an INSERT whose column
               list is static; None when unknown (UPDATE/DELETE, dynamic cols,
               or an INSERT with no explicit column list)
    Returns None if the string is not a write statement.
    """
    s = sql.strip()

    m = re.match(
        r"(?:INSERT(?:\s+OR\s+\w+)?|REPLACE)\s+INTO\s+([^\s(]+)\s*(?:\(([^)]*)\))?",
        s, re.I,
    )
    if m:
        table = m.group(1).lower()
        collist = m.group(2)
        if collist is None or EXPR in collist:
            cols = None  # no explicit list, or dynamically built → table-level match
        else:
            parts = [c.strip().lower() for c in collist.split(",")]
            parts = [c for c in parts if _IDENT.match(c)]
            cols = frozenset(parts) if parts else None
        return ("INSERT", table, cols)

    m = re.match(r"UPDATE\s+([^\s(]+)\s+SET\b", s, re.I)
    if m:
        return ("UPDATE", m.group(1).lower(), None)

    m = re.match(r"DELETE\s+FROM\s+([^\s(]+)", s, re.I)
    if m:
        return ("DELETE", m.group(1).lower(), None)

    return None


# ── HEAD extraction (what the deployed Worker emits) ─────────────────────────

def load_generic_applier_tables() -> set[str]:
    """The tables the runtime A3 applier can write via `${mut.table}` — exactly
    TABLE_FIELDS from the pb-schema generated SSOT (mutations.ts's own import).

    Fails LOUD (SystemExit 2) if the generated file is missing: without it the
    generic-table set would be empty and every legitimate A3 write (UPDATE tasks,
    UPDATE projects, ...) would false-positive. A silent empty set is the exact
    noisy-tool failure this script's precision bias forbids.
    """
    if not GENERATED_FIELDS.exists():
        sys.stderr.write(
            "SETUP ERROR: pb-schema generated field-authority file not found at\n"
            f"  {GENERATED_FIELDS}\n"
            "Cannot resolve the generic A3-applier table set; refusing to run "
            "(would false-alarm on every synced-table write). Sync the pb-schema "
            "submodule and retry.\n"
        )
        raise SystemExit(2)
    src = GENERATED_FIELDS.read_text(encoding="utf-8")
    return {t.lower() for t in re.findall(r"^  ([a-z_][a-z0-9_]*):\s*new Set\(", src, re.M)}


def _iter_head_sql_strings(text: str):
    """Yield string-literal bodies from one .ts file via a comment-aware scanner.

    A regex-based extractor cannot be used here: an apostrophe inside a `//`
    comment (e.g. "D1's per-batch ceiling") is an unbalanced quote that shifts
    every subsequent single-quote pairing, swallowing real SQL literals into
    phantom "comment strings" (this exact bug produced 4 false positives in the
    first run). This char-scanner tracks lexical state so comments and prose
    apostrophes never corrupt string extraction — correct by construction rather
    than by regex luck (the audit-schema-contract.ts precedent strips comments
    for the same reason).

    Backtick template bodies are yielded with ${...} intact (masked downstream);
    the scanner counts ${ } depth so a nested `${ `...` }` template's own
    backtick is not mistaken for the outer close. Non-SQL strings are yielded too
    — parse_write() filters them.
    """
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        # line comment
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            i = n if j < 0 else j + 1
            continue
        # block comment
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        # single- / double-quoted string
        if c in "'\"":
            quote = c
            i += 1
            start = i
            while i < n:
                ch = text[i]
                if ch == "\\":
                    i += 2
                    continue
                if ch == quote or ch == "\n":
                    break
                i += 1
            yield text[start:i]
            i += 1
            continue
        # template literal (may span lines; may nest ${...})
        if c == "`":
            i += 1
            buf: list[str] = []
            depth = 0
            while i < n:
                ch = text[i]
                if ch == "\\":
                    buf.append(text[i:i + 2])
                    i += 2
                    continue
                if depth == 0 and ch == "`":
                    break
                if ch == "$" and i + 1 < n and text[i + 1] == "{":
                    depth += 1
                    buf.append("${")
                    i += 2
                    continue
                if depth > 0 and ch == "{":
                    depth += 1
                elif depth > 0 and ch == "}":
                    depth -= 1
                buf.append(ch)
                i += 1
            yield "".join(buf)
            i += 1
            continue
        i += 1


class HeadShapes:
    """The write shapes the current HEAD Worker code emits."""

    def __init__(self):
        self.insert_colsets: dict[str, set[frozenset]] = {}   # table -> {colset,...}
        self.insert_anycol_tables: set[str] = set()           # static-table INSERT, cols unknown
        self.update_tables: set[str] = set()
        self.delete_tables: set[str] = set()
        self.generic_insert = False   # `INSERT INTO ${expr}` present
        self.generic_update = False   # `UPDATE ${expr} SET`   present
        self.generic_delete = False   # `DELETE FROM ${expr}`  present

    def add(self, parsed):
        wtype, table, cols = parsed
        if table == EXPR:
            if wtype == "INSERT":
                self.generic_insert = True
            elif wtype == "UPDATE":
                self.generic_update = True
            elif wtype == "DELETE":
                self.generic_delete = True
            return
        if wtype == "INSERT":
            if cols is None:
                self.insert_anycol_tables.add(table)
            else:
                self.insert_colsets.setdefault(table, set()).add(cols)
        elif wtype == "UPDATE":
            self.update_tables.add(table)
        elif wtype == "DELETE":
            self.delete_tables.add(table)


def extract_head_shapes() -> tuple[HeadShapes, set[str]]:
    head = HeadShapes()
    ts_files = [
        p for p in API_DIR.rglob("*.ts")
        if not p.name.endswith(".test.ts")
    ]
    for p in ts_files:
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for raw in _iter_head_sql_strings(text):
            sql = normalize_sql(_mask_interpolations(raw))
            parsed = parse_write(sql)
            if parsed:
                head.add(parsed)
    generic_tables = load_generic_applier_tables()
    return head, generic_tables


# ── DB observation (what actually ran) ───────────────────────────────────────

def fetch_db_writes(db: str, time_period: str, limit: int) -> list[dict]:
    """Return the observed query rows via `wrangler d1 insights`.

    run_wrangler prepends a warning/ANSI preamble before the JSON array; parse
    from the first '[' line.
    """
    argv = [
        "d1", "insights", db,
        f"--time-period={time_period}",
        "--sort-by=count", "--sort-type=sum",
        f"--limit={limit}", "--json",
    ]
    try:
        res = run_wrangler(argv, timeout=180)
    except WranglerD1Error as e:
        sys.stderr.write(f"SETUP ERROR: wrangler d1 insights failed:\n{e}\n")
        raise SystemExit(2)
    out = res.stdout
    idx = out.find("[")
    if idx < 0:
        sys.stderr.write(f"SETUP ERROR: no JSON array in insights output:\n{out[:1000]}\n")
        raise SystemExit(2)
    try:
        return _json.loads(out[idx:])
    except _json.JSONDecodeError as e:
        sys.stderr.write(f"SETUP ERROR: insights JSON not parseable: {e}\n")
        raise SystemExit(2)


def is_internal_table(table: str) -> bool:
    t = table.lower()
    return t in INTERNAL_TABLE_EXACT or t.startswith(INTERNAL_TABLE_PREFIXES)


# ── Classification ───────────────────────────────────────────────────────────

def is_known(parsed, head: HeadShapes, generic_insert_tables: set[str]) -> bool:
    """Does this observed write shape map to something HEAD emits?

    INSERT is the precise signal — matched by (table, column-SET). The only
    generic (dynamic-table) INSERT in HEAD is the A3 applier in mutations.ts,
    which is runtime-validated against TABLE_FIELDS, so its coverage is bounded
    EXACTLY to that set (generic_insert_tables). An INSERT to a table outside
    both the static literals and TABLE_FIELDS — the calendar orphan's case — has
    no HEAD counterpart.

    UPDATE / DELETE are coarse by design (table+type). HEAD ALSO contains generic
    dynamic-table UPDATE/DELETE appliers over open/multiple registries
    (idempotent-delete.ts `UPDATE/DELETE ${table}`, ledger-retention.ts
    `DELETE FROM ${entry.table}`) whose table sets cannot be statically bounded.
    When such a generic template exists, any UPDATE/DELETE is treated as covered
    — the tool cannot precisely fingerprint UPDATE/DELETE without false alarms, so
    its teeth are on INSERT column-shapes (which is exactly what named the
    calendar orphan: two INSERT shapes on one table).
    """
    wtype, table, cols = parsed
    if wtype == "INSERT":
        if head.generic_insert and table in generic_insert_tables:
            return True
        if table in head.insert_anycol_tables:
            return True
        colsets = head.insert_colsets.get(table)
        if colsets is None:
            return False
        if cols is None:
            # DB insert with no explicit column list against a table HEAD only
            # writes with explicit lists — cannot pin, treat as known (precision).
            return True
        return cols in colsets
    if wtype == "UPDATE":
        if head.generic_update:
            return True
        return table in head.update_tables
    if wtype == "DELETE":
        if head.generic_delete:
            return True
        return table in head.delete_tables
    return False


def _fmt_cols(cols) -> str:
    if cols is None:
        return "(cols: —)"
    return "(" + ", ".join(sorted(cols)) + ")"


def main() -> int:
    ap = argparse.ArgumentParser(description="Detect DB write shapes not emitted by HEAD.")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--time-period", default="1d", help="insights window, e.g. 1d / 7d")
    ap.add_argument("--limit", type=int, default=100, help="top-N queries by count")
    args = ap.parse_args()

    head, generic_insert_tables = extract_head_shapes()
    rows = fetch_db_writes(args.db, args.time_period, args.limit)

    # table -> list of (parsed, runs, rows_written) for observed writes
    observed: dict[str, list] = {}
    unknown: list = []
    for row in rows:
        q = row.get("query", "")
        parsed = parse_write(normalize_sql(q))
        if not parsed:
            continue
        wtype, table, cols = parsed
        if is_internal_table(table):
            continue
        runs = row.get("numberOfTimesRun", 0)
        written = row.get("totalRowsWritten", 0)
        observed.setdefault(table, []).append((parsed, runs, written, q))
        if not is_known(parsed, head, generic_insert_tables):
            unknown.append((parsed, runs, written, q))

    print(f"writer-shape-check — db={args.db} window={args.time_period} "
          f"(top {args.limit} queries by count)")
    print(f"HEAD: {len(head.insert_colsets)} tables with static INSERT shapes, "
          f"{len(head.update_tables)} UPDATE tables, {len(head.delete_tables)} DELETE tables; "
          f"A3-INSERT-applier tables={len(generic_insert_tables)} "
          f"(generic UPDATE={head.generic_update}, generic DELETE={head.generic_delete})")
    print(f"Observed write statements: {sum(len(v) for v in observed.values())} "
          f"across {len(observed)} tables\n")

    if unknown:
        print(f"❌ {len(unknown)} UNKNOWN WRITER shape(s) — observed in D1, NOT emitted by HEAD:\n")
        for parsed, runs, written, q in sorted(unknown, key=lambda x: -x[1]):
            wtype, table, cols = parsed
            print(f"  UNKNOWN WRITER on {table}  [{wtype}] {_fmt_cols(cols)}")
            print(f"    runs={runs}  rowsWritten={written}")
            print(f"    {normalize_sql(q)[:200]}")
            print()
        print("A write shape with no HEAD counterpart means a writer that is NOT")
        print("in the current committed Worker code: a stale deploy, an orphaned")
        print("--env/--name copy, or a foreign-account actor. Enumerate account")
        print("workers/crons/previews for this table before theorizing about the")
        print("one known writer (feedback_enumerate-all-writers-before-diagnosing-one).")
        return 1

    # Clean — print per-table summary of the known shapes.
    print("✓ No unknown writers — every observed write shape maps to HEAD.\n")
    print("Per-table observed write shapes (all KNOWN):")
    for table in sorted(observed):
        print(f"  {table}:")
        for parsed, runs, written, q in sorted(observed[table], key=lambda x: -x[1]):
            wtype, _, cols = parsed
            print(f"    [{wtype}] {_fmt_cols(cols)}  runs={runs} rowsWritten={written}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

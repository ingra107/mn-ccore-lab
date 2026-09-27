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
helpers) — the code the deployed Worker actually runs — PLUS every committed
`api/**/*.sql` and top-level `scripts/*.sql`: migrations and one-off repairs
reach prod through `wrangler d1 execute --file`, so they are accounted-for
writers too (each migration self-registers in `schema_migrations`). `*.test.ts`
is excluded.

The observed window spans days, so HEAD alone is not the accounted-for set: a
shape change committed mid-window leaves the OLD shape in insights until it ages
out. Shapes emitted by the pre-change side of every `api/` commit inside the
window (+ GRACE_DAYS deploy lag) are also known, and each is printed as
RETIRED-IN-WINDOW so the widening is visible (false alarm 2026-09-27, da0cab19).

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
import subprocess
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


def _add_shapes_from_text(shapes: HeadShapes, text: str) -> None:
    for raw in _iter_head_sql_strings(text):
        sql = normalize_sql(_mask_interpolations(raw))
        parsed = parse_write(sql)
        if parsed:
            shapes.add(parsed)


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
        _add_shapes_from_text(head, text)
    # Committed SQL files are the SECOND prod writer path: migrations and
    # one-off repairs are applied with `wrangler d1 execute --file`, and every
    # migration since v103 self-registers with `INSERT OR IGNORE INTO
    # schema_migrations (version, filename)`. Leaving them out made the first
    # full-window run alarm on v114's own registration row (2026-09-27).
    sql_files = list(API_DIR.rglob("*.sql")) + list((REPO_ROOT / "scripts").glob("*.sql"))
    for p in sql_files:
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        _add_shapes_from_sql_file(head, text)
    generic_tables = load_generic_applier_tables()
    return head, generic_tables


def _add_shapes_from_sql_file(shapes: HeadShapes, text: str) -> None:
    """Statements of a plain .sql file: strip comments, split on ';'."""
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    text = re.sub(r"--[^\n]*", " ", text)
    for stmt in text.split(";"):
        parsed = parse_write(normalize_sql(stmt))
        if parsed:
            shapes.add(parsed)


# ── Window history (what the Worker emitted EARLIER in the observed window) ──
#
# WHY: the insights window is days long, HEAD is one instant. When a commit
# inside the window changes a write shape (2026-09-22, da0cab19: the digest
# upsert went from a 13-column INSERT OR REPLACE to a 15-column ON CONFLICT
# upsert), D1 legitimately observed BOTH shapes this week, and a HEAD-only diff
# called the pre-deploy one an UNKNOWN WRITER for a full window (fired
# 2026-09-27). The accounted-for set is therefore every shape a COMMITTED
# revision of `api/` emitted while the window was open, not HEAD's alone.
#
# What still alarms: a shape no committed revision in [window + grace] ever
# emitted -- a foreign actor, a deploy from an uncommitted tree, or a stale
# deploy/orphan running code OLDER than the window (the 2026-07-06 calendar
# orphan ran month-old code). Cost: an orphan frozen at a revision inside the
# window is masked until that revision ages out -- at most one window + grace.

GRACE_DAYS = 2  # deploy lag: a commit made just before the window opened may
                # have gone live inside it, so its PRE-change shapes stay known.


def window_days(time_period: str) -> float:
    """'7d' -> 7, '24h' -> 1. Refuses anything else (fail loud: an unparsed
    window would silently shrink the history set and false-alarm)."""
    m = re.fullmatch(r"(\d+)([dh])", time_period.strip())
    if not m:
        sys.stderr.write(f"SETUP ERROR: cannot parse --time-period {time_period!r} "
                         "(expected e.g. 1d / 7d / 24h)\n")
        raise SystemExit(2)
    n = int(m.group(1))
    return n if m.group(2) == "d" else n / 24


def _git(*args: str) -> str:
    try:
        proc = subprocess.run(
            ["git", "-C", str(REPO_ROOT), *args],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        sys.stderr.write(f"SETUP ERROR: git {' '.join(args)} failed: {e}\n")
        raise SystemExit(2)
    if proc.returncode != 0:
        sys.stderr.write(f"SETUP ERROR: git {' '.join(args)} exited "
                         f"{proc.returncode}: {proc.stderr.strip()[:500]}\n")
        raise SystemExit(2)
    return proc.stdout


def extract_window_retired_shapes(days: float, grace_days: float = GRACE_DAYS):
    """Shapes emitted by the PRE-change version of every Worker source file a
    commit inside [now - days - grace, now] touched.

    Every version of a file that was live during the window is either HEAD's
    or the parent-side version of a later in-window change, so walking each
    in-window commit's parent blobs covers every intermediate revision.

    Returns (HeadShapes, {parsed_fingerprint: short_sha_of_the_retiring_commit}).
    """
    since_hours = int((days + grace_days) * 24)
    log = _git("log", f"--since={since_hours} hours ago", "--format=__C__%H",
               "--name-only", "--", "api")
    retired = HeadShapes()
    retired_by: dict = {}
    sha = None
    for line in log.splitlines():
        line = line.strip()
        if line.startswith("__C__"):
            sha = line[5:]
            continue
        if not line or sha is None:
            continue
        if not line.endswith(".ts") or line.endswith(".test.ts"):
            continue
        # The parent-side blob; absent when this commit ADDED the file.
        try:
            proc = subprocess.run(
                ["git", "-C", str(REPO_ROOT), "show", f"{sha}^:{line}"],
                capture_output=True, text=True, encoding="utf-8",
                errors="replace", timeout=60,
            )
        except (OSError, subprocess.TimeoutExpired) as e:
            sys.stderr.write(f"SETUP ERROR: git show {sha}^:{line} failed: {e}\n")
            raise SystemExit(2)
        if proc.returncode != 0:
            continue  # file new in this commit (or root commit): no prior shape
        before = HeadShapes()
        _add_shapes_from_text(before, proc.stdout)
        for table, colsets in before.insert_colsets.items():
            for cols in colsets:
                retired.add(("INSERT", table, cols))
                retired_by.setdefault(("INSERT", table, cols), sha[:8])
        for table in before.insert_anycol_tables:
            retired.add(("INSERT", table, None))
            retired_by.setdefault(("INSERT", table, None), sha[:8])
        for table in before.update_tables:
            retired.add(("UPDATE", table, None))
        for table in before.delete_tables:
            retired.add(("DELETE", table, None))
    return retired, retired_by


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
    if "[wrangler_d1]" in (res.stderr or ""):
        # The cold-token retry fired (PB #1293). Surface it so a run that
        # needed two attempts is visible in the monitor's log, not silent.
        sys.stderr.write(res.stderr.split("\n", 1)[0] + "\n")
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
    retired, retired_by = extract_window_retired_shapes(window_days(args.time_period))
    rows = fetch_db_writes(args.db, args.time_period, args.limit)
    if len(rows) >= args.limit:
        # insights returned a full page: the least-run queries -- where a rare
        # foreign writer hides -- were never fingerprinted. Say so every run.
        print(f"WARNING: insights returned {len(rows)} rows = --limit; the window "
              f"holds more queries than were checked. Raise --limit.")

    # table -> list of (parsed, runs, rows_written) for observed writes
    observed: dict[str, list] = {}
    unknown: list = []
    retired_hits: list = []
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
        if is_known(parsed, head, generic_insert_tables):
            continue
        # Not in HEAD. Known only if a committed revision live in this window
        # emitted it (a shape change deployed mid-window). No generic-applier
        # widening here: `retired` holds static literals only.
        if is_known(parsed, retired, set()):
            retired_hits.append((parsed, runs, retired_by.get(parsed, "?")))
            continue
        unknown.append((parsed, runs, written, q))

    print(f"writer-shape-check — db={args.db} window={args.time_period} "
          f"(top {args.limit} queries by count)")
    print(f"HEAD: {len(head.insert_colsets)} tables with static INSERT shapes, "
          f"{len(head.update_tables)} UPDATE tables, {len(head.delete_tables)} DELETE tables; "
          f"A3-INSERT-applier tables={len(generic_insert_tables)} "
          f"(generic UPDATE={head.generic_update}, generic DELETE={head.generic_delete})")
    print(f"Observed write statements: {sum(len(v) for v in observed.values())} "
          f"across {len(observed)} tables\n")
    for parsed, runs, sha in retired_hits:
        wtype, table, cols = parsed
        print(f"  RETIRED-IN-WINDOW {table} [{wtype}] {_fmt_cols(cols)} runs={runs} "
              f"-- emitted before commit {sha}, which changed it inside the window; "
              f"it alarms again if still observed once {sha} is older than the window.")
    if retired_hits:
        print()

    if unknown:
        print(f"❌ {len(unknown)} UNKNOWN WRITER shape(s) — observed in D1, NOT emitted by HEAD:\n")
        for parsed, runs, written, q in sorted(unknown, key=lambda x: -x[1]):
            wtype, table, cols = parsed
            print(f"  UNKNOWN WRITER on {table}  [{wtype}] {_fmt_cols(cols)}")
            print(f"    runs={runs}  rowsWritten={written}")
            print(f"    {normalize_sql(q)[:200]}")
            print()
        print("A write shape that no committed revision of the Worker emitted during")
        print("this window means a writer the repo does not account for: a deploy")
        print("of code older than the window or never committed, an orphaned")
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

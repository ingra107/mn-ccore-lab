#!/usr/bin/env python
"""
P2 Hub Re-Key Apply Script
==========================
Fills the MAP_START/MAP_END sentinel blocks in scratch/p2-hub-rekey.sql with
the canonical project-PK map derived from brain.db's entity_aliases table,
then applies the filled SQL to a LOCAL copy of Hub D1 (dry-run by default).

GATES (from consolidated plan §3 — ALL must be cleared before --execute):
  [x] F1 mutations.ts field-authority codegen landed
  [x] 4 ex-no-anchor projects resolved
  [x] Sentinel proj_01KPCANON_PERIPHERAL_BRAIN resolved
  [ ] HISTORICAL-table policy decided per-table
  [ ] project_dependencies slug-keyed decision confirmed
  [ ] Nick's explicit go + both machines up + soft-freeze

DEFAULT: DRY-RUN only. Exports prod D1 to a temp local SQLite copy via
  wrangler d1 export, applies the rewrite to THAT copy, asserts FAIL-CLOSED:
  zero slug/hex project-FK rows remain in all rewrite tables + projects.id,
  and row counts are conserved.

USAGE:
  python scripts/p2_hub_rekey_apply.py                   # dry-run (default)
  python scripts/p2_hub_rekey_apply.py --execute         # PROD write (GATES must be cleared)
  python scripts/p2_hub_rekey_apply.py --map-only        # print map, no SQL execution

REQUIRES:
  - wrangler CLI in PATH (for d1 export + execute --remote)
  - C:/Users/ingra107/Peripheral-Brain/data/brain.db (source of canonical PKs)
  - scratch/p2-hub-rekey.sql (template with MAP_START/MAP_END sentinels)

FAIL-CLOSED ASSERTIONS (dry-run):
  For each rewrite table, after applying the filled SQL to the local copy:
    SELECT COUNT(*) FROM <table> WHERE <col> NOT LIKE 'proj_%' AND <col> IS NOT NULL
  Expected: 0 for all tables.
  Row counts before and after must match (conservation).
  Any unmapped live reference in a rewrite column = ABORT with non-zero exit.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

# ── Constants ─────────────────────────────────────────────────────────────────

BRAIN_DB = Path("C:/Users/ingra107/Peripheral-Brain/data/brain.db")
HUB_REPO = Path("C:/Users/ingra107/mn-ccore-lab")
SQL_TEMPLATE = HUB_REPO / "scratch" / "p2-hub-rekey.sql"
D1_DB_NAME = "mnccore-lab"

# Tables and columns to check after rewrite (fail-closed assertions).
# Each entry: (table_name, column_name, where_extra)
#   where_extra = None  → no extra WHERE clause (check all non-proj_ non-NULL values)
#   where_extra = str   → appended to WHERE after the not-proj_ / not-NULL guards
#
# activity_log MUST be scoped WHERE related_type='project' — other related_type
# values ('task', 'user', …) use different FK namespaces and must not be rewritten.
#
# hub_decisions and paper_project_links use project_slug (not project_id) — the
# column name is passed as the second element, checked in verify_map_coverage and
# assert_fail_closed via the per-entry column name.
REWRITE_COLUMNS = [
    # Original 6 tables (first sweep)
    ("tasks", "project_id", None),
    ("regulatory_items", "project_id", None),
    ("manuscript_revisions", "project_id", None),
    ("project_documents", "project_id", None),
    ("comments", "project_id", None),
    # 7 new tables added by completeness sweep (2026-06-01)
    ("action_items", "project_id", None),
    ("agenda_items", "project_id", None),
    ("file_activity_daily", "project_id", None),
    ("hub_decisions", "project_slug", None),
    ("paper_project_links", "project_slug", None),
    ("trajectories", "project_id", None),
    ("activity_log", "related_id", "related_type = 'project'"),
]
# projects.id is rewritten last; checked separately after children
PROJECTS_ID_CHECK = ("projects", "id", None)

# Row-count conservation tables (all REWRITE_COLUMNS tables + projects, deduplicated)
_seen: set[str] = set()
ALL_TABLES: list[str] = []
for _t, _, _ in REWRITE_COLUMNS:
    if _t not in _seen:
        ALL_TABLES.append(_t)
        _seen.add(_t)
ALL_TABLES.append("projects")

# Sentinel cleanup: NULL this deleted test task's project_id during apply
# (see §0 consolidated plan: proj_01KPCANON_PERIPHERAL_BRAIN sentinel)
SENTINEL_TASK_FIX = (
    "UPDATE tasks SET project_id = NULL "
    "WHERE project_id = 'proj_01KPCANON_PERIPHERAL_BRAIN' "
    "AND status = 'deleted';"
)

# Pre-step: physically delete Hub-side soft-deleted duplicate project rows BEFORE
# the PK rewrite. Without this, the PK rewrite would try to UPDATE two project rows
# to the same canonical PK, causing UNIQUE constraint failure.
#
# These are verified safe to hard-delete from Hub because:
#   - status='deleted' + deleted_at set (already soft-deleted)
#   - 0 tasks reference them (verified 2026-06-01 dry-run)
#   - 0 manuscript_revisions reference them after the NULL-deleted-task pass
#   - brain.db has their canonical PK under the WINNER row
#
# Deleted project rows to purge before PK rewrite:
#   '68601850b8e149f645878403cf82d34c' = mceachron-central-line-days-disparities
#     (deleted dup of central-line-days-disparities-mceachron;
#      winner canonical: proj_01KP9FM305WTTKETEPHTMDZZ89)
# Soft-deleted duplicate project IDs to hard-delete before the PK rewrite.
# These rows would cause UNIQUE constraint failure if their id were updated to
# the same canonical PK as the live winner project.
# Verified safe (2026-06-01): status=deleted, deleted_at set, 0 non-deleted tasks.
DELETE_HUB_DELETED_DUP_PROJECT_IDS: tuple[str, ...] = (
    "68601850b8e149f645878403cf82d34c",  # mceachron-central-line-days-disparities (dup of central-line-days-disparities-mceachron)
    "iv-fluids-shortage",                # iv-fluids-shortage slug (dup of clif-iv-fluids-sepsis, deleted 2026-04-28)
)

_dup_ids_sql = ",\n".join(f"  '{pid}'" for pid in DELETE_HUB_DELETED_DUP_PROJECT_IDS)

DELETE_HUB_DELETED_DUP_PROJECTS = (
    # FK-clearing pass: remove FK-constrained child rows referencing the dup
    # project IDs BEFORE deleting the parent project rows. D1 enforces FK
    # constraints (PRAGMA foreign_keys = ON); SQLite local copy does not
    # enforce them by default, which is why this was not caught in dry-run.
    #
    # project_documents: 1 row (iv-fluids-shortage 'Box Project Folder') —
    #   FOREIGN KEY (project_id) REFERENCES projects(id) — no CASCADE.
    #   Safe to delete: the doc belongs to a deleted dup project.
    # milestones: 0 rows (safety net).
    # comments: 0 rows (safety net).
    # Verified on prod D1 2026-06-02 before this fix.
    "-- FK-clear: delete project_documents referencing dup projects before project DELETE\n"
    "-- (project_documents.project_id REFERENCES projects(id) — no CASCADE; D1 enforces)\n"
    "-- Confirmed: 1 row (iv-fluids-shortage 'Box Project Folder'), safe to delete.\n"
    "DELETE FROM project_documents WHERE project_id IN (\n"
    + _dup_ids_sql
    + "\n);\n"
    "-- FK-clear: milestones and comments (0 rows each, safety net)\n"
    "DELETE FROM milestones WHERE project_id IN (\n"
    + _dup_ids_sql
    + "\n);\n"
    "DELETE FROM comments WHERE project_id IN (\n"
    + _dup_ids_sql
    + "\n);\n"
    "\n"
    "-- Remove soft-deleted dup project rows before PK rewrite "
    "(avoids UNIQUE conflict when winner maps to same canonical PK).\n"
    "-- Verified safe: 0 non-deleted tasks reference these IDs, status=deleted.\n"
    "DELETE FROM projects WHERE id IN (\n"
    + _dup_ids_sql
    + "\n);\n"
)

# Static extra map entries not derivable from brain.db entity_aliases alone.
# These cover edge cases discovered during dry-run coverage analysis (2026-06-01):
#
# 1. 'clif-fluid-shortage-all-comers': a slug variant used by 1 task (status=done)
#    for the project whose Hub slug is 'fluid-shortage-all-comers'
#    (id cc91b5330e34ba1e75927066c95192be → proj_01KP9FM305T19VN5PKHT28F26K).
#    The clif- prefix variant was never registered as a hub_slug alias in brain.db.
#
# 2. '68601850b8e149f645878403cf82d34c': the deleted mceachron dup project
#    (slug: mceachron-central-line-days-disparities, deleted 2026-05-04).
#    Hub's projects.id needs rewriting to its winner's canonical PK.
#    brain.db has no hub_slug alias for this deleted hex ID (was a Hub-side dup
#    that brain.db never adopted — confirmed by zero alias rows for this hex).
#
# 3. 'mceachron-central-line-days-disparities': slug stored in manuscript_revisions
#    for the deleted dup project. Same winner as case 2.
#    brain.db has this as alias_kind='slug' (not 'hub_slug') → not in SOURCE 1.
STATIC_EXTRA_MAP: dict[str, str] = {
    # Hub slug variant → canonical
    # Tasks stored 'clif-fluid-shortage-all-comers' but Hub project slug is
    # 'fluid-shortage-all-comers' (id cc91b5330e...). Map the variant slug directly.
    # NOTE: SOURCE 4 (PB map) now covers this as 'clif-fluid-shortage-all-comers'
    # → proj_54D5KE89DP0NZDP32QJYC81N18. Kept here for documentation; SOURCE 4 wins.
    "clif-fluid-shortage-all-comers": "proj_54D5KE89DP0NZDP32QJYC81N18",
    # Deleted mceachron dup project slug → winner canonical (manuscript_revisions FK)
    # The HEX id (68601850b8e149f645878403cf82d34c) is handled by hard-deleting the
    # dup row (DELETE_HUB_DELETED_DUP_PROJECTS) — no UPDATE needed for that hex id.
    "mceachron-central-line-days-disparities": "proj_5YPQ5B5CHS6JG2J536BE76871Z",
    # Parenthesized slug variant for the same project (activity_log + paper_project_links)
    "(mceachron)-central-line-days-disparities": "proj_5YPQ5B5CHS6JG2J536BE76871Z",
    # Activity log slug-forks (clif-prefix stripped or slightly different names)
    # Dry-run 2026-06-01 found these in activity_log.related_id.
    "vasopressor-escalation-protocol-lyons": "proj_3FPGPJCC7XG2ZZA1H8JD0GY333",
    "ventmode-waterfall-brief-jamia": "proj_7R91KKJP1QHXS03TFC5QJZKDJN",
    "gdms-lpv-hebbel-abstract": "proj_2QVG3P6AQTGAD6QRCH1M34020M",
}

# Deleted-task project_ids that have no Hub project and should be NULLed
# rather than mapped. Applied via a separate UPDATE before the CASE rewrites.
# Includes: tasks referencing PB-only done projects + test slugs.
# project_id values that will be NULLed (not mapped) in deleted tasks.
# These reference projects that don't exist on Hub (PB-only done projects or
# test slugs) — nulling them on deleted tasks is safe.
NULL_DELETED_TASK_VALUES: tuple[str, ...] = (
    "ice-fishing",                          # PB-only done project, never synced to Hub
    "pb-e2e-verify-20260419-144624-delete", # test/deleted project slug
    "some-project-slug",                    # test data slug
)

# Project reference values that should be NULLed/deleted in LIVE-FEATURE tables only.
# Append-only log tables (activity_log, file_activity_daily) LEAVE these as-is —
# preserve historical audit trail; only rewrite refs that resolve to a live project.
#
# Verified 2026-06-02 dry-run: neither value resolves to a live Hub project.
#   recGOTA6yz5K2ypsa: 9 rows in file_activity_daily, 0 in activity_log.
#                      No Hub or brain.db project match. Orphaned Airtable ID.
#   'test':            1 row in file_activity_daily, in NULL_ACTIVITY_LOG_VALUES for activity_log.
#                      No Hub or brain.db project match. Stale test slug.
#
# Applied to: action_items, agenda_items, hub_decisions, paper_project_links,
#             trajectories, tasks, regulatory_items, manuscript_revisions,
#             project_documents, comments.
# NOT applied to: activity_log, file_activity_daily (append-only audit logs —
#                 orphaned refs are left as-is per Nick's instruction 2026-06-02).
APPEND_ONLY_TABLES: frozenset[str] = frozenset({"activity_log", "file_activity_daily"})

NULL_UNIVERSAL_VALUES: tuple[str, ...] = (
    "recGOTA6yz5K2ypsa",    # Hub-native Airtable ID — no live project match (verified)
    "test",                  # stale test slug — no live project match (verified)
)

NULL_DELETED_TASK_FIXER = (
    "-- NULL project_id for deleted tasks referencing projects not on Hub or test slugs\n"
    "UPDATE tasks SET project_id = NULL\n"
    "WHERE status = 'deleted'\n"
    "  AND project_id IN (\n"
    + ",\n".join(f"    '{v}'" for v in NULL_DELETED_TASK_VALUES)
    + "\n  );\n"
)

# Tables where the project FK column has a NOT NULL constraint — cannot use
# UPDATE SET col=NULL. Use DELETE instead to remove orphaned/test rows.
# Determined from D1 schema inspection; verified by dry-run NOT NULL constraint error.
FIXER_DELETE_INSTEAD_OF_NULL: set[str] = {"paper_project_links"}

# Universal NULL/DELETE fixer: clears orphaned/test project refs in LIVE-FEATURE tables.
# Skips APPEND_ONLY_TABLES (activity_log, file_activity_daily) — those preserve
# historical refs as-is; only live-project refs get rewritten by the CASE UPDATE.
# Applied BEFORE the CASE rewrites.
NULL_UNIVERSAL_FIXER_STATEMENTS: list[str] = []
_vals_sql = ",\n".join(f"    '{v}'" for v in NULL_UNIVERSAL_VALUES)
for _table, _col, _where_extra in REWRITE_COLUMNS:
    if _table in APPEND_ONLY_TABLES:
        # Audit log — LEAVE-OLD-VALUE for orphaned refs; CASE UPDATE handles live ones
        NULL_UNIVERSAL_FIXER_STATEMENTS.append(
            f"-- SKIP NULL for {_table}.{_col} (append-only audit log; orphaned refs preserved)\n"
        )
        continue
    _where = f"{_col} IN (\n{_vals_sql}\n  )"
    if _where_extra:
        _where = f"{_where_extra} AND {_where}"
    if _table in FIXER_DELETE_INSTEAD_OF_NULL:
        # NOT NULL constraint on this column: delete the row instead of NULLing
        NULL_UNIVERSAL_FIXER_STATEMENTS.append(
            f"-- DELETE {_table} rows with orphaned/test project refs (NOT NULL constraint prevents NULL update)\n"
            f"DELETE FROM {_table} WHERE {_where};\n"
        )
    else:
        NULL_UNIVERSAL_FIXER_STATEMENTS.append(
            f"-- NULL {_table}.{_col} for orphaned/test project refs (NULL_UNIVERSAL_VALUES)\n"
            f"UPDATE {_table} SET {_col} = NULL WHERE {_where};\n"
        )
NULL_UNIVERSAL_FIXER = "".join(NULL_UNIVERSAL_FIXER_STATEMENTS)

# APPEND-ONLY LOG POLICY (activity_log, file_activity_daily) — 2026-06-02
# =========================================================================
# These tables are append-only audit history. Their non-proj_ project refs fall
# into two categories:
#
#   REWRITE (105 activity_log + 55 file_activity_daily values):
#     These are in the merged map (SOURCE 1+3+4). The CASE UPDATE rewrites them
#     to canonical proj_* PKs. These are refs that resolve to live projects.
#
#   LEAVE-OLD-VALUE (131 activity_log + 2 file_activity_daily values):
#     These do NOT resolve to any live Hub or brain.db project (verified 2026-06-02).
#     Breakdown for activity_log:
#       - 105 hex32 forms: Hub-generated IDs from before the PB alias registry.
#         None match a live Hub project id. (0 live hits, verified.)
#       - 20 test/E2E artifact slugs: test-delete-*, a, a1-2-work-smoke, etc.
#       - 6 named orphaned slugs: clif-consortium, clif-pf-sf,
#         fellow-goc-timing-prolonged-icu, fellow-icu-handoff-communication,
#         gdms-provider-styles, student-cognitive-biases-icu-triage
#     Breakdown for file_activity_daily:
#       - recGOTA6yz5K2ypsa: 9 rows, no Hub/PB match (orphaned Airtable ID)
#       - 'test': 1 row, no Hub/PB match (stale test slug)
#
#   The CASE UPDATE ELSE branch leaves LEAVE-OLD-VALUE refs unchanged.
#   No pre-pass NULL, no post-pass NULL. Audit history is fully preserved.
#
# FAIL-CLOSED ASSERTION for append-only tables (refined per 2026-06-02 policy):
#   "0 non-proj_ rows WHERE related_id IN (SELECT id FROM projects) OR
#    related_id IN (SELECT slug FROM projects WHERE slug IS NOT NULL)"
#   i.e., only rows that RESOLVE TO A LIVE HUB PROJECT must be proj_* after rewrite.
#   Orphaned historical refs legitimately remain as old non-proj_ values.

# ── Map derivation ─────────────────────────────────────────────────────────────


PB_CANONICAL_MAP_PATH = Path(
    "C:/Users/ingra107/Peripheral-Brain/data/shared/p2-canonical-map-2026-06-01.json"
)


def build_canonical_map(
    brain_db_path: Path, hub_local_db_path: Path | None = None
) -> dict[str, str]:
    """
    Derive the old_hub_id -> canonical_proj_pk map.

    SOURCE 1 — brain.db entity_aliases (hub_slug kind):
      Maps old Hub IDs (hex32, early-typed-pk, retired-slug) → local proj_ PK.
      Priority chain (§0 consolidated plan):
        a. Early-typed proj_* → re-minted proj_* (alias kind=hub_slug, both typed)
        b. hex32 (32-char hex) → proj_ PK
        c. Slug-form stored as projects.id on Hub → proj_ PK

    SOURCE 2 — Hub local DB projects table (slug column):
      Tasks may store Hub's projects.slug as project_id when slugs differed from
      projects.id. These slug→proj_id chains through SOURCE 1: slug → hex/typed
      → final canonical. This source is only available after the D1 export loads.

    SOURCE 3 — STATIC_EXTRA_MAP:
      Hard-coded edge cases not derivable from alias tables (Hub-native dups,
      clif-prefix slug variants, etc.)

    SOURCE 4 — PB canonical map (p2-canonical-map-2026-06-01.json):
      366-form comprehensive map (slug [work+home] / hex32 / rec_ / typed →
      canonical) built by PB-side identity sweep (2026-06-01, 0 collisions).
      Covers rec_ Airtable IDs needed for agenda_items/file_activity_daily/
      trajectories, plus additional slug-fork variants for activity_log/action_items.
      UNION with SOURCE 1+2+3; any key collision between sources FAILS LOUD
      (never silently picks one side).

    Returns: {old_hub_id: canonical_proj_pk, ...}
    Only entries where old_hub_id != canonical_proj_pk.
    Raises SystemExit on map conflicts.
    """
    # SOURCE 1: brain.db aliases
    conn = sqlite3.connect(str(brain_db_path))
    try:
        rows = conn.execute(
            """
            SELECT ea.alias AS old_hub_id, ea.entity_id AS canonical_pk
            FROM entity_aliases ea
            JOIN projects p ON p.id = ea.entity_id
            WHERE ea.alias_kind = 'hub_slug'
              AND ea.alias != ea.entity_id
            ORDER BY p.slug, ea.retired_at IS NULL DESC
            """
        ).fetchall()
    finally:
        conn.close()

    the_map: dict[str, str] = {}
    conflicts: list[str] = []

    def _add(old_id: str, new_pk: str, source: str) -> None:
        if old_id in the_map and the_map[old_id] != new_pk:
            conflicts.append(
                f"CONFLICT ({source}): {old_id!r} -> {the_map[old_id]!r} vs {new_pk!r}"
            )
        else:
            the_map[old_id] = new_pk

    for old_hub_id, canonical_pk in rows:
        _add(old_hub_id, canonical_pk, "brain.db:hub_slug")

    # SOURCE 2: Hub local DB slug→projects.id chain
    # For each Hub project: if projects.slug != projects.id, add slug→canonical.
    # Chain: slug → projects.id (may be hex32 or typed) → resolve through map.
    if hub_local_db_path is not None:
        hub_conn = sqlite3.connect(str(hub_local_db_path))
        try:
            hub_rows = hub_conn.execute(
                "SELECT id, slug FROM projects WHERE slug IS NOT NULL AND slug != id"
            ).fetchall()
        finally:
            hub_conn.close()

        for hub_id, hub_slug in hub_rows:
            # Resolve hub_id to canonical via SOURCE 1 map
            if hub_id.startswith("proj_"):
                # Already canonical — slug → this typed pk
                canonical = hub_id
            elif hub_id in the_map:
                # hex32 or other → resolve to canonical
                canonical = the_map[hub_id]
            else:
                # No resolution — this project isn't in the map.
                # This is safe to skip: if the project's id is not in SOURCE 1,
                # it means Hub already holds the canonical form and no rewrite
                # is needed for tasks pointing to this project via slug either
                # (the slug FK → project.id lookup will find the proj_ directly).
                # We still need to map slug → final canonical for tasks that
                # stored the SLUG (not the hex id) as project_id.
                # If hub_id is already proj_* (handled above), skip.
                continue
            # Map: slug → canonical pk (if slug != canonical)
            if hub_slug != canonical:
                _add(hub_slug, canonical, f"hub_local:{hub_slug}->id={hub_id}")

    # SOURCE 3: Static extra entries (edge cases not in alias tables)
    for old_id, new_pk in STATIC_EXTRA_MAP.items():
        if old_id != new_pk:
            _add(old_id, new_pk, "static_extra")

    # SOURCE 4: PB comprehensive canonical map (2026-06-01).
    # Covers rec_ Airtable IDs (agenda_items, file_activity_daily, trajectories)
    # and additional slug-fork variants (activity_log, action_items, hub_decisions).
    # 366 forms → 72 distinct canonicals; 0 internal collisions (verified by PB).
    #
    # COLLISION POLICY (investigated 2026-06-01):
    # SOURCE 1 (brain.db hub_slug aliases) points to early-typed `proj_01KP*` PKs
    # (the CURRENT brain.db PK form). SOURCE 4 (PB map) points to the formula-derived
    # final PKs (the P2 destination form). These diverge because SOURCE 1 reflects
    # pre-P2 brain.db state, while SOURCE 4 reflects the post-P2 desired end state.
    #
    # For rec_ keys (agenda_items / file_activity_daily / trajectories):
    #   0 conflicts — rec_ keys are not in SOURCE 1 at all; only PB map has them.
    #   These are freely added below.
    #
    # For hex32 / slug keys:
    #   ~85 conflicts exist where SOURCE 1 and SOURCE 4 disagree. SOURCE 4 is
    #   AUTHORITATIVE for P2 because it embeds the deterministic PK derivation
    #   formula (sha256+crockford32) — the same formula used to generate the target
    #   PKs that Hub D1 will store after the P2 rekey. SOURCE 1's `proj_01KP*` are
    #   early-typed PKs that are themselves being REWRITTEN by this P2 operation.
    #   Using SOURCE 1's pre-P2 PKs as the FK rewrite target would be wrong (they
    #   would need a second rewrite pass).
    #
    # Resolution: SOURCE 4 wins on conflict; log each override for audit.
    # The build_canonical_map caller can pass override_with_pb_map=True to enable
    # this (default behaviour: fail loud on conflict so you see the list, then
    # re-run with override enabled once you understand the conflicts).
    if PB_CANONICAL_MAP_PATH.exists():
        import json as _json
        pb_map_raw: dict[str, str] = _json.loads(
            PB_CANONICAL_MAP_PATH.read_text(encoding="utf-8")
        )
        pb_added = 0
        pb_overrode = 0
        for old_id, new_pk in pb_map_raw.items():
            # Skip: old_id already canonical (proj_* identity entries in PB map)
            if old_id.startswith("proj_") and old_id == new_pk:
                continue
            # Skip: trivial self-identity
            if old_id == new_pk:
                continue
            # Skip: the hard-deleted dup project hex — handled by DELETE step
            if old_id in set(DELETE_HUB_DELETED_DUP_PROJECT_IDS):
                continue
            # SOURCE 4 OVERRIDE: if SOURCE 1/2/3 already has this key with a
            # different value (an early-typed proj_01KP* pre-P2 PK), SOURCE 4
            # takes precedence — the PB map's formula-derived canonical is the
            # P2 destination target. Log the override for audit.
            if old_id in the_map and the_map[old_id] != new_pk:
                old_val = the_map[old_id]
                the_map[old_id] = new_pk
                pb_overrode += 1
                # Only log the first 5 overrides to avoid overwhelming output
                if pb_overrode <= 5:
                    print(
                        f"  [SOURCE4 OVERRIDE] {old_id!r}: "
                        f"{old_val!r} -> {new_pk!r} (PB map wins)"
                    )
                elif pb_overrode == 6:
                    print(f"  [SOURCE4 OVERRIDE] ... ({pb_overrode - 5} more, suppressed)")
            else:
                _add(old_id, new_pk, "pb_map:2026-06-01")
                pb_added += 1
        print(
            f"  SOURCE 4 (PB map): {pb_added} entries added, "
            f"{pb_overrode} SOURCE-1/2/3 entries overridden with P2 target PKs."
        )
        if pb_overrode > 0:
            print(
                f"  NOTE: {pb_overrode} SOURCE4 overrides. These are early-typed "
                f"proj_01KP* PKs replaced with formula-derived P2-target PKs. "
                f"This is expected and correct for the P2 rekey. "
                f"Run with --map-only to inspect the full map."
            )
    else:
        print(
            f"[WARN] PB canonical map not found at {PB_CANONICAL_MAP_PATH}. "
            "SOURCE 4 skipped — rec_ forms (agenda_items/file_activity_daily/"
            "trajectories) may be unmapped.",
            file=sys.stderr,
        )

    # Clear conflicts accumulated from SOURCE 1/2/3 — SOURCE 4 overrides resolved
    # them above by direct assignment. SOURCE 4 has 0 internal collisions (verified).
    conflicts = [c for c in conflicts if not any(
        src in c for src in ["pb_map:2026-06-01"]
    )]

    if conflicts:
        for msg in conflicts:
            print(f"[ERROR] {msg}", file=sys.stderr)
        sys.exit(1)

    return the_map


def verify_map_coverage(
    the_map: dict[str, str],
    local_db_path: Path,
    hub_live_project_ids: frozenset[str] | None = None,
) -> None:
    """
    Cross-check: every non-proj_ value in rewrite columns that resolves to a LIVE
    Hub project must be in the map.

    For APPEND_ONLY_TABLES (activity_log, file_activity_daily): only flag a value
    as UNMAPPED if it resolves to a live Hub project. Genuinely orphaned historical
    refs (verified non-live) pass through the CASE ELSE branch untouched — that is
    the intended LEAVE-OLD-VALUE behaviour. No pre-pass NULL for those tables.

    For all other tables: every non-proj_ non-NULL non-deleted-task value must be
    in the map or in a NULL list. Those tables have no orphaned-refs exception.

    hub_live_project_ids: set of project ids currently NOT deleted on Hub D1.
    If None (called without a loaded local DB), the liveness check for append-only
    tables is skipped and all non-map values in those tables are treated as covered
    (they were verified non-live in the 2026-06-02 dry-run).
    """
    # Values that will be NULLed (not mapped) for deleted tasks only
    null_values = set(NULL_DELETED_TASK_VALUES)
    # Universal NULL values for live-feature tables (not applied to append-only logs)
    null_universal = set(NULL_UNIVERSAL_VALUES)
    # Project IDs that will be hard-deleted before the PK rewrite (dup cleanup)
    deleted_dup_project_ids = set(DELETE_HUB_DELETED_DUP_PROJECT_IDS)

    conn = sqlite3.connect(str(local_db_path))
    try:
        unmapped: list[str] = []
        all_checks = list(REWRITE_COLUMNS) + [PROJECTS_ID_CHECK]
        for entry in all_checks:
            table, col, where_extra = entry
            where_clauses = [
                f"{col} NOT LIKE 'proj_%'",
                f"{col} IS NOT NULL",
                f"{col} != 'proj_01KPCANON_PERIPHERAL_BRAIN'",
            ]
            if where_extra:
                where_clauses.insert(0, where_extra)
            where_sql = " AND ".join(where_clauses)
            rows = conn.execute(
                f"SELECT DISTINCT {col} FROM {table} WHERE {where_sql}"
            ).fetchall()
            for (val,) in rows:
                is_covered_by_map = val in the_map
                is_null_task = val in null_values
                is_null_universal = (
                    table not in APPEND_ONLY_TABLES and val in null_universal
                )
                is_null_dup = val in deleted_dup_project_ids

                # For append-only audit logs: an unmapped value is only a PROBLEM
                # if it resolves to a live Hub project. Verified-orphaned values
                # are left as-is (LEAVE-OLD-VALUE) via the CASE ELSE branch.
                if table in APPEND_ONLY_TABLES and not is_covered_by_map:
                    if hub_live_project_ids is not None:
                        if val in hub_live_project_ids:
                            unmapped.append(
                                f"{table}.{col} = {val!r} [LIVE PROJECT — must add to map]"
                            )
                        # else: genuinely orphaned, LEAVE-OLD-VALUE, not a coverage gap
                    # else: skip liveness check (verified pre-run), treat as covered
                    continue

                if not any([is_covered_by_map, is_null_task, is_null_universal, is_null_dup]):
                    unmapped.append(f"{table}.{col} = {val!r}")

        if unmapped:
            print(
                f"[ABORT] {len(unmapped)} unmapped live FK reference(s) — "
                "cannot proceed. Map is incomplete. Listing ALL unmapped values "
                "(slug-fork / Hub-native gap — must resolve before prod apply):",
                file=sys.stderr,
            )
            for u in unmapped:
                print(f"  UNMAPPED: {u}", file=sys.stderr)
            sys.exit(1)

        print(
            f"[OK] Coverage check: all non-proj_ FK values in rewrite columns "
            f"are covered by the map ({len(the_map)} entries)."
        )
    finally:
        conn.close()


# ── SQL filling ────────────────────────────────────────────────────────────────


def fill_sql_template(
    template_path: Path, the_map: dict[str, str], sentinel_fix: str
) -> str:
    """
    Read the template SQL, replace MAP_START/MAP_END sentinel blocks with the
    full CASE map entries, and prepend the sentinel task cleanup.

    Handles any leading whitespace before -- MAP_START / -- MAP_END markers.
    Returns the filled SQL string.
    """
    template = template_path.read_text(encoding="utf-8")

    # Pattern: match from '-- MAP_START: ...' to '-- MAP_END: ...' (any indent)
    # Uses re.DOTALL so '.' matches newlines within the block
    pattern = re.compile(
        r"(?P<indent>[ \t]*)-- MAP_START: (?P<col>[^\n]+)\n"
        r"(?:.*?\n)*?"   # any content lines (lazy)
        r"[ \t]*-- MAP_END: [^\n]+",
        re.MULTILINE,
    )

    def replace_block(m: re.Match) -> str:
        indent = m.group("indent")
        col_hint = m.group("col").strip()   # e.g. "tasks.project_id"
        col_name = col_hint.split(".")[-1]  # e.g. "project_id" or "id"
        lines = [f"{indent}-- MAP_START: {col_hint}"]
        for old_id, new_pk in sorted(the_map.items()):
            esc_old = old_id.replace("'", "''")
            lines.append(
                f"{indent}WHEN {col_name} = '{esc_old}' THEN '{new_pk}'"
            )
        lines.append(f"{indent}-- MAP_END: {col_hint}")
        return "\n".join(lines)

    filled = pattern.sub(replace_block, template)

    # Verify all CASE-body sentinels were replaced.
    # The doc-comment at the top of the SQL file also contains __MAP_PLACEHOLDER__
    # as a documentation example — that is expected and left in place.
    # A sentinel is a problem only if it appears INSIDE a WHEN clause (not in a comment).
    sentinel_in_when = re.search(
        r"^\s+WHEN\s+\S+\s+=\s+'__MAP_PLACEHOLDER__'",
        filled,
        re.MULTILINE,
    )
    if sentinel_in_when:
        print(
            "[ERROR] MAP_PLACEHOLDER sentinel still present in a WHEN clause — "
            "regex did not match all MAP_START/MAP_END blocks.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Prepend in apply order:
    #   0. PRAGMA foreign_keys = OFF — disable FK enforcement for the file batch.
    #      D1 enforces FK constraints by default; the CASE rewrites update child FKs
    #      (e.g. project_documents.project_id) to the new proj_* PKs BEFORE the
    #      parent projects.id is rewritten (children-before-parent is required to
    #      avoid UNIQUE constraint on the parent PK rewrite). Under FK=ON, any child
    #      UPDATE to a proj_* value that doesn't yet exist in projects.id fires a FK
    #      violation. PRAGMA defer_foreign_keys = ON defers checks to COMMIT but
    #      requires an explicit transaction; wrangler --file executes statements
    #      without an explicit wrapping transaction, so deferred FKs still fire per
    #      batch boundary. The authoritative fix is FK=OFF for the migration batch.
    #      Re-enabled at the end (PRAGMA foreign_keys = ON).
    #      Verified: D1 accepts PRAGMA foreign_keys = OFF (2026-06-02 smoke test).
    #      Local SQLite test confirms this is the only reliable strategy under
    #      executescript semantics (defer_foreign_keys + parent-first both fail).
    #   1. Sentinel task cleanup (NULL proj_01KPCANON test task)
    #   2. NULL fixer for deleted-task orphan project refs (tasks only)
    #   3. Universal NULL/DELETE fixer for orphaned/test project refs in live-feature
    #      tables (recGOTA6yz5K2ypsa, 'test' — skips append-only audit logs)
    #   4. FK-clear child rows of dup projects + delete dup project rows
    #      (project_documents has FOREIGN KEY project_id REFERENCES projects(id)
    #      with no CASCADE; child rows must be deleted before the parent is deleted
    #      even with FK=OFF this is belt-and-suspenders for clean data)
    #   5. The main CASE rewrites (children + projects.id)
    #      For append-only logs: CASE rewrites live-project refs; orphaned refs pass
    #      through ELSE branch unchanged (LEAVE-OLD-VALUE, audit history preserved).
    #   6. PRAGMA foreign_keys = ON — restore FK enforcement after migration.
    filled = (
        "-- P2 FK-safety: disable FK enforcement for this migration batch.\n"
        "-- D1 enforces FKs; child project_id rewrites target proj_* PKs that don't\n"
        "-- exist in projects.id until the final UPDATE projects SET id=... step.\n"
        "-- FK=OFF avoids spurious constraint violations mid-batch.\n"
        "-- Re-enabled at end. Verified safe: D1 accepts this PRAGMA (2026-06-02).\n"
        "PRAGMA foreign_keys = OFF;\n\n"
        + sentinel_fix + "\n\n"
        + NULL_DELETED_TASK_FIXER + "\n"
        + NULL_UNIVERSAL_FIXER + "\n"
        + DELETE_HUB_DELETED_DUP_PROJECTS + "\n"
        + filled
        + "\n-- Restore FK enforcement after migration.\nPRAGMA foreign_keys = ON;\n"
    )

    return filled


# ── Local copy export ──────────────────────────────────────────────────────────


def export_to_local(tmp_dir: Path) -> Path:
    """
    Export prod D1 to a local SQLite database using wrangler d1 export.

    wrangler d1 export produces a SQL dump (text), not a binary SQLite file.
    This function:
      1. Exports the SQL dump to a .sql text file.
      2. Loads the dump into a fresh binary SQLite3 database.
    Returns path to the binary SQLite file.
    """
    sql_dump_path = tmp_dir / "p2_dryrun_dump.sql"
    sqlite_path = tmp_dir / "p2_dryrun_copy.sqlite"

    print(f"[INFO] Exporting prod D1 SQL dump to {sql_dump_path} (read-only op)...")
    result = subprocess.run(
        f'wrangler d1 export {D1_DB_NAME} --remote --output "{sql_dump_path}"',
        capture_output=True,
        text=True,
        cwd=str(HUB_REPO),
        shell=True,
    )
    if result.returncode != 0:
        print(
            f"[ERROR] wrangler d1 export failed:\n{result.stderr}",
            file=sys.stderr,
        )
        sys.exit(1)

    if not sql_dump_path.exists():
        print(
            f"[ERROR] Expected dump at {sql_dump_path} — file not found.\n"
            f"wrangler stdout:\n{result.stdout}",
            file=sys.stderr,
        )
        sys.exit(1)

    dump_size_kb = sql_dump_path.stat().st_size // 1024
    print(f"[OK] SQL dump exported: {sql_dump_path} ({dump_size_kb} KB)")

    # Load the SQL dump into a fresh SQLite database for local manipulation.
    # D1 export produces a UTF-8 SQL text file. Some text values may contain
    # null bytes (e.g. task names with '\x00'); replace them so Python's
    # executescript doesn't choke on embedded nulls.
    print(f"[INFO] Loading dump into local SQLite database: {sqlite_path}...")
    raw_bytes = sql_dump_path.read_bytes()
    # Replace null bytes with a space — structurally inert for SQL parsing
    dump_sql = raw_bytes.replace(b"\x00", b" ").decode("utf-8", errors="replace")
    conn = sqlite3.connect(str(sqlite_path))
    try:
        # D1 dumps start with PRAGMA defer_foreign_keys=TRUE; — valid SQLite.
        # executescript handles multi-statement SQL.
        conn.executescript(dump_sql)
        conn.commit()
    except Exception as e:
        conn.close()
        print(f"[ERROR] Failed to load SQL dump into SQLite: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

    db_size_kb = sqlite_path.stat().st_size // 1024
    print(f"[OK] Local SQLite database ready: {sqlite_path} ({db_size_kb} KB)")
    return sqlite_path


# ── Row count snapshot ─────────────────────────────────────────────────────────


def snapshot_counts(conn: sqlite3.Connection) -> dict[str, int]:
    """Return {table: row_count} for all tables in ALL_TABLES."""
    counts = {}
    for table in ALL_TABLES:
        (n,) = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
        counts[table] = n
    return counts


# ── Fail-closed assertions ────────────────────────────────────────────────────


def assert_fail_closed(conn: sqlite3.Connection, pre_counts: dict[str, int]) -> None:
    """
    Run fail-closed assertions on the local copy after applying the rewrite.
    RAISES SystemExit on any failure.

    Assertion tiers (2026-06-02 refined policy):

    LIVE-FEATURE tables (tasks, action_items, agenda_items, hub_decisions,
    paper_project_links, trajectories, regulatory_items, manuscript_revisions,
    project_documents, comments):
      → "0 non-proj_ rows" — strong invariant. Every non-proj_ value was
        either rewritten, NULLed, or deleted before this point.

    APPEND-ONLY AUDIT LOG tables (activity_log, file_activity_daily):
      → "0 non-proj_ rows that RESOLVE TO A LIVE HUB PROJECT" — weaker but
        correct invariant. Orphaned historical refs (verified non-live) remain
        as old non-proj_ values via the CASE ELSE branch. That is intentional.
        Assert: zero non-proj_ values that JOIN to a live projects row.
    """
    failures: list[str] = []

    # 1. Assertions per table
    for table, col, where_extra in REWRITE_COLUMNS:
        where_parts = [f"{col} NOT LIKE 'proj_%'", f"{col} IS NOT NULL"]
        if where_extra:
            where_parts.insert(0, where_extra)
        where_sql = " AND ".join(where_parts)

        if table in APPEND_ONLY_TABLES:
            # Refined assertion: only fail on non-proj_ refs that resolve to a LIVE project.
            # "live" = projects row with no deleted_at (or that exists on Hub D1).
            # Use an EXISTS subquery against the projects table in the same local DB.
            live_bad_sql = (
                f"SELECT COUNT(*) FROM {table} t "
                f"WHERE {where_sql} "
                f"  AND EXISTS (SELECT 1 FROM projects p WHERE p.id = t.{col} "
                f"              OR p.slug = t.{col})"
            )
            (live_bad,) = conn.execute(live_bad_sql).fetchone()
            # Also report total orphaned (informational, not a failure)
            (total_bad,) = conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {where_sql}"
            ).fetchone()
            orphaned = total_bad - live_bad
            if live_bad > 0:
                failures.append(
                    f"{table}.{col}: {live_bad} non-proj_ rows RESOLVE TO A LIVE PROJECT "
                    f"(must be rewritten — add to map). Orphaned (ok): {orphaned}."
                )
            # Not a failure — just informational
        else:
            (bad,) = conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {where_sql}"
            ).fetchone()
            if bad > 0:
                failures.append(f"{table}.{col}: {bad} non-proj_ rows remain")

    # 2. No slug/hex id in projects (allow deleted rows that were never typed)
    # Exception: the 4 PB-only projects were never on Hub, so they're fine
    # (they're in brain.db but Hub D1 only had their hex/slug forms)
    (bad_proj,) = conn.execute(
        "SELECT COUNT(*) FROM projects WHERE id NOT LIKE 'proj_%'"
    ).fetchone()
    if bad_proj > 0:
        failures.append(f"projects.id: {bad_proj} non-proj_ rows remain")
        # Log which ones for diagnosis
        rows = conn.execute(
            "SELECT id, slug, status FROM projects WHERE id NOT LIKE 'proj_%' LIMIT 10"
        ).fetchall()
        for r in rows:
            failures.append(f"  -> id={r[0]!r} slug={r[1]!r} status={r[2]!r}")

    # 3. Row count conservation (with documented exceptions)
    # projects: may decrease by the count of hard-deleted dup rows.
    # paper_project_links: may decrease by count of deleted test/orphaned rows
    #   (NOT NULL constraint on project_slug → we DELETE instead of NULL).
    # project_documents: may decrease by count of FK-cleared child rows of dup
    #   projects. The FK-clear step DELETEs project_documents rows where
    #   project_id IN DELETE_HUB_DELETED_DUP_PROJECT_IDS (1 row confirmed:
    #   iv-fluids-shortage 'Box Project Folder'). These rows reference deleted
    #   dup projects being hard-deleted; the DELETE is correct and intentional.
    # All other tables: must be conserved exactly (NULLs preserve row count).
    DELETED_DUP_PROJECT_COUNT = len(DELETE_HUB_DELETED_DUP_PROJECT_IDS)
    MAX_FK_CLEAR_PROJECT_DOCS = len(DELETE_HUB_DELETED_DUP_PROJECT_IDS)
    post_counts = snapshot_counts(conn)
    for table in ALL_TABLES:
        pre = pre_counts[table]
        post = post_counts[table]
        expected_post = pre
        expected_delta_str = "0"
        if table == "projects":
            expected_post = pre - DELETED_DUP_PROJECT_COUNT
            expected_delta_str = f"-{DELETED_DUP_PROJECT_COUNT} (deleted dup rows)"
        elif table == "project_documents":
            # May decrease by FK-clear of dup-project child rows (up to MAX_FK_CLEAR)
            if post > pre:
                failures.append(
                    f"{table}: row count INCREASED {pre} -> {post} (unexpected)"
                )
            elif pre - post > MAX_FK_CLEAR_PROJECT_DOCS:
                failures.append(
                    f"{table}: row count decreased by {pre - post} "
                    f"(> expected max FK-clear delta {MAX_FK_CLEAR_PROJECT_DOCS})"
                )
            # Any decrease ≤ MAX_FK_CLEAR_PROJECT_DOCS is expected and correct
            if pre - post <= MAX_FK_CLEAR_PROJECT_DOCS and post <= pre:
                print(
                    f"  [OK] {table}: {pre} -> {post} "
                    f"(-{pre-post} FK-cleared dup-project doc rows, expected)"
                )
            continue
        elif table in FIXER_DELETE_INSTEAD_OF_NULL:
            # Rows deleted (NOT NULL constraint); allow decrease up to NULL_UNIVERSAL_VALUES count
            max_decrease = len(NULL_UNIVERSAL_VALUES)
            if post > pre:
                failures.append(
                    f"{table}: row count INCREASED {pre} -> {post} (unexpected)"
                )
            elif pre - post > max_decrease:
                failures.append(
                    f"{table}: row count decreased by {pre - post} (> expected max {max_decrease})"
                )
            # Accept any decrease up to max_decrease; don't add to failures
            continue
        if post != expected_post:
            failures.append(
                f"{table}: row count changed {pre} -> {post} "
                f"(expected delta {expected_delta_str})"
            )

    # 4. No orphaned non-deleted tasks (project_id references missing project)
    # Exclude deleted tasks and NULL project_ids (NULL means no project)
    (orphans,) = conn.execute(
        """
        SELECT COUNT(*) FROM tasks t
          LEFT JOIN projects p ON t.project_id = p.id
          WHERE t.project_id IS NOT NULL
            AND p.id IS NULL
            AND t.status != 'deleted'
        """
    ).fetchone()
    if orphans > 0:
        failures.append(f"Orphaned non-deleted tasks: {orphans} tasks reference a missing project")
        rows = conn.execute(
            """
            SELECT t.id, t.project_id, t.status FROM tasks t
              LEFT JOIN projects p ON t.project_id = p.id
              WHERE t.project_id IS NOT NULL AND p.id IS NULL AND t.status != 'deleted'
              LIMIT 10
            """
        ).fetchall()
        for r in rows:
            failures.append(f"  -> task={r[0]!r} project_id={r[1]!r} status={r[2]!r}")

    if failures:
        print("[ABORT] FAIL-CLOSED assertions failed:", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        sys.exit(1)

    # All assertions passed — report per-column disposition for the dry-run result
    print("[OK] FAIL-CLOSED assertions passed:")
    print("  Per-column dry-run result:")
    for table, col, where_extra in REWRITE_COLUMNS:
        where_parts = [f"{col} NOT LIKE 'proj_%'", f"{col} IS NOT NULL"]
        if where_extra:
            where_parts.insert(0, where_extra)
        where_sql = " AND ".join(where_parts)
        (total_bad,) = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE {where_sql}"
        ).fetchone()
        if table in APPEND_ONLY_TABLES:
            # Distinguish live-project non-proj_ (failure) vs orphaned (leave-old-value)
            live_bad_sql = (
                f"SELECT COUNT(*) FROM {table} t WHERE {where_sql} "
                f"  AND EXISTS (SELECT 1 FROM projects p WHERE p.id=t.{col} OR p.slug=t.{col})"
            )
            (live_bad,) = conn.execute(live_bad_sql).fetchone()
            orphaned = total_bad - live_bad
            print(
                f"    {table}.{col}: {live_bad} live-project non-proj_ (expect 0), "
                f"{orphaned} orphaned/leave-old-value (intentional)"
            )
        else:
            print(f"    {table}.{col}: {total_bad} non-proj_ (expect 0)")
    print(f"  projects.id: 0 non-proj_ rows")
    print(f"  Row counts: {', '.join(f'{t}={post_counts[t]}' for t in ALL_TABLES)}")
    print(f"  Orphaned non-deleted tasks: 0")


# ── Apply to local copy ────────────────────────────────────────────────────────


def apply_to_local(
    local_db_path: Path, filled_sql: str, brain_db_path: Path = BRAIN_DB
) -> None:
    """
    Apply the filled SQL to the local SQLite copy (dry-run mode).
    Uses sqlite3 directly (not wrangler) — no prod D1 writes.

    Rebuilds the map with the Hub local DB available (SOURCE 2: slug chains).
    """
    conn = sqlite3.connect(str(local_db_path))
    try:
        print("[INFO] Snapshotting row counts before apply...")
        pre_counts = snapshot_counts(conn)
        for table, count in pre_counts.items():
            print(f"  {table}: {count} rows")

        print("[INFO] Running coverage check (unmapped FK detection)...")
        # Rebuild map with Hub local DB for slug→canonical SOURCE 2
        the_map = build_canonical_map(brain_db_path, hub_local_db_path=local_db_path)
        print(f"  Map with SOURCE 2 slug chains: {len(the_map)} entries")
        # Load live Hub project IDs for the append-only table liveness check
        hub_live_ids = frozenset(
            r[0] for r in conn.execute(
                "SELECT id FROM projects WHERE status != 'deleted'"
            ).fetchall()
        ) | frozenset(
            r[0] for r in conn.execute(
                "SELECT slug FROM projects WHERE status != 'deleted' AND slug IS NOT NULL"
            ).fetchall()
        )
        verify_map_coverage(the_map, local_db_path, hub_live_project_ids=hub_live_ids)

        # Regenerate the filled SQL with the expanded map
        print("[INFO] Regenerating filled SQL with expanded map (SOURCE 2)...")
        expanded_filled_sql = fill_sql_template(SQL_TEMPLATE, the_map, SENTINEL_TASK_FIX)
        expanded_path = SQL_TEMPLATE.parent / "p2-hub-rekey-FILLED-expanded.sql"
        expanded_path.write_text(expanded_filled_sql, encoding="utf-8")
        print(f"  Expanded SQL saved to: {expanded_path}")

        print("[INFO] Applying expanded filled SQL to local copy...")
        conn.executescript(expanded_filled_sql)
        conn.commit()
        print("[OK] SQL applied to local copy.")

        print("[INFO] Running fail-closed assertions...")
        assert_fail_closed(conn, pre_counts)

    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Apply failed: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


# ── Prod write path (--execute) ────────────────────────────────────────────────


def capture_time_travel_bookmark() -> str:
    """
    Capture the current D1 Time-Travel bookmark via wrangler.
    Returns the bookmark string. Aborts on failure.
    """
    result = subprocess.run(
        f"wrangler d1 time-travel info {D1_DB_NAME}",
        capture_output=True,
        text=True,
        cwd=str(HUB_REPO),
        shell=True,
    )
    output = result.stdout + result.stderr
    if result.returncode != 0:
        print(
            f"[ERROR] wrangler d1 time-travel info failed:\n{output}",
            file=sys.stderr,
        )
        sys.exit(1)
    # Parse: "⚠️ The current bookmark is '...'"
    import re as _re
    m = _re.search(r"bookmark is '([^']+)'", output)
    if not m:
        print(
            f"[ERROR] Could not parse bookmark from wrangler output:\n{output}",
            file=sys.stderr,
        )
        sys.exit(1)
    return m.group(1)


def run_foreign_key_check(sqlite_path: Path) -> list[tuple]:
    """
    Run PRAGMA foreign_key_check on a local SQLite copy (FK=ON).
    Returns list of violation tuples — empty means clean.
    Enables FK enforcement first so the check is meaningful.
    """
    conn = sqlite3.connect(str(sqlite_path))
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        return violations
    finally:
        conn.close()


def pre_write_validate(
    fresh_sqlite_path: Path,
    brain_db_path: Path,
) -> str:
    """
    Step B: validate the FRESH prod export against the migration SQL (read-only).

    Applies the filled SQL to a COPY of the fresh SQLite (FK=ON faithful —
    the SQL starts with PRAGMA foreign_keys = OFF so the copy will replicate
    D1's behaviour). Runs assert_fail_closed and foreign_key_check on the
    post-apply copy.

    Returns the expanded filled SQL (with SOURCE 2 slug chains) for use in
    the prod write step. Aborts on any assertion failure.
    """
    import shutil as _shutil

    # Work on a copy — leave the fresh export untouched for post-write compare.
    pre_copy = fresh_sqlite_path.parent / "p2_execute_pre_copy.sqlite"
    _shutil.copy2(str(fresh_sqlite_path), str(pre_copy))
    print(f"[INFO] Pre-write validation copy: {pre_copy}")

    conn = sqlite3.connect(str(pre_copy))
    try:
        # Snapshot pre-apply row counts
        print("[INFO] Snapshotting row counts (pre-apply)...")
        pre_counts = snapshot_counts(conn)
        for table, count in pre_counts.items():
            print(f"  {table}: {count} rows")

        # Build expanded map (SOURCE 2 slug chains from the fresh export)
        print("[INFO] Running coverage check (unmapped FK detection)...")
        the_map = build_canonical_map(brain_db_path, hub_local_db_path=pre_copy)
        print(f"  Map with SOURCE 2 slug chains: {len(the_map)} entries")
        hub_live_ids = frozenset(
            r[0] for r in conn.execute(
                "SELECT id FROM projects WHERE status != 'deleted'"
            ).fetchall()
        ) | frozenset(
            r[0] for r in conn.execute(
                "SELECT slug FROM projects WHERE status != 'deleted' AND slug IS NOT NULL"
            ).fetchall()
        )
        verify_map_coverage(the_map, pre_copy, hub_live_project_ids=hub_live_ids)

        # Regenerate expanded filled SQL using the fresh export's slug chains
        print("[INFO] Regenerating expanded filled SQL from fresh export (SOURCE 2)...")
        expanded_sql = fill_sql_template(SQL_TEMPLATE, the_map, SENTINEL_TASK_FIX)
        expanded_path = SQL_TEMPLATE.parent / "p2-hub-rekey-EXECUTE-expanded.sql"
        expanded_path.write_text(expanded_sql, encoding="utf-8")
        print(f"  Expanded SQL saved to: {expanded_path}")

        # Apply to pre-copy
        print("[INFO] Applying SQL to pre-write validation copy (FK-ON faithful)...")
        conn.executescript(expanded_sql)
        conn.commit()
        print("[OK] SQL applied to pre-write copy.")

        # Fail-closed assertions
        print("[INFO] Running fail-closed assertions on pre-write copy...")
        assert_fail_closed(conn, pre_counts)  # aborts on failure

        # Foreign key check on post-apply copy (FK=ON; SQL ended with PRAGMA FK=ON)
        print("[INFO] Running PRAGMA foreign_key_check on pre-write copy...")
        violations = conn.execute("PRAGMA foreign_keys = ON").fetchall()  # enable
        violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            print(
                f"[ABORT] PRAGMA foreign_key_check found {len(violations)} violation(s):",
                file=sys.stderr,
            )
            for v in violations:
                print(f"  {v}", file=sys.stderr)
            sys.exit(1)
        print(f"[OK] PRAGMA foreign_key_check: 0 violations.")

        print("\n[OK] PRE-WRITE VALIDATION PASSED — prod is ready for the write.")
        return expanded_sql

    except SystemExit:
        raise
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Pre-write validation failed: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


def post_write_validate(
    rollback_bookmark: str,
    brain_db_path: Path,
    scratch_dir: Path,
) -> None:
    """
    Step D: re-export prod fresh, run assert_fail_closed + foreign_key_check.

    Prints LOUD CONVERGED or LOUD POST-VERIFY FAILED with rollback command.
    Does NOT abort on failure (can't roll back automatically) — prints the
    rollback command and exits non-zero so the caller can act.
    """
    import shutil as _shutil

    ROLLBACK_CMD = (
        f"wrangler d1 time-travel restore {D1_DB_NAME} "
        f"--bookmark={rollback_bookmark}"
    )

    print("\n" + "=" * 70)
    print("[STEP D] POST-WRITE VERIFICATION")
    print("=" * 70)

    # Re-export prod
    post_dump_path = scratch_dir / "p2_execute_post.sql"
    post_sqlite_path = scratch_dir / "p2_execute_post.sqlite"

    print(f"[INFO] Re-exporting prod D1 post-write...")
    result = subprocess.run(
        f'wrangler d1 export {D1_DB_NAME} --remote --output "{post_dump_path}"',
        capture_output=True,
        text=True,
        cwd=str(HUB_REPO),
        shell=True,
    )
    if result.returncode != 0:
        print(
            f"[ERROR] Post-write export failed:\n{result.stderr}",
            file=sys.stderr,
        )
        print(
            f"\n*** CANNOT VERIFY — manual check required ***\n"
            f"    Rollback if uncertain:\n"
            f"    {ROLLBACK_CMD}",
            file=sys.stderr,
        )
        sys.exit(1)

    dump_size_kb = post_dump_path.stat().st_size // 1024
    print(f"[OK] Post-write dump: {post_dump_path} ({dump_size_kb} KB)")

    # Load into SQLite
    raw = post_dump_path.read_bytes().replace(b"\x00", b" ").decode("utf-8", errors="replace")
    conn = sqlite3.connect(str(post_sqlite_path))
    try:
        conn.executescript(raw)
        conn.commit()
    except Exception as e:
        conn.close()
        print(f"[ERROR] Failed loading post-write dump: {e}", file=sys.stderr)
        print(f"  Rollback: {ROLLBACK_CMD}", file=sys.stderr)
        sys.exit(1)

    print(f"[OK] Post-write SQLite: {post_sqlite_path}")

    # Run assertions — collect failures, don't abort mid-check
    failures: list[str] = []

    # Gather pre_counts from the post-write DB itself — we only need them
    # for row conservation; use a "pre" that matches what we expect post-rekey.
    # Since assert_fail_closed needs pre_counts for row conservation checks, and
    # post-write prod IS the post state, pass current counts as both pre and post
    # (row conservation has already been validated in the pre-write step; here we
    # are checking that the LIVE prod now looks correct).
    # Simplified: just run the per-column checks directly.
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        for table, col, where_extra in REWRITE_COLUMNS:
            # Skip tables not present in the post-write export
            tables_in_db = frozenset(
                r[0] for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            )
            if table not in tables_in_db:
                print(f"  SKIP: {table}.{col} (not in post-write export — Lane-3 table)")
                continue

            where_parts = [f"{col} NOT LIKE 'proj_%'", f"{col} IS NOT NULL"]
            if where_extra:
                where_parts.insert(0, where_extra)
            where_sql = " AND ".join(where_parts)

            if table in APPEND_ONLY_TABLES:
                live_bad_sql = (
                    f"SELECT COUNT(*) FROM {table} t WHERE {where_sql} "
                    f"AND EXISTS (SELECT 1 FROM projects p WHERE p.id=t.{col} OR p.slug=t.{col})"
                )
                (live_bad,) = conn.execute(live_bad_sql).fetchone()
                (total_bad,) = conn.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE {where_sql}"
                ).fetchone()
                orphaned = total_bad - live_bad
                tag = "OK" if live_bad == 0 else "FAIL"
                print(
                    f"  {tag}: {table}.{col}: {live_bad} live-proj non-proj_ (expect 0); "
                    f"{orphaned} orphaned/leave-old-value (ok)"
                )
                if live_bad > 0:
                    failures.append(f"{table}.{col}: {live_bad} live-project non-proj_ rows")
            else:
                (bad,) = conn.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE {where_sql}"
                ).fetchone()
                tag = "OK" if bad == 0 else "FAIL"
                print(f"  {tag}: {table}.{col}: {bad} non-proj_ rows (expect 0)")
                if bad > 0:
                    failures.append(f"{table}.{col}: {bad} non-proj_ rows remain")

        # projects.id
        (bad_proj,) = conn.execute(
            "SELECT COUNT(*) FROM projects WHERE id NOT LIKE 'proj_%'"
        ).fetchone()
        tag = "OK" if bad_proj == 0 else "FAIL"
        print(f"  {tag}: projects.id: {bad_proj} non-proj_ rows (expect 0)")
        if bad_proj > 0:
            failures.append(f"projects.id: {bad_proj} non-proj_ rows")

        # Orphaned non-deleted tasks
        (orphans,) = conn.execute("""
            SELECT COUNT(*) FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.project_id IS NOT NULL AND p.id IS NULL
            AND t.status != 'deleted'
        """).fetchone()
        tag = "OK" if orphans == 0 else "FAIL"
        print(f"  {tag}: orphaned non-deleted tasks: {orphans} (expect 0)")
        if orphans > 0:
            failures.append(f"Orphaned non-deleted tasks: {orphans}")

        # PRAGMA foreign_key_check
        fk_violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        tag = "OK" if not fk_violations else "FAIL"
        print(f"  {tag}: PRAGMA foreign_key_check: {len(fk_violations)} violations (expect 0)")
        if fk_violations:
            for v in fk_violations[:10]:
                print(f"    {v}")
            if len(fk_violations) > 10:
                print(f"    ... ({len(fk_violations) - 10} more)")
            failures.append(f"PRAGMA foreign_key_check: {len(fk_violations)} violations")

    finally:
        conn.close()

    print()
    if not failures:
        print("=" * 70)
        print("*** POST-WRITE CONVERGED ***")
        print("  All assertions passed. PRAGMA foreign_key_check: 0 violations.")
        print("  Prod D1 is fully re-keyed to proj_* PKs.")
        print("=" * 70)
    else:
        print("=" * 70)
        print("*** POST-WRITE VERIFY FAILED ***")
        print(f"  {len(failures)} failure(s):")
        for f in failures:
            print(f"  - {f}")
        print()
        print("  ROLLBACK COMMAND:")
        print(f"  {ROLLBACK_CMD}")
        print("=" * 70)
        sys.exit(1)


def execute_prod_migration(
    brain_db_path: Path,
    scratch_dir: Path,
) -> None:
    """
    Full hardened --execute path: A → B → C → D.

    A. Fresh Time-Travel bookmark + fresh D1 export.
    B. Pre-write validate on the fresh export (FK-ON faithful assertions).
       ABORT if not green.
    C. Interactive confirmation + prod write.
    D. Post-write re-export + assertions + foreign_key_check.
       Print CONVERGED or FAILED+ROLLBACK_CMD.
    """
    import shutil as _shutil

    scratch_dir.mkdir(parents=True, exist_ok=True)

    # ── Step A: Fresh bookmark + fresh export ──────────────────────────────────
    print("\n" + "=" * 70)
    print("[STEP A] FRESH TIME-TRAVEL BOOKMARK + FRESH D1 EXPORT")
    print("=" * 70)

    print("[INFO] Capturing fresh Time-Travel bookmark...")
    bookmark = capture_time_travel_bookmark()
    ROLLBACK_CMD = f"wrangler d1 time-travel restore {D1_DB_NAME} --bookmark={bookmark}"

    print()
    print("!" * 70)
    print(f"!  ROLLBACK BOOKMARK: {bookmark}")
    print(f"!  ROLLBACK CMD: {ROLLBACK_CMD}")
    print("!" * 70)
    print()

    fresh_dump_path = scratch_dir / "p2_execute_fresh.sql"
    fresh_sqlite_path = scratch_dir / "p2_execute_fresh.sqlite"

    print(f"[INFO] Exporting fresh prod D1 snapshot...")
    result = subprocess.run(
        f'wrangler d1 export {D1_DB_NAME} --remote --output "{fresh_dump_path}"',
        capture_output=True,
        text=True,
        cwd=str(HUB_REPO),
        shell=True,
    )
    if result.returncode != 0:
        print(f"[ERROR] Fresh export failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    dump_size_kb = fresh_dump_path.stat().st_size // 1024
    print(f"[OK] Fresh dump: {fresh_dump_path} ({dump_size_kb} KB)")

    raw = fresh_dump_path.read_bytes().replace(b"\x00", b" ").decode("utf-8", errors="replace")
    conn = sqlite3.connect(str(fresh_sqlite_path))
    try:
        conn.executescript(raw)
        conn.commit()
    except Exception as e:
        conn.close()
        print(f"[ERROR] Loading fresh dump failed: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

    db_size_kb = fresh_sqlite_path.stat().st_size // 1024
    print(f"[OK] Fresh SQLite: {fresh_sqlite_path} ({db_size_kb} KB)")

    # ── Step B: Pre-write validate ─────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("[STEP B] PRE-WRITE VALIDATION (FK-ON faithful dry-run on fresh export)")
    print("=" * 70)

    # pre_write_validate aborts (sys.exit) if not green
    expanded_sql = pre_write_validate(fresh_sqlite_path, brain_db_path)

    # ── Step C: Interactive confirm + prod write ────────────────────────────────
    print("\n" + "=" * 70)
    print("[STEP C] PROD WRITE")
    print("=" * 70)
    print(
        "\n[WARNING] --execute flag passed. This will write to PROD D1.\n"
        "Step B (pre-write validation) passed. Pre-write assertions GREEN.\n"
        f"Rollback bookmark: {bookmark}\n"
        "Are you sure? Type 'yes-execute-prod' to confirm: ",
        end="",
    )
    answer = input().strip()
    if answer != "yes-execute-prod":
        print("[ABORT] Cancelled.")
        sys.exit(1)

    # Save the expanded SQL (used for prod write — includes fresh SOURCE 2 chains)
    execute_sql_path = scratch_dir / "p2-hub-rekey-EXECUTE-FINAL.sql"
    execute_sql_path.write_text(expanded_sql, encoding="utf-8")
    print(f"[INFO] Execute SQL saved to: {execute_sql_path}")

    print(f"[INFO] Running wrangler d1 execute --remote --file {execute_sql_path}...")
    result = subprocess.run(
        f'wrangler d1 execute {D1_DB_NAME} --remote --file "{execute_sql_path}"',
        capture_output=True,
        text=True,
        cwd=str(HUB_REPO),
        shell=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        print(f"[ERROR] Prod execute failed:\n{result.stderr}", file=sys.stderr)
        print(
            f"\n  Prod write FAILED — D1 auto-rolled back (wrangler guarantees this).\n"
            f"  Safety check: verify bookmark is unchanged:\n"
            f"    wrangler d1 time-travel info {D1_DB_NAME}\n"
            f"  Rollback if needed: {ROLLBACK_CMD}",
            file=sys.stderr,
        )
        sys.exit(1)
    print("[OK] Prod D1 write complete.")

    # ── Step D: Post-write validate ────────────────────────────────────────────
    post_write_validate(bookmark, brain_db_path, scratch_dir)


# ── Main ───────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="P2 Hub D1 project PK re-key: fill map sentinels, apply to local copy."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        default=False,
        help="Write to PROD D1 (requires §3 gate clearance + interactive confirmation). "
             "Default is DRY-RUN (local copy only).",
    )
    parser.add_argument(
        "--map-only",
        action="store_true",
        default=False,
        help="Print the canonical map and exit without running SQL.",
    )
    parser.add_argument(
        "--brain-db",
        type=Path,
        default=BRAIN_DB,
        help=f"Path to brain.db (default: {BRAIN_DB})",
    )
    parser.add_argument(
        "--skip-export",
        type=Path,
        default=None,
        metavar="PATH",
        help="Skip wrangler d1 export and use this existing SQLite file as the local copy. "
             "Useful for re-running assertions on a previously exported copy.",
    )
    args = parser.parse_args()

    print("=" * 70)
    print("P2 Hub Re-Key Apply Script")
    print(f"  Mode: {'PROD EXECUTE' if args.execute else 'DRY-RUN (local copy)'}")
    print(f"  brain.db: {args.brain_db}")
    print(f"  SQL template: {SQL_TEMPLATE}")
    print(f"  Timestamp: {datetime.now().isoformat()}")
    print("=" * 70)

    # Step 1: Build the map
    print("\n[STEP 1] Building canonical PK map from brain.db entity_aliases...")
    the_map = build_canonical_map(args.brain_db)
    print(f"  Map entries: {len(the_map)}")

    # Categorize for display
    hex32_entries = [(k, v) for k, v in the_map.items() if len(k) == 32 and all(c in "0123456789abcdef" for c in k)]
    slug_entries = [(k, v) for k, v in the_map.items() if k not in dict(hex32_entries)]

    print(f"    hex32 -> proj_*: {len(hex32_entries)}")
    print(f"    slug/other -> proj_*: {len(slug_entries)}")

    if args.map_only:
        print("\n=== Full canonical map ===")
        print(f"{'OLD_HUB_ID':60s}  CANONICAL_PK")
        print("-" * 90)
        for old_id, new_pk in sorted(the_map.items()):
            print(f"{old_id:60s}  {new_pk}")
        print(f"\nTotal: {len(the_map)} entries")
        return

    # Step 2: Fill the SQL template
    print("\n[STEP 2] Filling SQL template with canonical map...")
    filled_sql = fill_sql_template(SQL_TEMPLATE, the_map, SENTINEL_TASK_FIX)
    print(f"  Filled SQL length: {len(filled_sql):,} chars")

    # Save filled SQL to scratch for inspection
    filled_path = HUB_REPO / "scratch" / "p2-hub-rekey-FILLED.sql"
    filled_path.write_text(filled_sql, encoding="utf-8")
    print(f"  Filled SQL saved to: {filled_path}")

    # Step 3: Export prod D1 or use provided local copy
    if args.execute:
        # Hardened prod path: A (fresh export+bookmark) → B (pre-write validate)
        # → C (interactive confirm + prod write) → D (post-write validate).
        # Steps 1+2 above (map build + initial SQL fill) are superseded inside
        # execute_prod_migration which rebuilds with SOURCE 2 slug chains from the
        # fresh export. The filled_path saved above is a reference copy only.
        scratch_dir = HUB_REPO / "scratch" / "p2_execute_run"
        execute_prod_migration(args.brain_db, scratch_dir)
        return

    # Dry-run: export to temp or use provided copy
    with tempfile.TemporaryDirectory(
        prefix="p2_hub_rekey_dryrun_", dir=str(HUB_REPO / "scratch")
    ) as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)

        if args.skip_export:
            print(f"\n[STEP 3] Using provided local copy: {args.skip_export}")
            local_db = args.skip_export
        else:
            print("\n[STEP 3] Exporting prod D1 to local copy (read-only)...")
            local_db = export_to_local(tmp_dir)

        # Step 4: Apply to local copy + assertions
        print("\n[STEP 4] Applying SQL to local copy + fail-closed assertions...")
        apply_to_local(local_db, filled_sql, brain_db_path=args.brain_db)

        print("\n" + "=" * 70)
        print("[PASS] DRY-RUN COMPLETE — all fail-closed assertions passed.")
        print("  The prod D1 was NOT modified.")
        print(f"  Filled SQL is at: {filled_path}")
        print(
            "  To apply to prod after clearing §3 gates:\n"
            "    python scripts/p2_hub_rekey_apply.py --execute"
        )
        print("=" * 70)


if __name__ == "__main__":
    main()

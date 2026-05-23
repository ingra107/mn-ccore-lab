#!/usr/bin/env python3
"""
scripts/check-schema-versions.py
=================================
Structural integrity check for the api/schema-v*.sql migration file set.

Three assertions (INFRA-5):
  1. Ordered-version list: detects gaps or new out-of-order insertions vs the
     committed snapshot.
  2. Duplicate-prefix detection: flags any version number that has more files
     than the snapshot recorded for that version.
  3. Snapshot hash: SHA-256 of the sorted canonical file list must match the
     hash stored in scripts/schema-version-snapshot.json.

The snapshot is the single source of truth.  When a new schema file is added
or removed intentionally, the developer MUST regenerate the snapshot:

    python scripts/check-schema-versions.py --update

That command updates scripts/schema-version-snapshot.json in-place and prints
a human-readable summary of what changed.  The updated snapshot file must be
committed alongside the new schema file in the same PR.

Exit codes:
    0  All assertions pass (current file set matches snapshot).
    1  One or more assertions fail (details printed to stdout).

Portability: stdlib only (os, re, hashlib, json, sys, argparse).
Runs on Python 3.8+ on both Linux (CI ubuntu-latest) and Windows.
"""

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path


# ── paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
API_DIR = REPO_ROOT / "api"
SNAPSHOT_PATH = SCRIPT_DIR / "schema-version-snapshot.json"


# ── file discovery & parsing ─────────────────────────────────────────────────

_SCHEMA_FILE_RE = re.compile(r"^schema-v(\d+)(-.+)?\.sql$")


def discover_files(api_dir: Path) -> list[tuple[int, str, str]]:
    """
    Return a sorted list of (version, label, filename) tuples for every
    api/schema-vNN*.sql file found on disk.

    Sort order: (version ASC, label ASC) so that plain 'schema-vNN.sql'
    (label='') sorts before labelled variants.
    """
    entries = []
    for fname in os.listdir(api_dir):
        m = _SCHEMA_FILE_RE.match(fname)
        if m:
            entries.append((int(m.group(1)), m.group(2) or "", fname))
    entries.sort(key=lambda x: (x[0], x[1]))
    return entries


def filenames_from_entries(entries: list[tuple[int, str, str]]) -> list[str]:
    return [e[2] for e in entries]


def version_groups(entries: list[tuple[int, str, str]]) -> dict[int, list[str]]:
    groups: dict[int, list[str]] = {}
    for ver, _label, fname in entries:
        groups.setdefault(ver, []).append(fname)
    return groups


def find_gaps(entries: list[tuple[int, str, str]]) -> list[int]:
    """
    Return the list of integer version numbers that are absent from the range
    [min_version, max_version].  An empty list means contiguous.
    """
    if not entries:
        return []
    versions = sorted({e[0] for e in entries})
    return [v for v in range(versions[0], versions[-1] + 1) if v not in versions]


# ── hashing ──────────────────────────────────────────────────────────────────

def compute_hash(filenames: list[str]) -> str:
    """
    SHA-256 of the sorted canonical filenames joined by newline.
    Filenames only (not content) — structural check, not content check.
    Content integrity is guarded by the separate drift-diff step.
    """
    canonical = "\n".join(filenames)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ── snapshot I/O ─────────────────────────────────────────────────────────────

def load_snapshot(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_snapshot(entries: list[tuple[int, str, str]]) -> dict:
    filenames = filenames_from_entries(entries)
    vgroups = version_groups(entries)
    gaps = find_gaps(entries)
    versions = sorted({e[0] for e in entries})
    duplicates = {str(k): v for k, v in vgroups.items() if len(v) > 1}

    return {
        "description": (
            "Canonical set of api/schema-v*.sql migration files. "
            "Regenerate with: python scripts/check-schema-versions.py --update"
        ),
        "hash": compute_hash(filenames),
        "file_count": len(filenames),
        "files": filenames,
        "version_range": [versions[0], versions[-1]] if versions else [0, 0],
        "gaps": gaps,
        "duplicate_version_groups": duplicates,
    }


def save_snapshot(path: Path, snapshot: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)
        f.write("\n")  # trailing newline for clean git diffs


# ── check logic ──────────────────────────────────────────────────────────────

def check(api_dir: Path, snapshot_path: Path) -> int:
    """
    Run all three INFRA-5 assertions against the current api/ directory.

    Returns 0 (pass) or 1 (fail).
    """
    # ── load snapshot ──────────────────────────────────────────────────────
    if not snapshot_path.exists():
        print("ERROR: snapshot file not found:", snapshot_path)
        print("Run:  python scripts/check-schema-versions.py --update")
        return 1

    snapshot = load_snapshot(snapshot_path)

    # ── discover current files ─────────────────────────────────────────────
    entries = discover_files(api_dir)
    current_files = filenames_from_entries(entries)
    current_hash = compute_hash(current_files)

    expected_files: list[str] = snapshot.get("files", [])
    expected_hash: str = snapshot.get("hash", "")

    failures: list[str] = []

    # ── Assertion 3: snapshot hash ─────────────────────────────────────────
    if current_hash != expected_hash:
        failures.append(
            "FAIL [snapshot-hash]: The set of api/schema-v*.sql files has changed "
            "without updating scripts/schema-version-snapshot.json.\n"
            f"  Expected hash : {expected_hash}\n"
            f"  Current hash  : {current_hash}"
        )

        # Compute the diff for a useful error message.
        expected_set = set(expected_files)
        current_set = set(current_files)
        added = sorted(current_set - expected_set)
        removed = sorted(expected_set - current_set)
        if added:
            failures.append(
                "  New file(s) not in snapshot:\n"
                + "".join(f"    + {f}\n" for f in added)
            )
        if removed:
            failures.append(
                "  File(s) removed since snapshot:\n"
                + "".join(f"    - {f}\n" for f in removed)
            )

    # ── Assertion 1: gaps ──────────────────────────────────────────────────
    # Compare the gap list against what the snapshot recorded.
    # New gaps (present now but not in snapshot) are a hard failure.
    # Gaps in the snapshot were already known-good when the snapshot was
    # committed; they are surfaced as informational only.
    snapshot_gaps: list[int] = snapshot.get("gaps", [])
    current_gaps = find_gaps(entries)
    new_gaps = [g for g in current_gaps if g not in snapshot_gaps]
    if new_gaps:
        failures.append(
            "FAIL [new-gaps]: Version gap(s) introduced since last snapshot.\n"
            "  New gaps (versions with no file): "
            + ", ".join(f"v{g}" for g in sorted(new_gaps))
            + "\n  To fix: add the missing schema file(s) OR, if intentional, "
            "run: python scripts/check-schema-versions.py --update"
        )

    if snapshot_gaps:
        print(
            "INFO [known-gaps]: Snapshot records known gaps at "
            + ", ".join(f"v{g}" for g in snapshot_gaps)
            + " — these are pre-existing and acknowledged."
        )

    # ── Assertion 2: duplicates ────────────────────────────────────────────
    # A version group that has MORE files than the snapshot recorded is a
    # new duplicate — hard failure.
    snapshot_dup_groups: dict[str, list[str]] = snapshot.get(
        "duplicate_version_groups", {}
    )
    current_vgroups = version_groups(entries)
    new_dup_violations: list[str] = []
    for ver, fnames in current_vgroups.items():
        expected_count = len(snapshot_dup_groups.get(str(ver), [str(ver)]))
        # If this version wasn't in the snapshot at all, expected count = 0
        # (the hash check will catch it, but report here too).
        snap_fnames = snapshot_dup_groups.get(str(ver), [])
        if not snap_fnames:
            # Version not in snapshot duplicate groups — expect exactly 1 file
            # (the hash check already flags it, but still report explicitly).
            snap_count = 1 if any(f.startswith(f"schema-v{ver}") for f in expected_files) else 0
        else:
            snap_count = len(snap_fnames)
        if len(fnames) > max(snap_count, 1):
            new_dup_violations.append(
                f"  v{ver}: snapshot has {snap_count} file(s), now has {len(fnames)}: "
                + ", ".join(fnames)
            )

    if new_dup_violations:
        failures.append(
            "FAIL [new-duplicates]: Version(s) with more files than the snapshot recorded:\n"
            + "\n".join(new_dup_violations)
            + "\n  If intentional, run: python scripts/check-schema-versions.py --update"
        )

    if snapshot_dup_groups:
        print(
            "INFO [known-duplicates]: Snapshot records "
            + str(len(snapshot_dup_groups))
            + " version group(s) with multiple files: "
            + ", ".join(f"v{k}" for k in sorted(snapshot_dup_groups, key=int))
            + " — these are pre-existing and acknowledged."
        )

    # ── result ─────────────────────────────────────────────────────────────
    if failures:
        print()
        print("=" * 70)
        print("schema-version-check: FAILED")
        print("=" * 70)
        for msg in failures:
            print()
            print(msg)
        print()
        print(
            "To acknowledge an intentional change to the migration file set, run:\n"
            "  python scripts/check-schema-versions.py --update\n"
            "then commit the updated scripts/schema-version-snapshot.json alongside\n"
            "your new schema file(s)."
        )
        print("=" * 70)
        return 1

    print(
        f"schema-version-check: OK  "
        f"({len(current_files)} files, "
        f"v{entries[0][0]}-v{entries[-1][0]}, "
        f"hash={current_hash[:12]}...)"
    )
    return 0


# ── update (--update) ────────────────────────────────────────────────────────

def update(api_dir: Path, snapshot_path: Path) -> int:
    """
    Regenerate the snapshot from the current state of api/schema-v*.sql and
    write it to scripts/schema-version-snapshot.json.

    Prints a human-readable summary of what changed vs the old snapshot.
    """
    entries = discover_files(api_dir)
    if not entries:
        print("ERROR: No api/schema-v*.sql files found under", api_dir)
        return 1

    new_snapshot = build_snapshot(entries)

    if snapshot_path.exists():
        old_snapshot = load_snapshot(snapshot_path)
        old_hash = old_snapshot.get("hash", "")
        new_hash = new_snapshot["hash"]

        if old_hash == new_hash:
            print("schema-version-snapshot.json is already up-to-date (hash unchanged).")
            return 0

        old_files = set(old_snapshot.get("files", []))
        new_files = set(new_snapshot["files"])
        added = sorted(new_files - old_files)
        removed = sorted(old_files - new_files)

        print("Updating scripts/schema-version-snapshot.json")
        print()
        if added:
            print("  Added files:")
            for f in added:
                print(f"    + {f}")
        if removed:
            print("  Removed files:")
            for f in removed:
                print(f"    - {f}")

        old_gaps = old_snapshot.get("gaps", [])
        new_gaps = new_snapshot["gaps"]
        new_gap_additions = [g for g in new_gaps if g not in old_gaps]
        resolved_gaps = [g for g in old_gaps if g not in new_gaps]
        if new_gap_additions:
            print(
                "  WARNING — new gap(s) recorded: "
                + ", ".join(f"v{g}" for g in new_gap_additions)
            )
        if resolved_gaps:
            print(
                "  Gap(s) resolved: "
                + ", ".join(f"v{g}" for g in resolved_gaps)
            )

        old_dups = set(old_snapshot.get("duplicate_version_groups", {}).keys())
        new_dups = set(new_snapshot["duplicate_version_groups"].keys())
        new_dup_additions = new_dups - old_dups
        if new_dup_additions:
            print(
                "  WARNING — new duplicate version group(s): "
                + ", ".join(f"v{k}" for k in sorted(new_dup_additions, key=int))
            )

        print()
        print(f"  file_count : {old_snapshot.get('file_count', '?')} -> {new_snapshot['file_count']}")
        print(f"  hash       : {old_hash[:12]}... -> {new_hash[:12]}...")
    else:
        print("Creating new scripts/schema-version-snapshot.json")
        print(f"  {new_snapshot['file_count']} files, "
              f"v{new_snapshot['version_range'][0]}-v{new_snapshot['version_range'][1]}")
        if new_snapshot["gaps"]:
            print("  WARNING — gaps recorded: "
                  + ", ".join(f"v{g}" for g in new_snapshot["gaps"]))
        if new_snapshot["duplicate_version_groups"]:
            print("  WARNING — duplicate version groups recorded: "
                  + ", ".join(f"v{k}" for k in
                              sorted(new_snapshot["duplicate_version_groups"], key=int)))

    save_snapshot(snapshot_path, new_snapshot)
    print()
    print("Snapshot written. Commit alongside your schema file change:")
    print("  git commit -F <msgfile> -- scripts/schema-version-snapshot.json api/schema-vNN*.sql")
    return 0


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check or update the api/schema-v*.sql version snapshot."
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="Regenerate the snapshot from the current file set (write mode).",
    )
    parser.add_argument(
        "--api-dir",
        default=str(API_DIR),
        help="Path to the api/ directory (default: ../api relative to this script).",
    )
    parser.add_argument(
        "--snapshot",
        default=str(SNAPSHOT_PATH),
        help="Path to the snapshot JSON file (default: scripts/schema-version-snapshot.json).",
    )
    args = parser.parse_args()

    api_path = Path(args.api_dir)
    snap_path = Path(args.snapshot)

    if not api_path.is_dir():
        print(f"ERROR: api directory not found: {api_path}")
        sys.exit(1)

    if args.update:
        sys.exit(update(api_path, snap_path))
    else:
        sys.exit(check(api_path, snap_path))


if __name__ == "__main__":
    main()

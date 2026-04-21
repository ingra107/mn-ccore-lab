"""
MN-CCORE Lab Hub — Inspection Scanner
======================================

Scans git diffs (or the full codebase) for interactive patterns in TSX/TS files,
cross-references against tests/feature-registry.json, and reports:
  - NEW features found in the diff (not in registry)
  - MODIFIED features (file changed, test may need update)
  - STALE features (test references a file that was deleted/renamed)

Can also generate Playwright test stubs for uncovered features.

Usage:
  python scripts/inspection-scanner.py                    # scan last commit
  python scripts/inspection-scanner.py --commits 5        # scan last 5 commits
  python scripts/inspection-scanner.py --full             # scan entire codebase
  python scripts/inspection-scanner.py --generate-stubs   # output test stubs
  python scripts/inspection-scanner.py --update-registry  # update registry with findings
"""

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# ── Configuration ───────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = PROJECT_ROOT / "tests" / "feature-registry.json"
SRC_DIR = PROJECT_ROOT / "src"
API_DIR = PROJECT_ROOT / "api"

# Interactive pattern regexes — detect features in TypeScript/TSX
PATTERNS = {
    "click": r"onClick\s*[=({]",
    "submit": r"onSubmit\s*[=({]|handleSubmit",
    "keydown": r"onKeyDown\s*[=({]|addEventListener.*key|useEffect.*key",
    "mutation": r"useMutation|\.mutate\(",
    "query": r"useQuery.*queryKey.*\[",
    "state_toggle": r"useState\s*<?\s*(?:boolean|false|true)",
    "route": r"(?:GET|POST|PUT|DELETE)\s.*(?:'/api/|\"\/api\/)",
    "framer": r"motion\.|AnimatePresence|animate\s*=",
    "localstorage": r"localStorage\.(get|set|remove)Item",
    "clipboard": r"navigator\.clipboard|writeText",
    "aria": r"aria-(?:live|modal|label|describedby)",
    "portal": r"createPortal",
    "hover": r"onMouseEnter|onMouseLeave|:hover",
    "drag": r"useDrag|onDrag|DndContext|useSortable",
    "inline_edit": r"InlineSelect|InlineDatePicker|InlineAssigneePicker",
}

# Map pattern keys to feature types
PATTERN_TYPE_MAP = {
    "click": "click",
    "submit": "form",
    "keydown": "keyboard",
    "mutation": "mutation",
    "query": "api",
    "state_toggle": "toggle",
    "route": "api",
    "framer": "animation",
    "localstorage": "localStorage",
    "clipboard": "copy",
    "aria": "a11y",
    "portal": "click",
    "hover": "hover",
    "drag": "drag",
    "inline_edit": "inline-edit",
}


# ── Helpers ─────────────────────────────────────────────────────────

def run_git(args: list[str], cwd: Path = PROJECT_ROOT) -> str:
    """Run a git command and return stdout. Returns empty string on error."""
    try:
        result = subprocess.run(
            ["git"] + args,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(cwd),
        )
        return result.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        print(f"  [WARN] git command failed: {e}", file=sys.stderr)
        return ""


def load_registry() -> dict:
    """Load the feature registry JSON file."""
    if not REGISTRY_PATH.exists():
        print(f"  [WARN] Registry not found at {REGISTRY_PATH}", file=sys.stderr)
        return {"version": 1, "features": [], "uncovered": [], "summary": {}}
    try:
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"  [WARN] Failed to load registry: {e}", file=sys.stderr)
        return {"version": 1, "features": [], "uncovered": [], "summary": {}}


def save_registry(registry: dict) -> None:
    """Save the feature registry JSON file."""
    registry["last_scanned"] = datetime.now().isoformat()
    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
    print(f"  Registry saved to {REGISTRY_PATH}")


def is_source_file(path: str) -> bool:
    """Check if a path is a TSX/TS source file in src/ or api/."""
    return (
        (path.startswith("src/") or path.startswith("api/"))
        and (path.endswith(".tsx") or path.endswith(".ts"))
        and "node_modules" not in path
        and ".d.ts" not in path
    )


def file_exists(relpath: str) -> bool:
    """Check if a file exists relative to project root."""
    return (PROJECT_ROOT / relpath).exists()


# ── Pattern Detection ───────────────────────────────────────────────

def detect_patterns_in_content(content: str, filepath: str) -> list[dict]:
    """Detect interactive patterns in file content. Returns list of findings."""
    findings = []
    seen = set()

    for pattern_name, regex in PATTERNS.items():
        matches = list(re.finditer(regex, content))
        if matches:
            # Deduplicate: one finding per pattern per file
            key = f"{filepath}:{pattern_name}"
            if key in seen:
                continue
            seen.add(key)

            # Get line number of first match
            line_num = content[:matches[0].start()].count("\n") + 1
            match_text = matches[0].group(0).strip()[:60]

            findings.append({
                "filepath": filepath,
                "pattern": pattern_name,
                "type": PATTERN_TYPE_MAP.get(pattern_name, "click"),
                "match": match_text,
                "line": line_num,
                "count": len(matches),
            })

    return findings


def detect_patterns_in_file(filepath: str) -> list[dict]:
    """Read a file and detect interactive patterns."""
    full_path = PROJECT_ROOT / filepath
    if not full_path.exists():
        return []
    try:
        content = full_path.read_text(encoding="utf-8", errors="replace")
        return detect_patterns_in_content(content, filepath)
    except OSError:
        return []


# ── Diff Parsing ────────────────────────────────────────────────────

def get_changed_files(commits: int = 1) -> dict[str, str]:
    """Get files changed in the last N commits.

    Returns dict of {filepath: change_type} where change_type is A/M/D/R.
    """
    output = run_git(["diff", f"HEAD~{commits}", "--name-status"])
    if not output:
        # Fallback: try diff against HEAD~1
        output = run_git(["diff", "HEAD~1", "--name-status"])

    changes = {}
    for line in output.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) >= 2:
            change_type = parts[0][0]  # First char: A, M, D, R
            filepath = parts[-1]  # Last part is always the current path
            if is_source_file(filepath):
                changes[filepath] = change_type

    return changes


def get_diff_content(commits: int = 1) -> str:
    """Get the actual diff content for added/modified lines."""
    return run_git(["diff", f"HEAD~{commits}", "--unified=0"])


def get_new_patterns_from_diff(commits: int = 1) -> list[dict]:
    """Parse git diff to find NEW interactive patterns in added lines."""
    diff_output = get_diff_content(commits)
    if not diff_output:
        return []

    findings = []
    current_file = None

    for line in diff_output.split("\n"):
        # Track which file we're in
        if line.startswith("diff --git"):
            match = re.search(r"b/(.+)$", line)
            if match and is_source_file(match.group(1)):
                current_file = match.group(1)
            else:
                current_file = None
            continue

        # Only look at added lines (not removed)
        if current_file and line.startswith("+") and not line.startswith("+++"):
            added_content = line[1:]  # Strip the + prefix
            for pattern_name, regex in PATTERNS.items():
                if re.search(regex, added_content):
                    findings.append({
                        "filepath": current_file,
                        "pattern": pattern_name,
                        "type": PATTERN_TYPE_MAP.get(pattern_name, "click"),
                        "match": added_content.strip()[:80],
                        "line": 0,  # Line number from diff context not trivially available
                        "count": 1,
                        "source": "diff",
                    })

    return findings


def get_all_source_files() -> list[str]:
    """Get all TSX/TS source files in src/ and api/."""
    files = []
    for dir_path in [SRC_DIR, API_DIR]:
        if not dir_path.exists():
            continue
        for root, _dirs, filenames in os.walk(dir_path):
            for fname in filenames:
                if fname.endswith((".tsx", ".ts")) and not fname.endswith(".d.ts"):
                    rel = os.path.relpath(os.path.join(root, fname), PROJECT_ROOT)
                    files.append(rel.replace("\\", "/"))
    return sorted(files)


# ── Cross-Reference with Registry ──────────────────────────────────

def cross_reference(findings: list[dict], registry: dict) -> dict:
    """Cross-reference findings against the registry.

    Returns:
      {
        'new': [features found but not in registry],
        'modified': [features in registry whose file was changed],
        'stale': [registry features whose file no longer exists],
      }
    """
    # Build index of registry entries by component path
    registry_by_component = defaultdict(list)
    registry_by_id = {}
    for feat in registry.get("features", []):
        comp = feat.get("component", "")
        registry_by_component[comp].append(feat)
        registry_by_id[feat["id"]] = feat

    # Build set of all known patterns per file from registry
    known_patterns = set()
    for feat in registry.get("features", []):
        comp = feat.get("component", "")
        ftype = feat.get("type", "")
        known_patterns.add(f"{comp}:{ftype}")

    result = {"new": [], "modified": [], "stale": []}

    # Find NEW features: in findings but not in registry
    for f in findings:
        key = f"{f['filepath']}:{f['type']}"
        if key not in known_patterns:
            result["new"].append(f)

    # Find MODIFIED features: in registry and file was changed
    changed_files = {f["filepath"] for f in findings}
    for feat in registry.get("features", []):
        comp = feat.get("component", "")
        if comp in changed_files:
            result["modified"].append(feat)

    # Find STALE features: registry references files that don't exist
    for feat in registry.get("features", []):
        comp = feat.get("component", "")
        if comp and not file_exists(comp):
            result["stale"].append(feat)

    return result


# ── Test Stub Generation ────────────────────────────────────────────

def generate_test_stub(feature: dict) -> str:
    """Generate a Playwright test stub for an uncovered feature."""
    ftype = feature.get("type", feature.get("pattern", "click"))
    filepath = feature.get("filepath", feature.get("component", "unknown"))
    match = feature.get("match", "")
    desc = feature.get("description", f"{ftype} in {filepath}")

    # Determine a good page to test on
    page_path = "/portal/dashboard"
    if "tasks" in filepath.lower():
        page_path = "/portal/my-tasks"
    elif "project" in filepath.lower():
        page_path = "/portal/projects"
    elif "meeting" in filepath.lower():
        page_path = "/portal/meetings"
    elif "idea" in filepath.lower():
        page_path = "/portal/ideas"
    elif "decision" in filepath.lower():
        page_path = "/portal/decisions"
    elif "digest" in filepath.lower():
        page_path = "/portal/digest"
    elif "calendar" in filepath.lower():
        page_path = "/portal/calendar"
    elif "setting" in filepath.lower():
        page_path = "/portal/settings"
    elif "grant" in filepath.lower():
        page_path = "/portal/grants"
    elif "publication" in filepath.lower():
        page_path = "/publications"
    elif "search" in filepath.lower():
        page_path = "/portal/search"
    elif "pb" in filepath.lower() or "sector" in filepath.lower():
        page_path = "/portal/pb"

    if ftype == "api":
        return f"""  test('API: {desc}', async ({{ request }}) => {{
    // TODO: Replace endpoint with actual path from {filepath}
    const res = await request.get(`${{BASE}}/api/ENDPOINT`)
    expect([200, 404]).toContain(res.status())
  }})
"""

    if ftype == "mutation":
        return f"""  test('MUTATION: {desc}', async ({{ request }}) => {{
    // TODO: Implement mutation test for {filepath}
    // Pattern found: {match}
    const res = await request.post(`${{BASE}}/api/ENDPOINT`, {{
      data: {{ /* TODO */ }}
    }})
    expect([200, 201]).toContain(res.status())
  }})
"""

    if ftype == "keyboard":
        return f"""  test('KEYBOARD: {desc}', async ({{ page }}) => {{
    await go(page, '{page_path}')
    // TODO: Press the correct key sequence
    // Pattern found: {match}
    await page.keyboard.press('KEY')
    await page.waitForTimeout(500)
    await page.screenshot({{ path: 'review/stub-{filepath.replace("/", "-").replace(".tsx", "")}.png' }})
  }})
"""

    if ftype in ("form", "inline-edit"):
        return f"""  test('FORM: {desc}', async ({{ page }}) => {{
    await go(page, '{page_path}')
    // TODO: Fill form fields and submit
    // Component: {filepath}
    // Pattern found: {match}
    await page.screenshot({{ path: 'review/stub-{filepath.replace("/", "-").replace(".tsx", "")}.png' }})
  }})
"""

    if ftype == "hover":
        return f"""  test('HOVER: {desc}', async ({{ page }}) => {{
    await go(page, '{page_path}')
    const el = page.locator('SELECTOR').first()
    if (await el.isVisible().catch(() => false)) {{
      await el.hover()
      await page.waitForTimeout(300)
      await page.screenshot({{ path: 'review/stub-hover-{filepath.replace("/", "-").replace(".tsx", "")}.png' }})
    }}
  }})
"""

    if ftype == "localStorage":
        return f"""  test('LOCAL_STORAGE: {desc}', async ({{ page }}) => {{
    await go(page, '{page_path}')
    // Verify localStorage key is set after interaction
    // Component: {filepath}
    const stored = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('KEY')))
    console.log('localStorage keys:', stored)
  }})
"""

    if ftype == "animation":
        return f"""  test('ANIMATION: {desc}', async ({{ page }}) => {{
    await go(page, '{page_path}')
    // Verify Framer Motion animation renders
    // Component: {filepath}
    await page.waitForTimeout(1000)
    await page.screenshot({{ path: 'review/stub-anim-{filepath.replace("/", "-").replace(".tsx", "")}.png' }})
  }})
"""

    if ftype == "drag":
        return f"""  test('DRAG: {desc}', async ({{ page }}) => {{
    await go(page, '{page_path}')
    // TODO: Simulate drag-and-drop
    // Component: {filepath}
    const card = page.locator('SELECTOR').first()
    if (await card.isVisible().catch(() => false)) {{
      const box = await card.boundingBox()
      if (box) {{
        await page.mouse.move(box.x + box.width/2, box.y + box.height/2)
        await page.mouse.down()
        await page.mouse.move(box.x + 200, box.y, {{ steps: 10 }})
        await page.mouse.up()
      }}
    }}
  }})
"""

    if ftype == "copy":
        return f"""  test('COPY: {desc}', async ({{ page }}) => {{
    await go(page, '{page_path}')
    // Verify copy button exists and is clickable
    // Component: {filepath}
    const btn = page.locator('button:has-text("Copy")').first()
    const visible = await btn.isVisible().catch(() => false)
    console.log('Copy button visible:', visible)
  }})
"""

    # Default: generic click test
    return f"""  test('CLICK: {desc}', async ({{ page }}) => {{
    await go(page, '{page_path}')
    // TODO: Implement interaction test
    // Component: {filepath}
    // Pattern: {ftype} — {match}
    await page.screenshot({{ path: 'review/stub-{filepath.replace("/", "-").replace(".tsx", "")}.png' }})
  }})
"""


def generate_all_stubs(uncovered_features: list[dict]) -> str:
    """Generate a complete test file with stubs for all uncovered features."""
    stubs = []
    for feat in uncovered_features:
        stubs.append(generate_test_stub(feat))

    header = f"""/**
 * MN-CCORE Lab Hub — Auto-Generated Test Stubs
 *
 * Generated by inspection-scanner.py on {datetime.now().strftime('%Y-%m-%d %H:%M')}
 * {len(uncovered_features)} uncovered features need tests.
 *
 * INSTRUCTIONS:
 * 1. Review each stub and fill in TODO items
 * 2. Move completed tests to the appropriate test file
 * 3. Run: npx playwright test tests/generated-stubs.spec.ts
 */
import {{ test, expect, type Page }} from '@playwright/test'

const BASE = 'https://mn-ccore-lab.pages.dev'

async function go(page: Page, path: string) {{
  const errors: string[] = []
  page.on('pageerror', (err) => {{
    if (!err.message.includes('WebSocket') && !err.message.includes('hub-realtime'))
      errors.push(err.message)
  }})
  await page.goto(`${{BASE}}${{path}}`, {{ waitUntil: 'networkidle', timeout: 15000 }})
  return errors
}}

test.describe('GENERATED — Uncovered Feature Stubs', () => {{
{chr(10).join(stubs)}
}})
"""
    return header


# ── Report Generation ───────────────────────────────────────────────

def print_report(
    new_features: list[dict],
    modified_features: list[dict],
    stale_features: list[dict],
    registry: dict,
) -> None:
    """Print a clean report to stdout."""
    total = registry.get("summary", {}).get("total", 0)
    covered = registry.get("summary", {}).get("covered", 0)
    uncovered_count = registry.get("summary", {}).get("uncovered", 0)
    pct = registry.get("summary", {}).get("coverage_pct", 0)

    print()
    print("=" * 70)
    print("  MN-CCORE Lab Hub — Inspection Scanner Report")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 70)
    print()

    # Registry summary
    print(f"  Registry: {total} features | {covered} covered | {uncovered_count} uncovered | {pct:.1f}% coverage")
    print()

    # NEW features
    if new_features:
        print(f"  NEW FEATURES ({len(new_features)} found in diff, not in registry):")
        print("  " + "-" * 60)
        seen = set()
        for f in new_features:
            key = f"{f['filepath']}:{f['type']}"
            if key in seen:
                continue
            seen.add(key)
            print(f"    [{f['type']:12s}] {f['filepath']}:{f.get('line', '?')}")
            if f.get("match"):
                print(f"                 {f['match'][:70]}")
        print()
    else:
        print("  NEW FEATURES: None found")
        print()

    # MODIFIED features
    if modified_features:
        print(f"  MODIFIED FEATURES ({len(modified_features)} registry entries in changed files):")
        print("  " + "-" * 60)
        seen_files = set()
        for f in modified_features:
            comp = f.get("component", "")
            if comp in seen_files:
                continue
            seen_files.add(comp)
            covered_str = "COVERED" if f.get("covered") else "UNCOVERED"
            print(f"    [{covered_str:10s}] {comp}")
            print(f"                 {f.get('description', '')[:60]}")
        print()
    else:
        print("  MODIFIED FEATURES: None")
        print()

    # STALE features
    if stale_features:
        print(f"  STALE FEATURES ({len(stale_features)} registry entries reference missing files):")
        print("  " + "-" * 60)
        for f in stale_features:
            print(f"    [MISSING] {f.get('component', '')} — {f.get('description', '')[:50]}")
        print()
    else:
        print("  STALE FEATURES: None")
        print()

    # Uncovered from registry
    uncovered_list = registry.get("uncovered", [])
    if uncovered_list:
        print(f"  UNCOVERED IN REGISTRY ({len(uncovered_list)} features without tests):")
        print("  " + "-" * 60)
        for feat_id in uncovered_list[:20]:
            # Find the feature in the registry
            feat = next((f for f in registry.get("features", []) if f["id"] == feat_id), None)
            if feat:
                print(f"    {feat_id:42s} {feat.get('type', ''):12s} {feat.get('component', '')}")
        if len(uncovered_list) > 20:
            print(f"    ... and {len(uncovered_list) - 20} more")
        print()

    print("=" * 70)
    print()


# ── Main ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="MN-CCORE Inspection Scanner — detect untested features"
    )
    parser.add_argument(
        "--commits",
        type=int,
        default=1,
        help="Number of commits to scan back (default: 1)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Scan entire codebase (not just diff)",
    )
    parser.add_argument(
        "--generate-stubs",
        action="store_true",
        help="Generate Playwright test stubs for uncovered features",
    )
    parser.add_argument(
        "--update-registry",
        action="store_true",
        help="Update the registry with newly found features",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Write test stubs to file instead of stdout",
    )
    args = parser.parse_args()

    # Load registry
    registry = load_registry()

    # Scan for patterns
    if args.full:
        print("  Scanning entire codebase...")
        all_files = get_all_source_files()
        findings = []
        for f in all_files:
            findings.extend(detect_patterns_in_file(f))
        print(f"  Found {len(findings)} interactive patterns in {len(all_files)} files")
    else:
        print(f"  Scanning last {args.commits} commit(s)...")
        changed = get_changed_files(args.commits)
        if not changed:
            print("  No source files changed in last commit(s).")
            findings = []
        else:
            print(f"  {len(changed)} source file(s) changed:")
            for fp, ct in sorted(changed.items()):
                print(f"    [{ct}] {fp}")

            # Detect patterns in changed files
            findings = []
            for fp, ct in changed.items():
                if ct != "D":  # Skip deleted files
                    findings.extend(detect_patterns_in_file(fp))

            # Also look at the diff for NEW patterns specifically
            diff_findings = get_new_patterns_from_diff(args.commits)
            findings.extend(diff_findings)
            print(f"  Found {len(findings)} interactive patterns")

    # Cross-reference
    xref = cross_reference(findings, registry)

    # Print report
    print_report(xref["new"], xref["modified"], xref["stale"], registry)

    # Update registry if requested
    if args.update_registry:
        print("  Updating registry...")
        existing_ids = {f["id"] for f in registry.get("features", [])}

        added = 0
        for finding in xref["new"]:
            # Generate an ID
            basename = os.path.basename(finding["filepath"]).replace(".tsx", "").replace(".ts", "")
            feature_id = f"auto-{basename}-{finding['type']}-{finding.get('line', 0)}"

            if feature_id not in existing_ids:
                new_entry = {
                    "id": feature_id,
                    "component": finding["filepath"],
                    "type": finding["type"],
                    "description": f"Auto-detected {finding['pattern']} in {finding['filepath']}",
                    "test_file": None,
                    "test_name": None,
                    "covered": False,
                }
                registry["features"].append(new_entry)
                registry.setdefault("uncovered", []).append(feature_id)
                existing_ids.add(feature_id)
                added += 1

        # Remove stale entries
        removed = 0
        if xref["stale"]:
            stale_ids = {f["id"] for f in xref["stale"]}
            registry["features"] = [
                f for f in registry["features"] if f["id"] not in stale_ids
            ]
            registry["uncovered"] = [
                uid for uid in registry.get("uncovered", []) if uid not in stale_ids
            ]
            removed = len(stale_ids)

        # Recalculate summary
        total = len(registry["features"])
        covered = sum(1 for f in registry["features"] if f.get("covered"))
        uncovered = total - covered
        registry["summary"] = {
            "total": total,
            "covered": covered,
            "uncovered": uncovered,
            "coverage_pct": round(covered / total * 100, 1) if total > 0 else 0,
        }

        save_registry(registry)
        print(f"  Added {added} new entries, removed {removed} stale entries")

    # Generate test stubs if requested
    if args.generate_stubs:
        # Collect uncovered features from registry
        uncovered_feats = [
            f for f in registry.get("features", []) if not f.get("covered")
        ]

        if not uncovered_feats:
            print("  No uncovered features to generate stubs for.")
            return

        stubs_content = generate_all_stubs(uncovered_feats)

        if args.output:
            output_path = Path(args.output)
            output_path.write_text(stubs_content, encoding="utf-8")
            print(f"  Test stubs written to {output_path}")
        else:
            print()
            print("=" * 70)
            print("  GENERATED TEST STUBS")
            print("=" * 70)
            print()
            print(stubs_content)


if __name__ == "__main__":
    main()

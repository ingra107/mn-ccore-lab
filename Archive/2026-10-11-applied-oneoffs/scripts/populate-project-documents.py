#!/usr/bin/env python3
"""Populate project_documents table with folder/URL links from brain.db projects.

Reads brain.db to find primary_folder, box_url, github_url for active projects,
maps them to D1 project IDs, and inserts document links via wrangler D1 SQL.
"""

import sqlite3
import subprocess
import json
import re
import uuid
from urllib.parse import unquote

# ── Slug generation (mirrors sync_d1_push.py logic) ──

SLUG_REMAP = {
    "clif-p1-gender-disparities-ltv": "p1-gender-disparities-low-tidal-volume",
    "clif-p2-volume-vs-pressure-control-mortality": "volume-vs-pressure-control-mortality",
    "clif-p3-hypothermia-rewarming-rates": "hypothermia-rewarming-rates",
    "clif-p4-icu-quality-metrics": "p4-icu-quality-metrics",
    "clif-proning-incidence-severe-arf": "proning-incidence-in-severe-arf",
    "clif-clinical-implications-of-sepsis-definitions": "clinical-implications-of-sepsis-definitions",
    "dnr-provider-variation-mesfin": "dnr-provider-variation",
    "r03-decision-making-styles-of-medical-trainees": "decision-making-survey-gdms",
    "clif-pf-v-sf-oxygenation-severity": "clif-pf-sf",
    "clif-fluid-shortage-all-comers": "fluid-shortage-all-comers",
    "r01-lpv-precision-practice-assistance": "lpv-precision-practice-assistance",
    "pcori-federated-tte-via-clif-hochberg": "pcori-federated-tte-clif-hochberg",
    "clif-iv-fluids-shortage": "iv-fluids-shortage",
    "clif-flame": "flame",
    "mnccore-minnesota-critical-care-outcomes-research-": "mnccore-minnesota-critical-care",
    "clif-lung-cancer-trajectories-graffy": "lung-cancer-trajectories-graffy",
    "clif-ventmode-waterfall-brief-jamia": "clif-ventmode-waterfall-brief",
    "clif-equisedate": "equisedate",
    "r01-provider-confounding-in-observational-causal-i": "provider-confounding-causal-inference",
    "r01-provider-variation-across-clif": "provider-variation-across-clif",
    "ats-2026-oral-critically-ill-outside-the-icu": "2026-oral-critically-ill-outside-the-icu",
    "clif-wbc-temperature-thresholds-for-sepsis": "wbc-temperature-thresholds-for-sepsis",
    "clif-vasopressor-escalation-protocol-lyons": "clif-vasopressor-escalation-lyons",
    "clif-arf-niv-treatment-location-goldfarb": "arf-niv-treatment-location-goldfarb",
    "tignanelli-arpa-h-circle-origin-pancreatitis-cci": "tignanelli-arpa-h-circle-origin",
}

def name_to_slug(name: str) -> str:
    """Generate slug from project name, same as sync_d1_push.py."""
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:50]
    return SLUG_REMAP.get(slug, slug)

def generate_id() -> str:
    """Generate hex ID matching the API's generateId()."""
    return uuid.uuid4().hex

def normalize_folder_url(folder: str) -> str:
    """Convert brain.db primary_folder to a clean, readable path.

    Brain.db stores paths as either:
    - file:///C:/Users/ingra107/Box/... (URL-encoded)
    - C:/Users/ingra107/Box/... (plain path)
    - C:\\Users\\ingra107\\Box\\... (Windows backslash)

    We convert to mnccore:// protocol for local folders.
    """
    if not folder:
        return ""

    # Strip file:/// prefix and decode URL encoding
    path = folder
    if path.startswith("file:///"):
        path = path[8:]  # Remove file:///
    path = unquote(path)  # Decode %20 etc.
    path = path.replace("\\", "/")  # Normalize slashes
    path = path.rstrip("/")

    return path

def folder_to_mnccore_url(folder_path: str) -> str:
    """Convert a local folder path to mnccore:// protocol URL."""
    # mnccore://folder/C:/Users/ingra107/Box/...
    return f"mnccore://folder/{folder_path}"

def run_d1_sql(sql: str) -> list:
    """Execute SQL against D1 via wrangler."""
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "mnccore-lab", "--remote", f"--command={sql}"],
        capture_output=True, text=True, cwd="C:/Users/ingra107/mn-ccore-lab",
        shell=True,
    )
    output = result.stdout + result.stderr
    match = re.search(r'"results":\s*(\[.*?\])', output, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    return []


def main():
    # ── 1. Get D1 project IDs ──
    print("Fetching D1 projects...")
    d1_output = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "mnccore-lab", "--remote",
         "--command=SELECT id, title FROM projects ORDER BY title"],
        capture_output=True, text=True, cwd="C:/Users/ingra107/mn-ccore-lab",
        shell=True,
    )
    d1_text = d1_output.stdout + d1_output.stderr
    match = re.search(r'"results":\s*(\[.*?\])', d1_text, re.DOTALL)
    d1_projects = json.loads(match.group(1))

    # Build title → ID map. Prefer slug-style IDs over hex IDs for duplicates.
    d1_by_title = {}
    for p in d1_projects:
        title = p["title"]
        pid = p["id"]
        is_slug = not re.match(r'^[0-9a-f]{32}$', pid)
        if title not in d1_by_title or is_slug:
            d1_by_title[title] = pid

    print(f"  Found {len(d1_by_title)} unique D1 projects")

    # ── 2. Get brain.db projects with folder data ──
    print("Reading brain.db projects...")
    conn = sqlite3.connect("C:/Users/ingra107/Peripheral-Brain/data/brain.db")
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT id, name, primary_folder, box_url, github_url
        FROM projects
        WHERE status IN ('Active', 'In Review')
        AND (domain IN ('Research', 'Grants') OR domain IS NULL)
        ORDER BY name
    """).fetchall()
    conn.close()

    print(f"  Found {len(rows)} active projects in brain.db")

    # ── 3. Build document links ──
    documents = []
    matched = 0
    unmatched = []

    for row in rows:
        name = row["name"]
        folder = row["primary_folder"]
        box_url = row["box_url"]
        github_url = row["github_url"]

        # Skip projects with no links at all
        if not folder and not box_url and not github_url:
            continue

        # Find D1 project ID by title match
        d1_id = d1_by_title.get(name)
        if not d1_id:
            unmatched.append(name)
            continue

        matched += 1

        # Add primary folder link
        if folder:
            clean_path = normalize_folder_url(folder)
            if clean_path:
                # Determine a good title based on the path
                if "Box/Research" in clean_path:
                    title = "Box Project Folder"
                    doc_type = "folder"
                elif "Peripheral-Brain" in clean_path:
                    title = "PB Project Folder"
                    doc_type = "folder"
                elif "mn-ccore-lab" in clean_path:
                    title = "Repository"
                    doc_type = "link"
                else:
                    title = "Project Folder"
                    doc_type = "folder"

                documents.append({
                    "id": generate_id(),
                    "project_id": d1_id,
                    "title": title,
                    "url": folder_to_mnccore_url(clean_path),
                    "doc_type": doc_type,
                })

        # Add Box URL link
        if box_url and box_url != "None":
            documents.append({
                "id": generate_id(),
                "project_id": d1_id,
                "title": "Box Folder",
                "url": box_url,
                "doc_type": "folder",
            })

        # Add GitHub URL link
        if github_url and github_url != "None":
            documents.append({
                "id": generate_id(),
                "project_id": d1_id,
                "title": "GitHub Repository",
                "url": github_url,
                "doc_type": "link",
            })

    print(f"\n  Matched {matched} projects to D1 IDs")
    if unmatched:
        print(f"  Unmatched ({len(unmatched)}):")
        for u in unmatched:
            print(f"    - {u}")

    print(f"\n  Total document links to insert: {len(documents)}")

    # ── 4. Also add MN-CCORE Lab Hub github link ──
    hub_id = d1_by_title.get("MN-CCORE Lab Hub")
    if hub_id:
        documents.append({
            "id": generate_id(),
            "project_id": hub_id,
            "title": "GitHub Repository",
            "url": "https://github.com/ingra107/mn-ccore-lab",
            "doc_type": "link",
        })
        print("  Added GitHub link for MN-CCORE Lab Hub")

    # ── 5. Insert into D1 ──
    print(f"\nInserting {len(documents)} document links into D1...")

    # Build batch INSERT statements (10 at a time to stay within wrangler limits)
    batch_size = 5
    inserted = 0
    errors = 0

    for i in range(0, len(documents), batch_size):
        batch = documents[i:i+batch_size]
        values = []
        for doc in batch:
            # Escape single quotes in all fields
            title = doc["title"].replace("'", "''")
            url = doc["url"].replace("'", "''")
            doc_type = doc["doc_type"].replace("'", "''")
            project_id = doc["project_id"].replace("'", "''")
            doc_id = doc["id"]
            values.append(
                f"('{doc_id}', '{project_id}', '{title}', '{url}', '{doc_type}', 'nick-ingraham')"
            )

        sql = f"INSERT INTO project_documents (id, project_id, title, url, doc_type, created_by) VALUES {', '.join(values)}"

        result = subprocess.run(
            ["npx", "wrangler", "d1", "execute", "mnccore-lab", "--remote", f"--command={sql}"],
            capture_output=True, text=True, cwd="C:/Users/ingra107/mn-ccore-lab",
            shell=True,
        )

        output = result.stdout + result.stderr
        if '"success": true' in output:
            inserted += len(batch)
            print(f"  Inserted batch {i//batch_size + 1}: {len(batch)} docs")
        else:
            errors += len(batch)
            print(f"  ERROR batch {i//batch_size + 1}: {output[-200:]}")

    print(f"\nDone! Inserted {inserted} document links, {errors} errors")

    # ── 6. Verify ──
    print("\nVerifying...")
    verify_output = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "mnccore-lab", "--remote",
         "--command=SELECT project_id, title, doc_type, url FROM project_documents ORDER BY project_id"],
        capture_output=True, text=True, cwd="C:/Users/ingra107/mn-ccore-lab",
        shell=True,
    )
    verify_text = verify_output.stdout + verify_output.stderr
    match = re.search(r'"results":\s*(\[.*?\])', verify_text, re.DOTALL)
    if match:
        results = json.loads(match.group(1))
        print(f"  Total documents in D1: {len(results)}")
        for r in results:
            print(f"  {r['project_id'][:30]:30s} | {r['doc_type']:8s} | {r['title']}")


if __name__ == "__main__":
    main()

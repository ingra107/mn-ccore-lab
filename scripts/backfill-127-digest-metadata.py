"""#127 -- repair research_digest.journal + pub_date from PubMed itself.

Why: every paper on /portal/digest read "(PUBMED) . Jan 1, 2026". PB's digest
pipeline printed the search engine where the journal belongs and turned a
bare publication YEAR into `<year>-01-01`; measured on prod 2026-09-14,
1678 of 1683 rows carried the fake date. The writers are fixed in PB
(search_papers / generate_digest / sync_d1_digest); this repairs the rows
already written, from the one source that knows the real values.

Emits two SQL files, both enumerating every UPDATE by id:
    scripts/backfill-127-digest-metadata.sql           (apply)
    scripts/backfill-127-digest-metadata.rollback.sql  (exact prior values)
It does NOT execute them. Apply with the sanctioned wrapper:
    scripts/wrangler-d1 d1 execute mnccore-lab --remote --file scripts/backfill-127-digest-metadata.sql

Usage: python scripts/backfill-127-digest-metadata.py [--limit N]
"""
from __future__ import annotations

import argparse
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

HUB = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HUB / "scripts"))
sys.path.insert(0, str(Path.home() / "Peripheral-Brain"))
from wrangler_d1 import run_d1  # noqa: E402
from scripts.research.search_papers import pubmed_pub_date  # noqa: E402  (PB's parser, one copy)

EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
BATCH = 200
OUT = HUB / "scripts" / "backfill-127-digest-metadata.sql"
ROLLBACK = HUB / "scripts" / "backfill-127-digest-metadata.rollback.sql"


def q(v: str | None) -> str:
    return "NULL" if v is None else "'" + v.replace("'", "''") + "'"


def fetch_meta(pmids: list[str]) -> dict[str, tuple[str | None, str | None]]:
    r = requests.get(EFETCH, params={"db": "pubmed", "id": ",".join(pmids), "retmode": "xml"}, timeout=60)
    r.raise_for_status()
    root = ET.fromstring(r.text)
    out: dict[str, tuple[str | None, str | None]] = {}
    for art in root.findall(".//PubmedArticle"):
        pmid = art.findtext(".//MedlineCitation/PMID")
        a = art.find(".//MedlineCitation/Article")
        if not pmid or a is None:
            continue
        journal = (a.findtext("Journal/Title") or "").strip() or None
        out[pmid] = (journal, pubmed_pub_date(a) or None)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    res = run_d1(
        command="SELECT id, pmid, journal, pub_date FROM research_digest WHERE pmid IS NOT NULL ORDER BY id",
        json=True, timeout=300,
    )
    rows = res.json[0]["results"]
    if args.limit:
        rows = rows[: args.limit]
    print(f"{len(rows)} rows with a pmid", file=sys.stderr)

    meta: dict[str, tuple[str | None, str | None]] = {}
    pmids = [r["pmid"] for r in rows]
    for i in range(0, len(pmids), BATCH):
        chunk = pmids[i : i + BATCH]
        meta.update(fetch_meta(chunk))
        print(f"  efetch {i + len(chunk)}/{len(pmids)} -> {len(meta)} resolved", file=sys.stderr)
        time.sleep(0.4)

    apply, undo = [], []
    header = (
        "-- #127: research_digest journal + pub_date repaired from PubMed efetch, "
        f"generated {time.strftime('%Y-%m-%d')} by scripts/backfill-127-digest-metadata.py.\n"
        "-- pub_date keeps PubMed's precision: 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD'.\n"
    )
    unresolved, unchanged = 0, 0
    for r in rows:
        m = meta.get(r["pmid"])
        if not m:
            unresolved += 1
            continue
        journal, pub_date = m
        if journal == r["journal"] and pub_date == r["pub_date"]:
            unchanged += 1
            continue
        apply.append(f"UPDATE research_digest SET journal = {q(journal)}, pub_date = {q(pub_date)} WHERE id = {q(r['id'])};")
        undo.append(f"UPDATE research_digest SET journal = {q(r['journal'])}, pub_date = {q(r['pub_date'])} WHERE id = {q(r['id'])};")

    OUT.write_text(header + "\n".join(apply) + "\n", encoding="utf-8")
    ROLLBACK.write_text(header.replace("repaired from", "ROLLBACK to the values before") + "\n".join(undo) + "\n", encoding="utf-8")
    print(f"{len(apply)} updates, {unchanged} already correct, {unresolved} pmids PubMed did not return", file=sys.stderr)
    print(f"wrote {OUT.name} + {ROLLBACK.name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

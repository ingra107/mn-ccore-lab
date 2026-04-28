# Citations cron — Google Scholar via `scholarly` (stub design)

> **Decision**: D2-followup — `audit/2026-04-28/DECISIONS-RESOLVED.md`.
> **Closes**: LO-1 — `audit/2026-04-28/reports/05-lab-overview.md` (StatsCard.totalCitations was hardcoded `2626`).
>
> **Status**: Hub-side infrastructure shipped (schema v54 + `/api/citations` + `useCitations()` + StatsCard wire). PB-side cron design captured here. Nick implements the cron on the home laptop; this doc is the spec.

## Why scholarly + per-author + weekly

- **Per-author**: each `team_members` row has a `scholar_id` field already. Scholarly fetches the author's profile in one call and returns `citedby` (citation_count) + `hindex`. Aggregating per-publication via Semantic Scholar (the original recommendation) requires a separate call per pub and merges into a noisier surface.
- **Weekly cadence**: citation counts move on roughly that timescale. Daily is wasteful; monthly is too stale for a marquee dashboard tile. Run Monday early morning so the count is fresh for the work week.
- **Home laptop, not Hub server**: scholarly hits Google Scholar, which routinely rate-limits / blocks data-center IPs. Residential IPs (home laptop) work reliably. Hub Workers can't reliably scrape Scholar.

## Schema (already shipped)

`api/schema-v54-team-citations.sql` — three nullable columns on `team_members`:

```sql
ALTER TABLE team_members ADD COLUMN citation_count INTEGER DEFAULT NULL;
ALTER TABLE team_members ADD COLUMN h_index INTEGER DEFAULT NULL;
ALTER TABLE team_members ADD COLUMN last_scholar_refresh TIMESTAMP DEFAULT NULL;
```

Deploy via:
```bash
npx wrangler d1 execute mnccore-lab --remote --file=api/schema-v54-team-citations.sql
```

## Hub endpoints

### Read (already shipped)

`GET /api/citations`:
```json
{
  "data": {
    "total": 2842,                          // SUM(citation_count)
    "last_refresh": "2026-04-28T07:14:33Z", // MAX(last_scholar_refresh)
    "members_with_data": 14,                // COUNT WHERE citation_count IS NOT NULL
    "members_total": 19                     // total team rows
  }
}
```

Edge-cached 1h. Public — no auth required (matches `/api/team`, `/api/stats`).

### Write (extended in same PR)

`PUT /api/team/:slug` accepts the citation fields ONLY when authenticated via `Bearer PB_API_KEY` (X-API-Key path):

```json
{
  "citation_count": 312,
  "h_index": 8,
  "last_scholar_refresh": "2026-04-28T07:14:33Z"
}
```

Request:
```http
PUT /api/team/nick-ingraham HTTP/1.1
Authorization: Bearer <PB_API_KEY>
Content-Type: application/json

{ "citation_count": 312, "h_index": 8, "last_scholar_refresh": "2026-04-28T07:14:33Z" }
```

Browser users (CF Access JWT) can NOT write these fields — even PI gets a 403 if they try. Citations are mechanical / cron-only data.

## Cron design

### Where

Home laptop, alongside other PB scheduled scripts (e.g. `scripts/scheduled/meeting_automation.py`). Pick a path like `scripts/scheduled/citations_refresh.py`.

### Schedule

Weekly on Monday, ~6am CT (after sync windows but before the workday). Use existing PB scheduler infrastructure — don't roll a new one. Add to whatever drives the other weekly jobs.

### Loop

```python
#!/usr/bin/env python3
"""
Weekly cron: fetch Google Scholar profile for every team member with a
scholar_id and write citation_count + h_index back to the Hub via the
PB-API-key path on PUT /api/team/:slug.

Reads team roster from D1 (NOT brain.db — citations are Hub-only,
deliberately not mirrored to brain.db per shared-schema-registry).
"""
import os
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from scholarly import scholarly  # pip install scholarly

HUB_BASE = "https://mn-ccore-lab.pages.dev"
PB_API_KEY = os.environ["PB_API_KEY"]  # same secret used by hub_ai_listener.py
HEADERS = {
    "Authorization": f"Bearer {PB_API_KEY}",
    "Content-Type": "application/json",
}

THROTTLE_SECONDS = 30  # be polite to Scholar; 19 members × 30s ≈ 10min total


def list_team_with_scholar() -> list[dict]:
    """Pull team_members slugs + scholar_ids from the Hub."""
    r = requests.get(f"{HUB_BASE}/api/team", timeout=15)
    r.raise_for_status()
    return [m for m in r.json()["data"] if m.get("scholar_id")]


def fetch_scholar(scholar_id: str) -> Optional[dict]:
    """Return {citation_count, h_index} or None on failure."""
    try:
        author = scholarly.search_author_id(scholar_id)
        # `fill` populates indices; without it we'd only have a stub.
        author = scholarly.fill(author, sections=["indices"])
        return {
            "citation_count": int(author.get("citedby", 0)),
            "h_index": int(author.get("hindex", 0)),
        }
    except Exception as e:
        print(f"  ! scholarly failed for {scholar_id}: {e}")
        return None


def push_to_hub(slug: str, payload: dict) -> bool:
    """PUT citation fields back. Returns True on 2xx."""
    body = {
        **payload,
        "last_scholar_refresh": datetime.now(timezone.utc).isoformat(),
    }
    r = requests.put(
        f"{HUB_BASE}/api/team/{slug}",
        json=body,
        headers=HEADERS,
        timeout=15,
    )
    if r.ok:
        return True
    print(f"  ! Hub PUT failed for {slug}: {r.status_code} {r.text[:200]}")
    return False


def main() -> None:
    members = list_team_with_scholar()
    print(f"Refreshing citations for {len(members)} members…")
    ok = fail = 0
    for m in members:
        slug = m["slug"]
        sid = m["scholar_id"]
        print(f"  {slug} ({sid})")
        result = fetch_scholar(sid)
        if not result:
            fail += 1
            continue
        if push_to_hub(slug, result):
            ok += 1
        else:
            fail += 1
        time.sleep(THROTTLE_SECONDS)
    print(f"Done. ok={ok} fail={fail}")


if __name__ == "__main__":
    main()
```

## Failure modes + fallbacks

### Scholar blocks the IP

Scholar occasionally returns CAPTCHA pages or 429s. `scholarly` raises on these. Mitigations, in order of escalation:

1. **Lower frequency**: weekly is already conservative; bump to fortnightly if blocks recur.
2. **Throttle harder**: increase `THROTTLE_SECONDS` from 30 → 60 → 120 (lab is small, total run-time still bounded).
3. **Proxy rotation**: scholarly supports `ProxyGenerator` with `FreeProxies` or `ScraperAPI`. Library docs: <https://scholarly.readthedocs.io/en/stable/quickstart.html#using-proxies>.
4. **Stale-warning chip**: the StatsCard already renders an "Updated N weeks ago" subtitle when `last_refresh > 14d`. If the cron is dead, the dashboard surfaces it. No silent rot.

### `scholar_id` is wrong / outdated

`scholarly.search_author_id` returns 404-ish (raises `MaxTriesExceededException`). Cron logs the failure + moves on. The author's `citation_count` stays at its last-known value. Nick can fix `scholar_id` on `/portal/profile`.

### Single bad row blocks the run

The loop catches per-author exceptions (`except Exception`) and continues. One failure doesn't poison the rest.

## What this doc does NOT cover

- The cron is **not** implemented in this PR. This doc is the spec; Nick wires it up on the PB side using existing scheduler infrastructure.
- brain.db does **not** mirror citation_count / h_index / last_scholar_refresh. Decision: citations are a Hub-only read-side concern, not a sync-shared field. `enums.py` and `shared-schema-registry.md` do not need updates.
- `scholarly` is a third-party scraper of `scholar.google.com`. Google does not publish a stable API for this. If/when scholarly breaks, fallback options include OpenAlex (`https://api.openalex.org/authors/{orcid}`) or Semantic Scholar Author endpoint.

## File audit checklist (Nick when implementing)

- [ ] Confirm `PB_API_KEY` secret is set on home laptop env.
- [ ] Add `scholarly` to PB Python env: `pip install scholarly`.
- [ ] Create `scripts/scheduled/citations_refresh.py` per loop above.
- [ ] Schedule weekly Monday 6am CT (use existing scheduler hook).
- [ ] First run: invoke manually, confirm `team_members` rows update + dashboard tile reads non-zero.
- [ ] After 14d: confirm "Updated N weeks ago" subtitle DOES NOT appear (cron is current).
- [ ] After 14d of artificial pause: confirm subtitle DOES appear (stale signal works).

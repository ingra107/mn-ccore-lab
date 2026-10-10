# ▶▶ BUG SWEEP #133–#136 — ALL FOUR SHIPPED + DEPLOYED, plus two self-inflicted data defects found, repaired and gated (2026-09-22, work laptop). Live = `21975872` (probe PASS). Bug queue EMPTY; GitHub #133–#136 closed. **Schema v112**, **routes 271** (unchanged), PB 2 commits. Gates: 1403 api · 305 lib · 188 src · eslint 0 errors.

<!-- content-shrink-exempt -->

**6 Hub commits** `c48dc2f0` (#135) · `e888059d` (#134) · `ca36d664` (#133) · `da0cab19` (#136 pipeline) · `21975872` (#136 upsert hardening + repair SQL). **2 PB commits** `1bdc7e1`-era (sync_d1_digest: summary/significance/abstract + attach_abstracts, decision doc) · `4fb1c15d3` (restore_digest_summaries.py).

## What shipped

- **#135** `dueLabelCompact` dropped the `'Tom'` branch; tomorrow reads `1d` like every other future day.
- **#134** Dashboard grid split 3×3 per cell (`GRID_SCALE`, `src/lib/dashboardLayout.ts`): 12 cols at lg, row height rebalanced so an untouched dashboard is **pixel-identical**, 10 width steps per row instead of 4. `minW`/`minH` pinned at `GRID_SCALE` so nothing can get smaller than before. Saved layouts moved to a `-v2` localStorage key; a `-v1` layout is scaled up on load, not reflowed.
- **#133** New `AuthorColumn` (CLAUDE.md rule 89) renders the byline as PEOPLE: lab members get their photo + a link to `/team/:slug`, everyone else a flat silhouette. Verified on prod. **`AuthorAvatarStack` and `resolveLabCoAuthors` are DELETED** — the stack was aria-hidden, unclickable, and showed only lab members, so nothing stood out FROM anything.
- **#136** `research_digest` gained `summary` + `significance` (schema-v112, rule 88). PB's Digest.md has always written an LLM TLDR and a "Why This Matters"; the sync pushed the TLDR into `abstract` and dropped the other, so "Show abstract" opened a one-liner under a label promising the abstract and no summary rendered. Abstracts now come from PubMed by pmid (section labels preserved). Processed papers SINK on `/portal/digest` (`PROCESS_RANK`) with a filed rail + chip.

## Landmines added this session

- **`POST /api/digest` has three column classes and every clause is load-bearing** — pinned by `api/routes/digest.upsert.test.ts`, which asserts against the SQL STRING. Reader state (`status`, `saved_by`) never appears in `DO UPDATE`. `digest_date` keeps the STORED value. Every paper fact is `COALESCE(excluded.x, research_digest.x)`; `relevance_score` is `MAX`. Deleting any guard fails the suite. **I learned the last two the hard way (see below) — do not "simplify" them.**
- **`GET /api/digest` caps `limit` at 300 and sorts by `relevance_score DESC`.** A paper with no summary scores 0.3 and sorts LAST, so a flat unpaged call returns exactly the set that is missing nothing. Walk `digest/dates` one date at a time (`scripts/db/restore_digest_summaries.py` does).
- **A paper below `relevance_score >= 0.5` is deliberately withheld from D1** by `sync_d1_digest.py`, and a paper scores 0.3 precisely when it has no TLDR yet. `run_daily.py` generates the digest (STEP 2) BEFORE the summaries (STEP 3), so a newly found paper is always one cycle behind — the score gate is what hides that from the Hub. **`--all` bypasses the gate**; that is how 16 unsummarized papers reached prod.
- **`Research/Digest/` is gitignored and does NOT travel between machines.** Work had 19 `summaries-*.json`; home had 129. Any recovery that reads them must run on both.

## Two defects I shipped and repaired — read before touching the digest upsert

The corrective `--all` re-push ran against the FIRST version of my upsert, which wrote every column from the request body.

1. **`digest_date` collapsed.** PB's `Digest.md` is a ROLLING document whose frontmatter carries only the date it was last generated — and the daily pipeline regenerated it at 09:28 that morning, mid-session. The push stamped **1065 papers** with `2026-09-22` and flattened the date selector's history. Repaired from `created_at` (never in the update clause): `scripts/repair-136-digest-dates.sql`, **1037 rows**, distribution verified restored.
2. **58 summaries erased.** `generate_digest.load_summaries()` merges only the `summaries-*.json` files STILL ON DISK, so older papers whose files were pruned regenerate with no TLDR — those summaries were already fated to vanish from the markdown, and D1 was the last copy. Recovery: **4 from work + 51 from home** (via the cross-machine relay) = 55 of 58. **3 are permanently gone** (pmids 42208465, 42178817, 42189148, all digest_date 2026-06-27).

Final D1 state: 1773 papers, 19 without a summary = 3 permanently lost + **16 that never had one** (the sub-threshold papers `--all` leaked; they self-heal on the next pipeline cycle through the COALESCE upsert).

## Things I checked that turned out NOT to be problems

- **"Only 43 of 1028 papers have a Why This Matters" was a bad measurement.** That counted a rolling markdown file dominated by entries written before the field existed. Grouped by date: **since 2026-09-14, 80 of 80 summarized papers carry one — 100%.** The summarizer prompt in PB `run_daily.py` needs no change. Read a time series, not a total.
- The 16 unsummarized papers are not a pipeline failure; see the landmine above.

## Next steps

- Nothing blocking. The 16 sub-threshold papers should gain summaries on the next `research-digest` run — confirm `SELECT SUM(CASE WHEN summary IS NULL THEN 1 ELSE 0 END) FROM research_digest` falls from 19 toward 3.
- OPTIONAL, needs Nick's call: reorder `run_daily.py` to search → summarize → digest, so a newly found paper is not unsummarized in Obsidian for a cycle. Behavioural change to the overnight pipeline on the home machine.

## Don't-forget

- Prod D1 **DDL** (`d1 execute --file`) is DENIED by the auto-mode classifier; Nick ran schema-v112 himself via `!`. A plain `--command` UPDATE went through. Budget for that in any migration session.
- The cross-machine relay works for this and I should reach for it sooner. **Tell the peer explicitly to run in the FOREGROUND and paste the output** — home's first reply backgrounded the script and returned "I'll report the results once it completes", which the relay has no second delivery for. Cost 25 minutes.


---

Older entries (2026-06-09 through 2026-09-16) moved verbatim to `docs/archived/SESSION-HANDOFF-through-2026-09-21.md`. Pointers elsewhere that cite an older handoff section (CHANGELOG gap notice, WORKPLAN "OPEN THREAD", the stale-chunk runbook) resolve there.

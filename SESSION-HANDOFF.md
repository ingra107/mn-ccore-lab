# ▶▶ 2026-10-26 (work): BUG SWEEP #150-#155 + WHAT'S NEW / LAB PULSE (#156). **Schema v148.** **Routes 271.**

## Shipped
- #150 segmented control: active segment lost its inner outline (`d5c3a5ec`). #151 a project page opens from its `proj_*` id and rewrites to the slug (`13830c6b`). #153 "Show more" + Reply on one line, fade on the clipped line (`dd6a9324`). #154 quick-add textarea text transparent over the token mirror (`32274ec9`). #152 My Tasks folds Needs you with Today's flag (`cc0d52da`). #155 meeting card caret folds its action rows; header reads "N yours open · X of Y done" (`52e8fee8`). All deployed `52e8fee8`.
- **#156 What's new / Lab pulse pill** replaces `PhaseReleaseBanner` (deleted). Spec `docs/superpowers/specs/2026-10-26-whats-new-lab-pulse-design.md`, plan `docs/superpowers/plans/2026-10-26-whats-new-lab-pulse.md`. Tables `hub_releases` (draft -> approved | discarded, ONE draft by partial unique index, drafts hidden from non-PI by TABLE_SCOPE) + `hub_announcements`. Routes `GET /api/pulse`, `POST /api/releases` (API key: probe / intake), `POST /api/releases/:id` (key edits; approve/discard = `personPi`), `POST /api/announcements[/:id/delete]` (`personPi`).

## Landmines added
- **Every deploy now ends with `postdeploy:release-draft`.** Write the draft's title + blurbs (`POST /api/releases/<id> {"action":"edit","title":...,"blurbs":[{"lead","text"}]}`) before you stop. It warns, never fails the deploy; it skips when the last release is not in this clone's history.
- **Approve must carry `reviewed: {commitTo, title, blurbs}`**; a deploy or edit since then gets 409 `changed_since_review`. The API key and the TEST_MODE_KEY identity can never approve (personPi).
- **Lab-wide counts are a Rule 90 exemption**: only `pulseCountsFrom(c.get('unscopedDb'))` on GET /api/pulse, pinned in `api/health-unscoped.test.ts`. Wins rows stay viewer-scoped.
- Pill seen state = `user_prefs` `hub.pulse.seen`, marked per TAB (release on What's new, announcement on Lab pulse). Ids are ULIDs; seen only moves forward.

## Open
- `tests/local/journeys/today-meeting-actions.spec.ts` step 5 fails on fixture drift (project picker lists only "Project ~ Product" pairs for a project with products); pre-existing.
- Deferred minors (#156 review): pulse counts full-scan via datetime() and refetch on every lab write; Discard stays armed for the card's life. GrantGantt touch test flaked once under the full src run.

---

# ▶▶ 2026-10-23 (work): BUG QUEUE EMPTY + LIVE SWEEP CLEAN. main `1ac8d675` live (probe PASS). **Schema v147.** **Routes 266.**

## What shipped (all deployed)
- **#148** bulk Due date = the shared `InlineDatePicker` on My Tasks (`67fc56d3`) and on the shared `BulkActionToolbar` (Deadlines, project pages; `de65395d`, bulk action `snooze` became `due`). Selection stays open so `+7d` keeps stepping.
- **#149** Needs you: "N snoozed" opens the snoozed list (answerable, Bring back now); 1-day snooze reads "For today" (`5550f69b`).
- Dropdowns placed before paint, no top-left first frame (`usePortalDropdown` layout effect, `faeec0ea`).
- My Tasks: only-done list reads "All caught up" (`69e82c5f`); Digest count line names its day (`7326240c`).
- **Ask the Lab retired** (Nick waived the 24h dogfood): menus (`40a50450`), page + 6 routes + hooks (`d3749ac7`; `/portal/ask` redirects to Today), schema-v147 drops `lab_questions`/`lab_answers` on test + prod (`57f1ec47`; the one row is quoted in the migration header, Time Travel bookmark in the PB decision doc). Branch `retire-ask-the-lab` deleted.
- **Meetings default list** (`31ce6fe7`, `1ac8d675`): Upcoming strip with Prep links (today's meeting with nothing written leads it), then past meetings with content (page opens on the latest), empty past meetings behind a toggle. Search and the other tabs still list everything. `src/lib/meetingList.ts`.
- Local dev: Meetings and team list read real data, not the demo initialData (`initialDataUpdatedAt: 0` in DEV).
- Grants dates use the shared picker; picker gained year jumps « » and Shift+PageUp/Down (`8ebeff36`).
- Keyed toasts: `showUndo/showSuccess(..., key)` replace instead of stacking; a replaced Undo chains back to the first state (`61c6c6c5`). ⌘K Backlog Wave failure is an error toast (`1a603398`).
- **Deploy gate `predeploy:submodules`** (`b7eb372b`): the `pb-schema/` checkout sat at 0.19.0 while main recorded 0.20.0, so deploys shipped a `links` field list without `kind`. Gate fails on any submodule off its recorded commit.
- Six older queue rows (#137 #138 #143 #144 #146 #147) were already fixed at HEAD; resolved after a live re-check.

## Landmines added
- **`pb-schema/` is read at BUILD time** (mutations.ts imports TABLE_FIELDS from the checkout). Run `git submodule update` after any pull; the deploy gate now refuses a stale one.
- **Keyed toast Undo chains**: a replaced Undo runs newest-first then earlier ones. Only use a key when successive toasts are steps of one action.
- Bulk `onBulkAction('due', date | '')` replaced `'snooze'`; `''` clears.

## Open
- None.

---

# ▶▶ 2026-10-10 (work): SITE AUDIT + ERROR LEDGER LIVE. main `efc09ad3`, Worker `1cfeeec8`, every Pages probe PASS. **Schema v123** (`hub_errors`, applied test + prod). **Routes 268.**

Full record: PB `Projects/peripheral-brain-system/SESSION-HANDOFF.md`, top section dated 2026-10-10.

- **Touch targets:** the phone/touch `button:not(...)` 44px floor is GONE. Tap targets are opt-in: `.touch-tall`, plus `.hit-area` `::before`. Do not bring back a blanket min-height on buttons.
- **Virtualizers:** every `useVirtualizer` must measure its rows (`measureElement` + `data-index`). `src/lib/__tests__/virtualizerMeasures.test.ts` fails the lib suite otherwise.
- **Overdue labels:** "Nd overdue" everywhere and the compact "Nd" in tight rows. A done item is never overdue: `isOverdue(due, status, done)`, and `InlineDatePicker` takes a `done` prop.
- **Production errors:** prod 500s are sanitized unless the request proved `X-Test-Mode-Key` (`testKeyVerified`). `TEST_MODE_KEY` IS set on prod, on purpose.
- **Error ledger:** every Hub error lands in `hub_errors`, which no member handle can read. Weekly count: `GET /api/hub-errors/weekly` (PB key). Runbook: `docs/OBSERVABILITY.md`.
- **Live-site checks:** headless real-data checks of the live site work through `tests/helpers/capture-auth.ts` (CF Access service token).
- **Open rows:** PB backlog #8965-#8975.

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

Older entries (2026-05-15 through 2026-09-16) moved verbatim to `docs/archived/SESSION-HANDOFF-through-2026-09-21.md`. Pointers elsewhere that cite an older handoff section (CHANGELOG gap notice, WORKPLAN "OPEN THREAD", the stale-chunk runbook) resolve there.

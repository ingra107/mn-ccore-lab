# SearchPage Deep Audit — `/portal/search`

**Date**: 2026-04-28
**Agent ID**: `ad3cda758d0e83d59`
**Files reviewed**: `src/pages/portal/SearchPage.tsx` (340 lines), `api/routes/search.ts` (398 lines)

## 1. Executive read

- **The pipe is roomier than the surface.** The backend earnestly fans out across 14 tables (`api/routes/search.ts:78-133`) and applies a thoughtful three-factor score (TYPE_PRIORITY + recencyBoost + titleMatchBonus + per-type modifiers like `TASK_STATUS_BOOST` and the "completed action item" penalty at `:337`). The frontend only renders that signal as flat grouped lists with no snippet, no highlight, no dates, and no relevance hint. The retrieval quality is invisible to the user — the UI is leaving most of the backend's value on the floor.
- **It's a "find a thing by title" surface, not a "search across the lab" surface.** Despite Rule 51's promise of 14 entities, the page gives every type identical visual weight, no match preview from the body content (where most of the LIKE matches actually live for comments / notes / decisions / publications abstracts), no people/scope/date filters, and no second-pass refinement. With the team at ~19 people across 71 projects and 647 tasks, a query like `mortality` will return a wall of 50 items grouped by type and the user will scroll. That's a 2018 search experience.
- **Cmd+K is doing more useful work than `/portal/search` is.** The dedicated Search page should be the heavyweight refinement surface — saved searches, scope toggles, date filters, content snippets, "show more from this project" — and currently it's just Cmd+K with extra padding. Rule 60's "view picker = shape of this page" sensibility should land here too: maybe a Mixed view (current), a Per-Type view (drilldown), and a Timeline view (chronological across types). Today it's only the first.

## 2. Surface-by-surface walkthrough

### Search input (`SearchPage.tsx:139-161`)

What's good: autofocus on mount (`:82`), visible left search icon + right clear button, debounce 300ms (`:69-72`), `staleTime: 30s` cache hit on re-typed queries (`:93`), focus ring via `--focus-ring` token (`:149`).

What's missing or sloppy:
- **Not sticky.** The input scrolls away with the page. For a 50-result list a user scrolls into the second half and cannot refine without scrolling back up. Compare against the chip row which IS `sticky top-0 z-10` (`:249`) — so the chips stay but the input doesn't. That's backwards: chips depend on the query staying visible.
- **No keyboard shortcut signal.** Cmd+K opens the palette globally; Cmd+/ or `/` could focus this input from anywhere. Right now you have to Tab to the input or click. No `<kbd>` hint inside the placeholder area.
- **Placeholder lies.** "Search tasks, projects, meetings, ideas..." undersells the 14-type coverage. A user searching "mortality" assumes their decision log entry won't surface — it does, but there's nothing telling them so.
- **Min-query of 2 chars is silent.** `enabled: debouncedQuery.length >= 2` (`:92`). Type one char → nothing happens, no message, no suggestion. A "type at least 2 characters" hint inside the empty result region would close the gap.
- **No special-char handling.** `@nick`, `#mortality`, `/clif-2025` are advertised as syntax (`:192-194`) but the backend does a flat `LIKE '%@nick%'` — so `@nick` literally only matches strings containing the at-sign. The "tips" section is aspirational, not implemented. Either implement the prefix dispatch or remove the tips.
- **Clear button at `:153-160` styles `background: 'none'`** which is fine on light theme but the X glyph at `opacity: 0.75` on a teal hover-bg ice input may not hit AA in dark mode. No hover state on the X itself.

### Type filter chips (`SearchPage.tsx:249-284`)

What's good: per-type counts in the chip label, shift-click for multi-select (`:114-119`), the "All (n)" baseline chip (`:250-261`), chip hides when count is 0 (`:264`), color-per-type via `typeConfig.color` (`:273-275`), `${cfg.color}14` (8% alpha) tint for active state — clean visual distinction.

What's wrong:
- **Shift-click multi-select is undiscoverable.** `title="Shift-click for multi-select"` (`:278`) is a hover tooltip — invisible on touch and on keyboard nav. There's no UI affordance for "you can pick more than one." A spec-compliant pattern: chips use cmd/ctrl-click for additive selection (matches OS file-pickers), with a small "Clear filter" link when ≥1 chip is active. Or just multi-select by default like Linear.
- **Chip color tokens drift from Rule 41.** Chips use `var(--teal)`, `var(--gold)`, `var(--maroon)`, `var(--slate)` directly. Per Rule 41 these flip to LIGHT dark-mode variants and white text on those fails ~2:1. Here the chip uses the color as both border AND text on a transparent or near-transparent bg, so it's likely OK for contrast, but the principle should be checked: the active "Tasks" chip in dark mode is `#5cbcb4` text on `#5cbcb414` bg — that's a light teal on a near-black washed teal. Test in dark.
- **Counts are computed off the unfiltered result set (`:130-133`)** which is correct — but the "All" chip count (`:260`) reflects the unfiltered set too, so when you shift-click two types and read "Tasks (12)" / "Projects (8)", the All chip still says (50). That's fine, but the interaction model is fuzzy. A user who filters then can't easily tell "how many results survive my filter" without reading the line below at `:286`.
- **No "Hide done" / "Recent only" / "My stuff" pseudo-filters.** With status_boost penalizing done tasks (`:143`) and recency boost favoring fresh content (`:30-38`), the score does some of this implicitly — but a power user can't say "tasks but only mine" or "only this week." Filter chips are stuck on type and nothing else.
- **Chip wrapping at narrow widths.** With 14 possible types + "All", the row will wrap to 2-3 lines at typical sidebar-occupied widths. No horizontal scroll fallback, no overflow menu. Phones get 4 chips per row at best — clutter.

### Result list (`SearchPage.tsx:290-332`)

What's good: per-type icon in a colored 28×28 chip-square (`:312-314`), `formatBrandName()` on title + subtitle per Rule 11 (`:317`, `:321`), arrow indicator (`:325`), stagger animation entry, subtle hover-shadow (`:309`).

What's broken or thin:
- **No match highlighting.** The plan said "Match highlighting" — not implemented. The user has no visual confirmation of *why* this row matched. Critical for body-only matches: a `task_comment` row whose title is a 100-char content slice (`:283`) shows nothing about which words hit. Implement: wrap matches in `<mark style="background: var(--gold-emphasis)">`, tokenize on whitespace, highlight each query token in title + subtitle.
- **Subtitle is metadata, not a snippet.** For tasks: `assignee · status · priority` (`:148`). For comments: `on ProjectName` (`:217`). The actual content that matched is hidden in `c.content?.slice(0, 100)` shoved into the title (`:215`). When the body is the searchable surface (notes, comments, decisions), the user should see a 2-line excerpt with the matched phrase highlighted, not a metadata row. Right now the comment's title is "Yeah I think we should look at this in the next round of —" cut at 100 chars with no ellipsis.
- **No timestamp on rows.** Backend ships `timestamp` for every row (`:151`, `:168`, etc.) and uses it for tiebreak sort (`:386-388`) but the UI never renders it. "Decision · 3 weeks ago" matters when scanning 50 mixed results — recency is the strongest signal a user has for relevance.
- **No score visibility.** I'm not arguing for raw scores in the UI, but the *grouping* is by type (`:290-332`) which destroys the score sort. The backend returned them ranked top-to-bottom across types; the UI then re-buckets them by type so the top result of the second-priority type sinks below the bottom result of the first-priority type. That defeats the entire scoring system. Either show one mixed flat list (preserving rank) and let the type chips filter, or show "Top results" first then per-type sections. The current shape — chips that filter AND type sections — is two competing organization schemes layered.
- **Rows are 100% the same shape.** A grant with a $500K total cost, a one-line decision, and a 6-month-old task all render as identical 7×7-icon + truncated-title + truncated-subtitle stripes. Per type-specific affordances should land here: tasks → assignee avatar + status pill; meetings → date pill; publications → journal + year + tiny PMID; grants → fiscal year + total cost; decisions → outcome chip.
- **Click navigation is good but inconsistent.** Tasks → `/portal/my-tasks?open=${id}` (`:149`) opens the right drawer in MyTasks list view (per Rule 58), but a user clicking from search probably wants the task in context of *its project*. Ideas → `/portal/ideas` with no query param (`:200`) — no deeplink at all, just dumps you on the index. Files → entity-aware deeplink (`:315-319`) is good, but for `entity_type=meeting` falls through to `/portal/search` (the page you're already on!) which is a dead loop. `Activity → /portal/activity` (`:234`) likewise has no deeplink to the specific activity entry.
- **`<Link>` not opening in new tab on Cmd-click is fine, but** the Cmd-K palette has "Open in new tab" as an explicit gesture (right-click context menu in some apps). SearchPage just relies on browser default `<a>` Cmd-click behavior. Unclear if that works given the row is wrapped in `<motion.div>`.
- **No hover preview / peek.** Per Pattern 3 (Peek → Side Panel → Full Page), search results would benefit from spacebar-peek showing the full record without leaving the search context. Currently click = navigate, no preview.

### Empty states (`SearchPage.tsx:166-230, 239-244`)

What's good: idle state has TWO useful regions — Jump-to (`:166-186`) with 4 hardcoded routes, Search tips (`:188-197`), Recent searches (`:202-230`). EmptyState component for "no matches" (`:240-244`).

What's broken:
- **The "Search tips" claims `@`, `#`, `/` syntax that doesn't exist.** Already noted above. Worse: the backend's `LIKE '%@nick%'` will literally find rows containing the at-sign — so a user types `@nick`, gets 0 results because no string in the corpus has the literal `@nick`, and concludes the whole search is broken.
- **No "Did you mean?" / fuzzy fallback.** A typo of `mortallity` with two l's returns 0 results. The UI says "Try a different keyword" — but a Levenshtein-distance suggestion would close the gap. Alternative: split query into tokens, try each one separately, surface partial matches.
- **No search-history-as-suggestion.** Recent searches only render when the input is *empty* (`:202` guard `!query`). Once the user starts typing, the history disappears even if they're typing a prefix that matches a recent search. Cmd+K has this as a "When you don't have a query, show recents" pattern; SearchPage should at least do "when you have <2 chars, still show recents."
- **Clear-recent button is teeny (9px Trash2 icon at `:213`).** Touch target 16×16ish, fails the 44×44 mobile rule (CLAUDE.md Rule 13 / R12-H mobile audit). On desktop it's fine; mobile fails.
- **Idle-state Jump-to is a 4-item hardcoded list (`:172-185`)** that doesn't reflect the user's actual workflow. The user might never visit Decisions Log; they might spend half their day in Manuscripts or Meetings. This should be either "your top 4 most-visited pages" (LRU per user) or a curated team-default. Currently it's neither — it's a guess.

### Recent searches (`SearchPage.tsx:43-61, 202-230`)

What's good: localStorage-backed (`RECENT_KEY = 'mnccore-recent-searches'`), max 5 enforced (`:56`), dedup before unshift (`:54`), Clear button.

What's wrong:
- **Auto-saved on every debounce.** `useEffect` at `:75-80` saves any query ≥ 2 chars to recent — so a user typing `mortality` will save `mo`, `mor`, `mort`, `morta`, `mortal`, `mortali`, `mortalit`, `mortality` in sequence (debounced, but still — every distinct value on the way to the final). The dedup will drop the previous entries since they're prefixes... wait, `filter(s => s !== q)` is exact-match dedup, so all 8 prefixes survive. Recent searches will be polluted with intermediate strings. **Fix**: only save on Enter, or only save when the user has stopped typing for ≥ 2 seconds, or save only if no further keystrokes follow within a window.
- **No "remove this one" per-chip.** All-or-nothing clear. Three months from now there'll be a stale `_TEST_DELETE_xyz` query in someone's recents from an audit run with no way to remove it without nuking the whole list.
- **Cap of 5 is low.** Linear and Notion default to 10-15. With this team's variety (CLIF, Mesfin, Mentees, etc.) 5 fills up in a single afternoon. Bump to 10.
- **No timestamps on recents.** "Were these from today or three weeks ago?" is invisible.

### Loading + error states (`SearchPage.tsx:233-237`)

`TextSkeleton` with explicit widths. Good. But:
- **No error state.** Lines `:88-90` swallow `!res.ok` into `{ data: [], count: 0 }` and the UI shows the "Nothing matched" empty state. A 500 from the server is indistinguishable from "your query has no matches." The user can't tell if the search is broken or if their query is bad.
- **No "search in progress for query Y" indicator** when a new query supersedes an in-flight request. React Query handles cancellation correctly but the UI just shows the previous result skeleton-overlaid — could add a thin progress bar at top of the result region.

## 3. Findings table

| ID | Severity | Surface | Issue | Fix | Effort |
|----|---------|---------|-------|-----|--------|
| S-01 | High | Result list | No match highlighting on title or subtitle — user can't see which tokens matched | Tokenize query, wrap matches in `<mark>` with `--gold-emphasis` bg, apply to title + subtitle | M |
| S-02 | High | Result list | Per-type grouping destroys cross-type score ranking — top decision sinks below bottom task | Add a "Top results" mixed-list section showing top 10 by score, then per-type sections below | M |
| S-03 | High | Result list | Subtitle is metadata; the matched body text is invisible (especially for notes / comments / decisions) | Render 2-line snippet from matched field with highlighting; backend already has the content | M |
| S-04 | High | Search input | Not sticky — scrolls away when scanning long result lists | Wrap input + chips in `position: sticky; top: 0; background: var(--page-bg)` | S |
| S-05 | High | Recent searches | Auto-saves every prefix on the way to the final query (8 entries from typing "mortality") | Save only on Enter, or after 2s of input idle, with prefix collapse | S |
| S-06 | High | Tips | Advertises `@`, `#`, `/` prefix syntax that doesn't exist in backend | Either implement prefix routing in `handleSearch` or remove the tips block | S/L |
| S-07 | Med | Result row | Tasks deeplink to `/portal/my-tasks?open=${id}` — should open inside source project context | Change task URL to `/portal/projects/${project_slug}?openTask=${id}` when project_id present | S |
| S-08 | Med | Result row | Files with `entity_type=meeting` fall through to `/portal/search` (dead-loop self-link) | Add meeting branch in URL switch (`api/routes/search.ts:315-319`) | XS |
| S-09 | Med | Result row | No timestamp visible — backend has it, UI ignores it | Add `formatRelativeTime(item.timestamp)` as small right-aligned text in subtitle row | S |
| S-10 | Med | Filter chips | Shift-click multi-select is undiscoverable | Add small "shift-click to combine" hint when 1 chip active OR make multi-select default | S |
| S-11 | Med | Filter chips | No filters beyond type — no people / date / status / scope | Add a second chip row (or popover): Person | Last 7d / 30d / All | Status: open/done/all | M |
| S-12 | Med | Result list | Identical row shape across 14 entity types — wastes per-type signal | Render type-specific affordances (assignee avatar, journal pill, fiscal year, status badge) | M/L |
| S-13 | Med | Recent | Only shown when input is empty; vanishes once user types | Continue showing recents (filtered by prefix) until first result lands | S |
| S-14 | Med | Idle state | Jump-to list is hardcoded 4 routes — not personalized | LRU per-user (track last 5 portal pages visited, render top 4) | S |
| S-15 | Med | Empty result | Generic "Try a different keyword" — no suggestions | Tokenize query, retry with each token, surface partial matches as "Did you mean?" | M |
| S-16 | Med | Error handling | 500 / network error indistinguishable from "no results" | Distinct error EmptyState with retry button | XS |
| S-17 | Low | Input | No `<kbd>` hint that `/` or Cmd+/ would focus from anywhere | Add hint in placeholder OR small kbd badge at right edge | XS |
| S-18 | Low | Mobile | Clear-recent button + chip touch targets fail 44×44 minimum | Wrap in 44×44 hit area; only icon at 9px is decorative | XS |
| S-19 | Low | Tips block | `font-mono` `<kbd>` glyphs violate Rule 7 (zero monospace in content)? | Verify `--font-mono` usage on `<kbd>` is whitelisted per design ethos; if not, swap to neutral pill | XS |
| S-20 | Low | Backend ranking | Status boost favors `in_progress` (+2) > `todo` (+1) — fine, but no boost for "assigned to me" | Add `+3 if assignee === currentUser` boost | S |
| S-21 | Low | Backend | `LIMIT 15` per type → some types max-out at 15 rows even when query is hyper-specific to one type | Make per-type limit dynamic: if 1 type filter active, raise its LIMIT to 50 | S |
| S-22 | Low | Backend | `LIKE '%query%'` is leading-wildcard → no index can be used; 14 parallel scans on 14 tables | Move to FTS5 virtual tables on D1 (project_updates, task_updates, comments, decisions especially) | L |
| S-23 | Low | Result list | No "Open in new tab" per-row affordance for power users | Add right-click menu OR a small ↗ button on hover | S |
| S-24 | Low | Accessibility | No `role="search"` on the form; `aria-live` not set on result-count line | Wrap input region in `<form role="search">`; add `aria-live="polite"` to count line | XS |
| S-25 | Low | A11y | Type chips group has no `role="group"` / `aria-label="Filter by type"` | Add wrapping role + label | XS |
| S-26 | Low | Brand | No HermesMark on `claude-ai`-authored decisions / activity rows | Check `n.author_slug === 'claude-ai'` and swap icon to HermesMark | S |
| S-27 | Low | Brand | No CategoryIcon on project/manuscript rows (lungs/flask/heartbeat/cap per Rule 29) | Use `<CategoryIcon category={p.category} />` for projects in result list | S |
| S-28 | Low | Visual | Chip active-state bg `${cfg.color}14` is a hex+8%-alpha string trick that works for hex-pinned colors but `var(--teal)` etc. flip in dark mode | Use `var(--teal-hover)` / `var(--gold-hover)` semantic tokens (per Phase 31) instead of synthesizing alpha | S |
| S-29 | Low | UX | Cmd+K opens palette; Cmd+/ or `/` would also be expected to focus this input — neither is bound | Add global key listener: `/` focuses input when not in an input | S |
| S-30 | Low | Coverage | Team members are NOT searchable. Querying a colleague's name returns tasks/comments mentioning them but no team-member result | Add `team_members` to the parallel SELECT block; render a `Person` result type | M |

## 4. Top 5 high-leverage enhancements

1. **Snippets with match highlighting (S-01 + S-03).** Highest perceived-quality lift per engineer-hour. The retrieval is already solid; the user just can't see why a row matched. A 2-line `<mark>`-wrapped excerpt next to the icon, pulling from the field that LIKE-matched, transforms this from "find by title" to "search across the lab." Backend doesn't even need changes — pass the matched field name and let the frontend render the snippet.

2. **Sticky input + chips bar + "Top results" mixed list (S-02 + S-04).** The current per-type grouping fights the scoring system. A sticky search header with a small "Mixed | By type | Timeline" view picker (à la Rule 60) preserves the rank when the user wants it, lets them group when they need it. Mixed is the default; By type is the drilldown. This single UX change makes the page feel ten times more responsive to query intent.

3. **People + date + scope filters (S-11).** Today the only filter is type. With 19 people across 71 projects, the most-needed second filter is "search within X" — a person, a project, or a date range. A second chip row: `Anyone ▾ | Anytime ▾ | All scopes ▾` would solve 80% of the "I'm looking for what Mesfin said about mortality last month" workflow that today requires manual scrolling through 50 results.

4. **Type-specific row rendering (S-12).** A grant row should show $cost + FY. A publication row should show journal + year + status pill. A meeting row should show a date pill. Today they're all icon + truncated-title + truncated-subtitle. This is the biggest gap between "result list" and "scannable index" and the typeConfig already carries the metadata to do it. ~1 day of work, massive scan-speed lift.

5. **FTS5 virtual tables for narrative-content fields (S-22).** Long term, leading-wildcard LIKE on 14 tables in parallel is a quadratic problem as the corpus grows. D1 supports FTS5; project_updates / task_updates / comments / decisions abstracts / publication abstracts are the 5 narrative-heavy tables that benefit most. Phrase queries, BM25 ranking, snippet extraction all become free. This unlocks `"phrase search"`, `field:value` syntax, AND/OR/NOT operators — all of which the current SQL can't do without a full rewrite.

## 5. Cmd+K vs SearchPage observations

I didn't read the CommandPalette source, but the boundary issues are visible from this file alone:

- **They're using the same backend `/api/search` endpoint** (the `useQuery` here calls `/api/search?q=`, which the palette likely also hits). That's correct — single source of truth, single index. Don't fork.
- **They render the same primitive (icon + title + subtitle list).** The palette is constrained to a 600px modal floating in the middle of the page; SearchPage has the full content area. SearchPage is doing the same shape *with more whitespace*, which is the wrong abstraction. The palette's job is "one keystroke gets me to anywhere"; the SearchPage's job is "let me investigate, refine, narrow, scope" — and that second job is unbuilt today.
- **Cmd+K likely beats SearchPage for 90% of queries.** A user types Cmd+K + 4 chars + Enter → opens record. The dedicated page only wins when the user wants to: (a) see 50 results not 10, (b) filter by type, (c) revisit a recent search, (d) browse without a target. Today (a) is trivially won, (b) is barely supported, (c) is half-built (bug S-05), (d) is a hardcoded Jump-to list.
- **Recommendation**: explicit role split. Palette = navigation (top 5-7 results, no filters, fastest path). SearchPage = investigation (50+ results, multi-axis filters, snippets, scope, saved searches, exports). The shared backend stays; the frontends differentiate.
- **Saved searches are missing on both.** Phase 38's DD-2 saved views applied to UnifiedMyTasks (Rule 53); the same `useSavedViews` pattern would extend cleanly to SearchPage with a `<SavedViewsMenu page="search">`. "Open Mesfin tasks tagged mortality from last 30 days" should be saveable.
- **Cross-tab consistency.** A query saved to recent in SearchPage isn't visible in Cmd+K (different localStorage key or none). They should share the recents bucket.

## 6. Brand & design-system observations

- **No HermesMark on Hermes-authored content.** Per Rule 29, `claude-ai`-authored decisions, activity log entries, and task notes should carry HermesMark in the icon slot, not a generic Scale / Activity icon. The backend exposes `decided_by`, `author_slug`, `actor` — frontend should branch on `=== 'claude-ai'`.
- **No CategoryIcon for projects/manuscripts.** Per Rule 29, project results should show the category icon (lungs / flask / heartbeat / cap) instead of (or alongside) the generic FolderKanban. The subtitle already includes `category` (`api/routes/search.ts:165`) — wire it through.
- **typeConfig colors flip in dark mode (S-28).** Active chip uses synthesized `${cfg.color}14` (8% alpha hex). For `var(--teal)` light = `#006b66`, dark = `#5cbcb4` — both are concatenated with `14` to form an 8%-alpha hex. That works visually but bypasses the semantic-token system Phase 31 set up. Use `var(--teal-hover)`, `var(--gold-hover)`, etc. — they're the canonical "active chip bg" tokens and they handle the theme flip semantically rather than computationally.
- **`--text-micro` is 10px** (`tracking-wider font-medium` at `:169`, `:188`, `:205`). That's the minimum per current tokens (R12-H3 raised it from 9 → 11 on mobile but desktop floor is still 10). The recent-search hint label is OK, but the clear-button at 10px (`:210`) below the 11px label looks accidentally small. Bump to `--text-label` (11px) for parity.
- **Monospace `<kbd>`** at `:192-194` uses `var(--font-mono)` which is the correct Rule 7 carve-out. Good.
- **Stage-fill tokens absent.** No project result chip shows stage. If we surface stage in the type-specific row rendering (S-12), use `--stage-fill-{idea,data-collection,...}` per Rule 41, NOT `--gold` directly.
- **`--ink-label` used as `opacity` value** at `:191`, `:285`, `:320`. That works because `--ink-label` is set as a numeric (0.55 dark / 0.70 light) — but it's named like a *color* token, used here as an *opacity* token. Mildly confusing if a future engineer assumes `--ink-label` is a color. Document or rename.
- **`var(--ice)` as input bg** (`:148`) — fine for light, but dark-mode `--ice` resolves to a near-black neutral that is barely distinguishable from `--page-bg`. The input loses visual weight on dark. Consider `var(--surface-1)` or `var(--surface-2)` for more elevation contrast.
- **No focus ring on chip buttons.** The input has `boxShadow: '0 0 0 2px var(--focus-ring)'` on focus (`:149`). The chip buttons have no equivalent — they rely on browser default outline which is invisible on dark theme. A11y regression vs the input.

## 7. Edge cases / failure modes

- **Empty database / fresh user**: query `mortality` on a fresh test database returns `{ data: [], count: 0 }`. EmptyState renders correctly. Fine.
- **Single-character query**: `m` → backend returns `[]` (`:69`), debouncedQuery >= 2 guard at `:92` keeps query disabled. UI shows recents/jump-to. OK, but the user gets no feedback that they need a second char. Add hint.
- **200+ char query**: backend bails at `:71-72` with `truncated: true`, but the frontend doesn't read that flag — UI shows "no results." User-confusing. Surface the truncation: "Search query too long — please shorten."
- **Special chars `%`, `_` in query**: SQL LIKE treats `%` and `_` as wildcards. A user pasting `100%` will match literally everything (the `%` becomes a wildcard between `100` and `100`). Backend doesn't escape. Bug. Fix with `q.replace(/[%_]/g, '\\$&')` and `LIKE ? ESCAPE '\\'`.
- **Quoted phrase query** `"mortality risk"`: treated as literal substring match including the quote chars. No phrase-search semantics. FTS5 (S-22) would fix.
- **AND / OR query**: not supported. `mortality AND sepsis` matches the literal string with the word AND in it.
- **Across-day search**: a 3-year-old task (`recencyBoost = 0`) with a strong title match (`titleMatchBonus = 5`) and `in_progress` status (+2) scores `10 + 0 + 5 + 2 = 17`. A new comment (`recencyBoost = 5`, `titleMatchBonus = 3`, `TYPE_PRIORITY.comment = 3`) scores `3 + 5 + 3 = 11`. Old task wins. That's probably right for tasks but means the user CAN find old stuff. Good.
- **Common-word query** `the`: 14 LIKE scans across the entire corpus → potentially thousands of matches truncated to 15 per type → 50-row UI. No "too generic, narrow your search" warning. Backend should detect if any per-type query hits LIMIT and surface that.
- **50-cap visibility**: UI says "50 results" with no signal that there might be more. Add "Showing top 50 — refine query for more" footer.
- **Soft-deleted tasks**: backend filters `tasks.deleted_at IS NULL` (`:84`) and `projects.deleted_at IS NULL` (`:87`). Other tables (meetings, comments, etc.) don't have a deleted_at filter — verify they don't need one (meeting deletion is hard-delete? comments soft-delete? unclear from this file).
- **R2-stored file**: file results show filename only, no preview or download URL. A search for "Wed-presentation.pptx" surfaces the filename but clicking opens the entity page, not the file. User has to drill in twice.
- **Stale query in cache**: 30s `staleTime` means a result list 31 seconds old re-renders fresh on next view. Fine for most cases. But if a teammate just created a new task while you were scrolling results, you won't see it until the cache expires. Acceptable trade.
- **Race condition on rapid typing**: React Query handles via `queryKey: ['search', debouncedQuery]` — old in-flight requests are abandoned. Good.

## 8. Open questions for PI

1. **Search scope default**: should `/portal/search` default to "everything across the lab" (current behavior) or "my stuff" (tasks/notes/comments authored by or assigned to me)? Today there's no scope toggle at all. The lab-wide default surfaces irrelevant cross-team noise; the personal-only default hides team context. Probably want both with an explicit toggle.

2. **Can we delete the Cmd+K / SearchPage redundancy?** As-is, Cmd+K beats this page for 90% of jobs. Is the dedicated page intended to grow into a full investigation surface (saved searches, snippets, advanced filters, scope, exports) or stay as a "wider Cmd+K"? If the former, we have ~6 weeks of work to do that's worth scoping. If the latter, consider downgrading it to a thin wrapper that just opens Cmd+K with a forwarded query.

3. **Person search?** Today `team_members` isn't in the parallel SELECT. Querying "Mesfin" returns tasks/comments mentioning him but no person card. Should the team directory be searchable here?

4. **FTS5 migration timing.** Switching to FTS5 virtual tables is a 1-2 week project (schema + triggers + parallel populate + cutover). Worth it for query quality (phrase + boolean) and performance. Want to schedule before the corpus doubles?

5. **Saved searches.** Phase 38 DD-2 added saved views to UnifiedMyTasks — extending `useSavedViews(page='search')` is straightforward. Is this part of the search refactor, or a separate sprint?

6. **Sync coverage in search.** Action items are searchable, but `manuscript_revisions` and `reviewer_comments` (Phase 25) are NOT in the 14 tables. Phase 39's `user_calendar_events` also not searchable. Should these join the index?

7. **Search analytics.** Today there's no instrumentation on what queries are run, what results are clicked, or what queries return zero. Would be valuable signal for ranking + corpus gaps. OK to add a `search_log` table?

8. **AI-augmented search.** Hermes is already polling for `@hermes` mentions. A natural extension: "ask Hermes to search for X across the lab" produces a synthesized answer with cited result links. Similar to Linear's AI search. In scope for the design ethos? Out of scope for V1?

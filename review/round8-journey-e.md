# Journey E — Research Digest Model B Gap Analysis

## Current state

**Page loads:** YES — `/research-digest` renders correctly, shows the correct page title and PageHeader.

**UI inventory (from source + API verification):**
- Date selector pills (up to 14 dates shown, with paper counts)
- Search input (title/author/journal text search — client-side filter within fetched papers)
- Status filter tabs: All / New / Saved (with counts)
- "For You" filter pill (matches papers against user's expertise tags)
- Topic filter pills (one-click topic narrowing)
- Reading progress bar (saved vs unread vs total)
- Copy Reading List button (copies saved papers as bibliography to clipboard)
- Paper cards showing: relevance % badge, title (linked to PubMed), authors, journal, pub date, DOI link, relevance reason (italic teal), topic tags, relevant member avatars, collapsible abstract
- Per-card action buttons: Save/Unsave (Bookmark icon), Dismiss/Restore (X icon), Link to Project (FolderPlus dropdown)

**Data flow:**
- `GET /api/digest/dates` → date pills with counts
- `GET /api/digest?date=&status=&topic=&limit=200&with_relevance=true` → paper list
- `POST /api/digest/:id/status` → save/dismiss (auth-gated write)
- `POST /api/digest` → upsert (used by PB research-digest skill)
- Link-to-Project calls `POST /api/projects/:slug/papers` (useLinkPaper mutation)

**D1 schema — `research_digest` (15 columns):**
`id`, `title`, `authors`, `journal`, `pub_date`, `abstract`, `pmid`, `doi`, `relevance_score`, `relevance_reason`, `topics`, `status` (new/saved/dismissed), `saved_by`, `created_at`, `digest_date`

**Data present:** 375 papers across 7 digest dates (2026-04-02 to 2026-04-13, latest 8 papers).

## NIH Reporter search status

**BROKEN — but it is NOT on the Research Digest page.**

The NIH RePORTER search lives on `/grants` (portal), not `/research-digest`. The confusion in Nick's feedback conflated two features:

- `/research-digest` — PubMed-sourced papers from the daily scan. Has its own text search (client-side within fetched papers). No NIH Reporter integration exists here.
- `/grants` — Has a "Grant Landscape (NIH RePORTER)" section with a keyword search input that calls `GET /api/grants/similar?keywords=`.

**Evidence of the break:**
- `curl https://mn-ccore-lab.pages.dev/api/grants/similar?keywords=ARDS` → returns 10 results, 739 total. WORKS.
- `curl https://mn-ccore-lab.pages.dev/api/grants/similar?keywords=ingraham` → `{"data":[],"total":0}`. Returns nothing.
- Root cause for "ingraham" returning nothing: NIH RePORTER's `advanced_text_search` on the `terms` field searches abstract/title text, NOT PI name. "ingraham" as a PI name requires a `pi_names` criteria field (e.g., `"pi_names": [{"any_name": "ingraham"}]`), which the current API handler does not support. The search field for this route is `terms` only.

**When Nick typed "ARDS" or "ingraham" and got nothing:** He was likely on `/research-digest`, which has a text filter that operates on already-fetched papers for the selected date. If no ARDS papers were in that day's batch, or if the page loaded empty (Cloudflare Access blocks the API for unauthenticated sessions), the filter would return nothing even though data exists. The in-page search is NOT a NIH Reporter search — it is a simple `includes()` filter on cached results.

## Model B gap list

**Schema gaps:**
- No `notes` or `user_notes` column on `research_digest` (single-user annotation per paper)
- No `digest_saves` join table for multi-user per-paper save state (current `saved_by` is a single TEXT field — only one user can save; no `saved_at` timestamp)
- No `digest_comments` table (id, paper_id, author_slug, content, created_at) — comments are entirely absent
- No `project_papers` or equivalent join table for paper ↔ project linking that persists (current `useLinkPaper` mutation exists but the target route `POST /api/projects/:slug/papers` and any corresponding display in ProjectDetail need verification)

**API gaps:**
- `POST /api/digest/:id/comment` — does not exist
- `GET /api/digest/:id/comments` — does not exist
- `DELETE /api/digest/:id/save` — no unsave endpoint (currently status toggle handles this via POST to `/status` with status=`new`)
- `POST /api/digest/:id/notes` — no per-user annotation endpoint
- NIH Reporter PI name search — `api/grants/similar` only searches `terms` field; needs `pi_names` criteria support

**UI gaps:**
- No comment thread on PaperCard — no textarea, no comment list, no reply
- No user-facing notes/annotation field per paper (private scratch space)
- No "Saved" library view that aggregates saves across all dates (current Saved tab filters within one date only; a saved paper from April 8 is invisible when viewing April 13)
- No visual indicator that a paper is linked to a project (link success shows a 2-second toast check mark, then resets — no persistent state shown on card)
- No "Linked to: [Project Name]" badge on cards post-link
- Card click does nothing (no detail panel, no modal) — click opens PubMed only if you click the title anchor; the card body itself is not interactive
- No per-paper detail view or side panel

## Effort estimate

| Area | Task | Hours |
|------|------|-------|
| Schema migration | `digest_saves` join table (paper_id, user_slug, saved_at) replacing single saved_by; `digest_comments` table; `notes` column on research_digest | 0.5 |
| Backend routes | `GET/POST /api/digest/:id/comments`, `POST /api/digest/:id/notes`, update status route to use join table | 2.0 |
| Frontend — save state | Multi-user save using join table, persistent save badge, cross-date "Saved Library" view (all dates) | 1.5 |
| Frontend — comments | CommentThread component on PaperCard (expandable), textarea input, comment list with author/timestamp | 2.0 |
| Frontend — project link persistence | Persistent linked-project badge on card, verify ProjectDetail references tab shows linked papers | 1.0 |
| NIH Reporter PI name search | Add `pi_names` criteria to `handleSimilarGrants`; update frontend search to clarify keyword vs PI | 0.5 |
| Integration tests | 4 new inspection tests for save/comment/link/unsave | 0.5 |
| **Total** | | **8.0 hrs** |

*The kickoff doc estimated 4-6 hours. The comment system and cross-date saved library view push it to ~8.*

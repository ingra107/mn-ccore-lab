# What's new + Lab pulse pill (#156) — design

Status: draft for Nick's approval, 2026-10-26.

## Why

The top-bar "What's new" pill (`src/components/PhaseReleaseBanner.tsx`) shows one hand-written
release from 2026-04-20 that nobody updates. Nick (#156): "I think it's being underutilized ... we
should figure out a way to use this in a helpful manner if it's going to be up here." He wants it to
do two jobs: tell the team what the Hub can now do after each ship ("kind of like when there's a new
release of a change log it kind of shows that highlights real quick blurbs of what you can do"), and,
once read, become a lab health surface ("how many active users in the last day how many completed
tasks progress ... a new publication ... general announcements like I could make an announcement").

## Decisions Nick made (2026-10-26)

- **Layout A:** one pill, one panel with two tabs, `What's new | Lab pulse`. The panel opens on
  What's new while something is unread, otherwise on Lab pulse.
- **Blurbs:** Hermes/Claude drafts, Nick approves. Nobody but Nick sees a release before approval.
- **Drafting happens at deploy:** the deploy that ships the change sends the new commits to the Hub
  as a draft; the Claude session that shipped writes the plain-English blurbs then.
- **Pulse job = lab momentum:** who was active, what got done, what was published, plus Nick's
  latest announcement on top.
- **Active today shows faces** (avatars of people active in the last 24h), visible to every member.
- **Announcements light the pill:** a new announcement turns the pill gold until each person opens
  it once.

## Goals

1. The pill is never stale: its content comes from shipped work and live data, not a constant.
2. A teammate learns in under ten seconds what they can now do, in their words, not commit words.
3. Nick can post an announcement from the panel in one step.
4. Read state is per person on the server, so reading on the phone clears the laptop too.

## Non-goals

- No push, email or bell notification for releases or announcements (the pill is the channel).
- No per-person analytics page; the pulse is a glance, not a report.
- No editing history or comments on releases.

## Anti-goals (would make this a failure even if it works)

- Commit-speak reaching the team ("activity-hidden-exempt markers"). The approval gate exists to stop it.
- A gold dot that never drains, or a count that does not match what opens (Rule 73 badge honesty).
- A pulse number that is wrong because its source is a proxy nobody checked.

## The pill

| State | Label | Opens on |
|-------|-------|----------|
| Unread approved release or unread announcement | gold dot + "What's new" | What's new tab (announcement shows at the top of whichever tab opens) |
| All read | teal dot + "Lab pulse · N active" | Lab pulse tab |
| PI with a pending draft | gold dot + "What's new" (PI only) | What's new tab, draft card first |

"Read" = the viewer opened the panel while that item was showing. Stored in `user_prefs`
(key `hub.pulse.seen`, value `{ releaseId, announcementId }` of the newest seen), via `useUserPref`,
the same mechanism as `today.needsYouCollapsed`.

## What's new tab

- Latest approved release: date, title, 2-4 blurbs (`**Bold lead.** One sentence of what you can do.`).
- "Past releases" expands the previous approved releases (newest first, title + date, tap to read).
- PI only: a pending draft renders first, marked Draft, with **Approve** and **Edit** (inline edit of
  title and blurbs, then Approve). A draft can also be **Discarded**.

## Lab pulse tab

Top to bottom:
1. Latest announcement (gold left edge, author, relative time), if any in the last 14 days.
   PI only: "Post announcement" opens a one-field composer (plain text, 280 chars) under it.
2. **Active in the last day:** faces of members with any `entity_seen.last_seen_at` or authored
   `activity_entries` row in the last 24h. Count in the pill label is the same set.
3. Three stat tiles: **tasks done this week** (tasks completed since Monday 00:00 viewer-local),
   **milestones hit** (`kind='milestone'` completed this week), **new papers** (publications added in
   the last 30 days).
4. Up to three "recent wins" rows: newest milestones and publications with dates.

Visibility: counts are lab-wide aggregates (numbers only); the recent-wins rows obey Rule 90
(a viewer sees only rows of projects they can read).

## Data

New migration (next free number, currently v148):

- `hub_releases(id TEXT PK, status TEXT CHECK in ('draft','approved','discarded'), title TEXT,
  blurbs_json TEXT, commit_from TEXT, commit_to TEXT, commits_json TEXT, created_at, approved_at,
  approved_by)`.
- `hub_announcements(id TEXT PK, body TEXT, author_slug TEXT, created_at, deleted_at)`.

Routes (registry DSL, PI gate where noted):
- `GET /api/pulse` — one call for the panel: latest approved release, past releases (title/date),
  latest announcement, active faces, three counts, recent wins; PI also gets the pending draft.
- `POST /api/releases` (API key) — create a draft from `{commit_from, commit_to, commits, title, blurbs}`.
- `POST /api/releases/:id` (PI) — edit / approve / discard.
- `POST /api/announcements` (PI), `POST /api/announcements/:id/delete` (PI).

## Deploy hook

`deploy:pages:gated` gains a final step, `postdeploy:release-draft`
(`scripts/post-release-draft.mjs`): it reads the last approved/drafted `commit_to` from the Hub,
collects `git log` subjects since then (excluding test/docs-only commits), and POSTs a draft with
the raw commits and **empty blurbs**. The shipping Claude session then writes title + blurbs into
that draft (a documented step in `SESSION-HANDOFF`/CLAUDE.md deploy row, and the bug-squasher
prompt). Nothing ships to the team until Nick approves in the panel. A deploy with no new commits
creates nothing.

## Approaches considered

1. **Draft at deploy, written by the shipping Claude session (chosen).** No new background lane;
   the session that knows what it shipped writes the words. Trade-off: if a session forgets, the draft
   sits with empty blurbs; the PI sees "Draft · needs blurbs" in the panel and can write them.
2. **Hermes listener rewrites raw commits.** Works with no Claude session around, but depends on the
   home laptop being on and adds another ai_requests source type.
3. **On-demand "Draft release notes" button.** Nick controls timing, but the pill goes stale again
   whenever nobody presses it, which is the bug.

## Settled after the builder check (2026-10-26)

**Nick's call:**
- **Pulse counts are lab-wide**, the same totals for every member, counts only. This is a narrow,
  written exemption to Rule 90: the three aggregate counts and the active-face set may read all
  projects through a dedicated aggregate query (comment it `// rule-90-aggregate-exempt: #156`);
  the recent-wins rows (titles) stay viewer-scoped.

**My calls (check these):**
- **Active** = a member with an `entity_seen.last_seen_at` row or an authored `activity_entries` row
  in the last 24h. `entity_seen` is written only by explicit detail opens (`markSeen`/`useAutoAcknowledge`),
  not by page loads, so it is a real "used the Hub" signal. Only slug + face are exposed, never which
  entity, and `@me`/hidden rows count toward activity without revealing content. Same set for everyone.
- **Pill freshness:** the pill reads `GET /api/pulse` through TanStack Query (staleTime 5 min,
  refetch on window focus); it never rides `/api/version` (Rule 25: no per-user data there).
- **"This week"** = the client sends `week_start` (viewer-local Monday 00:00 as a UTC instant, via
  `src/lib/time.ts`); the server falls back to America/Chicago Monday if absent. Tasks done =
  `completed_at >= week_start`, not soft-deleted, any completer. Milestones = same with `kind='milestone'`.
  New papers = `publications.created_at` in the last 30 days (date the lab added it), so a backfill
  can spike it; the deploy of this feature records a baseline and ignores rows bulk-inserted in one
  second (>5 rows sharing a `created_at`).
- **Release state machine:** at most ONE pending draft. A deploy with a pending draft extends it
  (`commit_to` moves forward, commits append); otherwise it opens a new draft from the last
  non-pending release's `commit_to`. Discarded commits are skipped for good (Nick chose to drop them).
  Approve publishes to everyone at once. Commits whose changed paths are all under `tests/`, `docs/`,
  or `*.md` are excluded. The script authenticates with `PB_API_KEY`; a failed POST WARNS and never
  fails the deploy (the site is already live).
- **Approval gate is identity, not key:** the API key may create a draft and write its title/blurbs;
  only a PI's signed-in identity (`isPiRequest` on a JWT, not the key) may approve, discard, post or
  delete an announcement. The script prints the draft id; the shipping session writes blurbs with
  `POST /api/releases/:id {title, blurbs}`.
- **Read state:** ids are ULIDs (sortable). Opening the panel marks the newest approved release AND the
  newest announcement seen, whichever tab opens. If the newest item is deleted, the pill compares
  against the newest that still exists. The PI's draft dot drains only by approving or discarding.
- **Access:** all routes members-only (Rule 66); `GET /api/pulse` is not `servesNonMembers`.
- `useUserPref` is server-synced (`user_prefs`, schema v143), so read state follows the person.

## Left to the builder

- Exact visual polish within the existing tokens (`.tk-seg` for tabs, `AttentionChip` rules, Face).
- Copy of empty states ("Nothing shipped yet", "No announcement this fortnight").
- Retiring `PhaseReleaseBanner` and its `mnccore-phase-banner-seen-v1` localStorage key.
- Tests: route visibility (non-PI never sees drafts), pill state machine, deploy script dedup.

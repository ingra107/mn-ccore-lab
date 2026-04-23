# Session Handoff — 2026-04-23 (late evening)

> Last worked: **GH bug sweep + Overview refocus + Slack-parity ship.**
> 7 bugs closed (#26-#27, #29-#33), 5 deploy rounds. Claude Design
> round-3 packaged with 174 PNGs + 30 WebM videos at
> `review/post-track-a-2026-04-23/` and brief at
> `docs/design-briefs/2026-04-23-first-landing-utility.md`. Nick is
> relinking the codebase in Claude Design integration; tickets
> inbound next session.
>
> Deploy: `d76a60a0.mn-ccore-lab.pages.dev`. HEAD `2ef6cc4` on main.

## What shipped today (5 deploy rounds, 30+ commits)

**Round 1 — Tier-1 bug fixes + Track A first-landing hoists**
- **#26** `Revisions` project-stage added between Submitted and Accepted. Cross-repo: brain.db `enums.py` canonical 7→8 + aliases; Hub `PROJECT_STAGE_VALUES` + 6 `STAGES` arrays + 2 `stageColors` maps + `ApiStage` union. CSS `--stage-fill-revisions: #5b4fa8`.
- **#31** PI name consistency via existing `displayName(slug, tier)` from `src/lib/nameUtils.ts` (replaced 4 ad-hoc `.split(' ')` sites in Projects / ProjectCard / Manuscripts / Grants portal). **K23 IHCA data fix:** `pi nick→nate-mesfin`, `category nate→lab`.
- **#30** Notes/Comments tab restructure (Option B, user-chosen). ProjectDetail: `Overview | Tasks | Notes | Comments | Activity | Revisions | Literature`. `ProjectUpdateFeed` heading + placeholder + empty-state text renamed "Project Updates" → "Notes".
- **#32** CreateTaskModal default assignee = current user via `useAuth()` + `emailToSlug()`. Plain `<select>` replaced with `InlineAssigneePicker` (typeahead + keyboard nav). `GlobalQuickAdd` + `MeetingDetail` hardcoded `'nick-ingraham'` fallbacks → `emailToSlug(user.email)`.
- **Track A §A1** New inline `OverviewLandingCard` on ProjectDetail. Description `whiteSpace: pre-wrap`. `KeyLinksEditor` hoisted from Details card (~500px down).
- **Track A §A2** New `TodayHero` 2-col block (Overdue | Due Today) on MyTasks above Focus Next.

**Round 2 — Overview refocus (Nick feedback: "timeline is a big waste of space")**
- Project Timeline deleted (157 lines, dead code).
- OverviewLandingCard restructured to 2-col grid:
  - Left 2/3: **Open Tasks** — ALWAYS visible with `+ Add task` CTA. Max 5 rows sorted by due date. Empty state: "No open tasks. Add one."
  - Right 1/3: Key Links (top) + Recent Activity (bottom, compact row-height).
  - Bottom full-width: Quick compose (Note/Comment toggle + textarea + Cmd+Enter send).

**Round 3 — #12 + #11 + #10 polish**
- **#12** Description auto-linkify. New `src/lib/urlClassify.ts` (extracted `classifyUrl` + added `shortLabelForUrl`). New `src/components/LinkifiedText.tsx`. KeyLinksEditor imports from shared lib.
- **#11** Work-on single-click. Project pill on `TaskGridView` rows is now `<Link>` to `/portal/projects/:slug`, using `projectMap` for actual title (not slug regex). TODAY.md pattern.
- **#10** Plain `<select>` sweep. CreateProjectModal + CreateDecisionModal → InlineSelect / InlineAssigneePicker. CreateProjectModal STAGES include Revisions; CATEGORIES trimmed to 4 canonical (was 9 with legacy drift).

**Round 4 — Legacy slug root-cause fix (Nick: "is that a bandaid")**
- **Root cause:** brain.db had 532 tasks with `assignee='nick'` (Nick's CLI shorthand). `hub_payload.py` passed them unchanged to D1, bypassing Hub API `team_members` validation (Rule 20).
- **PB fix:** added `TEAM_SLUG_ALIASES` + `canonicalize_team_slug()` to `scripts/db/enums.py`. `scripts/db/sync/hub_payload.py` now routes outbound assignees through canonicalizer at both push sites (record-path line 286, item-path line 558).
- **brain.db migration:** 532 rows `assignee='nick'` → `'nick-ingraham'`. (D1 10 rows fixed earlier.)
- **Hub revert:** removed read-side `canonicalSlug()` bandaid from `team.ts` + `MyTasks.tsx` + `emailSlug.ts`. If `nick` reappears in D1, UI renders literally — signal, not silent fix.
- **Folder-link UX:** `mnccore://` protocol has no Windows handler → clicks were silent. Now non-http links copy raw path to clipboard + toast "Path copied — paste in Win+R or Explorer." Protocol nav still fires fire-and-forget. Applies to KeyLinksEditor + LinkifiedText.

**Round 5 — Slack-parity (#13 + #14 + #15)**
- **#13 Unified search** extended 6 → 14 entity types. New: notes (project_updates), task notes (task_updates), task comments, decisions, files, action items, publications, grants. Return cap 20→50. Completed action-items scored -2. Projects now searches `description`; meetings searches `notes` body; tasks+projects filter `deleted_at IS NULL`. SearchPage `typeConfig` extended with icons.
- **#14 Files tab** on ProjectDetail (8 tabs now). `FileUpload` reused at `entity_type='project'`. Drag-drop → R2 presigned upload. Filenames searchable via #13.
- **#15 Live presence.** New `src/hooks/usePresence.ts` — broadcasts 15s pings on hub-realtime WS `mnccore` room; tracks peers locally with 45s staleness; sends `presence-leave` on unmount. New `src/components/PresenceAvatars.tsx` avatar stack + green dot + "N viewing" count. Wired into ProjectDetail header next to WatchButton.

## Additional packaging

- Brief `docs/design-briefs/2026-04-23-first-landing-utility.md` rewritten post-Round-5 with 3-priority ask (validate shipped, find Airtable+Slack gaps, operational-not-editorial audit) + 9 guardrails + design system constraints.
- `review/post-track-a-2026-04-23/` captures: 174 PNGs + 30 WebM (47 hero, 79 scroll-chunks, 20 rich-states, 8 focus-asks, 20 light-mode, 30 interaction videos).
- `tests/capture-for-design.spec.ts` now accepts `CAPTURE_BASE_URL` env — captures bypass CF Access gate via preview-hash URL.
- `scripts/local-db-bootstrap.ts` now skips `schema-v43.sql` + `schema-v48-index-reconcile.sql` on fresh bootstrap (both incompatible with clean DB) — `npm run test:local` unblocked.

## Cross-repo changes (PB side)

All in `/c/Users/ingra107/Peripheral-Brain/`:
- `scripts/db/enums.py` — `PROJECT_STAGE` canonical 7→8 (+ Revisions aliases), new `TEAM_SLUG_ALIASES` + `canonicalize_team_slug()`.
- `scripts/db/sync/hub_payload.py` — imports canonicalizer, applies at both outbound assignee sites.
- `Context/Topics/shared-schema-registry.md` — registered Revisions in projects.stage.
- `Context/Decisions/2026-04-23-project-stage-revisions-added.md` — decision doc with rationale + color choice + rollback.
- `data/brain.db` — 532 `tasks.assignee='nick'` → `'nick-ingraham'`.

## Quality gate

- Build: `tsc -b && vite build` green
- `npm run test:local` Miniflare 5/5 pass
- `/api/health` 65-90ms, 606 tasks / 69 projects / 19 team_members
- Smoke: 15/15 public routes PASS; portal routes CF-gated as expected

## Known issues / follow-ups

- **4 interaction capture tests failed** (`01-status-change-undo`, `08-date-picker` × desktop + mobile). Selectors drifted. Partial captures still produced; not blocking Claude Design review. Fix selectors next session.
- **Presence only on ProjectDetail** — extend to TaskDetailPanel + MeetingDetail (hook is entity-agnostic).
- **No per-type filter chips on SearchPage** — with 14 types, chip row at top would help narrow results.
- **Typing indicators not yet** — hub-realtime WS could carry keystroke events; Slack-grade presence extension.

## What-to-do-first next session

1. **Claude Design tickets arriving.** Nick relinking codebase post-handoff; triage incoming markdown tickets by severity, ship P1s same-day.
2. Fix 4 interaction test selectors (low priority).
3. Extend `usePresence` to TaskDetailPanel + MeetingDetail.
4. Add per-type filter chips to SearchPage.
5. Review CHANGELOG for entry I added (2026-04-23 late evening).

## Memory snapshot (agent-side, persists across sessions)

- `feedback_nick-design-philosophy.md` — 9 guardrails
- `project_hub-vision-airtable-slack-hybrid.md` — product vision verbatim
- `project_d1-sync-flow.md` — sync architecture
- `reference_claude-design-link-rescan.md` — CD integration note

## Session-end state

- HEAD `2ef6cc4` pushed to origin/main
- Deploy `d76a60a0.mn-ccore-lab.pages.dev` (prod alias)
- PB main has `d4f97dee` (sync canonicalization) + `50cc5997` (Revisions stage)
- 7 GH issues closed (#26 already closed, #27 #29 #30 #31 #32 #33 closed today with commit SHAs in comments)
- Claude Design handoff complete — awaiting round-3 tickets from Nick

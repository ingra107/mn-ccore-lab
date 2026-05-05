# Session Handoff — 2026-05-05 (calendar TZ fixes)

---

## LATEST DEPLOY

**HEAD `1a6b9986` on main**, in sync with origin. Pages deploy live at:

> https://mn-ccore-lab.pages.dev

Worker version `64992fc8`. Calendar cron last_polled_at set to NULL; next cron tick (~:45 CDT) will re-poll with the new parser.

### Calendar timezone fix wave 2 (commit 1a6b9986)

**Root cause of persisting MNCCORE/TIGNANELLI/CLIF drift after ab14850c:**

The `ab14850c` two-pass fix correctly handles direct `DTSTART;TZID=...` parsing. But `expandRrule()` used pure UTC arithmetic: advancing a CST-origin master (MNCCORE: `20260127T150000` = 21:00Z) by 2-week UTC increments gave CDT instances as 21:00Z instead of the correct 20:00Z. RECURRENCE-ID overrides (which parsed correctly to 20:00Z) failed to match the expansion (which looked up `uid|21:00Z`), so overrides were silently dropped and the wrong stale time persisted.

**Fix (api/lib/ics-parser.ts):** DST-safe RRULE reanchoring. Each expanded candidate UTC is now recomputed by extracting the candidate date in the master's IANA timezone via Intl, combining with the master's original wall-clock HHMMSS, and re-applying the two-pass `tzOffsetMinutes()` probe for that specific date. New fields: `ParsedVEvent.startWallHms`, `ParsedDate.wallHms`.

**Regression tests:** +2 (81 total, was 79). Biweekly-Tuesday CST-origin series: May 5 = 20:00Z (was 21:00Z). RECURRENCE-ID override matching after DST reanchoring.

**Affected events (after next cron poll, expect D1 to update):**
- MNCCORE: `2026-05-05T21:00:00Z` → `2026-05-05T20:00:00Z` (3pm CDT)
- TIGNANELLI OFFICE HOURS: same correction
- CLIF Grant Writing: `2026-05-05T17:00:00Z` → `2026-05-05T16:00:00Z` (11am CDT)
- CQODE Leadership: already correct at `14:30:00Z` (9:30am CDT) — not affected

### Calendar timezone fix wave 1 (commit ab14850c)

Three bugs fixed in `fix(calendar): two-pass tzOffsetMinutes + isToday local date + sort by startMin`:

1. **`api/lib/ics-parser.ts`** — `tzOffsetMinutes()` two-pass probe: single-pass Intl probe gave wrong DST state near transitions in Workers runtime (CDT = UTC-5 computed as CST = UTC-6, +1hr drift for TZID-format events). Fix: pass1=naive approx, pass2=re-query at candidateUtc. Regression tests added (79 total, was 77).

2. **`src/components/today/constants.ts`** — `isToday()` now compares local date components (getFullYear/getMonth/getDate) not UTC ISO slice. Prevents post-7pm CDT events (midnight+ UTC) appearing on wrong day.

3. **`src/pages/portal/TodayPage.tsx`** — `timed.sort()` now sorts by `startMin` (numeric) not `a.time.localeCompare()`. Lexicographic sort put "9:30 AM" after "12:00 PM" (because "9" > "1").

Schema v54 still in prod D1 (`team_members.citation_count` + `h_index` + `last_scholar_refresh`).

---

## 🤖 NEXT SESSION — AUDIT MODE PLAYBOOK (still active)

**100 of 161 P0/P1 audit findings closed (~62%) via 11 PRs (#55-#65) on 2026-04-28.** ~60 findings remain. Persistent workplan still lives at `audit/2026-04-28/`.

**If Nick has not redirected you to a different priority, your job is to work the audit.**

### Strict workflow (every session)

1. Read `audit/2026-04-28/README.md` — explains directory + workflow
2. Read `audit/2026-04-28/VERIFICATION-PROTOCOL.md` — **MANDATORY** before any fix
3. Read `audit/2026-04-28/progress-log.md` — see what previous sessions did (entries are append-only, latest at top)
4. Open `audit/2026-04-28/synthesis-plan.md` — find next unchecked P1 item
5. Open the matching `audit/2026-04-28/reports/NN-pagename.md` — get raw context
6. **VERIFY the finding still exists** (file:line + git log + reproduce in browser) — many findings are already closed by waves 1-4
7. Fix or escalate per the protocol
8. Append entry to `audit/2026-04-28/progress-log.md`

### Trust-but-verify

The audit is dated 2026-04-28; the codebase has shifted significantly. Many "still broken" findings from the verification sweep are NOW fixed. **Run the protocol** before assuming anything.

### Wave 5 candidate bundles (ready to dispatch on Nick's go)

- **Bundle Q** AskTheLab Hermes pending state + realtimeBus + tier-1 polish (~10 findings — ATL-03, ATL-04, ATL-08, ATL-10, ATL-13, ATL-14, ATL-21-23, ATL-25-27)
- **Bundle T** ProfilePage tier-1 (~8 findings — P-02 affordance, P-03 photo upload, P-05 optimistic + undo, P-08 calendar feed delete confirm, P-11 scholar_id format, P-12 slug visible, P-13 lock tooltip)
- **Bundle U** Personal 3-tab merge per D4+D5 — biggest single bundle remaining. Personal becomes Workspace | Inbox | Cards. MyItems retired. 6 personal cards move from Lab Overview. Substrate-swap protocol applies.
- **Bundle V** Calendar tier-1 (~4 findings — C-01 iCal merge, C-02 clickable tasks/milestones, C-04 +N more interactive, C-05 view persist)
- **Bundle K** TodayPage Tier-2 (TP-04 + TP-06 state.done arch, TP-05 meeting-notes piggyback per D13, TP-13 token migration per D16, TP-15 CategoryIcon vocabulary per D18)
- **Bundle S** Lab Overview tier-2 (LO-5 ActionBoard scope filter, LO-7 ROLE_DEFAULTS reconcile, LO-9 TeamPulse + Insights default-on, LO-10 dashboard-role-key)

### Cross-repo schema queue (NOT auto-dispatched — needs Nick + lockstep deploy with brain.db)

Per Rule R10 — each needs decision doc in `~/Peripheral-Brain/Context/Decisions/` + `enums.py` update + `shared-schema-registry.md` + lockstep deploy:

- **D7** `projects.stage_entered_at` (unblocks M-03)
- **D8** `lab_questions.tags` (unblocks ATL-06)
- **D9** `commitments.to_slug` (unblocks MI-07)
- **D22** `activity_log` emit on stage / PI / status / assignee / project rename / meeting cancel transitions (unblocks PD-3 Activity audit log + partial M-03)
- **D28** `meetings.start_time` + `meetings.end_time` (unblocks Calendar time-aware C-03/C-06)

---

## What shipped this session — 17 PRs in one day

### Phase 39 morning (#49-#52, pre-audit)
- PR #49 closed GH #46 / #47 — Today plan persistence + Today→/tasks completion sync
- PR #50 iCal calendar feeds (RFC 5545 parser, RRULE, IANA TZID, 24 vitest tests)
- PR #51 auto-create + claim of team_members on first CF Access login (schema v53)
- PR #52 `/portal/profile` page + lock down `PUT /api/team/:slug` auth

### Audit waves 1-4 (#55-#65)
- **Wave 1** PR #55 Bundle A (P0 quick wins — auth + subtask + slug + stopProp), PR #56 Bundle D (brand sweep — gold-on-emphasis, CategoryIcon, EmptyStateArt)
- **Wave 2** PR #57 Bundle B (Lab Overview wires — kill fake R01 deadlines / fake citations / fake grant timeline / "CLIF expanding" copy), PR #58 Bundle G (citations infra — schema v54 + `/api/citations` + `useCitations()` + StatsCard wire + PB scholarly cron stub doc)
- **Wave 3** PR #59 Bundle H (UnifiedMyTasks rebuild — TaskDrawer.tsx DELETED, TaskDetailPanel composition, inline editing on List, virtualization, FilterChip typeahead), PR #60 Bundle F (ProjectDetail polish — title inline-edit, archive menu, tab URL state, file uploader name+timestamp, Hermes ReactionBar fix), PR #61 Bundle C (SmartCompose universal sweep — 9 sites including TodayPage MorningThoughtCompose with prefix routing + time-aware after 5pm CT)
- **Wave 4** PR #62 Bundle O (SearchPage UX foundations — match highlighting, snippets, sticky bar, view picker, type-specific badges, "Did you mean" token retry), PR #63 Bundle M (InsightsPage feature pass — sigmoid Lab Health, ?week= param, sparklines, MetricCard adoption, Connections panel between funnel + scatter), PR #64 Bundle R (TodayPage Tier-1 — 1px now-line, OverlapBand, due/priority cells, sigmoid Lab Health, focusMin from PB sessions, NeedsAttention overflow link, ProjectsCard "relevant today"), PR #65 Bundle N (Manuscripts polish — Active Submissions widget, Pipeline DnD, click-to-advance stage dots, derived PI filter, useLabPrefs threshold)

---

## State changes a fresh session needs to know

### Major component lifecycle
- **`src/pages/MyTasks/components/TaskDrawer.tsx` DELETED.** Bundle H replaced with `<TaskDetailPanel taskId={drawerId}>` composition. List view drawer now uses canonical TaskDetailPanel pattern (cache-subscribed per Rule 18, focus trap, prev/next, 5 tabs).
- **`src/pages/MyTasks/views/ListView.tsx` rebuilt.** Now uses `useVirtualizer`, inline editing on Status / Priority / Due / Owner / Project via InlineSelect/InlineDatePicker/InlineAssigneePicker.
- **`src/components/SmartCompose.tsx` extended** with backward-compatible custom-mode props (`onSubmit`, `value`/`onChange`, `submitting`, `uploadContext`, `theme='dark'|'light'`, `bare`, `autoFocus`, `alwaysShowToolbar`, `submitLabel`, `hideKbdHint`, `hideSubmitButton`, `rows`). 9 surfaces now adopt it: TodayPage morning thought + Right Now chat, ProjectDetail Overview compose, ProjectUpdateFeed, ProjectComments, MeetingDetail action items + notes, AskTheLab modal + answer.
- **`src/components/today/MorningThoughtCompose.tsx` NEW.** Bundle C / TP-01 / D11 — prefix-routed (`@hermes` / `note:` / default `task:`) + time-aware (after 5pm CT, prompt swaps to "Plan tomorrow" + tasks default `due_date=tomorrow`).
- **`src/components/today/OverlapBand.tsx` IMPLEMENTED** (was stub returning null). Clusters overlapping events; renders dashed coral band w/ side-by-side grid.
- **`src/components/ActiveSubmissionsWidget.tsx` NEW.** Bundle N M-12 — top of Manuscripts List view. Reuses existing `/api/submissions/active` endpoint.
- **`api/routes/citations.ts` NEW.** `GET /api/citations` returns `{ total, last_refresh, members_with_data, members_total }` w/ 1h edge cache.
- **`api/schema-v54-team-citations.sql` NEW + APPLIED to prod.**
- **`scripts/citations-scholar-stub.md` NEW** — PB scholarly weekly cron spec for Nick to implement on home laptop.
- **`scripts/deploy-audit-wave.sh` NEW** — idempotent deploy script (schema migration + build + Pages deploy).

### Endpoint extensions
- **`PUT /api/team/:slug` extended** with `CITATION_FIELDS` bucket + API-key auth path. PB cron uses Bearer PB_API_KEY to write `citation_count` / `h_index` / `last_scholar_refresh`. Browser users (even PI) get 403 on these fields. Activity log skipped on the cron path.
- **`/api/insights/dashboard` extended** with `?week=YYYY-WW` param. Default = current ISO week. Frontend wires week-prev/next chevrons in PageHeader.
- **`/api/search` extended** with snippets (~160-char excerpt centered on match) + matchedField + per-type details (project_id on tasks for project-context routing).

### Brand primitives now adopted
- `EmptyStateArt` first consumers: InsightsPage (Bundle D INS-07), MyItems (Bundle D MI-08 indirectly via accentColor refactor)
- `CategoryIcon` now on: ProjectDetail header (Bundle D PD-8), Manuscripts (4 sites — Bundle D M-15)
- `HermesMark` and `HeartbeatLine` still under-utilized — candidates for future bundles

### Token discipline
- `--gold-on-emphasis` swapped where needed (AskTheLab project pill / Hermes pill / ProjectDetail agenda pill — Bundle D)
- Manuscripts stage progress dots use `--stage-fill-*` tokens (Bundle N M-06)

---

## Next steps

### Manual (Nick)
1. **PB scholarly weekly cron** — implement per `scripts/citations-scholar-stub.md` on home laptop (PB infra). Until it runs, `/api/citations` returns zero-state and StatsCard.totalCitations renders `—`.
2. **Wave 5 dispatch** — say go and I'll fire Bundle Q + T + U + V (+ K + S) in parallel. Sequencing same as wave 4: agents write to worktrees, I rebase + push + merge as they complete.
3. **CF Access cleanup** (still pending from Phase 39) — remove preset Google IdP from CF Access app. Generic OIDC `Google UMN` is the canonical IdP now.

### Verification (next session)
- `bash scripts/deploy-audit-wave.sh` is idempotent; safe to re-run if a prod issue surfaces.
- `npm run test:smoke` shows 15/27 green; the 12 portal failures are CF Access auth gating (pre-existing, expected — needs `tests/helpers/capture-auth.ts` fake-auth wiring per Rule 33). Not a regression.
- `npm run test:api` 24/24 green.

---

## Don't-forget

- **Wave 5 is BIG** — Bundle U (Personal 3-tab merge) is substrate-swap territory. Run the substrate-swap skill checklist before retiring `/portal/personal`. 24h dogfood window. Decision doc.
- **Schema v54 is Hub-only** — `team_members.citation_count` etc. don't mirror to brain.db. The cron WRITES to Hub from PB but PB doesn't keep a mirror.
- **Worktree dirs from waves 1-4 still locked** at `.claude/worktrees/agent-*`. Branches deleted on remote post-merge. Local cleanup if disk space matters: `git worktree remove --force .claude/worktrees/agent-{ID}`.
- **Spec mismatch incident on D2-followup** — DECISIONS-RESOLVED.md was inadvertently reverted to Semantic Scholar mid-day; restored to per-author Google Scholar via `scholarly` weekly cron per Nick's intent. Bundle G's deliverable matches the GS-scholarly path. Schema v54 columns (`citation_count`, `h_index`, `last_scholar_refresh`) live on `team_members`, not `publications`.
- **CHANGELOG.md still references TaskDrawer** at lines 179, 194, 221 — left intact intentionally as historical record (Phase 38 era). Per session-close anti-pattern: don't rewrite history.

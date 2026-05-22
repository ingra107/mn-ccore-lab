# Hub "simplify + improve" — 5-pass Codex review synthesis (2026-05-22)

5 sequential Codex (gpt-5.5, reasoning=high) passes, convention-aware (CLAUDE.md/REFERENCE/design-system)
but **WORKPLAN withheld** to avoid biasing triage. Exclusion lists chained pass→pass. ~8 findings
spot-checked by Claude against real code — all accurate. Raw + per-pass syntheses in this bundle dir.

Tags: `OVERLAP-WP` = already in WORKPLAN (codex refines it) · `NET-NEW` = not in WORKPLAN ·
`CONTRADICTS` = codex says change/remove something WORKPLAN wants to build (Nick decides).

---

## TIER 0 — Security / pre-adoption (NET-NEW; gate before broad team access)

Team adoption is "not yet broadly directed", so none of these is an *active* breach — but they're the
must-fix-before-20-users tier.

- **S1 · Over-exposed public GETs.** `isPublicGet()` (api/index.ts:112-129) allowlists `/api/activity`,
  `/api/projects/health`, `/api/team`. Result: unauth callers get activity-log actors/descriptions
  (`api/routes/activity.ts:10`), PB/private project slug+title+stage via health cards
  (`api/routes/projects.ts:304` — `handleProjectHealth` takes no user, no category filter), and full
  team rows incl. email + `auto_created` (`api/routes/team.ts:6` `SELECT *`). FIX: drop activity from
  the allowlist (or redact); pass user+category filter into project-health; project a public-safe
  column list for /api/team. **HIGH.**
- **S2 · Search bypasses PB-category visibility.** `api/routes/search.ts:127-155` queries projects/
  tasks/notes/comments/files with no category gate → any authed team member can search Nick-only PB
  content. FIX: shared `visibleProjects`/category filter, exclude PB unless `isNick()`. **HIGH.**
- **S3 · Digest has no owner-or-PI authz.** `api/index.ts:927`, `api/routes/digest-email.ts:319-416` —
  any authed user can generate another member's digest or send it to any umn.edu/gmail address. FIX:
  `actorSlug(user.email)===memberSlug || isPi`; restrict `to`. **HIGH.**
- **S4 · `tasks.notes` private-boundary breach.** Task list uses `SELECT t.*` (api/routes/tasks.ts:44)
  → returns `notes` (private per CLAUDE.md:145) to every team-visible fetch if populated; UI also labels
  team-visible project/task updates as "notes" (TaskDetailPanel.tsx:1039, ProjectUpdateFeed.tsx:27).
  FIX: drop `notes` from Hub task read/write contract OR redact from team SELECTs; reconcile the "notes"
  UI label. **HIGH.**
- **S5 · Protected-field nulls via `/api/mutations` (pass 5 Class 10 — top risk).** Allowlist
  (mutations.ts:116-137) permits `status/priority/assignee` (tasks) + `status/stage/category`
  (projects) as writable but only rejects *unknown keys*, not null *values* → a PB/API mutation can
  null a protected field, bypassing route-level protection (mutations.ts:332,785,869). FIX: reject
  null/empty for protected fields (or coerce to canonical default) before applyPatch. **HIGH.**
- **S6 · Identity-canonicalization bypass (pass 5 Class 1 — 7 sites + 2 found pass 4).** Raw client
  slug/email stored without `actorSlug()`/team canonicalizer: `handoffs.ts:45-81` (to_slug → patches
  `tasks.assignee` + notifies — worst), `questions.ts:128,180` (asked_by/author_slug), `tasks.ts:939`
  (note author_slug), `ideas.ts:27` (submitted_by), `project-documents.ts:37` (created_by),
  `dependencies.ts:63` (created_by=raw email); plus pass-4 `projects.ts:181` + `uploads.ts:88`
  (email.split('@')[0]). FIX: canonicalize/validate every actor write. **HIGH** (handoffs) / MED (rest).
- **S7 · Delete/cascade gaps (pass 5 Class 3+8).** PB-origin `/api/mutations` project delete clears
  only `record_id`, not id+slug → dangling slug-linked tasks (mutations.ts:634 vs handleDeleteProject
  projects.ts:619); project delete doesn't cascade newer child tables (project-documents, dependencies,
  submissions, conferences). FIX: route PB delete through the same id+slug cascade; extend the cascade. **MED-HIGH.**
- **S8 · JWT fail-open hardening (severity-CORRECTED).** jwt-verify.ts:92-101 returns the *unverified*
  decoded payload when `CF_ACCESS_TEAM_DOMAIN` is unset ("insecure pre-launch fallback"). **Verified
  2026-05-22: CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD + REQUIRE_AUTH are all set in prod** → prod verifies
  fully; this is NOT an active hole. FIX (defense-in-depth): fail *closed* when REQUIRE_AUTH=1 unless
  both vars present, so a future secret typo can't silently open it. **LOW-MED.**
- **C1 · X-API-Key contract mismatch (pass 4).** Middleware only accepts `Authorization: Bearer`; CORS
  doesn't allow `X-API-Key` though docs/secrets-inventory say PI GETs accept it. FIX: support it or
  delete the contract everywhere. **MED.**

## TIER 1 — Correctness NET-NEW (extends today's "done" CT sweep — it was NOT exhaustive)

- **CT-2 · ~12 more CT/UTC "today" sites (pass 5 Class 4 + pass 2 Calendar).** My api-only sweep missed:
  `projects.ts:308` (health overdue), `index.ts:1032/1053` (morning pulse `date('now')` + overdue),
  `pb-sector.ts:40,493` (milestones/plan-history `date('now')`), `regulatory.ts:35`, `submissions.ts:142`,
  `conferences.ts:35` — AND frontend: `CalendarPage.tsx:133/258/377`, `PBSector.tsx:52/179`,
  `TodayView.tsx:160`, `ConferencePrep.tsx:60`, `SubmissionTimeline.tsx:111`, `useApiData.ts:388`. FIX:
  `ctToday()` server-side (helper exists); a `localDateKey()`/`todayKey()` for the frontend sites. **MED**
  (each a one-day evening boundary on a compare/display).
- **C2 · Contract drift (pass 4) NET-NEW.** Frontend/backend slug LUT drift (emailSlug.ts 3 entries vs
  helpers.ts full — most users resolve to raw prefix → wrong identity/links); `key_link_*` fields returned
  by API but dropped in `ProjectRow`/`rowToProject` (useApiData.ts:125) → key links vanish from typed data;
  task operational fields (notes/effort/short_title/follow-up) returned but absent from `TaskRow`;
  `fetchManuscriptsAttention()` (api.ts:611) bypasses `fetchApi` → no res.ok check (401/500 read as data).
  **MED.**

## TIER 2 — Simplify (delete + consolidate)

**Delete now (pass 1, verified):** `handleUpsertTodayMd` (pb-today.ts:13; route retired index.ts:874);
tracked `.pyc` in tests/__pycache__. **Remove-with-replacement:** legacy MyTasks (src/pages/portal/
MyTasks.tsx + /portal/my-tasks-legacy → redirect); UnifiedMyTasks shim + AuthContext wrapper (inline);
stale seed path (scripts/seed-d1.ts + seed.sql + npm seed/db:seed/db:seed:remote — stale slugs); dead
tables `decision_log`/`*_new`/`watchlist` (after row-count check). `CONTRADICTS`-watch: PI-analytics
subendpoints + narrative/publication tables — see TIER-C.

**Consolidate (pass 2):** ~51 inline-date → expand `dateUtils` (folds into CT-2); ~36 raw `fetch(` →
typed `api.ts`/hook layer; attachment upload ×3 → `useAttachmentUpload`; task-grouping fork (today vs
MyTasks constants) → `taskGrouping`; stage/status taxonomy ×5 → one module (keep `toApiStage`); people
pickers → `useTeam()`/D1; Projects vs Manuscripts near-dup boards → one parameterized pipeline
[`OVERLAP-WP` T4 Manuscripts-DnD]; Personal quick-capture split-brain → global inbox.

## TIER 3 — UX / improve (many OVERLAP-WP — codex adds concrete sites)

- **Create flows lose draft on failure** (CreateTaskModal.tsx:143, CreateProjectModal.tsx:102,
  MyTasks/index.tsx:158) — close+reset before server confirm. `OVERLAP-WP UX-6` (codex gives the sites).
- **Today/ProjectDetail no error state** — collapse to empty/"not found" on query failure
  (TodayPage.tsx:47, ProjectDetail.tsx:82). **NET-NEW.**
- **Today meeting notes not persisted** (Timeline.tsx:69 — local state, vanish on nav). **NET-NEW.**
- **Today planning drag-only** (TaskRow.tsx:89 — fragile touch/kbd; add a Plan button). **NET-NEW**
  (relates to 3-click rule).
- **MeetingDetail attendance silent save-fail** (MeetingDetail.tsx:1226). **NET-NEW.**
- **Design-system drift:** MyTasks ListView div-grid not TableContainer (ListView.tsx:111); Ideas
  defaults kanban + opacity:0 hover (IdeasPage.tsx:52,310) `OVERLAP-WP PAGE-6`; Projects category dots
  not CategoryIcon + EmptyState bypasses EmptyStateArt `OVERLAP-WP UX-1`; done-row compound-opacity
  `OVERLAP-WP UX-2`.
- **A11y:** clickable task/meeting divs no kbd/role; CreateTaskModal dangling `aria-labelledby`
  (verified — no #task-assignee-label); MobileTabBar drawer no focus-trap/aria-current `OVERLAP-WP
  UX-7/8`; InlineSelect labels unassociated.
- **IMPROVE:** wire real `/api/proactive-brief` into Today (HermesSuggestsCard is heuristic, DEFERRED-UI
  for D17 s2) — adjacent `FAKE-2`; MyTasks `?open=` deep links half-built; ProfilePage → `/api/team/me`
  (refines today's STATE-2); export `normalizeStage` display fn; Personal legacy root paths → `PATHS`.

## TIER C — CONTRADICTS — RESOLVED by Nick 2026-05-22

> **PI-analytics subendpoints: KEEP until PAGE-5 designed** (do not fold yet).
> **Narrative tables: drop `narrative_projects` + `research_narratives` only; KEEP `project_publications`/`open_science_resources`/`pubmed_sync_log` for FAKE-1 citations.**

Original analysis:

- **PI-analytics subendpoints** (`/api/analytics/mentee-velocity|response-time|team-engagement`) — pass 1:
  fold into `/api/analytics/pi-dashboard` (it already returns those metrics). But WORKPLAN **PAGE-5**
  (Lab Overview / PI Analytics) may want them standalone. They're documented API (REFERENCE.md:117) →
  EXTERNAL-CALLER possible. **Decision: keep until PAGE-5 is designed, or fold now?**
- **Narrative/publication/citation tables** — pass 1 tags `narrative_projects`/`research_narratives`
  DEAD (computed, not read) but `project_publications`/`open_science_resources`/`pubmed_sync_log` as
  PENDING-DATA. WORKPLAN **FAKE-1** (citations via PB scholarly cron) may populate publication/citation
  tables. **Decision: don't drop publication/citation substrate if FAKE-1 will use it.**

## Clean negatives (pass 5 — useful confirmations)

- Class 2 (local-state staleness): no new instances (STATE-1 was the one, now fixed).
- Class 5 (enum drift): conferences/submissions checked clean.
- Class 6 (PK hardcode): mutations uses explicit composite-PK handling — prior bug stays fixed.
- Class 7 (Buffer/Node in Pages Functions): clean.
- Class 9 (cron guard drift): wrangler.toml crons match index.ts scheduler branches — 2026-05-09 fix holds.

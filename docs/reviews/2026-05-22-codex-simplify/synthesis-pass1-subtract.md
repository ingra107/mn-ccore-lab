**Verdict**

There is less truly-dead backend surface than the 0-caller list implies. Most “unused” endpoints are PB sync, mobile, cron, or deferred UI surfaces. The real simplification headroom is in stale front-end fallbacks, retired handlers, dangerous old seed paths, and temp/renamed schema debris. Delete the trivially dead pieces now; cut over the legacy MyTasks and seed paths with tests.

**DELETE NOW**

| item | file:line | proof-of-unused | rollback |
|---|---:|---|---|
| `handleUpsertTodayMd` | `api/routes/pb-today.ts:13` | `POST /api/pb/today` is explicitly retired in `api/index.ts:874`; the handler is also listed as not referenced by `index.ts` in `Scratch/codex-hub-simplify-2026-05-22/subtract-context.md:260`. | Revert deletion. |
| `tests/__pycache__/sync-pipeline.test.cpython-313.pyc` | `Scratch/codex-hub-simplify-2026-05-22/inventory.md:735` | Tracked Python bytecode cache, not source or fixture. | Revert deletion. |

**REMOVE-WITH-REPLACEMENT**

1. Current code: legacy MyTasks route and 1,376-line page stay mounted at `/portal/my-tasks-legacy` even though the comment says “remove once Round 2 has soaked” (`src/App.tsx:260`, `src/pages/portal/MyTasks.tsx:62`). The canonical replacement is `/portal/my-tasks` using `UnifiedMyTasks` (`src/App.tsx:259`), and the reference said the legacy route was scheduled to retire on `2026-05-02` (`REFERENCE.md:19`).

   What replaces it: redirect `/portal/my-tasks-legacy` to `/portal/my-tasks`, delete `src/pages/portal/MyTasks.tsx`, and remove the `MyTasksLegacy` lazy import.

   Cutover + rollback: one commit. Rollback is revert. Validation: `npm run build`, then smoke `/portal/my-tasks` and the redirect.

2. Current code: old seed path exposes `seed`, `db:seed`, and `db:seed:remote` (`package.json:11`, `package.json:13`, `package.json:15`). The generated SQL is stale: it still inserts old slugs like `nick`/`nate` and old categories like `clif`/`lab` (`scripts/seed.sql:15`, `scripts/seed.sql:101`), while current rules say post-Phase-36 slugs are preferred-name/last-name and shared categories are `MNCCORE / CLIF / Peripheral Brain` (`CLAUDE.md:210`, `CLAUDE.md:170`). Local seeding already has the replacement path: `test:local:setup` runs `local-db-bootstrap` + `local-db-seed` (`package.json:21`), and `local-db-seed` reads `scripts/seed/phase0-plan.json` (`scripts/local-db-seed.ts:6`).

   What replaces it: delete `scripts/seed-d1.ts`, delete `scripts/seed.sql`, and remove `seed`, `db:seed`, `db:seed:remote`. Keep `test:local:setup`.

   Cutover + rollback: one commit. Rollback is revert. Validation: `npm run test:local:setup`.

3. Current code: standalone PI analytics endpoints have 0 src callers (`Scratch/codex-hub-simplify-2026-05-22/subtract-context.md:17`). The aggregate endpoint already computes and returns `responseMetrics`, `menteeVelocity`, and `teamEngagement` (`api/routes/pi-dashboard.ts:181`).

   What replaces it: `/api/analytics/pi-dashboard`.

   Cutover + rollback: remove `GET /api/analytics/mentee-velocity`, `/response-time`, `/team-engagement` only after checking non-browser callers. Cross-boundary risk is documented API usage (`REFERENCE.md:117`). Rollback is revert. Validation: PI Analytics page plus one API smoke for `/api/analytics/pi-dashboard`.

4. Current code: `/api/papers/by-project` has 0 src callers (`Scratch/codex-hub-simplify-2026-05-22/subtract-context.md:120`) and overlaps with `/api/projects/:slug/papers` (`api/routes/paper-links.ts:4`, `api/routes/paper-links.ts:60`).

   What replaces it: use `/api/projects/:slug/papers` for project detail literature.

   Cutover + rollback: first verify which table is canonical because one joins `research_digest` and the other joins `publications` (`api/routes/paper-links.ts:8`, `api/routes/paper-links.ts:67`). Rollback is revert. Validation: Project literature tab smoke.

**TAGGED “looks unused” ledger**

Endpoints:
- `GET /api/analytics/mentee-velocity`, `GET /api/analytics/response-time`, `GET /api/analytics/team-engagement` — `TEAM-UNAWARE`; standalone slices duplicated by PI dashboard response; keep until cutover (`Scratch/codex-hub-simplify-2026-05-22/subtract-context.md:231`, `api/routes/pi-dashboard.ts:181`).
- `POST /api/deadline-dependencies`, `POST /api/deadline-dependencies/:id/delete` — `DEFERRED-UI`; graph read UI exists, editor path not wired; keep (`Scratch/codex-hub-simplify-2026-05-22/subtract-context.md:234`, `api/routes/deadline-cascade.ts:328`).
- `POST /api/digest-email/daily` — `EXTERNAL-CALLER`; cron calls it (`Scratch/codex-hub-simplify-2026-05-22/subtract-context.md:237`, `api/index.ts:1137`).
- `POST /api/digest-email`, `POST /api/digest-email/send`, `GET /api/digest-preview` — `TEAM-UNAWARE`; manual/preview email surfaces, not src UI; keep or fold into daily-only flow (`Scratch/codex-hub-simplify-2026-05-22/subtract-context.md:236`, `api/routes/digest-email.ts:315`).
- `POST /api/email-drafts/sync-bulk` — `EXTERNAL-CALLER`; brain.db push surface (`api/routes/email-drafts.ts:31`).
- `GET /api/expertise/suggest` — `DEFERRED-UI`; suggestion logic exists but no src literal caller; keep (`api/routes/expertise.ts:89`).
- `POST /api/file-activity/sync` — `EXTERNAL-CALLER`; brain.db/file activity push (`api/routes/file-activity.ts:35`).
- `GET /api/graph/collaboration` — `TEAM-UNAWARE`; public allowlisted graph endpoint, no src literal; keep (`api/index.ts:126`, `api/routes/publications.ts:44`).
- `GET /api/lane3/:table` — `EXTERNAL-CALLER`; PB Lane 3 sync contract (`api/routes/lane3.ts:1`).
- `POST /api/mutations` — `EXTERNAL-CALLER`; A3 brain.db write protocol (`api/routes/mutations.ts:1`).
- `GET /api/papers/by-project` — `UNCERTAIN`; overlaps project paper endpoint; cut over before removal (`api/routes/paper-links.ts:60`).
- `/api/pb/*` zero-caller items — `EXTERNAL-CALLER`; PI/PB-only API family is explicitly gated for PB/private data (`api/index.ts:221`, `api/routes/pb-sector.ts:235`).
- `GET /api/projects/deleted-since` — `EXTERNAL-CALLER`; PB delete mirror consumes it (`api/routes/projects.ts:678`).
- `GET /api/sessions` — `EXTERNAL-CALLER`; sync-cursor pull path (`api/routes/sessions.ts:22`).
- `POST /api/sync/mobile-tasks-to-hub` — `EXTERNAL-CALLER`; mobile PWA bridge (`api/routes/tasks.ts:976`).
- `GET /api/task-updates/recent` — `EXTERNAL-CALLER`; brain.db task update sync (`api/routes/tasks.ts:906`).
- `GET /api/team/by-expertise` — `DEFERRED-UI`; works as expertise lookup, no src literal; keep (`api/routes/pi-dashboard.ts:332`).
- `GET /api/updates/recent` — `UNCERTAIN`; 0 src refs only, do not delete without external log check (`Scratch/codex-hub-simplify-2026-05-22/subtract-context.md:223`).

Handlers:
- `applyInsert`, `applyUpdate`, `applyDelete` — `UNCERTAIN` as “route handlers,” but not dead; `processOne` calls them (`api/routes/mutations.ts:349`).
- `applyMutation` — `UNCERTAIN` as “not in index,” but not dead; task/project routes import and use it (`api/routes/tasks.ts:5`, `api/routes/projects.ts:4`).
- `hashTouched` — `UNCERTAIN`; exported for tests, per inline comment (`api/routes/mutations.ts:895`).
- `handleUpsertTodayMd` — `DEAD`; delete now (`api/routes/pb-today.ts:13`, `api/index.ts:874`).

Tables:
- `decision_log` — `DEAD`; renamed to `hub_decisions` (`api/schema-v66-rename-decision-log.sql:1`).
- `lab_answers_new`, `lab_questions_new`, `user_calendar_events_new` — `DEAD`; migration temp-table pattern, no api refs (`Scratch/codex-hub-simplify-2026-05-22/subtract-context.md:303`).
- `narrative_projects`, `research_narratives` — `DEAD`; narratives are computed from projects/dependencies/publications, not read from these tables (`api/routes/narratives.ts:15`).
- `open_science_resources`, `project_publications`, `pubmed_sync_log`, `trainee_milestones` — `PENDING-DATA`; no api refs, but likely future/import substrate; keep until owner decides (`Scratch/codex-hub-simplify-2026-05-22/subtract-context.md:315`).
- `watchlist` — `DEAD`; current watchlist is localStorage-backed (`src/hooks/useWatchlist.ts:11`).

**Over-abstraction to inline**

- `src/pages/portal/UnifiedMyTasks.tsx` is an 8-line shim that only re-exports `../MyTasks` (`src/pages/portal/UnifiedMyTasks.tsx:1`). Simpler form: lazy import `./pages/MyTasks` directly in `App.tsx` and delete the shim (`src/App.tsx:126`).
- `src/context/AuthContext.tsx` is a 7-line wrapper around `useAuthState` and `AuthContext.Provider` (`src/context/AuthContext.tsx:4`). Simpler form: export `AuthProvider` from `src/hooks/useAuth.ts` next to `AuthContext` and import it directly (`src/hooks/useAuth.ts:100`).

**Risk-ordered top 10 removals**

1. Delete tracked `.pyc` (`Scratch/codex-hub-simplify-2026-05-22/inventory.md:735`).
2. Delete `handleUpsertTodayMd` (`api/routes/pb-today.ts:13`).
3. Redirect/delete legacy MyTasks (`src/App.tsx:260`).
4. Delete `UnifiedMyTasks` shim (`src/pages/portal/UnifiedMyTasks.tsx:1`).
5. Remove stale seed scripts/package entries (`package.json:11`, `scripts/seed.sql:101`).
6. Remove remote seed commands specifically (`package.json:15`).
7. Drop temp `*_new` D1 tables after row-count check (`Scratch/codex-hub-simplify-2026-05-22/subtract-context.md:303`).
8. Drop stale `watchlist` table after row-count check (`src/hooks/useWatchlist.ts:11`).
9. Cut over/remove standalone PI analytics subendpoints (`api/routes/pi-dashboard.ts:195`).
10. Cut over/remove duplicate `papers/by-project` (`api/routes/paper-links.ts:60`).

**What I could NOT verify**

- I did not verify Cloudflare access logs, PB sync logs, Gmail Apps Script calls, or mobile PWA calls; endpoint tags that mention external callers are based on code comments/contracts, not live traffic.
- I did not inspect database row counts, so D1 table drops are not “delete now” unless marked temp/renamed.
- I did not run tests because this was a read-only review pass.

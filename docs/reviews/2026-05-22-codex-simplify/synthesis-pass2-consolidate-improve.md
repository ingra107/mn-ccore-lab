**Verdict**

The codebase has the right canonical primitives, but the highest-traffic surfaces still fork them: Today/MyTasks task grouping, local-day/date math, raw fetch/error handling, person lookup, status/stage taxonomies, attachment upload, and quick capture. The best pass-2 wins are not broad rewrites; they are forcing the busiest workflows back through existing shared utilities, then surfacing already-built backend capability in Today and MyTasks.

**CONSOLIDATE — Top Opportunities**

1. Task grouping + Today state | 4 sites: `src/components/today/constants.ts:68`, `src/components/today/constants.ts:94`, `src/pages/MyTasks/constants.ts:38`, `src/pages/MyTasks/constants.ts:70`, `src/pages/MyTasks/index.tsx:164`, `src/pages/MyTasks/components/InlineDetail.tsx:28` | converge on expanded `src/lib/taskGrouping.ts:1` plus `src/hooks/useTodayState.ts:84` APIs | effort M.

2. Raw fetch/error handling | 36 candidate files from `Scratch/codex-hub-simplify-2026-05-22/consolidate-context.md:62`; concrete sites include `src/hooks/useApiData.ts:270`, `src/hooks/useApiData.ts:404`, `src/components/CalendarFeedsPanel.tsx:23`, `src/hooks/useNotifications.ts:17`, `src/hooks/usePBRelay.ts:3`, while canonical wrapper exists at `src/lib/api.ts:205` | converge on typed `src/lib/api.ts` functions and hook-layer mutations | effort L.

3. Attachment/R2 upload flow | 3 sites: `src/components/FileUpload.tsx:55`, `src/pages/ProjectDetail.tsx:367`, `src/components/tasks/TaskDetailPanel.tsx:1006` | extract `useAttachmentUpload` / `uploadAttachment` around presign + PUT + done + invalidation | effort M.

4. Local date formatting/date math | 51 candidate files from `Scratch/codex-hub-simplify-2026-05-22/consolidate-context.md:20`; concrete sites include `src/pages/portal/CalendarPage.tsx:46`, `src/pages/portal/CalendarPage.tsx:133`, `src/pages/portal/AnalyticsPage.tsx:42`, `src/pages/portal/AnalyticsPage.tsx:97`, `src/components/dashboard/UpcomingCard.tsx:18`, `src/pages/MyTasks/constants.ts:88`; canonical utilities exist at `src/lib/dateUtils.ts:6` | add local-date-key/range/due-label helpers to `dateUtils` and replace inline math | effort M.

5. Stage/status/category taxonomies | 5 sites: canonical stages at `src/lib/stageNormalize.ts:22`, duplicated project stages at `src/pages/Projects.tsx:28`, manuscript stages at `src/pages/portal/ManuscriptsPage.tsx:44`, analytics display map at `src/pages/portal/AnalyticsPage.tsx:18`, legacy stage colors at `src/lib/taskConstants.ts:86` | export `normalizeStage`/labels/tokens from one taxonomy module; keep `toApiStage` for writes | effort M.

6. Person/team lookup | 4 sites: canonical `getPersonInfo` at `src/data/team.ts:103`, local assignee pool at `src/components/InlineAssigneePicker.tsx:16`, local hover builder at `src/components/InlineAssigneePicker.tsx:45`, meeting hover builder at `src/pages/MeetingDetail.tsx:57`, name bridge at `src/lib/nameUtils.ts:79` | centralize assignable-member and hover-profile helpers, backed by D1 team rows where available | effort M.

7. Static people pickers vs auto-created D1 team members | static picker sources at `src/components/InlineAssigneePicker.tsx:16` and `src/pages/MeetingDetail.tsx:1217`; auto-created members are an explicit system rule at `CLAUDE.md:252` | use `useTeam()`/team API rows in assignee and attendance pickers with static fallback for special actors | effort M.

8. Projects/Manuscripts pipeline boards | 2 near-duplicate boards: `src/pages/Projects.tsx:775`, `src/pages/portal/ManuscriptsPage.tsx:903`; both also duplicate stage labels at `src/pages/Projects.tsx:28` and `src/pages/portal/ManuscriptsPage.tsx:44` | one parameterized pipeline board using shared stage taxonomy and per-entity mutation callbacks | effort L.

9. Data-page controls | shared table pattern is documented at `docs/design-system.md:106`; Projects hand-rolls controls at `src/pages/Projects.tsx:267`, Manuscripts has reusable-style controls at `src/pages/portal/ManuscriptsPage.tsx:296`, Ideas hand-rolls view controls at `src/pages/portal/IdeasPage.tsx:234`, Decisions has another control block at `src/pages/portal/DecisionsPage.tsx:914` | converge on `TableControls`/`PageHeader` conventions | effort M.

10. Quick capture split brain | global PB capture is mounted at `src/components/PortalLayout.tsx:288` and posts inbox events at `src/components/QuickCaptureInbox.tsx:117`; Personal has a separate idea-only quick capture at `src/pages/portal/PersonalPage.tsx:145` and renders it at `src/pages/portal/PersonalPage.tsx:1072` | remove the local capture or make it dispatch the global inbox opener with an idea tag | effort S.

**IMPROVE — Prioritized**

1. Today should use the real proactive brief | Today rail renders `HermesSuggestsCard` at `src/pages/portal/TodayPage.tsx:352`; that card says it is heuristic-only at `src/components/today/rail/HermesSuggestsCard.tsx:1` and computes local bullets at `src/components/today/rail/HermesSuggestsCard.tsx:24`; the real API returns overdue/due/stale/focus data at `api/routes/proactive-brief.ts:5` and `api/routes/proactive-brief.ts:68`; dashboard already consumes it at `src/components/dashboard/ProactiveBriefCard.tsx:17` | matters because Today is the stated landing surface at `CLAUDE.md:243` | replace or augment `HermesSuggestsCard` with `useProactiveBrief`, keeping heuristic fallback | tag DEFERRED-UI.

2. MyTasks deep links are half-built | task detail copies `/portal/my-tasks?open=` at `src/components/tasks/TaskDetailPanel.tsx:301`; MyTasks parses view/filter/search only at `src/pages/MyTasks/index.tsx:49` and starts with no drawer task at `src/pages/MyTasks/index.tsx:73`; proactive brief links use `?id=` at `src/components/dashboard/ProactiveBriefCard.tsx:102` | matters because alerts and copied links do not reliably open the target work item | standardize on `open`, support old `id` temporarily, and make MyTasks open/sync the drawer from the param | tag DEFERRED-UI.

3. Quick capture should route to PB inbox, not a local idea-only form | global inbox captures note/idea/decision/follow-up tags at `src/components/QuickCaptureInbox.tsx:9` and posts to `/api/inbox-events/sync-bulk` at `src/components/QuickCaptureInbox.tsx:117`; Personal quick capture only creates an idea at `src/pages/portal/PersonalPage.tsx:145` | matters because the same label sends users to two different intake systems | Personal should open the global inbox with `idea` preselected, or the local widget should be deleted | tag TEAM-UNAWARE.

4. Profile should not hand-fetch a raw team shape | Profile says `useTeam` strips needed fields at `src/pages/portal/ProfilePage.tsx:45`, then separately fetches `/api/team` at `src/pages/portal/ProfilePage.tsx:63`; it invalidates both `['team']` and `['team-raw']` at `src/pages/portal/ProfilePage.tsx:108` | matters because identity edits are cache-fragile and easy to make stale | add `fetchTeamRaw`/`useTeamRaw` or `/api/team/me`, then remove the component-local fetch | tag DEFERRED-UI.

5. Attachment upload needs one reliability path | FileUpload uploads via presign/done at `src/components/FileUpload.tsx:55`; ProjectDetail repeats the flow at `src/pages/ProjectDetail.tsx:367`; TaskDetailPanel repeats it again at `src/components/tasks/TaskDetailPanel.tsx:1006` | matters because upload failures and invalidation will drift across comments, tasks, and projects | ship one upload helper/hook and use it everywhere | tag none.

6. D1-created people should be selectable | static assignment sources are `src/components/InlineAssigneePicker.tsx:16` and `src/pages/MeetingDetail.tsx:1217`; the system explicitly auto-creates missing team members at `CLAUDE.md:252` | matters because a person can exist in backend data but be missing from assignment/attendance UI | feed pickers from team API rows, with static fallback for known non-human/special identities | tag DEFERRED-UI.

7. Stage normalization should match the rulebook | CLAUDE says use `normalizeStage()`/`toApiStage()` at `CLAUDE.md:221`; code keeps `normalizeStage` private at `src/lib/stageNormalize.ts:58` and only exports `stageIndex`/`toApiStage` at `src/lib/stageNormalize.ts:65` | matters because display labels, filters, and writes can silently diverge | export the display normalizer and remove local stage maps from Projects/Manuscripts/Analytics | tag none.

8. Calendar should stop using UTC date keys | dateUtils protects date-only parsing at noon at `src/lib/dateUtils.ts:6`; Calendar uses `toISOString().split('T')[0]` for ranges and today keys at `src/pages/portal/CalendarPage.tsx:46`, `src/pages/portal/CalendarPage.tsx:133`, `src/pages/portal/CalendarPage.tsx:258`, `src/pages/portal/CalendarPage.tsx:377` | matters for Central-time evening work and all-day event boundaries | add `localDateKey()` and migrate Calendar/Analytics/MyTasks | tag none.

9. Personal quick actions use legacy-looking root paths | links point to `/tasks?create=true`, `/ideas?create=true`, and `/ask?create=true` at `src/pages/portal/PersonalPage.tsx:1021`, `src/pages/portal/PersonalPage.tsx:1033`, `src/pages/portal/PersonalPage.tsx:1045`; route constants are the required convention at `CLAUDE.md:209` | matters because quick actions should land inside the portal shell | replace with `PATHS` routes and matching create/open params | tag none.

10. Projects should get the Manuscripts-grade pipeline behavior | Projects has its own non-DnD board at `src/pages/Projects.tsx:775`; Manuscripts has a DnD board at `src/pages/portal/ManuscriptsPage.tsx:903` | matters because stage movement is a core lab workflow and should behave consistently across entities | extract the Manuscripts board pattern into a shared entity pipeline | tag none.

**OVERLAP With Pass 1**

- Legacy MyTasks/shim cleanup is already pass 1: `src/pages/portal/UnifiedMyTasks.tsx` re-export behavior is visible at `CLAUDE.md:27`, but I did not re-report it as a new consolidation.
- Retired Today markdown upsert is already pass 1; I only used current Today/PB read-side evidence where relevant.
- Standalone PI analytics endpoints, papers endpoint overlap, stale seed scripts, and dead D1 tables were not re-reported.

**Risk-Ordered Top 10**

1. Wire proactive brief into Today.
2. Make MyTasks `?open=` deep links work and fix proactive brief’s `?id=`.
3. Consolidate task grouping and Today-state writes.
4. Extract shared attachment upload.
5. Move raw fetch sites behind typed API/hook functions.
6. Replace UTC date-key generation with local date utilities.
7. Centralize stage/status/category taxonomy.
8. Feed people pickers from D1 team data.
9. Remove Personal’s duplicate quick capture path.
10. Extract shared pipeline board for Projects/Manuscripts.

**What I Could NOT Verify**

- I did not verify every one of the 51 date, 36 fetch, and 19 person-lookup candidates from `Scratch/codex-hub-simplify-2026-05-22/consolidate-context.md:20`, `Scratch/codex-hub-simplify-2026-05-22/consolidate-context.md:62`, and `Scratch/codex-hub-simplify-2026-05-22/consolidate-context.md:100`; I sampled high-confidence sites.
- I did not run tests, build, or smoke the app; this was a read-only review pass.
- I did not audit `docs/`, `audit/`, or `public/` beyond the requested reference files.

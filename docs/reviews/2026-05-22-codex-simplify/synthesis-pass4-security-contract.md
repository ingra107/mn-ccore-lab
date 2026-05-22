**Verdict**  
Not pre-adoption ready. The global auth shape is mostly in place, but there are launch-blocking holes in read visibility and identity contracts: fail-open JWT verification, public/internal endpoint bleed, PB-category leaks outside the Nick gate, digest exfiltration, and private-note semantics that are not enforced by the API. Fix these before opening to 20 users.

**SECURITY — Gaps**

`api/jwt-verify.ts:11-14`, `api/jwt-verify.ts:92-100`, `api/jwt-verify.ts:120-124` | JWT verification fails open when `CF_ACCESS_TEAM_DOMAIN` is missing, and `CF_ACCESS_AUD` is optional | A forged `CF_Authorization` cookie can claim any email; `getAuthUser()` returns that email after `verifyCfAccessJwt()` (`api/helpers.ts:74-80`), and PI checks trust it (`api/helpers.ts:324-327`) | Fail closed when `REQUIRE_AUTH=1` unless both `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are configured; add a deploy smoke check | Critical

`api/index.ts:127-129`, `api/index.ts:244-249`, `api/routes/activity.ts:10-26` | `/api/activity` is public under `REQUIRE_AUTH=1` | Unauthenticated request returns `activity_log` descriptions, actors, related IDs | Remove `/api/activity` from `isPublicGet()` or create a separate redacted public feed | High

`api/index.ts:127-128`, `api/routes/projects.ts:304-306`, `api/routes/projects.ts:247-254` | `/api/projects/health` is public and does not apply the Peripheral Brain/Nick-only category filter | Unauthenticated request can enumerate active PB/private project slug/title/stage/status via health cards | Pass `user/apiKeyValid` into `handleProjectHealth()` and apply the same category filter, or make the endpoint authenticated | High

`api/routes/search.ts:127-147`, `api/routes/search.ts:149-155`, `api/routes/projects.ts:247-254` | Search bypasses the PB-category visibility model | Any authenticated team member can search into PB projects, task descriptions, project notes, task notes, comments, and get snippets | Add a shared `visibleProjects`/category filter to search; join through projects for tasks/notes/comments/files and exclude PB unless `isNick()` | High

`api/index.ts:927-929`, `api/routes/digest-email.ts:319-338`, `api/routes/digest-email.ts:383-416` | Digest generation/sending has no owner-or-PI authz | Any authenticated user can generate another member’s task digest, or send it to any `umn.edu`/`gmail.com` address | Pass `USER(c)` into digest handlers; require `actorSlug(user.email) === memberSlug` or PI; restrict `to` to the member’s email unless PI | High

`CLAUDE.md:145-148`, `api/routes/tasks.ts:44`, `api/routes/tasks.ts:212-215`, `api/routes/tasks.ts:328` | `tasks.notes` is treated as writable/returnable D1 data despite the documented private brain.db notes boundary | If PB sync or a caller writes `notes`, every authenticated task list fetch returns it via `SELECT t.*` | Remove `notes` from Hub task write/read contract, or redact it from all team-visible SELECTs | High

`src/pages/ProjectDetail.tsx:1827-1828`, `src/components/ProjectUpdateFeed.tsx:27-35`, `api/routes/projects.ts:287-292`, `src/components/tasks/TaskDetailPanel.tsx:1039-1042`, `src/components/tasks/TaskDetailPanel.tsx:1079-1083`, `api/routes/tasks.ts:929-934` | UI labels “notes” as private but stores/reads them through team-visible project/task update endpoints | Users will enter private lab-notebook content that other team members can read/search | Either rename as team-visible progress notes everywhere or implement owner-scoped private notes | High

`api/routes/projects.ts:181-186`, `api/routes/uploads.ts:88-97`, `api/helpers.ts:239-269` | Raw `email.split('@')[0]` bypasses `actorSlug()` | Nick and several team members write `pi`/`uploaded_by` as NetID or email prefix instead of canonical slug; ownership/filtering drifts | Replace both with `actorSlug(user.email)` | Medium

`api/middleware/api-key-auth.ts:7-15`, `api/helpers.ts:7-10`, `api/routes/team.ts:60-64` | API-key contract says X-API-Key/Bearer, but middleware only accepts `Authorization: Bearer` and CORS does not allow `X-API-Key` | PB automation or callers using the documented X-API-Key path fail auth; reviewers may believe a header is guarded when it is ignored | Support `X-API-Key` explicitly or delete that contract everywhere | Medium

`api/index.ts:118`, `api/routes/team.ts:6-9`, `api/types.ts:51-53` | Public `/api/team` returns `SELECT *`, including email and `auto_created` | Unauthenticated callers can retrieve internal directory fields, not just public profile fields | Project a public-safe column list; move full team rows to an authenticated endpoint | Medium

**CONTRACT — Drift**

`api/helpers.ts:239-261`, `src/lib/emailSlug.ts:15-19`, `src/hooks/useAuth.ts:61-70` | Frontend email-prefix LUT has 3 entries; backend has the full team map | Most users resolve to raw prefixes, causing wrong profile links, filters, and display fallback | Generate one shared LUT or expand frontend in lockstep | Silent wrong identity

`api/routes/projects.ts:224-265`, `src/lib/api.ts:44-59`, `src/data/types.ts:99-105`, `src/hooks/useApiData.ts:125-137` | API returns project key-link columns via `SELECT *`, frontend `Project` supports them, but `ProjectRow`/`rowToProject()` drop them | Key links disappear from typed project data | Add `key_link_1/2/3` and desc fields to `ProjectRow` and `rowToProject()` | Wrong data

`api/routes/tasks.ts:44`, `api/routes/tasks.ts:212-215`, `src/lib/api.ts:90-128` | Task API returns/accepts operational fields (`notes`, `effort`, `short_title`, follow-up metadata) not declared in `TaskRow` | Typed UI code cannot safely render/edit what the API returns; optimistic state can silently lose fields | Either type the full returned row or stop returning non-UI fields | Silent data loss

`CLAUDE.md:297-300`, `src/lib/api.ts:49-52`, `src/hooks/useApiData.ts:130-133`, `api/routes/projects.ts:498-506` | Frontend treats protected project fields as nullable/empty, while server rejects/skips empty protected fields | Optimistic updates can show empty `category/stage/status`, then revert/no-op | Type as non-null canonical enums and validate before mutation | Silent revert

`src/lib/api.ts:611-617` | `fetchManuscriptsAttention()` bypasses `fetchApi()` and never checks `res.ok` | 401/500 JSON is consumed as successful data shape | Use `fetchApi` or throw on non-2xx | Wrong data / hidden auth failure

`api/routes/digest-email.ts:273-282`, `CLAUDE.md:209` | Digest email links use root `/my-tasks` and `/settings`, but internal routes are canonical under `/portal/*` | Email CTAs rely on redirects or land outside gated route expectations | Change links to `/portal/my-tasks` and `/portal/settings` | Wrong navigation

**OVERLAP with Passes 1-3**

None of the above is a direct rediscovery from the provided pass 1-3 list. The team/profile typing issue is adjacent to “ProfilePage team-raw → `/api/team/me`”, so I did not list that as a standalone finding.

**Risk-Ordered Top 10**

1. Fail-open JWT verification: `api/jwt-verify.ts:92-100`
2. Digest exfiltration across users: `api/routes/digest-email.ts:319-338`, `api/routes/digest-email.ts:383-416`
3. Public activity feed: `api/index.ts:127-129`, `api/routes/activity.ts:10-26`
4. Public project health leaks PB projects: `api/routes/projects.ts:304-306`
5. Search bypasses PB visibility: `api/routes/search.ts:127-155`
6. `tasks.notes` private boundary breach: `api/routes/tasks.ts:44`, `api/routes/tasks.ts:212-215`
7. UI “private notes” actually team-visible: `src/components/tasks/TaskDetailPanel.tsx:1039-1042`, `api/routes/tasks.ts:929-934`
8. Public `/api/team SELECT *`: `api/routes/team.ts:6-9`, `api/types.ts:51-53`
9. Frontend/backend slug LUT drift: `api/helpers.ts:239-261`, `src/lib/emailSlug.ts:15-19`
10. Project key-link fields dropped in typed transform: `src/hooks/useApiData.ts:125-137`

**What I Could NOT Verify**

Production Cloudflare secrets: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `REQUIRE_AUTH`, and `PB_API_KEY` are runtime secrets, not visible in repo. I could only verify that the code treats `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` as optional (`api/types.ts:11-13`) and fails open when the team domain is absent (`api/jwt-verify.ts:92-100`). I also did not verify the live D1 schema or production data contents from this read-only pass.

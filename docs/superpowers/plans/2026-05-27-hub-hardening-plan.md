# Hub Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the MN-CCORE Lab Hub bulletproof, clear, and efficient for the 19-person team — close the access-control/leak holes, stop silent write-loss under the new Hub-first model, fix correctness bugs, clean prod data, and re-embed the design ethos — sequenced ship-on-green.

**Architecture:** Phased remediation. Phase 0 repairs the local test env (blocks all verification). Phases 1-3 are the security/data-loss core (ship before broad team reliance). Phases 4-9 are correctness, cleanup, UX, design, simplification, docs. Each fix is an independent code path unless noted → lands on green, rollback = revert commit. Source audit: `Scratch/audit-2026-05-27/` (FINAL-PLAN.md + findings/ + codex/synthesis.md).

**Tech Stack:** Hono v4.12 Workers API (TypeScript, `api/`), React 19 + Tailwind v4 (`src/`), Cloudflare D1 (schema v69), PB Python sync (`~/Peripheral-Brain/scripts/db/`), Vitest 4.1 + Playwright 1.59.

**Gating decisions (recommended defaults baked in; Nick may override):**
- **D1 notes:** read-side stopgap NOW (Phase 2); write-side removal = M5. ✅ baked.
- **D2 silent-write-loss:** build the retry wiring + fail-loud caller checks (Codex verdict B). ✅ baked as Phase 3.
- **D3 validators:** flip the 4 Phase-A1 validators ON *after* Phase 5 cleanup. ✅ baked as Phase 5 tail.
- **D4 cleanup authority:** Phase 5 mutates prod D1 (soft-delete test rows, normalize enums). ⚠️ NEEDS NICK GO before Phase 5 runs.
- **D5 WebSocket:** one-line invalidation fix now (Phase 8a); evaluate deleting the DO layer separately (Phase 8b, deferred). ✅ baked.

---

## File Structure

**API (TypeScript, `api/`)**
- `api/routes/notifications.ts` — auth-scope all 4 handlers to the JWT user (Phase 1)
- `api/index.ts` — task-files ACL (attach/list/delete), notifications route registration, sessions/lane3 gating (Phase 1)
- `api/routes/sessions.ts` — PI-gate or move under `/api/pb/*` (Phase 1)
- `api/routes/projects.ts` — PB-visibility filter on updates; upsert enum guard; delete idempotency-before-cascade; conflict→409; Hermes slug→id (Phases 1,4)
- `api/routes/tasks.ts` — notes `SELECT *`→projection (:226); PB-visibility on task-updates; delete idempotency-before-cascade; task-comment Hermes path (Phases 2,1,4)
- `api/routes/meetings.ts` — notes `SELECT *`→projection (:38) (Phase 2)
- `api/routes/team.ts` — cv-data projection (Phase 1)
- `api/routes/mutations.ts` — project_id resolver/guard (Phase 4)
- `api/routes/pi-dashboard.ts` — mentee-velocity exact match; grants funded/submitted semantics (Phase 6)
- `api/helpers.ts` — shared `recipientFromAuth()` + `assertOwnerOrPi()` helpers (Phase 1)

**Frontend (React, `src/`)**
- `src/index.css` — semantic `--task-*` CSS vars, light + dark (Phase 7)
- `src/lib/taskGrouping.ts:28-37` — replace JS hex consts with CSS-var refs (Phase 7)
- `src/pages/portal/TodayPage.tsx:258,277`, `src/pages/MyTasks/index.tsx:237` — drop dark-lock, use theme vars (Phase 7)
- `src/pages/portal/IdeasPage.tsx`, `SettingsPage.tsx`, `GrantsPage.tsx`, `DeadlineCascadePage.tsx`, `MenteeMilestonesPage.tsx` — dead controls (Phase 6)
- `src/hooks/useRealtimeSync.ts:19-28` — invalidation fix (Phase 8a)
- `src/hooks/mutations/useIdeaMutations.ts`, `useOtherMutations.ts` — onError rollback (Phase 6)
- shared loading/error/empty component (Phase 6)

**PB sync (Python, `~/Peripheral-Brain/scripts/db/`)**
- `scripts/db/outbox.py:2117-2196` — on Hub-first soft-failure for tasks/projects updates, enqueue to the existing retry/dead-letter surface (Phase 3)
- `scripts/db/query.py` — `complete_task`/`update_task`/`uncomplete_task` callers fail-loud (Phase 3)
- `.claude/skills/process/SKILL.md`, `.claude/rules/task-management.md` — require return-check before TODAY.md edits (Phase 3)

**Data / D1**
- `scripts/wrangler-d1` (wrapper) — all prod D1 cleanup SQL (Phase 5)
- `api/schema-v70-*.sql` — UNIQUE(slug) partial index + NOT NULL constraints (Phase 5 tail)

**Tests / infra**
- `npm run test:local:setup` + seed refresh (Phase 0)
- `scripts/check-opacity-floor.mjs` — new lint (Phase 7)

**Docs**
- `REFERENCE.md`, skill docs, `hub-schema-sync/agent.md` (Phase 9)

---

## Phase 0 — Repair local test env (UNBLOCKS verification)

Lane 7b proved local Miniflare is ~20 migrations behind → every write-flow test 500/400s. Until fixed, we cannot verify any write-path fix locally. Do this first.

### Task 0.1: Rebuild local test D1 to schema v69 + seed canonical fixtures
**Files:** Modify: local D1 (`mnccore-lab-test`), test seed script (find via `package.json` scripts).
- [ ] **Step 1:** Inspect the setup script. Run: `npm run | grep -i "test:local\|setup"` and `rg -n "test:local:setup" package.json`. Expected: a script that applies migrations to local D1.
- [ ] **Step 2:** Run `npm run test:local:setup`. Expected: applies v50–v69 migrations incl. `processed_mutations` (v58), `group_override` (v50), `citation_count` (v54), `commitments.to_slug` (v69).
- [ ] **Step 3:** Verify schema parity. Run a local D1 query for `processed_mutations` + `tasks` columns; confirm present. Expected: tables exist.
- [ ] **Step 4:** Seed `team_members` (≥3 canonical slugs incl. `claude-ai`) + projects with **canonical** enums (`category` MNCCORE/CLIF/Peripheral Brain; `status` active; `stage` data_collection). Fix the seed file if it carries legacy `'Active'`/`'Analysis'`/`'clif'`.
- [ ] **Step 5:** Smoke: `GET /api/tasks`, `GET /api/team`, `GET /api/projects` against local — expect 200, not 500.
- [ ] **Step 6:** Commit. `git commit -m "test: rebuild local D1 to v69 + canonical seed (unblock write-flow tests)" -- <seed files>`

### Task 0.2: Confirm a write round-trip works locally
- [ ] **Step 1:** Run the Playwright local write suite: `bash scripts/run-tests.sh` (local mode) for a single create-task flow.
- [ ] **Step 2:** Expected: task create persists + appears. If still failing, capture the exact error before proceeding — Phase 1+ verification depends on this.

---

## Phase 1 — Security / Access-Control workstream (T0-A) [ship-on-green]

The dominant theme. Multiple endpoints trust caller-supplied identity or skip the PI gate. All independent paths.

### Task 1.1: Shared auth helpers
**Files:** Modify: `api/helpers.ts`
- [ ] **Step 1: Write the failing test.** `api/helpers.test.ts`:
```ts
import { recipientFromAuth } from './helpers'
test('recipientFromAuth returns the JWT user slug, ignoring query param', async () => {
  const req = new Request('https://x/api/notifications?recipient=someone-else', {
    headers: { 'Cf-Access-Jwt-Assertion': FAKE_JWT_FOR('nick-ingraham') },
  })
  expect(await recipientFromAuth(req, env)).toBe('nick-ingraham')
})
```
- [ ] **Step 2:** Run `npm run test:api -- helpers.test.ts` → FAIL (no export).
- [ ] **Step 3:** Implement `recipientFromAuth(request, env)` = `const u = await getAuthUser(request, env); return u ? actorSlug(u.email) : null`. ⚠️ `AuthUser` has NO `.slug` (verified `helpers.ts:27-31`) — derive the slug via `actorSlug(u.email)` (`helpers.ts:266-269`). Add `assertOwnerOrPi(request, env, ownerSlug)` returning a 403 Response or null. (See Pass-2 amendment A2: prefer the broader `actorSlugFromRequest` primitive.)
- [ ] **Step 4:** Run test → PASS.
- [ ] **Step 5:** Commit. `git commit -m "feat(api): recipientFromAuth + assertOwnerOrPi auth helpers" -- api/helpers.ts api/helpers.test.ts`

### Task 1.2: Scope notification read + write to the auth user
**Files:** Modify: `api/routes/notifications.ts:6-55`, `api/index.ts` (registrations ~567-568, 771-781)
- [ ] **Step 1: Failing test** `api/routes/notifications.test.ts`: caller authed as `nick-ingraham` requesting `?recipient=emma-bromley` gets only nick's rows (or 403), and `read-all` cannot pass a foreign recipient.
- [ ] **Step 2:** Run → FAIL (current code reads the query param verbatim).
- [ ] **Step 3:** In each of `handleNotifications`, `handleNotificationCount`, `handleMarkAllNotificationsRead`: derive `recipient = await recipientFromAuth(request, env)`; ignore the query param. In `handleMarkNotificationRead(id)`: `SELECT recipient_slug` first, `assertOwnerOrPi`. Pass `request` through the route registrations in `api/index.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit. `git commit -m "fix(security): scope notifications to authed user (read+suppress+mark)" -- api/routes/notifications.ts api/index.ts api/routes/notifications.test.ts`

### Task 1.3: Task-file ACL — attach, list, delete
**Files:** Modify: `api/index.ts:667-672` (list `SELECT *`), `:727-736` (attach), `:743-746` (delete)
- [ ] **Step 1: Failing test:** non-owner cannot delete/attach a task file; list returns only files for tasks the user can see.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Gate all three on `getAuthUser`; for delete, look up the file's task + `assertOwnerOrPi`; convert hard `DELETE` to soft-delete + `logActivity`. List: project the columns (no raw `SELECT *`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit. `git commit -m "fix(security): task-file attach/list/delete require ownership+audit" -- api/index.ts <test>`

### Task 1.4: Gate `/api/sessions` + `/api/lane3/:table` (PB-private data)
**Files:** Modify: `api/index.ts:383-384`, `api/routes/sessions.ts:48`
- [ ] **Step 1: Failing test:** non-PI request to `/api/sessions` → 403; PI → 200.
- [ ] **Step 2:** Run → FAIL (currently any authed user reads `SELECT * FROM sessions`).
- [ ] **Step 3:** Move both registrations under the `/api/pb/*` PI-gate (rename to `/api/pb/sessions-stream` + `/api/pb/lane3/:table`, update the 2 frontend callers) OR add an explicit `isPiRequest` check at the top of each handler. Prefer the explicit check (no route rename = no frontend churn). Project columns in `handleGetSessions`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit. `git commit -m "fix(security): PI-gate /api/sessions + /api/lane3 (PB-private)" -- api/index.ts api/routes/sessions.ts <test>`

### Task 1.5: PB-visibility filter on update feeds + cv-data projection
**Files:** Modify: `api/routes/projects.ts:447-458` (updates/recent), `:298-302` (project updates), `api/routes/tasks.ts:946-961` (task-updates/recent), `api/routes/team.ts:36-42` (cv-data)
- [ ] **Step 1: Failing test:** non-PI caller does not receive rows whose project `category='Peripheral Brain'`; cv-data response has no `email`/`auto_created`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Apply the same `category != 'Peripheral Brain' OR isPi` filter used by `handleGetSearch`/`handleGetActivity` to the 3 update feeds; replace `team.ts` `SELECT *` with the public column projection used by `handleGetTeam`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit. `git commit -m "fix(security): PB-visibility filter on update feeds + cv-data projection" -- <files> <test>`

---

## Phase 2 — notes read-side leak stopgap (T0-B) [ship-on-green, M5-independent]

### Task 2.1: Stop `notes` leaking via `SELECT *`
**Files:** Modify: `api/routes/tasks.ts:226` (`handleToggleTask`), `api/routes/meetings.ts:38` (`handleGetMeeting`)
- [ ] **Step 1: Failing test:** `POST /api/action-items/:id/toggle` response + `GET /api/meetings/:id` task list contain no `notes` key.
- [ ] **Step 2:** Run → FAIL (both return `SELECT *`).
- [ ] **Step 3:** Replace `SELECT *` with the exported `TASK_SELECT_COLS` projection (already defined in `tasks.ts`; import into `meetings.ts`).
- [ ] **Step 4:** Run → PASS. Grep confirm: `rg "SELECT \*" api/routes/tasks.ts api/routes/meetings.ts` returns no task-row reads.
- [ ] **Step 5:** Commit. `git commit -m "fix(privacy): stop notes leak via SELECT * (toggle + meeting detail)" -- api/routes/tasks.ts api/routes/meetings.ts <test>`

> **M5 (separate plan `docs/superpowers/plans/2026-05-26-m5-timeline-build-plan.md`) owns:** remove `notes` from `TASK_ALLOWED_FIELDS`/`TABLE_FIELDS.tasks`, the PB sync wire-rename (`outbox.py:302-310`, pull-back `hub.py:1647-1650`, create-leaks), and the D1 scrub of the 90 existing `notes` rows. Sequence M5 after Task 2.1.

---

## Phase 3 — Hub-first silent-write-loss → retry + fail-loud (T0-C) [Codex verdict B]

`apply_hub_first` (`outbox.py:2117-2196`) returns soft `{mirrored:False}` on transport/HTTP failure and **bypasses** the outbox's existing retry/dead-letter (`_record_error` :2198, retry-on-flush, dead-letter after 3). Callers like `/process` ignore the bool and strike tasks off TODAY.md → "done in UI, todo in DB." `uncomplete_task` (`query.py:1819-1865`) is worst: a soft-failed reopen gets re-completed by the next pull (monotonic).

### Task 3.1: Enqueue Hub-first soft-failures to the retry surface
**Files:** Modify: `~/Peripheral-Brain/scripts/db/outbox.py:2117-2196`
- [ ] **Step 1: Failing test** (`tests/sync/` or `tests/db/`): simulate a transport exception in `apply_hub_first` for a task update; assert a pending-retry/outbox row is recorded (not silently dropped) and the function still returns a falsy `mirrored`.
- [ ] **Step 2:** Run → FAIL (currently returns dict, enqueues nothing).
- [ ] **Step 3:** On `transport_error` and `HTTP !2xx` for `table in ('tasks','projects')` UPDATE/complete ops, **INSERT a retryable outbox envelope** (the normal enqueue path) BEFORE returning the soft-failure dict. ⚠️ `_record_error` alone is a NO-OP here (verified `outbox.py:2198-2211` — it `UPDATE outbox ... WHERE mutation_id=?`, i.e. updates an EXISTING row; `apply_hub_first` never inserts one on soft-fail). Once a row exists, the existing flush-retry + `_record_error` dead-letter-after-3 mechanics take over. Do NOT change the `conflict` path (Hub-wins convergence is correct).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (PB repo, path-explicit). `git commit -m "fix(sync): Hub-first soft-failures enqueue to retry/dead-letter, not silent loss" -- scripts/db/outbox.py <test>`

### Task 3.2: Fail-loud caller checks for completion
**Files:** Modify: `~/Peripheral-Brain/scripts/db/query.py` (`complete_task`/`uncomplete_task` callers), `.claude/skills/process/SKILL.md:293`, `.claude/rules/task-management.md:11-13`
- [ ] **Step 1: Failing test:** a `complete_task` returning False must not result in the task being struck from TODAY.md (assert the `/process` helper checks the bool).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Make the `/process` completion path check the return of `db.complete_task()`; on False, leave the item on TODAY.md + surface a loud warning (ntfy or stderr). Update the two doc files to require the return-check (delete "call complete_task() then strike" fire-and-forget doctrine).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit. `git commit -m "fix(sync): /process fails loud on Hub-first write failure (TODAY.md cannot lie)" -- <files>`

---

## Phase 4 — Correctness bugs (T1) [ship-on-green]

### Task 4.1: Hermes project-comment slug→id + task-comment path
**Files:** Modify: `api/routes/projects.ts:806-811,848-850`, `api/routes/tasks.ts:482-523`
- [ ] **Step 1: Failing test:** `@hermes` on a project comment creates a placeholder comment row (no FK violation) + an `ai_request`; `@hermes` on a task comment creates an `ai_request`.
- [ ] **Step 2:** Run → FAIL (project: FK violation swallowed; task: no ai_request).
- [ ] **Step 3:** In `handleAddComment`, pass `project.id` (the resolved UUID, already in scope) to `handleClaudeMention`, not the URL slug. Add the Hermes mention path to task comments mirroring the project path.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit. `git commit -m "fix(hermes): project comment slug→id FK + task-comment ai_request path" -- <files> <test>`

### Task 4.2: Upsert path enum validation
**Files:** Modify: `api/routes/projects.ts:545-566`
- [ ] **Step 1: Failing test:** `POST /api/projects/:id` for a non-existent project with `stage:'Bogus'` → 400.
- [ ] **Step 2:** Run → FAIL (upsert-on-miss inserts raw).
- [ ] **Step 3:** Run `PROJECT_ENUM_GUARDS` in the `!existingCheck` insert branch (same as the update branch).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit.

### Task 4.3: Delete idempotency before cascade — projects AND tasks
**Files:** Modify: `api/routes/projects.ts:660-680`, `api/routes/tasks.ts:857-871`
- [ ] **Step 1: Failing test:** deleting an already-`deleted_at` project/task is a no-op that does NOT re-run the child cascade (assert re-associated tasks keep their project_id).
- [ ] **Step 2:** Run → FAIL (cascade runs first in both).
- [ ] **Step 3:** Move the `if (existing.deleted_at) return idempotent` check ABOVE the cascade `DELETE`s in both handlers.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit. `git commit -m "fix: delete idempotency check before cascade (projects+tasks)" -- <files> <test>`

### Task 4.4: Single-project conflict → HTTP 409
**Files:** Modify: `api/routes/projects.ts:584-588`, verify client `src/lib/api.ts:221-226`
- [ ] **Step 1: Failing test:** a conflict-rejected single-project update returns 409 (not 200), and the client surfaces an error + rolls back optimistic state.
- [ ] **Step 2:** Run → FAIL (returns 200 `{rejected}`).
- [ ] **Step 3:** Return `409` with the conflict envelope from the single-project update path. (Do NOT touch the `/api/mutations` batch per-row-status protocol — that 200 is by design.) Ensure `fetchApi` treats 409 as error.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit.

### Task 4.5: Orphan-task reconcile + project_id resolver guard
**Files:** PB reconcile script (one-shot), `api/routes/mutations.ts:199-205`
- [ ] **Step 1:** Read-only confirm the 69 orphans (lane 9): tasks whose `project_id` is a `proj_*` brain.db id absent from D1. Run via `scripts/wrangler-d1`.
- [ ] **Step 2:** Build the brain.db slug map; for each orphan, resolve `proj_*`→slug→D1 project; write the corrected `project_id` (or NULL if unresolvable) Hub-first.
- [ ] **Step 3: Failing test:** `/api/mutations` insert/update with an unresolvable `project_id` resolves to NULL (not stored raw), matching the direct task-route resolver.
- [ ] **Step 4:** Add the resolver to `mutations.ts` (reuse the tasks.ts resolver). Run → PASS.
- [ ] **Step 5:** Commit (reconcile + guard). ⚠️ Reconcile mutates prod — gate on D4 go.

---

## Phase 5 — Data cleanup + validator flip (T2 data) ⚠️ NEEDS NICK GO (D4)

### Task 5.1: Soft-delete test projects + fixture row
- [ ] **Step 1:** Read-only list the 25 `zz-test-*` + duplicate-slug projects + `_ENUM_GATE_TEST_LEGACY_STATUS` row (lane 9). Run via `scripts/wrangler-d1`, capture IDs.
- [ ] **Step 2:** Soft-delete (`deleted_at = now`) each via `/api/mutations` (Hub-first) — NOT raw DELETE. Verify they drop out of `/portal/projects` + `/portal/manuscripts`.
- [ ] **Step 3:** Commit the SQL/script to `scripts/` for the record.

### Task 5.2: Normalize enum drift
- [ ] **Step 1:** Normalize 2 `stage='Idea'`→`idea`, 1 `priority='normal'`→`medium`, 27 NULL `priority`→`medium`, 3 `status='deleted'` (confirm `deleted_at` set, else fix). All Hub-first.
- [ ] **Step 2:** Re-run lane-9 integrity queries → expect 0 enum-drift, 0 NULL priority.

### Task 5.3: Flip Phase A1 validators ON (D3) — after 5.1/5.2 clean
- [ ] **Step 1:** `UPDATE lab_settings SET value='1' WHERE key='hub_validate_enums'` (first — now that drift is cleaned). Then `hub_validate_completion_tombstone`, `hub_validate_conflict_hash`, `hub_dedup_adoptable` one at a time.
- [ ] **Step 2:** After each, smoke `/api/health` + a write round-trip; confirm no false rejects.

### Task 5.4: Add constraints (schema v70)
- [ ] **Step 1:** `api/schema-v70-constraints.sql`: `CREATE UNIQUE INDEX ... ON projects(slug) WHERE deleted_at IS NULL`. (NOT NULL on tasks.priority/projects.category deferred — D1 can't add NOT NULL without table rebuild; enforce via validators instead.)
- [ ] **Step 2:** Apply via `scripts/wrangler-d1` (coordinate per CLAUDE.md cross-repo schema rule). Bump schema docs to v70.

---

## Phase 6 — UX clarity (T2 UI) [ship-on-green]

### Task 6.1: Wire or remove dead controls
**Files:** `src/pages/portal/IdeasPage.tsx:660` (Edit no-onClick), `SettingsPage.tsx:384` (AI inputs discard) + `:429` (theme toggle lag), `GrantsPage.tsx:623` (expand unreachable), `DeadlineCascadePage.tsx:13` (no reset), `MenteeMilestonesPage.tsx:41` (hardcoded slugs)
- [ ] Per control: either wire it to its real handler (Ideas edit → `useUpdateIdea` flow; Grants expand → onClick on the row not just bare bg) or remove it (Settings AI form → replace with Team Directory link per T4). Mentee slugs → derive from `team_members.member_type='mentee'`. Theme toggle → drive from state not DOM read.
- [ ] Verify each via Playwright local: click → expected effect. Commit per page.

### Task 6.2: Fix fake/wrong dashboard data
**Files:** `api/routes/pi-dashboard.ts:56` (mentee velocity), `:66,106` (grants funded/submitted)
- [ ] **Step 1: Failing test:** mentee pub count uses exact author-slug membership (not `LIKE '%slug%'`); grants metric labels match `proposed` semantics.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Replace `LIKE '%'||slug||'%'` with exact membership (join/JSON-contains on `author_slugs`). Relabel "funded vs submitted" to the true `proposed` meaning (pending vs active), or compute funded from a real funded flag if one exists; if not, show `—`. Reconcile the dual "Lab Health" — pick the 6-signal `LabHealthScore` as canonical, have Today read it.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit.

### Task 6.3: Shared loading/error/empty state
**Files:** Create `src/components/QueryState.tsx`; apply to Analytics/Personal/Deadlines/Ask/Mentee + MyTasks
- [ ] Component takes `{isLoading, isError, isEmpty}` → skeleton / sign-in-or-error / EmptyStateArt. Replace the permanent-skeleton-on-401 pattern. Verify on prod-read (lane 7a F-03/F-06). Commit.

---

## Phase 7 — Design ethos: semantic tokens (T3) [Codex-refined]

### Task 7.1: Define semantic task-surface CSS vars
**Files:** Modify: `src/index.css` (light block ~:6-20, `.dark` block ~:116-163)
- [ ] **Step 1:** Add `--task-page-bg`, `--task-panel-bg`, `--task-ink`, `--task-ink-muted`, `--task-ink-dim`, `--task-accent-{gold,teal,coral,orange,green}` with **both** light + dark definitions (dark = today's hex `#0b1017`/`#0f1923`/`#e2e8f0`/`#c9a84c`...; light = the app's light equivalents).
- [ ] **Step 2:** Build (`npm run build`) → no CSS errors.
- [ ] **Step 3:** Commit. `git commit -m "feat(design): semantic --task-* CSS vars (light+dark)" -- src/index.css`

### Task 7.2: Replace JS hex palette with CSS-var refs
**Files:** Modify: `src/lib/taskGrouping.ts:28-37` + the ~14 consumers
- [ ] **Step 1:** Replace `export const ACCENT_GOLD='#c9a84c'` … `PANEL_BG='#0f1923'` with `var(--task-*)` string refs (or a helper returning the var). Grep consumers: `rg -n "ACCENT_GOLD|ACCENT_TEAL|ACCENT_CORAL|PAGE_BG|PANEL_BG|INK_MUTED" src/`.
- [ ] **Step 2:** Update each consumer to use the var. Build → green.
- [ ] **Step 3:** Commit. `git commit -m "refactor(design): task palette → CSS vars (kills JS-hex drift class)" -- <files>`

### Task 7.3: Remove the Today/MyTasks dark-lock
**Files:** Modify: `src/pages/portal/TodayPage.tsx:258,277`, `src/pages/MyTasks/index.tsx:237`
- [ ] **Step 1:** Replace `background: PAGE_BG, color: INK` literals with `var(--task-page-bg)`/`var(--task-ink)` (now theme-aware). Remove any forced `.dark` assumption.
- [ ] **Step 2:** Verify in BOTH themes via Playwright local: toggle `mn-ccore-theme`, confirm Today + MyTasks render light in light mode, dark in dark.
- [ ] **Step 3:** Commit. `git commit -m "fix(design): Today+MyTasks honor theme (drop dark-lock)" -- <files>`

### Task 7.4: Opacity-floor lint + cleanup
**Files:** Create `scripts/check-opacity-floor.mjs`; CI wire
- [ ] **Step 1:** Lint flags `opacity: 0.3–0.84` on text-bearing elements (heuristic: inline style / class with color). Run it → lists the 228 sites.
- [ ] **Step 2:** Bump the worst offenders (Grants labels, HoverCard, MeetingPrep) to ≥0.85; add lint as WARN first (per CLAUDE.md WARN→ENFORCE pattern).
- [ ] **Step 3:** Commit.

### Task 7.5: Monospace-in-content + blue-tint + tap targets
- [ ] pb-sector cards: JetBrains Mono → DM Sans + `.tabular-nums`. Stop using `--ink` (#0f1923) as a panel bg (text-only). Bump manuscripts stage-dots + grant chevron to ≥24px. Replace lucide `Sparkles` beside Hermes with `HermesMark`. Commit per fix.

---

## Phase 8 — Simplifications (T4)

### Task 8.1: WebSocket invalidation one-liner (D5)
**Files:** Modify: `src/hooks/useRealtimeSync.ts:19-28`
- [ ] **Step 1: Failing test:** a `type:'data'` WS message invalidates the active queries (tasks/projects), not the no-op `['data']` key.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Treat `'data'` as the all-invalidate sentinel (call `invalidateAll()`); delete the stale "NOTIFICATION_HUB not wired" comment (`:36-38`).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit.
- [ ] **Step 8b (DEFERRED, needs Nick):** evaluate deleting the DO/PartySocket layer entirely if <1s realtime isn't worth the complexity (15s poll already carries freshness). Separate decision — do not delete in this phase.

### Task 8.2: Redundant-affordance + dead-form simplifications
- [ ] Manuscripts: remove the stage-advance dots OR the dropdown (keep one). Settings AI form → Team Directory link. Grants milestones → consolidate to Post-Award tab. Commit per change.

---

## Phase 9 — Doc / skill / infra drift (T5)

### Task 9.1: Fix doc drift
**Files:** `REFERENCE.md` routing table; `.claude/skills/{new-project,process,work-on,generate-today}/SKILL.md`; `~/.claude/agents/hub-schema-sync/agent.md`
- [ ] REFERENCE routing: `/portal/pb` (not pb-sector), `/portal/sessions` (not session-history), remove portal `/network`.
- [ ] Skill docs: correct "sync push updates task/project status" → "push is a no-op for tasks/projects (Hub-first); drains Lane-3 outbox + pulls". `new-project` sync_status `local_new` → removed.
- [ ] `hub-schema-sync/agent.md`: DB name `mnccore-prod`→`mnccore-lab`; raw `npx wrangler d1` → `scripts/wrangler-d1`.
- [ ] Commit (Hub docs path-explicit; PB skill/agent docs separately).

---

## Self-Review (run before execution)
- **Spec coverage:** every FINAL-PLAN tier maps to a phase — T0-A→P1, T0-B→P2, T0-C→P3, T1→P4, T2→P5/P6, T3→P7, T4→P8, T5→P9, test-env→P0. ✅
- **Verification dependency:** P0 first (else write-flow fixes can't be tested locally). ✅
- **Prod-mutating phases flagged:** P4.5 reconcile + P5 cleanup + P5.4 schema gated on D4 Nick-go. ✅
- **Ship-now bias:** every non-prod-data task is an independent path → green-tests gate, rollback = revert. ✅
- **Cross-repo:** P3 (PB) + P5.4 (schema) follow the CLAUDE.md cross-repo schema coordination rule. ✅

## Execution Handoff
Plan saved to `docs/superpowers/plans/2026-05-27-hub-hardening-plan.md`. After the final Codex comprehensiveness pass folds in adjacent-work additions, execute via **subagent-driven-development** (fresh subagent per task, review between) — recommended given the cross-domain span — or **inline executing-plans** with checkpoints.

---

# Codex Pass-2 Amendments (AUTHORITATIVE — supersedes per-task scope above where they conflict)

Codex's comprehensiveness pass (`Scratch/audit-2026-05-27/codex/pass2-synthesis.md`, verdict: *don't execute unchanged — not yet comprehensive*) found the plan leaves the **same bug classes alive in sibling endpoints**. All claims below were spot-verified against live code this session. **The headline: stop patching endpoint-by-endpoint — build shared primitives first, then apply them across the full endpoint list.**

## A. Build the shared primitives FIRST (Phase 1 lead, before any per-route fix)
Four primitives kill four whole classes and make every downstream route fix a one-liner:
- **A1 · `actorSlugFromRequest(request, env)`** — `actorSlug((await getAuthUser(request,env))?.email)`. Replaces the (wrong) `recipientFromAuth ?.slug`. Use for notifications + the `resolveActor` sweep (decisions, digest, questions, comments).
- **A2 · `assertProjectVisible(request, env, projectRef)`** (+ `canSeePbProject`) — resolves id/slug → project, returns 403/filters when `category='Peripheral Brain'` and caller isn't PI. The single fix for the entire PB-visibility class.
- **A3 · `projectRefToCanonical(env, ref)`** — id-or-slug → canonical project id or NULL. Reuse everywhere raw `project_id` is accepted.
- **A4 · `safeTaskProjection` / `TASK_SELECT_COLS`** — the no-`notes` column list, applied to EVERY task read AND to `/api/mutations` canonical payloads.

## B. Phase 1 ACL — full sibling sweep (apply A1/A2 to ALL of these, not just the original 6)
- **PB-visibility (A2) missing on:** project comments (`projects.ts:279-293`), project updates by slug (`:298-300`), project-documents list (`project-documents.ts:7-13`), submissions list (`submissions.ts:17-25`), conferences list/update (`conferences.ts:11-30,145-177`), regulatory reads (`regulatory.ts:20-34`), deadline-cascade graph (`deadline-cascade.ts:159-185`), active manuscript revisions join (`revisions.ts:325-340`).
- **Task subresource reads w/ no visibility check:** comments (`tasks.ts:474-477`), activity (`:527-530`), details (`:537-565`), updates (`:965-968`) — all direct GETs (`index.ts:666-678`).
- **Uploads CREATE bypasses `canAccessEntity`:** `handleUploadUrl` (`uploads.ts:52-87`) + `handleUploadDone` (`:91-132`) accept arbitrary `context/entityId` (list/download/delete already gate at `:36-49,144-147,171-173,196-199`).
- **Caller-supplied identity:** `handleCreateDecision` trusts `body.decided_by` (`decisions.ts:27-62`) → use `resolveActor` (pattern: `digest.ts:141-147`, `questions.ts:129-132`, `projects.ts:798-801`).
- **`/api/inbox-events`** returns `SELECT *` incl. `raw_payload_json`/`notes`/triage outside `/api/pb/*` (`inbox-events.ts:31-74`, `index.ts:707-709`) → PI/project-scope it.
- **Regulatory ICS** leaks protocol/notes to any authed id (`regulatory.ts:144-187`, `index.ts:631-633`) → gate.
- **`/api/email-drafts/sync-bulk` + `/api/file-activity/sync`** (`index.ts:934-937`, `email-drafts.ts:31-70`, `file-activity.ts:36-77`) → PI/API-key only.

## C. Phase 2 — add the `/api/mutations` notes leak (PLAN-CRITICAL, was missed)
`TABLE_FIELDS.tasks` includes `notes` (`mutations.ts:205`) + `readCanonical` is `SELECT *` (`:1182-1197`) → successful mutation `canonical_payload` (`:628-631,793-807,890-893`) echoes `notes`. **Fix:** task-specific canonical projection (strip `notes` + private cols before response/hash). Also: `handleUpdateTaskStatus` reads `SELECT *` internally but returns projected (`tasks.ts:110-153`) — narrow the internal read while in the file (not a live leak, hygiene). Decide if single-meeting detail is team-public; if not, project `meetings.ts:33-44` too (the file's own comment lists `notes/agenda/decisions/attendees` as non-public, `:15-20`).

## D. Phase 4 — delete-semantics + project-ref sweeps; DON'T touch `/api/mutations` delete
- ⚠️ `/api/mutations` `applyDelete` ALREADY checks absent/already-deleted before cascade (verified `mutations.ts:814-825`) — leave it. Only the ROUTE handlers (`projects.ts:660-680`, `tasks.ts:857-871`) have the bug.
- **Mixed/buggy delete semantics to normalize:** `handleDeleteSubmission` 404s on repeat (`submissions.ts:109-117`); hard-deletes in `conferences.ts:181-190`, `project-documents.ts:63-75`, `deadline-cascade.ts:372-377`, `uploads.ts:190-208`. Pick soft-delete + idempotent across the board.
- **Project-ref resolver (A3)** also needed in: submissions create (`submissions.ts:41-59`), conferences (`conferences.ts:115-141`), regulatory (`regulatory.ts:82-116`), revisions update/read (`revisions.ts:35-50,68-76`), deadline-cascade (`deadline-cascade.ts:334-367`).
- **Regulatory enum drift in code:** read query uses `action_needed`/`expiring_soon` but `VALID_STATUSES` omits them (`regulatory.ts:16-17,48-56`) → align.

## E. Phase 5 — cache-aware validator flip
`getValidationFlags` caches 5 min (`helpers.ts:464-491`) → "flip flag then immediately smoke-write" can test the STALE state. Add a ≥5-min wait or cache-bust before verifying each flip. Make the duplicate-active-slug precheck explicit (v70 `UNIQUE(slug) WHERE deleted_at IS NULL` fails if any survives).

## F. Phase 6 — exact membership, not "not-substring"
PI mentee velocity: use quoted membership `LIKE '%"' || tm.slug || '"%'` (the safe pattern at `team.ts:39-40`) or `json_each` — not a vague "JSON-contains" (`pi-dashboard.ts:51-59`). Grants: code maps `proposed=1`→submitted, `proposed=0`→active (`:61-68,102-108`); there is **no funded field** — label it "active," don't invent "funded." Decide the data contract before changing UI text.

## G. Phase 7 — token migration is bigger + one preserve
Tokenize ALL palette sources, not just `taskGrouping.ts`: `src/components/today/constants.ts:11-17,68-74` + `src/pages/MyTasks/constants.ts:10-16,38-48` (also hardcodes status/priority colors) + inline dark literals in `src/components/today/TaskDetailDrawer.tsx:83-103` + `src/pages/MyTasks/views/LanesView.tsx:61-140`. Do it as ONE coordinated migration (Today + MyTasks + components), not a patch + follow-up. ⚠️ **Preserve `section-ink`** (`index.css:950-955`) — it pins `#0f1923` and is *documented* "Always-dark sections"; rename/keep, don't blindly theme-convert.

## H. Coverage gaps (new — fold into the plan as a Phase 10)
- **HIGH · Error leakage:** global handler returns raw exception messages to clients (`index.ts:157-159`) → SQL/D1 internals can leak in prod. Sanitize.
- **HIGH · Project-linked visibility contract:** the A2/A3 primitives ARE this fix — make it a contract + a test that asserts non-PI never sees PB-category rows on any project-linked route.
- **HIGH · Mixed delete semantics:** see D (standardize).
- **MED · `SELECT *` on operational data:** email-drafts URLs (`email-drafts.ts:5-28`), inbox-events (`:31-74`), regulatory ICS (`:144-187`).
- **MED · Token/a11y regression risk:** the inline-literal task surfaces (G) need visual-regression + axe re-run after the migration.
- **LOW (verify) · Rate limiting:** no rate-limit middleware seen in the auth/version/write stack (`index.ts:176-288`) — confirm against full middleware/config; add if absent.

## I. Corrected sequencing
1. **Phase 0** (test env + PI/non-PI fixtures + `lab_settings.pi_emails` seed + REQUIRE_AUTH GET tests — needed so ACL tests are deterministic; `getAuthUser` test bypass at `helpers.ts:52-57`).
2. **Primitives A1–A4** (new Phase 1 lead).
3. **Phase 2 (notes incl. `/api/mutations`)** lands BEFORE Phase-1 tests that inspect mutation responses (mutations can echo `notes` even after route projections).
4. **Phase 3 primitive correct FIRST**, then the fail-loud doc/process changes (extend the return-check rule beyond `complete_task` to `update_task`/`update_project`/`uncomplete_task`/key-link writers — `query.py:1403-2803`; `process/SKILL.md:307`, `task-management.md:13`; note `process_completions_and_notes` `query.py:2877-2908` ALREADY return-checks — don't duplicate it).
5. Phases 4–9 as written, with the sweeps above. Phase 10 (coverage gaps) folds in opportunistically.

**Shipping bias:** Phase 0 (B, sequenced); ACL/notes/correctness fixes (A, ship-on-green) but route them through the shared primitives to avoid drift; Phase 3 (B, primitive-then-docs); Phase 5 cleanup + flag flips + schema (B/C, Nick-go + cache-aware verify); Phase 7 token migration (B, needs visual-regression). Rollback everywhere = revert commit.

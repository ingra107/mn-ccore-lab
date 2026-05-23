# Hub Pre-Adoption Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, batch w/ checkpoints) or superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the pre-adoption SECURITY tier (SEC-T0-1..9) plus the net-new correctness/data items (CT-2, valid CON-2, FAKE-2, DH-1, sync-symmetry follow-up) so the Hub is safe to open to ~20 team members — orchestrated across 3 Opus specialist agents working disjoint file-sets in parallel, integrated + deployed by the orchestrator.

**Architecture:** Three parallel agents own non-overlapping file domains (`api/`, `src/`, PB `scripts/db/sync/`). Agents make EDITS ONLY — no commits, no deploys (the git index is process-global per worktree; concurrent commits sweep each other — this bit us twice). The orchestrator integrates: `npm run build` → `npm run test:api` → path-explicit commits (CLAUDE.md Rule 13) → single deploy → post-deploy smoke. Risky deletions (T2' table drops) are gated behind a separate `justify-it` pass and excluded from this batch.

**Tech Stack:** React 19 + Vite 8 + Tailwind v4 + TypeScript frontend; Cloudflare Worker + Hono v4.12 + D1 (schema v68) backend; Python sync module in Peripheral Brain. Tests: Playwright 1.59 + Vitest 4.1 (`npm run test:api`).

---

## Agent Roster & File Ownership (disjoint — this is what makes parallel safe)

| Agent | subagent_type | model | Owns (exclusive write domain) | Must NOT touch |
|-------|---------------|-------|-------------------------------|----------------|
| **BACKEND** | hub-backend | opus | `api/**` (all routes, middleware, helpers, jwt-verify, lib, schema seed SQL) | `src/**`, PB repo |
| **FRONTEND** | hub-frontend | opus | `src/**` (incl. `src/lib/emailSlug.ts` — mirrors backend LUT) | `api/**`, PB repo |
| **SYNC** | builder | opus | PB repo `C:/Users/ingra107/Peripheral-Brain/scripts/db/sync/**` only | Hub repo entirely |
| **Orchestrator** (me) | — | opus | integration only: build, test, **all commits**, deploy, smoke | — |

**Hard rules handed to every agent:**
1. **NO `git add` / `git commit` / `git push` / `wrangler deploy`.** Make file edits, then report a summary (files touched + 1-line per change + any caller-impact you found). The orchestrator commits.
2. **Read before edit; grep callers before changing a function or response shape** (CLAUDE.md Rule 15, instinct #4).
3. **Verify-first:** if a claimed file:line doesn't match, report it and fix the real site — don't fabricate.
4. Build must stay green for your domain. BACKEND: `npm run test:api` after your edits. FRONTEND: `npm run build` (tsc) clean.

---

## Concurrency / Integration Model

```
Wave 1 (PARALLEL):  BACKEND ‖ FRONTEND ‖ SYNC   — edits only, no commits
        │
Wave 2 (SEQUENTIAL, orchestrator):
        ├─ npm run build  → fix any contract-boundary TS errors
        ├─ npm run test:api  (must be ≥ 178/178; new guard tests add to this)
        ├─ path-explicit commits, grouped:
        │     Commit A = SECURITY (api/ security files + tests)
        │     Commit B = CORRECTNESS (CT-2 server+frontend, localDateKey, fetchManuscriptsAttention, TaskRow type, emailSlug LUT)
        │     Commit C = DATA/UX (FAKE-2 HermesPending, FAKE-1 fallback, DH-1 seed)
        │     Commit D = SYNC (PB repo, separate — committed in PB repo)
        ├─ npm run deploy:pages:gated   (token from PB scripts/scheduled/secrets.ps1 — NOT wrangler login)
        └─ post-deploy smoke: /api/health, /api/version (env=production), spot-check 2 gated GETs
        │
Wave 3 (GATED, after Wave 2 ships): safe-deletes only via justify-it (see bottom)
```

---

## Scope — what's IN this batch and what's deliberately OUT

**IN:** SEC-T0-1..9 (security), CT-2 (timezone), valid CON-2 (emailSlug LUT lockstep + fetchManuscriptsAttention res.ok + TaskRow op-field types), FAKE-1 (verify fallback only), FAKE-2 (HermesPending), DH-1 (seed data), DH-2 (verify→drop, no code), sync-symmetry follow-up.

**OUT (with rationale — codex/Nick may pull any forward):**
- **T2 UX & polish (UX-1..9, PAGE-1..7):** explicitly "during adoption, not blockers" in WORKPLAN. Not pre-adoption gates.
- **T3 INFRA (1,2,3,5,6,7,8):** larger/feature work. INFRA-6 (Personal 3-tab merge) requires substrate-swap protocol. INFRA-7 (surface v55 fields in UI) is feature work — we add the *types* (CON-2b) but not the UI. INFRA-8's "rowToProject drops fields" premise is INVALID (no rowToProject exists; SELECT * retains fields) — only the frontend Project-type staleness-field gap might remain, deferred.
- **T2' table DROPS (decision_log/`*_new`/watchlist/narrative_projects/research_narratives):** destructive; requires `justify-it` + row-count proof + substrate-swap tombstone. Gated to Wave 3, NOT auto-run.
- **T4 parking lot:** future/design-dependent (Co-Scientist, multi-tenant, etc.).
- **CON-2 `key_link_*` drop fix:** INVALID per verification — nothing to fix.
- **DAT-4, enum-drift, STATE-1/2:** already DONE 2026-05-22.

---

## Corrections applied vs the WORKPLAN's codex claims (verified this session)

| Item | WORKPLAN said | Verified reality | Plan adjustment |
|------|---------------|------------------|-----------------|
| FAKE-1 | totalCitations hardcoded in Dashboard | NOT hardcoded; `StatsCard.tsx:101` uses live `useCitations()` (`useApiData.ts:243`) | De-scope to "confirm null/zero renders `—`" |
| DH-2 | PWA manifest for Pulse, likely drop | `public/manifest.webmanifest` exists (generic); no Pulse-specific one needed | DROP — no code |
| DH-1 | needs grant_milestones seed | table exists (schema-v29, 9 cols) + GrantsPage UI exists | seed data only |
| CON-2 `key_link_*` | dropped in rowToProject | no rowToProject exists; SELECT * retains them | DROP this sub-item |
| SEC-T0-6 | 9 raw-write sites | 6 confirmed (handoffs, questions, ideas, projects:185, uploads:96, dependencies:68) | fix the 6 |
| Sync | hub.py `_w1col` truthy gate skips NULL | `hub.py:1843` already fixed; bug survives in `hub_payload.py:677-680` + `:500-508` + `hub.py:1832` (next_artifact) | fix those 3; leave last_meaningful_movement (MAX, intentional) |
| CT-2 lines | index.ts 1032/1053; pb-sector 40/493 | real JS sites: index.ts:1059, pb-sector.ts:142; others are SQLite `date('now')` | per-site handling below |

---

# WAVE 1 — PARALLEL

## Agent BACKEND (hub-backend, opus) — `api/**`

### Task B1: SEC-T0-5 — reject NULL on protected fields (HIGHEST RISK, do first)

**Files:**
- Modify: `api/routes/mutations.ts` (`applyPatch` ~line 785; allowlist ~116-137, 332)
- Modify: `api/routes/projects.ts` (`handleUpdateProject` null-skip ~lines 496-510)
- Test: `api/routes/mutations.test.ts` (or nearest existing api test file)

- [ ] **Step 1 — failing test:** assert that a mutation patch setting `tasks.status=null` (and `projects.category=null`) is REJECTED (mutation marked failed / 400), not silently written or skipped.
- [ ] **Step 2 — implement:** define a `PROTECTED_NON_NULL` map (`tasks: ['status','priority','assignee']`, `projects: ['status','stage','category']`). In `applyPatch`, before writing, if any patch key is protected and value is `null`/`undefined`/`''` → reject that mutation with a clear error (do not write the row). In `handleUpdateProject`, change the silent `continue` to the same explicit rejection so the client sees a 400 instead of a silent no-op revert.
- [ ] **Step 3 — run** `npm run test:api` → new test passes, existing pass.
- **Acceptance:** protected fields can never be nulled via `/api/mutations` or `/api/projects/:id`.

### Task B2: SEC-T0-6 — canonicalize the 6 identity-write sites

**Files:** `api/routes/handoffs.ts:46,77` · `api/routes/questions.ts:129` · `api/routes/ideas.ts:32` · `api/routes/projects.ts:185` · `api/routes/uploads.ts:96` · `api/routes/dependencies.ts:68` · `api/helpers.ts` (`actorSlug` at 266-269 — reuse, don't duplicate)

- [ ] **Step 1:** For the 4 email-derived sites (questions `asked_by`, ideas `submitted_by`, projects.ts:185 `pi`, uploads.ts:96 `uploaded_by`, dependencies.ts:68 `created_by`) → route through `actorSlug(email)` instead of `email.split('@')[0]` or raw email. For caller-supplied `asked_by`/`submitted_by`/`created_by` → if provided, canonicalize the provided value too (treat as slug; if it looks like an email, `actorSlug` it).
- [ ] **Step 2 — handoffs `to_slug`:** it's already a slug (not email). Validate it against known team slugs (same pattern as task assignee validation in `tasks.ts` — reject unknown slug with 400, except `claude-ai`). Do NOT pass a slug through `actorSlug` (that expects email).
- [ ] **Step 3:** `npm run test:api`; add/extend a test asserting `dependencies.created_by` is a slug not a raw email.
- **Acceptance:** no write path stores `email.split('@')[0]` or a raw email as an actor identity.

### Task B3: SEC-T0-1 — gate/redact over-exposed public GETs

**Files:** `api/index.ts` (`isPublicGet` 112-148) · `api/routes/team.ts:7` · `api/routes/projects.ts:304-306` (`/api/projects/health`) · the `/api/activity` handler

- [ ] **Step 1 — caller check (MANDATORY before changing contract):** grep `src/` for callers of `/api/team`, `/api/projects/health`, `/api/activity`. The public marketing `/team/:slug` page legitimately needs names/photos/roles — do NOT break it.
- [ ] **Step 2 — `/api/team`:** replace `SELECT *` (team.ts:7) with an explicit **public-safe projection** (slug, name, preferred_name, role, member_type, photo, title) for unauthenticated callers; include `email`/`auto_created` only when the request is authed. Never `SELECT *` on a public endpoint.
- [ ] **Step 3 — `/api/projects/health`:** add a category-visibility filter — exclude `category = 'Peripheral Brain'` projects unless `await isPiRequest(...)`. (PB project titles must not leak to the public/team.)
- [ ] **Step 4 — `/api/activity`:** if it surfaces PB-linked rows, remove it from `isPublicGet` (require auth) OR filter PB rows for non-PI. Decide based on Step 1 caller findings; document which you chose.
- [ ] **Step 5:** `npm run test:api` + add a test asserting unauth `/api/team` response has no `email` key and `/api/projects/health` excludes PB-category titles.

### Task B4: SEC-T0-2 — search respects PB-category visibility

**Files:** `api/routes/search.ts:129-131` (projects query; also check the notes/other PB-derived queries in the 14-table fan-out)

- [ ] **Step 1:** add `AND category != 'Peripheral Brain'` (or a shared `visibleProjects` predicate gated on `isPiRequest`) to the projects query and any other query that can surface PB-only content. PI requests see everything; non-PI/unauth do not.
- [ ] **Step 2:** test — a non-PI search for a known PB project title returns 0 project hits; a PI search returns it.

### Task B5: SEC-T0-4 — stop leaking `tasks.notes`

**Files:** `api/routes/tasks.ts:44` (`SELECT t.*`)

- [ ] **Step 1 — caller check:** grep `src/` for `.notes` on task objects. `notes` is the PRIVATE brain.db field; team-visible is `description`. Confirm the frontend does not render `task.notes`.
- [ ] **Step 2:** replace `SELECT t.*` with an explicit column list that EXCLUDES `notes` (keep everything the frontend actually uses, incl. `description`, `group_override`, v55 op-fields). If a future need exists, gate `notes` behind PI/owner.
- [ ] **Step 3:** `npm run test:api`.

### Task B6: SEC-T0-3 — authz on digest generate/send

**Files:** `api/routes/digest-email.ts` (`handleGenerateDigestEmail` ~319, `handleSendDigestEmail` ~383, `handleSendDailyDigests` ~662)

- [ ] **Step 1:** add owner-or-PI authorization: a member may generate/send only their OWN digest; PI may send anyone's; `handleSendDailyDigests` (the cron fan-out) must be PI/service-only. Use the existing `getAuthUser` + `isPiRequest` helpers.
- [ ] **Step 2:** test — non-PI requesting another member's digest send → 403.

### Task B7: SEC-T0-7 — close cascade gaps

**Files:** `api/routes/projects.ts` (`handleDeleteProject` ~629-634) · `api/routes/mutations.ts` (`applyDelete` ~636-643 project branch; ~620-633 task branch)

- [ ] **Step 1 — verify schema:** confirm which child tables actually carry a `project_id` FK (candidates: `project_documents`, `project_dependencies`, `conference_submissions`, `submission_events`, `mentee_milestones`). Only cascade tables that exist with that FK.
- [ ] **Step 2:** extend project delete to clear the confirmed child tables (wrap in `env.DB.batch([...])` for atomicity). For the PB-origin task delete, also clear the `entity_aliases`/slug-link rows so no dangling slug-linked task remains (verify the alias table name first).
- [ ] **Step 3:** test — delete a project with a doc + dependency row → those rows are gone, no orphans.
- **NOTE:** the documented intentional design `projects.cascade.test.ts` B-CRIT-05 (swallow-and-continue) stays — do not "fix" that.

### Task B8: SEC-T0-8 + SEC-T0-9 (LOW — defense-in-depth + contract)

**Files:** `api/jwt-verify.ts:92-101` · `api/middleware/api-key-auth.ts:7-15`

- [ ] **B8a (SEC-T0-8):** make `verifyCfAccessJwt` fail CLOSED when `REQUIRE_AUTH=1` and the team domain is configured but verification can't complete (currently returns decoded-but-unverified). Keep the dev/no-secret path working when `REQUIRE_AUTH` is unset. (Prod has the vars set, so this is hardening, not an active hole — verify you don't lock out prod.)
- [ ] **B8b (SEC-T0-9):** reconcile the X-API-Key contract — either accept `X-API-Key` in addition to `Authorization: Bearer` in `api-key-auth.ts`, OR update the docs/REFERENCE.md to state Bearer-only. Pick one; note which. (Minor.)

### Task B9: CT-2 server sites → CT

**Files:** `api/routes/projects.ts:309` · `api/index.ts:1059` · `api/routes/pb-sector.ts:142` · `api/routes/regulatory.ts:40-41` · `api/routes/submissions.ts:147` · `api/routes/conferences.ts:41-43` · reuse `api/lib/ct-date.ts` `ctToday(offsetDays=0)`

- [ ] **JS `toISOString` sites (projects.ts:309, index.ts:1059, pb-sector.ts:142, regulatory.ts:40-41):** replace the UTC `new Date().toISOString().split('T')[0]` "today" anchors with `ctToday()`. PER-SITE JUDGMENT: only the "today/now" comparison anchors — leave any genuine UTC range-bound math alone (note which you changed and why).
- [ ] **SQLite `date('now')` sites (submissions.ts:147, conferences.ts:41-43):** these are UTC in SQL and have the same after-6pm-CT bug. Fix by binding a CT date param (`ctToday()`) and comparing `>= ?` instead of `date('now')`, OR use `date('now','-6 hours')`-style offset if a param is awkward — prefer the bound `ctToday()` param for correctness.
- [ ] **Leave alone:** `index.ts:1053` (weekday display string), `pb-sector.ts:8` (already `ctToday()`), timestamp writes (`new Date().toISOString()` full ISO) and SQLite `date('now','-7 days')` rolling windows that are intentionally UTC-relative — confirm each before skipping.
- [ ] **Verify:** `npm run test:api`.

### Task B10: DH-1 — grant_milestones seed SQL (DATA)

**Files:** Create `scripts/seed-grant-milestones.sql` (or nearest seed convention)

- [ ] Author INSERT statements for real post-award milestones (progress reports, continuing reviews, NCE deadlines, budget periods) for current grants. **Do not invent grant data** — if real grant IDs/dates aren't known, produce the SQL template + a 1-line note that Nick supplies values. Table cols: `id, grant_id, milestone_type, title, due_date, completed_at, status, notes, created_at` (schema-v29). This is applied to prod D1 by the orchestrator (or deferred to Nick) — agent does NOT run wrangler.

**BACKEND report format:** list files touched + 1-line per change + caller-impact findings from B3/B5 + which CT sites you changed vs deliberately skipped + the canonical `EMAIL_PREFIX_TO_SLUG` contents (so FRONTEND can mirror).

---

## Agent FRONTEND (hub-frontend, opus) — `src/**`

### Task F1: CT-2 frontend — `localDateKey()` helper + swap UTC sites

**Files:** Create helper in `src/lib/dateUtils.ts` (export `localDateKey(d = new Date()): string`) · Modify: `src/pages/portal/CalendarPage.tsx` (lines 52-53,74,77,133,258,377,384,446,448,506) · `src/pages/portal/PBSector.tsx:53,179` · `src/components/pb-sector/TodayView.tsx:161` · `src/components/ConferencePrep.tsx:64,67` · `src/components/SubmissionTimeline.tsx:112` · `src/hooks/useApiData.ts:398`

- [ ] **Step 1 — helper (TDD):** add `localDateKey(d = new Date())` returning `YYYY-MM-DD` in the user's LOCAL timezone (use `Intl.DateTimeFormat` with `en-CA` or manual `getFullYear/getMonth/getDate` — NOT `toISOString` which is UTC). Add a vitest unit test asserting it returns the local date, not UTC, for an evening timestamp.
- [ ] **Step 2:** replace each confirmed UTC `new Date().toISOString().split('T')[0]` / `.slice(0,10)` "today" derivation with `localDateKey()`. PER-SITE: leave any intentional UTC/server-aligned comparisons — but these are user-facing "today" anchors, so nearly all should flip. Note any you skip.
- [ ] **Step 3:** `npm run build` clean.

### Task F2: FAKE-2 — `<HermesPending>` component

**Files:** Create `src/components/HermesPending.tsx` · wire into wherever Hermes answers render (find the component that renders `lab_answers`/question answers — grep for `HermesResponse` / answer rendering; the backend writes `'Thinking about this... (AI response pending)'` as `author_slug='claude-ai'` content)

- [ ] **Step 1:** build `<HermesPending>` — a pulse card (use `HermesMark`, gold sparkle per design rule #29; brand primitive, NOT lucide Sparkles) + an elapsed timer counting since the question was asked.
- [ ] **Step 2:** in the answer renderer, when an answer's `author_slug === 'claude-ai'` and content is the pending placeholder, render `<HermesPending askedAt={...}/>` instead of the literal string. Clear/replace when the real answer arrives via `getRealtimeBus().subscribe(...)` (realtimeBus confirmed at `src/lib/realtimeBus.ts:96`).
- [ ] **Step 3:** `npm run build`.

### Task F3: FAKE-1 — verify citations fallback (VERIFY, likely tiny)

**Files:** `src/components/dashboard/StatsCard.tsx:101` · `src/hooks/useApiData.ts:243` (`useCitations`)

- [ ] **Step 1:** `useCitations()` already feeds StatsCard live. Confirm that when it returns `null`/`0` (cron hasn't populated), the card shows `—` (em dash) rather than `0` or a flash. If it already does → mark FAKE-1 DONE, no change. If it shows `0`/blank → add the `—` fallback.
- [ ] **Step 2:** `npm run build` (only if changed).

### Task F4: CON-2 — contract drift fixes (valid items only)

**Files:** `src/lib/emailSlug.ts:15` (LUT) · `src/lib/api.ts:617` (`fetchManuscriptsAttention`) · `src/lib/api.ts:90-128` (`TaskRow`)

- [ ] **F4a — emailSlug LUT lockstep (CLAUDE.md Rule 34):** the frontend `EMAIL_PREFIX_TO_SLUG` has 3 entries; backend `api/helpers.ts` has 21. Read the current backend LUT (`api/helpers.ts:239-261` — READ ONLY, do not edit it) and mirror ALL entries into `src/lib/emailSlug.ts` so both sides match exactly. Keep them in the same order for diff-ability.
- [ ] **F4b — `fetchManuscriptsAttention` res.ok:** `src/lib/api.ts:617` does bare `.then(r => r.json())`. Add a `res.ok` guard (match the `fetchApi()` pattern) so an error response doesn't get parsed as JSON.
- [ ] **F4c — TaskRow op-fields (type only):** add `waiting_on?`, `promised_to?`, `promise_date?`, `next_checkin_date?` to the `TaskRow` interface (`src/lib/api.ts:90-128`) — the API already returns them via `SELECT t.*` (after B5 keeps them in the explicit list), they're just absent from the type. TYPE ADDITION ONLY — no UI surfacing (that's INFRA-7, out of scope).
- [ ] **Step:** `npm run build` clean.

### Task F5: DH-2 — verify→drop (NO CODE)

- [ ] Confirm `public/manifest.webmanifest` (generic Hub manifest) is sufficient and no Pulse-specific kiosk manifest is required. Report "DH-2 DROPPED — generic manifest covers it." No edit.

**FRONTEND report format:** files touched + 1-line per change + whether FAKE-1 needed a change or was already correct + confirmation the emailSlug LUT now matches backend's 21 entries.

---

## Agent SYNC (builder, opus) — PB `scripts/db/sync/**` ONLY

### Task S1: stale_active_since / next_artifact NULL-clear symmetry

**Files (Peripheral Brain repo):** `scripts/db/sync/payload/hub_payload.py:677-680` (`project_lww_patch_from_hub`) · `hub_payload.py:500-508` (`translate_project_for_hub`) · `scripts/db/drivers/hub.py:1832-1835` (`next_artifact` apply-pull)

- [ ] **Step 1 — confirm the template:** `hub.py:1843-1846` already does this correctly for `stale_active_since` using a key-presence gate (`"stale_active_since" in p`) instead of truthiness. Read it; it's the pattern to copy.
- [ ] **Step 2 — fix `hub_payload.py:677-680`:** the `for col in (...): if v: out[col] = v` loop silently drops explicit NULL. Change to key-presence: `if col in item: out[col] = item[col]` (so an explicit `None` propagates). Distinguish "field absent from payload" (skip) vs "field present and NULL" (write NULL).
- [ ] **Step 3 — fix `hub_payload.py:500-508`** (`translate_project_for_hub` push path): same `if val:` → key-presence for the W1 columns incl. `stale_active_since`, so a local NULL can propagate to Hub.
- [ ] **Step 4 — fix `hub.py:1832-1835`** (`next_artifact`): switch the truthy gate to key-presence so a Hub NULL can clear local `next_artifact`.
- [ ] **LEAVE ALONE:** `hub.py:1837-1841` (`last_meaningful_movement`) — the truthy/MAX-wins gate is INTENTIONAL (NULL must not revert a non-null max). Do not change. Confirm in your report you understood this.
- [ ] **Step 5 — test:** if a sync unit test harness exists, add/extend a test that a project with `stale_active_since` cleared to NULL on the Hub side pulls back as NULL in brain.db. If no harness, describe a manual verification (push a NULL, run `python scripts/db/sync.py sync`, query brain.db).

**SYNC report format:** the 3 functions changed + confirmation last_meaningful_movement left intentionally + test/verification result. **SYNC commits in the PB repo itself** (separate repo, separate index — no collision with Hub). Path-explicit per Rule 13.

---

# WAVE 2 — INTEGRATION (orchestrator, sequential)

- [ ] **I1:** `npm run build` — fix any TS errors at the api↔frontend contract boundary (TaskRow op-fields, emailSlug LUT shape). Don't let either agent's change break tsc.
- [ ] **I2:** `npm run test:api` — must be ≥ 178/178 (new guard tests from B1/B2/B3/B4/B6/B7 increase the count). Investigate any regression before committing.
- [ ] **I3:** `git status --short` + `git diff --cached --name-only` (verify clean index per Rule 13), then **path-explicit commits**:
  - **Commit A — SECURITY:** `git commit -F <msg> -- api/index.ts api/routes/team.ts api/routes/projects.ts api/routes/search.ts api/routes/digest-email.ts api/routes/tasks.ts api/routes/mutations.ts api/routes/handoffs.ts api/routes/questions.ts api/routes/ideas.ts api/routes/uploads.ts api/routes/dependencies.ts api/jwt-verify.ts api/middleware/api-key-auth.ts api/helpers.ts <new test files>`
  - **Commit B — CORRECTNESS:** `git commit -F <msg> -- api/routes/regulatory.ts api/routes/submissions.ts api/routes/conferences.ts api/routes/pb-sector.ts api/lib/ct-date.ts src/lib/dateUtils.ts src/pages/portal/CalendarPage.tsx src/pages/portal/PBSector.tsx src/components/pb-sector/TodayView.tsx src/components/ConferencePrep.tsx src/components/SubmissionTimeline.tsx src/hooks/useApiData.ts src/lib/emailSlug.ts src/lib/api.ts`
  - **Commit C — DATA/UX:** `git commit -F <msg> -- src/components/HermesPending.tsx <answer-renderer file> src/components/dashboard/StatsCard.tsx scripts/seed-grant-milestones.sql`
  - (Note: some files appear in both security + CT-2, e.g. projects.ts/pb-sector.ts/index.ts — assign each FILE to exactly ONE commit to keep path-explicit clean; group by the file's dominant change.)
  - Author = `ingra107`, NO Claude attribution (Rule 20).
- [ ] **I4:** deploy — `npm run deploy:pages:gated` (load `CLOUDFLARE_API_TOKEN` from PB `scripts/scheduled/secrets.ps1`; do NOT `wrangler login`).
- [ ] **I5:** post-deploy smoke — `wrangler pages deployment list` (confirm live commit), `/api/health` ok, `/api/version` env=production; unauth GET `/api/team` has no `email`; non-PI search excludes a PB title.
- [ ] **I6:** SYNC agent commits its PB-repo changes independently (already done in Wave 1 report).
- [ ] **I7:** update `SESSION-HANDOFF.md` + `WORKPLAN.md` (move shipped items to done ledger) + `CHANGELOG.md`.

---

# WAVE 3 — GATED (do NOT auto-run; after Wave 2 ships + Nick OK)

- [ ] **Safe deletes (low risk):** `handleUpsertTodayMd` (dead function — grep for callers first, confirm zero), tracked `.pyc` files. These can go via a small commit once confirmed dead.
- [ ] **Risky deletes (require `justify-it` + `substrate-swap`):** dropping tables `decision_log`, `*_new`, `watchlist`, `narrative_projects`, `research_narratives`; removing legacy MyTasks/UnifiedMyTasks/AuthContext shims; stale seed path. Each needs a row-count proof + tombstone decision doc. **KEEP** `project_publications`/`open_science_resources`/`pubmed_sync_log` (FAKE-1 citation substrate, per Nick). Run `justify-it` before any of these.

---

## Self-Review (against WORKPLAN spec)

- **Spec coverage:** SEC-T0-1✓(B3) -2✓(B4) -3✓(B6) -4✓(B5) -5✓(B1) -6✓(B2) -7✓(B7) -8✓(B8a) -9✓(B8b); CT-2 server✓(B9) frontend✓(F1); CON-2 emailSlug✓(F4a) res.ok✓(F4b) TaskRow✓(F4c) [key_link invalid — dropped]; FAKE-1✓(F3) FAKE-2✓(F2); DH-1✓(B10) DH-2✓(F5); sync✓(S1).
- **Placeholder scan:** DH-1 seed values flagged as "Nick supplies if unknown" (data, not engineering placeholder) — acceptable.
- **Type consistency:** `localDateKey()` (F1) used consistently; `actorSlug` reused not duplicated (B2); `PROTECTED_NON_NULL` map shared concept across B1's two files.
- **Concurrency safety:** every file appears under exactly one agent's domain; agents don't commit; orchestrator assigns each file to one commit. ✓

---

# CODEX AMENDMENTS (2026-05-22) — SUPERSEDES the task text above for dispatch

> Codex plan-audit (gpt-5.5, high reasoning, 217K tokens) verdict: **BLOCK as written — ship after amendment, no soak.** Every finding below was spot-checked against actual code this session (CONFIRMED). Raw: `Scratch/codex-plan-audit-2026-05-22/raw-output.md`. Where this section conflicts with a task above, THIS section wins.

## AM-0 — Commit model was fiction. New integration model (replaces Wave 2 I3)

`projects.ts` is touched by B1+B2+B3+B7+B9; `index.ts` by B3+B9; `tasks.ts` by B1+B2+B5; `uploads.ts` by B2+B11. Path-explicit SECURITY-vs-CORRECTNESS commits **cannot** split one file's two logical changes. New grouping (each commit's files are directory-disjoint, so path-explicit holds):
- **Commit 1 — BACKEND** (one coherent commit): ALL `api/**` files touched (security + CT-2 together). Rollback = revert this commit.
- **Commit 2 — FRONTEND**: ALL `src/**` files touched.
- **Commit 3 — DATA**: `scripts/seed-grant-milestones.sql` (only if produced).
- **Commit 4 — SYNC**: PB repo, committed there by the SYNC agent (separate repo/index).

## AM-1 — B1 expanded: ONE shared protected-field validator across THREE write paths

B1 as written only guarded `/api/mutations` applyPatch + `/api/projects/:id`. Confirmed gaps:
- `api/routes/tasks.ts:245-248` (`handleUpdateTask`) silently `continue`s on null/empty `status`/`priority`/`assignee` (`TASK_REQUIRED_FIELDS` set at :217) — same silent-skip bug.
- `api/routes/mutations.ts`: `applyInsert` (:434-448) AND `applyPatch` (:785-792) both spread payload/patch values with **no** null guard. Allowlist dispatch at :332-344 sets `fields = mut.op==='insert' ? mut.payload : mut.patch` — so the validator must run on BOTH.

**Fix:** create `assertProtectedNotNull(table, obj)` in `api/lib/` (or `api/helpers.ts`) → throws/returns 400 if a protected field is present-and-null/empty. Protected: `tasks: [status, priority, assignee]`, `projects: [status, stage, category]`. Call it from: mutations `processOne` immediately after allowlist validation (:332-344, covering insert payload + update patch); `handleUpdateProject` (:498-501 — replace silent `continue` with hard 400); `handleUpdateTask` (:245-248 — same). One helper, three call sites.

## AM-2 — B2 expanded: actor canonicalization is ~11 sites + a unified policy (not 6)

Confirmed additional raw-actor / spoof sites beyond the original 6:
- `project-documents.ts:39` — `body.created_by` used raw.
- `digest.ts:142` — author via `email.split('@')[0].replace(/\./g,'-')`, not `actorSlug`.
- `tasks.ts:939,943` — task-update `body.author_slug` arbitrary, no slug validation.
- `questions.ts:170,181` — answer `body.author_slug` arbitrary.
- `projects.ts:820,826` — project-update `body.author` arbitrary AND fallback is raw `user.email` (dual issue).

**Unified policy to implement (write once, apply at every actor-write site incl. the original 6):** identity = `actorSlug(user.email)` by default. A caller-supplied override (`author`/`author_slug`/`created_by`/`asked_by`/`submitted_by`/`to_slug`) is accepted ONLY if it is a valid `team_members.slug` (canonicalize email-looking values through `actorSlug` first); unknown slug → 400. **Cross-identity impersonation** (override ≠ caller's own slug) allowed ONLY for PI requests or the API-key/service path — EXCEPT `claude-ai` (Hermes posts answers as `claude-ai` via the listener; must stay allowed). Add a `resolveActor(user, override, {allowImpersonation})` helper so the rule lives in one place.

## AM-3 — B3 expanded: full public-GET allowlist audit + signature changes

- `handleGetTeam(env)` (`team.ts:5`) has no auth param → **change signature** to receive auth state from the `index.ts` router. Unauth → public-safe projection using REAL field names (`photo_url`, not `photo`; confirmed `src/lib/api.ts:33`): slug, name, preferred_name, role, member_type, photo_url, title. Authed → may include email/auto_created. Never `SELECT *` on the public path.
- `/api/projects/health` (`projects.ts:304-317`) → exclude `category='Peripheral Brain'` unless PI.
- `/api/activity` → gate or filter PB rows.
- **NEW `/api/meetings`** (`isPublicGet` index.ts:131; `meetings.ts:17` `SELECT *` exposes notes/agenda) → remove from public allowlist OR project a public-safe list (no notes/agenda/internal fields). Caller-check the marketing site first.
- **NEW `/api/team/pulse`** (index.ts:120; `team-pulse.ts:12-24` aggregates per-member updates/completions/activity actors) → require auth OR return only non-sensitive aggregate counts.
- **Deliverable:** enumerate EVERY entry in `isPublicGet` (index.ts:112-148); for each, classify safe-public vs needs-gating, and act. Report the full table.

## AM-4 — B4 expanded: search needs auth context + visibility on ALL project-derived results

`handleGetSearch(url, env)` (`search.ts:110`) has no auth param → **change signature** to receive request/user/apiKey from `index.ts`. A single shared `visibleProjectPredicate(user)` must apply to EVERY project-derived result, not just the projects query:
- projects `:129-131` · comments + project_updates joins `:139-147` · files entity exposure `:161-163` · task hits `:127-128`.
Non-PI/unauth → exclude PB-category. PI → everything.

## AM-5 — B5 expanded: redact `notes` from BOTH task endpoints

`tasks.ts:44` (list) AND `tasks.ts:135-137` (single-task GET, `SELECT t.*` in a meetings JOIN) both expose `notes`. Replace BOTH with explicit column lists that EXCLUDE `notes` and KEEP everything the frontend uses incl. `description`, `group_override`, and the v55 op-fields `waiting_on`/`promised_to`/`promise_date`/`next_checkin_date` (already in the mutation allowlist at `mutations.ts:124-125`; F4c adds them to the TS type — keep them flowing).

## AM-6 — NEW B11: attachment entity-visibility gate (pre-adoption hole, not in original plan)

`uploads.ts` has NO entity-visibility check anywhere: list `:103-115` (any entity_id), download/sign `:119-136` (any R2 key), delete `:140-152` (by attachment id only). **Fix:** before list/sign/delete, resolve the parent entity (project/task) and enforce the caller can see it — block PB-category project files for non-PI. Risk A. This is the most-overlooked hole; treat as a release gate.

## AM-7 — CT-2 corrected per-site rulings (replaces B9 + F1 site lists)

**Server — CHANGE to `ctToday()`:** `projects.ts:308-317` · `index.ts:1059` · `pb-sector.ts:44` (SQLite `date('now')` window → bind `ctToday()` params) · `pb-sector.ts:501-506` (history window) · `regulatory.ts:38-41` (`ctToday(days)`) · `submissions.ts:147` · `submissions.ts:161-165` (day counts) · `conferences.ts:41-47`.
**Server — KEEP (do NOT change):** `pb-sector.ts:142` (prev-date arithmetic anchored to `targetDate`, NOT a today anchor — changing = regression) · `index.ts:1053` (display string) · `index.ts:1038` (morning cron window, no CT/UTC divergence at cron time).
**Frontend — CHANGE to `localDateKey()`:** CalendarPage `:52-53,74,77,133,258,377,384,446,448,506` · PBSector `:53,179` · TodayView `:161` · ConferencePrep `:64,67` · SubmissionTimeline `:112` · useApiData `:398` (low-priority but include).

## AM-8 — Dropped / no-op (verified already satisfied)

- **F3 (FAKE-1):** DROP — `StatsCard.tsx:118-119` already renders `—` when `!citations || members_with_data===0`. No change.
- **F5 (DH-2):** DROP — generic `public/manifest.webmanifest` exists; no Pulse manifest needed. No change.
- **B10 (DH-1):** template-only seed SQL; do NOT invent milestone data (invented data is worse than none). If real grant IDs/dates unknown → emit template + note for Nick, do not apply.

## AM-9 — Sequencing & shipping bias (codex confirmed: NO soak)

- All inter-task ordering for AM-1/3/4 lives WITHIN the single BACKEND agent (it owns all of `api/`) → no cross-agent ordering needed. FRONTEND + SYNC stay fully parallel to BACKEND.
- F4c (TaskRow type) just mirrors what the API already returns (allowlist already has the fields; B5 keeps them) → no hard dependency, but verify after B5.
- B8 (JWT fail-closed): ship on green + smoke; lockout risk is caught by `/api/auth/me` + gated-GET + PI-route smoke faster than any burn-in. No flag.
- Every item is ship-now (A) or sequence-within-backend (B). No (C) burn-in.
- **Expanded smoke (Wave 2 I5):** add — unauth `/api/meetings` has no notes; unauth `/api/team/pulse` gated-or-aggregate-only; non-PI attachment list on a PB-category project → 403; non-PI search excludes PB title; unauth `/api/team` has no email.

## AM-10 — Net effect on BACKEND agent scope

BACKEND now also owns: shared null-validator (3 call sites), ~11-site actor policy + `resolveActor` helper, full public-GET audit (+meetings +team/pulse), search signature+visibility, both task-endpoint redactions, attachment visibility gate (B11), corrected CT sites. Large but coherent and single-agent (all `api/`), so no intra-file collision. Brief it as ordered sub-tasks; it may report in stages.

# Session Handoff — 2026-05-22

## Current State

| Item | Value |
|------|-------|
| HEAD | `5483d30b` on main, pushed to origin |
| Deploy | `2c217abf.mn-ccore-lab.pages.dev` (2026-05-22) — LIVE, `/api/health` ok, `/api/version` env=production |
| Build | GREEN (0 TS errors) |
| API tests | 178/178 passing |
| Schema | **v68** on prod D1 (`projects.stage_entered_at` added + backfilled 92/92 rows). Also applied to test D1. |
| API auth | GET endpoints locked down (unchanged from 2026-05-15) |
| Team adoption | Not yet broadly directed. |

## What shipped this session (2026-05-22) — verify-first batch

Nick: "do Batch 1 + Batch 2 + schema migrations, but verify each is still needed first." Verification killed 4 of 9 backend items as already-fixed and deferred 3 of 5 schema items as dead columns. Net 8 real changes shipped + deployed.

**`3bd5d419` — 5 backend correctness fixes (Batch 1+2):**
- SEC-4 timezone DST (`pb-sector.ts` + `digest-email.ts` → `Intl.DateTimeFormat('America/Chicago', h23')`)
- SEC-6 project FK resolver on pb-sector capture
- DAT-3 `/api/tasks/batch` returns `{ok,count,applied,failed}` (additive)
- DAT-6 meeting-notes 404 on missing meeting
- DAT-8 regulatory renew wrapped in `env.DB.batch()`

**`9eb9b192` + `5483d30b` — D7 (`projects.stage_entered_at`, fixes FAKE-5):** schema-v68 (Hub-only) + frontend surface + `daysInStage` fix. The write engine (co-flip in `applyPatch`, fires on any stage transition) lives in `8990acb7` — see heads-up below.

**`1c40fa2a` — D22 (typed activity_log events):** stage_change, pi_change, project_rename, assignee_change, role_assignment. No schema needed (table existed).

**Verified ALREADY-FIXED / deferred (no work):** SEC-5 (ON CONFLICT dedup), DAT-1 (PK_COLUMN map), DAT-2 (ALLOWED_TABLES), DAT-5 (404/400 guards). D8/D9/D28 deferred — dead columns until their features are built. `meeting_cancel` N/A — no cancel handler.

## ⚠️ Heads-up for next session

1. **A background `builder` agent committed AND pushed to this repo concurrently** (`8990acb7` advanceProjectMovement, 09:49). Its commit wasn't path-explicit, so it **swept this session's D7 `applyPatch` co-flip into it** — that's why the stage_entered_at write engine is in a commit labeled "advance project movement." Code is correct, `ingra107`-authored, no Claude attribution. But: if a builder agent is running, coordinate / expect concurrent commits. `8990acb7` also flagged a follow-up: `stale_active_since` NULL doesn't pull back to brain.db (hub.py `_w1col` truthy gate skips NULL) — companion fix needed for full symmetry.
2. **Test D1 (`mnccore-lab-test`) is drifted** — missing schema-v55 columns (`last_meaningful_movement` et al.). Surfaced when v68's original backfill referenced one. Pre-existing; worth a janitor/schema-sync pass to bring test D1 current with prod.

## Prior session — 2026-05-15 (13 commits)

### Security (5 fixes — all deployed)
- **GET API auth lockdown** — `isPublicGet()` allowlist in `api/index.ts`. ~20 public routes (team, stats, publications, health), everything else requires JWT or API key. Smoke tested: `/api/tasks` → 401, `/api/team` → 200.
- **Admin/test endpoints deleted** — `/api/admin/migrate` and `/api/test-cleanup` removed from `api/index.ts`.
- **escapeHtml on 16 email sites** — `api/lib/escapeHtml.ts` created. Wrapped all DB interpolations in `digest-email.ts` (10 sites) and `api/index.ts` pulse email (6 sites).
- **PB POST routes PI-gated** — middleware changed from GET-only to all methods. PB sync (Bearer token) still works.
- **Upload R2 integrity** — `handleUploadDone` now HEAD-checks R2 before DB insert. Frontend checks PUT/done responses, `finally` clears upload state.

### Data/Naming Fixes (5 fixes — all deployed)
- **Project archive** — `'Completed'` → `'done'` in `ProjectDetail.tsx`. Archive button now works.
- **Manuscripts categories** — `clif/lab/nate/mentee` → `MNCCORE/CLIF/Peripheral Brain` in `ManuscriptsPage.tsx`.
- **Digest stale enums** — removed `category='manuscript'` filter (doesn't exist), fixed `status!='completed'` → `status!='done'`, replaced `stage_changed_at` → `updated_at`.
- **Search comment join** — `c.project_id = p.slug` → `c.project_id = p.id OR c.project_id = p.slug`.
- **v66 migration applied** — `decision_log` renamed to `hub_decisions` on prod D1.

### UX Fixes (3 fixes — all deployed)
- **Folder links** — `urlClassify.ts` handles all drive letters (regex). `TaskGridView.tsx` `KeyLinkIcon` consolidated to use `classifyUrl()` + protocol fire.
- **mnccore-handler.bat** — `.ps1` support + debug logging to `%TEMP%\mnccore-handler.log`.
- **Fake transcript insights removed** — MeetingNotesPage button shows "coming soon" toast. Audio drop zone muted with "coming soon" label.

### Documentation (4 commits)
- **CLAUDE.md diet** — 25K → ~8K tokens (70% reduction). Design system extracted to `docs/design-system.md`. History archived to `docs/archived/CLAUDE.md-history-2026-05-15.md`.
- **WORKPLAN.md created** — single source of truth, 45 items across 4 tiers (17 now done). Supersedes 4 prior planning artifacts.
- **5 doc-code contradictions fixed** — stages (lowercase), categories (3-bucket), task IDs (ULID not hex), Hermes timing, category mapping.
- **6 decisions resolved** — Hermes pulse card, transcripts next session, role-based Lab Overview, build citations cron, kill AskHermes coach, iCal user-only.

### NOT fixed (intentional)
- **Project delete cascade** — existing swallow-and-continue behavior is a documented design decision (`projects.cascade.test.ts` B-CRIT-05).

---

## Next Session Playbook

**Read `WORKPLAN.md` — it's the single source of truth.** Everything below is a prioritized queue extracted from it.

### Batch 1 (T0 Security) + Batch 2 (T1 Data Integrity) — ✅ DONE 2026-05-22

Resolved this session. SEC-4/SEC-6/DAT-3/DAT-6/DAT-8 fixed (`3bd5d419`); SEC-5/DAT-1/DAT-2/DAT-5 verified already-fixed (no work). See WORKPLAN.md for per-item evidence. Only **DAT-4** (realtimeBus `'all'` vs `'data'` channel mismatch) remains in this cluster — NOT yet verified or touched.

### Batch 3: T1 Fake/Broken Data (4 items, ~2 hours)

| Task | What | Decision | Effort |
|------|------|----------|--------|
| **FAKE-1** | Wire real `/api/citations` fallback to "—" | Build PB scholarly cron (home laptop) | S (fallback) / L (cron) |
| **FAKE-2** | Build `<HermesPending>` pulse card with timer | Decision: pulse card + elapsed timer | M |
| ~~**FAKE-5**~~ | ✅ DONE 2026-05-22 via D7 (`stage_entered_at`) | — | — |
| **STATE-1** | TodayPage done-state: derive from cache, not localStorage | — | M |
| **STATE-2** | ProfilePage rawRow: add real queryFn | — | S |

### Batch 4: T1 Transcript Backend (1 item, ~1 hour)

| Task | What | Decision |
|------|------|----------|
| **FAKE-3 backend** | Build `/api/meetings/process-transcript` via ai-requests (same pattern as Hermes @mention in `questions.ts`) | Decision: build it |

### Batch 5+: T2 UX Polish (16 items), T3 Infra (6 items)

See WORKPLAN.md for full details. These are "during adoption" items, not blockers.

### Schema Queue

| ID | What | Status |
|----|------|--------|
| D7 | `projects.stage_entered_at` | ✅ DONE 2026-05-22 (schema-v68, Hub-only) |
| D22 | `activity_log` typed emits | ✅ DONE 2026-05-22 (no schema; 5 typed events) |
| D8 | `lab_questions.tags` | DEFERRED — build with AskTheLab tag-filter feature |
| D9 | `commitments.to_slug` | DEFERRED — build with MyItems commitment tracker |
| D28 | `meetings.start_time/end_time` | DEFERRED — build with time-aware Calendar |

### Manual Items (Nick-owned)

1. **Register mnccore:// on home machine** — `regedit /s "C:\Users\ingra\mn-ccore-lab\scripts\setup-mnccore-protocol.reg"` (note: home user is `ingra`, work is `ingra107` — check the .reg path matches)
2. **CF Access cleanup** — remove preset Google IdP from CF Access app (Generic OIDC `Google UMN` is canonical)
3. **Team adoption push** — security fixes are deployed. Tell the team when ready.
4. **Kill AskHermes coach ref** — remove mention from CLAUDE.md if still there (per decision 5)

---

## Key Files

| File | Purpose |
|------|---------|
| `WORKPLAN.md` | Single source of truth for all remaining work (28 open items + 17 done) |
| `CLAUDE.md` | Operational guide (~8K tokens, dieted this session) |
| `docs/design-system.md` | Extracted design reference (palette, spacing, animations, etc.) |
| `docs/archived/CLAUDE.md-history-2026-05-15.md` | Archived CLAUDE.md content |
| `Scratch/codex-hub-audit-2026-05-15/synthesis.md` | Codex GPT-5.5 audit results (all findings verified) |
| `audit/2026-04-28/` | Historical audit artifacts (superseded by WORKPLAN.md) |

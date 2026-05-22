# Session Handoff — 2026-05-22

## Current State

| Item | Value |
|------|-------|
| HEAD | `8ebb490e` on main, pushed to origin (commits after `909c6e8` are DOCS-only — handoff/WORKPLAN/CLAUDE.md/codex-review; prod app code = `909c6e8`, no redeploy needed) |
| Deploy | `af3189f0.mn-ccore-lab.pages.dev` (2026-05-22 PM) — LIVE on commit `909c6e8`, `/api/health` ok, `/api/version` env=production |
| Build | GREEN (0 TS errors) |
| API tests | 178/178 passing |
| Schema | **v68** on prod D1. Test D1 (`mnccore-lab-test`) **fully reconciled to prod 2026-05-22 PM** via hub-schema-sync (was missing 27 tables + dozens of columns incl. all of v54/v55/v57/v58; now 76 tables, exact column match, 178/178 tests). |
| API auth | GET endpoints locked down (unchanged from 2026-05-15) |
| Team adoption | Not yet broadly directed. |

## Latest — 2026-05-22 PM: T1 correctness batch (the WORKPLAN directive, DONE)

Executed the full "▶ NEXT SESSION" directive (fixes first → fresh Codex audit as the gate).

**`5f5f597d` — T1 batch:** CT date helper (`api/lib/ct-date.ts` `ctToday(offsetDays)`) replacing 10 UTC "today" anchors + paired window-bounds across tasks/meetings/pb-sector/proactive-brief/projects/digest-email (rolled to tomorrow after ~6pm CT). STATE-2 (ProfilePage `['team-raw']` → real useQuery so save-invalidate refetches). STATE-1 (TodayPage done-from-cache: reconciliation effect prunes optimistic flag on cache-confirm + markDone onError rollback + isToday() instead of UTC slice). Enum-drift audit + DAT-4 realtimeBus: verified clean, no change.

**`909c6e8b` — Codex-gate fixes:** `/codex-cli` audit (synthesis `Scratch/codex-t1-verify-2026-05-22/`) returned Block with 2 critical + 5 minor, all verified + fixed: pb-sector meetings query used SQLite `date('now')` UTC vs CT `today` (dropped today's meeting after 6pm CT); digest date LABELS used `toLocaleDateString` w/o timeZone; reverted over-migrated `fourteenDaysAgo` to UTC; `ctToday` hardened with formatToParts; TodayPage `localDoneIds` dedup; ProfilePage query auth-gated.

**`cf85cfa0` — docs:** corrected CLAUDE.md deploy rows (manual-only; token from secrets.ps1; push≠deploy; pages.dev=prod vs unused workers.dev).

**Also:** deployed `af3189f0` (verified live on 909c6e8); test D1 reconciled to prod (hub-schema-sync — was missing 27 tables + cols, now 76 exact match); librarian corrected 3 stale brain.db agent_knowledge entries that falsely claimed "Pages auto-deploys on push via GitHub Actions."

**`8cb953df` + `8ebb490e` — 5-pass Codex "simplify + improve" review** (WORKPLAN-blind, exclusion-chained, ~8 findings spot-checked accurate): graduated into `WORKPLAN.md` "Codex 5-pass review" section + `docs/reviews/2026-05-22-codex-simplify/`. **Top output = a pre-adoption SECURITY tier (T0)** — all NET-NEW, none active yet (team adoption not started): over-exposed public GETs (PB titles + emails), search ignoring PB-category visibility, `/api/mutations` nulling protected fields, 9 identity-canonicalization bypasses, cascade gaps. The "fail-open JWT" was verified a NON-issue (CF_ACCESS_TEAM_DOMAIN/AUD set in prod). Also: ~12 more CT/UTC sites the api-only sweep missed (PB Sector/regulatory/submissions/conferences/frontend Calendar).

### ⚠️ Deploy + auth — learned this session (see CLAUDE.md Quick Reference)
Deploy is **MANUAL ONLY** — `npm run deploy:pages:gated`; pushing to origin/main does NOT deploy. Auth via **`CLOUDFLARE_API_TOKEN`** (PB `scripts/scheduled/secrets.ps1`), NOT interactive `wrangler login`. Verify live commit: `wrangler pages deployment list --project-name mn-ccore-lab`.

## What shipped earlier 2026-05-22 (AM) — verify-first batch

Nick: "do Batch 1 + Batch 2 + schema migrations, but verify each is still needed first." Verification killed 4 of 9 backend items as already-fixed and deferred 3 of 5 schema items as dead columns. Net 8 real changes shipped + deployed.

**`3bd5d419` — 5 backend correctness fixes (Batch 1+2):**
- SEC-4 timezone DST (`pb-sector.ts` + `digest-email.ts` → `Intl.DateTimeFormat('America/Chicago', h23')`)
- SEC-6 project FK resolver on pb-sector capture
- DAT-3 `/api/tasks/batch` returns `{ok,count,applied,failed}` (additive)
- DAT-6 meeting-notes 404 on missing meeting
- DAT-8 regulatory renew wrapped in `env.DB.batch()`

**`9eb9b192` + `5483d30b` — D7 (`projects.stage_entered_at`, fixes FAKE-5):** schema-v68 (Hub-only) + frontend surface + `daysInStage` fix. The write engine (co-flip in `applyPatch`, fires on any stage transition) lives in `8990acb7` — see heads-up below.

**`1c40fa2a` — D22 (typed activity_log events):** stage_change, pi_change, project_rename, assignee_change, role_assignment. No schema needed (table existed).

**Verified ALREADY-FIXED / deferred (no work):** DAT-1 (PK_COLUMN map), DAT-2 (ALLOWED_TABLES), DAT-5 (404/400 guards). D8/D9/D28 deferred — dead columns until their features are built. `meeting_cancel` N/A — no cancel handler.

**Then: Codex audit + audit-fix batch.** Ran a `/codex-cli` state audit (synthesis: `Scratch/codex-state-audit-2026-05-22/synthesis.md`). It caught real misses, all verified + fixed in **`6a69cfb2`** (deploy `4681a29c`):
- **advanceProjectMovement** matched `WHERE id=?` only, but tasks store project *slug* → silently never advanced `last_meaningful_movement` (regression in `8990acb7`). Now `id=? OR slug=?`.
- **D7 new-project hole** — `handleCreateProject` didn't set `stage_entered_at` → new projects NULL → bug recurred. Now set on insert.
- **SEC-5 was wrongly dismissed** — random UUID per submit meant double-click made duplicate inbox rows. Now a stable per-draft id reused across retries (server `ON CONFLICT(id)` dedups).
- **Manuscripts status enum** — UI sent `pending`/`completed` the server rejects → silent revert. Aligned to `active/waiting_external/blocked/done` (both dropdowns).
- **D22 batch-assign** now emits `assignee_change` (was single-task only).

## ⚠️ Heads-up for next session

1. **A background `builder` agent committed AND pushed to this repo concurrently** (`8990acb7` advanceProjectMovement, 09:49). Its commit wasn't path-explicit, so it **swept this session's D7 `applyPatch` co-flip into it** — that's why the stage_entered_at write engine is in a commit labeled "advance project movement." Code is correct, `ingra107`-authored, no Claude attribution. But: if a builder agent is running, coordinate / expect concurrent commits. (The slug/id bug `8990acb7` introduced in advanceProjectMovement was caught by the Codex audit + fixed in `6a69cfb2`.) Still-open follow-up from that commit: `stale_active_since` NULL doesn't pull back to brain.db (hub.py `_w1col` truthy gate skips NULL) — companion fix needed for full symmetry.
2. **Test D1 (`mnccore-lab-test`) is drifted** — missing schema-v55 columns (`last_meaningful_movement` et al.). Surfaced when v68's original backfill referenced one. Pre-existing; worth a janitor/schema-sync pass to bring test D1 current with prod.

## Prior session — 2026-05-15 (13 commits)

Security (digest XSS/escapeHtml, GET API auth lockdown, admin endpoints deleted, PB POST PI-gating, upload R2 integrity), data/naming fixes (ProjectDetail archive, Manuscripts categories → 3-bucket, digest enums, search comment join, v66 `hub_decisions` rename), UX (folder-link drive letters, mnccore-handler, transcript honesty), and the CLAUDE.md diet + WORKPLAN creation. Full detail in `CHANGELOG.md` + git history. **NOT fixed (intentional):** project delete cascade swallow-and-continue (documented design decision, `projects.cascade.test.ts` B-CRIT-05).

---

## Next Session Playbook

**▶ The 2026-05-22 T1 directive is DONE** (fixes-first + Codex gate executed; CT sweep, STATE-1/2, enum-drift, DAT-4, test-D1 all closed — see "Latest — 2026-05-22 PM" above). The natural next session is the **TIER-0 SECURITY batch** from the new Codex review (`WORKPLAN.md` "Codex 5-pass review" → SEC-T0-1..9): it's the pre-adoption gate before the Hub opens to ~20 people, and it's all NET-NEW. Highest-leverage / lowest-risk first: SEC-T0-5 (mutations null-guard), SEC-T0-1 (public-endpoint gating), SEC-T0-6 (identity canonicalization). Otherwise pick a tier from `WORKPLAN.md`:

- **T1 leftovers:** FAKE-1 (Lab Overview `totalCitations` hardcoded — show `—` until PB scholarly cron), FAKE-2 (Hermes "Thinking…" → `<HermesPending>`), DH-1 (grant_milestones seed data), DH-2 (verify/drop Pulse PWA manifest).
- **CT-2 (from Codex review):** ~12 more UTC "today" sites the api-only sweep missed (server: projects/index/pb-sector/regulatory/submissions/conferences; frontend Calendar/PBSector → a `localDateKey()` helper).
- **Open follow-up from the morning batch:** `stale_active_since` NULL doesn't pull back to brain.db (`hub.py` `_w1col` truthy gate skips NULL) — companion fix for full symmetry.
- **T2 polish** (during adoption): see WORKPLAN T2 (brand primitives, token discipline, keyboard nav, search source isolation, mobile breakpoint split-brain).

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
| `WORKPLAN.md` | Single source of truth for remaining work (open items first; done in a compact ledger) |
| `Scratch/codex-state-audit-2026-05-22/synthesis.md` | Latest Codex audit (2026-05-22; all findings verified) |
| `CLAUDE.md` | Operational guide (~8K tokens) |
| `docs/design-system.md` | Extracted design reference (palette, spacing, animations) |
| `docs/archived/CLAUDE.md-history-2026-05-15.md` | Archived CLAUDE.md content |

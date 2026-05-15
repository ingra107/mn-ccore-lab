# Session Handoff — 2026-05-15

## Current State

| Item | Value |
|------|-------|
| HEAD | `9782e46a` on main, pushed to origin |
| Deploy | `7f355d9f.mn-ccore-lab.pages.dev` (2026-05-15) |
| Build | GREEN (3814 modules, 0 errors) |
| API tests | 171/171 passing |
| Schema | v66 on prod D1 (`hub_decisions` rename applied this session) |
| API auth | GET endpoints locked down — ~20 public routes (allowlist), rest requires JWT/API key |
| Protocol | `mnccore://` registered on work machine via `scripts/setup-mnccore-protocol.reg` |
| Team adoption | Not yet broadly directed. Security fixes deployed — ready when Nick says go. |

## What shipped this session (13 commits)

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

### Batch 1: Remaining T0 Security (3 items, ~1 hour)

All small, all independent. Can dispatch in parallel.

| Task | File(s) | What to do | Effort |
|------|---------|-----------|--------|
| **SEC-4** | `api/routes/pb-sector.ts:9`, `api/routes/digest-email.ts:290` | Replace `getUTCHours()-6` and `getUTCHours()-5` with `new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago', hour:'numeric', hour12:false}).format(new Date())`. | S |
| **SEC-5** | `src/components/QuickCaptureInbox.tsx:113-129`, `api/routes/inbox-events.ts:143-167` | Add deterministic `source_external_id` (hash of content+timestamp) to prevent double-submit duplicates. | M |
| **SEC-6** | `api/routes/pb-sector.ts:205` | Add project ID resolution before inserting — same pattern as `api/routes/tasks.ts:331-344`. | S |

### Batch 2: T1 Data Integrity (6 items, ~2 hours)

| Task | What | Effort |
|------|------|--------|
| **DAT-1** | `day_capacity` mutations: add `idCol='date'` branch in `applyInsert`/`applyDelete` | S |
| **DAT-2** | Expand `applyMutation` to handle `inbox_events`, `day_capacity`, `project_state_log` | M |
| **DAT-3** | `/api/tasks/batch` should return `{applied:[], failed:[]}` on partial failure, not bare 200 | M |
| **DAT-5** | `revisions.ts`: check `result.changes > 0` before writing activity_log | S |
| **DAT-6** | `meetings.ts` notes: return 404 on missing meeting, not 200 | S |
| **DAT-8** | `regulatory.ts` renew: wrap in `env.DB.batch()` | S |

### Batch 3: T1 Fake/Broken Data (4 items, ~2 hours)

| Task | What | Decision | Effort |
|------|------|----------|--------|
| **FAKE-1** | Wire real `/api/citations` fallback to "—" | Build PB scholarly cron (home laptop) | S (fallback) / L (cron) |
| **FAKE-2** | Build `<HermesPending>` pulse card with timer | Decision: pulse card + elapsed timer | M |
| **FAKE-5** | Fix `daysInStage()` to not reset on any field edit | Needs D7 schema (`stage_entered_at`) or client-side workaround | S |
| **STATE-1** | TodayPage done-state: derive from cache, not localStorage | — | M |
| **STATE-2** | ProfilePage rawRow: add real queryFn | — | S |

### Batch 4: T1 Transcript Backend (1 item, ~1 hour)

| Task | What | Decision |
|------|------|----------|
| **FAKE-3 backend** | Build `/api/meetings/process-transcript` via ai-requests (same pattern as Hermes @mention in `questions.ts`) | Decision: build it |

### Batch 5+: T2 UX Polish (16 items), T3 Infra (6 items)

See WORKPLAN.md for full details. These are "during adoption" items, not blockers.

### Schema Queue (5 cross-repo migrations, none started)

| ID | What | Unblocks |
|----|------|----------|
| D7 | `projects.stage_entered_at` | FAKE-5 |
| D8 | `lab_questions.tags` | AskTheLab filters |
| D9 | `commitments.to_slug` | MyItems commitments |
| D22 | `activity_log` emit | INFRA-1, Activity tab |
| D28 | `meetings.start_time/end_time` | Calendar time-aware |

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

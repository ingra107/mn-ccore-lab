# Session Handoff — 2026-05-15 (post-simplification consolidation)

## Current State

**HEAD:** `548f1a39` on main (in sync with origin)
**Deploy:** Last known deploy is Phase 38/39 era — naming refactor commits (30 since May 10) have NOT been deployed yet.
**Build:** GREEN (3814 modules, 0 errors). Two build breaks from naming refactor fixed this session (`548f1a39`).
**API tests:** 171/171 passing (vitest).
**Schema:** v54 on prod D1 (v66 `decision_log -> hub_decisions` rename exists on disk but NOT applied to prod).
**Team adoption:** CF Access gated but team not yet broadly directed to use it.

## What happened since last handoff (May 5 -> May 15)

### PB-side (372 commits)
1. **Simplification sprint** — 3,680 files untracked from git, four-lane doctrine enforced, 580 LOC of hooks deleted, 49 scheduled tasks disabled, hook LOC 6,905 -> <2,500
2. **Naming convention refactor** — all enums lowercase (cross-repo), Python function verbs standardized, document naming rules codified
3. **Infrastructure hardening** — root-cause cures for 12 bug classes, component registry, outbox improvements, context diet (~3,854 tokens trimmed)

### Hub-side (30 commits)
1. **Mutations API sole write path** — `/api/tasks/sync-bulk` deleted (274 lines), all PB writes through `/api/mutations`
2. **Lane 3 generic GET** — `GET /api/lane3/:table` serves 8 semantic tables
3. **Schema contract lint** — `scripts/audit-schema-contract.ts` validates TABLE_FIELDS vs schema (0 gaps)
4. **Naming refactor** — 17 handlers renamed (`handleGet*`), 6 page files renamed (`*Page`), `decision_log -> hub_decisions` (v66), enums lowercase, 3 HTTP method fixes
5. **Build fixes** — `todayKey` import restored, `Grant.status` casing restored

### This session (May 15)
- Fixed 2 build breaks from naming refactor
- Consolidated 4 overlapping backlogs into `WORKPLAN.md` (single source of truth)
- CLAUDE.md major diet (target: ~10K tokens from ~25K)
- This SESSION-HANDOFF.md rewritten

## What to do first

1. **Read `WORKPLAN.md`** — consolidated, tiered punch list. Supersedes audit synthesis-plan, codex fix-plan, CD tickets, and future-ideas.
2. **Deploy** when ready — 30 commits of naming refactor + build fixes are on main but not deployed. Deploy command: `npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab`
3. **Apply schema v66** to prod if deploying (the `hub_decisions` rename): `npx wrangler d1 execute mnccore-lab --remote --file=api/schema-v66-rename-decision-log.sql`

## Schema queue (cross-repo, needs Nick)

| ID | Column/Table | Unblocks | Status |
|----|-------------|----------|--------|
| D7 | `projects.stage_entered_at` | M-03 stalled counter | Not started |
| D8 | `lab_questions.tags` | ATL-06 tag filter | Not started |
| D9 | `commitments.to_slug` | MI-07 commitment tracking | Not started |
| D22 | `activity_log` emit on changes | PD-3 Activity tab + M-03 | Not started |
| D28 | `meetings.start_time/end_time` | Calendar time-aware C-03 | Not started |

## Manual items (Nick-owned)

1. **PB scholarly cron** — `scripts/citations-scholar-stub.md` on home laptop. Without it, `/api/citations` returns zero-state.
2. **CF Access cleanup** — remove preset Google IdP (Generic OIDC `Google UMN` is canonical).
3. **Deploy + v66 migration** — see "What to do first" above.

## Key files

| File | Purpose |
|------|---------|
| `WORKPLAN.md` | Consolidated work backlog (single source of truth) |
| `CLAUDE.md` | Operational guide (dieted this session) |
| `docs/design-system.md` | Extracted design reference (palette, spacing, animations) |
| `docs/archived/CLAUDE.md-history-2026-05-15.md` | Archived CLAUDE.md content |
| `audit/2026-04-28/` | Historical audit artifacts (findings superseded by WORKPLAN.md) |
| `CHANGELOG.md` | Phase history |

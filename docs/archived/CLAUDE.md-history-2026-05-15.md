# CLAUDE.md History — Archived 2026-05-15

These sections were moved out of `CLAUDE.md` per the token-diet pass of 2026-05-15. The Hub CLAUDE.md was ~28K tokens loaded every session. All historical narrative, fixed-bug gotchas, completed-phase write-ups, and detailed design reference are here.

Original location: `mn-ccore-lab/CLAUDE.md`. Restored to history-only via `git log --follow`.

Design reference (sidebar specs, z-index hierarchy, surface elevation, animations, UX patterns, capture-spec details) moved to `docs/design-system.md`.

---

## Audit-mode protocol (active 2026-04-28, retired as default 2026-05-15)

A multi-agent audit covering 12 portal pages landed 2026-04-28. ~364 findings (22 P0, 109 P1). As of 2026-05-15, ~62% of P0+P1 findings are closed; this is no longer the default workplan for sessions without a specific focus.

**Audit directory** (`audit/2026-04-28/`, git-tracked):
- `README.md` — entry point + workflow
- `VERIFICATION-PROTOCOL.md` — mandatory before any fix (6-step verification protocol)
- `synthesis-plan.md` — prioritized phase plan (P0 batch → A → B → C)
- `progress-log.md` — append-only session log
- `findings-index.md` — quick lookup of all 364 findings by ID + severity + theme
- `reports/01-12.md` — raw agent output for each page

**The cardinal rule**: VERIFY a finding still exists before fixing it. The audit is dated; the codebase changes daily.

**Ask Nick (do not guess) when**:
- File:line citation no longer matches and content search returns nothing
- Schema change or feature deletion required
- Auth / billing / data-write changes
- Open question from `synthesis-plan.md` § "Top Open Questions for Nick" applies
- Phase A cross-cutting sweep (12+ sites at once — bundle vs split is Nick's call)

**Update protocol**: every fixed finding requires an entry in `audit/2026-04-28/progress-log.md` with verification evidence. Commits should reference the finding ID (e.g., `fix(today): wire SmartCompose on morning thought (TP-01)`).

**Resumable agents**: each report has an `agentId`. Use `SendMessage(to: '<id>', prompt: '...')` to drill deeper without re-spawning a full audit.

---

## Current State (2026-04-28 late, post-audit) — snapshot

- **AUDIT WAVE 1-4 SHIPPED + DEPLOYED (2026-04-28).** 11 PRs merged (#55-#65), schema v54 applied to prod. ~100 P0+P1 audit findings closed (~62% of 161 verified). Bundle roll-up: A (P0 quick wins), D (brand sweep), B (Lab Overview wires), G (citations infra + schema v54), H (UnifiedMyTasks rebuild — TaskDrawer.tsx DELETED, replaced with TaskDetailPanel composition), F (ProjectDetail polish), C (SmartCompose universal — 9 sites), O (SearchPage UX foundations), M (InsightsPage feature pass), R (TodayPage Tier-1), N (Manuscripts polish).
- **Phase 39 shipped (2026-04-28 morning).** 4 PRs merged + deployed. (1) Today plan persistence on refresh + Today-completion-syncs-to-/tasks; (2) iCal calendar feeds with full RFC 5545 parser at `api/lib/ics-parser.ts`; (3) auto-create + claim of team_members on first CF Access login (schema v53 `auto_created` flag); (4) `/portal/profile` page + auth lockdown on `PUT /api/team/:slug`. Schemas v52 + v53 applied to prod.
- **GH bug sweep + Overview refocus + Slack-parity (2026-04-23 late evening).** 7 bugs closed (#26-#27, #29-#33), 5 deploy rounds, 30+ commits. Highlights: Revisions project-stage; ProjectDetail Overview refocus 2-col landing card; Notes/Comments restructure (8 tabs); MyTasks TodayHero; legacy-slug root-cause fix; unified search 14 entity types; Files tab on ProjectDetail; live presence.
- **Whole-hub /simplify sweep (2026-04-23 evening).** -5,353 lines net, 22 files deleted, 24 commits. Pruned 17 unused mutation hooks + 18 `lib/api.ts` fetch helpers + 22 dead components. Dropped `tailwindcss-motion` + `@tiptap/extension-mention`.
- **Audit r7 + GH-issue sweep (2026-04-23).** B-visual contrast 37 → 0 violations across 204 page×viewport×theme combos. New CSS tokens: `--stage-fill-*` family, `--gold-on-emphasis`. `--ink-hint` light bumped 0.62→0.68.
- **Phase 37 shipped — portal URL migration.** All gated routes now live under `/portal/*`. `src/constants/paths.ts` + `tests/helpers/paths.ts` single source of truth.
- **Phase 38 — Today B2 + MyTasks Round 2 (2026-04-24/25, SHIPPED + DEPLOYED).** `/portal/dashboard` now renders `TodayPage.tsx`. Old card-grid Dashboard moved to `/portal/overview`. `/portal/my-tasks` replaced by `UnifiedMyTasks.tsx` (3-view: Columns / Lanes / List). SmartCompose (real @mention, emoji, attach). DD-2 saved views. Bulk actions wired. Phase 38 squash-merged as `4e6b86b` (PR #34).
- **CD round-5 (2026-04-23 night).** 49 tickets; shipped ~28 across 4 batches. Raw `<select>` codemod (36 sites / 22 files → InlineSelect/InlineAssigneePicker). Mobile swipe-to-dismiss on TaskDetailPanel via framer-motion drag.
- **Quality gate (as of 2026-04-28):** massive-audit B-visual 204/204 PASS / 0 BUGS (r7), inspection 149/149 post-simplify, build clean, deep-audit 14/14, axe 29×2 = 0, mobile smoke 2/2, desktop journey 1/1.
- **CD design memory (Phase 38 source):** `review/handoff_today_my_tasks_2026.04.24/CLAUDE.md` carries the full Today B2 + MyTasks Round 2 mental model. Read it before touching either page.
- **Current HEAD at archive date:** `548f1a39` on `main`.

---

## Sync Architecture — Detailed Trigger Schedules

**Sync triggers (PB-side):**
- /process: push to D1 (step 4b) + pull from D1 (step 0c)
- Scheduled PowerShell tasks: `sync-pull.ps1` (02:00) / `midday-sync.ps1` (12:00) / `eod-sync.ps1` (17:00) / `sync-push.ps1` (22:00)

---

## R10 Incident Narrative

**The R10 incident:** On 2026-04-13 a migration in this repo (`scripts/round9/r10-projects-status-migration.sql`, commit `145ed8e`) lowercased all project statuses in D1. The Peripheral Brain side was never updated. The legacy `sync_d1_push.py` pull-back path silently wrote the new lowercase values into brain.db, corrupting 38 projects on Nick's home machine. TODAY.md filter stopped showing R01s. Airtable push failed with 422s. 4-hour debug session the next morning. Full postmortem: `C:/Users/ingra107/Peripheral-Brain/Context/Decisions/2026-04-14-r10-taxonomy-cross-repo-cascade.md`

---

## Roadmap — Completed Phases

**Phase 37: COMPLETE** (2026-04-21). Portal URL migration — all 27 gated routes moved under `/portal/*` prefix. Single CF Access destination. Merged as `8600c32`; deployed `c5e46630`. See CHANGELOG.md.

**Phases 1-36: COMPLETE.** See `CHANGELOG.md` or git log. Phase detail archived 2026-05-03 to `docs/archived/CLAUDE.md-history-2026-05-03.md`.

**Key decisions from history:** sidebar darker-than-content is NEVER-violate (GC-1). Framer Motion scoped to page transitions only (GC-2). Ideas + Decisions are columnar tables not cards (GC-3). Data-pages vs dashboard-pages taxonomy (GC-6). Grant + project status taxonomies locked (R10). Research Digest = Model B. Dashboard cards resizable via RGL (R9-9). Hono router declarative — no raw `url.pathname` routing (Phase 36).

**Still open (as of 2026-04-28):**
- ~~DI-4 duplicate projects~~ DONE Phase 36 (2026-04-19).
- ~~DI-6 dangling task project_id~~ RESOLVED 2026-04-19.
- ~~Hermes polling 10→60s~~ DONE (2026-04-16).

---

## Accessibility Requirements (closed gaps)

WCAG 2.1 AA is clean (axe 29 pages × 2 color schemes = 0 findings, r7 2026-04-23). All major gaps were closed as of Phase 23:
- UndoToast: `role="status"` + `aria-live="polite"` (be80679)
- CommandPalette: focus trapping (81da23b)
- CreateTaskModal: focus trapping (be80679)
- CreateProjectModal, CreateIdeaModal, CreateQuestionModal, CreateDecisionModal, TranscriptModal: focus trapping (Phase 23)
- PageHeader count/subtitle: `aria-live` regions
- 13 unlabeled `<select>` elements: `id`/`htmlFor` pairing sweep 2026-04-22

---

## Office of Inspection — Detailed Test Breakdown

**568+ tests** across 4 suites. Self-updating via feature registry + scanner.

| Suite | Tests | File |
|-------|-------|------|
| Inspection | 214 | `tests/inspection.spec.ts` |
| Workflows | 167 | `tests/inspection-workflows.spec.ts` |
| Daily Super-User | 131 | `tests/daily-superuser.spec.ts` |
| Sync Pipeline | 58 | `tests/sync-pipeline.test.py` |

**Run:** `bash scripts/run-tests.sh all` (quick/ui/sync/all modes)

**Test DB isolation:** Tests run against `mnccore-lab-test` (separate D1). `X-Test-Mode: true` header swaps `env.DB` to `env.DB_TEST`. Canonical test prefix: `_TEST_DELETE_`. See `TESTING.md`.

**Legacy production cleanup (only needed for pre-isolation test data):**
```bash
npx wrangler d1 execute mnccore-lab --remote --command="UPDATE tasks SET deleted_at=datetime('now') WHERE title LIKE 'SYNCTEST%'"
npx wrangler d1 execute mnccore-lab --remote --command="UPDATE tasks SET deleted_at=datetime('now') WHERE title LIKE 'INSPECTION%' OR title LIKE 'EDGE%' OR title LIKE 'JOURNEY%' OR title LIKE 'DAILYTEST%'"
npx wrangler d1 execute mnccore-lab --remote --command="UPDATE tasks SET deleted_at=datetime('now') WHERE title LIKE 'SYNC-%'"
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM ideas WHERE title LIKE 'INSPECTION%' OR title LIKE 'EDGE%'"
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM lab_questions WHERE question LIKE 'INSPECTION%' OR title LIKE 'EDGE%'"
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM hub_decisions WHERE title LIKE 'INSPECTION%' OR title LIKE 'EDGE%'"
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM notifications WHERE body LIKE 'SYNCTEST%'"
python -c "import sqlite3; conn=sqlite3.connect('C:/Users/ingra107/Peripheral-Brain/data/brain.db'); conn.execute(\"UPDATE tasks SET status='deleted', completed=1, sync_status='synced' WHERE name LIKE 'SYNCTEST%' OR name LIKE 'INSPECTION%' OR name LIKE 'EDGE%' OR name LIKE 'DAILYTEST%' OR name LIKE 'JOURNEY%' OR name LIKE 'SYNC-%' OR name LIKE 'AAAA%' OR name LIKE 'TEST-%'\"); conn.commit(); print(f'Cleaned {conn.total_changes} test tasks from brain.db'); conn.close()"
```
**Scan for gaps:** `python scripts/inspection-scanner.py --commits 5`
**Registry:** `tests/feature-registry.json` (369 features, 318 covered = 86.2%)
**Guide:** `TESTING.md`

---

## Architecture Notes — Mutations

71 mutations split into 9 domain files. `useMutations.ts` re-exports everything — no import changes needed.
- `useTaskMutations.ts` (5), `useSubtaskMutations.ts` (3), `useProjectMutations.ts` (6), `useMeetingMutations.ts` (4), `useDecisionMutations.ts` (3), `useIdeaMutations.ts` (3), `usePBMutations.ts` (13), `useOtherMutations.ts` (34)

---

## Known Gotchas — Resolved / FIXED entries

Entries marked FIXED or DONE in the active CLAUDE.md gotchas table, preserved here for history:

| Problem | Status |
|---------|--------|
| Duplicate project slugs in D1 | FIXED 2026-04-19: D1 is clean. `POST /api/projects` sanitizes slug server-side. |
| MeetingDetail Rules of Hooks | FIXED. useState/useMemo must come BEFORE early returns. R6 hotfixed. |
| hub-realtime WebSocket namespace | FIXED (commit `46f53c4`). Added `party: 'notification-hub'` to `useRealtimeSync.ts`. |
| `npm run test:local` fails on fresh bootstrap | FIXED 2026-04-23. `schema-v43.sql` ALTER TABLE conflict + `schema-v48-index-reconcile.sql` index conflicts both in `FRESH_BOOTSTRAP_SKIP`. |
| Legacy team slugs in brain.db | FIXED 2026-04-23. 532 `tasks.assignee='nick'` canonicalized to `nick-ingraham`. `hub_payload.py` applies `canonicalize_team_slug()` at write path. |

---

## Capture Specs for Claude Design (Rule 33 detail)

Full capture spec detail for `scripts/regen-design-bundle.sh`. Six specs wired into `playwright.config.design-capture.ts`:
- `capture-for-design.spec.ts` — 41 hero surfaces desktop + 6 mobile, full-page + scroll-through.
- `capture-focus-asks.spec.ts` — round-specific spot captures.
- `capture-scroll-chunks.spec.ts` — 12 long pages broken into viewport-sized chunks (900px bands).
- `capture-theme-light.spec.ts` — 8 key pages via `test.use({ colorScheme: 'light' })`.
- `capture-rich-states.spec.ts` — Network WebGL multi-state, 6 modals, Publications carousel, Dashboard customize.
- `capture-interactions.spec.ts` — 15 signature interactions as WebM (converted via ffmpeg) + PNG keyframes.

**Post-launch auth workarounds:**
- CF Access gates prod `/portal/*`. Pass an ungated preview deploy via `BASE_URL=https://<hash>.mn-ccore-lab.pages.dev bash scripts/regen-design-bundle.sh <name>`.
- `VITE_REQUIRE_AUTH=1` shows sign-in splash. Every spec calls `injectFakeAuth(context, BASE)` from `tests/helpers/capture-auth.ts`.

**Known flakes (non-blocking):** `01-status-change-undo` (dropdown option-click race), `08-date-picker` (cell click doesn't always open picker).

**Video copy:** fallback block in `regen-design-bundle.sh`, NOT the spec's `afterEach`. Script reads `test-results/capture-interactions-*/video.webm` by numeric prefix post-run.

---

## Phase History (detail) — see also CHANGELOG.md

Full phase-by-phase narrative for Phases 14-36 archived 2026-05-03 to `docs/archived/CLAUDE.md-history-2026-05-03.md`.

Phase 37 (2026-04-21): Portal URL migration.
Phase 38 (2026-04-24/25): Today B2 + MyTasks Round 2.
Phase 39 (2026-04-28): iCal calendar feeds + auto-create team members + /portal/profile.
Audit Wave 1-4 (2026-04-28): 11 PRs, schema v54, ~62% P0+P1 findings closed.

# Plan 1B — Time Display Contract Migration

> **Purpose:** Migrate every Hub raw-date display site to `time.ts`/`dateUtils.ts` canonical helpers, then flip the time-discipline lint from WARN to ERROR. This is not a cosmetic date cleanup — it is the lint-enforcement blocker across the codebase. No lint flip until zero lint hits remain.
>
> **Framing note (Trap #3):** The roadmap flags this explicitly. The "~91" estimate in the spec (`docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md:62`) is wrong. The real lint hit count is **139** across R20 + R21, across both `src/` (40 hits) and `api/` (99 hits), covering production code AND test fixtures. The spec's "×50 toISOString, ×41 split|slice" characterization does broadly match — but the total was under-counted because `api/` test files were not included in the estimate. The lint counts them. Every one must be zero before the ERROR flip.
>
> **Prereqs:** Increment 1A forward primitive shipped (time.ts exists, UTC client_ts is shipped, Hub/PB forward guards are live). M1 LMM reconcile recommended first (avoid confusing display fallout with live divergence).
>
> **Shared-file collision risk (Trap #5):** `api/routes/mutations.ts`, `api/routes/tasks.ts`, `api/routes/projects.ts` appear in both this plan and Increment 2. Complete this plan and commit before opening Increment 2's cross-repo window.
>
> **Verification command (lint gate):** `node scripts/check-time-discipline.mjs` — must print `[time-discipline] OK` (0 hits) before the ERROR flip.

---

## 0. How this plan was built

Real enumeration executed 2026-05-25 against HEAD (not estimated):

```
node scripts/check-time-discipline.mjs
```

Output: **139 hits** (R20 = 99, R21 = 40). Breakdown:

| Area | R20 | R21 | Total |
|---|---|---|---|
| `src/` frontend | 15 | 25 | **40** |
| `api/` production routes | 49 | 15 | **64** |
| `api/` test fixtures | 35 | 0 | **35** |
| **Total** | **99** | **40** | **139** |

The spec estimated ~91 (50+41). The actual count is 139 — 52% higher. The undercounting is entirely in the `api/` side; `src/` at 40 is consistent with the spec. The lint script walks both `src/` and `api/` (line 34: `['src', 'api'].forEach`).

---

## 1. Site Inventory — Full Categorized

### Category A: Civil-date keys from UTC Date objects (R21 pattern)
These use `.toISOString().split('T')[0]` or `.toISOString().slice(0, 10)` to derive a YYYY-MM-DD key from a `Date`. This is wrong for users west of UTC after ~6pm local. The canonical replacement is `localDateKey(d)` (frontend) or `ctToday()`/date arithmetic on a known civil date (backend).

**Frontend `src/` — Category A sites (25 R21 hits):**

| File | Lines | Pattern | Classification |
|---|---|---|---|
| `src/components/ActivityHeatmap.tsx` | 42 | `d.toISOString().split('T')[0]` | display: civil date key for heatmap cell |
| `src/components/dashboard/StatusLine.tsx` | 30 | `today.toISOString().split('T')[0]` | display: today anchor |
| `src/components/pb-sector/LandscapeSidebar.tsx` | 100, 113 | `cutoff.toISOString().split('T')[0]` | logic: date comparison cutoff |
| `src/components/pb-sector/PlannerHeader.tsx` | 92, 98, 103, 109 | `t.toISOString().split('T')[0]` / `d.toISOString().split('T')[0]` | logic: date comparison + civil-date emission on nav events |
| `src/components/tasks/TaskTimelineView.tsx` | 99 | `d.toISOString().split('T')[0]` | display: timeline cell key |
| `src/components/today/MorningThoughtCompose.tsx` | 31 | `d.toISOString().slice(0, 10)` | logic: civil date for thought record |
| `src/lib/parseQuickAdd.ts` | 106, 111, 121, 128, 142 | `.toISOString().slice(0, 10)` | logic: civil date computation for due-date parsing |
| `src/pages/Meetings.tsx` | 443 | `nextMeeting.toISOString().slice(0, 10)` | logic: civil date key for meeting lookup |
| `src/pages/MyTasks/components/InlineDetail.tsx` | 71 | `tomorrow.toISOString().split('T')[0]` | logic: "tomorrow" civil date |
| `src/pages/MyTasks/index.tsx` | 180 | `tomorrow.toISOString().split('T')[0]` | logic: "tomorrow" civil date |
| `src/pages/portal/AnalyticsPage.tsx` | 310 | `new Date().toISOString().split('T')[0]` (in filename) | display: filename anchor (also R20) |
| `src/pages/portal/DeadlinesPage.tsx` | 1183, 1214 | `.toISOString().split('T')[0]` | display: week key + week-end label |
| `src/pages/portal/InsightsPage.tsx` | 738 | `d.toISOString().slice(0, 10)` | display: civil date key for insights grouping |
| `src/pages/portal/SessionHistory.tsx` | 54, 260 | `.toISOString().split('T')[0]` | display: session day key + filter anchor |
| `src/lib/dateUtils.test.ts` | 20 | `evening.toISOString().split('T')[0]` | test: assertion of wrong-UTC behavior (special case — this is the test *proving* why localDateKey is needed; see §3) |

**Backend `api/` — Category A sites (15 R21 hits in production routes):**

| File | Lines | Pattern | Classification |
|---|---|---|---|
| `api/lib/ct-date.ts` | 47 | `d.toISOString().split('T')[0]` | helper-internal use inside `ctToday()` offset math — allowlist candidate (see §2) |
| `api/routes/activity.ts` | 51 | `.toISOString().split('T')[0]` | logic: lookback window date key |
| `api/routes/calendar.ts` | 6, 7 | `.toISOString().split('T')[0]` | logic: default window start/end |
| `api/routes/calendar-feeds.ts` | 194, 196 | `.toISOString().slice(0, 10)` | logic: calendar window anchors |
| `api/routes/deadline-cascade.ts` | 110 | `d.toISOString().split('T')[0]` | logic: date arithmetic helper |
| `api/routes/insights.ts` | 303, 389, 465, 470 | `.toISOString().slice(0, 10)` | logic: week window anchors + sparkline ends |
| `api/routes/meeting-cadence.ts` | 20 | `.toISOString().split('T')[0]` | logic: fallback lookback date |
| `api/routes/pb-sector.ts` | 144 | `.toISOString().split('T')[0]` | logic: prev-date civil key |
| `api/routes/proactive-brief.ts` | 13 | `.toISOString().split('T')[0]` | logic: lookback window |
| `api/routes/file-activity.ts` | 7 | `.toISOString().split('T')[0]` | logic: lookback anchor |

---

### Category B: Raw `new Date().toISOString()` for optimistic-update Instant fields (R20 pattern)
These stamp a client-side `nowInstant()` value onto an optimistic local state update. Correct replacement: `nowInstant()` from `src/lib/time.ts`.

**Frontend `src/` — Category B sites (15 R20 hits):**

| File | Lines | Pattern | Notes |
|---|---|---|---|
| `src/components/QuickCaptureInbox.tsx` | 114 | `new Date().toISOString()` | `now` Instant for capture timestamp |
| `src/components/ReactionBar.tsx` | 54 | `new Date().toISOString()` | `created_at` on optimistic reaction |
| `src/components/today/MorningThoughtCompose.tsx` | 41 | `new Date().toISOString()` | `at` Instant for thought record |
| `src/hooks/mutations/useMeetingMutations.ts` | 82 | `new Date().toISOString()` | `completed_at` on agenda item completion |
| `src/hooks/mutations/useOtherMutations.ts` | 126, 161 | `new Date().toISOString()` | `acknowledged_at`, `created_at` on handoff/notification |
| `src/hooks/mutations/useProjectMutations.ts` | 89, 154 | `new Date().toISOString()` | `created_at` on optimistic project |
| `src/hooks/mutations/useSubtaskMutations.ts` | 32 | `new Date().toISOString()` | `completed_at` on subtask toggle |
| `src/hooks/mutations/useTaskMutations.ts` | 42, 108, 111, 141 | `new Date().toISOString()` | `completed_at`, `deleted_at`, `acknowledged_at` on task mutations |
| `src/hooks/useWatchlist.ts` | 27 | `new Date().toISOString()` | `addedAt` on optimistic watchlist add |
| `src/pages/portal/AnalyticsPage.tsx` | 310 | `new Date().toISOString()` | also R21 (in filename string — the `.split('T')[0]` suffix produces both hits at the same line) |

---

### Category C: Backend Instant writes — production routes (R20, api/ non-test)
These stamp `new Date().toISOString()` into D1 write paths. On the Worker, `new Date()` is UTC (no local zone) so these are functionally correct UTC writes. However, they still trigger R20. The canonical replacement is `nowInstant()` from a shared `api/lib/time.ts` helper (see §2, new helper needed).

**`api/` production routes — Category C sites (49 R20 hits):**

| File | Hit count | Representative fields written |
|---|---|---|
| `api/routes/tasks.ts` | 9 | `completed_at`, `updated_at`, `now` |
| `api/routes/calendar-feeds.ts` | 8 | `last_polled_at`, `created_at`, `last_error`, window bounds |
| `api/routes/mutations.ts` | 3 | `client_ts`, `issued_at`, LMM normalization temp |
| `api/routes/projects.ts` | 2 | `stage_entered_at`, `created_at` |
| `api/routes/pb-sector.ts` | 2 | `now` session anchor |
| `api/routes/pb-relay.ts` | 2 | `created_at`, `completed_at` |
| `api/routes/handoffs.ts` | 2 | `client_ts`, `issued_at` |
| `api/routes/subtasks.ts` | 1 | `completedAt` |
| `api/routes/meetings.ts` | 1 | `generated_at` |
| `api/routes/notifications.ts` | 1 | `created_at` fallback |
| `api/routes/projects.ts` | 2 | `stage_entered_at`, `created_at` |
| `api/routes/bug-report.ts` | 1 | reported timestamp in markdown |
| `api/routes/digest-email.ts` | 1 | `generatedAt` |
| `api/routes/regulatory.ts` | 1 | filename timestamp |
| `api/index.ts` | 1 | health check `timestamp` |

---

### Category D: Backend test fixture `client_ts`/`issued_at` stamps (R20, api/ test files)
Test harnesses for mutations/tombstone/dedup use `new Date().toISOString()` to stamp `client_ts`, `issued_at`, `created_at`, `updated_at`, `row[col]` in test rows. These are self-contained test fixtures; correctness = current UTC instant. Replacing with `nowInstant()` (from a test-accessible import) is mechanical and needed to clear the lint.

**`api/` test files — Category D sites (35 R20 hits across 8 test files):**

| File | Hit count |
|---|---|
| `api/routes/tasks.dedup.test.ts` | 17 |
| `api/routes/mutations.tombstone-cascade.test.ts` | 12 |
| `api/routes/mutations.deleted-status.test.ts` | 8 |
| `api/routes/mutations.partial-batch.test.ts` | 2 |
| `api/routes/mutations.composite-pk.test.ts` | 3 |
| `api/routes/mutations.advance-project.test.ts` | 1 |
| `api/routes/mutations.apply-mutation.test.ts` | 1 |
| `api/routes/mutations.lmm-forward-guard.test.ts` | 1 |

---

### Category E: `dateUtils.ts` internal — NOT a lint hit, but architecturally adjacent
`src/lib/dateUtils.ts` itself uses `toLocaleDateString` extensively. The lint does NOT currently ban `toLocaleDateString` (only R20/R21 are banned). `dateUtils.ts` is the existing display layer and does the right thing for civil-date display. It is already the canonical "display civil dates from YYYY-MM-DD strings" helper and should NOT be migrated away. The relationship is:

- `dateUtils.ts` = civil-date display (takes YYYY-MM-DD strings, renders locale strings) — already canonical, keep
- `time.ts` = Instant minting + Instant display (`nowInstant()`, `formatLocal()`, `todayCivil()`, `civilFromInstant()`) — the new chokepoint for UTC instant handling
- `ct-date.ts` (api side) = Central-time civil date for Worker edge rendering — keep, will remain for digest email edge case

These three coexist; the migration does not collapse them.

---

## 2. Helper Adoption Mapping

### Available canonical helpers (as of HEAD)

**`src/lib/time.ts`:**
- `nowInstant()` → replaces `new Date().toISOString()` everywhere a UTC Instant is being minted (Category B frontend, Category C backend via a new api-side export)
- `formatLocal(iso, opts?)` → replaces inline `new Date(iso).toLocaleString(...)` for display of UTC instants in viewer zone
- `todayCivil(zone?)` → replaces `new Date().toISOString().split('T')[0]` for "today" anchor (viewer zone aware)
- `civilFromInstant(iso, zone?)` → replaces `new Date(isoStr).toISOString().split('T')[0]` for "which calendar day is this instant in" grouping

**`src/lib/dateUtils.ts`:**
- `localDateKey(d?)` → replaces `d.toISOString().split('T')[0]` for civil date key from a constructed `Date` — already correct (uses local getters, not UTC)
- `formatShortDate()`, `formatLongDate()`, `formatMediumDate()`, `formatFullDate()` → already canonical for civil-date display
- `formatRelativeTime()` → already canonical for relative instant display
- `isOverdue()`, `getDaysUntil()`, `getDaysAgo()` → already canonical, no migration needed

**`api/lib/ct-date.ts`:**
- `ctToday(offsetDays?)` → canonical server-side "today" for Central-zone routes (digest, meetings, conferences, index health). Keep and extend. Has its own internal `.split('T')[0]` at line 47 — this needs an ALLOW entry in the lint script (it is inside the canonical helper, not a call site).

### New helpers needed (gaps)

**Gap 1: `api/lib/time.ts` — Worker-side `nowInstant()` (Category C)**

The Worker edge does not import from `src/`. Category C sites need a `nowInstant()` that runs on the Worker. This is a one-function file:

```typescript
// api/lib/time.ts
// Worker-side canonical Instant minter (mirrors src/lib/time.ts).
// On Cloudflare Workers, Date is always UTC, so new Date().toISOString()
// is correct — this is a named wrapper so the lint can allowlist it.
export type Instant = string & { readonly __brand: 'Instant' };
export function nowInstant(): Instant {
  return new Date().toISOString() as Instant;
}
```

After this file exists, add `api/lib/time.ts` to the lint `ALLOW` set. Then Category C and D sites import `nowInstant` from `'../lib/time'` (or `'../../lib/time'` from test files).

**Gap 2: `src/lib/time.ts` — `formatInstant()` shorthand for common display pattern (display-only, optional)**

Several display sites do `new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', ... })` directly. `formatLocal(iso, opts?)` covers this exactly — no new helper needed; callers just need to switch to it.

**Gap 3: Lint allowlist for `api/lib/ct-date.ts:47`**

The internal `.split('T')[0]` at `api/lib/ct-date.ts:47` is inside the canonical helper, not a call site. Add `api/lib/ct-date.ts` to the `ALLOW` set in `scripts/check-time-discipline.mjs`. Currently `ALLOW = new Set(['src/lib/time.ts'])` — extend to `new Set(['src/lib/time.ts', 'api/lib/time.ts', 'api/lib/ct-date.ts'])`.

**Gap 4: `src/lib/dateUtils.test.ts:20` — test assertion on wrong behavior (special case)**

Line 20 uses `.toISOString().split('T')[0]` deliberately to *demonstrate* the UTC-incorrect behavior, as a contrast against `localDateKey`. This is a test comment/assertion, not a real date bug. Options: (a) add a lint-ignore comment, or (b) assign the UTC key to a variable named `utcWrongKey` and add `// time-discipline: intentional utc-wrong contrast` comment. Option (b) is self-documenting. Either clears the lint hit.

### Site-to-helper mapping summary

| Category | Pattern | Canonical replacement |
|---|---|---|
| A frontend: civil-date key from constructed `Date` | `.toISOString().split('T')[0]` | `localDateKey(d)` from `dateUtils.ts` |
| A frontend: "today" anchor | `new Date().toISOString().split('T')[0]` | `localDateKey()` or `todayCivil()` |
| A frontend: civil-date from instant grouping | `isoString.toISOString().split('T')[0]` | `civilFromInstant(iso)` from `time.ts` |
| B frontend: Instant mint for optimistic state | `new Date().toISOString()` | `nowInstant()` from `time.ts` |
| C backend Worker: Instant mint for D1 write | `new Date().toISOString()` | `nowInstant()` from `api/lib/time.ts` (new) |
| C backend Worker: civil-date window | `.toISOString().split('T')[0]` | `ctToday(offset)` from `api/lib/ct-date.ts` |
| D test fixtures: Instant mint | `new Date().toISOString()` | `nowInstant()` from `api/lib/time.ts` (new) |
| `api/lib/ct-date.ts:47` internal | `.toISOString().split('T')[0]` | allowlist the file in lint |
| `src/lib/dateUtils.test.ts:20` contrast | `.toISOString().split('T')[0]` | lint-ignore comment (intentional contrast) |

---

## 3. Test Strategy

### 3a. Existing tests that must stay green throughout

- `src/lib/time.test.ts` — tests `nowInstant`, `formatLocal`, `todayCivil`. These are the helpers being adopted; they must pass at every commit.
- `src/lib/dateUtils.test.ts` — tests `localDateKey` including the evening/UTC contrast case. The R21 hit at line 20 is inside the test *proving* that UTC-split is wrong. Changing this line must preserve the test's intent: the UTC key should differ from the local key after ~6pm CT, and `localDateKey` should return the correct local value.
- `api/routes/mutations.*.test.ts` — after Category D is migrated, these tests must still pass. The `nowInstant()` import path in test files is `../../api/lib/time` or relative to the test file location. Verify after each test file is migrated.

### 3b. New tests for `api/lib/time.ts`

Add `api/lib/time.test.ts`:
```typescript
import { nowInstant } from './time';
describe('nowInstant (Worker)', () => {
  it('returns Z-marked ISO string', () => {
    expect(nowInstant()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/);
  });
});
```

This is a one-test file; run it with vitest as part of the api test suite.

### 3c. Build verification

After each chunk (see §5), run:
```bash
npm run build
```

TypeScript will catch any import path errors. No new dependencies are introduced; `time.ts` is already imported in many files.

### 3d. Lint verification (the gate)

After every commit in this migration, run:
```bash
node scripts/check-time-discipline.mjs
```

The hit count must be monotonically decreasing. If a commit introduces a new hit, stop and fix before proceeding.

### 3e. Playwright regression

After the full migration is complete (0 lint hits), run the dogfood suite:
```bash
npx playwright test tests/dogfood-phase0.spec.ts --config=playwright.config.dogfood.ts
```

Date display in these tests (task due dates, meeting dates, session history dates) must not change visually — the helpers produce the same output for non-boundary times. For evening boundary tests (dates near midnight) the output *should* change (that is the bug being fixed). Review any snapshot diffs manually before `--update-snapshots`.

---

## 4. Lint-Flip Gate

### Condition

`TIME_LINT_MODE=enforce node scripts/check-time-discipline.mjs` must exit 0 (0 hits). This is the only condition. No partial flip. No "good enough."

### Verification command (pre-flip)

```bash
cd /c/Users/ingra107/mn-ccore-lab
node scripts/check-time-discipline.mjs 2>&1 | grep -c "^R"
```

Must return `0`. If it returns anything else, do not flip.

### The flip itself (two changes)

**Change 1: `.github/workflows/schema-drift.yml` line 232**

```yaml
# Before:
env:
  TIME_LINT_MODE: warn
run: node scripts/check-time-discipline.mjs

# After:
env:
  TIME_LINT_MODE: enforce
run: node scripts/check-time-discipline.mjs
```

**Change 2: `scripts/check-time-discipline.mjs` comment update (line 4)**

Update the comment from "CI flips to ERROR after the 1B display-site migration clears the backlog" to "ERROR mode — 1B migration complete, all sites use canonical helpers."

**PB-side note:** The spec (`2026-05-23-time-sync-timeline-reconciliation-design.md:46`) mentions `PB_TIME_LINT_MODE` in the context of PB's `check_sync_antipatterns.py`. The Hub-side lint is controlled entirely by `TIME_LINT_MODE` in CI YAML — there is no `PB_TIME_LINT_MODE` on the Hub side. The Hub lint is self-contained in `scripts/check-time-discipline.mjs` and its CI step. The PB-side Python lint (`scripts/db/check_sync_antipatterns.py`) is separate and covers `datetime.now()` without `timezone.utc` in Python sync writers — that is a PB-side item and not part of this plan.

### Post-flip verification

After merging the flip commit, trigger the `schema-drift.yml` workflow manually (workflow_dispatch) and confirm the "Time-discipline lint" step exits 0 with no hit output.

---

## 5. Sequencing and Chunking

The 139 hits span enough files that a single commit would be unreviable. Split into 4 chunks by risk profile.

### Chunk 1 — New helpers + lint allowlist (foundation, no behavior change)

Files touched: `api/lib/time.ts` (new), `scripts/check-time-discipline.mjs` (ALLOW set update), `api/lib/time.test.ts` (new test).

Work:
1. Create `api/lib/time.ts` with `nowInstant()`.
2. Add `'api/lib/time.ts'` and `'api/lib/ct-date.ts'` to `ALLOW` in the lint script.
3. Add `api/lib/time.test.ts` with the one nowInstant test.

After chunk 1: lint hits drop by 1 (`api/lib/ct-date.ts:47` now allowlisted). All tests pass. Build clean.

### Chunk 2 — Frontend `src/` migration (40 → 0 hits in src/)

Files: 23 frontend files listed in §1 Categories A + B.

Work — in sub-batches by file cluster:

**2a. Optimistic-mutation hooks (Category B — 15 R20 hits, highest correctness impact):**
- `src/hooks/mutations/useTaskMutations.ts` (4 hits)
- `src/hooks/mutations/useSubtaskMutations.ts` (1 hit)
- `src/hooks/mutations/useMeetingMutations.ts` (1 hit)
- `src/hooks/mutations/useProjectMutations.ts` (2 hits)
- `src/hooks/mutations/useOtherMutations.ts` (2 hits)
- `src/hooks/useWatchlist.ts` (1 hit)
- `src/components/QuickCaptureInbox.tsx` (1 hit)
- `src/components/ReactionBar.tsx` (1 hit)
- `src/components/today/MorningThoughtCompose.tsx` (1 hit R20 + 1 hit R21)

Add `import { nowInstant } from '../lib/time'` (or adjust relative path) to each. Replace `new Date().toISOString()` with `nowInstant()`.

**2b. Civil-date key sites (Category A frontend — 24 R21 hits):**
- `src/lib/parseQuickAdd.ts` (5 hits) — replace with `localDateKey(d)` pattern; `today.toISOString().slice(0, 10)` → `localDateKey(today)`
- `src/components/pb-sector/PlannerHeader.tsx` (4 hits) — replace with `localDateKey(d)`
- `src/components/pb-sector/LandscapeSidebar.tsx` (2 hits) — `localDateKey(cutoff)`
- `src/pages/portal/SessionHistory.tsx` (2 hits) — `localDateKey(d)`, `localDateKey(now)`
- `src/pages/portal/DeadlinesPage.tsx` (2 hits) — `localDateKey(monday)`, `localDateKey(weekEnd)`
- `src/components/dashboard/StatusLine.tsx` (1 hit) — `localDateKey()` (today anchor)
- `src/components/ActivityHeatmap.tsx` (1 hit) — `localDateKey(d)`
- `src/components/tasks/TaskTimelineView.tsx` (1 hit) — `localDateKey(d)`
- `src/pages/Meetings.tsx` (1 hit) — `localDateKey(nextMeeting)`
- `src/pages/MyTasks/components/InlineDetail.tsx` (1 hit) — `localDateKey(tomorrow)`
- `src/pages/MyTasks/index.tsx` (1 hit) — `localDateKey(tomorrow)`
- `src/pages/portal/InsightsPage.tsx` (1 hit) — `localDateKey(d)`
- `src/pages/portal/AnalyticsPage.tsx` (1 hit R21, same line as R20) — `localDateKey(new Date())`

**2c. Test contrast (1 R21 hit):**
- `src/lib/dateUtils.test.ts:20` — add `// time-discipline: intentional utc-wrong contrast` comment on the `utcKey` assignment line.

After chunk 2: `node scripts/check-time-discipline.mjs` reports 0 src/ hits. Run `npm run build` + `npx playwright test tests/dogfood-phase0.spec.ts`.

### Chunk 3 — Backend production routes (64 → 0 hits in api/ non-test)

Files: 22 production api route/lib files.

Work — in sub-batches:

**3a. Core write paths (highest correctness impact, also Increment 2 shared files — do first):**
- `api/routes/tasks.ts` (9 R20 hits) — import `nowInstant` from `'../lib/time'`; replace all `new Date().toISOString()` with `nowInstant()`
- `api/routes/mutations.ts` (3 R20 hits) — same; note: `client_ts` and `issued_at` stamping here is used as Increment 1A UTC write correctness
- `api/routes/projects.ts` (2 R20 hits) — `nowInstant()`
- `api/routes/subtasks.ts` (1 R20 hit) — `nowInstant()`
- `api/routes/handoffs.ts` (2 R20 hits) — `nowInstant()`

**3b. Calendar and date-window routes (mix of R20 and R21):**
- `api/routes/calendar-feeds.ts` (8 hits) — R20 hits → `nowInstant()`; R21 hits for civil-date windows → `ctToday()` from `api/lib/ct-date.ts`
- `api/routes/calendar.ts` (2 R21 hits) — default window start/end → `ctToday(-30)` / `ctToday(90)`
- `api/routes/activity.ts` (1 R21 hit) — `ctToday(-days)` for lookback
- `api/routes/file-activity.ts` (1 R21 hit) — `ctToday(-days)`
- `api/routes/meeting-cadence.ts` (1 R21 hit) — `ctToday(-14)` fallback
- `api/routes/proactive-brief.ts` (1 R21 hit) — `ctToday(-14)`
- `api/routes/deadline-cascade.ts` (1 R21 hit) — `ctToday()` or date arithmetic helper

**3c. Remaining single-hit routes:**
- `api/index.ts` (1 R20 hit) — health check `timestamp: nowInstant()`
- `api/routes/bug-report.ts` (1 R20 hit) — `nowInstant()` in markdown timestamp
- `api/routes/digest-email.ts` (1 R20 hit) — `generatedAt: nowInstant()`
- `api/routes/meetings.ts` (1 R20 hit) — `generated_at: nowInstant()`
- `api/routes/notifications.ts` (1 R20 hit) — `created_at` fallback
- `api/routes/pb-relay.ts` (2 R20 hits) — `created_at`, `completed_at`
- `api/routes/pb-sector.ts` (2 R20 + 1 R21) — `now` anchors → `nowInstant()` + `ctToday()`
- `api/routes/regulatory.ts` (1 R20 hit) — filename timestamp
- `api/routes/insights.ts` (4 R21 hits) — week window civils → `ctToday()` arithmetic

**3d. ct-date.ts internal (allowlisted in Chunk 1 — no code change needed).**

After chunk 3: backend production routes at 0. Run `npm run build`. Run api test suite: `npx vitest run api/`.

### Chunk 4 — API test fixtures (35 R20 hits)

Files: 8 test files. These are pure `nowInstant()` substitutions in test fixture setup rows.

Work: Add `import { nowInstant } from '../../api/lib/time'` (or correct relative path from test file location) to each test file. Replace all `new Date().toISOString()` in test fixture rows with `nowInstant()`.

After chunk 4: 0 lint hits total. Verify: `node scripts/check-time-discipline.mjs` → `[time-discipline] OK`. Run full test suite: `npm run build && npx vitest run`.

### Chunk 5 — Lint flip (zero hits confirmed)

1. Run `node scripts/check-time-discipline.mjs` — confirm `[time-discipline] OK`.
2. Edit `.github/workflows/schema-drift.yml`: `TIME_LINT_MODE: warn` → `TIME_LINT_MODE: enforce`.
3. Update comment in `scripts/check-time-discipline.mjs` line 4.
4. Commit: `git commit -F <msgfile> -- .github/workflows/schema-drift.yml scripts/check-time-discipline.mjs`.
5. Trigger workflow_dispatch on schema-drift.yml. Confirm lint step exits 0.

---

## 6. Risks

### R1 — Trap #3: framing as cosmetic (the blocker is the lint flip, not the display)
**Mitigation (already applied):** Plan frames every chunk as lint clearance, not UI polish. The Category B/C/D changes (Instant minting in mutation hooks and Worker routes) have functional correctness impact beyond display — they ensure `completed_at`, `deleted_at`, `client_ts`, `issued_at` on optimistic local state and D1 writes are branded `Instant` values, ready for the type-contract enforcement that follows from `time.ts`'s branded types.

### R2 — Shared files with Increment 2 (Trap #5)
`api/routes/mutations.ts`, `api/routes/tasks.ts`, `api/routes/projects.ts` appear in both this plan (Chunk 3a) and Increment 2 (activity transport, notes→description removal). **Mitigation:** Complete and commit Chunk 3 of this plan before opening Increment 2. Do not have both plans editing `mutations.ts` in parallel branches. The cross-plan invariant in the spec (`2026-05-23-time-sync-timeline-reconciliation-design.md:81-84`) says: "finish Plan 1B/P1 sync edits first, then do Increment 2 in its own cross-repo lockstep window."

### R3 — Evening/midnight behavior change
Civil-date migrations (Category A, `localDateKey()` replacements) will change the output of "today" and "tomorrow" anchors for users west of UTC after ~6pm local. This is the *correct* behavior. However, any Playwright snapshot that captures a date anchor evaluated near midnight may now produce a different YYYY-MM-DD than before. **Mitigation:** Run Playwright dogfood suite after Chunk 2. Review any snapshot diffs manually. This is the intended fix, not a regression.

### R4 — `parseQuickAdd.ts` date parsing changes behavior for "today" parsing
`parseQuickAdd.ts` lines 106–142 use `.toISOString().slice(0, 10)` for "today", "tomorrow", weekday resolution. Replacing with `localDateKey(d)` changes behavior after ~6pm local (the fix). **Mitigation:** `src/lib/dateUtils.test.ts` already has a test proving `localDateKey` is correct at evening times. The QuickAdd parsing test suite (if any) should be run after the change. If no dedicated test exists for `parseQuickAdd`, add a smoke test for "today" resolution.

### R5 — `api/lib/ct-date.ts` is NOT a complete replacement for all backend civil-date needs
`ctToday()` is hardcoded to `America/Chicago`. It is the correct helper for digest email, conferences, meetings — routes where Nick is the sole viewer and Central time is correct. It is NOT correct for future multi-tenant scenarios. **Mitigation:** Use `ctToday()` only for routes that are already explicitly Central (routes that import it today). For routes doing pure UTC arithmetic lookbacks (activity, file-activity — "last N days" windows), using `.toISOString().split('T')[0]` is actually fine because the one-day boundary is immaterial (spec:46 notes this). These routes can use `ctToday(-days)` or can be documented as "UTC window, boundary immaterial" and cleared via the allowlist or a lint-ignore comment.

### R6 — Lint allowlist scope
Adding `api/lib/ct-date.ts` to the ALLOW set means any NEW raw `.split('T')[0]` added inside `ct-date.ts` would not be caught. **Mitigation:** `ct-date.ts` is a small, stable file with a single export. This is an acceptable tradeoff. The file's internal use of `.split('T')[0]` is inside the canonical helper (line 47 is inside `ctToday()`'s offset arithmetic). If `ct-date.ts` grows, add a file-level comment explaining why R21 is intentional.

### R7 — test file imports of `api/lib/time.ts`
Test files in `api/routes/` need to resolve the relative import `'../lib/time'` or `'../../api/lib/time'` depending on the test runner's rootDir. Verify that the vitest config correctly resolves this path. **Mitigation:** Run `npx vitest run` after Chunk 4 to confirm. The vitest config is already resolving `api/lib/ct-date.ts` imports in production code, so the same pattern works.

### R8 — `api/routes/mutations.ts:878` — `.replace()` chained on `new Date().toISOString()`
Line 878: `new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')`. This produces an SQLite-formatted `YYYY-MM-DD HH:MM:SS` datetime. It is NOT a display call — it is a D1 write format. Using `nowInstant().replace(...)` is safe (brand is just a string at runtime), but the intent is explicit. Add a comment: `// SQLite-native format for LMM normalization temp; nowInstant() base ensures UTC Z`. This is a single-line change.

---

## 7. Summary

| Metric | Value |
|---|---|
| Real lint hit count | **139** (vs ~91 estimated) |
| Unique files touched | ~33 (`src/`: 23, `api/` prod: 22 overlap with existing, `api/` test: 8, plus 3 new/modified infra files) |
| New helpers needed | 1 (`api/lib/time.ts`) |
| Lint allowlist additions | 2 (`api/lib/time.ts`, `api/lib/ct-date.ts`) |
| Chunks | 5 (foundation → frontend → api-prod → api-test → lint-flip) |
| Gate command | `node scripts/check-time-discipline.mjs` → `[time-discipline] OK` |
| CI flip | `.github/workflows/schema-drift.yml` `TIME_LINT_MODE: warn` → `enforce` |
| Shared-file collision risk | `api/routes/mutations.ts`, `tasks.ts`, `projects.ts` — complete before Increment 2 |
| Category breakdown | A (civil-date key): 40 hits; B (frontend Instant): 15 hits; C (api prod Instant): 49 hits; D (api test Instant): 35 hits |

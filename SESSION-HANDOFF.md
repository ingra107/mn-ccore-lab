# Session Handoff — 2026-04-10 (overnight marathon)

## Summary

Full site audit + bugfix + UX overhaul. 18 commits, 9 deploys. Tests green (494/494 Playwright, 58/58 sync pipeline).

## What was done

### Bug Fixes
1. **My Items raw data dump** — `/api/action-items` was aliased to `handleTasks` (1200+ tasks). Created proper `handleActionItems()` for the `action_items` table (23 real items). Toggle handler checks both tables.
2. **Network page blank** — empty array guard on Math.min/max + container `height` (was `minHeight`, broke flex-1 child).
3. **D1 test data cleanup** — 1700+ rows across 6 tables (tasks, ideas, lab_questions, decision_log, notifications). Expanded cleanup commands in CLAUDE.md.
4. **Sync pipeline tests** — `limit=200` → `limit=500` (D1 has 1200+ tasks), `time.sleep(2)` for status propagation.

### UX Overhaul

**Design Token System (index.css):**
- Element heights: `--el-pill` (32px), `--el-input` (36px), `--el-avatar-sm/md`
- Spacing rhythm: `--sp-xs/sm/md/lg/xl/2xl` (4/8/12/16/24/32px — strict 8px grid)
- Contrast hierarchy: `--ink-primary` (1.0), `--ink-label` (0.55), `--ink-hint` (0.4)
- Typography: `--label-weight` (600), `--label-size` (11px), `--value-size` (13px)
- Field containers: `.field-container`, `.description-editor-wrapper`, `.carried-badge`

**Token Audit — ~680 replacements across 90+ files:**
- Pass 1: 19 files (task components, pages, dashboard cards, sidebar)
- Pass 2: 70+ files (all remaining components, pb-sector, modals, project pages)
- All hardcoded opacity, fontSize, fontWeight, gap values → CSS variables

**Layout Changes:**
- FieldBlock → stacked label-above-value (was side-by-side 88px label)
- Overview tab → 2-column grid (Assignee+Priority, DueDate+Project, then Description)
- Details tab → 2-column grid (Watchers+Reminder, Recurrence)
- Description → resizable (height:120px, max:400px, resize:vertical, bordered wrapper)
- Priority pills → grid-cols-2 (equal width, symmetrical)
- Pill fields → noContainer (Assignee, Priority, Project, Watchers — no box-in-box)
- Project dropdown → search filter with substring matching, autofocus
- Tasks table → flexible columns (`minmax(200px, 2fr)` title, `1fr` data cols)
- Projects table → same flexible column treatment
- Tasks table → `scrollbar-gutter: stable` for column alignment
- Carried forward → gold `↻ carried` badge on Meetings, MeetingDetail, MyItems

### Mistake Patterns Logged
- Don't assume auth on API errors — isolate the query first
- Read test runners before guessing conventions
- Don't run sync pipeline tests while auto-log hook is active (db locks)

### Relay Sent
- `req_20260409_220735_work` → home machine: ADD `priority` and `assignee` columns to brain.db tasks table (sync_d1_push.py failing with "no such column: priority")

---

## NEXT SESSION — Must Do

### 1. short_name field for projects (SCHEMA CHANGE)
Nick wants deliberate project short names instead of auto-guessed shortnames in TODAY.md and Hub tables.

**Requirements:**
- New `short_name` column on `projects` table in brain.db, D1, and Airtable
- Auto-generated on project creation (truncated title, ~20 chars)
- Editable by Nick (overrides auto-generated value)
- Syncs bidirectionally: brain.db ↔ Airtable, brain.db → D1
- Used in TODAY.md task table instead of current `extract_project_shortname()` guessing
- Editable in Hub project detail page
- Displayed in task grid as project badge

**Files to touch:**
- `scripts/db/query.py` — BrainDB `create_project()` + `update_project()` accept short_name
- `scripts/db/sync_push.py` — push short_name to Airtable
- `scripts/db/sync_pull.py` — pull short_name from Airtable
- `scripts/db/sync_d1_push.py` — push short_name to D1
- `scripts/db/sync_d1_pull.py` — pull short_name from D1
- `scripts/generate_today_markdown.py` — use short_name instead of extract_project_shortname()
- D1 migration SQL — ALTER TABLE projects ADD COLUMN short_name TEXT
- Airtable — add Short_Name field
- Hub API — include short_name in project endpoints
- Hub UI — editable short_name field in project detail

### 2. Visual audit of deployed changes
Take fresh screenshots of all key pages and compare against the LabSync screenshots Nick provided. The token audit changed 90+ files — need to verify nothing looks broken and the rhythm improvements are visible. Check especially:
- Task detail panel (overview + details tabs)
- Tasks table column alignment
- Projects table spacing
- Meetings page carried forward badges
- Dashboard card density

---

## Test Results (verified)

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| inspection.spec.ts | 198 | 0 | 0 |
| inspection-workflows.spec.ts | 165 | 0 | 2 |
| daily-superuser.spec.ts | 131 | 0 | 0 |
| sync-pipeline.test.py | 58 | 0 | 0 |

## Deploys: 9 (all bugfix/UX iterations)

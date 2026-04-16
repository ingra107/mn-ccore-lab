# Round 8 — Data Integrity Audit
Agent: D1 (Data Integrity)
Date: 2026-04-13
Database: `mnccore-lab` (b8453e9b-7c5f-4029-b07d-dd89c05d00cf)

## Summary

| Category | Count |
|---|---|
| Duplicate project rows | 10 pairs (20 rows) |
| Duplicate meeting rows | 1 pair |
| Duplicate task titles (active) | 8+ clusters (likely benign, task titles repeat intentionally) |
| Orphan FKs — tasks.project_id | 330 rows (not matching id OR slug) — dominated by `admin-tasks` (260) and `peripheral-brain-system` (43), which are brain.db virtual projects that never materialized as D1 rows |
| Orphan FKs — paper_project_links | 1 (`test`/`test`) |
| Orphan FKs — meetings, subtasks, action_items, project_documents, regulatory_items, manuscript_revisions, grant_milestones, ideas, decisions, lab_questions, project_publications | 0 |
| Stale-by-date Active projects (>90d) | 0 (all recently touched by sync) |
| Stale-by-semantics Active projects | 64 of 64 — status column is completely undifferentiated |
| Tasks with NULL status | 20 (API protection expected to prevent this) |
| Tasks with NULL priority | 539 (expected — priority is optional) |
| Tasks with NULL/empty assignee | 0 |
| Projects missing PI | 0 |
| Projects missing category | 0 |
| Meetings missing date | 0 |
| Slug normalization violations | 1 (`(mceachron)-central-line-days-disparities`) |
| Unmanaged UI fields (data present, no editor) | See "Unmanaged Fields" below |
| Grant status field | DOES NOT EXIST — only `proposed` boolean |
| Test leftover rows (active) | 6 tasks, 2 grants, ~10 meetings, ~8 ideas/decisions |

---

## Critical findings (fix before launch)

### C1. Grant "status" column does not exist — the entire taxonomy discussion is blocked

`grants` schema has NO `status` column. It has only `proposed INTEGER` (0/1). Nick's observation "no inline editing for any field" is technically correct but the deeper issue is that **there is no field to edit**. The proposed Round 8 grant status taxonomy (Planning / In Preparation / Submitted / Funded / Resubmission / Declined / Closed) requires a schema migration first.

**Current grants reality:**
| id | mechanism | title | proposed |
|---|---|---|---|
| r01-adhere-lpv-precision-practice-assistance-for-lung-protective-ventilation | R01 | ADHERE-LPV | 1 |
| r03-decision-making-styles-of-medical-trainees | R03 | Decision-Making Styles | 0 |
| k23-ihca-survivability-calculator | K23 | IHCA Survivability Calculator | 1 |
| **k23-provider-practice-variation-in-mechanical-ventilation** | **K23** | **Provider Practice Variation in Mechanical Ventilation** | **0 (the ONLY truly funded grant per Nick)** |
| r01-provider-variation-across-clif | R01 | Provider Variation Across CLIF | 1 |
| test_delete_grant_k23_ihca | K23 | test_delete_K23 IHCA | 1 |
| test_delete_grant_r01_ml_icu | R01 | test_delete_R01 ML ICU | 1 |

Notes:
- `proposed=0` is used for K23 mechvent (truly Funded) AND R03 decision-making (funded?). Ambiguous.
- The frontend Grants.tsx file has ZERO `InlineSelect`, ZERO mutations, ZERO `onBlur` — confirming nothing on this page is editable.
- 2 `test_delete_` grants have been sitting in production.

**Fix SQL (apply after Nick approves taxonomy):**
```sql
ALTER TABLE grants ADD COLUMN status TEXT DEFAULT 'Planning';
ALTER TABLE grants ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

UPDATE grants SET status='Funded'
 WHERE id='k23-provider-practice-variation-in-mechanical-ventilation';

UPDATE grants SET status='In Preparation'
 WHERE id IN (
   'r01-adhere-lpv-precision-practice-assistance-for-lung-protective-ventilation',
   'k23-ihca-survivability-calculator',
   'r01-provider-variation-across-clif'
 );

-- R03 decision-making — confirm with Nick. Dates suggest it may be funded/running.
UPDATE grants SET status='Funded'
 WHERE id='r03-decision-making-styles-of-medical-trainees';

DELETE FROM grants WHERE id LIKE 'test_delete%';
```
Also: add `total_funding` values for Funded grants (currently NULL everywhere).

---

### C2. Ten duplicate projects — not just the McEachron one Nick already knew about

Nick flagged `(mceachron)` vs `mceachron` as ONE known duplicate. There are actually **ten pairs**. The pattern across almost all of them: one row has a slug-style ID (pre-dates hex migration) and one row has a 32-char hex ID. Both rows carry recent `updated_at` from sync, so neither is obviously "the old one." Merge requires manual picking per pair.

| # | Title | Row A (kept?) | Row B (merge?) |
|---|---|---|---|
| 1 | (McEachron) Central Line Days Disparities | `798822d8...` slug `(mceachron)-...` | `012b8ea5...` slug `mceachron-...` |
| 2 | CLIF P2: Volume vs Pressure Control Mortality | `volume-vs-pressure-control-mortality` | `abeb5804...` slug `clif-p2-volume-vs-pressure-control` |
| 3 | CLIF: Clinical Implications of Sepsis Definitions | `clinical-implications-of-sepsis-definitions` | `7d3771af...` slug `clinical-implications-of-sepsis` |
| 4 | CLIF: PF-v-SF Oxygenation Severity | `pf-v-sf-oxygenation-severity` | `bc8e7ea6...` slug `clif-pf-sf` |
| 5 | CLIF: Vasopressor Escalation Protocol (Lyons) | `41958f7a...` slug `vasopressor-escalation-protocol-lyons` | `7902062585...` slug `clif-vasopressor-escalation-lyons` |
| 6 | CLIF: VentMode Waterfall Brief (JAMIA) | `ventmode-waterfall-brief-jamia` | `19b22378...` slug `clif-ventmode-waterfall-brief` |
| 7 | Decision-Making Survey | `6fe3f18c...` slug `decision-making-survey` | `e444707a...` slug `gdms-provider-styles` |
| 8 | GDMS x LPV Hebbel Abstract | `603cc05e...` slug `gdms-x-lpv-hebbel-abstract` | `0572ba3f...` slug `gdms-lpv-hebbel-abstract` |
| 9 | Pollution and ICU Outcomes (Gaffey) | `167af714...` slug `pollution-and-icu-outcomes-gaffey` | `ebd7bf5d...` slug `pollution-and-icu-outcomes-graffy` (typo!) |
| 10 | R03: Decision-Making Styles of Medical Trainees | `decision-making-survey-gdms` | `f5a6e8cc...` slug `decision-making-styles-of-medical` (truncated!) |

Every pair is silently splitting tasks/links/updates between two rows. Task counts, health scores, and activity feeds are all wrong for these 10 projects.

**Fix pattern (per pair, after Nick picks winner):**
```sql
-- Example for pair #9 (Pollution ICU Outcomes):
BEGIN;
UPDATE tasks SET project_id='pollution-and-icu-outcomes-gaffey'
 WHERE project_id IN ('ebd7bf5dc6adc3f9d72018ec44cda629','pollution-and-icu-outcomes-graffy');
UPDATE project_updates SET project_id='167af7141850dbf764328e61ac08c8b2'
 WHERE project_id='ebd7bf5dc6adc3f9d72018ec44cda629';
UPDATE project_documents SET project_id='167af7141850dbf764328e61ac08c8b2'
 WHERE project_id='ebd7bf5dc6adc3f9d72018ec44cda629';
UPDATE regulatory_items SET project_id='167af7141850dbf764328e61ac08c8b2'
 WHERE project_id='ebd7bf5dc6adc3f9d72018ec44cda629';
UPDATE manuscript_revisions SET project_id='167af7141850dbf764328e61ac08c8b2'
 WHERE project_id='ebd7bf5dc6adc3f9d72018ec44cda629';
UPDATE ideas SET project_id='167af7141850dbf764328e61ac08c8b2'
 WHERE project_id='ebd7bf5dc6adc3f9d72018ec44cda629';
DELETE FROM project_publications WHERE project_id='ebd7bf5dc6adc3f9d72018ec44cda629';
DELETE FROM projects WHERE id='ebd7bf5dc6adc3f9d72018ec44cda629';
COMMIT;
```
Repeat for all 10 pairs. **The typo slugs (`graffy`, `decision-making-styles-of-medical`) should always be the loser.**

Also: this keeps recurring because `sync_d1_push.py` generates a fresh hex ID when it can't find a match via slug for a project whose title it didn't update recently. Fix upstream OR the same 10 dupes regenerate on next sync.

---

### C3. All 64 projects have status="Active" — zero semantic signal

```
status | count
Active | 64
```

There is literally no other status in the projects table. The design system ships a Status column dropdown that has only one value available. This is the same class of bug as the Grants status issue: schema allows it, but data is undifferentiated, so the filter/sort/group features on Projects, Manuscripts, and ProjectHealth are all displaying noise.

Nick's note: "Active as a project/grant status is ambiguous and probably wrong for most rows." Confirmed at the data level.

Requires Nick to classify. The status vocabulary from CLAUDE.md (`Active, In Review, Published, In Preparation`) should be applied by category/stage, e.g.:
- `stage='Published'` → `status='Published'`
- `stage IN ('Idea','Data Collection')` → `status='In Preparation'`
- `stage='Review'` → `status='In Review'`
- `stage IN ('Analysis','Writing')` → `status='Active'`

**Proposed bulk fix (Nick approves per cluster):**
```sql
UPDATE projects SET status='Published' WHERE stage='Published';
UPDATE projects SET status='In Review' WHERE stage='Review';
UPDATE projects SET status='In Preparation' WHERE stage IN ('Idea','Data Collection');
-- Analysis/Writing stay 'Active'
```

---

### C4. 330 tasks reference nonexistent projects (top offender: `admin-tasks`, 260 rows)

After matching against BOTH `projects.id` and `projects.slug`, 330 active tasks still have a dangling `project_id`. Breakdown:

| project_id | task count | what it is |
|---|---|---|
| admin-tasks | 260 | brain.db virtual bucket for lab ops, not a real project |
| peripheral-brain-system | 43 | brain.db internal project, Nick-only |
| c-qode-real-world-data-lead | 8 | project slug that never synced |
| early-career-working-group | 8 | likewise |
| uofc-pccm-grand-rounds | 4 | likewise |
| 2026-conference-orlando | 3 | likewise |
| epic-physician-builder-certificate | 2 | likewise |
| ice-fishing | 1 | personal |
| "" (empty string) | 1 | bad write |

Two separate classes:
- **Class A (admin/PB):** intentionally-private brain.db buckets that shouldn't exist as D1 projects but also shouldn't nuke their tasks. The Hub currently shows these 303 tasks with a broken project link (label renders blank/404 on click).
- **Class B:** real project slugs from brain.db that never got pushed to D1 (84 tasks across 7 projects). Fix via running the sync push for those project rows.

**Fix options:**
1. Create a synthetic `admin-tasks` and `peripheral-brain-system` project row in D1 with `category='internal'` so the foreign key resolves. OR
2. Add a frontend fallback: if `project_id` doesn't resolve, render as "(unfiled)" instead of broken link. OR
3. Strip `project_id` from sync for these specific brain.db projects.

Sync script bug: `sync_d1_push.py` is pushing tasks with `project_id` values that don't correspond to any D1 project row it pushes. Confirm via:
```sql
SELECT DISTINCT project_id FROM tasks WHERE deleted_at IS NULL
  AND project_id NOT IN (SELECT id FROM projects)
  AND project_id NOT IN (SELECT slug FROM projects);
```

---

### C5. Duplicate meeting on 2026-04-07 (dedup logic missed a case variant)

```
mtg-2026-04-07-211e8d43 | "MN-CCORE: Mnccore Biweekly"            | 2026-04-07
mtg-2026-04-08-e4359890 | "MN-CCORE Biweekly Meeting -- April 07, 2026" | 2026-04-07
```

Same meeting, different title capitalizations, different ID prefixes (one dated 04-07, one dated 04-08). CLAUDE.md claims "API dedup by date+title before INSERT + UNIQUE index on meetings(date, title)" — but this passed because the titles differ by more than whitespace. Dedup should normalize title (lowercase, strip punctuation, collapse spaces) before comparing.

**Fix:**
```sql
-- Pick one (the 04-08 row with formal title is newer format)
BEGIN;
UPDATE action_items SET meeting_id='mtg-2026-04-08-e4359890' WHERE meeting_id='mtg-2026-04-07-211e8d43';
UPDATE tasks SET meeting_id='mtg-2026-04-08-e4359890' WHERE meeting_id='mtg-2026-04-07-211e8d43';
UPDATE agenda_items SET meeting_id='mtg-2026-04-08-e4359890' WHERE meeting_id='mtg-2026-04-07-211e8d43';
DELETE FROM meetings WHERE id='mtg-2026-04-07-211e8d43';
COMMIT;
```

Also harden the dedup function in `api/routes/meetings.ts` to normalize title before comparing.

---

### C6. Test data pollution in production — 6 task, 2 grant, ~18 meeting/idea/decision rows

`test_delete_` prefixed rows are visible in the Grants page and are the first thing anyone sees when they open `/grants`. Prior cleanup script in CLAUDE.md targets `INSPECTION%`, `SYNCTEST%`, etc. — not `test_delete_%`.

**Fix:**
```sql
DELETE FROM grants WHERE id LIKE 'test_delete%' OR title LIKE 'test_delete%';
UPDATE tasks SET deleted_at=datetime('now') WHERE deleted_at IS NULL AND title LIKE 'test_delete%';
DELETE FROM meetings WHERE title LIKE '%test_delete%' OR title LIKE 'INSPECTION%' OR title LIKE 'EDGE%';
DELETE FROM ideas WHERE title LIKE 'test_delete%' OR title LIKE 'INSPECTION%' OR title LIKE 'EDGE%';
DELETE FROM decision_log WHERE title LIKE 'test_delete%' OR title LIKE 'INSPECTION%' OR title LIKE 'EDGE%';
DELETE FROM paper_project_links WHERE project_slug='test';
```
Then update `CLAUDE.md` cleanup snippet to include `test_delete%` pattern and extend to non-task tables.

---

## High priority

### H1. 20 tasks with NULL status in production

CLAUDE.md claims "API field protection: update handlers protect required fields from null. Tasks: status, priority, assignee — can never be null." Yet 20 active tasks have `status IS NULL`. All 20 are `rec*` and `local_*` IDs — imported from brain.db. Either the `/api/tasks/sync-bulk` endpoint is missing a default, or there's a sync path that bypasses the guard.

```sql
-- Fix the 20 existing rows
UPDATE tasks SET status='todo' WHERE deleted_at IS NULL AND status IS NULL;
```

And patch the sync-bulk handler to default `status='todo'` on INSERT and reject NULL on UPDATE.

### H2. `short_name` is read everywhere but editable on only one page

`short_name` (TEXT) is referenced in:
- `Projects.tsx` (display, lines 497, 505, 653, 661)
- `Deadlines.tsx` (display label mapping)
- `TaskGridView.tsx`, `TaskCard.tsx`, `TaskTimelineView.tsx`, `TaskStandUpView.tsx` (project label lookup)
- `ProjectDetail.tsx` **editor exists** (lines 201-319)

60 of 64 projects have a `short_name` populated. The 4 that don't can only be set via the ProjectDetail page — NOT via the Projects list inline. This is minor but Nick's design rule is "every visible field should be inline-editable on the primary table." Add `short_name` as an inline column on `Projects.tsx` or at least a header-order tooltip pointing to ProjectDetail.

### H3. Columns with data but no UI editor at all

| Table | Column | Populated | Editor exists? |
|---|---|---|---|
| projects | `pi_context` | 0 rows | No references in src/ — dead column |
| projects | `stage_notes` | 0 rows | No references — dead column |
| projects | `strategic_context` | 0 rows | No references — dead column |
| projects | `description` | ~populated | Not editable on Projects list; only in ProjectDetail |
| tasks | `watchers` | mostly null | No inline editor |
| tasks | `reminder_days` | mostly null | No inline editor |
| tasks | `instructions` | partial | No inline editor (description_json handles rich text, but `instructions` is a separate column) |
| tasks | `acknowledged_at`, `acknowledged_by` | partial | No inline editor (probably by design — auto-set) |
| grants | ALL fields | populated | **Nothing is editable on /grants** |
| action_items | `category`, `created_by`, `parent_task_id` | partial | No inline editor |
| regulatory_items | `notes` | partial | No inline editor |
| manuscript_revisions | `notes`, `journal`, `response_due` | partial | Check MS revisions tab on ProjectDetail |
| meetings | `facilitator` | partial | Not confirmed editable in UI |

**Recommendation:** drop `pi_context`, `stage_notes`, `strategic_context` from the schema (zero usage, wasted space). Add inline editors for the populated-but-unmanaged fields OR accept them as read-only and document why.

### H4. Pair #9 typo: `pollution-and-icu-outcomes-graffy`

One of the duplicate project slugs is `pollution-and-icu-outcomes-graffy` — the actual fellow's last name is Gaffey. This row should be deleted in the merge (C2).

### H5. Slug normalization: `(mceachron)-central-line-days-disparities`

One project slug contains parentheses. CLAUDE.md flags "Project slugs with parentheses break routing" as a LOW severity known issue. It's tied to dup C2 pair #1 — merging will resolve it.

---

## Medium

### M1. Duplicate task titles (8+ clusters)

Most are benign (recurring "Send MNCCORE agenda" weekly tasks, intentionally re-created). BUT: "Fix Playwright MCP wrapper on home laptop" appears 3x with IDs `local_6151118aa10a` and `recLjqlToEocKDJTx` — probably a sync duplication. Worth a manual pass but not blocking.

### M2. `project_publications` join table: 0 orphans but unknown health

Only 0 orphan rows against projects. Did not verify publications side.

### M3. Duplicate meetings might cascade to action_items

After fixing C5, re-run orphan check on `action_items.meeting_id` — if the surviving meeting absorbs all items correctly, nothing changes. If the dropped meeting had items that got reassigned wrong, they'll appear on the wrong date.

### M4. `inbox` table — no DELETE route per CLAUDE.md known issues

Not a data integrity bug per se but inbox items can't be cleaned by users. Unrelated to this audit but mentioned because it's adjacent to test data cleanup.

---

## Appendix: raw query outputs

### Projects count
```
SELECT COUNT(*) FROM projects; -- 64
SELECT status, COUNT(*) FROM projects GROUP BY status;
-- Active | 64
```

### Tasks counts
```
active (deleted_at IS NULL): 570
soft-deleted (deleted_at IS NOT NULL): 629
null status: 20
null priority: 539
null assignee: 0
```

### Orphan task project_ids (top 20)
(see C4 above)

### Schema reality check: grants columns
```
id, mechanism, title, agency, pi, start_date, end_date, proposed, total_funding, created_at
-- no status, no updated_at
```

### Schema reality check: projects columns
```
id, title, status, description, category, pi, slug, stage, created_at, updated_at,
pi_context (unused), stage_notes (unused), strategic_context (unused), short_name
```

### Schema reality check: tasks columns
```
id, meeting_id, project_id, title, description, assignee, assigned_by, due_date,
priority, status, source, completed, completed_at, completed_by, created_at,
blocked_by, updated_at, deleted_at, acknowledged_at, acknowledged_by, watchers,
reminder_days, instructions, description_json,
key_link_1, key_link_1_desc, key_link_2, key_link_2_desc, key_link_3, key_link_3_desc
```

### Orphan FK zero-counts (verified clean)
- action_items → meetings: 0
- action_items → projects: 0
- task_subtasks → tasks: 0
- project_documents → projects: 0
- regulatory_items → projects: 0
- manuscript_revisions → projects: 0
- grant_milestones → grants: 0
- ideas → projects: 0
- decision_log → projects: 0
- lab_questions → projects: 0
- project_publications → projects: 0

### paper_project_links orphan
```
paper_id=test, project_slug=test  -- test data
```

### Duplicate projects — full pairings
(see C2 table above — 10 pairs)

### Test leftover IDs
```
Grants:
  test_delete_grant_r01_ml_icu
  test_delete_grant_k23_ihca
Tasks (6):
  test_delete_task_casey_cci
  test_delete_task_dan_analysis
  test_delete_task_kendall_aims
  test_delete_task_casey_redcap
  test_delete_task_dan_review
  test_delete_task_kendall_k23
Meetings (~10 matching INSPECTION/EDGE/test_delete)
Ideas/Decisions (~18 combined)
```

### Grant status inference (confirmed 2026-04-13)
- **Funded**: `k23-provider-practice-variation-in-mechanical-ventilation` (start 2023-07-01, end 2028-06-30) — matches Nick's "K23 provider variation in mechanical ventilation" statement exactly.
- **Likely Funded (verify)**: `r03-decision-making-styles-of-medical-trainees` — start 2024-09-01, end 2026-08-31, `proposed=0`. Dates suggest running. Ask Nick.
- **In Preparation** (proposed=1, future start date 2027+):
  - r01-adhere-lpv
  - k23-ihca-survivability-calculator
  - r01-provider-variation-across-clif

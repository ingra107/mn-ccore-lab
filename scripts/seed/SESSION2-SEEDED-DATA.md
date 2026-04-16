# Session 2 Seeded Data — April 16, 2026

> Reference for final audit. Delete or keep each category after review.
> CF Access + RESEND_API_KEY will be configured in the same session as this cleanup.

## Ideas (10 rows — table: `ideas`)

All created 2026-04-16. `submitted_by` reflects who would plausibly suggest it.

| # | Title | submitted_by | research_area |
|---|-------|-------------|---------------|
| 1 | Pre-meeting email prompt for async status updates | nick | ops |
| 2 | Cross-project insight engine | nick | tool |
| 3 | Weekly research digest email | nick | tool |
| 4 | Trainee journal club pilot | nate | culture |
| 5 | Shared code review rubric for fellows | eddington | ops |
| 6 | Open office hours with PI | nate | culture |
| 7 | Grant opportunity bulletin board | nick | tool |
| 8 | Quarterly data review office hours | eddington | ops |
| 9 | Lab podcast experiment | fitzgerald | culture |
| 10 | Mentee milestone dashboard integration | nick | tool |

**Votes added:** #1, #2, #3 (one vote each)

**Cleanup:** `DELETE FROM ideas WHERE created_at >= '2026-04-16' AND created_at < '2026-04-17';`

---

## Decisions (8 rows — table: `decision_log`)

All created 2026-04-16. Content sourced from real PB Context/Decisions/ docs.

| # | Title | project_slug | tags |
|---|-------|-------------|------|
| 1 | Hub design pivot: operational over editorial | mn-ccore-lab-hub | design, architecture |
| 2 | D1 as cloud truth, brain.db as local cache | mn-ccore-lab-hub | architecture, sync |
| 3 | Grant status taxonomy locked (7 values) | (none) | taxonomy, grants |
| 4 | Dashboard cards resizable via react-grid-layout | mn-ccore-lab-hub | ux, dashboard |
| 5 | CCI in ARDS manuscript to PLOS One | cci-in-ards | manuscripts, submission |
| 6 | SCAFFOLD collaboration with Zach Landis-Lewis | r01-lpv-precision-practice-assistance | collaboration, grants |
| 7 | Hermes AI response latency acceptable at 60s | mn-ccore-lab-hub | infrastructure, performance |
| 8 | Miniflare replaces X-Test-Mode for local testing | mn-ccore-lab-hub | testing, infrastructure |

**Cleanup:** `DELETE FROM decision_log WHERE created_at >= '2026-04-16' AND created_at < '2026-04-17';`

---

## Expertise Tags (25 rows — table: `expertise_tags`)

These are REAL and accurate. Recommend keeping.

| member_slug | tags |
|-------------|------|
| nick | Critical Care, Lung-Protective Ventilation, CLIF Data Standards, Clinical Decision-Making, Causal Inference |
| nate | Cardiac Arrest, DNR Variation, Chronic Critical Illness, Health Equity |
| eddington | Data Analysis, R, Python, REDCap |
| shyu | Vasopressor Therapy, IV Fluid Resuscitation, Hemodynamics |
| mceachron | Cardiac Arrest, Central Line Disparities, Survival Analysis |
| fitzgerald | Palliative Care, Goals of Care, ICU Communication |
| dudley | Health Services Research, Quality Improvement, Provider Practice Variation |

**Cleanup (if needed):** `DELETE FROM expertise_tags;` (all 25 are from this session)

---

## Task Reassignments (15 tasks — table: `tasks`)

Changed `assignee` from `nick` to team member. Reversible.

| New assignee | Count | Matching keywords |
|-------------|-------|-------------------|
| arriaza | 7 | coordinator, SOP, IRB, invitee list, Steven, survey |
| eddington | 4 | CRRT, epidemiology, Guleria, Chhikara |
| nate | 2 | fellows, fellowship award |
| shyu | 2 | Shyu, IV fluids |

**Cleanup:** `UPDATE tasks SET assignee = 'nick' WHERE assignee IN ('arriaza','eddington','nate','shyu') AND updated_at >= '2026-04-16';`

---

## Digest Comment (1 row — table: `digest_comments`)

Pipeline test comment on paper `digest-39719260`.

**Cleanup:** `DELETE FROM digest_comments WHERE content LIKE 'Pipeline validation test%';`

---

## Previously Cleaned (Phase A)

- Deleted 14 `test_delete_` expertise tags
- Soft-deleted 2 `ningraha` tasks

# Description-line migration — review package (P2-B)

**Date:** 2026-06-11 · **Status:** PREPARE-ONLY — NOTHING executed against prod.
**Engine:** deterministic parse (Python port of `src/lib/descriptionLog.ts::parseDescriptionLog()`)
as the spine + an LLM judgment layer on top (Nick approved: "go LLM using parse", 2026-06-10).
**Parent plan:** `docs/superpowers/plans/2026-06-10-m5-phase2-brainstorm-lite.md` (P2-B);
quality bar / worked example: `docs/superpowers/plans/2026-06-10-description-migration-output-comparison.md` (Option B).

This doc is the human-reviewable diff. The executable package lives in
`Scratch/desc-migration-2026-06-10/` (gitignored): `pipeline.py`, `spine.json`, `proposed.json`,
`apply.sql`, `strip.sql`, `snapshot.sql`. **The Builder ran NONE of the write SQL.**

## What this migration does

PB's BrainDB writes dated breadcrumb lines (`[YYYY-MM-DD] …` — complete-with-note, reopen, project
breadcrumbs, plus hand-written meeting notes) into `projects.description`. M5 splits those out: the
dated log lines become `activity_entries` rows (the unified timeline, schema v77); the undated static
prose (the "lead") stays in `description`.

- **55 projects** matched the dated-line query (`description LIKE '%[2026-%' OR description LIKE '%[2025-%'`).
- **53 projects** produced migratable entries → **298 `activity_entries` rows** (`update`=84, `completion`=214).
- **2 projects** are DOUBLE-ENCODED/quote-wrapped data anomalies → LEFT UNTOUCHED, flagged for manual handling (see below).

### Entry mapping (every row)

| field | value |
|---|---|
| `entity_type` | `'project'` |
| `entity_id` / `project_id` | the typed `proj_*` PK |
| `kind` | `'completion'` for `✓` / `[check]` lines; else `'update'` (`update_type='progress'`) |
| `visibility` | `'team'` |
| `actor_slug` | `'nick-ingraham'` (these are Nick's breadcrumbs) |
| `body` | the cleaned line WITHOUT the `[date]` tag (see judgment rules) |
| `created_at` | `<date> 12:00:00` (civil date, noon-UTC placeholder) |
| `source_table` | `'description_line'` |
| `source_id` | `'<project_id>:<sha1-12 of the original line text>'` (idempotency key) |
| `id` | `'bk_descline_<sha1-12 of source_id>'` (deterministic; stable across re-runs) |

Idempotency: `INSERT OR IGNORE` against the partial UNIQUE index `idx_ae_source(source_table, source_id)`
— a re-run never duplicates. Verified in-memory: 298 rows on 1st apply, 298 on 2nd.

## Totals

| metric | count |
|---|---|
| projects matched (input) | 55 |
| projects with migrated entries | 53 |
| total entries | 298 |
| &nbsp;&nbsp;kind = `update` | 84 |
| &nbsp;&nbsp;kind = `completion` | 214 |
| projects retaining a non-empty lead | 40 |
| projects emptied (all content was dated) | 15 |
| projects LEFT UNTOUCHED (double-encoded anomaly) | 2 |

### Flag totals

| flag | count | meaning |
|---|---|---|
| AT 50-CHAR CAPTURE LIMIT | 112 | completion/update body is exactly 50 chars (the title-capture width) and ends mid-word → **likely truncated. Kept VERBATIM — never completed.** Review the worst before Nick acts. |
| SPAM CLUSTER | 12 | ≥3 completions on one date; emitted individually with a proposed collapse alt (Nick's call). |
| DEDUP | 8 | exact-duplicate line (same date + same text) collapsed to one entry. |
| SPLIT glued block | 2 | an undated `[Mon DD]` block glued by the continuation-line rule, split into its own dated entry. |
| resolved undated lead | 5 | an undated `[Mon DD]` lead block date-resolved (year inferred from the first dated entry; ≤ guard). |
| ANOMALY (double-encoded) | 2 | quote-wrapped / literal-`
` descriptions that parse to ZERO entries — LEFT UNTOUCHED. |

## Quality gate (the load-bearing guarantee)

**Zero rewording across all 298 entries** — automated check: every alphanumeric token in each cleaned
`body` exists in its `original_line` (no NEW words introduced). The only transforms applied are:
- strip the leading `[YYYY-MM-DD]` machine tag;
- strip the completion marker (`✓` / `[check]`);
- strip a *pure* redundant human date tag (`[Jan 15]`, `[2026-01-15]`) when it duplicates the machine date;
- reorder a *context* tag (`[Feb 13 Adams meeting]` → `Adams meeting: …`) — information preserved, only the date dropped.

Truncated text is NEVER completed. Multi-line entries keep their internal newlines (rendered `⏎` in the samples below).

## The two anomalies (manual handling needed — NOT in apply.sql / strip.sql)

Both descriptions are stored DOUBLE-ENCODED (the whole value is JSON-stringified — wrapped in literal
`"`, with literal `
` / `✓` escape sequences instead of real newline / `✓` characters). The
deterministic parser correctly cannot see the dated tag at a line start, so it extracts zero entries.
**Auto-unescaping could corrupt** — so the pipeline leaves these descriptions UNTOUCHED (no entries,
no strip) and flags them:

- `clif-p2-volume-vs-pressure-control-mortality` — one dated line (`[2026-02-25] …`) wrapped in `"`.
- `pcori-federated-tte-clif-hochberg` — lead prose + one `
[2026-03-05] ✓ …` (literal escapes).

Recommended: hand-fix the encoding on these two rows (un-stringify), then re-run `pipeline.py` — the
two will fold into apply.sql/strip.sql on the next pass automatically.

## Execution runbook (the strip session — orchestrator runs the SQL, NOT the Builder)

> ⚠️ **PB's breadcrumb writers are NOT yet retargeted** (`query.py:1960` complete-with-note, `:2001`
> project breadcrumb, `:2084` reopen, `:2650`). New `[YYYY-MM-DD]` lines may have landed in
> `projects.description` since this package was generated. **The strip session MUST re-run the pipeline
> delta first** so apply.sql covers any new lines before strip.sql removes them.

1. **Snapshot (backup).** Export the full descriptions of the affected projects (read-only):
   ```
   ./scripts/wrangler-d1 d1 execute mnccore-lab --remote --json      --command "SELECT id, slug, description FROM projects        WHERE description LIKE '%[2026-%' OR description LIKE '%[2025-%' ORDER BY slug"      > Scratch/desc-migration-2026-06-10/snapshot_pre_strip.json
   ```
   (D1 Time-Travel, 30d, is the second backstop. Restore = one `UPDATE … WHERE id=` per snapshot row.)
2. **Re-run the pipeline delta.** `python Scratch/desc-migration-2026-06-10/pipeline.py` against a fresh
   `raw_descriptions.json` (re-pull first) so apply.sql/strip.sql reflect any new dated lines.
3. **Apply (test FIRST, probe, then prod)** — sanctioned wrapper ONLY:
   ```
   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=Scratch/desc-migration-2026-06-10/apply.sql
   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=Scratch/desc-migration-2026-06-10/apply.sql
   ```
4. **Nick eyeballs the live project Activity feeds** (`/api/projects/:slug/activity`) for a few projects
   — confirm the timeline reads right BEFORE any description is stripped.
5. **Strip LAST** (only after step 4 sign-off):
   ```
   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=Scratch/desc-migration-2026-06-10/strip.sql
   ```
6. **Rollback if needed:** `DELETE FROM activity_entries WHERE source_table = 'description_line';` (undo apply);
   restore descriptions from the snapshot (undo strip).

## Per-project diff

Each project below: project_id · entry count by kind · the retained lead (new description) · a sample
of 3 cleaned entries · ALL flags. Multi-line bodies render internal newlines as `⏎`.

### 2026-oral-critically-ill-outside-the-icu

- **project_id:** `proj_2S8R3WB3T05FT5EX8B1QDZDEJ4`
- **entries:** 3  (update=0, completion=3)
- **retained lead (new description):** ATS oral presentation May 17, 2026 at 9am. Analyzing critically ill patients outside ICU vs inside ICU using CLIF data. Key variables: respiratory support, vasopressors, PF/SF ratios, LOS, vent-free d…
- **sample cleaned entries:**
  - `[2026-03-21]` (completion) Review ATS oral Google Doc and outline presentatio
  - `[2026-05-11]` (completion) Test Kaveri T1-run code (ATS Critically Ill)
  - `[2026-05-11]` (completion) Upload ATS ePoster to Box (CLIF location-agnostic
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-21: 'Review ATS oral Google Doc and outline presentatio'

### admin-tasks

- **project_id:** `proj_61A9GZBGK3BJQRTCSKNVCY93WX`
- **entries:** 33  (update=1, completion=32)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-01-29]` (update) Multiple admin tasks completed this month.
  - `[2026-03-09]` (completion) Schedule RAV4 service appointment
  - `[2026-03-13]` (completion) Email Julia Heneghan re EHR data pipeline after Br
- **flags:**
  - resolved undated lead block '[Jan 29] Multiple admin tasks completed ' → 2026-01-29 (year inferred from first dated entry 2026-03-09)
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-13: 'Email Julia Heneghan re EHR data pipeline after Br'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-16: 'Send presentation deck/handouts for Intern IMED se'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-16: 'Add IEEE reviewer or program committee or somethin'
  - DEDUP: dropped exact duplicate on 2026-03-16: 'Sarah Kesler: Generate stats methodology doc when'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-24: "Facilitate Daniel Shyu's Critical Care journal clu"
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-26: 'Grant Nathaniel Karr permissions to project folder'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-26: 'Respond to Claire Collins regarding FQHC Project a'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-31: "Review Joshua Trujeque's review for grammar and cl"
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-09: "Complete fixes from last night's audit, work in sc"
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-14: 'Respond to Sarah Kesler about interest in TELE-ICU'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-14: 'Follow up on bounced email for ICU survey distribu'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-14: 'Block Gmail send API in Claude Code settings (home'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-21: 'Send positive feedback for Em, Ashley, or Nathan f'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-29: 'Review abstracts for Robert P. Hebbel Research Day'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-15: 'Follow up on UMN data infrastructure gap for clini'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-02: "Review Alfred Marcus's re-editing of AMR manuscrip"
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-04: 'Complete UMN Required Training: Professional Condu'
  - SPAM CLUSTER: 4 completions on 2026-03-16 — emitted individually. Proposed collapse: 'Completed 4 tasks on 2026-03-16: Sarah Kesler: Generate stats methodology; Enroll in NIH Early Career Reviewer prog; Send presentation deck/handouts for Inte; Add IEEE reviewer or program committee o'
  - SPAM CLUSTER: 3 completions on 2026-04-14 — emitted individually. Proposed collapse: 'Completed 3 tasks on 2026-04-14: Respond to Sarah Kesler about interest i; Follow up on bounced email for ICU surve; Block Gmail send API in Claude Code sett'
  - SPAM CLUSTER: 4 completions on 2026-05-22 — emitted individually. Proposed collapse: 'Completed 4 tasks on 2026-05-22: Test Telegram system end-to-end; Test Telegram system v2; Review CCA Membership Meeting agenda; Reply to Robbie Flick (JHU) re: connecti'

### amr-ai-management-theory-in-medicine-marcus

- **project_id:** `proj_01KT6TYMXBZCZ701YQC7B431KK`
- **entries:** 1  (update=1, completion=0)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-06-03]` (update) Companion paper to LLM Ethics (Silverman). Lead: Alfred Marcus (amarcus@umn.edu, UMN management/strategy). Co-author Greg Silverma…

### arf-niv-treatment-location-goldfarb

- **project_id:** `proj_4B33JGCRSJH34H07RJWS4PH8RW`
- **entries:** 5  (update=2, completion=3)
- **retained lead (new description):** Sarah Goldfarb ALL SITES request. Investigating ARF outcomes by level of care after ED NIV. Counterfactual event rates for death/hospice. Kaveri Chhikara buddy-coded. 3 stages total (Stage 1 now). Git…
- **sample cleaned entries:**
  - `[2026-04-10]` (update) Two regression fixes applied on data shelter (single-level factors + aliased coefficients). Slack sent to Sarah for review.
  - `[2026-04-10]` (update) CMD launcher needs install_version() guard for offline CRAN access.
  - `[2026-04-14]` (completion) Run ARF-NIV Treatment Location Stage 1
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-14: 'Run CLIF ARF-NIV Treatment Location Stage 1 (Goldf'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-05: 'Run CLIF ARF-NIV Treatment Location Stage 2 (Goldf'

### ats-2026-conference-orlando

- **project_id:** `proj_2NJRYPB30X52D9B7RXYE1R59SW`
- **entries:** 4  (update=0, completion=4)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-02-04]` (completion) Book flights for ATS 2026 (Orlando)
  - `[2026-02-04]` (completion) Book hotel for ATS 2026 (Orlando)
  - `[2026-02-04]` (completion) Register for ATS 2026 Conference
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-22: 'Submit ATS 2026 travel reimbursement (Hyatt Orland'
  - SPAM CLUSTER: 3 completions on 2026-02-04 — emitted individually. Proposed collapse: 'Completed 3 tasks on 2026-02-04: Book flights for ATS 2026 (Orlando); Book hotel for ATS 2026 (Orlando); Register for ATS 2026 Conference'

### ats-early-career-working-group

- **project_id:** `proj_7VKN2ZE0TKCQYPQHSK0GKNFXX9`
- **entries:** 2  (update=0, completion=2)
- **retained lead (new description):** American Thoracic Society Early Career Working Group participation.
- **sample cleaned entries:**
  - `[2026-05-13]` (completion) Make ATS Roadmap figure
  - `[2026-06-09]` (completion) Chat with Patrick Lyons and Eddy Fan re: EHR data

### c-qode-real-world-data-lead

- **project_id:** `proj_2YBMYG5J1750BZEK9MJPQSPKB5`
- **entries:** 9  (update=0, completion=9)
- **retained lead (new description):** CLHSS Associate Director role - Real World Data Lead (EHR). $40k discretionary fund. Reports to Melton-Meaux/Beebe. Key meetings: CLHSS Portfolio (Tue 1-2pm), LHS Data (Wed 9:30-10am), Quarterly Strat…
- **sample cleaned entries:**
  - `[2026-02-10]` (completion) Send out MNCCORE agenda for biweekly meeting
  - `[2026-02-23]` (completion) TEST - delete me
  - `[2026-02-24]` (completion) Send out MNCCORE agenda for biweekly meeting
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-12: 'Complete IEEE ICHI 2026 paper reviews (3 submissio'
  - DEDUP: dropped exact duplicate on 2026-03-12: 'Complete IEEE ICHI 2026 paper reviews (3 submissio'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-17: 'Review SOW: Obstetric Measures Initial Feasibility'
  - DEDUP: dropped exact duplicate on 2026-03-23: 'Send out MNCCORE agenda for biweekly meeting'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-31: 'Draft email to Genevieve/Tim Beebe re: UMN data in'

### cci-in-ards

- **project_id:** `proj_71HSNYQ92KH6KWFN2E0A6T93ZA`
- **entries:** 8  (update=4, completion=4)
- **retained lead (new description):** "[2026-01-11] TEST NOTE - will be removed\n[2026-01-11] SQLite sync test - 14:55:50\n[2026-01-12] Moved to Jan 13 per Nick\n[Jan 12] Moved to Jan 13 per Nick\n[2026-01-13] \n[2026-02-25] 35 total edit…
- **sample cleaned entries:**
  - `[2026-03-13]` (update) Living manuscript refs 28-31, 35 are in reference list but uncited in text — they ARE cited in Google Doc's expanded Discussion. W…
  - `[2026-03-13]` (update) Google Doc is now source of truth. Ref [23] placed at [6,23]. Table/figure legends fixed. Nick prefers read-only default on Google…
  - `[2026-03-13]` (completion) Apply approved PCI/AHRF manuscript edits to Google
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-13: 'Apply approved PCI/AHRF manuscript edits to Google'
  - DEDUP: dropped exact duplicate on 2026-03-13: 'Apply approved PCI/AHRF manuscript edits to Google'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-01: 'Create DAG for Mike paper reviewer comment (time-v'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-04: 'Reply to Michael Kalinoski re: PLOS ONE PerCI revi'

### central-line-days-disparities-mceachron

- **project_id:** `proj_5YPQ5B5CHS6JG2J536BE76871Z`
- **entries:** 3  (update=1, completion=2)
- **retained lead (new description):** Led by Kendall McEachron (University of Las Vegas). Study of central line days and differential impact across race/ethnicities. Nick did the analysis (likely on Data Shelter). Reviewers questioning us…
- **sample cleaned entries:**
  - `[2026-04-09]` (update) Needs project folder and slug for /work-on support. Task local_9691b8093b4f is local-only (not in tasks table).
  - `[2026-04-09]` (completion) Get manuscript from Kendall re: central line days
  - `[2026-04-14]` (completion) Get current manuscript from Kendall and review odd
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-14: 'Get current manuscript from Kendall and review odd'

### clif-clinical-implications-of-sepsis-definitions

- **project_id:** `proj_5MF31N0BAEDKMW6ESB56QJSHP2`
- **entries:** 2  (update=1, completion=1)
- **retained lead (new description):** CLIF project led by Vaishvik. GitHub: https://github.com/Common-Longitudinal-ICU-data-Format/Clinical-implications-of-sepsis-definitions
- **sample cleaned entries:**
  - `[2026-03-17]` (update) Nick is running this project for Vaishvik and Rush Team. GitHub: https://github.com/Common-Longitudinal-ICU-data-Format/Clinical-i…
  - `[2026-04-14]` (completion) Set up Clinical Implications of Sepsis Definitions
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-14: 'Set up Clinical Implications of Sepsis Definitions'

### clif-deep-sedation-language-ortiz

- **project_id:** `proj_08Q9JGNWB7SBGMFDQPRSJBNQH6`
- **entries:** 2  (update=0, completion=2)
- **retained lead (new description):** Alex Ortiz-led CLIF consortium project. Nick running 00 data extraction script at UMN. Repo: https://github.com/acortizmd/deep_sedation_language_final.git
- **sample cleaned entries:**
  - `[2026-04-29]` (completion) Run Alex Ortiz Language and Sedation project
  - `[2026-05-11]` (completion) Rerun deep sedation language code for Alex Ortiz (

### clif-epi-of-sedation-liao

- **project_id:** `proj_01KRP4GM50QHAE6P1SX33TSPZR`
- **entries:** 1  (update=0, completion=1)
- **retained lead (new description):** Zewei (Whiskey) Liao leading. ATS presentation figures needed by Friday. Repo: github.com/Common-Longitudinal-ICU-data-Format/CLIF-epi-of-sedation. Box: uchicago.box.com/s/d6tcnrgcrozobwz3rrjddydfrmae…
- **sample cleaned entries:**
  - `[2026-05-22]` (completion) Run CLIF epi-of-sedation code at UMN (due Friday)

### clif-flame

- **project_id:** `proj_1XDX2YYVYEWE5VBE3BS6J6B5B3`
- **entries:** 3  (update=1, completion=2)
- **retained lead (new description):** CLIF ML evaluation project using FLAIR. Bhav leading development. Nick runs at UMN site. Feedback needed by Monday EOD Jan 13.
- **sample cleaned entries:**
  - `[2026-01-09]` (update) Debugged NaN casting issue in mortality task notebook (03b_task6). Label column had 299 null train rows and 5 null test rows. Cast…
  - `[2026-02-23]` (completion) Reply to Phil Crooke re: FLAME statistical inferen
  - `[2026-02-24]` (completion) Reply to Phil Crooke re: FLAME statistical inferen
- **flags:**
  - resolved undated lead block '[Jan 9] Debugged NaN casting issue in mo' → 2026-01-09 (year inferred from first dated entry 2026-02-23)
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-02-23: 'Reply to Phil Crooke re: FLAME statistical inferen'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-02-24: 'Reply to Phil Crooke re: FLAME statistical inferen'
  - DEDUP: dropped exact duplicate on 2026-02-24: 'Reply to Phil Crooke re: FLAME statistical inferen'

### clif-heat-related-ohca-graffy

- **project_id:** `proj_01KQSVFVF37PN2YEJYKRW1E1FS`
- **entries:** 2  (update=0, completion=2)
- **retained lead (new description):** New CLIF run request from Peter Graffy (2026-05-04 Slack). Is extreme heat associated with increased OHCA cases in the ICU? county_code required. NU- and JHU-tested, Kaveri-approved.
- **sample cleaned entries:**
  - `[2026-05-11]` (completion) Run CLIF Heat-Related OHCA (Graffy)
  - `[2026-06-09]` (completion) Complete AHA ReSS abstract disclosure (Graffy)

### clif-icd-10-pcs-proning-elevation

- **project_id:** `proj_2X2NAWH184SDVVG2A6CKEJMT0N`
- **entries:** 1  (update=1, completion=0)
- **retained lead (new description):** Led by Cathy Gao-Howard and Chad Hochberg / Validating ICD-10-PCS coding for proning in respiratory failure / Uses same code/data as CLIF Proning Incidence Severe ARF project / GitHub: https://github.…
- **sample cleaned entries:**
  - `[2026-01-14]` (update) ran this when i ran the proning incidence code

### clif-induction-dose-variability-rsi

- **project_id:** `proj_4CGGQVCEGPMMPRKEZ5EFJX36CQ`
- **entries:** 1  (update=0, completion=1)
- **retained lead (new description):** Lead: Kevin Buell (UChicago). Buddy tester: Wan-Ting Liao. CLIF multi-site run request. Quantify patient/provider/hospital variance in weight-normalized induction dose (etomidate/ketamine) during RSI.…
- **sample cleaned entries:**
  - `[2026-04-17]` (completion) Run Induction Dose Variability RSI CLIF code at UM
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-17: 'Run Induction Dose Variability RSI CLIF code at UM'

### clif-iv-fluids-sepsis

- **project_id:** `proj_2SSMRNK4N7R9P7BG5JJ4YEP5WM`
- **entries:** 3  (update=0, completion=3)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-04-27]` (completion) Review Daniel Shyu's ATS IV Fluids Sepsis PowerPoi
  - `[2026-04-29]` (completion) Review Daniel Shyu's ATS IV Fluids Sepsis PowerPoi
  - `[2026-04-29]` (completion) Run IV Fluids Sepsis cohort code for ETT duration
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-27: "Review Daniel Shyu's ATS IV Fluids Sepsis PowerPoi"
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-29: "Review Daniel Shyu's ATS IV Fluids Sepsis PowerPoi"

### clif-p2-volume-vs-pressure-control-mortality

- **project_id:** `proj_60RC6YFH1267RJSMBXCR72A7CT`
- **entries:** 0  (update=0, completion=0)
- **retained lead (new description):** "[2026-02-25] Full Quarto/code review done 2026-02-06. Code structurally complete but has PS trimming contradiction and inconsistent chunk syntax."
- **flags:**
  - ANOMALY — DOUBLE-ENCODED/QUOTE-WRAPPED description: a dated tag exists but parsed to ZERO entries (quote-wrapped description). LEFT UNTOUCHED (no entries emitted, no strip). Needs manual un-escape + re-run, or hand-migration.

### clif-pf-v-sf-oxygenation-severity

- **project_id:** `proj_7NW61S2M0Q16Q8NW06T3QH0531`
- **entries:** 1  (update=0, completion=1)
- **retained lead (new description):** Chad Hochberg CLIF project comparing PF ratio vs SF ratio for oxygenation severity assessment. Multi-site CLIF analysis.
- **sample cleaned entries:**
  - `[2026-03-18]` (completion) Review CLIF PF-SF manuscript draft (Hochberg)

### clif-prf-itrach-gao

- **project_id:** `proj_6NY733ZDW91MKE02JX44QSFEQQ`
- **entries:** 1  (update=0, completion=1)
- **retained lead (new description):** Cathy Gao's project, Wan-Ting Liao helping coordinate. Rerun for grant with updated cohort definition (prolonged respiratory failure) plus new respiratory features/scores. All CLIF sites running. Dead…
- **sample cleaned entries:**
  - `[2026-04-23]` (completion) Run CLIF PRF iTrach pipeline at UMN and upload out
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-23: 'Run CLIF PRF iTrach pipeline at UMN and upload out'

### clif-table-one-parker

- **project_id:** `proj_5MG44XVAZVT5E14EFS4Y5ZYW59`
- **entries:** 1  (update=0, completion=1)
- **retained lead (new description):** Standardizing Table 1 generation across CLIF sites. Will Parker (UChicago) lead.
- **sample cleaned entries:**
  - `[2026-05-05]` (completion) Run CLIF Table One on Data Shelter (waiting on Wil
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-05: 'Run CLIF Table One on Data Shelter (waiting on Wil'

### clif-wbc-temperature-thresholds-for-sepsis

- **project_id:** `proj_03KHSD4TDF8HGZNNZ5CJYMD55Q`
- **entries:** 1  (update=0, completion=1)
- **retained lead (new description):** Collaborators: Danielle Hunt (Emory), Siva Bhavani (Emory) /      / Key Links: / - GitHub: https://github.com/dmh0817/ASE_revised_thresholds_wbc_temp / - Box upload: https://uchicago.app.box.com/s/t2j…
- **sample cleaned entries:**
  - `[2026-04-23]` (completion) Re-run Thresholds Project using new GitHub repo

### cqode-backbone-umn-clif

- **project_id:** `proj_5AFX4KHTD3B9J7DF6G6EY7C00F`
- **entries:** 20  (update=3, completion=17)
- **retained lead (new description):** University of Minnesota CLIF database maintained by Nick for CQODE team. Involves: (1) Cleaning/joining encounters into backbone, (2) Creating dynamic process tables for co-ordering and analysis, (3) …
- **sample cleaned entries:**
  - `[2026-01-16]` (update) ASAP: Metformin analysis depends on backbone refresh.
  - `[2026-02-07]` (update) Created change log at Context/Technical/cqode-backbone-changelog.md. Feb 7: (1) Fixed med_dose/med_dose_unit to only use infusion …
  - `[2026-02-19]` (completion) Split pulmonary vasodilators into IV and inhaled m
- **flags:**
  - resolved undated lead block '[Jan 16] ASAP: Metformin analysis depend' → 2026-01-16 (year inferred from first dated entry 2026-02-07)
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-02-19: 'Split pulmonary vasodilators into IV and inhaled m'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-02-19: 'Update UMN ETL to use CLIF 2.1 standard med_catego'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-13: 'Email Julia Heneghan re: EHR-to-REDCap data pipeli'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-16: 'Provide clarifications for IRB MOD00061715 (Learni'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-16: 'Build CLIF ETL living docs project structure in va'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-23: 'Rerun CQODE backbone + CLIF ETL for March 2026 dat'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-27: 'Update CQODE backbone/CLIF data to align with ECMO'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-07: 'Coordinate meeting with Kevin Buell, Pat, and Hoda'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-08: 'Add collect_dttm for microbiology in CQODE CLIF ET'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-08: 'Reply to Rodney Ray re: specimen taken time in ETL'

### critical-care-quality-manuscript

- **project_id:** `proj_27YYPRYGQAX89R04X6P8DFD6V4`
- **entries:** 3  (update=1, completion=2)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-02-10]` (update) Classified as CLIF project per Nick.
  - `[2026-02-10]` (completion) Ask Kaveri to run vent variation analysis
  - `[2026-03-27]` (completion) Review comments: Manuscript_revised
- **flags:**
  - resolved undated lead block '[Feb 10] Classified as CLIF project per ' → 2026-02-10 (year inferred from first dated entry 2026-02-10)

### decision-making-survey

- **project_id:** `proj_4EM96NTM0Z7TYEBVSYRZQ76P93`
- **entries:** 17  (update=9, completion=8)
- **retained lead (new description):** Qualtrics survey for provider decision-making styles. Link: https://umn.qualtrics.com/survey-builder/SV_bjQ0AlqxDoRdAIm/edit. Process: Download survey from Qualtrics into raw files folder, R code does…
- **sample cleaned entries:**
  - `[2026-02-02]` (completion) Check Qualtrics question #7
  - `[2026-02-23]` (completion) Draft GDMS domains x LPV adherence prelim analysis
  - `[2026-02-24]` (update) MNCCORE: Nick planning 5 regressions: LPV adherence x DM style domains for Emma Bromley analysis.
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-02-23: 'Draft GDMS domains x LPV adherence prelim analysis'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-16: 'Run GDMS-LPV adherence correlation analysis for He'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-20: 'Send Steven respondent list and request non-respon'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-09: 'Reply to Emma Bromley re: VA IRB funding agency co'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-09: 'Cross-reference GDMS survey non-respondent list fr'

### dnr-provider-variation-mesfin

- **project_id:** `proj_5HRJ6AFB9X058K0SVYWX399MNA`
- **entries:** 6  (update=2, completion=4)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-01-13]` (update) MNCCORE project led by Nate Mesfin. Annals ATS desk rejection 2026-01-12. Key issues: (1) Add severity markers - levophed dose, re…
  - `[2026-02-24]` (update) MNCCORE: Casey fixed bug re: provider Bloops. One representative caterpillar plot for 20 imputed datasets. Single provider sensiti…
  - `[2026-03-09]` (completion) Discuss hemodialysis modeling artifact with Nathan
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-09: 'Discuss hemodialysis modeling artifact with Nathan'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-24: 'Review DNR provider variation manuscript through t'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-25: 'Review DNR provider variation manuscript through t'

### dom-research-conference-april-2026

- **project_id:** `proj_3F89BMNCTXWFBC9Q829EZ2KACQ`
- **entries:** 2  (update=1, completion=1)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-04-06]` (completion) Finalize DOM Research Conference presentation
  - `[2026-04-07]` (update) Presented at DOM Research Conference April 6, 2026. Created EBP MOR forest plot showing provider-level variation across 7 EBPs — r…
- **flags:**
  - DEDUP: dropped exact duplicate on 2026-04-07: 'Presented at DOM Research Conference April 6, 2026. Cre'

### fluid-shortage-all-comers

- **project_id:** `proj_54D5KE89DP0NZDP32QJYC81N18`
- **entries:** 2  (update=0, completion=2)
- **retained lead (new description):** "CLIF consortium fluid shortage analysis - all comers cohort\n[2026-02-17] [Feb 17] Daniel Shyu emailed updated code. Files in Inbox/reivfluidscode/: 00_run_all.ipynb (no change), 01_cohort_identifica…
- **sample cleaned entries:**
  - `[2026-04-15]` (completion) Update Fluid Shortage figures with temporal contro
  - `[2026-06-01]` (completion) Advise Daniel Shyu on target journal for IV fluid
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-15: 'Update Fluid Shortage figures with temporal contro'

### gdms-x-lpv-hebbel-abstract

- **project_id:** `proj_2QVG3P6AQTGAD6QRCH1M34020M`
- **entries:** 7  (update=2, completion=5)
- **retained lead (new description):** Emma Bromley 1st author. UMN Hebbel Research Day Mar 23 2026. Uses data from GDMS Provider Styles.
- **sample cleaned entries:**
  - `[2026-03-19]` (update) UMN Hebbel Research Day deadline Mar 23, 2026. Emma needs to record 4-5 min video.
  - `[2026-03-21]` (completion) Review Emma Bromley GDMS x LPV abstract draft for
  - `[2026-03-23]` (completion) Send revised Hebbel ESI abstract edits to Emma Bro
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-23: 'Send revised Hebbel ESI abstract edits to Emma Bro'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-23: 'Follow-up meeting with Adams + Emma to finalize pr'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-23: 'Review Emma Bromley GDMS x LPV presentation PowerP'
  - SPAM CLUSTER: 3 completions on 2026-03-23 — emitted individually. Proposed collapse: 'Completed 3 tasks on 2026-03-23: Send revised Hebbel ESI abstract edits t; Follow-up meeting with Adams + Emma to f; Review Emma Bromley GDMS x LPV presentat'

### hebbel-esi-application

- **project_id:** `proj_7H9SSM47JT3ZNKJT88QZ72R4KC`
- **entries:** 2  (update=0, completion=2)
- **retained lead (new description):** Robert P. Hebbel Early-Stage Investigator Award at UMN DOM Research Day. Nick is the applicant. Features LPV Variation manuscript results. Separate from Emma Bromley's GDMS x LPV abstract. Deadline Ma…
- **sample cleaned entries:**
  - `[2026-03-23]` (completion) Revise Hebbel ESI abstract — expand to all EBPs, a
  - `[2026-03-23]` (completion) Apply for Robert Hebbel Early-Stage Investigator (
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-23: 'Revise Hebbel ESI abstract — expand to all EBPs, a'

### hospital-transfer-qualitative

- **project_id:** `proj_1RJDNNNK3V149M6E2HDJJSW1NW`
- **entries:** 3  (update=1, completion=2)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-03-25]` (completion) Review IHT qualitative manuscript for JAMA Network
  - `[2026-03-25]` (update) Folder reorganized 2026-03-25 -- created proper subdirectories, moved transcript to Data/, coding files to Analysis/. IWD already …
  - `[2026-03-27]` (completion) Review comments: Qualitative Assessment of Barrier
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-25: 'Review IHT qualitative manuscript for JAMA Network'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-27: 'Review comments: Qualitative Assessment of Barrier'

### hospital-transfer-quant

- **project_id:** `proj_64Z4W1MVHH4G9Q1KH6VB57E6HH`
- **entries:** 1  (update=0, completion=1)
- **retained lead (new description):** Lead: Nate Mesfin. Senior: Katie Pendleton. NIS quantitative study on hospital transfer-in prevalence and outcomes. CHEST major revision resubmission.
- **sample cleaned entries:**
  - `[2026-03-06]` (completion) Review CHEST Transfer Manuscript

### ice-fishing

- **project_id:** `proj_6ZB2EV6BCQF1VHJR96Q5KMJ08J`
- **entries:** 2  (update=2, completion=0)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-01-19]` (update) duplicative - moving ice fishing shopping/prep to priorities
  - `[2026-01-29]` (update) Trip was great!

### llm-ethics

- **project_id:** `proj_6B6C79FS7S3726R10T59R5V80B`
- **entries:** 7  (update=1, completion=6)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-03-09]` (completion) Review AI-generated discharge summaries
  - `[2026-03-10]` (update) SME review of 20 cases complete. Draft reply to Greg ready in Gmail. Cases folder created at Peripheral-Brain/Projects/llm-ethics/…
  - `[2026-05-11]` (completion) Review Greg Silverman's "Framework for reasoning q
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-11: 'Review Greg Silverman\'s "Framework for reasoning q'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-22: 'Review AMR manuscript (Silverman) - clinical persp'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-01: 'Assist Greg Silverman with mixed-effects/hierarchi'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-01: 'Review fully updated AMR manuscript draft (Silverm'

### lpv-adherence-paper

- **project_id:** `proj_3999V0Y09T81RRZ9DX7J0NWVX3`
- **entries:** 7  (update=3, completion=4)
- **retained lead (new description):** "[2026-02-20] \u2713 Email Casey re: LPV adherence dataset location on \n[2026-02-20] \u2713 Email Casey re: GDMS-LPV adherence dataset locatio\n[2026-02-20] [Feb 20] Casey/Nick meeting: Casey to save…
- **sample cleaned entries:**
  - `[2026-03-14]` (update) GDMS Provider Styles project had major NPI linkage session Mar 13. 50 curated NPIs (was 29), all joins now use response_id, build_…
  - `[2026-03-18]` (completion) Review comments: Provider-level Va
  - `[2026-03-20]` (update) Major session: reorganized folder structure, built full CHEST CC submission package, updated all PB/SQLite/TODAY references, corre…
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-25: 'Anonymize LTVV manuscript for CHEST double-blind r'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-26: 'Anonymize LTVV manuscript for CHEST double-blind r'

### lpv-precision-practice-assistance

- **project_id:** `proj_30QFCKSC9GH2GFR8DXGMFNTDQE`
- **entries:** 1  (update=1, completion=0)
- **retained lead (new description):** "[2026-02-05] [Feb 5] NIH revisions received. Need to:\n1. Set up revisions folder structure (modeled on R03)\n2. Create living documents for tracking reviewer comments\n3. Review critiques and prepar…
- **sample cleaned entries:**
  - `[2026-03-12]` (update) Saved provider tool design principles from IEEE ICHI EMS paper. Key: providers want info retrieval + snapshots, cautious about dia…

### lung-cancer-trajectories-graffy

- **project_id:** `proj_03X8ZGJDR251NT70SRSX99PJ90`
- **entries:** 3  (update=0, completion=3)
- **retained lead (new description):** Unsupervised clustering of CLIF lung cancer trajectories. Prelim data for LCRF grant due June 2nd. Sites must have county_code for full script. Peter Graffy lead.
- **sample cleaned entries:**
  - `[2026-04-09]` (completion) Run CLIF lung cancer clustering code at UMN
  - `[2026-04-14]` (completion) Re-run LungCx-Epi code (Graffy)
  - `[2026-04-22]` (completion) Review CLIF Lung Cancer Cluster Manuscript from Pe
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-22: 'Review CLIF Lung Cancer Cluster Manuscript from Pe'

### mesfin-k23-ihca-survivability-calculator

- **project_id:** `proj_47Y4JKNV9R0FK3J76NRB67G05N`
- **entries:** 4  (update=2, completion=2)
- **retained lead (new description):** Nate Mesfin K23 Without Clinical Trial, NHLBI. June 12 2026 deadline. Nick is consultant/collaborator. LLM-based IHCA event detection + CLIF validation + CBPR code status framework. SA v1 reviewed 202…
- **sample cleaned entries:**
  - `[2026-03-06]` (completion) Review Nate K23 aims recommendations and send feed
  - `[2026-03-06]` (update) Meeting: Adams flagged Aim 3 framing issue. Using existing models as fallback undermines Aim 1 innovation. Fix: show LLMs identify…
  - `[2026-03-09]` (completion) Push Nate on end-of-life communication literature
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-06: 'Review Nate K23 aims recommendations and send feed'

### mn-ccore-lab-hub

- **project_id:** `proj_5BD5233A3T7N5ATZ5RJTQKHZX4`
- **entries:** 1  (update=0, completion=1)
- **retained lead (new description):** Lab website + team hub at mn-ccore-lab.pages.dev. Repo: C:/Users/ingra107/mn-ccore-lab. Vision: become the central project management and public face of MNCCORE.
- **sample cleaned entries:**
  - `[2026-03-26]` (completion) Implement Google OAuth auth for MN-CCORE Lab Hub w
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-26: 'Implement Google OAuth auth for MN-CCORE Lab Hub w'

### mnccore-minnesota-critical-care

- **project_id:** `proj_46RHGM3HTDBHE67MQYDM2VSQGW`
- **entries:** 20  (update=1, completion=19)
- **retained lead (new description):** "Co-directed by Nick Ingraham and Nate Mesfin. Umbrella project for MNCCORE administrative tasks. Biweekly meetings.\n[2026-03-06] \u2713 Ask Tom Phelan for collected_datetime in CLIF micr"
- **sample cleaned entries:**
  - `[2026-03-10]` (completion) Send MNCCORE meeting agenda email for March 10
  - `[2026-03-21]` (completion) Create CLIF Slack Run Request channel with formal
  - `[2026-03-23]` (completion) Send MNCCORE meeting agenda email for March 10
- **flags:**
  - DEDUP: dropped exact duplicate on 2026-03-24: 'Send MNCCORE meeting agenda email for March 24'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-08: 'Refresh CLIF micro_culture table with collected_da'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-08: 'Send SWOT analysis + targeted questions to Adams f'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-22: 'Fix microdata (ASE/acute-sepsis coding) in CLIF da'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-22: 'Follow up with Michael re: colonoscopy paper due d'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-22: 'Text Adams re: Daniel STAR Travel Award details (f'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-11: 'Review Mike (Zoom user) paper revisions and help a'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-11: 'Decide on provider active year window approach for'
  - SPAM CLUSTER: 3 completions on 2026-04-22 — emitted individually. Proposed collapse: 'Completed 3 tasks on 2026-04-22: Fix microdata (ASE/acute-sepsis coding) ; Follow up with Michael re: colonoscopy p; Text Adams re: Daniel STAR Travel Award '

### multidiseasepred-xie

- **project_id:** `proj_01KTC775RME4XGXW3YJAQT3HGP`
- **entries:** 1  (update=0, completion=1)
- **retained lead (new description):** Feng Xie (Asst Prof, Computational Health Sciences, Dept Surgery UMN; xie00469@umn.edu) manuscript. Nick = reviewer/collaborator (ongoing chest-pain agent collab; met 2026-05-28). Target npj Digital M…
- **sample cleaned entries:**
  - `[2026-06-06]` (completion) Review Feng Xie's MultiDiseasePred manuscript draf
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-06: "Review Feng Xie's MultiDiseasePred manuscript draf"

### oncology-risk-tools-lyons

- **project_id:** `proj_7XWY56Z9BZZ3T0F8N5CVA6MQEB`
- **entries:** 3  (update=0, completion=3)
- **retained lead (new description):** Lyons risk tools for oncology. Nontrivial bug in supplemental figures caught, re-run party week of Apr 14. Manuscript ready 24-48h after all sites run. Open via R Project. GitHub: https://github.com/p…
- **sample cleaned entries:**
  - `[2026-04-14]` (completion) Re-run oncology risk-tools code (Lyons)
  - `[2026-04-24]` (completion) Review Pat Lyons CLIF Triage Scores Oncology proje
  - `[2026-04-27]` (completion) Review comments: Risk Triage Score
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-24: 'Review Pat Lyons CLIF Triage Scores Oncology proje'

### pcori-federated-tte-clif-hochberg

- **project_id:** `proj_4SW4AX68C7BMPZJ18SFECQF2QX`
- **entries:** 0  (update=0, completion=0)
- **retained lead (new description):** "Advisory board role. PCORI methods grant for federated target trial emulation using CLIF. PIs: Hochberg + Tong (JHU). 3 Aims: static TTE, dynamic TTE with G-methods, open-source software. Overlaps wi…
- **flags:**
  - ANOMALY — DOUBLE-ENCODED/QUOTE-WRAPPED description: a dated tag exists but parsed to ZERO entries (quote-wrapped description; literal '\n' escape (not a real newline); literal '\u' escape (e.g. \u2713 = ✓)). LEFT UNTOUCHED (no entries emitted, no strip). Needs manual un-escape + re-run, or hand-migration.

### peripheral-brain-system

- **project_id:** `proj_7F27APDE49WTC2GE4SKRMNYTAM`
- **entries:** 9  (update=0, completion=9)
- **retained lead (new description):** Nick internal productivity system. Sync, automation, Claude Code infrastructure.
- **sample cleaned entries:**
  - `[2026-06-01]` (completion) Approve: MECHANIC: outbox-dead-letter — outbox dea
  - `[2026-06-04]` (completion) Run codex cold-audit for substrate-lane reconcilia
  - `[2026-06-04]` (completion) Enable Developer Mode on home laptop (TODAY.md vau
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-01: 'Approve: MECHANIC: outbox-dead-letter — outbox dea'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-04: 'Run codex cold-audit for substrate-lane reconcilia'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-04: 'Enable Developer Mode on home laptop (TODAY.md vau'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-04: 'Review + approve: correction-learning loop spec (K'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-04: 'Push pb-schema package repo to GitHub (ingra107/pb'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-09: 'Run P4 rail-deletion SOAK GATE (both machines); if'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-09: 'Finish project-identity convergence -- close brain'
  - SPAM CLUSTER: 5 completions on 2026-06-04 — emitted individually. Proposed collapse: 'Completed 5 tasks on 2026-06-04: Run codex cold-audit for substrate-lane ; Enable Developer Mode on home laptop (TO; Review + approve: correction-learning lo; Push pb-schema package repo to GitHub (i (+1 more)'
  - SPAM CLUSTER: 3 completions on 2026-06-09 — emitted individually. Proposed collapse: 'Completed 3 tasks on 2026-06-09: Approve: MECHANIC: re-sync Hub D1 kg to ; Run P4 rail-deletion SOAK GATE (both mac; Finish project-identity convergence -- c'

### peripheral-vasopressor-deviations-shyu

- **project_id:** `proj_0DS3NBP7VC9DJMA587X5SCYX07`
- **entries:** 5  (update=2, completion=3)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-03-10]` (completion) Review Critical Care Explorations manuscript resub
  - `[2026-03-11]` (update) Deadline March 23. Nick completed edits on Google Doc. Still need: supplemental materials doc, response letter, final word count c…
  - `[2026-03-31]` (update) Dan Shyu emailed revised draft as research report (<1500 words per CCE editor request). Attached Manuscript_CCE_ResearchReport_fin…
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-10: 'Review Critical Care Explorations manuscript resub'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-31: 'Review Daniel/Katie feedback on CCE revision Googl'

### primary-care-nlp-dudley

- **project_id:** `proj_01KS8J0ZF4PX24Q1Y7V7A477DN`
- **entries:** 1  (update=0, completion=1)
- **retained lead (new description):** Adams Dudley NLP collaboration. Primary care note identification program in UMN data warehouse. Recurring Dudley NLP Updates meeting series (Adams Dudley, Nate Mesfin, Joshua Trujeque).
- **sample cleaned entries:**
  - `[2026-05-22]` (completion) Provide input to Steven and Adams at NLP meeting r
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-22: 'Provide input to Steven and Adams at NLP meeting r'

### provider-variation-across-clif

- **project_id:** `proj_4BM9T7X29S9ASQ8P99C4R9R95F`
- **entries:** 34  (update=18, completion=16)
- **retained lead (new description):** "[2026-01-22] [Jan 22] CLIF WG discussed provider table development. Nick & Katie to collaborate on breadcrumb-based provider identification algorithm. Site-specific approach preferred over centralize…
- **sample cleaned entries:**
  - `[2026-03-12]` (update) Meeting with Katie: planning to meet Meeta Kerlin (Penn) about provider assignment methodology. UMN treatment team table may be us…
  - `[2026-04-17]` (update) 2026-04-17 — Aims v9 (710w) → v10 (550w exact). All expert-panel structural fixes applied (Aim 1 hypothesis-testing reframe, extub…
  - `[2026-04-22]` (completion) Confirm Ben Langworthy g-formula publications OR r
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-22: 'Confirm Ben Langworthy g-formula publications OR r'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-23: 'Follow up with Lianne re: g-formula expertise refe'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-24: 'Meet with Lianne re: g-formula methods (see her em'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-24: 'Bring R01 CLIF provider variation aims to Adams fo'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-04-29: 'Verify Yehya 2019 VFD MCID + VanderWeele 2017 E-va'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-05: 'Schedule next meeting with Lianne + Jared (Prov Va'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-06: 'Submit intention-to-treat for CLIF Provider Variat'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-11: 'Schedule Provider Variation R01 methods meeting wi'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-15: 'Email Will Parker for UChicago proning + VFD-28-by'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-22: 'Generate UMN VFD-28-by-provider simple-count figur'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-22: 'Aim 3 provider × strain prelim figure from K23 dat'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-22: 'Send Adams: Mike Schoeding + Anna contacts for pot'
  - SPAM CLUSTER: 3 completions on 2026-04-24 — emitted individually. Proposed collapse: 'Completed 3 tasks on 2026-04-24: Meet with Lianne re: g-formula methods (; Email Jared Hewling + Lianne — consultan; Bring R01 CLIF provider variation aims t'
  - SPAM CLUSTER: 3 completions on 2026-05-05 — emitted individually. Proposed collapse: 'Completed 3 tasks on 2026-05-05: Get LPV providers N from Casey by MV-day; Schedule next meeting with Lianne + Jare; Draft TTE protocol table for Approach (m'
  - SPAM CLUSTER: 4 completions on 2026-05-22 — emitted individually. Proposed collapse: 'Completed 4 tasks on 2026-05-22: Generate UMN VFD-28-by-provider simple-c; Aim 3 provider × strain prelim figure fr; Summarize VFD paper revision plan into G; Send Adams: Mike Schoeding + Anna contac'

### r03-decision-making-styles-of-medical-trainees

- **project_id:** `proj_6GS5P592WSRF74Y68R425Q3PSX`
- **entries:** 31  (update=19, completion=12)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-01-14]` (update) Summary statement received - ND outcome. Revision plan created.
  - `[2026-01-15]` (update) HSR meeting reviewed R03 feedback with Adams/Steven/Nathan. Key decisions: ⏎ - Expand sample to include fellows and attendings (no…
  - `[2026-01-16]` (update) Session: Folder reorganized: ⏎ - Summary statement now in 2026_01_Summary_Statement/ ⏎ - Project root is 2025_06_R03_submission/ ⏎…
- **flags:**
  - resolved undated lead block '[Jan 14] Summary statement received - ND' → 2026-01-14 (year inferred from first dated entry 2026-01-15)
  - SPLIT glued block out of the 2026-01-15 entry → new 2026-01-16 entry: '[Jan 16 Session] Folder reorganized:' (year inferred from parent 2026-01-15)
  - SPLIT glued block out of the 2026-01-29 entry → new 2026-01-29 entry: '[Jan 29] All revisions planned and Introduction to' (year inferred from parent 2026-01-29)
  - DEDUP: dropped exact duplicate on 2026-01-30: 'Draft one-page R03 response summary for Adams'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-02-16: 'Check in on clean folder template — go system-wide'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-25: 'Complete initial COI in IRBnet - Provider Decision'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-09: 'Submit R03 Intent to Submit via DOM form https://z'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-09: 'Request Adams Dudley mentor LOS + institutional LO'
  - SPAM CLUSTER: 3 completions on 2026-06-09 — emitted individually. Proposed collapse: 'Completed 3 tasks on 2026-06-09: Submit R03 Intent to Submit via DOM form; Request Adams Dudley mentor LOS + instit; Update mandatory K-Award Progress Summar'

### severe-hyponatremia-safadi

- **project_id:** `proj_68Q3X6QY8W6YSCZQYW8XSG4V4J`
- **entries:** 1  (update=1, completion=0)
- **retained lead (new description):** "Multi-site severe hyponatremia outcomes analysis. Uses CLIF-format data (non-consortium). Collaborator: Sami Safadi.\n[2026-02-25] All Sami questions resolved (2026-02-13): Na<125 confirmed, time_0=f…
- **sample cleaned entries:**
  - `[2026-04-09]` (update) Nick: Data sent to Sami. Waiting on him. Keep as waiting/bleeding - out of our hands but not complete.

### sglt2-metformin-in-copd-readmissions

- **project_id:** `proj_1K64197TN2EC5GBSSA29B5JF7T`
- **entries:** 2  (update=0, completion=2)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-01-30]` (completion) Submit late-breaking abstract: Metformin vs Others
  - `[2026-06-10]` (completion) Send David MacDonald most up-to-date files for SGL
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-01-30: 'Submit late-breaking abstract: Metformin vs Others'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-10: 'Send David MacDonald most up-to-date files for SGL'

### synthetic-clif-dataset

- **project_id:** `proj_4QBJMAV9RC8W46405VMDQM1XFB`
- **entries:** 3  (update=1, completion=2)
- **retained lead (new description):** MERGED 2026-06-10 into CQODE Backbone / UMN CLIF (cqode-backbone-umn-clif) as the Synthetic-data + ETL-summary WORKSTREAM (Nick decision 2026-06-10). Repo stays standalone: github.com/ingra107/synthet…
- **sample cleaned entries:**
  - `[2026-04-09]` (update) Consolidated summarize_clif.py + summarize_synthetic.py + clif_etl_summary.qmd into single Python script. All 28 CLIF tables + acu…
  - `[2026-05-15]` (completion) Re-run summarize_clif.py in data shelter with vect
  - `[2026-06-10]` (completion) Decide: merge Synthetic CLIF Dataset into CQODE Ba
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-15: 'Re-run summarize_clif.py in data shelter with vect'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-06-10: 'Decide: merge Synthetic CLIF Dataset into CQODE Ba'

### teaching

- **project_id:** `proj_01KQYSQH372HK60PFW3JRK9GCG`
- **entries:** 2  (update=0, completion=2)
- **retained lead (new description):** Container for teaching prep: RESP courses, lectures, small groups, trainee education.
- **sample cleaned entries:**
  - `[2026-05-14]` (completion) Prep for RESP Course COPD Small Group session
  - `[2026-05-22]` (completion) Check classroom assignment for RESP Pulmonary Vasc
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-22: 'Check classroom assignment for RESP Pulmonary Vasc'

### tignanelli-arpa-h-circle-origin

- **project_id:** `proj_6TSTEDPPAPATTCA093V26A549D`
- **entries:** 1  (update=0, completion=1)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-03-25]` (completion) Verify $300k data pull estimate for ARPA CIRCLE su
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-25: 'Verify $300k data pull estimate for ARPA CIRCLE su'

### va-tele-icu-clif

- **project_id:** `proj_1N88DBYDN8RX2NDQBWNGAKEHW0`
- **entries:** 1  (update=1, completion=0)
- **retained lead (new description):** Exploring using VA Tele-ICU data for ICU portion of CLIF + CDW for remaining tables. May offer CLIF to VA Tele-ICU team instead. Waiting on CAC meeting.
- **sample cleaned entries:**
  - `[2026-04-09]` (update) Collaborators: Ben Henkle, Adams Dudley, Nate Mesfin, Josh Trujeque

### va-woc-status

- **project_id:** `proj_1CMX63BS6THYK9DX8D4SA0P2KX`
- **entries:** 9  (update=1, completion=8)
- **retained lead (new description):** _(empty — all content was dated log lines)_
- **sample cleaned entries:**
  - `[2026-03-10]` (update) Nick signed up for fingerprinting. Appointment scheduled for Mar 11.
  - `[2026-03-12]` (completion) Get fingerprinted for VA WOC
  - `[2026-03-18]` (completion) Upload Signed VA Privacy and Information Security
- **flags:**
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-03-25: 'Complete VA Form 10-5345 Pre-Employment Examinatio'
  - AT 50-CHAR CAPTURE LIMIT (likely truncated; kept VERBATIM, never completed — verify) on 2026-05-11: 'Provide BLS/ACLS certification for VA WOC credenti'

---

# EXECUTED 2026-06-10 (evening) — Nick: "go"

Runbook ran same-evening with a live correction. **Final prod state: 407 `description_line`
entries (the original 298 + 109 from the encoded-blob repair) · 0 JSON-encoded descriptions ·
0 line-start dated lines anywhere in `projects.description`.**

- Delta check vs the package snapshot: 0 changed rows. Pre-strip snapshot saved
  (`Scratch/desc-migration-2026-06-10/snapshot_pre_strip.json`) + D1 Time-Travel 30d backstop.
- `apply.sql` rehearsed on `mnccore-lab-test` (then cleaned), prod-applied (298 rows), re-run
  proven idempotent (0 writes). `strip.sql` rewrote 53 descriptions. NOTE: D1 rejects
  `BEGIN TRANSACTION;` — executed via `.d1.sql` variants with the wrapper lines stripped.
- **CORRECTION — the double-encoded class was 9 projects, not 2.** The package flagged only the
  2 zero-entry cases; 7 more had a JSON-stringified PREFIX (literal `"` + `\n`/`✓` escapes)
  that the spine read as one undated lead line — their clean appended tails migrated, the blobs
  silently survived as "leads". `repair_encoded.py` (same pipeline, `raw_decode` the prefix)
  fixed all 9 in two rounds: +82 entries (round 1: clif-p2, pcori, lpv-adherence,
  provider-variation incl. the real 68-completion 2026-02-16 cluster) and +27 entries (round 2:
  cci-in-ards, lpv-precision, fluid-shortage, mnccore-minnesota, severe-hyponatremia). Both
  rounds idempotency-proven (re-run = 0 writes). Real static leads retained (pcori 230 chars,
  fluid-shortage 59, mnccore 115, severe-hyponatremia 116).
- `updated_at` bumped on all 55 affected projects so PB's Hub-wins pull takes the stripped
  descriptions into local `notes` — without this, PB's stale notes cache would resurrect the
  dated lines on its next breadcrumb push.
- Live verification: r03 feed shows 31 migrated entries; provider-variation 107 project entries.
- **Rollback:** `DELETE FROM activity_entries WHERE source_table='description_line';` + restore
  descriptions from `snapshot_pre_strip.json`.
- **STILL OPEN (PB session, now higher urgency):** retarget the 4 breadcrumb writers
  (`query.py:1960/2001/2084/2650`) — until then any PB complete-with-note/reopen/breadcrumb
  appends a NEW dated line to notes→description (single line on a clean description; re-runnable
  delta exists in `Scratch/desc-migration-2026-06-10/pipeline.py`). Then DELETE
  `src/lib/descriptionLog.ts` after one clean sync cycle.

# N2 — One-time description condense pass — REVIEW DOC (2026-06-11)

**Nick approves line-by-line. Nothing has been applied.** Apply = guarded UPDATE on the
approved rows only, `updated_at` bumped so PB's pull takes the clean text. Originals are
preserved verbatim in this doc forever.

Scope: open tasks + projects with `description` > ~400 chars. Found **11 tasks + 4 projects**.
Rule 72 already clamps descriptions to 3 lines with "more" on drawer surfaces, and rows render
`short_title` — so length only costs on the expanded read. Recommendation legend:
**CONDENSE** = real cruft/status-bleed, propose replacing; **KEEP** = the length is working
spec, leave it (proposed text still provided in case you disagree).

| # | Row | Len | Rec |
|---|-----|-----|-----|
| 1 | task_01KTWD8DD… style learnings meta | 599 | KEEP |
| 2 | task_01KTWD8BV… badge honesty audit | 504 | KEEP |
| 3 | task_01KTWD8CN… deep-link audit | 514 | KEEP |
| 4 | task_01KTWD8AW… pill language sweep | 494 | KEEP |
| 5 | task_01KTWD89V… icon pass | 473 | KEEP |
| 6 | task_01KRF1JXQ… seamless-sync gate | 406 | CONDENSE |
| 7 | task_01KPXJET7… CHEST CC revision | 792 | CONDENSE (light) |
| 8 | task_01KP9FM30… CQODE mCIDE | 720 | CONDENSE |
| 9 | task_01KQWVPQV… PLOS ONE revision | 1279 | CONDENSE |
| 10 | task_01KS7ZJ4P… provider confounding prelim | 415 | KEEP |
| 11 | task_01KS8BB1P… ADHERE-LPV manuscript | 450 | KEEP |
| 12 | proj clif-federation-viewpoint-annalsats | 477 | KEEP |
| 13 | proj clif-prf-itrach-gao | 412 | KEEP |
| 14 | proj clif-wbc-temperature-thresholds | 534 | KEEP (+1 question) |
| 15 | proj synthetic-clif-dataset | 664 | CONDENSE |

The 5 Hub style-sweep tasks (#1–5) and the research working descriptions (#10, #11, #13) are
self-contained specs — their length is earning its keep; condensing them trades execution
fidelity for tidiness. The real wins are #6, #8, #9, #15 (stale status snapshots, dead
fetch-failure lines, status-bleed that belongs in Activity, escaped-JSON cruft).

---

## 6 — task_01KRF1JXQQB34S7T974YAEP1Z2 · Decision gate: seamless-sync (b)-scope (30d)
**Rec: CONDENSE** — it's a dated status snapshot; the window closes Jun 12 anyway.

ORIGINAL (406):
> [Jun 1] Drift count since 2026-05-13 (30d window opens, closes Jun 12): 0 JPDRM-class cross-machine data divergence bugs found in corrections.work.jsonl. 43 sync/outbox corrections flagged but those are code-edit churn on outbox.py/how_syncs.py — not task-field divergence events. Threshold for re-opening PRO surgery is >=2 JPDRM-class. Currently: 0. Lean toward shelving PRO, but window isn't closed yet.

PROPOSED (213):
> 30d drift window 2026-05-13 → 06-12. Re-open PRO surgery only if ≥2 JPDRM-class cross-machine divergence bugs in corrections.work.jsonl. Count as of Jun 1: 0 (the 43 flagged sync corrections are code churn, not divergence). Lean: shelve PRO.

## 7 — task_01KPXJET7W9V7QBQ84RVRQ0Q19 · CHEST CC revision (59 items, Jul 21)
**Rec: CONDENSE (light)** — keep counts/deadline/IWD links/next action; the 5 strategic themes
duplicate the IWD's own summary (IWD is canonical).

ORIGINAL (792): *(see task; includes 5-theme list + next action)*

PROPOSED (379):
> CHEST Critical Care major revision, CHEST-CRITCARE-D-26-00066. Decision 2026-04-22, deadline 2026-07-21. 59 items: 8 editor + 5/12 R1 + 9/7 R2 + 6/12 R3. Biggest ask: cluster-level covariates (needs Casey).
> IWD (canonical): [[Projects/lpv-adherence-paper/iwd-lpv-revision-chest-cc]] · C:/Users/ingra107/Peripheral-Brain/Projects/lpv-adherence-paper/iwd-lpv-revision-chest-cc.md
> Next: Nick reads IWD, expands feedback callouts, answers the 6 end decisions, then port to Google Doc.

## 8 — task_01KP9FM308EGQBQQ50450BCS6S · CQODE: Review mCIDE update (CLIF v3.0)
**Rec: CONDENSE** — contains a stale "Could not fetch mCIDE directory from GitHub" failure line
and template boilerplate from the 2026-03-07 detector.

ORIGINAL (720): *(auto-generated block with empty Schema Details section)*

PROPOSED (333):
> Review CLIF v3.0 mCIDE changes against the CQODE ETL: new tables/columns, permissible-value mappings, test against sample data, update CQODE docs.
> Issue: https://github.com/Common-Longitudinal-ICU-data-Format/CLIF/issues/179 · [mCIDE dir](https://github.com/Common-Longitudinal-ICU-data-Format/CLIF/tree/main/mCIDE) · [Branch 3.0](https://github.com/Common-Longitudinal-ICU-data-Format/CLIF/tree/3.0)

## 9 — task_01KQWVPQVERNT7MDC43H1EZ1NX · PLOS ONE revision (16 items, Jun 17)
**Rec: CONDENSE** — the Mike/Qi status updates (last 3 paragraphs) are Activity-timeline
content living in the description; scope + links + open decisions stay.

ORIGINAL (1279): *(see task)*

PROPOSED (564):
> PLOS ONE revision PONE-D-26-14916 (Persistent Critical Illness in AHRF). Decision 2026-05-03, deadline 2026-06-17. 16 items: 7 formatting + 5 R1 + 4 R2 limitations; both reviewers technically YES.
> IWD (canonical): [[Projects/cci-in-ards/iwd-pci-ahrf-plos-revision-2026-05-05]] · Box: C:/Users/ingra107/Box/Research/CCI in ARDS/Revisions/2026_05 PLOS ONE Revision/
> Open decisions: (1) R1-M1 run 7-day-cutoff sensitivity vs limitation-only (rec: run; Qi feasible, Nick adds variables); (2) R1-M2 confirm Cox model excludes post-PerCI variables; (3) reconcile funding-source fields; (4) rename cci-in-ards → perci-ahrf after?

## 15 — proj synthetic-clif-dataset
**Rec: CONDENSE** — merged-tombstone + escaped-JSON original-notes cruft.

ORIGINAL (664): *(tombstone + quoted notes with \n and → escapes)*

PROPOSED (316):
> MERGED 2026-06-10 into CQODE Backbone / UMN CLIF (cqode-backbone-umn-clif) as the Synthetic-data + ETL-summary workstream (Nick decision 2026-06-10). Repo stays standalone: github.com/ingra107/synthetic-clif-umn (trainee clone target). Regen rides the backbone re-ETL checklist. summarize_clif.py loops vectorized 2026-02-25 (commit 1ff72c3) — copy to data shelter + re-run still pending.

## 14 — proj clif-wbc-temperature-thresholds — KEEP, one question
The "Request (Jan 13, 2026)" block (re-run 3 Rmds, upload CSVs): **is it done?** If yes, that
block can drop (−~200 chars) and the request lives in Activity. If still open, keep as is.

## KEEP rows (1–5, 10–13) — no action proposed
Working specs / runbooks where length carries execution detail. Available on request:
condensed drafts were deliberately NOT prepared for these to avoid tempting precision loss.

---
**To apply:** reply with row numbers to approve (e.g. "apply 6, 8, 9, 15"). I'll run guarded
UPDATEs (`WHERE id=? AND length(description)=<original length>` so a changed row is never
clobbered) + `updated_at` bump, then verify via PB pull.

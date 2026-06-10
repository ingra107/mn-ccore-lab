# Description-line migration — deterministic parser vs LLM-cleaned (real-data comparison)

**Date:** 2026-06-10 · **Purpose:** Nick wants to see actual outputs before choosing the migration
engine (brainstorm-lite decision point 2). Source sample: live prod
`r03-decision-making-styles-of-medical-trainees` description (7,396 chars), excerpted verbatim.
The other 54 dated-description projects show the same patterns (✓-completion spam, duplicates,
undated `[Jan 14]` human tags, 50-char truncation artifacts, multi-line meeting notes).

## The raw source (excerpt, verbatim)

```
[Jan 14] Summary statement received - ND outcome. Revision plan created.
[2026-01-15] [Jan 15] HSR meeting reviewed R03 feedback with Adams/Steven/Nathan. Key decisions:
- Expand sample to include fellows and attendings (not just residents)
- Reframe hypothesis: studying decision-making styles, NOT claiming rationality is superior
...
[Jan 16 Session] Folder reorganized:
- Summary statement now in 2026_01_Summary_Statement/
...
[2026-01-29] ✓ Contact Shahnaz Khan re R03 resubmission
[Jan 29] All revisions planned and Introduction to Resubmission drafted. ...
[2026-01-30] ✓ Draft one-page R03 response summary for Adams
[2026-01-30] ✓ Draft one-page R03 response summary for Adams
[2026-02-16] ✓ Send R03 pink sheets to Adams
```

## Option A — deterministic (`parseDescriptionLog()`, what ships today as display)

Each `[YYYY-MM-DD]`-prefixed block becomes one `kind='update'` entry, body verbatim:

| date | entry body (as it would land in the timeline) |
|---|---|
| — (pinned as static description!) | `[Jan 14] Summary statement received - ND outcome. Revision plan created.` |
| 2026-01-15 | `[2026-01-15] [Jan 15] HSR meeting reviewed R03 feedback … key decisions bullets … [Jan 16 Session] Folder reorganized: - Summary statement now in 2026_01_Summary_Statement/ …` ← **Jan-16 block glued into the Jan-15 entry** (continuation-line rule) |
| 2026-01-29 | `[2026-01-29] ✓ Contact Shahnaz Khan re R03 resubmission` + `[Jan 29] All revisions planned …` glued on |
| 2026-01-30 | `✓ Draft one-page R03 response summary for Adams` |
| 2026-01-30 | `✓ Draft one-page R03 response summary for Adams` ← **duplicate imported as-is** |
| 2026-02-16 | `✓ Send R03 pink sheets to Adams` (and on provider-variation: **17 separate `✓ R01: …` entries on one date** — bulk-completion spam becomes 17 timeline rows) |

Faithful and zero-hallucination-risk, but: undated `[Jan 14]` lead lines stay stuck in the static
description; undated `[Jan 16 Session]` blocks attach to the wrong entry; duplicates and ✓-spam
import verbatim; `[2026-01-22] [Jan 22]` double-tags stay; truncated lines (`…for R01 applicatio`)
stay truncated (correctly — nothing should invent the ending).

## Option B — LLM-cleaned (Haiku/Sonnet pass, rules-bound, same excerpt)

| date | kind | entry body |
|---|---|---|
| 2026-01-14 | update | `Summary statement received — ND outcome. Revision plan created.` ← undated tag resolved to a real date |
| 2026-01-15 | update | `HSR meeting reviewed R03 feedback with Adams/Steven/Nathan. Key decisions:` + the bullets, intact, **without** the Jan-16 block |
| 2026-01-16 | update | `Folder reorganized: Summary statement now in 2026_01_Summary_Statement/ …` ← split into its own entry |
| 2026-01-29 | completion | `Contact Shahnaz Khan re R03 resubmission` ← ✓ lines classified as completions |
| 2026-01-29 | update | `All revisions planned and Introduction to Resubmission drafted. Multinomial logistic regression confirmed as LPA fallback …` |
| 2026-01-30 | completion | `Draft one-page R03 response summary for Adams` ← **deduplicated** |
| 2026-02-16 | completion | one entry per real completion; the provider-variation 17-row `R01:` spam optionally collapsed to one `Completed 17 R01 subtasks (BIOSKETCH, SIG-INNOV, AIMS-DRAFT …)` summary entry — **Nick's call** |

Reads the way a human would have written the timeline. Risks + mitigations: paraphrase drift →
instruction pins bodies VERBATIM except tag-stripping/splitting (no rewording, no completing
truncated text); per-project review diff (original description archived in the snapshot +
`metadata_json.original_line`); idempotent `source_id` per source line; 55 projects = small enough
to eyeball every diff before the description-strip commits.

## Honest framing

The two options differ less in parsing (A's spine is reused by B) than in **judgment calls**:
date-resolving undated tags, entry splitting, dedup, completion-vs-update classification, spam
collapse. Those are exactly the calls an LLM makes well and a regex can't. Recommended shape if B
wins: deterministic parse first (the spine), LLM pass second (boundary fixes + classification +
dedup), human-reviewable per-project diff third, description-strip last.

## Decision status (brainstorm-lite points, updated with Nick's answers 2026-06-10)

1. Legacy activity_log backfill: **OVERRIDDEN — Nick wants it.** Smart-session agent dispatched to
   mine the real data out (report: `2026-06-10-activity-log-backfill-report.md` when it lands).
2. Parser vs LLM: **DECIDED — LLM-on-parse (Nick 2026-06-10: "agreed go LLM using parse").**
   Deterministic `parseDescriptionLog` spine → LLM judgment layer (date-resolve undated tags,
   split glued entries, dedup, completion-vs-update classification; bodies VERBATIM, truncated
   text never completed, spam-collapse flagged not silent) → per-project review diffs for Nick →
   inserts + description-strip only after his diff review.
3. PB writer retarget vs nightly sweep: **RETARGET — Nick confirmed** ("yes retarget for sure
   because i don't want description muddied"). PB-session work: repoint the 4 BrainDB breadcrumb
   sites (query.py:1960, :2001, :2084, :2650) to post activity entries Hub-first instead of
   appending to notes. `descriptionLog.ts` deletes only after that lands + one clean sync cycle.
   Separately, Nick floated a DIFFERENT nightly idea — LLM-tidying his own posted activity
   comments (e.g., a ramble → "moved to xyz project"); assessed as not-needed-now: actionable
   comments are the existing comment→/process + Hermes lane's job (act on them, don't rewrite
   them), and rewriting posted human messages destroys provenance. If wanted later: non-destructive
   derived summary alongside the original, never a rewrite. YAGNI for now.
4. Order P2-A → P2-C → P2-B: **approved.**

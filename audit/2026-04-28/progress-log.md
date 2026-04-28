# Audit Progress Log (append-only)

> **Format**: latest entry on top. Each entry: date, session, findings touched, verification evidence, action, commit. See `VERIFICATION-PROTOCOL.md` § "Verification log format."

---

## 2026-04-28 — Verification sweep across all 12 pages

**Phase**: Verification (no fixes shipped). 12 parallel agents re-checked every P0+P1 finding against current source.

### Headline result

**Almost nothing has been fixed since the audit was generated.** The audit ran 2026-04-28; the verification ran the same day. `git log --since=2026-04-28` against every audited file returns near-empty (only 4 ancillary commits: Pages ExecutionContext fix, calendar batching, docs). No P0+P1 finding has been independently closed by other work.

### Counts

- **Total P0+P1 verified**: 161 findings (across 12 pages)
- **STILL BROKEN, ready to fix immediately (no Nick decision needed)**: ~110 findings
- **NEEDS NICK DECISION before fixing**: ~35 findings (substrate / schema / Hermes / scope choices)
- **AMBIGUOUS / file moved**: 3 findings (M-06, M-16, MI-12) — need more local investigation
- **ALREADY FIXED**: 1 finding (MTG-09 — audit was wrong: search DOES include notes via `SELECT *`)
- **PARTIAL / mixed**: 1 finding (P-06 — CommandPalette half clean, sidebar-avatar half is intentional per Rule 24)

### Per-page verification results

| Page | Agent ID | Total verified | Ready to fix | Needs decision | Already fixed | Ambiguous |
|------|----------|---------------|--------------|----------------|---------------|-----------|
| 01 — TodayPage | `aeac7db106be4f34f` | 19 | 5 | 11 | 0 | 0 (light decision: TP-10, TP-11) |
| 02 — UnifiedMyTasks | `a3d0970fed8c389b5` | 19 | 19 | 0 (architectural Q on TaskDetailPanel composition) | 0 | 0 |
| 03 — ProjectDetail | `a0ec695fe6759b04c` | 18 | 15 | 3 (PD-3, PD-5, PD-6) | 0 | 0 |
| 04 — ProfilePage | `a87b2ccc94a5182ee` | 13 | 12 | 0 (P-06 PARTIAL — half ready, half intentional) | 0 | 1 (P-06) |
| 05 — Lab Overview | `a9a98273c732c8dac` | 10 | 7 | 2 (LO-6, LO-8) | 0 | 0 |
| 06 — Manuscripts | `a9f7ec9a7fb6d5557` | 18 | 15 | 4 (M-03, M-12, M-13, M-14) | 0 | 2 (M-06, M-16) |
| 07 — MyItems/Personal | `a40fe199f954e9bf4` | 24 | 23 | 4 (MI-01, MI-05, MI-06, MI-07) | 0 | 1 (MI-12) |
| 08 — Meetings | `a361368eecde90760` | 9 | 7 | 1 (MTG-01) | 1 (MTG-09) | 0 |
| 09 — SearchPage | `ac91c5e52c1316a9e` | 16 | 16 | 0 | 0 | 0 |
| 10 — AskTheLab | `a833de7b388bd08e3` | 11 | 10 | 1 (ATL-06) | 0 | 0 |
| 11 — CalendarPage | `a89268049d0a136f3` | 7 | 4 | 3 (C-03, C-06, C-07) | 0 | 0 |
| 12 — InsightsPage | `acb2cb6cb85277520` | 10 | 10 | 0 (INS-04, INS-10 carry latent product Q) | 0 | 0 |

### Notable surprises

1. **MTG-09 audit claim was wrong** — search DOES include notes via `SELECT *` from `meetings` (`api/routes/meetings.ts:15-17`). The "silent miss" theory is incorrect. Mark as ALREADY FIXED (or rather: never broken). The performance concern (full notes blob over the wire) is still latent but not P1.

2. **P-06 is two stitched-together claims**. CommandPalette has no `Cmd+K → "Edit my profile"` — that's a clean miss. Sidebar avatar routing to MyItems is INTENTIONAL per Rule 24 footnote ("Nick expected his own working page"). Don't fix the sidebar; do fix CommandPalette.

3. **`useInsightConnections.ts` doesn't exist as a standalone file** — the symbol lives in `useApiData.ts`. Only the audit's metadata header was wrong; no INS finding cites the path, so no impact.

4. **All 12 reports cite line numbers that still match current source.** Audit is FRESH and trustworthy. Verification protocol's "trust nothing" stance was prudent, but in practice almost every citation resolved on first check.

### Decision queue (see `DECISION-QUEUE.md` for the full list)

Nick needs to answer ~12-15 questions before the next batch of fix agents can launch. Most are 1-line decisions. See the dedicated `DECISION-QUEUE.md` file in this directory for the complete list, organized by impact and bundling potential.

### Next session

After Nick answers the decision queue:
1. Dispatch fix agents on STILL BROKEN findings that have decisions resolved
2. Bundle related findings into single PRs (cross-cutting sweeps per `synthesis-plan.md` § "Cross-Cutting Themes")
3. Each PR commit references finding IDs
4. Append per-finding verification log entry as fixes ship

---

<!-- Future entries below this line. Latest on top. -->

## 2026-04-28 (later) — Decision queue walked, all 31 decisions resolved

**Phase**: Decision (no code changed). Walked the full decision queue with Nick via AskUserQuestion in 7 batches.

### Headline result

All ~35 decision-blocked findings unblocked. See `DECISIONS-RESOLVED.md` for full answers + dispatch plan.

### Notable decisions (deviations from my recommendations)

- **D1**: Asker-can-accept-too (Stack Overflow), not PI-only. UI + server both gate on `isPiRequest() OR userSlug === question.asked_by`.
- **D2**: Wire ALL 4 fake-data cards to real APIs (not kill any). Triggers `/api/citations` endpoint build.
- **D4**: Merge MyItems INTO Personal as a tab (not retire Personal).
- **D5**: Move personal cards to Personal page (not Today).
- **D16**: Migrate Today to design tokens fully (not extend hex-pinned palette).
- **D18**: Extend CategoryIcon vocabulary (not lucide stroke icons).
- **D19**: Wire focusMin to existing PB session data (`usePBSessionStats`) — combine, don't drop.
- **D28**: Ship Calendar time-aware NOW (Phase B), not defer to Phase C.
- **D30**: Ship full Insights archive UI + Connections panel now, not deferred.

### New scope created by decisions

1. Schema migrations queued: 5+ (stage_entered_at, lab_questions.tags, commitments.to_slug, meetings.start_time/end_time, possibly regulatory_items.responsible_slug)
2. Server endpoints to build: 4 (`/api/citations`, `/api/meetings/process-transcript`, `/api/manuscripts/submissions`, extend `/api/insights/dashboard?week=`)
3. Major UI rebuilds: 5 (Personal 3-tab layout, Lab Overview wire+prune, Calendar time-aware, Insights feature pass, TodayPage cleanup)
4. Phase A foundations: SmartCompose universal sweep + activity_log emit + token discipline + brand-primitives sweep + CategoryIcon vocabulary

### Next session

Dispatch order recommended in `DECISIONS-RESOLVED.md` § "Dispatch plan." Wave 1 = Bundles A + B + C + D + F (independent, parallel-safe, ~5 agents in parallel). Wave 2 = Bundles E + G. Wave 3+ depends on coordinated schema work.

**Files updated this session**:
- `DECISIONS-RESOLVED.md` (new) — single source of truth for fix phase
- `progress-log.md` (this entry)
- `DECISION-QUEUE.md` — superseded by DECISIONS-RESOLVED.md, kept for reference

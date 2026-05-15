# Hub Workplan — Consolidated 2026-05-15

> Single source of truth for remaining Hub work. Supersedes: audit/synthesis-plan.md
> (Apr 28), codex hub-fix-plan.md (May 5), design-handoff TICKETS.md (Apr 20),
> hub-future-ideas.md feature list. Those files are now historical reference only.
>
> Cross-referenced against 105 commits since Apr 28, progress-log.md, design-handoff
> progress tracking, and current codebase state as of HEAD `548f1a39`.

## Tier 0: Critical / Security (fix before any team adoption push)

- [ ] **SEC-1** — Digest email XSS: task/meeting titles interpolated raw into HTML email. Add `escapeHtml()` wrapper at every `${}` site in `api/routes/digest-email.ts`. (source: codex T3, effort: S)
- [ ] **SEC-2** — Delete `/api/admin/migrate` + `/api/test-cleanup` endpoints: still live at `api/index.ts:869,1216`. Zero production callers; migration SQL lives in versioned files. (source: codex T5, effort: S)
- [ ] **SEC-3** — Upload integrity: `api/routes/uploads.ts` trusts client "done" without R2 HEAD check. Frontend ignores PUT failure. Add R2 existence check + frontend error handling. (source: codex T4, effort: M)
- [ ] **SEC-4** — Timezone hardcoded offsets: `pb-sector.ts:9` (`getUTCHours()-6`) and `digest-email.ts:290` (`getUTCHours()-5`) break during DST transitions. Replace with `Intl.DateTimeFormat('America/Chicago')`. (source: codex T13, effort: S)
- [ ] **SEC-5** — QuickCaptureInbox dedup: mints random UUID per submit, no idempotency key. Double-click/retry creates duplicates. Add deterministic `source_external_id` + `raw_hash`. (source: codex pass-4 #4, effort: M)
- [ ] **SEC-6** — PB capture writes raw `project` string as `tasks.project_id` in `pb-sector.ts:205`. No resolver. Can write garbage FKs. Add project ID resolution before insert. (source: codex pass-4 #3, effort: S)

## Tier 1: Trust & Correctness (fix before broad team use)

### Data integrity

- [ ] **DAT-1** — `day_capacity` mutations use `date` PK: `applyInsert`/`applyDelete` hardcoded to `id` column. Needs `idCol = 'date'` branch. (source: codex T1, effort: S)
- [ ] **DAT-2** — A3 helper covers all ALLOWED_TABLES: `applyMutation` only accepts tasks/projects. `inbox_events`, `day_capacity`, `project_state_log` need handler coverage. (source: codex T6, effort: M)
- [ ] **DAT-3** — `/api/tasks/batch` atomicity: bulk endpoint returns 200 even on partial failure. Should return `{applied:[], failed:[]}`. Extract `deleteTaskById` for cascade consistency. (source: codex T7, effort: M)
- [ ] **DAT-4** — Realtime broadcasts `'all'` instead of `'data'`: realtimeBus channel mismatch means some mutations don't trigger UI refresh. (source: codex T12, effort: S)
- [ ] **DAT-5** — `revisions.ts` writes activity_log without checking `result.changes > 0`. Phantom activity entries on no-op updates. (source: codex T20, effort: S)
- [ ] **DAT-6** — `meetings.ts` notes endpoint returns 200 on missing meeting instead of 404. (source: codex T21, effort: S)
- [ ] **DAT-7** — DecisionsPage tag filter is decorative: `filterTag` state exists but never applies to `filteredDecisions` memo. (source: codex T19, effort: S)
- [ ] **DAT-8** — `regulatory.ts` renew not atomic: multi-statement renewal should use `env.DB.batch()`. Status enum not centralized. (source: codex T18, effort: S)

### Fake / broken data on team-facing surfaces

- [ ] **FAKE-1** — Lab Overview `StatsCard.totalCitations = 2626` hardcoded. PB scholarly cron not yet implemented. Wire real `/api/citations` data or show `—` until cron ships. (source: audit T4/LO-1, effort: S for `—` fallback, L for cron)
- [ ] **FAKE-2** — Hermes "Thinking about this..." literal string: no animation, no timeout, no failure state. Replace with `<HermesPending>` component. (source: audit T3/ATL-03, effort: M)
- [ ] **FAKE-3** — `/api/meetings/process-transcript` doesn't exist. MeetingNotesPage:227 silently 404s. Either build endpoint or remove the button. (source: audit P0-3/MTG-01, effort: M to build, S to hide)
- [x] ~~**FAKE-4** — InsightsPage SQL date bug: fixed in `64352724` (Bundle M, INS-01).~~
- [ ] **FAKE-5** — Manuscripts `daysInStage()` uses `updated_at`, not `last_meaningful_movement`. Any field edit resets the counter. (source: audit T19/codex T9, effort: S)

### Cache / state bugs

- [ ] **STATE-1** — TodayPage `state.done` localStorage doesn't reflect cross-surface status changes. Derive from cache, not LS. (source: audit P0-8/TP-04, effort: M)
- [ ] **STATE-2** — ProfilePage `rawRow` query has no `queryFn` — `invalidateQueries` is no-op after first save. (source: audit P0-9/P-01, effort: S)

### Design handoff leftovers (not yet done)

- [ ] **DH-1** — Post-Award Milestones populated state: table exists at `Grants.tsx:898`, needs Nick to seed `grant_milestones` rows. (source: design P2-14, effort: S once data exists)
- [ ] **DH-2** — PWA manifest for Pulse kiosk (P3-10 lite — skip Watch complication). (source: design P3-10, effort: S)

## Tier 2: UX & Polish (fix during early adoption)

### Cross-cutting sweeps

- [ ] **UX-1** — Brand primitives adoption: `HermesMark` missing on AskTheLab, MeetingDetail, Hermes notifications. `HeartbeatDivider` only on TodayPage. `EmptyStateArt` degraded on several pages. (source: audit T12/A4, effort: M)
- [ ] **UX-2** — Token discipline pass: `#fff` literals (use `--ink-bright`), `--gold-on-emphasis` gaps on 3 surfaces, animation durations not in token system, inline `<style>` blocks on TodayPage. (source: audit T13/A5, effort: M)
- [ ] **UX-3** — Keyboard nav gaps: TodayPage has zero shortcuts (no J/K/D/Space/F). AskTheLab no J/K. SearchPage no `/` focus. (source: audit T16, effort: M)
- [ ] **UX-4** — Standard API error envelope: `fetchApi` expects structured errors but uploads/pi-dashboard/others have ad-hoc shapes. Consolidate to `{error:{code,message}}`. (source: codex T16, effort: L)
- [ ] **UX-5** — Search source isolation: `Promise.all` across 14 tables — one D1 timeout breaks all search. Wrap each in try/catch, surface partial results. (source: codex T17, effort: M)
- [ ] **UX-6** — Create flows close form on failure: CreateDecisionModal, Ideas, AskTheLab, RelayCard all clear/close on mutation error. Keep open + show inline error. (source: codex pass-3 #6, effort: M)
- [ ] **UX-7** — BottomSheet has no focus trap: keyboard can escape behind sheet. Close button is tiny `p-1`. (source: codex pass-3 #2, effort: S)
- [ ] **UX-8** — Mobile sidebar overlay is not a real dialog: no focus trap, no `aria-modal`. (source: codex pass-3 #3, effort: M)
- [ ] **UX-9** — Mobile breakpoint split-brain: `useIsMobile` and `MobileTabBar` use different breakpoints (768 vs 1024). Tablet users get broken nav. (source: codex pass-3 #1, effort: S)

### Page-specific polish

- [ ] **PAGE-1** — TodayPage Tier-2: meeting-notes piggyback (refresh = data loss), CategoryIcon vocabulary on task tags, token migration to design system. (source: audit Bundle K, effort: M)
- [ ] **PAGE-2** — ProfilePage tier-1: field affordance (no `▾`), photo upload via R2, optimistic+undo on saves, calendar feed delete confirm, scholar_id format hint. (source: audit Bundle T, effort: M)
- [ ] **PAGE-3** — AskTheLab: Hermes pending state + realtimeBus subscription + tier-1 polish. (source: audit Bundle Q, effort: M)
- [ ] **PAGE-4** — Calendar tier-1: iCal events on CalendarPage (P0-10), clickable tasks/milestones, view persistence. (source: audit Bundle V, effort: M)
- [ ] **PAGE-5** — Lab Overview tier-2: ActionBoard scope filter, ROLE_DEFAULTS reconcile, TeamPulse+Insights default-on. (source: audit Bundle S, effort: M)
- [ ] **PAGE-6** — Ideas page: Edit button has no handler; archive is hover-only; mobile has no edit/archive controls. (source: codex pass-3 #9, effort: S)
- [ ] **PAGE-7** — MenteeMilestones: mobile cannot change milestone status — no InlineSelect on mobile rows. (source: codex pass-3 #11, effort: S)

## Tier 3: Infrastructure (enablers for future work)

- [ ] **INFRA-1** — `activity_log` emit on shared-field changes: stage, PI, assignee, project rename, meeting cancel, role assignment. Unblocks real Activity tab on ProjectDetail. (source: audit A7/T20/D22, effort: L)
- [ ] **INFRA-2** — Deep health endpoint (`/api/health/deep`): mutation stats, calendar feed errors, R2 orphans, open bug reports, cron status. (source: codex T8, effort: M)
- [ ] **INFRA-3** — realtimeBus wiring sweep: AskTheLab questions (60s poll, no WS), MyItems notifications (30s poll), InsightsPage (5min cache), CalendarPage (15min stale). (source: audit A3/T15, effort: M)
- [ ] **INFRA-4** — Project status normalization: `ProjectDetail.tsx` still writes `'Active'`/`'Completed'`. Meetings.ts filters legacy statuses. Single sweep with `normalizeProjectStatus()`. (source: codex T9 — partially addressed by commits `c4702d59`..`548f1a39` naming sweep; **verify completeness**, effort: S)
- [ ] **INFRA-5** — Schema drift CI hardening: assert exact ordered version list, detect unexpected duplicate prefixes, snapshot hash. (source: codex T11, effort: S)
- [ ] **INFRA-6** — Personal 3-tab merge (Bundle U): merge MyItems INTO Personal as Workspace | Inbox | Cards per D4+D5 decision. Substrate-swap protocol required. (source: audit A8, effort: XL)
- [ ] **INFRA-7** — Surface v55 task workflow fields: `waiting_on`, `promised_to`, `promise_date`, `next_checkin_date`, etc. exist in schema + A3 whitelist but not in `TaskRow` type or UI. (source: codex T14, effort: M)
- [ ] **INFRA-8** — Project staleness adapter: `projects.state`, `next_artifact`, `last_meaningful_movement`, `stale_active_since` dropped at adapter in `rowToProject`. (source: codex T15, effort: M)

## Tier 4: Future / Nice-to-Have (parking lot)

**AI & Intelligence:** AI Research Co-Scientist (#41), Academic Search / PubMed integration (#46), Grant Ecosystem Intelligence / RePORTER deep (#42), Cross-Lab Collaboration / multi-tenant (#60)

**Communication:** Weekly Digest Email (#31), Pre-meeting email prompt (#86), Post-meeting summary email (#87)

**UX depth:** SmartCompose on remaining 2-3 bespoke compose surfaces, Saved views v2 (D1-backed cross-device), FTS5 virtual tables for search, UnifiedMyTasks drag-to-reclassify in Columns/Lanes, Manuscripts Pipeline DnD between stages, Calendar time-aware week view (needs D28 schema), ProjectDetail Activity as merged audit log (needs INFRA-1), Inline editing on UnifiedMyTasks Columns/Lanes views, PersonSearch as 15th entity type, Hermes-augmented search, AskHermes coach (ship or formally cancel from CLAUDE.md)

**PB Sector:** TODAY.md web rendering depth, PB Sector nav visibility (currently hidden per design P2-07)

**Kiosk:** Lab-TV additional data slides, Apple Watch complication (requires native)

## Schema Queue (cross-repo coordination required)

Each needs: decision doc in `~/Peripheral-Brain/Context/Decisions/`, `enums.py` update, `shared-schema-registry.md` update, lockstep brain.db migration + D1 deploy.

| ID | Migration | Unblocks | Status |
|----|-----------|----------|--------|
| D7 | `projects.stage_entered_at` | FAKE-5 (Manuscripts stale math) | Not started |
| D8 | `lab_questions.tags` | AskTheLab tag filters | Not started |
| D9 | `commitments.to_slug` | MyItems commitment tracker | Not started |
| D22 | `activity_log` emit on 6 transitions | INFRA-1, ProjectDetail Activity tab | Not started |
| D28 | `meetings.start_time` + `meetings.end_time` | Calendar time-aware week view | Not started |

## Decisions Needed (Nick must choose)

1. **Hermes pending-state shape:** stub card with pulse + elapsed time, banner above question, or nothing until response? (blocks FAKE-2)
2. **Transcript pipeline:** build Hermes-via-ai-requests async, or formally kill the button? Audio support too? (blocks FAKE-3)
3. **Lab Overview audience:** PI-only after Rule 57 enforcement, or everyone with lab-wide cards? (blocks PAGE-5)
4. **Citations cron:** implement PB scholarly weekly cron per `scripts/citations-scholar-stub.md`, or show `—` indefinitely? (blocks FAKE-1)
5. **AskHermes coach:** ship (M effort) or formally cancel + remove from CLAUDE.md? (parking lot)
6. **iCal events privacy:** personal calendar events visible to team on CalendarPage, or user-only? (blocks PAGE-4)

## Effort Summary

| Tier | Items | S | M | L | XL |
|------|-------|---|---|---|-----|
| T0 Critical | 6 | 3 | 3 | 0 | 0 |
| T1 Trust | 15 | 8 | 5 | 1 | 0 |
| T2 UX | 16 | 4 | 10 | 1 | 0 |
| T3 Infra | 8 | 2 | 4 | 1 | 1 |
| **Total actionable** | **45** | 17 | 22 | 3 | 1 |

Estimated total: ~3-4 weeks focused work for T0+T1. T2+T3 over 4-6 weeks during adoption.

## Sources Retired

This file consolidates and supersedes:

- `audit/2026-04-28/synthesis-plan.md` — 20 cross-cutting themes + P0-P0-12 + Phase A/B/C roadmap (Apr 28). ~100 of 161 findings already closed by waves 1-4.
- `~/Peripheral-Brain/Scratch/plans/2026-05-05-hub-fix-plan.md` — Codex review T1-T22 + T23-T32 + 14 deferred (May 5). Some items landed in the A3/naming refactor commits.
- `docs/design-handoff-2026-04-20/TICKETS.md` — 33 tickets. 31 of 33 done per progress tracking (P2-14 needs data, P3-10 skipped).
- `~/Peripheral-Brain/Projects/mn-ccore-lab-hub/hub-future-ideas.md` — 88 features. 57 built. 31 not-built, of which ~4 are genuine future ideas (AI, multi-tenant) and the rest are subsumed by audit/codex items above.
- `SESSION-HANDOFF.md` Wave 5 bundles (Q/T/U/V/K/S) — absorbed into Tier 2-3 items above.
- Codex decision docs (pass 1-4) at `~/Peripheral-Brain/Context/Decisions/2026-05-05-codex-hub-review*.md` — findings folded into appropriate tiers.

# Decision Queue — Nick must answer before next fix batch

**Generated**: 2026-04-28 from 12 parallel verification agents.
**Status**: ~110 P0/P1 findings ready to fix immediately. ~35 findings BLOCKED on these decisions.

---

## How to use this doc

Walk top-down. Each section bundles findings that share a decision. Answer in 1-2 sentences. Once a section is answered, the listed findings unblock and can be batched into fix agents.

**Format**: each row is `[finding-id]: question | recommendation | findings unblocked`.

---

## 🔴 P0 — answer first (security, data integrity)

### D1 — AskTheLab accept-answer auth (ATL-01 + ATL-02)
**Question**: Server-side `POST /api/answers/:id/accept` has zero authorization. UI gates on dead `'ningraha'` slug. Two fixes, two questions:

1. Server gate: PI-only? Or asker-can-accept-too (Stack Overflow model)?
2. UI gate: `useAuth().isPi` (recommended) or `userSlug === 'nick-ingraham'`?

**My recommendation**: PI-only on server. UI gates on `useAuth().isPi`. Asker-acceptance can be a Phase B add-on.

**Unblocks**: ATL-01, ATL-02 (P0 security).

**Your answer**:

---

### D2 — Lab Overview hardcoded fake data — kill or wire? (LO-1 + LO-2 + LO-3 + LO-4)
**Question**: Four cards ship with hardcoded fixtures: `totalCitations = 2626`, fake R01/K23 deadlines, hardcoded grant timelines, "CLIF Consortium expanding" copy. For each: kill the card OR wire to real API?

- **LO-1 StatsCard.totalCitations**: kill or add a `/api/citations` endpoint?
- **LO-2 UpcomingCard fake deadlines**: kill list (keep next-meeting block) or wire to `useDeadlines()`?
- **LO-3 GrantTimelineCard**: trivial wire — `useGrants()` already fetched, just render from real data instead of array. Just confirm: ship?
- **LO-4 ActivityFeedCard**: `/api/activity` exists per CLAUDE.md. Confirm wire-to-real?

**My recommendation**: LO-1 kill. LO-2 kill list, keep next-meeting block. LO-3 wire (cheapest). LO-4 wire.

**Unblocks**: LO-1, LO-2, LO-3, LO-4.

**Your answer**:

---

### D3 — `/api/meetings/process-transcript` — build or kill? (MTG-01)
**Question**: Endpoint doesn't exist. Modal silently 404s. Two paths:

1. **Build via Hermes**: route through `ai_requests` queue → home laptop processes (~30s async). Matches Hermes pattern. M effort.
2. **Build via Workers AI**: synchronous Anthropic call from CF Worker. Faster (~5s). Burns Workers CPU.
3. **Kill modal**: replace with paste-to-notes pass-through. S effort.

**My recommendation**: Path 1 (Hermes-async). Matches existing infra. Cost is identical.

**Unblocks**: MTG-01.

**Your answer**:

---

## 🟠 Page-identity / substrate decisions

### D4 — Retire `/portal/personal`? (MI-05 → cascades to MI-06, MI-19, MI-20, MI-21, LO-6)
**Question**: Personal page duplicates Today (TodayHero), UnifiedMyTasks (MyTasksColumn), Dashboard (QuickStats). 70% redundant. Three options:

- **A**: Retire entirely. Redirect `/portal/personal` → `/portal/dashboard`. Distribute irreducible bits (RecentActivity → Today rail, Onboarding → toast, Regulatory → Lab Overview PI-only, RoleSelector → Settings). MyItems renamed to "Inbox."
- **B**: Keep page, prune duplicates only. Drop TodayHero + MyTasksColumn + QuickStats. Keep RecentActivity + Onboarding + Regulatory + RoleSelector + QuickCapture.
- **C**: Merge MyItems INTO Personal as a tab.

**My recommendation**: **A**. Cuts 1163 lines, no feature loss. Substrate-swap protocol applies (CLAUDE.md "Before Disabling / Retiring"); 24h dogfood window before declaring done.

**Unblocks**: MI-05, MI-06, MI-19, MI-20, MI-21, LO-6.

**Your answer**:

---

### D5 — Lab Overview Rule-57 sweep (LO-6, LO-8)
**Question**: Lab Overview default cards include 6 personal cards (your-week, quick-wins, proactive-brief, my-items, email-drafts, pomodoro-stats) — Rule 57 violation. Plus header has 6 bands of chrome.

- **LO-6**: Which personal cards move to Today vs delete entirely? (Depends on D4.)
- **LO-8**: Drop StatusLine OR YourWeek (the redundant pair)? Keep the 4-tab IA or drop tabs in favor of Customize alone?

**My recommendation**: D4=A means YourWeek/QuickWins/ProactiveBrief/MyItems/EmailDrafts/Pomodoro all leave Lab Overview entirely (Today already has them). Drop StatusLine (redundant w/ LabHealthScore). Drop the 4 tabs (Customize alone is enough).

**Unblocks**: LO-6, LO-8.

**Your answer**:

---

### D6 — MyItems → Inbox rename? (MI-01)
**Question**: Page is functionally an inbox (notifications + commitments + meeting actions), not a "workspace." Rename `/portal/my-items` → `/portal/inbox` with redirect shim?

**My recommendation**: Yes. "Inbox" sets the right expectation. Sidebar avatar still routes there per Rule 24.

**Unblocks**: MI-01.

**Your answer**:

---

## 🟡 Schema / cross-repo decisions

### D7 — `projects.stage_entered_at` column? (M-03)
**Question**: Manuscripts `daysInStage` uses `updated_at` — any field edit resets the stalled metric. Real fix needs `stage_entered_at` column + brain.db cross-repo coordination per Rule R10.

Options:
- **A**: Schema bump + cross-repo coordination. M-effort, durable fix.
- **B**: Compute from `activity_log` retroactively. Larger query, no schema change. But Activity log doesn't currently emit stage changes for projects (see PD-3).
- **C**: Defer. Mark as known-limitation in CLAUDE.md.

**My recommendation**: **A** if shipping PD-3 (audit log emit) anyway — write `stage_entered_at` from the new activity_log emit on stage change. One coordinated PR per repo.

**Unblocks**: M-03.

**Your answer**:

---

### D8 — Tags on `lab_questions`? (ATL-06)
**Question**: AskTheLab questions have no tags/categories. Filter is binary (Open/Resolved). Two sub-decisions:

1. Add `tags TEXT` column?
2. If yes — free-form folksonomy or curated taxonomy (statistics / methods / data-access / writing / clinical / process / general)?

**My recommendation**: Yes, curated 7-tag taxonomy. Curated keeps the corpus searchable + Hermes can use them for routing. Free-form fragments after 6 months.

**Unblocks**: ATL-06.

**Your answer**:

---

### D9 — `commitments.to_slug` column? (MI-07, MI-13)
**Question**: Commitments lookup currently does `getPersonInfo(item.to_whom.split(' ').pop()?.toLowerCase())` — fragile last-name parse, breaks for "Sarah" or "Nate Mesfin." Fix needs proper slug column.

- **A**: Add `to_slug` column. Cross-repo (verify if brain.db mirrors).
- **B**: Implement name→slug fallback util (no schema change). Brittle.

**My recommendation**: **A**. Cheap migration, fixes a real correctness bug.

**Unblocks**: MI-07, MI-13.

**Your answer**:

---

### D10 — Regulatory user-scoping (MI-06)
**Question**: Personal regulatory strip shows lab-wide items to non-PI users. Need to filter by user.

- **A**: `regulatory_items` already has `responsible_slug` (or analogous) — just filter the hook.
- **B**: No such column exists — gate the entire strip to PI role only via `useUserRole`.

**My recommendation**: Audit schema first. If column exists, filter (audit-recommended). If not, PI-gate it (D4=A puts it on Lab Overview anyway).

**Unblocks**: MI-06.

**Your answer**:

---

## 🟢 Today page mental-model decisions (TP-01, TP-04, TP-05, TP-07, TP-09, TP-13, TP-14, TP-15, TP-16, TP-17, TP-19)

These are the productivity-relevant choices. Most are single-line decisions.

### D11 — TP-01 morning-thought routing
**Question**: Bare `<input>` is non-functional. How should it route input?

- **A**: Prefix-routed (`@hermes ...` / `note: ...` / default = `task: ...`)
- **B**: Explicit toggle (3 buttons: Hermes / Note / Task)
- **Time-aware swap?**: After 5pm, prompt swaps to "Plan tomorrow's first move…"?
- **Default action**: task or daily-log?

**My recommendation**: A (prefix-routed). Time-aware after 5pm. Default = task.

**Your answer**:

---

### D12 — TP-04 + TP-06: state.done architecture
**Question**: TodayPage's `state.done` localStorage doesn't reflect completions from MyTasks/Panel. Two paths:

- **A**: Drop `state.done` from persisted shape. Derive from React Query cache (`tasks.find(t => t.id === id)?.completed === 1`). Simplest, single source of truth.
- **B**: Keep dual sources, reconcile via cache subscriber.

**My recommendation**: **A**. Simpler.

**Unblocks**: TP-04, TP-06.

**Your answer**:

---

### D13 — TP-05 meeting-notes persistence
**Question**: Currently component state, refresh = data loss. Where to persist?

- **A**: New D1 table `meeting_quick_notes`. Cross-repo coordination.
- **B**: Piggyback `task_updates` w/ `entity_type='meeting'`. Reuses existing schema.
- **C**: localStorage in `today_state_${day}`. Quickest, no durability across devices.

**My recommendation**: **B** (piggyback task_updates). Reuses infra, durable, no new schema.

**Unblocks**: TP-05.

**Your answer**:

---

### D14 — TP-07 mobile rail order
**Question**: Right rail (Hermes/Attention/Projects/Pulse) currently stacks BELOW the task list on mobile. Recommendation reverses this so Hermes/Attention are above the fold.

**My recommendation**: Rail above task list on mobile.

**Unblocks**: TP-07.

**Your answer**:

---

### D15 — TP-09 Timeline now-line scope
**Question**: Add minimal 1px now-line (S effort) or full proportional time-blocks rebuild (M-L effort)?

**My recommendation**: Phase B Tier 1 = ship the 1px now-line. Phase C = revisit proportional blocks if Calendar gets time-aware (D17).

**Unblocks**: TP-09.

**Your answer**:

---

### D16 — TP-13 token sweep scope
**Question**: TodayPage has a deliberately hex-pinned palette (5 ACCENT constants in `constants.ts`). Hardcoded `#fff` litters the page. Two paths:

- **A**: Extend hex-pinned palette to ALL Today colors (PAGE_BG / PANEL_BG / INK*). Treat the tree as Pulse-Kiosk-style.
- **B**: Migrate `#fff` → `var(--ink-bright)` and `rgba(...)` → `--surface-*` tokens. Stay closer to design system.

**My recommendation**: **A**. The page already commits to the pattern. Cleanup just means consistency, not migration.

**Unblocks**: TP-13.

**Your answer**:

---

### D17 — TP-14 "Hermes Suggests" — rename or wire?
**Question**: HermesSuggestsCard is heuristic JS pretending to be AI. Rename to "Today's Focus" + drop sparkle (S), OR wire 1×/day cached `ai_request` (M)?

**My recommendation**: Rename now (S, ships today). Wire later in Phase A Hermes maturity pass.

**Unblocks**: TP-14.

**Your answer**:

---

### D18 — TP-15 emoji vs lucide vs CategoryIcon
**Question**: Today has `🔴 🕰 📌 📅 ✓` (PillStrip), `🎯 ✅ ⚡ 🧠 🔧` (group meta), `🧠 🔧 🔬 🎓 🫁 💰 📄 📅 📝` (task tags). 9-emoji vocab exceeds CategoryIcon's 4 (lungs/flask/heartbeat/cap).

- **A**: Extend CategoryIcon vocabulary (manuscript / grant / meeting / etc.)
- **B**: Use lucide stroke icons inline
- **C**: Accept emoji as established Today voice (no fix)

**My recommendation**: **B** (lucide). Cross-OS consistency. CategoryIcon stays for project-category indicators only.

**Unblocks**: TP-15.

**Your answer**:

---

### D19 — TP-16 focusMin tile
**Question**: `plannedIds × 30` is meaningless. Drop tile (S) or wire real Pomodoro (M+)?

**My recommendation**: Drop tile. Phase C considers Pomodoro feature.

**Unblocks**: TP-16.

**Your answer**:

---

### D20 — TP-17 Lab Health tile
**Question**: Linear formula no floor — 25 overdue → 0/100. Three options:

- **A**: Drop tile (no on-page legend explains "73")
- **B**: Log/sigmoid scaling
- **C**: Keep linear + add tooltip explaining formula

**My recommendation**: **B** (sigmoid) + tooltip. Tile is genuinely useful as a lab-health summary; the formula just needs to behave sanely past 25 overdue.

**Unblocks**: TP-17.

**Your answer**:

---

### D21 — TP-19 ProjectsCard "relevant today" heuristic
**Question**: Currently lists ALL active projects (71+). Audit recommends "relevant today" filter. What signals?

- **A**: Projects with tasks due today/overdue
- **B**: Projects with planned-today tasks
- **C**: Projects with last-7d activity
- **D**: All of the above + show-all toggle

**My recommendation**: **D** (intersection of all signals OR show-all toggle).

**Unblocks**: TP-19.

**Your answer**:

---

## 🔵 Other architectural / scope decisions

### D22 — PD-3 Activity tab as audit log? (PD-3, M-03 also depends)
**Question**: ProjectDetail Activity tab currently duplicates Notes/Comments feeds. Should it become a real audit log (every state change attributed to a person)? That requires `activity_log` emit on stage changes / PI changes / status changes / assignments.

**My recommendation**: Yes. Emit on the 6 transitions (stage / PI / status / assignee / project rename / meeting cancel). Single coordinated PR, unblocks PD-3, M-03, and longer-term query patterns.

**Unblocks**: PD-3, M-03 (partially).

**Your answer**:

---

### D23 — PD-5 Tasks tab → TaskGridView?
**Question**: ProjectDetail Tasks tab uses card-stack (Rule 17 violation). Reuse `<TaskGridView>` filtered by project?

**My recommendation**: Yes. Cuts ~80 lines, gives users column-resize + inline-edit + multi-select + saved-views.

**Unblocks**: PD-5.

**Your answer**:

---

### D24 — PD-6 + cross-cutting SmartCompose sweep
**Question**: SmartCompose adoption needed at: ProjectDetail Overview compose, Notes feed, Comments feed, MeetingDetail action items, MeetingDetail notes, AskTheLab composer + answer, TodayPage morning-thought + Right Now chat. Bundle into one Phase A foundations PR or split per surface?

**My recommendation**: Bundle. Ship as single PR labeled "Phase A: SmartCompose universal." 12+ sites, but each is mechanical. Easier review than 8 small PRs.

**Unblocks**: PD-6, MTG-02, MTG-03, ATL-05, TP-01, TP-02 (and other latent surfaces).

**Your answer**:

---

### D25 — M-12 Active Submissions widget placement
**Question**: Phase 25 spec called for a manuscript Active Submissions widget. Where?

- **A**: New widget at top of Manuscripts list view, scoped to last-30d events
- **B**: 4th subgroup inside NeedsAttentionDashboard

**My recommendation**: **A**. NeedsAttention is for stalled work; submissions are progress signals. Different mental models.

**Unblocks**: M-12.

**Your answer**:

---

### D26 — M-13 Pipeline drag-and-drop
**Question**: Manuscripts Pipeline view is read-only. Add drag-and-drop between stages?

**My recommendation**: Yes. `@dnd-kit` already in lockfile. Pipeline becomes a real kanban.

**Unblocks**: M-13.

**Your answer**:

---

### D27 — M-14 PI filter dynamic
**Question**: Manuscripts PI filter hardcoded to Nick + Nate. Derive from data?

**My recommendation**: Yes. Derive from `[...new Set(projects.map(p => p.pi).filter(Boolean))]`.

**Unblocks**: M-14.

**Your answer**:

---

### D28 — C-03 / C-06 Calendar time-aware?
**Question**: CalendarPage is date-only. Make it time-aware (1-2 day rebuild + `meetings.start_time/end_time` schema)?

**My recommendation**: Defer to Phase B Tier 2. Lab uses Google/Outlook for time-of-day already; Calendar can stay deadline-focused. Revisit if iCal merge (C-01) reveals demand.

**Unblocks**: C-03, C-06.

**Your answer**:

---

### D29 — C-07 "+ New" button on Calendar
**Question**: Add "+ New" on CalendarPage? If so, creates meeting / task / chooser?

**My recommendation**: Chooser (Meeting / Task / Deadline). Matches TodayPage's compose-anywhere pattern.

**Unblocks**: C-07.

**Your answer**:

---

### D30 — INS-04 + INS-10 Insights scope
**Question**:

- **INS-04**: Wire `?week=` param now (XS) AND ship the past-week archive UI now (M)? Or just the param + defer archive UI?
- **INS-10**: Connections panel placement: between funnel + scatter on InsightsPage, or its own `/portal/insights/connections` sub-route?

**My recommendation**: INS-04 = wire param now, defer archive UI. INS-10 = same page, between funnel + scatter (audit-recommended).

**Unblocks**: INS-04, INS-10 final placement.

**Your answer**:

---

### D31 — MI-23 RoleSelector
**Question**: RoleSelector visible in dev shows for everyone. "Preview mode" banner OR move to Settings?

**My recommendation**: Move to Settings → Lab tab. Low-frequency action.

**Unblocks**: MI-23.

**Your answer**:

---

## After answering: dispatch fix agents

Once decisions are in:
1. Each decision unblocks N findings.
2. Group findings into PRs per `synthesis-plan.md` § "Cross-Cutting Themes" (T1-T20).
3. Dispatch fix agents per PR. Each writes commits referencing finding IDs.
4. Post-fix: append per-finding entry to `progress-log.md`.

Recommended PR bundles (after decisions):
- **PR A — P0 Security**: ATL-01, ATL-02 (after D1)
- **PR B — Lab Overview lies**: LO-1, LO-2, LO-3, LO-4 (after D2)
- **PR C — Phase A SmartCompose universal**: PD-6, MTG-02, MTG-03, ATL-05, TP-01, TP-02 (after D11, D24)
- **PR D — Phase A Brand-primitives sweep**: PD-8, M-15, ATL-09, ATL-11, INS-07, MI-08 + others
- **PR E — Phase A Token discipline**: PD-9, ATL-07, MI-08, M-04, M-06 + others (after D16)
- **PR F — UnifiedMyTasks foundation rebuild**: MT-01-MT-19 (single big PR, replace TaskDrawer with TaskDetailPanel composition)
- **PR G — InsightsPage wire-up**: INS-01 through INS-10 (after D30)
- **PR H — SearchPage feature pass**: S-01 through S-16 (cohesive feature set)
- ... etc.

Ready to dispatch on your call.

# MN-CCORE Hub — Multi-Agent Audit (2026-04-28) → Persistent Workplan

> **Read this file FIRST every session that touches the Hub.**
>
> This directory holds 12 deep page audits + a synthesized plan. Every Hub session should pick up work HERE, in priority order, until the audit is closed.

> **🪙 TOKEN HYGIENE (2026-05-03):** Use `findings-index.md` as the entrypoint for finding ID + file:line. Each raw report under `reports/` is 30-44 KB. **Do not Read all 12 reports.** Only open a raw report when prose context (decision rationale, screenshots, multi-finding clusters) is needed. The findings-index already lists every finding with file:line citations.

---

## 🛑 STOP. Before you do ANYTHING in this audit, read in this order:

1. This README (you're reading it)
2. `VERIFICATION-PROTOCOL.md` — **MANDATORY** before fixing any finding
3. `synthesis-plan.md` — the prioritized plan (P0 batch → Phase A → B → C)
4. `progress-log.md` — what previous sessions did (append-only)
5. `findings-index.md` — quick lookup of every finding by ID + file:line
6. The raw report under `reports/NN-page.md` **ONLY** if findings-index doesn't give you enough context (rare)

**If you skip step 2, you will fix things that are already fixed, or fix the wrong thing because the source has shifted. Do not skip step 2.**

---

## How to use this directory (idiot-proof workflow)

### Session-start sequence

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Read SESSION-HANDOFF.md (top of repo)                             │
│ 2. Read this README                                                   │
│ 3. Read progress-log.md to see what's been touched                   │
│ 4. Open synthesis-plan.md, find next unchecked item by priority      │
│ 5. Look up the finding ID in findings-index.md (file:line is there)   │
│    Only open reports/NN-pagename.md if prose context is needed        │
│ 6. RUN VERIFICATION PROTOCOL (from VERIFICATION-PROTOCOL.md)          │
│    ├─ If verified-still-broken → fix it (carefully)                   │
│    ├─ If verified-already-fixed → mark it in progress-log + plan     │
│    └─ If ambiguous → ASK NICK. Do not guess.                          │
│ 7. After fix: append entry to progress-log.md                         │
│ 8. Commit + reference the finding ID in commit message                │
└──────────────────────────────────────────────────────────────────────┘
```

### When in doubt, ASK

The audit was generated 2026-04-28. The codebase changes daily. **Trust nothing in the reports without verifying first.** Some findings may be:

- ✅ Already fixed by a different commit
- 🔄 Partially fixed (some sites swept, others missed)
- ❌ Misattributed (agent looked at wrong file)
- 🆕 Made worse by intervening changes
- 🟢 Still 100% true and ready to fix

You cannot tell which without verifying. **Verify first, fix second.**

When verification is unclear, **ask Nick directly** in chat. Specifically ask when:

- The finding cites a file:line that no longer matches
- Two reports contradict each other on a finding
- The fix would touch shared infrastructure (auth, schema, sync)
- The fix would delete a feature
- The fix is a "Phase A foundations" cross-cutting sweep (12+ sites at once)
- The finding is a P0 security or auth issue
- An open question from `synthesis-plan.md` § "Top Open Questions for Nick" is relevant
- You're about to make a substrate swap or feature-flag flip (CLAUDE.md "Before Disabling / Retiring" rule)

---

## Priority order

Work findings in this order. Each phase is in `synthesis-plan.md`.

| Order | Phase | What | Estimate |
|-------|-------|------|----------|
| 1 | **P0 batch** | 12 ship-blockers (auth bugs, hardcoded fake data, decorative compose, broken endpoints) | 1.5 weeks |
| 2 | **Phase A — Foundations** | Cross-cutting sweeps that unblock Phase B | 2 weeks |
| 3 | **Phase B — Tier 1** | Page-specific high-leverage moves | 3-4 weeks |
| 4 | **Phase C — Tier 2** | Polish, depth, edge cases | 3-4 weeks |

**Within each phase**: do P0/P1 (High severity) before P2/P3. Within same severity, prefer items with smaller blast radius and easier verification first to build session momentum.

---

## Directory map

```
audit/2026-04-28/
├── README.md                       ← you are here (entry point)
├── VERIFICATION-PROTOCOL.md        ← mandatory before any fix
├── synthesis-plan.md               ← prioritized plan with P0/A/B/C phases
├── progress-log.md                 ← append-only session log
├── findings-index.md               ← quick lookup: finding ID → file:line + report
└── reports/
    ├── 01-today-page.md            ← /portal/dashboard (Phase 38 operating-day)
    ├── 02-unified-my-tasks.md      ← /portal/my-tasks (Phase 38, 3 views)
    ├── 03-project-detail.md        ← /portal/projects/:slug (8 tabs)
    ├── 04-profile-page.md          ← /portal/profile (Phase 39, brand new)
    ├── 05-lab-overview.md          ← /portal/overview (was /dashboard pre-Phase 38)
    ├── 06-manuscripts.md           ← /portal/manuscripts (T-29 dashboard)
    ├── 07-my-items-personal.md     ← /portal/my-items + /portal/personal
    ├── 08-meetings.md              ← Meetings list / detail / prep / notes
    ├── 09-search-page.md           ← /portal/search (14 entity types)
    ├── 10-ask-the-lab.md           ← /portal/ask-the-lab (Hermes Q&A)
    ├── 11-calendar-page.md         ← /portal/calendar
    └── 12-insights-page.md         ← /portal/insights (newest, brief 2026-04-26)
```

---

## When you finish a finding

Append to `progress-log.md` like this:

```markdown
## 2026-MM-DD — <session>

### TP-12 — TaskRow due-date / priority cells (P1)
- **Verification**: ran `/portal/dashboard` in browser — confirmed rows missing due-date + priority cells. Source matches report at `TaskRow.tsx:30`. Still reproducible.
- **Action**: added tabular-nums due cell + 4px priority dot. Commit `abc1234`.
- **Notes**: discovered priority dot needed contrast bump in dark mode; fixed inline.
```

Or:

```markdown
### M-04 — Two parallel staleness models (P1)
- **Verification**: grep'd `STALLED_THRESHOLD_DAYS` — already removed in commit `def5678` (2026-05-02). Now uses `useLabPrefs().manuscriptsStaleDays`.
- **Status**: ALREADY FIXED. No action needed.
```

Or:

```markdown
### PD-3 — Activity tab as audit log (High)
- **Verification**: confirmed Activity tab renders duplicate ProjectUpdateFeed + ProjectComments per `ProjectActivity.tsx:59`.
- **Blocker**: requires `activity_log` emit on stage/PI/assignee changes (Phase A item A7). Not yet shipped.
- **Status**: BLOCKED on A7. Asked Nick (chat 2026-05-04) — confirmed A7 should ship first.
```

---

## What this audit is NOT

- **Not an exhaustive bug list.** 12 surfaces audited; ~15 other portal pages not covered. Add findings as you discover them, but don't pretend the audit covers every page.
- **Not a freeze.** Nick may ship features in parallel. Coordinate via SESSION-HANDOFF.md. The audit is a steady backlog, not a hold-everything-else mandate.
- **Not infallible.** Each agent saw a snapshot of one page. Cross-page interactions, race conditions, and recently-shipped features may not be captured. Treat as informed prior, not ground truth.

---

## Connection to existing Hub workflow

- **CLAUDE.md** still applies — all rules, ethos, gotchas remain authoritative
- **SESSION-HANDOFF.md** — top section flags AUDIT MODE if Nick wants the next session to work the audit
- **PB project folder** at `~/Peripheral-Brain/Projects/mn-ccore-lab-hub/plans/2026-04-28-multi-agent-audit-synthesis.md` mirrors `synthesis-plan.md` here; PB version is for cross-machine reference, this version is canonical
- **Resumable agents**: each report has an `agentId` at bottom. SendMessage to drill deeper without re-spawning a full audit.

---

## TL;DR for the impatient session

1. `cat VERIFICATION-PROTOCOL.md`
2. `cat synthesis-plan.md` → find next P0/P1 unchecked
3. `cat reports/NN-page.md` → get raw context
4. **VERIFY** (don't trust report blindly)
5. Fix or escalate or move on
6. `vim progress-log.md` → append entry
7. Commit referencing finding ID

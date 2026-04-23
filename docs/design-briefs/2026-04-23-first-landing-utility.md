# Design Brief — First-Landing Utility (Round 3, re-packaged)

**Date:** 2026-04-23 (updated evening after 5 ship rounds)
**Scope:** Whole-Hub audit after a full day of first-landing + Airtable+Slack fixes shipped
**Deliverable:** Ticket list (15-30 tickets), not Figma mocks
**Current deploy:** `d76a60a0.mn-ccore-lab.pages.dev` (aliased to `mn-ccore-lab.pages.dev`)
**Screenshots:** `review/post-track-a-2026-04-23/` (41 desktop + 6 mobile)

---

## The original complaints (still the grounding problem)

PI Nick Ingraham filed 3 bug reports 2026-04-23 morning, same theme — **landing pages don't surface what he needs before he has to scroll**.

**GH #27** (/portal/projects/:slug):
> "i see minimal useful information when i first hit the project page. i just need to know maybe the last 2-3 things that happened for this. I want to see tasks related to it and i want to make comment or notes. i would have to scroll WAY down to see any of that."

**GH #29** (description rendering + link position):
> "if these were appropriately on new lines it would be a little better i think. Also key links need to be when i first land on the page."

**GH #33** (/portal/my-tasks):
> "I can see three tasks with limited detail in the focus mask. Then the overdue ones, there is a bunch of blank space below it, and I can't quickly see other stuff that might be due today."

**+ 2 follow-up steers through the day:**
- "tasks are likely the most relevant to a project for DOING along with leaving a comment or note or clicking a LINK. Timeline is a nice visual but I can't interact with it — big waste of space."
- "my hope is that we are building a hybrid of productivity that has the features of Airtable and Slack all in one but is made specifically for our system and even goes beyond!"

---

## What has shipped today (2026-04-23, 5 deploy rounds)

**Round 1 — Tier-1 fixes + Track A first-landing hoists (HEAD `461a5d3`):**
- #26 Added "Revisions" project-stage between Submitted and Accepted (cross-repo with brain.db; blue-purple `#5b4fa8`).
- #31 PI name consistency — `displayName(slug, tier)` replaces ad-hoc `.split(' ')` everywhere. K23 IHCA data fix (pi `nick`→`nate-mesfin`, category `nate`→`lab`).
- #30 Notes/Comments vocab — ProjectDetail tabs restructured to match TaskDetailPanel. "Project Updates" renamed "Notes" across UI.
- #32 CreateTaskModal default assignee = current user; `InlineAssigneePicker` with typeahead replaces plain `<select>`.
- #33 MyTasks TodayHero — new 2-column block (Overdue | Due Today) above Focus Next.

**Round 2 — Overview refocus (PI feedback mid-day):**
- Project Timeline **deleted** (157 lines) — non-interactive vertical wall Nick said was waste.
- OverviewLandingCard restructured to 2-col: Left 2/3 = Open Tasks (always visible with `+ Add task`), Right 1/3 = Key Links + Recent Activity stacked, Bottom full-width = Quick compose.
- `+ Add task` button on landing card opens CreateTaskModal pre-filled with this project.
- Description renders `whiteSpace: pre-wrap` so line breaks survive.

**Round 3 — #12 + #11 + #10 polish:**
- Description auto-linkify — URLs in project description render as classified chips (`classifyUrl` from shared `urlClassify.ts`; Folder icon for Box paths, Play for .bat, ExternalLink for http).
- Work-on single-click — project pill on every task row is now a `<Link>` to the project. Uses `projectMap` for actual title (not slug regex).
- Plain `<select>` sweep — CreateProjectModal + CreateDecisionModal migrated to `InlineSelect` / `InlineAssigneePicker`. CreateProjectModal STAGES include Revisions; CATEGORIES trimmed to 4 canonical values.

**Round 4 — Legacy slug root-cause fix (root not bandaid):**
- brain.db `sync/hub_payload.py` now canonicalizes assignee via `canonicalize_team_slug()` on outbound push. New `TEAM_SLUG_ALIASES` in enums.py (`nick→nick-ingraham`, `nate→nate-mesfin`).
- brain.db migration: 532 tasks `assignee='nick'` → `nick-ingraham`.
- Reverted the Hub-side `canonicalSlug()` bandaid I'd written earlier — root is fixed in write-path, no read-side fallback needed (per Nick's "don't mask the problem").

**Round 5 — #13 + #14 + #15 (Slack-parity final):**
- Unified search extended from 6 → **14 entity types**. New: notes (project_updates), task notes (task_updates), task comments, decisions, files, action items, publications, grants. Return cap 20→50. Completed action-items scored -2. Search return type config in SearchPage extended with icons per type.
- Files tab added to ProjectDetail (8 tabs total). `FileUpload` reused at `entity_type='project'`. Drag-drop R2 upload + delete.
- Live presence — new `usePresence(entityType, entityId)` hook broadcasts 15s pings on hub-realtime WS room; tracks peers locally; 45s staleness. `<PresenceAvatars>` avatar stack w/ green dot + "N viewing" count. Wired into ProjectDetail header next to WatchButton.

---

## Underlying vision (non-negotiable)

The Hub is **not** a task tracker. It's a **hybrid of Airtable + Slack**, custom-built for MN-CCORE.

**Airtable pillars** (carry): structured data, inline editing, multi-view same-table, linked records, derived fields, pill typeahead + Enter commit.

**Slack pillars** (carry): per-entity thread, @mentions, reactions, file sharing inline, unified search, keyboard-first, smart notifications, presence signals.

**Beyond both** (MN-CCORE-specific): TODAY.md single-surface morning triage, research-workflow-aware (manuscripts, revisions, mentees, grants), bidirectional CLI+Web sync (brain.db ↔ D1), Hermes `@hermes` AI assistant ambient, PI dashboards.

When evaluating any ticket, ask: "What's the Airtable analogue? What's the Slack analogue? What's the MN-CCORE extension?"

---

## 9 guardrails (Nick's design philosophy verbatim, distilled)

1. **Landing pages must be immediately actionable.** No hunting.
2. **Comments/notes live on the landing surface.** No modal, no nav.
3. **Links must MAKE SENSE + be INTUITIVE.** No raw URLs. Use `classifyUrl` pattern.
4. **Pills should be type-and-filterable everywhere + Enter to commit.** Plain `<select>` is unacceptable.
5. **Short dropdowns with click-to-change** (but typing also works) — Airtable pattern.
6. **"Work-on" single-click action** — TODAY.md pattern. One click → in the project.
7. **Scroll + click must pay off.** Never nav somewhere that requires ANOTHER click to do the thing.
8. **Dynamic, not error-prone.** Deterministic, optimistic UI, undo toast.
9. **Clean but useful everywhere.** Don't sacrifice utility for aesthetics; don't sacrifice aesthetics for density.

---

## What to look for (the ask)

**Priority 1 — Validate what shipped.** Do the 5 rounds of changes actually make the first-landing experience work? Hit these pages and evaluate:

- `07-project-detail.png` — is the 2-col OverviewLandingCard pulling its weight? Tasks left, Links+Activity right, compose bottom? Should anything move?
- `03-my-tasks.png` — TodayHero Overdue+DueToday readable at first glance? Focus Next still valuable below or redundant now?
- `31-search.png` — with 14 entity types in results, is the output legible? Should there be per-type grouping / filter chips at top? Result row density OK?
- `01-dashboard.png` — does Dashboard apply the "landing = action panel" principle or is it still editorial? (Not touched today.)
- `02-personal.png` — same question.

**Priority 2 — Airtable+Slack gaps.** Given the vision, what surfaces feel generic-task-tracker instead of Airtable+Slack-native? Specific suspicions:

- File prominence — Files tab exists on ProjectDetail but not yet on TaskDetailPanel, MeetingDetail. Slack shows files inline in threads. Should notes/comments/messages support inline file drops?
- Presence — currently only ProjectDetail. Should extend to TaskDetailPanel, MeetingDetail. Also: typing indicators on comment threads.
- Keyboard — Cmd+K palette exists (`CommandPalette`); is it Slack-complete? What's missing?
- Search — per-type filter chips at top of SearchPage? "only files", "only decisions"?
- Per-entity thread — `@mentions` work; emoji reactions exist on notes (ReactionBar); do they feel first-class?

**Priority 3 — Rule 23 operational-not-editorial audit.** Pages that still feel editorial (hero illustrations, big whitespace, centered text):
- Home public (`00-home-public.png`) — might be fine since it's marketing. Confirm boundary.
- Pulse Kiosk (`24-pulse-kiosk.png`) — cinematic by design; keep as-is.

---

## Surface taxonomy reminder

- **Data pages** (columnar table): Tasks, MyTasks, Deadlines, Projects, Manuscripts, Decisions, Ideas, Grants, Meetings, Publications.
- **Dashboard pages** (card grid): Dashboard, Personal, PI Analytics, Analytics.
- **Detail pages** (tabs + panels): ProjectDetail, TaskDetailPanel (side), MeetingDetail, MemberPage, TrajectoryPage.
- **Kiosk/public**: Home, Pulse Kiosk, public team + member pages.

Don't mix — e.g. don't add a full columnar table to a dashboard page. See CLAUDE.md Rule 17.

---

## Design system constraints (unchanged)

- Dark-first `#0b1017`, text `#e2e8f0`.
- 3-tier font weights (400 body / 500 UI / 600 heading).
- 5-tier opacity (1.0 / 0.85 / 0.55 / 0.40 / 0.30) — never lower on readable text.
- DM Sans body. Fraunces reserved for public marketing only.
- Max 2 non-neutral colors per view.
- `--stage-fill-*` tokens for progress fills (axe AA compliant).
- Hover-revealed elements: `visibility: hidden` not `opacity: 0` (SR phantom announcements).
- Mount animations: transform-only, never `opacity: 0 → 1` (axe mid-transition contrast false positives).

---

## Deliverable format

Ticket list in the shape used for r2 (43 tickets shipped 2026-04-18):

```
## Ticket T-XX: <title>
**Severity:** P0 | P1 | P2
**Surface:** ProjectDetail / MyTasks / Search / Global / …
**Problem:** <1-2 sentences grounded in screenshot reference>
**Fix:** <what to change, which file(s) if known>
**Effort:** 1-5 (pointed)
```

Expected volume: **15-30 tickets**. Bias toward P1 quality-of-life fixes. Track A shipped the bones; this round is polish + Airtable+Slack parity gaps.

---

## Out of scope

- Schema changes (no new D1 tables or columns).
- Auth / routing changes.
- Public marketing site (separate brief if needed).
- Pulse Kiosk (cinematic by design, r7 hex-pinned).

---

## Reference

- **Repo**: github.com/ingra107/mn-ccore-lab (`main`)
- **Context**: `CLAUDE.md`, `REFERENCE.md`, `CHANGELOG.md`, this brief
- **Memory**: `feedback_nick-design-philosophy.md`, `project_hub-vision-airtable-slack-hybrid.md` (agent-side)
- **PI**: Nick Ingraham (nicholas.ingraham@gmail.com / ingra107@umn.edu)
- **Screenshots this round**: `review/post-track-a-2026-04-23/` (41 desktop + 6 mobile)

---

**After tickets land:** Nick triages + I ship tier-1 same-day, tier-2+ into a new batch.

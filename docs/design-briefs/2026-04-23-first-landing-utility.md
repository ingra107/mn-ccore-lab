# Design Brief — First-Landing Utility (Round 3)

**Date:** 2026-04-23
**Scope:** ProjectDetail + MyTasks above-the-fold experience
**Context:** Post-Track-A in-house hoists shipped; looking for second-order polish
**Deliverable:** Ticket list (15-25 tickets), not Figma mocks
**Prior rounds:** r1 / r2 (43 tickets, Phase 36d), r7 (visual contrast)

---

## The problem (verbatim from PI)

Nick filed 3 bug reports in one session, same underlying theme — **landing pages don't surface what I need before I have to scroll**.

**GH #27** (/portal/projects/:slug):
> "i see minimal useful information when i first hit the project page. i just need to know maybe the last 2-3 things that happened for this. I want to see tasks related to it and i want to make comment or notes. i would have to scroll WAY down to see any of that. think through what is useful on first landing and we need to reimagine what that would look like.. same concept on all pages. may need to ask CCDesign to dig into this"

**GH #29** (same page, description rendering):
> "how is this useful? if these were appropriately on new lines it would be a little better i think. Also key links need to be when i first land on the page... this goes with the prior issue"

**GH #33** (/portal/my-tasks):
> "I can see three tasks with limited detail in the focus mask. Then the overdue ones, there is a bunch of blank space below it, and I can't quickly see other stuff that might be due today. another issue with landing on the page and wanting to see actionable info in a digestible way"

## Underlying vision (non-negotiable)

The Hub is a **hybrid of Airtable + Slack** tailored for a research lab (Nick verbatim 2026-04-23). When evaluating any design suggestion, ask:
- **Airtable analogue:** structured row + inline fields + views + typeahead pills
- **Slack analogue:** per-entity thread + @mentions + reactions + file sharing + search
- **MN-CCORE extension:** research-workflow-aware (manuscripts, revisions, mentees, grants, deadlines)

Nick uses TODAY.md every morning — single surface, immediately actionable, single-click "work-on." The Hub should carry that discipline.

## What Track A already shipped (2026-04-23)

**ProjectDetail Overview** — new inline `OverviewLandingCard` at top:
1. Key Links strip (chip row, `classifyUrl` icons for folder/journal/script)
2. Recent Activity — merged last-3 stream (notes + comments + system events), click-through to tab
3. Top 3 open tasks, sorted by due date
4. Quick compose — textarea + Note/Comment toggle + Cmd+Enter send, no modal
5. Description: `whiteSpace: pre-wrap` so line breaks render

Tab restructure (Option B): `Overview | Tasks | Notes | Comments | Activity | Revisions | Literature`. ProjectUpdateFeed heading "Project Updates" → "Notes" to match TaskDetailPanel.

**MyTasks TodayHero** — new 2-column block above Focus Next:
- Left: Overdue (maroon chip, days-overdue, up to 5)
- Right: Due Today (teal chip, priority badge, up to 5)
- Each row → opens TaskDetailPanel.
- Only renders when `Mine + quickFilter=all + !showCompleted`.

## Jobs-to-be-done (Nick's first 5 seconds)

**On ProjectDetail (hypothesis — confirm/refine):**
1. "What's new since I last looked?" → check recent activity
2. "Is anyone blocked?" → see outstanding tasks + blockers
3. "I want to jot a quick thought" → compose note without navigating
4. "Jump to the Box folder / Google Doc / paper draft" → click key link
5. "Who's on this project?" → scan team avatars

**On MyTasks (hypothesis):**
1. "What's on fire today?" → overdue + due today scan
2. "What's next after today?" → focus next block
3. "Am I waiting on anyone?" → waiting-on filter
4. "Did I miss anything yesterday?" → recently-overdue tier
5. "Let me quickly knock out a task" → click status circle, undo toast

Please validate these with your own analysis of the captured screenshots.

## Patterns worth borrowing

- **Linear "My Issues":** tiered grouping (overdue → today → this week → no date), no blank space.
- **Height "Home":** daily digest with a compose-at-top composer, inline actions per row.
- **Airtable interface designer:** per-record landing with related-rows panels, inline editable fields, typeahead single-select.
- **LabSync (JC Rojas):** density that doesn't feel cramped — font-weight 400 nav, grouped sections with rhythm.
- **Slack channels:** per-entity thread = first-class UX, not a hidden sub-panel. Composer always present at top.

## Guardrails (from Nick's feedback)

1. **Landing must be actionable.** Zero-click composer + zero-click key-links access.
2. **Pills are type-and-filterable + Enter to commit.** Plain `<select>` is not acceptable.
3. **Links must MAKE SENSE + be INTUITIVE.** No raw URLs. Use `classifyUrl` pattern.
4. **Minimize click-chain.** Never "click to navigate + click to act." Do both from origin.
5. **Clean but USEFUL everywhere.** Density ≠ clutter (LabSync standard).
6. **"Work-on" single-click nav** from task rows to projects (TODAY.md pattern).
7. **Quick notes on landing** without modals.
8. **Dynamic, not error-prone.** Optimistic UI, undo toast.
9. **Operational, not editorial.** Rule 23 — no hero illustrations on data surfaces.

## Design-system constraints

- Dark-first `#0b1017`, text `#e2e8f0`.
- 3-tier font weights (400 body / 500 UI / 600 heading), 5-tier opacity (1.0 / 0.85 / 0.55 / 0.40 / 0.30).
- DM Sans body / Fraunces headings only on public marketing. Portal is all DM Sans.
- Max 2 non-neutral colors per view.
- `--stage-fill-*` tokens for progress fills; axe AA compliant.
- Hover-revealed elements must use `visibility: hidden` not `opacity: 0` (SR phantom announcements).

## Capture commands (for Claude Design preview)

After this deploy lands, regenerate screenshots:

```bash
# Capture post-Track-A prod state (once deploy is live)
CAPTURE_BUNDLE=first-landing-post-track-a \
  npx playwright test tests/capture-for-design.spec.ts \
  --config=playwright.config.design-capture.ts

# Or capture from local dev for pre-ship preview
BASE_URL=http://localhost:5173 CAPTURE_BUNDLE=first-landing-preview \
  npx playwright test tests/capture-for-design.spec.ts \
  --config=playwright.config.design-capture.ts
```

Output: `review/first-landing-post-track-a/*.png` + `review/first-landing-post-track-a/mobile-*.png`.

Focus pages to review:
- `desktop-my-tasks.png` / `mobile-my-tasks.png`
- `desktop-project-detail.png` / `mobile-project-detail.png`
- `desktop-dashboard.png` (home tab, for comparative reference)

## Requested deliverable

A ticket list in the format used for r2 (43 tickets shipped 2026-04-18):

```
## Ticket T-XX: <title>
**Severity:** P0 | P1 | P2
**Surface:** ProjectDetail / MyTasks / Global
**Problem:** <1-2 sentences>
**Fix:** <what to change, which file(s)>
**Effort:** 1-5 (pointed)
```

Expected volume: 15-25 tickets. Bias toward high-leverage (P1) quality-of-life fixes over P0 re-architectures — Track A shipped the big bones. Scope to ProjectDetail Overview + MyTasks hero + general first-landing polish.

## Out of scope

- Schema changes (no new D1 tables or columns).
- Auth / routing changes.
- Public marketing site (separate brief).
- Mobile nav restructure (recent r7 sweep).

## Contact

Nick Ingraham (nicholas.ingraham@gmail.com / ingra107@umn.edu).
Primary repo: github.com/ingra107/mn-ccore-lab on `main`.
Context docs to load: `CLAUDE.md`, `REFERENCE.md`, `CHANGELOG.md`, this brief.
Memory to load (agent): `feedback_nick-design-philosophy.md`, `project_hub-vision-airtable-slack-hybrid.md`.

---

**After ticket list lands:** triage in a follow-up commit, apply tier-1 tickets same-day, tier-2+ into a new batch.

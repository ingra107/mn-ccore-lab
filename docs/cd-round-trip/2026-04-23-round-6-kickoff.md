# Single merged prompt — paste into Claude Design claude.ai project

**Use:** copy the code block below, paste into the CD claude.ai project chat.
If the project doesn't already have the latest capture bundle, attach
`review/post-track-a-2026-04-23/` screenshots first.

---

```
Round 5 close-out + round 6 kickoff. Two asks.

## State

- HEAD: 49cea746 on main
- Deploy: 0bc0942f.mn-ccore-lab.pages.dev
- Round 5 shipped: 32+ of 49 tickets across 4 ship batches + 1 simplify pass
- Still live for the team since 2026-04-21

Shipped tickets in round 5 (for your reference):
- T-01 / T-17 / T-33 / T-43 select-to-InlineSelect codemod
- T-02 ProjectDetail dead-label cleanup
- T-03 RecentActivity actor fallback
- T-04 compose file-drop (3 surfaces)
- T-05 compose @ + : affordance buttons (3 surfaces)
- T-06 reactions first-class (muted + preset swap 1F4A1 -> checkmark)
- T-07 MyTasks sticky overdue pill on scroll
- T-08 MyTasks Today-group dedup vs TodayHero
- T-10 TodayHero "+N more ->" scroll-to-list
- T-11 MyTasks Stale quickFilter
- T-12 SearchPage per-type chip strip (14 types)
- T-13 / T-14 presence avatars on Task + Meeting headers
- T-16 Cmd+K Recent section (sessionStorage)
- T-18 ProjectDetail header pills inline-editable
- T-20 MeetingDetail keyboard nav (n/j/k/x/Enter)
- T-21 Decisions tag-chip filter hides when <15
- T-22 Activity date headers sticky
- T-23 ActivityPage per-type chip strip (replace InlineSelect)
- T-30 Dashboard greeting shrunk to 14px 500wt
- T-31 Personal TodayHero 2-col
- T-32 Personal onboarding pin
- T-34 Settings unsaved-state dot
- T-35 AskTheLab empty state @hermes
- T-36 MeetingNotes "how transcripts work" collapsible
- T-37 MyItems NotificationCard type-coded border
- T-39 NateLab reorder grants-top
- T-40 PublicationDetail stub sections
- T-41 GlobalQuickAdd panel width clamp
- T-42 CommandPalette task sublabel
- T-44 PBSector empty state
- T-45 SessionHistory empty state
- T-46 Dashboard Customize sticky Done
- T-47 Cmd+K View all footer button
- T-48 Dashboard light-mode parity
- T-49 mobile swipe-to-dismiss restored (framer-motion)
- T-50 Files tab on TaskDetailPanel + MeetingDetail (Slack pillar)
- T-51 typing indicators on compose (useTyping hook)

Simplify pass extracted: appendCharToInput helper + TypingIndicator component.

## Ask 1 — Drop DESIGN-DIRECTION.md

You mentioned "direction items" DD-#1 through DD-#7 as strategic proposals that need my product call, with DD-#3 (status-line pilot on Dashboard) flagged as closest-to-ship. But only DD-#3 has enough context for me to triage. The other six are black boxes.

Please write DESIGN-DIRECTION.md with one paragraph per DD item (7 items total). Each paragraph should include:

1. What the item proposes — replace X with Y / add Z surface / restructure W
2. Which vision pillar it addresses:
   - Airtable pillar — structured data / inline edit / multi-view / linked records / pill typeahead
   - Slack pillar — threads / mentions / reactions / files / search / keyboard / presence
   - MN-CCORE-specific — TODAY.md triage / research-workflow / CLI+Web sync / Hermes ambient / PI dashboards
3. Effort estimate — sprints not hours (0.5 / 1 / 2+)
4. What "skip it" looks like — is there a degraded alternative, or does the vision collapse without this item?

For DD-#3 specifically: my implementation agent drafted a spec at docs/specs/dd-3-status-line-pilot.md with three layout options (A single-line dot-separated, B two-line stats+context, C chip row). Recommendation is Option C (chip row) because it matches the chip-strip pattern now on SearchPage + ActivityPage and turns status-at-a-glance into actionable click targets. Please tell me if Option C matches your intent, or propose a different layout.

Drop the doc into docs/design-briefs/DESIGN-DIRECTION.md or paste it back to me and I'll commit.

## Ask 2 — T-29 clarification

Round 5 T-29 (Manuscripts "Needs your attention" grouping) didn't ship because the UI you described doesn't match what's in the current src/pages/portal/Manuscripts.tsx. My agent flagged it as "re-audit needed" and skipped rather than invent something.

Two possibilities:

1. You were looking at a stale capture. The Manuscripts page shipped category filter + sortable columns + stage progress dots in Phase 26aq (2026-04-07/08).
2. You had a net-new design in mind — a "Needs your attention" section at top of Manuscripts grouping papers by some urgency signal (stale >30d? overdue revisions? reviewer not yet assigned?).

Please:

1. Look at the current live page — attach a fresh screenshot if needed, or pull from review/post-track-a-2026-04-23/.
2. Tell me specifically what UI you had in mind:
   - Grouping criteria (which papers surface there)
   - Placement (top of page vs inline vs modal)
   - Count badge / click-to-filter / dismiss behavior
3. If net-new, write a 2-paragraph spec and I'll queue for round 6.
4. If you were looking at stale data, say "drop it" and I'll remove from the backlog.

## Context Nick has decided on

- DD-#3: draft spec first (done — docs/specs/dd-3-status-line-pilot.md)
- Hermes ambient shape: suggest-slot on landing cards (small strip on TaskDetailPanel / ProjectDetail that surfaces 1 proactive Hermes suggestion). Future session, not urgent.
- T-24 Research Digest rows view: DROPPED. Card view stays; not worth 1000+ line refactor.

Thanks.
```

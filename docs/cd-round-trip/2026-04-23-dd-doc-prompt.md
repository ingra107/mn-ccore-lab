# Prompt — Ask Claude Design project for DESIGN-DIRECTION.md

**Status:** Ready to paste into the Claude Design claude.ai project
**Purpose:** Get the 7 DD direction items documented so they can be triaged

---

## How to use

1. Open the Claude Design project on claude.ai.
2. Attach or reference the latest capture bundle (`review/post-track-a-2026-04-23/` or newer) if the project doesn't already have it.
3. Paste the prompt below.

---

## Prompt

```
Before round 6 — I need you to drop a DESIGN-DIRECTION.md doc.

In the round-5 handoff you mentioned "direction items" DD-#1 through DD-#7 as strategic proposals that need my product call, with DD-#3 (status-line pilot on Dashboard) flagged as closest-to-ship. But only DD-#3 has enough context for me to triage. The other six are black boxes.

Please write `DESIGN-DIRECTION.md` with one paragraph per DD item (7 items total). Each paragraph should include:

1. **What the item proposes** — replace X with Y / add Z surface / restructure W
2. **Which vision pillar it addresses** — Airtable pillar (structured data / inline edit / multi-view / linked records / pill typeahead) OR Slack pillar (threads / mentions / reactions / files / search / keyboard / presence) OR MN-CCORE-specific (TODAY.md triage / research-workflow / CLI+Web sync / Hermes ambient / PI dashboards)
3. **Effort estimate** — sprints, not hours (0.5 sprint / 1 sprint / 2+ sprints)
4. **What "skip it" looks like** — is there a degraded alternative, or does the vision collapse without this item?

For DD-#3 specifically: I've already asked my implementation agent to draft a spec at `docs/specs/dd-3-status-line-pilot.md` (3 layout options, Option C chip row recommended). Please review that spec and tell me if it matches what you intended, or propose a different layout.

For reference — current shipped state:
- HEAD: 6ccfaf0d on main
- Deploy: 0bc0942f.mn-ccore-lab.pages.dev
- Round-5 close: 32+ of 49 tickets shipped across 4 batches + 1 simplify pass
- Live for the team since 2026-04-21

Drop the doc into the repo at `docs/design-briefs/DESIGN-DIRECTION.md` or paste it back to me and I'll commit it.

Thanks.
```

---

## Notes

- The prompt references files that exist in the repo as of `6ccfaf0d`.
- If the Claude Design project doesn't have the latest screenshot bundle, attach one first.
- If CD comes back with the doc, commit to `docs/design-briefs/DESIGN-DIRECTION.md`.

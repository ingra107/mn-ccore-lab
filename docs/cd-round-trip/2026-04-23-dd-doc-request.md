# Email draft — Request DESIGN-DIRECTION.md from Claude Design

**Status:** Draft for Nick to send (copy-paste ready)
**To:** Claude Design
**Re:** Round 5 / round 6 — please drop DESIGN-DIRECTION.md so DD-#1 through DD-#7 can be triaged

---

## Subject

MN-CCORE Hub — DESIGN-DIRECTION.md request + round-5 close-out state

## Body

Hey team,

Quick ask before round 6.

Round 5 shipped well — 32+ of the 49 tickets landed (SESSION-HANDOFF has the full map). My agent references `DESIGN-DIRECTION.md` with items **DD-#1 through DD-#7** as strategic proposals requiring my product call, with DD-#3 (status-line pilot on Dashboard) flagged as closest-to-ship. But I don't have a physical copy of that document in the repo — just the mention in the handoff.

Could you drop a short `DESIGN-DIRECTION.md` (one paragraph per DD item, 7 items total) into the `docs/design-briefs/` folder of the next handoff? Each paragraph should cover:
- What the item is proposing (replace X with Y, add Z surface, etc.)
- Which part of the vision it addresses (Airtable pillar / Slack pillar / MN-CCORE-specific)
- Rough effort estimate (sprints, not hours)
- What the alternative looks like if we skip it

That lets me triage each in <5 min per item instead of having them live as "unknown strategic asks" at the top of the handoff.

For DD-#3 specifically — I've asked my agent to draft a spec before build; the spec will land in `docs/specs/dd-3-status-line-pilot.md` and I'll share for your review before we ship. No action needed from you there.

**Current shipped state for reference** — deploy is `0bc0942f.mn-ccore-lab.pages.dev`, HEAD `5fcfed16` on main. Recent captures in `review/post-track-a-2026-04-23/`. Live for the team as of 2026-04-21.

Thanks — Nick

---

## Notes for Nick

- Paths referenced: `docs/design-briefs/`, `docs/specs/dd-3-status-line-pilot.md` — both exist in the repo after this session.
- If CD doesn't have a version of DESIGN-DIRECTION.md yet (maybe it was verbal/slack), this prompt gives them structure to write it.
- Send via your preferred channel. If you want the agent to use Gmail MCP to create a draft on `umn` account, say "draft via gmail".

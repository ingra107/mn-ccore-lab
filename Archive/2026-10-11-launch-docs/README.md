Archived 2026-10-11 (s51 dead-weight lane). Launch-era material for a Hub that went live 2026-04-21.

What: LAUNCH-CHECKLIST.md (header: STATUS: LAUNCHED 2026-04-21), LAUNCH-TESTING-HANDBOOK.md (no referrer), docs/design-handoff-2026-04-20/ (46 files; Claude Design bundle, imported April), docs/design-handoff-2026-04-23/ (2 files, no referrer), and PROJECT.md lines 31-284 (Phase 35-37 history, already in CHANGELOG.md).

Proof: PROJECT.md:25 sent sessions to LAUNCH-CHECKLIST as 'the gate for going live', which it stopped being on launch day. No file in src/, api/, functions/, scripts/, tests/ or .github/ reads any of these paths. README.md and PROJECT.md pointers were repointed here in this commit.

Keep findable: LAUNCH-CHECKLIST sections 0 and 1 hold the CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD secret commands. Peripheral-Brain Projects/mn-ccore-lab-hub/PROJECT.md (lines 21, 31, 109, 125) still points at the old root path and needs repointing from the PB side.


Binaries removed (Nick ruled binaries are history-only): the 32 PNGs of docs/design-handoff-2026-04-20/screenshots/ left the tree. Restore any one with:
  git show 9a0de385:docs/design-handoff-2026-04-20/screenshots/<file> > <file>
Files (all under docs/design-handoff-2026-04-20/screenshots/ at 9a0de385):
- desktop-00-home-public.png
- desktop-01-dashboard.png
- desktop-02-personal.png
- desktop-03-my-tasks.png
- desktop-04-calendar.png
- desktop-05-deadlines.png
- desktop-06-projects.png
- desktop-07-project-detail.png
- desktop-08-manuscripts.png
- desktop-09-ideas.png
- desktop-10-decisions.png
- desktop-11-digest.png
- desktop-12-grants.png
- desktop-13-meetings.png
- desktop-14-analytics.png
- desktop-15-pi-analytics.png
- desktop-16-mentee-milestones.png
- desktop-17-pb-sector.png
- desktop-18-settings.png
- desktop-19-team-public.png
- desktop-20-team-member-portal.png
- desktop-21-team-member-public.png
- desktop-22-publications.png
- desktop-23-network.png
- desktop-24-pulse-kiosk.png
- mobile-01-dashboard.png
- mobile-03-my-tasks.png
- mobile-06-projects.png
- mobile-07-project-detail.png
- mobile-13-meetings.png
- mobile-24-pulse-kiosk.png
- pasted-1776694690190-0.png

Archived 2026-10-11 (s51 dead-weight lane). Launch-era material for a Hub that went live 2026-04-21.

What: LAUNCH-CHECKLIST.md (header: STATUS: LAUNCHED 2026-04-21), LAUNCH-TESTING-HANDBOOK.md (no referrer), docs/design-handoff-2026-04-20/ (46 files; Claude Design bundle, imported April), docs/design-handoff-2026-04-23/ (2 files, no referrer), and PROJECT.md lines 31-284 (Phase 35-37 history, already in CHANGELOG.md).

Proof: PROJECT.md:25 sent sessions to LAUNCH-CHECKLIST as 'the gate for going live', which it stopped being on launch day. No file in src/, api/, functions/, scripts/, tests/ or .github/ reads any of these paths. README.md and PROJECT.md pointers were repointed here in this commit.

Keep findable: LAUNCH-CHECKLIST sections 0 and 1 hold the CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD secret commands. Peripheral-Brain Projects/mn-ccore-lab-hub/PROJECT.md (lines 21, 31, 109, 125) still points at the old root path and needs repointing from the PB side.

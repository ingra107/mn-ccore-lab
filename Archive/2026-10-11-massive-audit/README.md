Archived 2026-10-11 (s51 dead-weight lane). The April 'massive-audit' A-L section harness (20 files, 2,484 lines) and scripts/audit-detail.ts, its only importer.

Proof: no package.json script, workflow, hook or schedule names massive-audit/run. audit-detail.ts has no referrer. hub-audit.ts and tests/helpers/capture-auth.ts mention it only in comments; the live auth code is tests/helpers/capture-auth.ts. Hub CLAUDE.md rule 40 described lib/overlap-detector.ts, which no other file imports.

Peripheral-Brain still carries a PB_SYNC_ALLOW_TEST_PREFIXES escape hatch whose docstring names this runner as its user. That PB-side cleanup is not part of this move.

Rule 40 text (retired from Hub CLAUDE.md): the overlap detector lived in `scripts/massive-audit/`. If revived, keep its lesson: skip semantic landmarks (`<nav>`/`<header>`/`<aside>` and `role="navigation|banner|complementary"` are chrome, not overlap).

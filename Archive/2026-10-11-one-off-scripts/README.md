Archived 2026-10-11 (s51 dead-weight lane). One-shot probe and audit scripts from April to June 2026, about 4,500 lines. All write to the untracked review/ folder.

Proof: per-stem git grep over the Hub (excluding CHANGELOG, docs/archived, Archive) finds no caller for any of them. visual-audit was named only by screenshot-modal and test-compression (output paths), mobile-sweep only by its two siblings. None is in package.json, .github/workflows, .githooks/ or Peripheral-Brain schedule.json. eslint and tsconfig do not cover scripts/. smoke-test.ts still targets /dashboard and /personal, pages that no longer exist.

Not seen: HOME shell habits.

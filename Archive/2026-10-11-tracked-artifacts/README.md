Untracked 2026-10-11 (s51 dead-weight lane). Not moved here, because Archive/ is tracked and a move would keep the bytes in every checkout.

What: qa-screenshots/ (152 files), eval-screenshots/ (33), .playwright-mcp/ (98), .superpowers/ (12), .vitest-attachments/ (2), tests/__pycache__/sync-pipeline.test.cpython-313.pyc, tests/e-comments.png, tests/e-digest-loaded.png, Scratch/ (3 files, already ignored by .gitignore).

Proof: last commits 2026-04-08 to 2026-04-13. git grep for each path outside the dir finds only .ignore and .gitignore lines. Nothing in package.json, .github/, wrangler.toml, .githooks/ or schedule.json reads them.

Recover: git show 9a0de385:<path>

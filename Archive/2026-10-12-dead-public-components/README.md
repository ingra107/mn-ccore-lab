Archived 2026-10-12 (s68 public-site redesign). The public Home no longer renders
these nine components and nothing under src/, tests/, api/ or scripts/ imports them
(grep of every component name, 2026-10-12). Kept by `git mv`, not deleted: restore
with `git mv` back to src/components/ if a page needs one again.
CLIFMap's site list now lives in src/data/clifSites.ts (the Home band counts it).

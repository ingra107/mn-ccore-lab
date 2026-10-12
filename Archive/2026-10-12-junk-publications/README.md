Placeholder rows in the prod `publications` table, found in the s68 public-site build (2026-10-12).

- publications.json: full D1 rows (SELECT *) of the 78 rows, the restore source.
- delete-junk-publications.sql: the exact-id DELETE. RUN against prod on 2026-10-12 with Nick's go (coordinator): publications 704 -> 626. This directory is the restore source.
- Rule that picked them (same as isPlaceholderPublication in src/lib/publicationCounts.ts): title starts with test_, [Table, [Figure, Supplementary Materials, or Data from.
- Not included on purpose: 7 duplicate rows (a preprint and its published version, different DOIs). Those are real papers; the site shows one of each (dedupePublications).

- The client keeps `isPlaceholderPublication` (src/lib/publicationCounts.ts) as a guard: the test_delete_ rows came from a test pipeline writing to prod and could come back.

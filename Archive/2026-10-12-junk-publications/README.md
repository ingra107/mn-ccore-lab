Placeholder rows in the prod `publications` table, found in the s68 public-site build (2026-10-12).

- publications.json: full D1 rows (SELECT *) of the 78 rows, the restore source.
- delete-junk-publications.sql: the exact-id DELETE. NOT RUN against prod. Run through scripts/wrangler-d1 only with Nick's go.
- Rule that picked them (same as isPlaceholderPublication in src/lib/publicationCounts.ts): title starts with test_, [Table, [Figure, Supplementary Materials, or Data from.
- Not included on purpose: 7 duplicate rows (a preprint and its published version, different DOIs). Those are real papers; the site shows one of each (dedupePublications).

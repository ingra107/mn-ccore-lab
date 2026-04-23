// Server-side filter for QA test fixtures. Mirrors
// src/lib/isProductionVisible.ts but runs at the API layer so every
// list endpoint can enforce the same rule without each view
// remembering to import a client-side filter.
//
// Round-4 rationale (2026-04-23): a round-2 client filter was only
// wired into a handful of pages, so `_TEST_DELETE_lab_question_*`
// / `_TEST_DELETE_decision_*` / `deep-audit-probe-*` rows leaked to
// Ask the Lab, Decisions, and Meeting Prep. Filtering server-side is
// defense-in-depth: new list surfaces inherit the filter automatically.

const HIDDEN_TITLE_PATTERNS = [
  /^_?test_delete_/i,       // matches `test_delete_...` AND `_TEST_DELETE_...`
  /^deep-audit-/i,          // `deep-audit-sync-*`, `deep-audit-probe-*`
  /___cli_edit$/i,          // suffix marker left by CLI edit probes
  /^test\s*q\b/i,           // bare "test q"
  /^test$/i,                // bare "test"
  /^test\s+(question|decision|item|task)\b/i,
  /^@claude\s+hi$/i,        // AI ping probe
]

/**
 * Returns true if the given title/question text looks like a QA fixture
 * and should be hidden from normal users. Returns false for real content.
 *
 * Allow override via URL query param `?include_fixtures=1` so debug
 * tooling can still see everything — handler passes that flag through.
 */
export function isTestFixture(title: string | null | undefined): boolean {
  if (!title) return false
  return HIDDEN_TITLE_PATTERNS.some((re) => re.test(title))
}

/** Convenience: filter an array of rows by a title-bearing field. */
export function filterFixtures<T extends Record<string, unknown>>(
  rows: T[],
  titleField: keyof T,
  includeFixtures = false,
): T[] {
  if (includeFixtures) return rows
  return rows.filter((r) => !isTestFixture(r[titleField] as string | null))
}

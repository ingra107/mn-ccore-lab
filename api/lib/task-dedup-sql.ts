// Task name-identity key — ONE definition of the SQL every surface must agree on.
//
// WHY THIS FILE EXISTS (PB backlog #530b, reconciled Dual-Plan, 2026-09-02).
// The two applyInsert dedup arms (serial + race-loser catch) and the partial
// UNIQUE index idx_tasks_title_norm_project_active must agree on the key, or
// the SELECT-then-INSERT race hole reopens — schema-v92's standing warning.
// The predicate used to be written out twice inside mutations.ts and a third
// time in the migration, and two of those three could drift in silence. Now the
// TypeScript half has exactly one definition, and
// api/routes/mutations.dedup-key-contract.test.ts reads the migration file and
// asserts the SQL half still matches it. v92's comment becomes a gate.
//
// NORMALIZE IN SQL, NEVER IN JS. `title.toLowerCase()` in TypeScript is
// Unicode-aware; SQLite's lower() is ASCII-only. Folding on the JS side would
// produce a key the index does not share for any non-ASCII title — a silent
// predicate mismatch, which is precisely the hole v92 warns about. Both the
// column and the bound value pass through SQLite's own lower(trim(...)).
//
// SCOPE OF THE FOLD. trim() strips leading and trailing SPACES only — not tabs,
// not newlines, not NBSP — and internal runs survive, so "Review  Draft" and
// "Review Draft" remain two distinct tasks. PB's
// tests/db/test_dedup_name_normalization.py pins the same boundary on the other
// side of the wire; the two repos are deliberately equal here.

/** The key expression, as SQLite evaluates it over the stored column. */
export const TASK_TITLE_KEY_SQL = 'lower(trim(title))';

/** The same fold applied to the bound value. Must stay paired with the above. */
export const TASK_TITLE_KEY_BIND_SQL = 'lower(trim(?))';

/** The partial UNIQUE index that backs the key (api/schema-v107-*.sql). */
export const TASK_TITLE_NORM_INDEX = 'idx_tasks_title_norm_project_active';

// The rows the name-identity class covers: active, not done, not a meeting
// approval (meeting rows are keyed by (source, meeting_id) and NEVER consult
// the title). BYTE-MATCHES the index predicate in schema-v107.
const TASK_DEDUP_SCOPE_SQL =
  `AND deleted_at IS NULL AND status != 'done' ` +
  `AND (source IS NULL OR source != 'meeting_approval') LIMIT 1`;

/**
 * The name-identity dedup SELECT. `project_id IS ?` (not `= ?`) so a NULL
 * project matches NULL; the index gets the same behaviour from
 * COALESCE(project_id, ''), because SQLite treats NULLs as DISTINCT in a UNIQUE
 * index and would otherwise leave the race window open for exactly those rows.
 */
export const TASK_TITLE_DEDUP_SELECT =
  `SELECT id FROM tasks WHERE ${TASK_TITLE_KEY_SQL} = ${TASK_TITLE_KEY_BIND_SQL} ` +
  `AND project_id IS ? ${TASK_DEDUP_SCOPE_SQL}`;

// ── Test-support: classify a `SELECT id FROM tasks` the D1 stubs must answer ──
//
// The vitest D1 stubs recognise the dedup SELECTs by matching their SQL text,
// and nine of them matched the substring `TITLE =` — which the normalized form
// does not contain. Every one of those would have fallen through to a by-id
// lookup, silently disabling dedup: a test asserting dedup goes red (fine), a
// test asserting NON-dedup passes vacuously (not fine). This classifier is the
// single matcher they now share, and it THROWS on a `SELECT id FROM tasks` it
// does not recognise, so the next SQL edit that outruns the stubs is a red test
// instead of a vacuous green one.
//
// COVERAGE (ethos #9): it classifies the three dedup SELECTs only, and only in
// `first()`. It says nothing about `SELECT * FROM tasks WHERE id = ?`
// (readCanonical), joined reads, `all()` queries, or any non-tasks statement —
// callers keep their own handling for those, and it returns null for them.

export type TaskDedupSelectShape = 'title' | 'meeting' | 'mobile';

// Every `SELECT id FROM tasks` in api/ is a dedup pre-check: two in applyInsert
// (serial + catch), one for meeting approvals, one mobile pre-check in tasks.ts.
const TASK_DEDUP_SELECT_RE = /SELECT\s+ID\s+FROM\s+TASKS\b/;

/**
 * Which dedup SELECT is this? Returns null when the statement is not a
 * `SELECT id FROM tasks` at all. THROWS when it is one and matches no known
 * shape — that is the loud failure the stubs want.
 */
export function classifyTaskDedupSelect(sql: string): TaskDedupSelectShape | null {
  const upper = sql.trim().toUpperCase();
  if (!TASK_DEDUP_SELECT_RE.test(upper)) return null;

  // meeting-approval identity: (source, meeting_id), never the title.
  if (upper.includes("SOURCE = 'MEETING_APPROVAL'") && upper.includes('MEETING_ID =')) {
    return 'meeting';
  }
  // handleMobileTasksToHub's pre-check — normalized title too, but scoped by
  // `completed = 0` with no meeting exclusion, so it must not be confused with
  // the central rule now that both fold the title.
  if (upper.includes('COMPLETED = 0')) return 'mobile';
  // the central name-identity rule, raw or normalized. The word boundary is
  // load-bearing: a bare `includes('TITLE = ?')` also matches `SHORT_TITLE = ?`
  // and would classify a different column's query as the name key.
  if (
    upper.includes('PROJECT_ID IS ?') &&
    (/\bTITLE = \?/.test(upper) || upper.includes(TASK_TITLE_KEY_SQL.toUpperCase()))
  ) {
    return 'title';
  }
  throw new Error(
    `D1 stub: unrecognised task dedup SELECT — the stub's matcher has fallen ` +
      `behind the query it is supposed to model. Update the stub, do not ` +
      `delete this throw.\n  ${sql.trim()}`,
  );
}

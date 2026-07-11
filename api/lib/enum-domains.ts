// Phase A1 — Hub /api/mutations enum-domain validation (canonicalize-forward).
//
// The Hub becomes the validating authority for synced enum fields. This module
// loads the GENERATED enum-domain mirror (enum-domains.generated.json, emitted
// from Peripheral-Brain scripts/db/enums.py + the outbox bucket map) and exposes
// helpers that the mutation write path uses to:
//   - canonicalize-forward legacy/display-case values to canonical (mirror of
//     enums.py:_canonicalize: exact -> alias -> case-insensitive), rewriting the
//     payload in place; reject ONLY unmappable junk.
//   - reject conflict-class writes (handled in mutations.ts applyUpdate).
//   - assert the completion triad (status='done' <=> completed=1 <=> completed_at).
//
// SSOT: the JSON is generated, never hand-edited. PB pre-commit gate
// .githooks/check_hub_enum_domains.py re-emits + diffs it; the well-formedness
// vitest test here is the independent Hub-side backstop.
//
// CRITICAL (codex 5th-risk block): the projects.category domain in the JSON is
// the DISTINCT VALUES of PROJECT_TYPE_TO_HUB_CATEGORY ({CLIF, MNCCORE,
// "Peripheral Brain"}), NOT the PB type enum. The validator keys on the Hub WIRE
// field name (category, not type), so it matches the bucketed wire payload.

// esbuild (wrangler deploy) and vitest both bundle JSON imports natively.
import enumDomainsRaw from '../enum-domains.generated.json';

export interface EnumDomain {
  canonical: string[];
  legacy_aliases: Record<string, string>;
  nullable: boolean;
}

export interface EnumDomainsFile {
  _generated_by: string;
  tables: Record<string, Record<string, EnumDomain>>;
}

const ENUM_DOMAINS = enumDomainsRaw as unknown as EnumDomainsFile;

/**
 * Return the per-table enum-field domain map (Hub wire field name -> domain),
 * or undefined when the table carries no enum fields. Read-only view of the
 * bundled JSON.
 */
export function enumFieldsFor(table: string): Record<string, EnumDomain> | undefined {
  return ENUM_DOMAINS.tables[table];
}

/**
 * Canonicalize-forward a single value against a domain. Mirror of
 * Peripheral-Brain scripts/db/enums.py:_canonicalize byte-for-byte semantics:
 *   1. exact canonical match -> value
 *   2. exact legacy_alias match -> mapped canonical
 *   3. case-insensitive canonical match -> matched canonical
 *   4. case-insensitive legacy_alias match -> mapped canonical
 *   5. otherwise -> null (unmappable)
 *
 * Returns the canonical string, or null when the value cannot be mapped.
 */
export function canonicalizeValue(value: string, domain: EnumDomain): string | null {
  // 1. exact canonical
  if (domain.canonical.includes(value)) return value;
  // 2. exact legacy alias
  if (Object.prototype.hasOwnProperty.call(domain.legacy_aliases, value)) {
    return domain.legacy_aliases[value];
  }
  const lower = value.toLowerCase();
  // 3. case-insensitive canonical
  for (const canonical of domain.canonical) {
    if (canonical.toLowerCase() === lower) return canonical;
  }
  // 4. case-insensitive legacy alias
  for (const [legacy, canonical] of Object.entries(domain.legacy_aliases)) {
    if (legacy.toLowerCase() === lower) return canonical;
  }
  // 5. unmappable
  return null;
}

/**
 * Validate + canonicalize-forward every enum field present in `fields` for
 * `table`, MUTATING `fields` in place to the canonical value (canonicalize-
 * forward). Returns an error message string for the FIRST unmappable value, or
 * null when every enum field is clean.
 *
 * Nullability: a field flagged nullable=false (status, both tables) rejects
 * NULL / '' (present-and-empty). Nullable fields skip NULL / '' (a cleared
 * value is allowed). A field that is simply ABSENT from `fields` is untouched.
 *
 * This is the V1 enum validator. It runs on BOTH insert payloads and update
 * patches (the caller passes payload|patch). Because it rewrites to canonical,
 * a legacy value (e.g. status:'Active' -> 'todo') is ACCEPTED, not rejected —
 * the risk-#1 dead-letter-wave guard.
 */
export function assertEnumDomain(
  table: string,
  fields: Record<string, unknown>,
): string | null {
  const domains = enumFieldsFor(table);
  if (!domains) return null;
  for (const [field, domain] of Object.entries(domains)) {
    if (!(field in fields)) continue;
    const raw = fields[field];

    // Empty / null handling driven by the sourced nullable flag.
    if (raw === null || raw === undefined || raw === '') {
      if (domain.nullable) {
        // Nullable enum: clearing is allowed; leave the value as-is.
        continue;
      }
      return `enum field "${field}" on ${table} cannot be null or empty (non-nullable)`;
    }

    if (typeof raw !== 'string') {
      return `enum field "${field}" on ${table} must be a string, got ${typeof raw}`;
    }

    const canonical = canonicalizeValue(raw, domain);
    if (canonical === null) {
      return `invalid enum value "${raw}" for ${table}.${field} (not a canonical value or known alias; domain=[${domain.canonical.join(', ')}])`;
    }
    // Canonicalize-forward: rewrite the payload/patch to the canonical value.
    if (canonical !== raw) {
      fields[field] = canonical;
    }
  }
  return null;
}

/**
 * V4 — completion-triad invariant for tasks (mig-090 parity). The three signals
 * status='done', completed=1, completed_at NOT NULL must agree. Validates the
 * RESULTING row state given the current row + the incoming patch/payload.
 *
 * Skipped when the resulting status is 'deleted' (a tombstone is not a
 * completion; the deleted_at co-flip owns that path). Returns an error message
 * string on a triad violation, or null when consistent / not applicable.
 *
 * Only meaningful for tasks. `current` is the existing row (null for insert);
 * `fields` is the insert payload or update patch. A field absent from `fields`
 * inherits its value from `current` (the merged resulting state).
 */
export function assertCompletionTriad(
  table: string,
  current: Record<string, unknown> | null,
  fields: Record<string, unknown>,
): string | null {
  if (table !== 'tasks') return null;

  // Resulting value of a column = patch value if present, else current value.
  const resolve = (col: string): unknown =>
    col in fields ? fields[col] : current ? current[col] : undefined;

  const status = resolve('status');

  // Tombstones are not completions — the deleted_at co-flip path owns that.
  if (status === 'deleted') return null;

  // Only enforce the triad when the resulting state TOUCHES completion, i.e. at
  // least one of the three signals is present in the incoming fields. A patch
  // that edits an unrelated field (e.g. due_date) on a row whose stored triad
  // is already (legitimately) inconsistent from a legacy write must NOT be
  // blocked — that is the Hub-UI partial-write false-fire this flag is isolated
  // to avoid. We only assert agreement when the WRITE asserts a completion signal.
  const touchesCompletion =
    'status' in fields || 'completed' in fields || 'completed_at' in fields;
  if (!touchesCompletion) return null;

  const completedRaw = resolve('completed');
  const completed = completedRaw === 1 || completedRaw === true;
  const completedAt = resolve('completed_at');
  const hasCompletedAt = completedAt !== null && completedAt !== undefined && completedAt !== '';

  const isDone = status === 'done';

  // status='done' must agree with completed=1 and completed_at present.
  if (isDone && !completed) {
    return `completion-triad: tasks.status='done' requires completed=1 (got ${JSON.stringify(completedRaw)})`;
  }
  if (isDone && !hasCompletedAt) {
    return `completion-triad: tasks.status='done' requires completed_at to be set`;
  }
  // completed=1 must agree with status='done'.
  if (completed && !isDone) {
    return `completion-triad: tasks.completed=1 requires status='done' (got status=${JSON.stringify(status)})`;
  }
  // completed_at set must agree with completed=1 (schema-v98 D1 trigger parity —
  // the 4th OR clause in trg_tasks_completion_triad_guard_ins/_upd). A
  // completed_at-only patch on an already-completed row PASSES here: `completed`
  // resolves from `current` when absent from `fields`, so this only fires when
  // the RESULTING state genuinely has completed_at set without completed=1.
  if (hasCompletedAt && !completed) {
    return `completion-triad: tasks.completed_at set requires completed=1 (got completed=${JSON.stringify(completedRaw)})`;
  }
  return null;
}

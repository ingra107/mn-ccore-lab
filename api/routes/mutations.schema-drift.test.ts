// Task B (2026-05-03): Co-flip symmetry lint meta-test for mutations.ts applyPatch.
//
// Motivation: commit f682f5df shipped `deleted_at = NOW()` when status='deleted'.
// The inverse (clear deleted_at when transitioning OUT of 'deleted') was absent
// until ebb39aef fixed it. The asymmetry was a class-1 latent bug from the moment
// f682f5df shipped. This test pins the invariant structurally so future co-flip
// additions must add both halves or CI fails.
//
// Approach: AST-free text pattern matching on the mutations.ts source. We parse
// the applyPatch function body as a string and assert that every
// "if (isTaskXByStatus)" forward branch has a sibling inverse branch.
//
// This is intentionally simpler than a full AST walk — mutations.ts co-flip
// logic uses a predictable named-constant pattern (isTask*ByStatus) that lets
// us enforce the rule with line-counting rather than tree walking.
//
// Task C (2026-05-03): _HUB_ONLY_FIELDS schema drift CI test.
//
// Motivation: commit 6beb1e0b expanded _HUB_ONLY_FIELDS in janitor_dead_letters.py
// by manual diff. If Hub adds a column to TABLE_FIELDS that is NOT in brain.db,
// _HUB_ONLY_FIELDS silently drifts, causing dead-letters to spuriously escalate
// instead of auto-resolving.
//
// Approach: read a checked-in snapshot (brain-db-schema-snapshot.json) that
// records the brain.db column sets per table. Compare against TABLE_FIELDS from
// mutations.ts. The diff (TABLE_FIELDS - brain_cols, accounting for the
// _HUB_TO_LOCAL rename map) must equal the _HUB_ONLY_FIELDS constant from
// janitor_dead_letters.py.
//
// The snapshot is manually updated when brain.db schema changes (hub-schema-sync
// specialist owns this). A snapshot mismatch causes a failing test which forces
// explicit review + _HUB_ONLY_FIELDS update.

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

// ── Shared: read mutations.ts source once ──────────────────────────────────

const MUTATIONS_SRC_PATH = resolve(__dirname, 'mutations.ts')
const mutationsSrc = readFileSync(MUTATIONS_SRC_PATH, 'utf-8')

// ── Task B: Co-flip symmetry lint ──────────────────────────────────────────

describe('mutations.ts applyPatch co-flip symmetry lint', () => {
  // Extract the applyPatch function body from source for scoped analysis.
  // We don't want to false-positive on co-flip constants defined OUTSIDE
  // applyPatch (there are none currently, but this is future-safe).
  function extractApplyPatchBody(src: string): string {
    const startMarker = 'async function applyPatch('
    const startIdx = src.indexOf(startMarker)
    if (startIdx === -1) throw new Error('applyPatch function not found in mutations.ts')

    // Walk forward to find the matching closing brace at function scope.
    let depth = 0
    let inBody = false
    let i = startIdx
    while (i < src.length) {
      if (src[i] === '{') {
        depth++
        inBody = true
      } else if (src[i] === '}') {
        depth--
        if (inBody && depth === 0) {
          return src.slice(startIdx, i + 1)
        }
      }
      i++
    }
    throw new Error('Could not find end of applyPatch function body')
  }

  const applyPatchBody = extractApplyPatchBody(mutationsSrc)

  it('every if(isTask*ByStatus) conditional has a sibling else-if(isTask*ByStatus) inverse branch', () => {
    // Rule: for every `if (isTaskFooByStatus)` in applyPatch, there must be
    // a sibling `} else if (isTaskBarByStatus)` that handles the reverse case.
    // This pins the if/else-if structure that prevents one-directional co-flip bugs.
    //
    // We match the if-branch flags and else-if-branch flags separately,
    // then assert at least one else-if exists for every standalone if.

    // Match: `} if (isTask...ByStatus)` or start-of-if (not preceded by 'else') — forward branch.
    // We use a negative lookbehind to exclude `else if` from the forward set.
    // Then separately match `else if` for the inverse set.
    const ifPattern = /(?<!else\s)\bif\s*\(\s*(isTask\w+ByStatus)\s*\)/g
    // Match: `} else if (isTask...ByStatus)` — inverse branch
    const elseIfPattern = /\belse\s+if\s*\(\s*(isTask\w+ByStatus)\s*\)/g

    const ifFlags: string[] = []
    const elseIfFlags: string[] = []

    let m: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((m = ifPattern.exec(applyPatchBody)) !== null) {
      ifFlags.push(m[1])
    }
    // eslint-disable-next-line no-cond-assign
    while ((m = elseIfPattern.exec(applyPatchBody)) !== null) {
      elseIfFlags.push(m[1])
    }

    expect(ifFlags.length).toBeGreaterThan(0)
    expect(
      elseIfFlags.length,
      `applyPatch has ${ifFlags.length} if(isTask*ByStatus) branch(es) but ${elseIfFlags.length} else-if branch(es). ` +
      `Every forward co-flip branch must have a symmetric inverse else-if branch. ` +
      `if-flags: ${ifFlags.join(', ')} | else-if-flags: ${elseIfFlags.join(', ')}`
    ).toBeGreaterThanOrEqual(ifFlags.length)
  })

  it('if conditional uses isTaskDeleteByStatus, a symmetric isTaskUndeleteByStatus branch exists', () => {
    // Direct assertion on the specific Delete/Undelete pair that was the incident.
    // This catches the exact asymmetry class from f682f5df / ebb39aef.
    expect(applyPatchBody).toContain('isTaskDeleteByStatus')
    expect(applyPatchBody).toContain('isTaskUndeleteByStatus')
  })

  it('fires (SYNTHETIC) — asymmetric-only source would fail the if/else-if count check', () => {
    // Synthetic failure test: construct a body that has a forward if(isTask*ByStatus)
    // but no else-if inverse. Proves the rule catches the missing-inverse case.
    const asymmetricBody = `
      async function applyPatch(env, mut, current) {
        const isTaskCancelByStatus =
          mut.table === 'tasks' &&
          patchedStatus === 'cancelled' &&
          !current.cancelled_at;
        // No else-if branch for the inverse — this is the asymmetric case
        if (isTaskCancelByStatus) {
          setClauses.push("cancelled_at = datetime('now')");
        }
      }
    `

    const ifPattern = /(?<!else\s)\bif\s*\(\s*(isTask\w+ByStatus)\s*\)/g
    const elseIfPattern = /\belse\s+if\s*\(\s*(isTask\w+ByStatus)\s*\)/g

    const ifFlags: string[] = []
    const elseIfFlags: string[] = []
    let mm: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((mm = ifPattern.exec(asymmetricBody)) !== null) ifFlags.push(mm[1])
    // eslint-disable-next-line no-cond-assign
    while ((mm = elseIfPattern.exec(asymmetricBody)) !== null) elseIfFlags.push(mm[1])

    // if-count=1, else-if-count=0 → the rule would fire
    expect(ifFlags.length).toBe(1)
    expect(elseIfFlags.length).toBe(0)
    // The actual rule: elseIfFlags.length >= ifFlags.length → false → test fails
    expect(elseIfFlags.length < ifFlags.length).toBe(true) // proves the rule catches it
  })
})

// ── Task C: _HUB_ONLY_FIELDS schema drift test ────────────────────────────

// Snapshot of brain.db column sets per table. Updated by hub-schema-sync specialist
// when brain.db schema changes. The snapshot encodes what PB's brain.db has AFTER
// applying the _HUB_TO_LOCAL rename map (i.e., brain.db names, not Hub names).
// Infrastructure columns (id, seq, last_mutation_id, etc.) are excluded because
// they never cross the sync boundary and are not in TABLE_FIELDS.
//
// To regenerate: python scripts/db/generate_hub_schema_snapshot.py > api/brain-db-schema-snapshot.json
const SNAPSHOT_PATH = resolve(__dirname, '../brain-db-schema-snapshot.json')

interface BrainDbSnapshot {
  generated_at: string
  // Hub rename map: Hub field → brain.db field (applied BEFORE comparing)
  hub_to_local: Record<string, Record<string, string>>
  // brain.db columns (non-infra) per table, after rename map applied
  brain_cols: Record<string, string[]>
  // The computed hub_only_fields: TABLE_FIELDS_HUB_NAME - brain_cols_after_rename
  // (kept in snapshot for documentation; test recomputes it)
  hub_only_fields: Record<string, string[]>
}

// Extract TABLE_FIELDS from mutations.ts source as a set per table.
function extractTableFields(src: string): Record<string, Set<string>> {
  const tableFields: Record<string, Set<string>> = {}

  // Match: tasks: new Set([ ... ])
  const tablePattern = /(\w+):\s*new Set\(\[\s*([\s\S]*?)\s*\]\)/g
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = tablePattern.exec(src)) !== null) {
    const tableName = m[1]
    const fieldsBlock = m[2]
    const fields = new Set<string>()
    // Extract quoted field names
    const fieldPattern = /'(\w+)'/g
    let fm: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((fm = fieldPattern.exec(fieldsBlock)) !== null) {
      fields.add(fm[1])
    }
    if (fields.size > 0) {
      tableFields[tableName] = fields
    }
  }
  return tableFields
}

describe('_HUB_ONLY_FIELDS schema drift gate (Task C)', () => {
  let snapshot: BrainDbSnapshot

  try {
    const raw = readFileSync(SNAPSHOT_PATH, 'utf-8')
    snapshot = JSON.parse(raw) as BrainDbSnapshot
  } catch (e) {
    // Snapshot file missing — fail loudly so CI catches it
    it('FAIL: brain-db-schema-snapshot.json is missing', () => {
      throw new Error(
        `brain-db-schema-snapshot.json not found at ${SNAPSHOT_PATH}. ` +
        `Run: python scripts/db/generate_hub_schema_snapshot.py > api/brain-db-schema-snapshot.json`
      )
    })
    // Skip remaining tests in this describe
    return
  }

  const tableFields = extractTableFields(mutationsSrc)

  it('TABLE_FIELDS was parsed successfully from mutations.ts', () => {
    expect(Object.keys(tableFields)).toContain('tasks')
    expect(Object.keys(tableFields)).toContain('projects')
    expect(tableFields['tasks'].size).toBeGreaterThan(10)
  })

  it('snapshot.brain_cols was loaded', () => {
    expect(snapshot.brain_cols).toBeDefined()
    expect(snapshot.brain_cols['tasks']).toBeDefined()
  })

  for (const table of ['tasks', 'projects']) {
    it(`${table}: computed hub_only_fields matches snapshot.hub_only_fields`, () => {
      const hubFields = tableFields[table]
      if (!hubFields) return // table not in TABLE_FIELDS — skip

      const brainCols = new Set(snapshot.brain_cols[table] ?? [])
      const hubToLocal = snapshot.hub_to_local[table] ?? {}

      // For each Hub field, check if it maps to a brain.db column via rename map.
      // A field is hub-only if NEITHER the hub name NOR the local rename exists in brain_cols.
      const hubOnly: string[] = []
      for (const hubField of hubFields) {
        const localField = hubToLocal[hubField] ?? hubField
        if (!brainCols.has(localField)) {
          hubOnly.push(hubField)
        }
      }

      const snapshotHubOnly = new Set(snapshot.hub_only_fields[table] ?? [])
      const computedHubOnly = new Set(hubOnly)

      // Fields in computed but not in snapshot → Hub added a column, _HUB_ONLY_FIELDS needs update
      const added = [...computedHubOnly].filter(f => !snapshotHubOnly.has(f))
      // Fields in snapshot but not computed → Hub removed a column, snapshot stale
      const removed = [...snapshotHubOnly].filter(f => !computedHubOnly.has(f))

      expect(
        added,
        `Hub added fields to TABLE_FIELDS[${table}] not in brain.db. ` +
        `Update _HUB_ONLY_FIELDS in janitor_dead_letters.py and regenerate the snapshot.`
      ).toHaveLength(0)

      expect(
        removed,
        `Snapshot hub_only_fields[${table}] contains fields no longer in TABLE_FIELDS. ` +
        `Regenerate the snapshot.`
      ).toHaveLength(0)
    })
  }
})

// ── PK_COLUMN map coverage (Stage 3 Phase 2) ────────────────────────────────
//
// Motivation: mutations.ts previously hardcoded idCol = mut.table === 'day_capacity' ? 'date' : 'id'
// at applyInsert, applyPatch, applyDelete, and readCanonical — all 9 Stage 3 Phase 1 tables
// with natural keys (sessions, decisions, kg_relation_type_registry, etc.) would resolve
// to PK='id', causing D1 row writes at the wrong column. This test pins the PK_COLUMN
// constant so adding a new Stage 3 table forces an explicit PK declaration.
//
// Approach: text-scan the PK_COLUMN const block; assert all Stage 2 required entries
// are present. Also verify pkColumn() is used at every idCol assignment site.

describe('PK_COLUMN map — Stage 3 Phase 2 natural key coverage', () => {
  // Required entries for Stage 2 (sessions canary + decisions + kg_relation_type_registry)
  const REQUIRED_ENTRIES: Record<string, string> = {
    day_capacity: 'date',
    sessions: 'session_id',
    decisions: 'context_id',
    kg_relation_type_registry: 'relation_type',
  }

  it('PK_COLUMN constant contains all Stage 2 required entries', () => {
    // Parse the PK_COLUMN block from source
    const pkBlockMatch = mutationsSrc.match(/const PK_COLUMN[^=]*=\s*\{([\s\S]*?)\};/)
    expect(pkBlockMatch, 'PK_COLUMN const not found in mutations.ts').toBeTruthy()
    const pkBlock = pkBlockMatch![1]

    for (const [table, col] of Object.entries(REQUIRED_ENTRIES)) {
      expect(
        pkBlock,
        `PK_COLUMN missing entry for table '${table}' (expected PK='${col}'). ` +
        `All Stage 3 tables with non-'id' PKs must be registered here.`
      ).toContain(table)
      expect(
        pkBlock,
        `PK_COLUMN entry for '${table}' should map to '${col}'`
      ).toContain(col)
    }
  })

  it('no raw idCol ternary remains in mutations.ts (all sites use pkColumn())', () => {
    // Regression guard: the old ternary pattern must not be re-introduced.
    const oldPattern = /idCol\s*=\s*\w+\.table\s*===\s*['"]day_capacity['"]\s*\?/
    expect(
      oldPattern.test(mutationsSrc),
      'Found old hardcoded ternary for day_capacity PK. Use pkColumn() instead.'
    ).toBe(false)
  })

  it('pkColumn() is called at every idCol assignment site', () => {
    // Every `const idCol` or `let idCol` assignment must use pkColumn()
    const idColAssignments = [...mutationsSrc.matchAll(/(?:const|let)\s+idCol\s*=/g)]
    expect(idColAssignments.length).toBeGreaterThan(0)

    const idColPkColumn = [...mutationsSrc.matchAll(/(?:const|let)\s+idCol\s*=\s*pkColumn\(/g)]
    // Also allow inline pkColumn() calls (without idCol variable)
    const inlinePkColumn = [...mutationsSrc.matchAll(/pkColumn\(/g)]

    expect(
      idColPkColumn.length,
      `Expected all idCol assignments to use pkColumn(). ` +
      `Found ${idColAssignments.length} idCol assignments, ${idColPkColumn.length} use pkColumn().`
    ).toBe(idColAssignments.length)

    // At least 3 call sites (applyInsert, applyPatch/UPDATE, readCanonical)
    expect(inlinePkColumn.length).toBeGreaterThanOrEqual(3)
  })
})

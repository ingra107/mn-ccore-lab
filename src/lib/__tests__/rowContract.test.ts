/**
 * rowContract — #811 (2026-07-29): proves the hand-maintained `ProjectRow` /
 * `TaskRow` interfaces (src/lib/api.ts) declare every PB-synced wire field
 * the pb-schema field registry says the Hub carries.
 *
 * The failure class this closes: a synced D1 column reaches the browser at
 * runtime (GET /api/projects is SELECT *; task reads project TASK_SELECT_COLS
 * derived from the generated TASK_PLAIN_COLS) but stays invisible to
 * TypeScript because nobody declared it on the *Row interface — exactly how
 * key_link_1..3 sat unreadable for months (found 2026-07-21, 465e0432).
 *
 * Mechanism (two halves, composed):
 *   compile time — PROJECT_ROW_KEYS/TASK_ROW_KEYS are `satisfies`-bound to
 *     the interface (no phantom keys) and *_KEYS_COMPLETE fails to compile
 *     when the interface has a key the list lacks (no stale list).
 *   run time (this file) — every registry hub field, mapped through the
 *     PB->wire naming seam, must be in the corresponding KEYS list.
 *
 * Composition: registry wire field => in KEYS list => declared on the
 * interface. A pb-schema bump that adds a synced field fails this test until
 * the interface learns it.
 *
 * NOT covered (no static enumerator exists): PublicationRow, TeamMemberRow,
 * GrantRow — Hub-native tables outside pb-schema. Their gap stays open.
 *
 * Run: npx vitest run --config vitest.config.lib.ts src/lib/__tests__/rowContract.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  PROJECT_ROW_KEYS,
  TASK_ROW_KEYS,
  PROJECT_ROW_KEYS_COMPLETE,
  TASK_ROW_KEYS_COMPLETE,
} from '../api'

// PB-side field name -> wire/D1 column name. The ONE naming seam between the
// registry (PB names) and the wire contract (field-authority.generated.ts):
// PB `name` travels as `title` for both tables. Everything else is identical
// (verified 2026-07-29 by diffing the registry hub sets against the generated
// route-field-lists / field-authority projects Set).
const PB_TO_WIRE: Record<string, string> = { name: 'title' }

// Registry hub fields the task READ projection does not return under the same
// name: `project_id` is resolved to the project SLUG by TASK_SELECT_COLS but
// still travels under the `project_id` key — no exception needed. (Kept as a
// named constant so future genuine read-projection exclusions have a home.)
const TASK_READ_EXCLUDED: string[] = []

interface FieldRegistry {
  tables: Record<string, { hub: string[] }>
  version?: string
}

function loadRegistry(): FieldRegistry {
  // vitest runs with cwd = repo root (configs live there).
  const p = resolve(process.cwd(), 'pb-schema/pb_schema/generated/field-registry.generated.json')
  return JSON.parse(readFileSync(p, 'utf-8')) as FieldRegistry
}

describe('rowContract — pb-schema wire fields are declared on the *Row interfaces', () => {
  const registry = loadRegistry()

  it('registry loads and carries both tables', () => {
    expect(registry.tables.projects?.hub?.length).toBeGreaterThan(30)
    expect(registry.tables.tasks?.hub?.length).toBeGreaterThan(30)
  })

  it('every projects hub field is declared on ProjectRow', () => {
    const declared = new Set<string>(PROJECT_ROW_KEYS)
    const missing = registry.tables.projects.hub
      .map((f) => PB_TO_WIRE[f] ?? f)
      .filter((f) => !declared.has(f))
    expect(missing).toEqual([])
  })

  it('every tasks hub field is declared on TaskRow', () => {
    const declared = new Set<string>(TASK_ROW_KEYS)
    const missing = registry.tables.tasks.hub
      .map((f) => PB_TO_WIRE[f] ?? f)
      .filter((f) => !TASK_READ_EXCLUDED.includes(f) && !declared.has(f))
    expect(missing).toEqual([])
  })

  it('KEYS lists carry no duplicates', () => {
    expect(new Set(PROJECT_ROW_KEYS).size).toBe(PROJECT_ROW_KEYS.length)
    expect(new Set(TASK_ROW_KEYS).size).toBe(TASK_ROW_KEYS.length)
  })

  it('compile-time completeness asserts are live (imported, not tree-shaken)', () => {
    // Their VALUE is trivially true; their TYPE is the gate — a key missing
    // from the list turns the annotation into an object type and api.ts
    // stops compiling. Importing them here keeps them un-deletable.
    expect(PROJECT_ROW_KEYS_COMPLETE).toBe(true)
    expect(TASK_ROW_KEYS_COMPLETE).toBe(true)
  })
})

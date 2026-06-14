// api/routes/mutations.m5-contract.test.ts
//
// M5 notes-privacy contract gate (Hub side). Mirrors the PB-side contract test.
//
// Model A (2026-06-13 spec): `notes` is brain.db-only (NEVER on the wire);
// `description` is the task/project BODY field and the wire identity. After M5
// Slice-2 (pb-schema 0.6.0 + brain.db mig-107 + snapshot regen) the contract
// MUST hold for both tasks and projects:
//   - description ∈ TABLE_FIELDS[t]            → description is a wire field
//   - notes ∉ TABLE_FIELDS[t]                  → notes is brain-only, never wire
//   - snapshot.brain_cols[t] ⊇ {description}   → real local column (mig-107)
//   - snapshot.hub_to_local[t].description === undefined
//                                              → no rename; description → description
//
// This pins the flip so a regression that re-adds `notes` to the wire, or
// reverts `description` to a rename alias, fails CI. Companion to
// mutations.notes-leak.test.ts (which asserts a wire payload carrying `notes`
// is rejected — that stays valid under Model A and is intentionally untouched).

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
// TABLE_FIELDS is the pb-schema package SSOT (generated field-authority). Import
// directly so this gate always sees the live contract.
import { TABLE_FIELDS } from '../../pb-schema/pb_schema/generated/field-authority.generated.ts'

const SNAPSHOT_PATH = resolve(__dirname, '../brain-db-schema-snapshot.json')

interface BrainDbSnapshot {
  hub_to_local: Record<string, Record<string, string>>
  brain_cols: Record<string, string[]>
  hub_only_fields: Record<string, string[]>
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as BrainDbSnapshot

const TABLES = ['tasks', 'projects'] as const

describe('M5 notes-privacy contract (Model A: notes brain-only, description on the wire)', () => {
  for (const t of TABLES) {
    it(`${t}: description ∈ TABLE_FIELDS (description is the wire body field)`, () => {
      expect(TABLE_FIELDS[t]).toBeDefined()
      expect(TABLE_FIELDS[t].has('description')).toBe(true)
    })

    it(`${t}: notes ∉ TABLE_FIELDS (notes is brain.db-only, never on the wire)`, () => {
      expect(TABLE_FIELDS[t].has('notes')).toBe(false)
    })

    it(`${t}: snapshot.brain_cols includes description (real local column, mig-107)`, () => {
      expect(snapshot.brain_cols[t]).toBeDefined()
      expect(snapshot.brain_cols[t]).toContain('description')
    })

    it(`${t}: snapshot.hub_to_local has no description rename (description → description)`, () => {
      expect(snapshot.hub_to_local[t]?.description).toBeUndefined()
    })
  }
})

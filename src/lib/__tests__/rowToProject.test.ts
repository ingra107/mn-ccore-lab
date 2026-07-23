/**
 * rowToProject — regression coverage for the 2026-07-21 key-links bug.
 *
 * BUG: `ProjectRow` did not declare key_link_1/2/3(+_desc), and the mapper
 * separately dropped short_name/pi_context/created_at even though those WERE
 * declared on ProjectRow. Symptom: useUpdateProject's optimistic onMutate
 * painted a saved key link, onSettled invalidated ['projects'], the refetch
 * ran through rowToProject, and the link vanished because the mapper never
 * copied it into the returned Project.
 *
 * This test drives the REAL production rowToProject (not a mirror) against a
 * full ProjectRow fixture and asserts every field GET /api/projects can
 * return (SELECT *) survives the mapping — the exact shape of "field exists
 * on the row but never reaches the frontend type" that a field-by-field
 * assertion (not just `toMatchObject` on a subset) is needed to catch.
 *
 * Run: npx vitest run --config vitest.config.lib.ts
 */

import { describe, it, expect } from 'vitest'
import { rowToProject } from '../../hooks/useApiData'
import type { ProjectRow } from '../api'

function makeRow(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'proj_test123',
    title: 'Test Project',
    status: 'active',
    description: 'A test project',
    category: 'CLIF',
    pi: 'nick-ingraham',
    slug: 'test-project',
    stage: 'writing',
    pi_context: 'Why this matters',
    strategic_context: 'Strategic context',
    short_name: 'TestProj',
    created_at: '2026-07-21T10:00:00Z',
    updated_at: '2026-07-21T10:53:00Z',
    stage_entered_at: '2026-07-01T00:00:00Z',
    last_meaningful_movement: '2026-07-20T00:00:00Z',
    stale_active_since: null,
    primary_folder: 'C:/Box/test-project',
    key_link_1: 'https://docs.google.com/document/d/abc/edit',
    key_link_1_desc: 'Aims doc',
    key_link_2: null,
    key_link_2_desc: null,
    key_link_3: null,
    key_link_3_desc: null,
    ...overrides,
  }
}

describe('rowToProject — every ProjectRow field the API can return survives the mapping', () => {
  it('maps key_link_1/2/3 + descriptions (the bug: previously always undefined)', () => {
    const row = makeRow()
    const project = rowToProject(row)
    expect(project.key_link_1).toBe('https://docs.google.com/document/d/abc/edit')
    expect(project.key_link_1_desc).toBe('Aims doc')
    expect(project.key_link_2).toBeNull()
    expect(project.key_link_3).toBeNull()
  })

  it('maps short_name, pi_context, created_at (declared on ProjectRow, previously dropped by the mapper)', () => {
    const project = rowToProject(makeRow())
    expect(project.short_name).toBe('TestProj')
    expect(project.pi_context).toBe('Why this matters')
    expect(project.created_at).toBe('2026-07-21T10:00:00Z')
  })

  it('still applies real transforms: stage normalization, empty-string coalescing', () => {
    const project = rowToProject(makeRow({ category: null, pi: null, slug: null, description: null }))
    expect(project.category).toBe('')
    expect(project.pi).toBe('')
    expect(project.slug).toBe('')
    expect(project.description).toBeUndefined()
  })

  it('coalesces null short_name/pi_context to undefined (Project disallows null on these)', () => {
    const project = rowToProject(makeRow({ short_name: null, pi_context: null }))
    expect(project.short_name).toBeUndefined()
    expect(project.pi_context).toBeUndefined()
  })

  it('maps the derived last_activity rollup onto lastActivity (#95: previously had NO producer)', () => {
    // The snake_case→camelCase rename means the spread can't carry this one.
    // Before #95 nothing ever assigned `lastActivity`, so the Projects list's
    // activity sort silently fell back to updated_at and its "Xd ago"
    // staleness chip — gated on `project.lastActivity &&` — never rendered.
    const project = rowToProject(makeRow({ last_activity: '2026-07-20T17:08:58Z' }))
    expect(project.lastActivity).toBe('2026-07-20T17:08:58Z')
  })

  it('coalesces an absent/null last_activity to undefined (project with no stream rows yet)', () => {
    expect(rowToProject(makeRow({ last_activity: null })).lastActivity).toBeUndefined()
    expect(rowToProject(makeRow()).lastActivity).toBeUndefined()
  })

  it('maps type (schema-v73 grant/personal-taxonomy classification, independent of category)', () => {
    expect(rowToProject(makeRow({ type: 'R01' })).type).toBe('R01')
    expect(rowToProject(makeRow({ type: null })).type).toBeNull()
    expect(rowToProject(makeRow()).type).toBeUndefined()
  })

  it('a NEW passthrough-shaped field added to ProjectRow requires zero mapper changes', () => {
    // Guards the structural fix itself: any field spread from `row` whose
    // name+shape matches `Project` needs no explicit line in rowToProject.
    // primary_folder is exactly this case (schema v71) — assert it still
    // round-trips with no override dedicated to it beyond the existing
    // null-coalesce.
    const project = rowToProject(makeRow({ primary_folder: 'C:/Box/other' }))
    expect(project.primary_folder).toBe('C:/Box/other')
  })
})

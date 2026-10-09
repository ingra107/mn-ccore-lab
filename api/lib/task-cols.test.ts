import { describe, it, expect } from 'vitest'
import { TABLE_PRIVATE_COLS, safeRow, FK_SLUG_FIELDS, TASK_SELECT_COLS } from './task-cols'

describe('TABLE_PRIVATE_COLS — Z3 expansion', () => {
  it('inbox_events strips raw_payload_json + notes', () => {
    expect(TABLE_PRIVATE_COLS['inbox_events']).toBeDefined()
    const stripped = safeRow('inbox_events', {
      id: 'e1', source: 'gmail', raw_payload_json: '{"sec":"ret"}', notes: 'private'
    })
    expect(stripped).toEqual({ id: 'e1', source: 'gmail' })
  })

  it('regulatory_items strips notes', () => {
    expect(TABLE_PRIVATE_COLS['regulatory_items']).toBeDefined()
    const stripped = safeRow('regulatory_items', {
      id: 'r1', title: 'IRB', notes: 'PI-only context'
    })
    expect(stripped).toEqual({ id: 'r1', title: 'IRB' })
  })
})

describe('FK_SLUG_FIELDS — Z3.2 expansion', () => {
  it('registers project_id on all project-linked tables', () => {
    // Floor: tasks (existing) + 7 sibling tables that hold a projects-FK.
    const expectedTables = [
      'tasks', 'submission_events', 'conference_submissions',
      'regulatory_items', 'manuscript_revisions', 'project_documents',
      // deadline_dependencies intentionally absent: no project_id column (Z4.3 exempt)
    ]
    for (const t of expectedTables) {
      expect(FK_SLUG_FIELDS[t], `${t} should be registered`).toContain('project_id')
    }
  })
})

describe('TASK_SELECT_COLS — project_id resolved to slug at the read boundary', () => {
  // Direction 1 (2026-06-05): storage holds the typed proj_* PK; every task-read
  // endpoint must PRESENT the project slug. Resolution is a single
  // correlated-subquery chokepoint so no task read leaks the typed PK. These
  // guards fail if a future edit reverts to selecting the raw `t.project_id`
  // column (the P2 `aa85c71b` half-migration bug: ~20 tasks rendered unlinked +
  // sync silently broken). Decision: PB
  // 2026-06-05-tasks-project-id-store-typed-present-slug.md.
  // 2026-10-09: no raw fallback. A scoped caller's handle hides a project
  // they are not on, and COALESCE(slug, t.project_id) then handed them that
  // hidden project's typed id (the first step of the slug spoof).
  it('aliases a slug subquery (by id or legacy slug) AS project_id, with no raw fallback', () => {
    expect(TASK_SELECT_COLS).toContain('AS project_id')
    expect(TASK_SELECT_COLS).toContain(
      '(SELECT p.slug FROM projects p WHERE p.id = t.project_id OR p.slug = t.project_id LIMIT 1) AS project_id',
    )
    expect(TASK_SELECT_COLS).not.toContain('COALESCE((SELECT p.slug')
  })

  it('never selects the raw t.project_id column on its own (would leak the typed PK)', () => {
    // Inside the subquery the token is followed by ' OR'/' LIMIT', so this standalone-column
    // pattern must NOT match anywhere in the select list.
    expect(TASK_SELECT_COLS).not.toMatch(/(^|,\s*)t\.project_id(\s*,|\s*$)/)
  })
})

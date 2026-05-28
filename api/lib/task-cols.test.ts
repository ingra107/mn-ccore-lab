import { describe, it, expect } from 'vitest'
import { TABLE_PRIVATE_COLS, safeRow, FK_SLUG_FIELDS } from './task-cols'

describe('TABLE_PRIVATE_COLS — Z3 expansion', () => {
  it('email_drafts strips body_text + body_html + thread_id', () => {
    expect(TABLE_PRIVATE_COLS['email_drafts']).toBeDefined()
    const stripped = safeRow('email_drafts', {
      id: 'd1', subject: 'hi', body_text: 'SECRET', body_html: '<p>SECRET</p>', thread_id: 'thr-1'
    })
    expect(stripped).toEqual({ id: 'd1', subject: 'hi' })
  })

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
      'deadline_dependencies',
    ]
    for (const t of expectedTables) {
      expect(FK_SLUG_FIELDS[t], `${t} should be registered`).toContain('project_id')
    }
  })
})

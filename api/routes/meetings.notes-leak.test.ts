// Phase 2 — notes privacy leak guard (meetings read-side)
//
// SEC-P2-02: handleGetMeeting must NOT include `notes` in action_items
//            (task rows) returned under the meeting detail response.
//
// Meeting agenda/notes themselves are team-internal-visible by design.
// Only the task rows (action_items array) are the leak risk.
//
// TDD: write these tests first, run → FAIL, then fix the handler.

import { describe, it, expect } from 'vitest'
import { handleGetMeeting } from './meetings'
import type { Env } from '../helpers'

// ── Stub helpers ──────────────────────────────────────────────────────────────

const MEETING_ID = 'mtg_01hwtest_notes_leak_0001'

const meetingRow = {
  id: MEETING_ID,
  title: 'Lab Meeting 2026-05-27',
  date: '2026-05-27',
  type: 'lab',
  status: 'scheduled',
  facilitator: 'nick-ingraham',
  agenda: 'Team updates',
  notes: 'Meeting notes visible to team — OK',
  decisions: 'None yet',
  attendees: 'nick-ingraham,nate-mesfin',
  created_at: '2026-05-27T00:00:00Z',
  updated_at: '2026-05-27T00:00:00Z',
}

const taskWithNotes = {
  id: 'task_01hwtest_mtg_notes_0001',
  title: 'Follow up with IRB',
  description: 'Submit amendment',
  assignee: 'nate-mesfin',
  assigned_by: 'ingra107@umn.edu',
  status: 'todo',
  completed: 0,
  priority: 'high',
  notes: 'PRIVATE brain.db note — must not reach team via meeting detail',
  meeting_id: MEETING_ID,
  deleted_at: null,
  seq: 3,
  last_mutation_id: null,
}

function makeMeetingEnv(): Env {
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            const upper = sql.trim().toUpperCase()
            if (upper.includes('FROM MEETINGS')) return { ...meetingRow }
            return null
          },
          all: async () => {
            const upper = sql.trim().toUpperCase()
            if (upper.includes('FROM TASKS')) {
              return { results: [{ ...taskWithNotes }] }
            }
            // agenda_items
            return { results: [] }
          },
          run: async () => ({ meta: { changes: 1 } }),
        }),
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ meta: {} }),
      }),
    },
  } as unknown as Env
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('handleGetMeeting — SEC-P2-02 notes not in action_items', () => {
  it('action_items in meeting detail response do not contain notes field', async () => {
    const env = makeMeetingEnv()
    const res = await handleGetMeeting(MEETING_ID, env)
    const body = await res.json() as {
      data: {
        action_items: Record<string, unknown>[]
        notes: string
      }
    }

    expect(res.status).toBe(200)
    expect(body.data.action_items).toHaveLength(1)
    const item = body.data.action_items[0]
    expect(item).not.toHaveProperty('notes')
  })

  it('action_items still contain non-private fields', async () => {
    const env = makeMeetingEnv()
    const res = await handleGetMeeting(MEETING_ID, env)
    const body = await res.json() as {
      data: { action_items: Record<string, unknown>[] }
    }

    const item = body.data.action_items[0]
    expect(item).toHaveProperty('id', 'task_01hwtest_mtg_notes_0001')
    expect(item).toHaveProperty('title', 'Follow up with IRB')
    expect(item).toHaveProperty('assignee', 'nate-mesfin')
    expect(item).toHaveProperty('status', 'todo')
  })

  it('meeting-level notes field is still present (team-internal, not private)', async () => {
    // Meeting notes (the meeting row itself) are team-visible by design.
    // This test guards we did NOT accidentally strip the meeting's own notes.
    const env = makeMeetingEnv()
    const res = await handleGetMeeting(MEETING_ID, env)
    const body = await res.json() as { data: Record<string, unknown> }

    expect(body.data).toHaveProperty('notes', 'Meeting notes visible to team — OK')
  })
})

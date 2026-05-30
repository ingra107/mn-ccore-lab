// Slice 4 (2026-05-29) — handleCreateMeeting persists the PB meeting summary.
//
// The PB meeting-debrief pipeline POSTs { date, title, type, attendees, notes,
// decisions } to /api/meetings. Before Slice 4 the handler read only
// {date,title,type,attendees} and INSERTed 6 columns — `notes`/`decisions` in
// the payload were silently DROPPED. This guards the fix:
//   1. notes (+decisions) land on the INSERT path.
//   2. notes (+decisions) UPDATE the existing row on the dedup (upsert) path —
//      so a summary generated AFTER the first (summary-less) push refreshes it.
//   3. a re-push with a null/absent notes does NOT wipe existing notes
//      (COALESCE guard), and an insert-only re-push is a no-op on those fields.
//
// A small stateful in-memory `meetings` table backs env.DB so the INSERT →
// SELECT-back and dedup SELECT → UPDATE → SELECT-back round-trips behave like
// real D1. No live binding, no network, no prod Hub.

import { describe, it, expect, beforeEach } from 'vitest'
import { handleCreateMeeting } from './meetings'
import type { AuthUser, Env } from '../helpers'

// ── Minimal stateful D1 stub (meetings + activity_log) ───────────────────────

type Row = Record<string, unknown>

function normalize(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, ' ')
}

function makeStatefulEnv(seed: Row[] = []): { env: Env; meetings: Row[] } {
  const meetings: Row[] = seed.map((r) => ({ ...r }))

  const prepare = (sql: string) => {
    const s = sql.trim()
    const upper = s.toUpperCase()
    return {
      bind: (...args: unknown[]) => ({
        all: async <T = Row>() => {
          if (upper.startsWith('SELECT') && upper.includes('FROM MEETINGS') && upper.includes('WHERE DATE =')) {
            const date = args[0]
            return { results: meetings.filter((m) => m.date === date) as T[] }
          }
          return { results: [] as T[] }
        },
        first: async <T = Row>() => {
          if (upper.startsWith('SELECT') && upper.includes('FROM MEETINGS') && upper.includes('WHERE ID =')) {
            const id = args[args.length - 1]
            return (meetings.find((m) => m.id === id) as T) ?? null
          }
          return null
        },
        run: async () => {
          if (upper.startsWith('INSERT INTO MEETINGS')) {
            // INSERT (id, date, title, type, attendees, notes, decisions, status)
            const [id, date, title, type, attendees, notes, decisions, status] = args
            meetings.push({
              id, date, title, type, attendees,
              notes: notes ?? null, decisions: decisions ?? null,
              status, created_at: '2026-05-29T00:00:00Z', updated_at: '2026-05-29T00:00:00Z',
            })
            return { meta: { changes: 1 } }
          }
          if (upper.startsWith('UPDATE MEETINGS')) {
            // UPDATE ... SET notes = COALESCE(?, notes), decisions = COALESCE(?, decisions), updated_at = ... WHERE id = ?
            const [notesArg, decisionsArg, id] = args
            const row = meetings.find((m) => m.id === id)
            if (row) {
              if (notesArg !== null && notesArg !== undefined) row.notes = notesArg
              if (decisionsArg !== null && decisionsArg !== undefined) row.decisions = decisionsArg
              row.updated_at = '2026-05-29T12:00:00Z'
              return { meta: { changes: 1 } }
            }
            return { meta: { changes: 0 } }
          }
          // activity_log insert and anything else: no-op
          return { meta: { changes: 1 } }
        },
      }),
      // bare (un-bound) calls — not used by handleCreateMeeting, kept for safety
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ meta: { changes: 0 } }),
    }
  }

  const env = { DB: { prepare } } as unknown as Env
  return { env, meetings }
}

function makeUser(email = 'ingra107@umn.edu'): AuthUser {
  return { email, name: 'Nick Ingraham' } as AuthUser
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('https://example.com/api/meetings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Normalize helper used to pre-seed an existing meeting whose title collapses
// to the same key as the re-push title.
const _ = normalize // referenced so eslint doesn't flag the helper as unused
void _

// ── Tests ────────────────────────────────────────────────────────────────────

describe('handleCreateMeeting — Slice 4 notes/decisions persistence', () => {
  let envBundle: { env: Env; meetings: Row[] }

  beforeEach(() => {
    envBundle = makeStatefulEnv()
  })

  it('persists notes (and decisions) on the INSERT path', async () => {
    const { env, meetings } = envBundle
    const summary = '## Summary\n\nNick and Adams discussed the R03 resubmission.\n\n### Decisions\n- Proceed as A1.'
    const decisions = '- Proceed as A1 under RFA-HL-27-004'
    const res = await handleCreateMeeting(
      makeRequest({
        date: '2026-05-29',
        title: 'MN-CCORE: Nick Adams',
        type: 'biweekly',
        attendees: ['dudley@umn.edu', 'ingra107@umn.edu'],
        notes: summary,
        decisions,
      }),
      makeUser(), env,
    )
    const body = await res.json() as { data: Row }

    expect(res.status).toBe(201)
    expect(body.data.notes).toBe(summary)
    expect(body.data.decisions).toBe(decisions)
    // and it actually landed in the backing table (not just echoed)
    expect(meetings).toHaveLength(1)
    expect(meetings[0].notes).toBe(summary)
    expect(meetings[0].decisions).toBe(decisions)
  })

  it('INSERT path tolerates an absent notes/decisions (null persisted)', async () => {
    const { env, meetings } = envBundle
    const res = await handleCreateMeeting(
      makeRequest({ date: '2026-05-29', title: 'Bare Meeting' }),
      makeUser(), env,
    )
    const body = await res.json() as { data: Row }
    expect(res.status).toBe(201)
    expect(body.data.notes).toBeNull()
    expect(meetings[0].notes).toBeNull()
  })

  it('UPDATEs notes on the dedup (upsert) path — late summary refreshes the row', async () => {
    // First push: no summary yet (note written before extraction).
    const { env, meetings } = envBundle
    await handleCreateMeeting(
      makeRequest({ date: '2026-05-29', title: 'MN-CCORE: Nick Adams', type: 'biweekly' }),
      makeUser(), env,
    )
    expect(meetings).toHaveLength(1)
    expect(meetings[0].notes).toBeNull()

    // Second push (same date, same normalized title, casing/space variant):
    // now carries the generated summary. Must UPDATE the existing row, not
    // create a duplicate, and return 200.
    const summary = '## Summary\n\nFull extracted summary text.'
    const res = await handleCreateMeeting(
      makeRequest({
        date: '2026-05-29',
        title: 'mn-ccore:  nick  adams', // normalizes to the same key
        notes: summary,
        decisions: '- ship it',
      }),
      makeUser(), env,
    )
    const body = await res.json() as { data: Row }

    expect(res.status).toBe(200)
    expect(meetings).toHaveLength(1) // no duplicate created
    expect(meetings[0].notes).toBe(summary)
    expect(meetings[0].decisions).toBe('- ship it')
    expect(body.data.notes).toBe(summary)
  })

  it('dedup re-push with NULL notes does NOT wipe an existing non-null notes', async () => {
    // Seed an existing meeting that already has a summary.
    const existingNotes = '## Summary\n\nAlready-summarized meeting.'
    const { env, meetings } = makeStatefulEnv([
      {
        id: 'mtg-2026-05-29-abc12345',
        date: '2026-05-29',
        title: 'MN-CCORE: Nick Adams',
        type: 'biweekly',
        attendees: null,
        notes: existingNotes,
        decisions: '- prior decision',
        status: 'upcoming',
        created_at: '2026-05-29T00:00:00Z',
        updated_at: '2026-05-29T00:00:00Z',
      },
    ])

    // Re-push WITHOUT notes/decisions (e.g. an insert-only capture surface).
    const res = await handleCreateMeeting(
      makeRequest({ date: '2026-05-29', title: 'MN-CCORE: Nick Adams' }),
      makeUser(), env,
    )
    const body = await res.json() as { data: Row }

    expect(res.status).toBe(200)
    expect(meetings).toHaveLength(1)
    // existing summary preserved, not clobbered to null
    expect(meetings[0].notes).toBe(existingNotes)
    expect(meetings[0].decisions).toBe('- prior decision')
    expect(body.data.notes).toBe(existingNotes)
  })

  it('dedup re-push with EXPLICIT null notes still does not wipe existing notes', async () => {
    const existingNotes = 'kept'
    const { env, meetings } = makeStatefulEnv([
      {
        id: 'mtg-2026-05-29-def67890',
        date: '2026-05-29',
        title: 'Lab Sync',
        notes: existingNotes,
        decisions: null,
        status: 'upcoming',
      },
    ])
    const res = await handleCreateMeeting(
      makeRequest({ date: '2026-05-29', title: 'lab sync', notes: null, decisions: null }),
      makeUser(), env,
    )
    expect(res.status).toBe(200)
    expect(meetings).toHaveLength(1)
    expect(meetings[0].notes).toBe(existingNotes)
  })
})

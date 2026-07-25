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
import { handleCreateMeeting, handleUpdateMeetingMeta } from './meetings'
import type { AuthUser, Env } from '../helpers'

// ── Minimal stateful D1 stub (meetings + activity_log) ───────────────────────

type Row = Record<string, unknown>

function normalize(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, ' ')
}

function makeStatefulEnv(seed: Row[] = []): { env: Env; meetings: Row[]; notifications: Row[] } {
  const meetings: Row[] = seed.map((r) => ({ ...r }))
  const notifications: Row[] = []

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
            // INSERT (id, date, title, type, attendees, notes, decisions, tags, status, source_id)
            const [id, date, title, type, attendees, notes, decisions, tags, status, sourceId, facilitator] = args
            meetings.push({
              id, date, title, type, attendees,
              notes: notes ?? null, decisions: decisions ?? null,
              tags: tags ?? null, source_id: sourceId ?? null,
              facilitator: facilitator ?? null,
              status, created_at: '2026-05-29T00:00:00Z', updated_at: '2026-05-29T00:00:00Z',
            })
            return { meta: { changes: 1 } }
          }
          if (upper.startsWith('UPDATE MEETINGS') && upper.includes('COALESCE')) {
            // UPDATE ... SET notes = COALESCE(?, notes), decisions = COALESCE(?, decisions),
            //               tags = COALESCE(?, tags), attendees = COALESCE(?, attendees),
            //               type = COALESCE(?, type), facilitator = COALESCE(?, facilitator),
            //               source_id = COALESCE(source_id, ?), updated_at = ... WHERE id = ?
            const [notesArg, decisionsArg, tagsArg, attendeesArg, typeArg, facilitatorArg, sourceIdArg, id] = args
            const row = meetings.find((m) => m.id === id)
            if (row) {
              if (notesArg !== null && notesArg !== undefined) row.notes = notesArg
              if (decisionsArg !== null && decisionsArg !== undefined) row.decisions = decisionsArg
              if (tagsArg !== null && tagsArg !== undefined) row.tags = tagsArg
              if (attendeesArg !== null && attendeesArg !== undefined) row.attendees = attendeesArg
              if (typeArg !== null && typeArg !== undefined) row.type = typeArg
              if (facilitatorArg !== null && facilitatorArg !== undefined) row.facilitator = facilitatorArg
              if (!row.source_id && sourceIdArg !== null && sourceIdArg !== undefined) row.source_id = sourceIdArg
              row.updated_at = '2026-05-29T12:00:00Z'
              return { meta: { changes: 1 } }
            }
            return { meta: { changes: 0 } }
          }
          if (upper.startsWith('UPDATE MEETINGS')) {
            // T5 meta endpoint: dynamic SET clause built from whichever fields
            // were provided, e.g. "SET attendees = ?, title = ?, updated_at =
            // datetime('now') WHERE id = ?". Parse the column names in order
            // (skip updated_at — it has no bind placeholder) and assign the
            // trailing bind args (last is always the id) positionally.
            const setClause = (s.match(/SET\s+(.*?)\s+WHERE/is) ?? ['', ''])[1]
            const cols = setClause
              .split(',')
              .map((c) => c.trim().split('=')[0].trim())
              .filter((c) => c.toLowerCase() !== 'updated_at')
            const id = args[args.length - 1]
            const row = meetings.find((m) => m.id === id)
            if (!row) return { meta: { changes: 0 } }
            cols.forEach((col, i) => { row[col] = args[i] })
            row.updated_at = '2026-05-29T12:00:00Z'
            return { meta: { changes: 1 } }
          }
          if (upper.startsWith('INSERT INTO NOTIFICATIONS')) {
            // INSERT (id, recipient_slug, type, source_type, source_id, title, body, link)
            const [id, recipientSlug, type, sourceType, sourceId, title, bodyText, link] = args
            notifications.push({
              id, recipient_slug: recipientSlug, type, source_type: sourceType,
              source_id: sourceId, title, body: bodyText, link,
            })
            return { meta: { changes: 1 } }
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
  return { env, meetings, notifications }
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

// PB commit c8e4ff306 (2026-07-07) made the push carry `attendees` (and,
// heuristically, `type`) on EVERY push, not just the first — see
// shared-schema-registry.md "/meetings push payload" entry. Before this fix
// only the INSERT branch persisted them, so any meeting matched via the
// dedup path kept NULL attendees forever.
describe('handleCreateMeeting — attendees/type persistence on the dedup path', () => {
  it('UPDATEs attendees on the dedup (upsert) path when the re-push carries them', async () => {
    const { env, meetings } = makeStatefulEnv([
      {
        id: 'mtg-2026-07-15-attnd0001',
        date: '2026-07-15',
        title: 'MN-CCORE: Nick Adams',
        type: 'biweekly',
        attendees: null,
        notes: 'kept notes',
        decisions: null,
        status: 'upcoming',
      },
    ])
    const attendees = ['dudley@umn.edu', 'ingra107@umn.edu']
    const res = await handleCreateMeeting(
      makeRequest({ date: '2026-07-15', title: 'mn-ccore:  nick  adams', attendees }),
      makeUser(), env,
    )
    const body = await res.json() as { data: Row }

    expect(res.status).toBe(200)
    expect(meetings).toHaveLength(1) // dedup, no duplicate row
    expect(meetings[0].attendees).toBe(JSON.stringify(attendees))
    expect(JSON.parse(body.data.attendees as string)).toEqual(attendees)
  })

  it('dedup re-push with an absent/empty attendees does NOT wipe an existing attendees list', async () => {
    const existingAttendees = JSON.stringify(['a@umn.edu', 'b@umn.edu'])
    const { env, meetings } = makeStatefulEnv([
      {
        id: 'mtg-2026-07-15-attnd0002',
        date: '2026-07-15',
        title: 'Lab Sync',
        type: 'biweekly',
        attendees: existingAttendees,
        notes: 'n',
        decisions: null,
        status: 'upcoming',
      },
    ])
    // Re-push carrying notes but no attendees key at all.
    const res1 = await handleCreateMeeting(
      makeRequest({ date: '2026-07-15', title: 'lab sync', notes: 'refreshed' }),
      makeUser(), env,
    )
    expect(res1.status).toBe(200)
    expect(meetings[0].attendees).toBe(existingAttendees)

    // Re-push explicitly carrying an empty attendees array (unparseable frontmatter).
    const res2 = await handleCreateMeeting(
      makeRequest({ date: '2026-07-15', title: 'lab sync', attendees: [] }),
      makeUser(), env,
    )
    const body2 = await res2.json() as { data: Row }
    expect(res2.status).toBe(200)
    expect(meetings).toHaveLength(1)
    expect(meetings[0].attendees).toBe(existingAttendees) // still not clobbered
    expect(body2.data.attendees).toBe(existingAttendees)
  })

  it('UPDATEs type on the dedup path only when the payload carries one; never defaults it', async () => {
    const { env, meetings } = makeStatefulEnv([
      {
        id: 'mtg-2026-07-15-type0001',
        date: '2026-07-15',
        title: 'Nick / Adams 1:1',
        type: null,
        attendees: null,
        notes: null,
        decisions: null,
        status: 'upcoming',
      },
    ])
    // Re-push with a real type value: applies.
    const res1 = await handleCreateMeeting(
      makeRequest({ date: '2026-07-15', title: 'nick / adams 1:1', type: 'one-on-one', notes: 'n' }),
      makeUser(), env,
    )
    expect(res1.status).toBe(200)
    expect(meetings[0].type).toBe('one-on-one')

    // Re-push with type omitted: existing type is left alone, never reset to
    // the INSERT-only 'biweekly' default.
    const res2 = await handleCreateMeeting(
      makeRequest({ date: '2026-07-15', title: 'nick / adams 1:1', notes: 'n2' }),
      makeUser(), env,
    )
    const body2 = await res2.json() as { data: Row }
    expect(res2.status).toBe(200)
    expect(meetings[0].type).toBe('one-on-one')
    expect(body2.data.type).toBe('one-on-one')
  })
})

describe('handleCreateMeeting — schema-v72 tags (multi-tagging) persistence', () => {
  it('persists tags as a JSON array on the INSERT path', async () => {
    const { env, meetings } = makeStatefulEnv()
    const tags = ['r03-decision-making-styles-of-medical-trainees', 'mn-ccore', 'k23-aims']
    const res = await handleCreateMeeting(
      makeRequest({
        date: '2026-05-29',
        title: 'Nick / Adams 1:1', // real calendar title, NOT "MN-CCORE: …"
        type: 'biweekly',
        tags,
      }),
      makeUser(), env,
    )
    const body = await res.json() as { data: Row }

    expect(res.status).toBe(201)
    // Stored JSON-encoded (mirrors the attendees column shape).
    expect(meetings[0].tags).toBe(JSON.stringify(tags))
    expect(JSON.parse(body.data.tags as string)).toEqual(tags)
    // And the title is the calendar title, not a hardcoded prefix.
    expect(body.data.title).toBe('Nick / Adams 1:1')
  })

  it('INSERT with absent tags persists null (no array)', async () => {
    const { env, meetings } = makeStatefulEnv()
    const res = await handleCreateMeeting(
      makeRequest({ date: '2026-05-29', title: 'Bare Meeting' }),
      makeUser(), env,
    )
    expect(res.status).toBe(201)
    expect(meetings[0].tags).toBeNull()
  })

  it('UPDATEs tags on the dedup path — late tagging refreshes the row', async () => {
    // First push (note written before extraction): no tags yet.
    const { env, meetings } = makeStatefulEnv()
    await handleCreateMeeting(
      makeRequest({ date: '2026-05-29', title: 'Lab Sync', type: 'biweekly' }),
      makeUser(), env,
    )
    expect(meetings).toHaveLength(1)
    expect(meetings[0].tags).toBeNull()

    // Second push (same normalized title) now carries the discussed-project tags.
    const tags = ['mn-ccore', 'r03-decision-making-styles-of-medical-trainees']
    const res = await handleCreateMeeting(
      makeRequest({ date: '2026-05-29', title: 'lab  sync', tags }),
      makeUser(), env,
    )
    const body = await res.json() as { data: Row }

    expect(res.status).toBe(200)
    expect(meetings).toHaveLength(1) // no duplicate
    expect(JSON.parse(meetings[0].tags as string)).toEqual(tags)
    expect(JSON.parse(body.data.tags as string)).toEqual(tags)
  })

  it('dedup re-push with absent tags does NOT wipe existing tags', async () => {
    const existingTags = JSON.stringify(['mn-ccore', 'k23-aims'])
    const { env, meetings } = makeStatefulEnv([
      {
        id: 'mtg-2026-05-29-tag00001',
        date: '2026-05-29',
        title: 'Lab Sync',
        notes: 'kept notes',
        decisions: null,
        tags: existingTags,
        status: 'upcoming',
      },
    ])
    // Re-push carrying notes but NO tags — tags must survive untouched.
    const res = await handleCreateMeeting(
      makeRequest({ date: '2026-05-29', title: 'lab sync', notes: 'refreshed notes' }),
      makeUser(), env,
    )
    const body = await res.json() as { data: Row }
    expect(res.status).toBe(200)
    expect(meetings).toHaveLength(1)
    expect(meetings[0].tags).toBe(existingTags) // not clobbered
    expect(meetings[0].notes).toBe('refreshed notes') // notes still refreshed
    expect(body.data.tags).toBe(existingTags)
  })

  it('dedup re-push with EXPLICIT null tags still does not wipe existing tags', async () => {
    const existingTags = JSON.stringify(['mn-ccore'])
    const { env, meetings } = makeStatefulEnv([
      {
        id: 'mtg-2026-05-29-tag00002',
        date: '2026-05-29',
        title: 'Lab Sync',
        notes: 'n',
        decisions: null,
        tags: existingTags,
        status: 'upcoming',
      },
    ])
    const res = await handleCreateMeeting(
      makeRequest({ date: '2026-05-29', title: 'lab sync', tags: null }),
      makeUser(), env,
    )
    expect(res.status).toBe(200)
    expect(meetings).toHaveLength(1)
    expect(meetings[0].tags).toBe(existingTags)
  })
})

// Commits 3e22831c/b040f100 — the "debrief landed" bell fires only on the
// notes-less -> notes-full transition (insert-with-notes, or the first dedup
// upsert that adds a summary). A later re-push (notes already present) must
// NOT fire a second bell — that path surfaces via the entity_seen teal dot
// instead. These tests assert the exact fire count via the stub's recorded
// `notifications` inserts, not just response shape.
describe('handleCreateMeeting — debrief notification (fire-once bell)', () => {
  it('insert-with-notes fires exactly ONE notification, keyed to the hub meeting id (never source_id)', async () => {
    const { env, notifications } = makeStatefulEnv()
    const res = await handleCreateMeeting(
      makeRequest({
        date: '2026-05-29',
        title: 'Nick / Adams 1:1',
        notes: '## Summary\n\nDiscussed the R03 resubmission.',
        source_id: 'pb-calendar-evt-999',
      }),
      makeUser(), env,
    )
    const body = await res.json() as { data: Row }
    const hubId = body.data.id as string

    expect(res.status).toBe(201)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('meeting_debrief')
    expect(notifications[0].recipient_slug).toBe('nick-ingraham')
    // source_id + link use the minted hub id, never the PB calendar source_id.
    expect(notifications[0].source_id).toBe(hubId)
    expect(notifications[0].source_id).not.toBe('pb-calendar-evt-999')
    expect(notifications[0].link).toBe(`/portal/meetings/${hubId}`)
  })

  it('insert WITHOUT notes fires ZERO notifications', async () => {
    const { env, notifications } = makeStatefulEnv()
    const res = await handleCreateMeeting(
      makeRequest({ date: '2026-05-29', title: 'Bare Meeting' }),
      makeUser(), env,
    )
    expect(res.status).toBe(201)
    expect(notifications).toHaveLength(0)
  })

  it('dedup transition notes null -> present fires exactly ONE notification', async () => {
    const { env, meetings, notifications } = makeStatefulEnv([
      {
        id: 'mtg-2026-05-29-notif0001',
        date: '2026-05-29',
        title: 'MN-CCORE: Nick Adams',
        notes: null,
        decisions: null,
        status: 'upcoming',
      },
    ])
    const res = await handleCreateMeeting(
      makeRequest({
        date: '2026-05-29',
        title: 'mn-ccore:  nick  adams', // normalizes to the same key
        notes: '## Summary\n\nFull extracted summary text.',
      }),
      makeUser(), env,
    )
    expect(res.status).toBe(200)
    expect(meetings).toHaveLength(1) // dedup, no duplicate meeting row
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('meeting_debrief')
    expect(notifications[0].recipient_slug).toBe('nick-ingraham')
    expect(notifications[0].source_id).toBe('mtg-2026-05-29-notif0001')
    expect(notifications[0].link).toBe('/portal/meetings/mtg-2026-05-29-notif0001')
  })

  it('dedup re-push where the existing row already HAD notes fires ZERO notifications (no repeat bell)', async () => {
    const { env, notifications } = makeStatefulEnv([
      {
        id: 'mtg-2026-05-29-notif0002',
        date: '2026-05-29',
        title: 'MN-CCORE: Nick Adams',
        notes: '## Summary\n\nAlready-summarized meeting.',
        decisions: null,
        status: 'upcoming',
      },
    ])
    const res = await handleCreateMeeting(
      makeRequest({
        date: '2026-05-29',
        title: 'mn-ccore:  nick  adams',
        notes: '## Summary\n\nRe-pushed / refreshed summary text.',
      }),
      makeUser(), env,
    )
    expect(res.status).toBe(200)
    expect(notifications).toHaveLength(0)
  })
})

// T5 — POST /api/meetings/:id/meta. `title` and `tags` are still PB-authored
// only on INSERT/explicit-carry (see the tags describe block above), so a
// manual edit to those stays put across a bare re-push. `attendees`/`type`
// are the exception since PB commit c8e4ff306 (2026-07-07): PB now carries
// them on every push, so a manual T5 correction to attendees/type can be
// overwritten by a subsequent PB re-push that carries a differing value —
// same COALESCE-on-carried-value contract as notes/decisions.
describe('handleUpdateMeetingMeta — T5 metadata edit endpoint', () => {
  function seedMeeting(overrides: Row = {}): { env: Env; meetings: Row[] } {
    return makeStatefulEnv([
      {
        id: 'mtg-2026-05-29-meta0001',
        date: '2026-05-29',
        title: 'Original Title',
        type: 'biweekly',
        attendees: JSON.stringify(['orig@umn.edu']),
        tags: JSON.stringify(['orig-tag']),
        notes: 'kept notes',
        decisions: null,
        status: 'upcoming',
        ...overrides,
      },
    ])
  }

  it('updates only the provided fields, leaving others untouched', async () => {
    const { env, meetings } = seedMeeting()
    const res = await handleUpdateMeetingMeta(
      'mtg-2026-05-29-meta0001',
      makeRequest({ title: 'Renamed Meeting' }),
      makeUser(), env,
    )
    const body = await res.json() as { data: Row }

    expect(res.status).toBe(200)
    expect(meetings[0].title).toBe('Renamed Meeting')
    // untouched fields survive
    expect(meetings[0].type).toBe('biweekly')
    expect(meetings[0].attendees).toBe(JSON.stringify(['orig@umn.edu']))
    expect(meetings[0].tags).toBe(JSON.stringify(['orig-tag']))
    expect(meetings[0].notes).toBe('kept notes')
    expect(body.data.title).toBe('Renamed Meeting')
  })

  it('400s on an empty body (no editable fields provided)', async () => {
    const { env, meetings } = seedMeeting()
    const res = await handleUpdateMeetingMeta(
      'mtg-2026-05-29-meta0001',
      makeRequest({}),
      makeUser(), env,
    )
    expect(res.status).toBe(400)
    // nothing mutated
    expect(meetings[0].title).toBe('Original Title')
  })

  it('404s on an unknown meeting id', async () => {
    const { env } = seedMeeting()
    const res = await handleUpdateMeetingMeta(
      'mtg-does-not-exist',
      makeRequest({ title: 'New Title' }),
      makeUser(), env,
    )
    expect(res.status).toBe(404)
  })

  it('persists attendees as a JSON-stringified array', async () => {
    const { env, meetings } = seedMeeting()
    const attendees = ['a@umn.edu', 'b@umn.edu']
    const res = await handleUpdateMeetingMeta(
      'mtg-2026-05-29-meta0001',
      makeRequest({ attendees }),
      makeUser(), env,
    )
    const body = await res.json() as { data: Row }

    expect(res.status).toBe(200)
    expect(meetings[0].attendees).toBe(JSON.stringify(attendees))
    expect(JSON.parse(body.data.attendees as string)).toEqual(attendees)
  })
})

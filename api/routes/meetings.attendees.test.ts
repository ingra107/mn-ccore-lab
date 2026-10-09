// #2225 + #551 -- meeting attendees, on the migrated schema.
//
// #2225: the Prep pill created meetings with NULL attendees because the
// calendar cache had no attendee column and the client sent only
// {date, title}. POST /api/meetings/prep-from-event now copies title +
// attendees server-side from the caller's own cache row, looked up by
// (uid, start_at), the v61 natural key that survives a re-poll.
//
// #551: writers stored attendee values raw, so a team member pushed as
// `dudley@umn.edu` never matched the picker's `adams-dudley`. Every writer
// now runs normalizeAttendees (api/lib/meeting-write.ts): an exact
// team_members.email match becomes the slug, a known slug stays, anything
// else (external emails, display names) is kept. Never the domain-blind
// prefix LUT in shared/emailSlug.ts: `nate@stanford.edu` must not become
// `nate-mesfin`.
//
// Also pins the overwrite fix: since b3ebe90b (2026-07-15) the dedup path
// ran `attendees = COALESCE(?, attendees)`, so a PB re-push replaced a list
// a person had edited, contradicting the T5 comment above
// handleUpdateMeetingMeta. Automated writes now only FILL an empty list.

import { describe, it, expect } from 'vitest'
import { handleCreateMeeting, handleUpdateMeetingMeta, handlePrepMeetingFromEvent } from './meetings'
import type { AuthUser, Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

type Db = ReturnType<typeof prodSchemaDb>

const NICK: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick Ingraham', slug: 'nick-ingraham' } as AuthUser

function makeDb(): Db {
  const db = prodSchemaDb()
  // Exact-email team rows. `zz-` slugs cannot collide with any seeded row.
  insertRow(db, 'team_members', { id: 'tm-zz-dudley', name: 'ZZ Dudley', slug: 'zz-adams-dudley', email: 'Dudley@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-zz-mesfin', name: 'ZZ Mesfin', slug: 'zz-nate-mesfin', email: 'nmesfin@umn.edu' })
  return db
}

const envOf = (db: Db) => ({ DB: d1Adapter(db) }) as unknown as Env

function post(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function attendeesOf(db: Db, id: string): unknown {
  const row = db.prepare('SELECT attendees FROM meetings WHERE id = ?').get(id) as { attendees: string | null }
  return row.attendees === null ? null : JSON.parse(row.attendees)
}

function seedFeedEvent(db: Db, ev: { uid: string; start_at: string; end_at?: string | null; summary: string; attendees: string | null; user_slug?: string }) {
  const user = ev.user_slug ?? 'nick-ingraham'
  const feedId = `feed-${user}`
  if (!db.prepare('SELECT 1 FROM user_calendar_feeds WHERE id = ?').get(feedId)) {
    insertRow(db, 'user_calendar_feeds', { id: feedId, user_slug: user, feed_url: `https://cal.example/${user}.ics` })
  }
  insertRow(db, 'user_calendar_events', {
    id: `ev-${ev.uid}-${ev.start_at}`, feed_id: feedId, user_slug: user, uid: ev.uid,
    summary: ev.summary, start_at: ev.start_at, end_at: ev.end_at ?? null, is_all_day: 0,
    attendees: ev.attendees,
  })
}

describe('normalizeAttendees through the create endpoint (#551)', () => {
  it('maps an exact team email to its slug, keeps known slugs, externals and display names', async () => {
    const db = makeDb()
    const res = await handleCreateMeeting(post('/api/meetings', {
      date: '2026-10-06', title: 'R01 aims',
      attendees: ['dudley@UMN.edu', 'zz-nate-mesfin', 'nate@stanford.edu', 'Nick E Ingraham', 'WParker@UChicago.edu', 'zz-adams-dudley'],
    }), NICK, envOf(db))
    expect(res.status).toBe(201)
    const id = ((await res.json()) as { data: { id: string } }).data.id
    expect(attendeesOf(db, id)).toEqual([
      'zz-adams-dudley', 'zz-nate-mesfin', 'nate@stanford.edu', 'Nick E Ingraham', 'wparker@uchicago.edu',
    ])
  })

  it('a duplicated team email cannot exist: schema-v118 refuses the second row, case-insensitively', () => {
    // This test used to pin which of two rows sharing an email won. Since
    // schema-v118 (2026-10-08) the second row cannot be written, so the
    // tiebreak has nothing left to break.
    const db = makeDb()
    insertRow(db, 'team_members', { id: 'tm-zz-real', name: 'Real', slug: 'zz-real-dup', email: 'dup@umn.edu' })
    expect(() => insertRow(db, 'team_members', { id: 'tm-zz-auto', name: 'Auto', slug: 'aa-auto-dup', email: 'DUP@umn.edu', auto_created: 1 }))
      .toThrow(/UNIQUE/)
  })

  it('never resolves by email prefix: nate@stanford.edu stays raw', async () => {
    const db = makeDb()
    const res = await handleCreateMeeting(post('/api/meetings', {
      date: '2026-10-06', title: 'External', attendees: ['nate@stanford.edu', 'dudley@stanford.edu'],
    }), NICK, envOf(db))
    const id = ((await res.json()) as { data: { id: string } }).data.id
    expect(attendeesOf(db, id)).toEqual(['nate@stanford.edu', 'dudley@stanford.edu'])
  })

  it('an empty attendee list inserts NULL, so a later push can still fill it', async () => {
    const db = makeDb()
    const res = await handleCreateMeeting(post('/api/meetings', { date: '2026-10-06', title: 'Bare', attendees: [] }), NICK, envOf(db))
    const id = ((await res.json()) as { data: { id: string } }).data.id
    expect(attendeesOf(db, id)).toBeNull()
  })
})

describe('dedup push is fill-only for attendees', () => {
  it('a push does not overwrite an existing attendee list', async () => {
    const db = makeDb()
    insertRow(db, 'meetings', { owner_slug: 'nick-ingraham', id: 'mtg-edit', date: '2026-10-06', title: 'Lab Sync', attendees: JSON.stringify(['zz-nate-mesfin']) })
    const res = await handleCreateMeeting(post('/api/meetings', {
      date: '2026-10-06', title: 'lab  sync', notes: 'debrief', attendees: ['dudley@umn.edu', 'x@other.org'],
    }), NICK, envOf(db))
    expect(res.status).toBe(200)
    expect(attendeesOf(db, 'mtg-edit')).toEqual(['zz-nate-mesfin'])
    // the rest of the push still lands
    expect((db.prepare('SELECT notes FROM meetings WHERE id = ?').get('mtg-edit') as { notes: string }).notes).toBe('debrief')
  })

  it("a push fills a '[]' list (older dialog inserts stored it; it reads as empty)", async () => {
    const db = makeDb()
    insertRow(db, 'meetings', { owner_slug: 'nick-ingraham', id: 'mtg-empty', date: '2026-10-06', title: 'Lab Sync', attendees: '[]' })
    await handleCreateMeeting(post('/api/meetings', {
      date: '2026-10-06', title: 'Lab Sync', notes: 'n', attendees: ['dudley@umn.edu'],
    }), NICK, envOf(db))
    expect(attendeesOf(db, 'mtg-empty')).toEqual(['zz-adams-dudley'])
  })

  it("a push with no attendees leaves a '[]' list as it is", async () => {
    const db = makeDb()
    insertRow(db, 'meetings', { owner_slug: 'nick-ingraham', id: 'mtg-empty2', date: '2026-10-06', title: 'Lab Sync', attendees: '[]' })
    await handleCreateMeeting(post('/api/meetings', { date: '2026-10-06', title: 'Lab Sync', notes: 'n' }), NICK, envOf(db))
    expect(attendeesOf(db, 'mtg-empty2')).toEqual([])
  })

  it('a push fills a NULL list, normalized', async () => {
    const db = makeDb()
    insertRow(db, 'meetings', { owner_slug: 'nick-ingraham', id: 'mtg-null', date: '2026-10-06', title: 'Lab Sync', attendees: null })
    await handleCreateMeeting(post('/api/meetings', {
      date: '2026-10-06', title: 'Lab Sync', attendees: ['dudley@umn.edu', 'x@other.org'],
    }), NICK, envOf(db))
    expect(attendeesOf(db, 'mtg-null')).toEqual(['zz-adams-dudley', 'x@other.org'])
  })
})

describe('meta edit (the human path) normalizes and may overwrite', () => {
  it('stores the normalized list', async () => {
    const db = makeDb()
    insertRow(db, 'meetings', { owner_slug: 'nick-ingraham', id: 'mtg-meta', date: '2026-10-06', title: 'T', attendees: JSON.stringify(['old@umn.edu']) })
    const res = await handleUpdateMeetingMeta('mtg-meta', post('/api/meetings/mtg-meta/meta', {
      attendees: ['nmesfin@umn.edu', 'nate@stanford.edu'],
    }), NICK, envOf(db))
    expect(res.status).toBe(200)
    expect(attendeesOf(db, 'mtg-meta')).toEqual(['zz-nate-mesfin', 'nate@stanford.edu'])
  })
})

describe('POST /api/meetings/prep-from-event (#2225)', () => {
  const START = '2026-10-06T19:00:00.000Z'

  it('copies title and attendees from the caller\'s cache row, server-side', async () => {
    const db = makeDb()
    seedFeedEvent(db, {
      uid: 'abc@google.com', start_at: START, end_at: '2026-10-06T20:00:00.000Z', summary: 'R01 aims',
      attendees: JSON.stringify(['dudley@umn.edu', 'nate@stanford.edu', 'ingra107@umn.edu']),
    })
    const res = await handlePrepMeetingFromEvent(post('/api/meetings/prep-from-event', {
      uid: 'abc@google.com', start_at: START, day: '2026-10-06',
    }), NICK, envOf(db))
    expect(res.status).toBe(201)
    const data = ((await res.json()) as { data: { id: string; title: string; date: string; source_id: string | null } }).data
    expect(data.title).toBe('R01 aims')
    expect(data.date).toBe('2026-10-06')
    expect(data.source_id).toBeNull() // set-once slot belongs to the PB debrief push
    expect(attendeesOf(db, data.id)).toEqual(['zz-adams-dudley', 'nate@stanford.edu', 'ingra107@umn.edu'])
  })

  it('an event with no attendees gives NULL (cache [] and cache NULL alike)', async () => {
    const db = makeDb()
    seedFeedEvent(db, { uid: 'solo', start_at: START, summary: 'Focus', attendees: '[]' })
    seedFeedEvent(db, { uid: 'old', start_at: START, summary: 'Pre-v116 row', attendees: null })
    for (const uid of ['solo', 'old']) {
      const res = await handlePrepMeetingFromEvent(post('/x', { uid, start_at: START, day: '2026-10-06' }), NICK, envOf(db))
      expect(res.status).toBe(201)
      const id = ((await res.json()) as { data: { id: string } }).data.id
      expect(attendeesOf(db, id)).toBeNull()
    }
  })

  it('a second press lands on the same row and does not overwrite an edited list', async () => {
    const db = makeDb()
    seedFeedEvent(db, { uid: 'twice', start_at: START, summary: 'Lab Sync', attendees: JSON.stringify(['dudley@umn.edu']) })
    const body = { uid: 'twice', start_at: START, day: '2026-10-06' }
    const first = ((await (await handlePrepMeetingFromEvent(post('/x', body), NICK, envOf(db))).json()) as { data: { id: string } }).data.id
    db.prepare('UPDATE meetings SET attendees = ? WHERE id = ?').run(JSON.stringify(['zz-nate-mesfin']), first)
    const res2 = await handlePrepMeetingFromEvent(post('/x', body), NICK, envOf(db))
    expect(res2.status).toBe(200)
    const second = ((await res2.json()) as { data: { id: string } }).data.id
    expect(second).toBe(first)
    expect((db.prepare('SELECT COUNT(*) AS n FROM meetings').get() as { n: number }).n).toBe(1)
    expect(attendeesOf(db, first)).toEqual(['zz-nate-mesfin'])
  })

  it("fills attendees on an existing meeting whose list is '[]'", async () => {
    const db = makeDb()
    insertRow(db, 'meetings', { owner_slug: 'nick-ingraham', id: 'mtg-early2', date: '2026-10-06', title: 'Lab Sync', attendees: '[]' })
    seedFeedEvent(db, { uid: 'fill2', start_at: START, summary: 'Lab Sync', attendees: JSON.stringify(['dudley@umn.edu']) })
    const res = await handlePrepMeetingFromEvent(post('/x', { uid: 'fill2', start_at: START, day: '2026-10-06' }), NICK, envOf(db))
    expect(res.status).toBe(200)
    expect(attendeesOf(db, 'mtg-early2')).toEqual(['zz-adams-dudley'])
  })

  it('fills attendees on an existing meeting whose list is empty', async () => {
    const db = makeDb()
    insertRow(db, 'meetings', { owner_slug: 'nick-ingraham', id: 'mtg-early', date: '2026-10-06', title: 'Lab Sync', attendees: null })
    seedFeedEvent(db, { uid: 'fill', start_at: START, summary: 'Lab Sync', attendees: JSON.stringify(['dudley@umn.edu']) })
    const res = await handlePrepMeetingFromEvent(post('/x', { uid: 'fill', start_at: START, day: '2026-10-06' }), NICK, envOf(db))
    expect(res.status).toBe(200)
    expect(attendeesOf(db, 'mtg-early')).toEqual(['zz-adams-dudley'])
  })

  it('404s on another user\'s event or an unknown (uid, start_at)', async () => {
    const db = makeDb()
    seedFeedEvent(db, { uid: 'theirs', start_at: START, summary: 'Private', attendees: '[]', user_slug: 'zz-nate-mesfin' })
    const a = await handlePrepMeetingFromEvent(post('/x', { uid: 'theirs', start_at: START, day: '2026-10-06' }), NICK, envOf(db))
    expect(a.status).toBe(404)
    const b = await handlePrepMeetingFromEvent(post('/x', { uid: 'nope', start_at: START, day: '2026-10-06' }), NICK, envOf(db))
    expect(b.status).toBe(404)
    expect((db.prepare('SELECT COUNT(*) AS n FROM meetings').get() as { n: number }).n).toBe(0)
  })

  it('400s on a day outside the event\'s span or a malformed body', async () => {
    const db = makeDb()
    seedFeedEvent(db, { uid: 'span', start_at: START, end_at: '2026-10-06T20:00:00.000Z', summary: 'S', attendees: '[]' })
    const far = await handlePrepMeetingFromEvent(post('/x', { uid: 'span', start_at: START, day: '2026-10-20' }), NICK, envOf(db))
    expect(far.status).toBe(400)
    const bad = await handlePrepMeetingFromEvent(post('/x', { uid: 'span', start_at: START, day: 'tomorrow' }), NICK, envOf(db))
    expect(bad.status).toBe(400)
    const missing = await handlePrepMeetingFromEvent(post('/x', { start_at: START, day: '2026-10-06' }), NICK, envOf(db))
    expect(missing.status).toBe(400)
  })
})

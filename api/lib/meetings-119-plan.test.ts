// meetings-119-plan.test.ts -- the #145 Lane A data steps, applied to the
// migrated schema and rolled back. The generated SQL is what runs on prod, so
// it is executed here, not inspected.

import { describe, it, expect } from 'vitest'
import { prodSchemaDb, insertRow } from '../test-support/prod-schema-db'
import { planOwnerBackfill, planAttendeeRenorm, rowsFrom, type MeetingPreImage, type TeamRow } from '../../scripts/meetings-119-plan'

function world() {
  const db = prodSchemaDb()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', email: 'ingra107@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey', slug: 'casey-eddington', email: 'eddin022@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate', slug: 'nate-mesfin', email: 'mesfin@umn.edu' })
  const m = (id: string, attendees: string | null, owner: string | null = null) =>
    insertRow(db, 'meetings', { id, date: '2026-09-01', title: id, attendees, owner_slug: owner })
  m('a', JSON.stringify(['eddin022@umn.edu', 'nick-ingraham']))
  m('b', JSON.stringify(['MESFIN@UMN.EDU', 'mesfin', 'nathan.mesfin@va.gov', 'Nathan M Mesfin']))
  m('c', JSON.stringify(['casey-eddington']))          // already canonical
  m('d', null)
  m('e', 'not json')
  m('f', JSON.stringify(['casey-eddington']), 'casey-eddington') // already owned
  m('g', JSON.stringify(["o'brien@umn.edu", 'eddin022@umn.edu']))
  const preMeetings = db.prepare('SELECT id, owner_slug, attendees FROM meetings ORDER BY id').all() as MeetingPreImage[]
  const team = db.prepare('SELECT slug, email FROM team_members WHERE slug IS NOT NULL ORDER BY auto_created ASC, created_at ASC, slug ASC').all() as TeamRow[]
  return { db, preMeetings, team }
}

const snapshot = (db: ReturnType<typeof world>['db']) =>
  db.prepare('SELECT id, owner_slug, attendees FROM meetings ORDER BY id').all()

describe('owner backfill', () => {
  it('stamps nick-ingraham on every unowned row, leaves owned rows, and rolls back exactly', () => {
    const { db, preMeetings } = world()
    const plan = planOwnerBackfill(preMeetings)
    expect(plan.detail).toEqual(['a', 'b', 'c', 'd', 'e', 'g'])
    db.exec(plan.apply)
    const owners = db.prepare('SELECT id, owner_slug FROM meetings ORDER BY id').all()
    expect(owners).toEqual([
      { id: 'a', owner_slug: 'nick-ingraham' }, { id: 'b', owner_slug: 'nick-ingraham' },
      { id: 'c', owner_slug: 'nick-ingraham' }, { id: 'd', owner_slug: 'nick-ingraham' },
      { id: 'e', owner_slug: 'nick-ingraham' }, { id: 'f', owner_slug: 'casey-eddington' },
      { id: 'g', owner_slug: 'nick-ingraham' },
    ])
    db.exec(plan.apply) // idempotent
    db.exec(plan.rollback)
    expect(snapshot(db)).toEqual(preMeetings)
  })
})

describe('attendee re-normalization', () => {
  it('maps team emails to slugs by exact (case-folded) address only, keeps everything else, rolls back exactly', () => {
    const { db, preMeetings, team } = world()
    const plan = planAttendeeRenorm(preMeetings, team)
    expect(plan.skipped).toEqual(['e: not JSON'])
    db.exec(plan.apply)
    const after = Object.fromEntries((db.prepare('SELECT id, attendees FROM meetings').all() as { id: string; attendees: string | null }[]).map((r) => [r.id, r.attendees]))
    expect(JSON.parse(after.a!)).toEqual(['casey-eddington', 'nick-ingraham'])
    // the bare prefix `mesfin` and the VA address are NOT Nate: no prefix matching
    expect(JSON.parse(after.b!)).toEqual(['nate-mesfin', 'mesfin', 'nathan.mesfin@va.gov', 'Nathan M Mesfin'])
    expect(after.c).toBe(JSON.stringify(['casey-eddington']))
    expect(after.d).toBeNull()
    expect(after.e).toBe('not json')
    expect(JSON.parse(after.g!)).toEqual(["o'brien@umn.edu", 'casey-eddington'])
    expect(plan.count).toBe(3)
    db.exec(plan.rollback)
    expect(snapshot(db)).toEqual(preMeetings)
  })

  it('leaves a row edited after the export alone, both ways', () => {
    const { db, preMeetings, team } = world()
    const plan = planAttendeeRenorm(preMeetings, team)
    db.prepare("UPDATE meetings SET attendees = '[\"someone-else\"]' WHERE id = 'a'").run()
    db.exec(plan.apply)
    expect((db.prepare("SELECT attendees FROM meetings WHERE id = 'a'").get() as { attendees: string }).attendees).toBe('["someone-else"]')
    db.exec(plan.rollback)
    expect((db.prepare("SELECT attendees FROM meetings WHERE id = 'a'").get() as { attendees: string }).attendees).toBe('["someone-else"]')
  })
})

it('rowsFrom reads wrangler --json output and a bare array', () => {
  expect(rowsFrom([{ results: [{ id: 1 }], success: true }])).toEqual([{ id: 1 }])
  expect(rowsFrom([{ id: 2 }])).toEqual([{ id: 2 }])
  expect(() => rowsFrom({})).toThrow()
})

describe('owner backfill: the deploy-window review', () => {
  it('holds owner-less rows created in the window, by created_at, unless named', () => {
    const rows = [
      { id: 'old', owner_slug: null, attendees: null, created_at: '2026-09-01 10:00:00', date: '2026-09-01', title: 'Old' },
      { id: 'w2', owner_slug: null, attendees: null, created_at: '2026-10-09 12:05:00', date: '2026-10-09', title: 'Casey prep' },
      { id: 'w1', owner_slug: null, attendees: null, created_at: '2026-10-09 12:01:00', date: '2026-10-09', title: 'PB push' },
      { id: 'owned', owner_slug: 'casey-eddington', attendees: null, created_at: '2026-10-09 12:02:00' },
    ]
    const plan = planOwnerBackfill(rows, { windowStart: '2026-10-09 12:00:00' })
    expect(plan.detail).toEqual(['old'])
    expect(plan.held.map((h) => h.split('  ')[1])).toEqual(['w1', 'w2'])
    const named = planOwnerBackfill(rows, { windowStart: '2026-10-09 12:00:00', includeIds: ['w1'] })
    expect(named.detail).toEqual(['old', 'w1'])
    expect(named.held.map((h) => h.split('  ')[1])).toEqual(['w2'])
    expect(named.apply).not.toContain("'w2'")
  })
})

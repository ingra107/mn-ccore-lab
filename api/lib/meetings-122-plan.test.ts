// meetings-122-plan.test.ts -- the schema-v122 audience backfill, applied to
// the migrated schema and rolled back. The generated SQL is what runs on prod,
// so it is executed here, not inspected.

import { describe, it, expect } from 'vitest'
import { prodSchemaDb, insertRow } from '../test-support/prod-schema-db'
import { planAudienceBackfill, planSeriesReown, sqliteLowerTrim, type MeetingAudiencePreImage } from '../../scripts/meetings-122-plan'

function world() {
  const db = prodSchemaDb()
  const m = (id: string, date: string, title: string, extra: Record<string, unknown> = {}) =>
    insertRow(db, 'meetings', { id, date, title, created_at: '2026-10-01 00:00:00', ...extra })
  m('a', '2026-10-06', 'MNCCORE', { owner_slug: 'nick-ingraham', source_id: 'cal-a' })
  m('b', '2026-10-08', 'Pulmonary HSR Group Meeting', { owner_slug: 'nick-ingraham' })
  m('c', '2026-09-03', 'CLIF WG Weekly Meeting', { owner_slug: 'nick-ingraham' })
  m('d', '2026-03-13', 'MN-CCORE: Sarah Kesler Consult', { owner_slug: 'nick-ingraham' })
  m('e', '2026-09-08', '2nd CLIF Senior Advisory Meeting', { owner_slug: 'nick-ingraham' })
  m('f', '2026-04-07', 'MN-CCORE: Mnccore Biweekly')
  m('g', '2026-04-07', 'MN-CCORE Biweekly Meeting -- April 07, 2026')
  m('h', '2026-10-13', 'MNCCORE', { owner_slug: 'nick-ingraham', audience: 'lab' }) // already lab
  const pre = () => db.prepare('SELECT id, date, title, owner_slug, source_id, created_at, audience FROM meetings ORDER BY id').all() as MeetingAudiencePreImage[]
  return { db, pre }
}

const audiences = (db: ReturnType<typeof world>['db']) =>
  Object.fromEntries((db.prepare('SELECT id, audience FROM meetings').all() as { id: string; audience: string }[]).map((r) => [r.id, r.audience]))

describe('audience backfill', () => {
  it('marks every lab-series title lab, nothing else, and rolls back exactly', () => {
    const { db, pre } = world()
    const before = audiences(db)
    const plan = planAudienceBackfill(pre())
    expect(plan.collisions).toEqual([])
    expect(plan.count).toBe(5)
    expect(plan.detail.map((d) => d.split('  ')[0])).toEqual(['a', 'b', 'c', 'f', 'g'])
    db.exec(plan.apply)
    expect(audiences(db)).toEqual({ ...before, a: 'lab', b: 'lab', c: 'lab', f: 'lab', g: 'lab' })
    db.exec(plan.apply) // idempotent
    db.exec(plan.rollback)
    expect(audiences(db)).toEqual(before)
  })

  it('reads a pre-DDL export (no audience column) as all private', () => {
    const { pre } = world()
    const rows = pre().map(({ audience: _a, ...r }) => r)
    expect(planAudienceBackfill(rows).count).toBe(6) // h is counted too: its export did not say lab
  })

  it('refuses to plan when two lab rows would share (date, lower(trim(title))), and names them', () => {
    const { db, pre } = world()
    // A member's Prep row beside Nick's series meeting (possible since v119).
    insertRow(db, 'meetings', { id: 'z-member', date: '2026-10-06', title: 'mnccore', owner_slug: 'casey-eddington', created_at: '2026-10-02 00:00:00' })
    const plan = planAudienceBackfill(pre())
    expect(plan.apply).toBe('')
    expect(plan.collisions).toHaveLength(1)
    expect(plan.collisions[0].map((l) => l.split('  ')[0]).sort()).toEqual(['a', 'z-member'])
    // The operator keeps the member's row private; the plan then applies cleanly.
    const ok = planAudienceBackfill(pre(), { keepPrivate: ['z-member'] })
    expect(ok.collisions).toEqual([])
    expect(ok.keptPrivate).toEqual(['z-member'])
    db.exec(ok.apply)
    expect(audiences(db)['z-member']).toBe('private')
    expect(audiences(db).a).toBe('lab')
  })

  it('the window sweep only touches rows created at or after the window start', () => {
    const { db, pre } = world()
    insertRow(db, 'meetings', { id: 'w-new', date: '2026-10-20', title: 'CLIF WG Weekly', created_at: '2026-10-10 12:00:00' })
    const plan = planAudienceBackfill(pre(), { windowStart: '2026-10-10 00:00:00' })
    expect(plan.detail.map((d) => d.split('  ')[0])).toEqual(['w-new'])
  })

  it('each statement is guarded on the value it expects, so a hand flip after the apply survives the rollback', () => {
    const { db, pre } = world()
    const plan = planAudienceBackfill(pre())
    db.exec(plan.apply)
    db.prepare("UPDATE meetings SET audience = 'private' WHERE id = 'c'").run() // Nick flips it back by hand
    db.exec(plan.rollback)
    expect(audiences(db).c).toBe('private')
    db.exec(plan.apply)
    db.prepare("UPDATE meetings SET audience = 'private' WHERE id = 'a'").run()
    db.exec(plan.apply) // re-running the apply re-marks only rows still private (documented: run once)
    expect(audiences(db).a).toBe('lab')
  })

  it('series owner: every series row goes to Nick, rolls back exactly, and a v119 twin is left alone', () => {
    const { db, pre } = world()
    insertRow(db, 'meetings', { id: 'm-casey', date: '2026-10-20', title: 'CLIF WG Weekly', owner_slug: 'casey-eddington', created_at: '2026-10-02 00:00:00' })
    // Nick already owns this exact date + title: re-owning the member's row would hit idx_meetings_owner_date_title.
    insertRow(db, 'meetings', { id: 'm-nick', date: '2026-10-21', title: 'MNCCORE', owner_slug: 'nick-ingraham', created_at: '2026-10-02 00:00:00' })
    insertRow(db, 'meetings', { id: 'm-twin', date: '2026-10-21', title: 'MNCCORE', owner_slug: 'casey-eddington', created_at: '2026-10-02 00:00:00' })
    const owners = () => Object.fromEntries((db.prepare('SELECT id, owner_slug FROM meetings').all() as { id: string; owner_slug: string | null }[]).map((r) => [r.id, r.owner_slug]))
    const before = owners()
    const plan = planSeriesReown(pre())
    // f and g are owner-less series rows; d (a consult) and e are not series.
    expect(plan.detail.map((d) => d.split('  ')[0])).toEqual(['f', 'g', 'm-casey'])
    expect(plan.blocked.map((b) => b.split('  ')[0])).toEqual(['m-twin'])
    db.exec(plan.apply)
    expect(owners()).toEqual({ ...before, f: 'nick-ingraham', g: 'nick-ingraham', 'm-casey': 'nick-ingraham' })
    db.exec(plan.rollback)
    expect(owners()).toEqual(before)
    expect(planSeriesReown(pre(), { windowStart: '2026-10-02 00:00:00' }).detail.map((d) => d.split('  ')[0])).toEqual(['m-casey'])
  })

  it('folds case and trims spaces the way SQLite does', () => {
    expect(sqliteLowerTrim('  MNCCORE ')).toBe('mnccore')
    expect(sqliteLowerTrim('\tMNCCORE')).toBe('\tmnccore')
  })
})

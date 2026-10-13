/**
 * api/routes/products.event-role.test.ts -- schema-v135: a product's event
 * date and Nick's part in it (Nick 2026-10-12: "Go now; add proper date + role
 * fields next").
 *
 * The schema half runs on the migration-chain database, so the CHECK and the
 * two foreign keys are the ones D1 runs. The route half drives the client
 * function (src/lib/products.ts setProductEvent) unchanged against the real
 * worker: the member gate, the words for a refused value, the compare-and-swap
 * and the reads that carry the fields and the vocabularies.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { setProductEvent } from '../../src/lib/products'
import { eventDateRefusal } from './products'
import { hashTouched } from './mutations'
import { nowInstant } from '../lib/time'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'event-role-test-api-key'
const PI_EMAIL = 'ingra107@umn.edu'
const OUTSIDER_EMAIL = 'eddin022@umn.edu'
const PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTH'
const HOME = 'prd_01KXH4E23G0DTFGFBYS2C8RGTH'
const TALK = 'prd_01KXH4E23G0DTFGFBYS2C8TALK'

let db: InstanceType<typeof Database>
let env: Env
let as = PI_EMAIL
const realFetch = global.fetch
const row = (sql: string, ...v: unknown[]) => db.prepare(sql).get(...v) as Record<string, unknown> | undefined
const seqOf = (id: string) => row('SELECT seq FROM products WHERE id = ?', id)!.seq as number

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Analyst', member_type: 'member', email: OUTSIDER_EMAIL })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
  as = PI_EMAIL
  insertRow(db, 'projects', { id: PROJECT, slug: 'cci-talks', title: 'CCI talks', category: 'MNCCORE', status: 'active' }, { stage: 'writing' })
  insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  insertRow(db, 'products', { id: TALK, project_id: PROJECT, kind: 'talk', stage: 'delivered', is_home: 0, title: 'Grand rounds', due_date: '2024-02-11' })
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    worker.fetch(new Request(`https://hub.test${String(input)}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': as },
    }), env, CTX)) as unknown as typeof fetch
})

afterEach(() => { global.fetch = realFetch })

describe('schema-v135 columns', () => {
  const set = (col: string, v: unknown) => db.prepare(`UPDATE products SET ${col} = ? WHERE id = ?`).run(v, TALK)

  it.each(['2019', '2019-05', '2019-05-31', '2024-02-29', null])('an event date of %s is stored', (v) => {
    set('event_date', v)
    expect(row('SELECT event_date FROM products WHERE id = ?', TALK)!.event_date).toBe(v)
  })

  // date() answers NULL for each of these; without the IS NOT NULL arms a
  // CHECK that evaluates to NULL would PASS them.
  it.each(['2019-13', '2019-00', '2019-5', '2019-02-30', '2023-02-29', '19', 'abcd', '2019-05-1', '2019-05-01T00', ''])(
    'an event date of %j is refused', (v) => {
      expect(() => set('event_date', v)).toThrow(/products_event_date_shape|CHECK/)
    })

  it('a position or a role outside its vocabulary is refused, and one cannot stand in for the other', () => {
    set('nick_author_position', 'first')
    set('nick_event_role', 'presenter')
    expect(() => set('nick_author_position', 'presenter')).toThrow(/FOREIGN KEY/)
    expect(() => set('nick_event_role', 'first')).toThrow(/FOREIGN KEY/)
    expect(() => set('nick_author_position', 'second')).toThrow(/FOREIGN KEY/)
  })

  it('a new value is an INSERT into the vocabulary, not a schema change', () => {
    db.prepare("INSERT INTO product_event_roles (role, label, sort_order) VALUES ('panelist', 'Panelist', 30)").run()
    set('nick_event_role', 'panelist')
    expect(row('SELECT nick_event_role FROM products WHERE id = ?', TALK)!.nick_event_role).toBe('panelist')
  })

  it('the vocabularies and the migration are recorded', () => {
    expect((db.prepare('SELECT position FROM product_author_positions ORDER BY sort_order').all() as { position: string }[]).map((r) => r.position))
      .toEqual(['first', 'co_first', 'middle', 'senior', 'investigator'])
    expect((db.prepare('SELECT role FROM product_event_roles ORDER BY sort_order').all() as { role: string }[]).map((r) => r.role))
      .toEqual(['presenter', 'moderator'])
    expect(row('SELECT filename FROM schema_migrations WHERE version = 135'))
      .toEqual({ filename: 'schema-v135-product-event-date-and-nick-role.sql' })
  })
})

describe('the member route and the reads', () => {
  it('a member moves a talk day from due_date to event_date and sets Nick\'s role, compare-and-swap', async () => {
    const seq = seqOf(TALK)
    const w = await setProductEvent('cci-talks', TALK,
      { event_date: '2024-02-11', nick_author_position: null, nick_event_role: 'presenter' },
      { seq, values: { event_date: null, nick_author_position: null, nick_event_role: null } })
    expect(w).toMatchObject({ id: TALK, event_date: '2024-02-11', nick_event_role: 'presenter', nick_author_position: null })
    // due_date is a separate write; clear it the same way.
    const resp = await fetch('/api/projects/cci-talks/products', {
      method: 'POST',
      body: JSON.stringify({ action: 'terms', product_id: TALK, fields: { due_date: null }, base_seq: w.seq, from: { due_date: '2024-02-11' } }),
    })
    expect(resp.status).toBe(200)
    expect(row('SELECT due_date, event_date, nick_event_role FROM products WHERE id = ?', TALK))
      .toEqual({ due_date: null, event_date: '2024-02-11', nick_event_role: 'presenter' })
  })

  it('a month-only date and a byline position land; empty clears', async () => {
    let w = await setProductEvent('cci-talks', TALK, { event_date: '2019-05', nick_author_position: 'co_first' },
      { seq: seqOf(TALK), values: { event_date: null, nick_author_position: null } })
    expect(w).toMatchObject({ event_date: '2019-05', nick_author_position: 'co_first' })
    w = await setProductEvent('cci-talks', TALK, { event_date: null },
      { seq: w.seq, values: { event_date: '2019-05' } })
    expect(row('SELECT event_date FROM products WHERE id = ?', TALK)!.event_date).toBeNull()
  })

  it('refuses a bad date or an unknown role in words, before the write', async () => {
    const seen = { seq: seqOf(TALK), values: { event_date: null } }
    await expect(setProductEvent('cci-talks', TALK, { event_date: '2019-13' }, seen))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not a month/) })
    await expect(setProductEvent('cci-talks', TALK, { event_date: 'May 2019' }, seen))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/YYYY/) })
    await expect(setProductEvent('cci-talks', TALK, { nick_event_role: 'first' }, { seq: seen.seq, values: { nick_event_role: null } }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not a role at the event/) })
    expect(row('SELECT event_date, nick_event_role FROM products WHERE id = ?', TALK))
      .toEqual({ event_date: null, nick_event_role: null })
  })

  it('a stale tab is refused (409) and overwrites nothing', async () => {
    const seq = seqOf(TALK)
    await setProductEvent('cci-talks', TALK, { event_date: '2024-02-11' }, { seq, values: { event_date: null } })
    await expect(setProductEvent('cci-talks', TALK, { event_date: '2025-01-01' }, { seq, values: { event_date: null } }))
      .rejects.toMatchObject({ status: 409 })
    expect(row('SELECT event_date FROM products WHERE id = ?', TALK)!.event_date).toBe('2024-02-11')
  })

  it('a non-member cannot write (the member gate is unchanged)', async () => {
    as = OUTSIDER_EMAIL
    await expect(setProductEvent('cci-talks', TALK, { event_date: '2024-02-11' }, { seq: seqOf(TALK), values: { event_date: null } }))
      .rejects.toMatchObject({ status: 404 })
    expect(row('SELECT event_date FROM products WHERE id = ?', TALK)!.event_date).toBeNull()
  })

  it('the project read, the bulk read and the PB sync read carry the fields; the two list reads carry the vocabularies', async () => {
    db.prepare("UPDATE products SET event_date = '2019-05', nick_author_position = 'first', nick_event_role = 'presenter' WHERE id = ?").run(TALK)
    const one = await (await fetch('/api/projects/cci-talks/products')).json() as {
      products: Record<string, unknown>[]; roles: { author_positions: { position: string }[]; event_roles: { role: string }[] }
    }
    expect(one.products.find((p) => p.id === TALK)).toMatchObject({ event_date: '2019-05', nick_author_position: 'first', nick_event_role: 'presenter' })
    expect(one.roles.author_positions.map((r) => r.position)).toContain('senior')
    expect(one.roles.event_roles.map((r) => r.role)).toEqual(['presenter', 'moderator'])
    const bulk = await (await fetch('/api/projects/products')).json() as {
      byProject: Record<string, Record<string, unknown>[]>; roles: { event_roles: unknown[] }
    }
    expect(bulk.byProject[PROJECT].find((p) => p.id === TALK)).toMatchObject({ event_date: '2019-05' })
    expect(bulk.roles.event_roles).toHaveLength(2)
    const sync = await (await fetch('/api/products?seq_after=0')).json() as { data: Record<string, unknown>[] }
    expect(sync.data.find((p) => p.id === TALK)).toMatchObject({ event_date: '2019-05', nick_author_position: 'first', nick_event_role: 'presenter' })
    expect(sync.data.find((p) => p.id === HOME)).toMatchObject({ event_date: null })
  })
})

// The backfill's path (PB Scratch/product_event_role_backfill_2026_10_12.py):
// /api/mutations with the PB key, compare-and-swap on the touched fields. The
// whitelist is pb-schema 0.18.0's TABLE_FIELDS; the arbiter is v135.
describe('/api/mutations takes the fields (the backfill path)', () => {
  let n = 0
  const HEAD = ['Nick: presenter', 'Date: Feb 11, 2024', 'Authors: Ingraham N'].join('\n')
  async function update(patch: Record<string, unknown>, before: Record<string, unknown>, seqBack = 0) {
    n += 1
    const now = nowInstant()
    const keys = Object.keys(patch)
    const mutation = {
      mutation_id: `mut_evr_${n}`, origin_machine: 'product-event-role-test', table: 'products', record_id: TALK, op: 'update',
      patch, base_seq: seqOf(TALK) - seqBack, base_row_hash: await hashTouched(before, keys), depends_on: null, client_ts: now, issued_at: now,
    }
    const res = await worker.fetch(new Request('https://hub.test/api/mutations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ mutations: [mutation] }),
    }), env, CTX)
    expect(res.status).toBe(200)
    return ((await res.json()) as { results: { status: string; code?: string }[] }).results[0]
  }

  it('moves the day out of due_date, sets the roles and strips the head lines in one write', async () => {
    db.prepare('UPDATE products SET description = ? WHERE id = ?').run(HEAD, TALK)
    const r = await update(
      { event_date: '2024-02-11', nick_event_role: 'presenter', nick_author_position: null, due_date: null, description: 'Authors: Ingraham N' },
      { event_date: null, nick_event_role: null, nick_author_position: null, due_date: '2024-02-11', description: HEAD },
    )
    expect(r.status).toBe('accepted')
    expect(row('SELECT due_date, event_date, nick_event_role, description FROM products WHERE id = ?', TALK))
      .toEqual({ due_date: null, event_date: '2024-02-11', nick_event_role: 'presenter', description: 'Authors: Ingraham N' })
  })

  it('a stale base is not applied, and a bad date or role is refused by the arbiter', async () => {
    // A row someone moved since the read: an older seq AND touched values that
    // no longer match what the backfill saw.
    db.prepare("UPDATE products SET event_date = '2018' WHERE id = ?").run(TALK)
    const stale = await update({ event_date: '2019-05' }, { event_date: null }, 1)
    expect(stale.status).not.toMatch(/^(accepted|merged_clean)$/)
    expect(row('SELECT event_date FROM products WHERE id = ?', TALK)!.event_date).toBe('2018')
    db.prepare('UPDATE products SET event_date = NULL WHERE id = ?').run(TALK)
    const bad = await update({ event_date: '2019-13' }, { event_date: null })
    expect(bad.status).not.toMatch(/^(accepted|merged_clean)$/)
    const role = await update({ nick_event_role: 'first' }, { nick_event_role: null })
    expect(role.status).not.toMatch(/^(accepted|merged_clean)$/)
    expect(row('SELECT event_date, nick_event_role FROM products WHERE id = ?', TALK)).toEqual({ event_date: null, nick_event_role: null })
  })
})

describe('eventDateRefusal (the words; the CHECK is the rule)', () => {
  it.each([['2019', null], ['2019-05', null], ['2019-05-31', null], ['2019-13', '2019-13 is not a month.'],
    ['2019-02-30', '2019-02-30 is not a date on the calendar.'], ['May 2019', 'The date is YYYY, YYYY-MM or YYYY-MM-DD.'],
    [42, 'The date is YYYY, YYYY-MM or YYYY-MM-DD.']])('%j -> %j', (v, want) => {
    expect(eventDateRefusal(v)).toBe(want)
  })
})

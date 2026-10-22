// userPrefs.test.ts -- GET/PUT/DELETE /api/user-prefs through the REAL worker
// (worker.fetch: the full middleware stack, so env.DB is the viewer-bound
// handle) on the migrated prod-schema database: user_prefs is the table
// schema-v143 created, nothing hand-built.
//
// What must hold:
//   - a member saves, reads back, replaces and deletes their own preference
//   - one person's preferences are never read, replaced or removed by another
//   - a key that is not on shared/userPrefKeys.ts answers 400 and writes no
//     row (a device-local setting cannot be stored by a raw fetch)
//   - a body without a value, and an oversize value, write no row
//   - a stored row whose key has since left the list is not served
//   - a caller who is not a member gets 403, and the PB key acts as Nick

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'
import { USER_PREF_MAX_BYTES } from '../../shared/userPrefKeys'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'user-prefs-test-api-key'
const PI_EMAIL = 'ingra107@umn.edu'
const CASEY_EMAIL = 'eddin022@umn.edu'
const STRANGER_EMAIL = 'stranger@umn.edu'

let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: CASEY_EMAIL })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
  vi.stubGlobal('fetch', vi.fn(async () => new Response('stubbed', { status: 503 })))
})
afterEach(() => { vi.unstubAllGlobals() })

async function call(method: string, path: string, who: string | 'apikey', body?: unknown) {
  const headers: Record<string, string> = {}
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    env, CTX,
  )
  const text = await res.text()
  let parsed: any = null
  try { parsed = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, body: parsed, text }
}

const rows = () => db.prepare('SELECT member_slug, key, value_json FROM user_prefs ORDER BY member_slug, key').all()
const prefsOf = async (who: string | 'apikey') =>
  Object.fromEntries(((await call('GET', '/api/user-prefs', who)).body.data as Array<{ key: string; value: unknown }>).map((p) => [p.key, p.value]))

describe('/api/user-prefs through the real worker', () => {
  it('a member saves, reads back, replaces and deletes their own preference', async () => {
    const labprefs = { manuscriptsReviewDays: 5, manuscriptsStaleDays: 20, taskStaleDays: 7, projectStaleDays: 14 }
    const put = await call('PUT', '/api/user-prefs/labprefs', CASEY_EMAIL, { value: labprefs })
    expect(put.status).toBe(200)
    expect(put.body.data).toMatchObject({ key: 'labprefs', value: labprefs })
    expect(await prefsOf(CASEY_EMAIL)).toEqual({ labprefs })

    const views = [{ id: 'v1', name: 'Mine', query: 'a=1', createdAt: 1 }]
    expect((await call('PUT', '/api/user-prefs/savedViews.my-tasks', CASEY_EMAIL, { value: views })).status).toBe(200)
    expect((await call('PUT', '/api/user-prefs/today.dueWindow', CASEY_EMAIL, { value: '14' })).status).toBe(200)
    expect((await call('PUT', '/api/user-prefs/today.dueWindow', CASEY_EMAIL, { value: '30' })).status).toBe(200)
    expect(await prefsOf(CASEY_EMAIL)).toEqual({ labprefs, 'savedViews.my-tasks': views, 'today.dueWindow': '30' })

    const del = await call('DELETE', '/api/user-prefs/today.dueWindow', CASEY_EMAIL)
    expect(del.status).toBe(200)
    expect(Object.keys(await prefsOf(CASEY_EMAIL)).sort()).toEqual(['labprefs', 'savedViews.my-tasks'])
    expect(rows()).toHaveLength(2)
  })

  it("one person's preferences are never read, replaced or removed by another", async () => {
    expect((await call('PUT', '/api/user-prefs/dashboard.tab', PI_EMAIL, { value: 'projects' })).status).toBe(200)
    expect(await prefsOf(CASEY_EMAIL)).toEqual({})
    // Casey's PUT on the same key writes HER row; Nick's is untouched.
    expect((await call('PUT', '/api/user-prefs/dashboard.tab', CASEY_EMAIL, { value: 'people' })).status).toBe(200)
    expect((await call('DELETE', '/api/user-prefs/dashboard.tab', CASEY_EMAIL)).status).toBe(200)
    expect(await prefsOf(PI_EMAIL)).toEqual({ 'dashboard.tab': 'projects' })
    expect(rows()).toEqual([{ member_slug: 'nick-ingraham', key: 'dashboard.tab', value_json: '"projects"' }])
  })

  it('a key that is not on the list answers 400 and writes nothing', async () => {
    for (const key of ['mn-ccore-theme', 'pulse-paused', 'savedViews.', 'savedViews.a b', 'tableConfig.x/y', 'labprefsx']) {
      const r = await call('PUT', `/api/user-prefs/${encodeURIComponent(key)}`, CASEY_EMAIL, { value: 1 })
      expect(r.status, key).toBe(400)
      expect((await call('DELETE', `/api/user-prefs/${encodeURIComponent(key)}`, CASEY_EMAIL)).status, key).toBe(400)
    }
    expect(rows()).toEqual([])
  })

  it('a body without a value, a non-JSON body and an oversize value write nothing', async () => {
    expect((await call('PUT', '/api/user-prefs/labprefs', CASEY_EMAIL, {})).status).toBe(400)
    expect((await call('PUT', '/api/user-prefs/labprefs', CASEY_EMAIL, 'just text')).status).toBe(400)
    const big = 'x'.repeat(USER_PREF_MAX_BYTES)
    expect((await call('PUT', '/api/user-prefs/labprefs', CASEY_EMAIL, { value: big })).status).toBe(413)
    // The cap is UTF-8 bytes: 'é' is one character and two bytes.
    const wide = 'é'.repeat(USER_PREF_MAX_BYTES / 2)
    expect((await call('PUT', '/api/user-prefs/labprefs', CASEY_EMAIL, { value: wide })).status).toBe(413)
    expect(rows()).toEqual([])
  })

  it('null is a value (stored), and a row whose key left the list is not served', async () => {
    expect((await call('PUT', '/api/user-prefs/dashboard.cards', CASEY_EMAIL, { value: null })).status).toBe(200)
    insertRow(db, 'user_prefs', { member_slug: 'casey-eddington', key: 'retired.key', value_json: '1' })
    expect(await prefsOf(CASEY_EMAIL)).toEqual({ 'dashboard.cards': null })
  })

  it('the table refuses a value that is not JSON', () => {
    expect(() => db.prepare("INSERT INTO user_prefs (member_slug, key, value_json) VALUES ('casey-eddington', 'labprefs', 'not json')").run())
      .toThrow(/CHECK constraint failed/)
  })

  it('a signed-in non-member gets 403; the PB key reads and writes Nick\'s', async () => {
    expect((await call('GET', '/api/user-prefs', STRANGER_EMAIL)).status).toBe(403)
    expect((await call('PUT', '/api/user-prefs/labprefs', STRANGER_EMAIL, { value: {} })).status).toBe(403)
    expect((await call('PUT', '/api/user-prefs/today.defaultView', 'apikey', { value: 'agenda' })).status).toBe(200)
    expect(await prefsOf(PI_EMAIL)).toEqual({ 'today.defaultView': 'agenda' })
    expect(rows()).toEqual([{ member_slug: 'nick-ingraham', key: 'today.defaultView', value_json: '"agenda"' }])
  })
})

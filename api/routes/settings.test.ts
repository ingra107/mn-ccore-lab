// #8949: POST /api/settings writes only the four Settings-page keys.
// A {key, value} body (the old inspection tests) used to land rows named 'key'
// and 'value' in prod, and any member could overwrite pi_emails.
// Real migrated schema (api/test-support/prod-schema-db.ts).

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleUpdateSettings, SETTINGS_KEYS } from './settings'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'

let db: InstanceType<typeof Database>
let env: any

const post = (body: unknown) => new Request('https://x/api/settings', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' },
})
const value = (key: string) =>
  (db.prepare('SELECT value FROM lab_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value
const rowCount = () => (db.prepare('SELECT COUNT(*) n FROM lab_settings').get() as { n: number }).n

beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) }
})

describe('POST /api/settings', () => {
  it('writes a Settings-page key and returns the settings', async () => {
    const res = await handleUpdateSettings(post({ lab_name: 'MN-CCORE' }), env)
    expect(res.status).toBe(200)
    expect(value('lab_name')).toBe('MN-CCORE')
    const body = await res.json() as { data: Record<string, string> }
    expect(body.data.lab_name).toBe('MN-CCORE')
  })

  it('refuses a {key, value} body and writes no row', async () => {
    const before = rowCount()
    const res = await handleUpdateSettings(post({ key: '_inspection_test', value: 'delete_me' }), env)
    expect(res.status).toBe(400)
    expect(rowCount()).toBe(before)
    expect(value('key')).toBeUndefined()
    expect(value('value')).toBeUndefined()
  })

  it('refuses pi_emails and the hub_validate_* flags', async () => {
    db.prepare("INSERT OR REPLACE INTO lab_settings (key, value) VALUES ('pi_emails', '[\"pi@umn.edu\"]')").run()
    const flagBefore = value('hub_validate_enums')
    expect((await handleUpdateSettings(post({ pi_emails: '["me@umn.edu"]' }), env)).status).toBe(400)
    expect((await handleUpdateSettings(post({ hub_validate_enums: '0' }), env)).status).toBe(400)
    expect(value('pi_emails')).toBe('["pi@umn.edu"]')
    expect(value('hub_validate_enums')).toBe(flagBefore)
  })

  it('refuses the whole write when one key is bad, so a good key in the same body is not written', async () => {
    const res = await handleUpdateSettings(post({ lab_name: 'X', pi_emails: '[]' }), env)
    expect(res.status).toBe(400)
    expect(value('lab_name')).not.toBe('X')
  })

  it('refuses a non-string value, an array body and a non-JSON body', async () => {
    expect((await handleUpdateSettings(post({ lab_name: null }), env)).status).toBe(400)
    expect((await handleUpdateSettings(post(['lab_name']), env)).status).toBe(400)
    expect((await handleUpdateSettings(post('not json'), env)).status).toBe(400)
  })

  it('allows exactly the keys the Settings page writes', () => {
    expect([...SETTINGS_KEYS].sort()).toEqual(['lab_description', 'lab_icon', 'lab_name', 'lab_type'])
  })
})

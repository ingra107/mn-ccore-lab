// F10 (2026-11-05): the digest email footer no longer says "Manage
// notifications". It linked /portal/settings, which has no notification
// control, so a member who wanted fewer emails had no path. A notification
// preference is Nick's call; until then the footer carries no such link.
//
// Both templates, through their real handlers against the migrated schema:
//   - the per-member digest, via GET /api/digest-preview;
//   - the coordinator daily brief, via handleSendDailyDigests, capturing
//     the body it posts to Resend.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { handleDigestPreview, handleSendDailyDigests } from './digest-email'
import type { Env } from '../helpers'

let db: InstanceType<typeof Database>
let env: Env
beforeEach(() => {
  db = prodSchemaDb()
  insertRow(db, 'team_members', { slug: 'nick-ingraham', name: 'Nick Ingraham', email: 'ingra107@umn.edu', member_type: 'director' })
  env = { DB: d1Adapter(db), RESEND_API_KEY: 'test-key', DIGEST_RECIPIENTS: 'all' } as unknown as Env
})
afterEach(() => { vi.unstubAllGlobals() })

describe('digest email footer', () => {
  it('the per-member digest (preview) has no "Manage notifications" link', async () => {
    const res = await handleDigestPreview(new URL('https://x/api/digest-preview?member=nick-ingraham'), env)
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('MN-CCORE Lab Hub')
    expect(html).not.toContain('Manage notifications')
  })

  it('the coordinator daily brief has no "Manage notifications" link', async () => {
    const bodies: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(init.body)
      return new Response('{}', { status: 200 })
    }))
    const res = await handleSendDailyDigests(env, { kind: 'cron' })
    expect(res.status).toBe(200)
    expect(bodies).toHaveLength(1)
    const html = (JSON.parse(bodies[0]) as { html: string }).html
    expect(html).toContain('MN-CCORE Lab Hub')
    expect(html).not.toContain('Manage notifications')
  })
})

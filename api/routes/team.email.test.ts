// team.email.test.ts — PB #8945: a PI sets a member's login email on their
// team_members row (POST /api/team/:slug {email}); that is how an existing row
// becomes someone's account. Guards: a PI's login email and the caller's own
// are never changed here (a typo would lock that person out), and two rows may
// not share one email. Since 2026-10-08 sign-in creates no rows (no ghosts), so
// any other row holding an address is a conflict. Runs on the migration-chain DB.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { AuthUser, Env } from '../helpers'
import { handleUpdateTeamMember } from './team'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const PI: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' }
let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify(['ingra107@umn.edu', 'mesfin@umn.edu']))
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', email: 'ingra107@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate', slug: 'nate-mesfin', email: 'mesfin@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-emma', name: 'Emma', slug: 'emma-bromley', email: 'bromley@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey', slug: 'casey-eddington', email: 'eddin022@umn.edu' })
  env = { DB: d1Adapter(db) } as unknown as Env
})

const setEmail = (slug: string, email: unknown, user: AuthUser = PI) =>
  handleUpdateTeamMember(slug, new Request(`https://x/api/team/${slug}`, { method: 'POST', body: JSON.stringify({ email }) }), user, env)
const emailOf = (slug: string) => (db.prepare('SELECT email FROM team_members WHERE slug = ?').get(slug) as { email: string }).email

describe('POST /api/team/:slug {email}', () => {
  it("a PI sets a member's real email, normalised", async () => {
    const res = await setEmail('emma-bromley', ' Bromle012@UMN.edu ')
    expect(res.status).toBe(200)
    expect(emailOf('emma-bromley')).toBe('bromle012@umn.edu')
  })

  it("refuses the caller's own row", async () => {
    expect((await setEmail('nick-ingraham', 'typo@umn.edu')).status).toBe(403)
    expect(emailOf('nick-ingraham')).toBe('ingra107@umn.edu')
  })

  it('refuses a row whose current email is a PI login', async () => {
    expect((await setEmail('nate-mesfin', 'typo@umn.edu')).status).toBe(403)
    expect(emailOf('nate-mesfin')).toBe('mesfin@umn.edu')
  })

  it('409s when any other row already holds the email', async () => {
    expect((await setEmail('emma-bromley', 'ingra107@umn.edu')).status).toBe(409)
    expect((await setEmail('emma-bromley', 'EDDIN022@umn.edu')).status).toBe(409)
    expect(emailOf('emma-bromley')).toBe('bromley@umn.edu')
  })

  it('400s on a malformed email', async () => {
    expect((await setEmail('emma-bromley', 'not an email')).status).toBe(400)
  })

  it('a non-PI cannot set email at all', async () => {
    const emma: AuthUser = { email: 'bromley@umn.edu', slug: 'emma-bromley' }
    expect((await setEmail('emma-bromley', 'x@umn.edu', emma)).status).toBe(403)
  })
})

// A task note posted with the composer's lock on is its author's alone, and one
// posted with the lock off is the team's. Driven through the real worker, on the
// migrated schema, with the exact bodies the composer sends (pinned from the
// browser side in src/__tests__/composer-drafts.test.tsx). The read sweep's
// enumerator is ROUTE_REGISTRY itself: a locked note must surface for nobody but
// its author on any GET.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { ROUTE_REGISTRY } from '../lib/route-dsl'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const NICK = 'ingra107@umn.edu'
const NATE = 'mesfin@umn.edu'
const PROJ = 'proj_notes'
const TASK = 'task_notes'
const LOCKED = 'LOCKEDNOTEMARK'
const OPEN = 'OPENNOTEMARK'

let db: InstanceType<typeof Database>
let env: Env

async function call(method: string, path: string, who: string, body?: unknown) {
  const headers: Record<string, string> = { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, CTX)
  return { status: res.status, text: await res.text() }
}

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate', slug: 'nate-mesfin', member_type: 'director', email: NATE })
  insertRow(db, 'projects', { id: PROJ, slug: 'notes', title: 'Notes', description: 'Notes', category: 'MNCCORE', status: 'active' }, { stage: 'writing' })
  insertRow(db, 'project_members', { project_id: PROJ, member_slug: 'nick-ingraham', added_by: 'test' })
  insertRow(db, 'project_members', { project_id: PROJ, member_slug: 'nate-mesfin', added_by: 'test' })
  insertRow(db, 'tasks', { id: TASK, title: 'Noted', project_id: PROJ, status: 'todo', priority: 'medium', assignee: 'nate-mesfin' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1' } as unknown as Env
  vi.stubGlobal('fetch', vi.fn(async () => new Response('stubbed', { status: 503 })))
})
afterEach(() => { vi.unstubAllGlobals() })

const row = (mark: string) => db.prepare('SELECT visibility, actor_slug, kind, body FROM activity_entries WHERE body LIKE ?').get(`%${mark}%`) as
  { visibility: string; actor_slug: string; kind: string; body: string } | undefined

const notes = () => db.prepare('SELECT recipient_slug, body FROM notifications').all() as { recipient_slug: string; body: string }[]

describe('a task note and the privacy lock, through the real worker', () => {
  it('locked: stored author-only, its author reads it, a teammate on the same project reads it nowhere, and nobody is told', async () => {
    const posted = await call('POST', `/api/tasks/${TASK}/updates`, NICK, { content: `${LOCKED} a private thought`, update_type: 'progress', visibility: 'author' })
    expect(posted.status).toBe(201)
    expect(row(LOCKED)).toMatchObject({ visibility: 'author', actor_slug: 'nick-ingraham', kind: 'update' })

    const mine = await call('GET', `/api/tasks/${TASK}/activity`, NICK)
    expect(mine.status).toBe(200)
    expect(mine.text).toContain(LOCKED)

    const theirs = await call('GET', `/api/tasks/${TASK}/activity`, NATE)
    expect(theirs.status, 'the teammate can read the task').toBe(200)
    expect(theirs.text).not.toContain(LOCKED)

    expect(notes().filter((n) => n.body?.includes(LOCKED))).toEqual([])
  })

  it('locked with an @mention: the person mentioned is told nothing', async () => {
    await call('POST', `/api/tasks/${TASK}/updates`, NICK, { content: `@nate-mesfin ${LOCKED} a private thought`, update_type: 'progress', visibility: 'author' })
    expect(row(LOCKED)).toMatchObject({ visibility: 'author' })
    expect(notes()).toEqual([])
  })

  it('locked: no GET in the registry shows it to the teammate', async () => {
    await call('POST', `/api/tasks/${TASK}/updates`, NICK, { content: `${LOCKED} a private thought`, update_type: 'progress', visibility: 'author' })
    const gets = ROUTE_REGISTRY.filter((r) => r.method === 'GET')
    expect(gets.length).toBeGreaterThan(100)
    const entryId = (db.prepare('SELECT id FROM activity_entries WHERE body LIKE ?').get(`%${LOCKED}%`) as { id: string }).id
    const leaks: string[] = []
    let answered = 0
    for (const route of gets) {
      for (const id of route.path.includes(':') ? [TASK, PROJ, 'notes', entryId] : ['']) {
        const path = route.path.replace(':rest{.+}', id).replace(/:[A-Za-z_]+/g, encodeURIComponent(id))
          + `?entity_type=task&entity_id=${TASK}&q=${LOCKED}&limit=500&days=3650&task_id=${TASK}&project_id=${PROJ}&project=${PROJ}&include_hidden=1&include_fixtures=1`
        const r = await call('GET', path, NATE)
        if (r.status === 200) answered++
        // Search echoes the query string, so its body is read past the echo.
        const text = route.path === '/api/search' ? JSON.stringify((JSON.parse(r.text) as { data?: unknown }).data ?? '') : r.text
        if (text.includes(LOCKED)) leaks.push(`GET ${route.path} [${id}] ${r.status}: ${r.text.slice(0, 200)}`)
      }
    }
    expect(leaks).toEqual([])
    expect(answered, 'most reads must answer 200, or the sweep reads error pages').toBeGreaterThan(100)
  }, 120_000)

  it('unlocked: stored team, the teammate reads it, and the assignee is told', async () => {
    const posted = await call('POST', `/api/tasks/${TASK}/updates`, NICK, { content: `${OPEN} a progress note`, update_type: 'progress' })
    expect(posted.status).toBe(201)
    expect(row(OPEN)).toMatchObject({ visibility: 'team', actor_slug: 'nick-ingraham', kind: 'update' })
    const theirs = await call('GET', `/api/tasks/${TASK}/activity`, NATE)
    expect(theirs.status).toBe(200)
    expect(theirs.text).toContain(OPEN)
    expect(notes().map((n) => n.recipient_slug)).toContain('nate-mesfin')
  })

  it('a locked comment: the "@me " prefix the composer sends lands author-only, without the prefix', async () => {
    await call('POST', `/api/tasks/${TASK}/comments`, NICK, { content: `@me ${LOCKED} comment` })
    expect(row(LOCKED)).toMatchObject({ visibility: 'author', kind: 'comment', body: `${LOCKED} comment` })
    expect((await call('GET', `/api/tasks/${TASK}/activity`, NATE)).text).not.toContain(LOCKED)
  })
})
